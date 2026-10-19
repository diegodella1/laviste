import {randomUUID} from 'node:crypto';
import {assert, nextCheck, review, value} from './engine.mjs';
import {research, applyResearch} from './news.mjs';
import {adminOf, scopeForTake} from './store-access.mjs';
import {
  beginUserQuota, commitUserQuota, rollbackUserQuota, quotaError, TOKEN_RESERVE_UNITS,
} from './quota.mjs';

export function createScheduler(store, getConfig, {researcher = research, onCheck = null} = {}) {
  let stopped = false;
  let current = null;
  const admin = adminOf(store);
  for (const job of admin.jobs().filter(job=>job.status==='running')) {
    const scoped = scopeForTake(store, job.takeId) || admin;
    job.status = 'failed'; job.error = 'Revisión interrumpida por reinicio. Se programará una recuperación.';
    scoped.putJob(job);
    const take = scoped.take(job.takeId);
    if (take) {take.coverage='interrupted'; take.nextCheckAt=new Date().toISOString(); scoped.putTake(take);}
  }
  function enqueue(take, manual = false) {
    assert(take?.phase==='active' && !take.monitoringPaused, 'Activá el seguimiento de la tesis antes de revisarla.');
    const config = getConfig();
    assert(config.apiKey, 'Configurá OpenAI para investigar noticias.', 503);
    const scoped = scopeForTake(store, take.id);
    assert(scoped, 'No encontramos esa tesis.', 404);
    const existing = scoped.jobs().find(job=>job.takeId===take.id && ['queued','running'].includes(job.status));
    if (existing) return existing;
    const recent = scoped.jobs().find(job=>job.takeId===take.id && Date.now()-Date.parse(job.createdAt)<60000);
    assert(!manual || !recent, 'Esperá un minuto antes de repetir la revisión.', 429);
    if (manual && scoped.userId) {
      const snap = admin.quotaSnapshotFor(scoped.userId, null, scoped.takes());
      if (!snap.exempt && snap.news.remaining <= 0) throw quotaError('news');
      if (!snap.exempt && snap.tokens.remaining <= 0) throw quotaError('tokens');
    }
    const job = {id:randomUUID(),takeId:take.id,status:'queued',createdAt:new Date().toISOString(),manual};
    scoped.putJob(job);
    return job;
  }
  async function execute(job) {
    const scoped = scopeForTake(store, job.takeId);
    if (!scoped) {
      job.status='cancelled';
      admin.putJob(job);
      return;
    }
    const take = scoped.take(job.takeId);
    if (!take || take.phase!=='active' || take.monitoringPaused) {job.status='cancelled';scoped.putJob(job);return;}
    const config = getConfig();
    if (!config.apiKey) return;
    const now = new Date().toISOString();
    const actor = scoped.userId ? {id: scoped.userId, role: admin.effectiveLimits(scoped.userId).role} : null;
    let quotaHandle = {exempt: true, reserved: []};
    try {
      if (actor) {
        quotaHandle = beginUserQuota(admin, actor, [
          {kind: 'news', n: 1},
          {kind: 'tokens', n: TOKEN_RESERVE_UNITS * 2},
        ]);
      }
    } catch (error) {
      take.coverage='stale';
      take.coverageDetail=error.status===429?error.message:'Cuota de revisiones agotada. Se retoma a las 00:00 (Argentina).';
      scoped.putTake(take);
      return;
    }
    review(take,'check',now);
    if (onCheck) onCheck(take, now);
    else take.history.push({at:now,value:value(take),benchmark:take.invested,index:take.history.at(-1)?.index??take.invested});
    take.history=take.history.slice(-365);scoped.putTake(take);
    job.status='running';job.startedAt=now;job.version=take.version;scoped.putJob(job);
    const usageAcc={input_tokens:0,output_tokens:0};
    try {
      const result = await researcher(structuredClone(take), {
        ...config,
        userId: scoped.userId,
        listNewsFeeds: config.listNewsFeeds || (opts => admin.listNewsFeeds(opts)),
        onUsage:(usage,searches,meta)=>{
          admin.tokens('news',usage,searches,now.slice(0,10));
          usageAcc.input_tokens += Number(usage?.input_tokens||usage?.prompt_tokens||0);
          usageAcc.output_tokens += Number(usage?.output_tokens||usage?.completion_tokens||0);
          admin.recordUserUsage({
            userId: scoped.userId,
            kind: meta?.kind || 'review',
            usage,
            model: config.model,
          });
        },
      });
      commitUserQuota(admin, quotaHandle, usageAcc);
      quotaHandle = {exempt: true, reserved: []};
      scoped.transaction(()=>{
        const latest = scoped.take(take.id);
        assert(latest, 'La tesis ya no existe.', 404);
        applyResearch(latest,result,scoped.reviews(take.id));
        scoped.putReview(result);
        if (result.applied) latest.nextCheckAt=nextCheck(latest,new Date().toISOString());
        else if(latest.phase==='active'&&!latest.monitoringPaused) latest.nextCheckAt=new Date().toISOString();
        scoped.putTake(latest);
        job.status='completed';job.reviewId=result.id;job.finishedAt=new Date().toISOString();scoped.putJob(job);
      });
    } catch (error) {
      rollbackUserQuota(admin, quotaHandle);
      job.status='failed';job.error=error.status?error.message:'No se pudo completar la revisión. Reintentá desde la tesis.';job.finishedAt=new Date().toISOString();scoped.putJob(job);
      const latest = scoped.take(take.id);
      if(latest) {
        latest.coverage='interrupted';latest.coverageDetail=job.error;
        latest.nextCheckAt=nextCheck(latest,new Date().toISOString());scoped.putTake(latest);
      }
    }
  }
  async function tick() {
    if(stopped || current || !getConfig().apiKey) return;
    for(const take of admin.takes()) {
      if(!scopeForTake(store, take.id)) continue;
      if(take.phase==='active'&&!take.monitoringPaused&&take.nextCheckAt&&Date.parse(take.nextCheckAt)<=Date.now()) enqueue(take);
    }
    const job = admin.jobs().filter(job=>job.status==='queued').sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
    if(job) {current=execute(job);try{await current;}finally{current=null;}}
  }
  const timer=setInterval(()=>tick().catch(()=>console.error('scheduler_tick_failed')),5000);timer.unref();
  return {enqueue,tick,async close(){stopped=true;clearInterval(timer);await current;}};
}
