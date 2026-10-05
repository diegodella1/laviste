import {randomUUID} from 'node:crypto';
import {assert, nextCheck, review, value} from './engine.mjs';
import {research, applyResearch} from './news.mjs';

export function createScheduler(store, getConfig, {researcher = research, onCheck = null} = {}) {
  let stopped = false;
  let current = null;
  for (const job of store.jobs().filter(job=>job.status==='running')) {
    job.status = 'failed'; job.error = 'Revisión interrumpida por reinicio. Se programará una recuperación.';
    store.putJob(job);
    const take = store.take(job.takeId);
    if (take) {take.coverage='interrupted'; take.nextCheckAt=new Date().toISOString(); store.putTake(take);}
  }
  function enqueue(take, manual = false) {
    assert(take?.phase==='active' && !take.monitoringPaused, 'Activá el seguimiento de la tesis antes de revisarla.');
    const config = getConfig();
    assert(config.apiKey, 'Configurá OpenAI para investigar noticias.', 503);
    const existing = store.jobs().find(job=>job.takeId===take.id && ['queued','running'].includes(job.status));
    if (existing) return existing;
    const recent = store.jobs().find(job=>job.takeId===take.id && Date.now()-Date.parse(job.createdAt)<60000);
    assert(!manual || !recent, 'Esperá un minuto antes de repetir la revisión.', 429);
    const job = {id:randomUUID(),takeId:take.id,status:'queued',createdAt:new Date().toISOString(),manual};
    store.putJob(job);
    return job;
  }
  async function execute(job) {
    const take = store.take(job.takeId);
    if (!take || take.phase!=='active' || take.monitoringPaused) {job.status='cancelled';store.putJob(job);return;}
    const config = getConfig();
    if (!config.apiKey) return;
    const now = new Date().toISOString();
    if (!store.reserve('news', config.newsLimit)) {
      take.coverage='stale';take.coverageDetail='Cuota de noticias agotada; próxima oportunidad después de las 00:00 UTC.';
      store.putTake(take);return;
    }
    review(take,'check',now);
    if (onCheck) onCheck(take, now);
    else take.history.push({at:now,value:value(take),benchmark:take.invested,index:take.history.at(-1)?.index??take.invested});
    take.history=take.history.slice(-365);store.putTake(take);
    job.status='running';job.startedAt=now;job.version=take.version;store.putJob(job);
    try {
      const result = await researcher(structuredClone(take), {...config,onUsage:(usage,searches)=>store.tokens('news',usage,searches,now.slice(0,10))});
      store.transaction(()=>{
        const latest = store.take(take.id);
        assert(latest, 'La tesis ya no existe.', 404);
        applyResearch(latest,result,store.reviews(take.id));
        store.putReview(result);
        if (result.applied) latest.nextCheckAt=nextCheck(latest,new Date().toISOString());
        else if(latest.phase==='active'&&!latest.monitoringPaused) latest.nextCheckAt=new Date().toISOString();
        store.putTake(latest);
        job.status='completed';job.reviewId=result.id;job.finishedAt=new Date().toISOString();store.putJob(job);
      });
    } catch (error) {
      job.status='failed';job.error=error.status?error.message:'No se pudo completar la revisión. Reintentá desde la tesis.';job.finishedAt=new Date().toISOString();store.putJob(job);
      const latest = store.take(take.id);
      if(latest) {
        latest.coverage='interrupted';latest.coverageDetail=job.error;
        latest.nextCheckAt=nextCheck(latest,new Date().toISOString());store.putTake(latest);
      }
    }
  }
  async function tick() {
    if(stopped || current || !getConfig().apiKey) return;
    for(const take of store.takes()) {
      if(take.phase==='active'&&!take.monitoringPaused&&take.nextCheckAt&&Date.parse(take.nextCheckAt)<=Date.now()) enqueue(take);
    }
    const job = store.jobs().filter(job=>job.status==='queued').sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
    if(job) {current=execute(job);try{await current;}finally{current=null;}}
  }
  const timer=setInterval(()=>tick().catch(()=>console.error('scheduler_tick_failed')),5000);timer.unref();
  return {enqueue,tick,async close(){stopped=true;clearInterval(timer);await current;}};
}
