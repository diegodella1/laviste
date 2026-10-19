/**
 * Job scheduler (Fase 2 / PR 2D).
 *
 * Round-robin per user so one thesis flood cannot starve the others.
 * Shares the AI semaphore (N global / 1 per user) with HTTP.
 * Global jobs/hour cap. Skips paused (2C), suspended, and over-quota (2B)
 * users with a logged reason — never throws out of tick().
 *
 * Extension point — simulated-only Automático runner (future, not implemented):
 * a later caller can pass `{mode:'automatic', runSimulated}` and reuse
 * pickNextJobs / skipReason. That runner MUST NOT call OpenAI, occupy AI
 * slots, or write consumption / user_usage. `mode` is `'live'` only today.
 */

import {randomUUID} from 'node:crypto';
import {assert, nextCheck, review, value} from './engine.mjs';
import {research, applyResearch, loadEnabledFeedDigest} from './news.mjs';
import {adminOf, scopeForTake} from './store-access.mjs';
import {
  beginUserQuota, commitUserQuota, rollbackUserQuota, quotaError, TOKEN_RESERVE_UNITS,
} from './quota.mjs';
import {pauseError} from './budget.mjs';
import {createAiSemaphore, DEFAULT_AI_GLOBAL_SLOTS, resolveInt} from './ai-lock.mjs';
import {createFeedDigestCache, FEED_DIGEST_TTL_MS} from './feed-digest-cache.mjs';

export const DEFAULT_JOBS_PER_HOUR = 20;
export const HOUR_MS = 3_600_000;

function safeLog(logger, payload) {
  const line = JSON.stringify(payload);
  if (typeof logger?.log === 'function') logger.log(line);
  else console.log(line);
}

export function createScheduler(store, getConfig, {
  researcher = research,
  onCheck = null,
  aiLock,
  jobsPerHour,
  now = () => Date.now(),
  logger = console,
  onSkip = null,
  digestCache,
  rssDigestTtlMs,
  // Reserved for the future simulated-only Automático runner. Documented only.
  mode = 'live',
} = {}) {
  void mode;
  let stopped = false;
  let lastServedUser = null;
  let ticking = false;
  let tickChain = Promise.resolve();
  const startedAt = [];
  const inFlight = new Map();
  const skipOnce = new Set();
  const admin = adminOf(store);
  const cap = resolveInt(jobsPerHour, 'SCHEDULER_JOBS_PER_HOUR', DEFAULT_JOBS_PER_HOUR, {min: 1, max: 500});
  const lock = aiLock || createAiSemaphore({
    globalSlots: resolveInt(undefined, 'AI_CONCURRENCY', DEFAULT_AI_GLOBAL_SLOTS, {min: 1, max: 8}),
  });
  const cache = digestCache || createFeedDigestCache({
    ttlMs: resolveInt(rssDigestTtlMs, 'RSS_DIGEST_TTL_MS', FEED_DIGEST_TTL_MS, {min: 1000, max: 600_000}),
    load: (config, opts) => loadEnabledFeedDigest(config, opts),
    now,
  });

  for (const job of admin.jobs().filter(job => job.status === 'running')) {
    const scoped = scopeForTake(store, job.takeId) || admin;
    job.status = 'failed';
    job.error = 'Revisión interrumpida por reinicio. Se programará una recuperación.';
    scoped.putJob(job);
    const take = scoped.take(job.takeId);
    if (take) {
      take.coverage = 'interrupted';
      take.nextCheckAt = new Date().toISOString();
      scoped.putTake(take);
    }
  }

  function logSkip(reason, extra = {}) {
    onSkip?.(reason, extra);
    const key = `${reason}:${extra.jobId || extra.userId || extra.takeId || 'global'}`;
    if (skipOnce.has(key)) return;
    skipOnce.add(key);
    if (skipOnce.size > 200) skipOnce.clear();
    const rec = {event: 'scheduler_skip', reason};
    if (extra.userId) rec.userId = extra.userId;
    if (extra.takeId) rec.takeId = extra.takeId;
    if (extra.jobId) rec.jobId = extra.jobId;
    if (extra.used != null) rec.used = extra.used;
    if (extra.cap != null) rec.cap = extra.cap;
    safeLog(logger, rec);
  }

  function jobsThisHour(at = now()) {
    const cutoff = at - HOUR_MS;
    while (startedAt.length && startedAt[0] < cutoff) startedAt.shift();
    return startedAt.length;
  }

  function userKey(job) {
    return admin.userIdForTake?.(job.takeId) || job.takeId;
  }

  function skipReason(job, take, scoped, config) {
    if (!scoped) return 'suspended_or_missing';
    if (!take || take.phase !== 'active' || take.monitoringPaused) return 'inactive';
    if (!config?.apiKey) return 'no_api_key';
    if (typeof admin.isAiPaused === 'function' && admin.isAiPaused({kind: 'news', model: config.model})) {
      return 'ai_paused';
    }
    if (scoped.userId) {
      const snap = admin.quotaSnapshotFor(scoped.userId, null, scoped.takes());
      if (!snap.exempt && snap.news.remaining <= 0) return 'quota_news';
      if (!snap.exempt && snap.tokens.remaining <= 0) return 'quota_tokens';
    }
    return null;
  }

  function markStale(scoped, take, detail) {
    if (!scoped || !take) return;
    take.coverage = 'stale';
    take.coverageDetail = detail;
    scoped.putTake(take);
  }

  function jobRunnable(job) {
    const scoped = scopeForTake(store, job.takeId);
    const take = scoped?.take(job.takeId);
    const reason = skipReason(job, take, scoped, getConfig());
    if (!reason) return true;
    logSkip(reason, {jobId: job.id, takeId: job.takeId, userId: scoped?.userId || userKey(job)});
    if (reason === 'suspended_or_missing' || reason === 'inactive') {
      job.status = 'cancelled';
      (scoped || admin).putJob(job);
    } else if (reason === 'ai_paused') {
      markStale(scoped, take, 'IA en pausa. Se retoma cuando el administrador la habilite.');
    } else if (reason === 'quota_news') {
      markStale(scoped, take, 'Cuota de revisiones agotada. Se retoma a las 00:00 (Argentina).');
    } else if (reason === 'quota_tokens') {
      markStale(scoped, take, 'Cuota diaria de análisis agotada. Se retoma a las 00:00 (Argentina).');
    }
    return false;
  }

  function queuedByUser() {
    const map = new Map();
    for (const job of admin.jobs()) {
      if (job.status !== 'queued' || inFlight.has(job.id)) continue;
      const uid = userKey(job);
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid).push(job);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
    }
    return map;
  }

  function rotateUsers(users) {
    const sorted = [...users].sort();
    if (!sorted.length) return sorted;
    if (!lastServedUser || !sorted.includes(lastServedUser)) return sorted;
    const idx = sorted.indexOf(lastServedUser);
    return [...sorted.slice(idx + 1), ...sorted.slice(0, idx + 1)];
  }

  function pickNextJobs(limit) {
    if (limit <= 0) return [];
    const byUser = queuedByUser();
    const busy = new Set([
      ...[...inFlight.values()].map(row => row.userId),
      ...Object.keys(lock.snapshot().users),
    ]);
    const picked = [];
    const order = rotateUsers([...byUser.keys()]);
    let guard = 0;
    while (picked.length < limit && guard < 64) {
      guard += 1;
      let progressed = false;
      for (const uid of order) {
        if (picked.length >= limit) break;
        if (busy.has(uid)) continue;
        const list = byUser.get(uid) || [];
        while (list.length) {
          const job = list.shift();
          if (!jobRunnable(job)) continue;
          picked.push({job, userId: uid});
          busy.add(uid);
          progressed = true;
          break;
        }
      }
      if (!progressed) break;
    }
    return picked;
  }

  function enqueue(take, manual = false) {
    assert(take?.phase === 'active' && !take.monitoringPaused, 'Activá el seguimiento de la tesis antes de revisarla.');
    const config = getConfig();
    assert(config.apiKey, 'Configurá OpenAI para investigar noticias.', 503);
    if (typeof admin.isAiPaused === 'function' && admin.isAiPaused({kind: 'news', model: config.model})) {
      if (manual) throw pauseError(admin.budgetState({kind: 'news', model: config.model}));
      return null;
    }
    const scoped = scopeForTake(store, take.id);
    assert(scoped, 'No encontramos esa tesis.', 404);
    const existing = scoped.jobs().find(job => job.takeId === take.id && ['queued', 'running'].includes(job.status));
    if (existing) return existing;
    const recent = scoped.jobs().find(job => job.takeId === take.id && Date.now() - Date.parse(job.createdAt) < 60000);
    assert(!manual || !recent, 'Esperá un minuto antes de repetir la revisión.', 429);
    if (manual && scoped.userId) {
      const snap = admin.quotaSnapshotFor(scoped.userId, null, scoped.takes());
      if (!snap.exempt && snap.news.remaining <= 0) throw quotaError('news');
      if (!snap.exempt && snap.tokens.remaining <= 0) throw quotaError('tokens');
    }
    const job = {id: randomUUID(), takeId: take.id, status: 'queued', createdAt: new Date().toISOString(), manual};
    scoped.putJob(job);
    return job;
  }

  async function execute(job) {
    const scoped = scopeForTake(store, job.takeId);
    if (!scoped) {
      job.status = 'cancelled';
      admin.putJob(job);
      return;
    }
    const take = scoped.take(job.takeId);
    if (!take || take.phase !== 'active' || take.monitoringPaused) {
      job.status = 'cancelled';
      scoped.putJob(job);
      return;
    }
    const config = getConfig();
    if (!config.apiKey) return;
    let aiGate = null;
    try {
      if (typeof admin.beginAiGate === 'function') {
        aiGate = admin.beginAiGate({kind: 'news', model: config.model, tokenUnits: TOKEN_RESERVE_UNITS * 2});
      }
    } catch (error) {
      job.status = 'failed';
      job.error = error.status ? error.message : 'IA en pausa. Se retoma cuando el administrador la habilite.';
      job.finishedAt = new Date().toISOString();
      scoped.putJob(job);
      take.coverage = 'stale';
      take.coverageDetail = job.error;
      scoped.putTake(take);
      return;
    }
    const at = new Date().toISOString();
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
      if (aiGate && typeof admin.rollbackAiGate === 'function') admin.rollbackAiGate(aiGate);
      take.coverage = 'stale';
      take.coverageDetail = error.status === 429 ? error.message : 'Cuota de revisiones agotada. Se retoma a las 00:00 (Argentina).';
      scoped.putTake(take);
      return;
    }
    review(take, 'check', at);
    if (onCheck) onCheck(take, at);
    else take.history.push({at, value: value(take), benchmark: take.invested, index: take.history.at(-1)?.index ?? take.invested});
    take.history = take.history.slice(-365);
    scoped.putTake(take);
    job.status = 'running';
    job.startedAt = at;
    job.version = take.version;
    scoped.putJob(job);
    const usageAcc = {input_tokens: 0, output_tokens: 0};
    try {
      const result = await researcher(structuredClone(take), {
        ...config,
        userId: scoped.userId,
        feedDigestCache: config.feedDigestCache || cache,
        listNewsFeeds: config.listNewsFeeds || (opts => admin.listNewsFeeds(opts)),
        onUsage: (usage, searches, meta) => {
          admin.tokens('news', usage, searches, at.slice(0, 10));
          usageAcc.input_tokens += Number(usage?.input_tokens || usage?.prompt_tokens || 0);
          usageAcc.output_tokens += Number(usage?.output_tokens || usage?.completion_tokens || 0);
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
      if (aiGate && typeof admin.commitAiGate === 'function') {
        admin.commitAiGate(aiGate);
        aiGate = null;
        admin.syncBudgetAlerts?.();
      }
      scoped.transaction(() => {
        const latest = scoped.take(take.id);
        assert(latest, 'La tesis ya no existe.', 404);
        applyResearch(latest, result, scoped.reviews(take.id));
        scoped.putReview(result);
        if (result.applied) latest.nextCheckAt = nextCheck(latest, new Date().toISOString());
        else if (latest.phase === 'active' && !latest.monitoringPaused) latest.nextCheckAt = new Date().toISOString();
        scoped.putTake(latest);
        job.status = 'completed';
        job.reviewId = result.id;
        job.finishedAt = new Date().toISOString();
        scoped.putJob(job);
      });
    } catch (error) {
      rollbackUserQuota(admin, quotaHandle);
      if (aiGate && typeof admin.rollbackAiGate === 'function') admin.rollbackAiGate(aiGate);
      job.status = 'failed';
      job.error = error.status ? error.message : 'No se pudo completar la revisión. Reintentá desde la tesis.';
      job.finishedAt = new Date().toISOString();
      scoped.putJob(job);
      const latest = scoped.take(take.id);
      if (latest) {
        latest.coverage = 'interrupted';
        latest.coverageDetail = job.error;
        latest.nextCheckAt = nextCheck(latest, new Date().toISOString());
        scoped.putTake(latest);
      }
    }
  }

  function enqueueDue() {
    for (const take of admin.takes()) {
      try {
        if (!scopeForTake(store, take.id)) continue;
        if (take.phase === 'active' && !take.monitoringPaused && take.nextCheckAt && Date.parse(take.nextCheckAt) <= now()) {
          enqueue(take, false);
        }
      } catch {
        logSkip('enqueue_failed', {takeId: take.id});
      }
    }
  }

  function startJob(job, userId) {
    const handle = lock.tryAcquire(userId);
    if (!handle.ok) {
      logSkip(handle.reason === 'user' ? 'user_slot' : 'global_slot', {userId, jobId: job.id, takeId: job.takeId});
      return null;
    }
    startedAt.push(now());
    lastServedUser = userId;
    const run = execute(job).catch(error => {
      safeLog(logger, {event: 'scheduler_job_failed', jobId: job.id, type: error?.name || 'Error'});
    }).finally(() => {
      lock.release(handle);
      inFlight.delete(job.id);
    });
    inFlight.set(job.id, {promise: run, userId});
    return run;
  }

  async function tickOnce() {
    if (stopped || !getConfig().apiKey) return;
    try {
      if (typeof admin.isAiPaused === 'function' && admin.isAiPaused()) {
        logSkip('ai_paused');
        return;
      }
      enqueueDue();
      const at = now();
      const usedHour = jobsThisHour(at);
      if (usedHour >= cap) {
        logSkip('jobs_per_hour', {used: usedHour, cap});
        return;
      }
      const snap = lock.snapshot();
      const free = Math.max(0, snap.globalSlots - snap.globalUsed);
      const room = Math.min(free, cap - usedHour);
      const picked = pickNextJobs(room);
      const started = [];
      for (const row of picked) {
        const run = startJob(row.job, row.userId);
        if (run) started.push(run);
      }
      if (started.length) await Promise.all(started);
    } catch (error) {
      safeLog(logger, {event: 'scheduler_tick_failed', type: error?.name || 'Error'});
    }
  }

  async function tick() {
    if (stopped) return;
    if (ticking) {
      await tickChain;
      return;
    }
    ticking = true;
    const done = tickOnce().finally(() => { ticking = false; });
    tickChain = done.catch(() => {});
    await done;
  }

  const timer = setInterval(() => tick().catch(() => console.error('scheduler_tick_failed')), 5000);
  timer.unref();

  return {
    enqueue,
    tick,
    pickNextJobs,
    aiLock: lock,
    digestCache: cache,
    jobsPerHour: cap,
    snapshot() {
      return {
        inFlight: inFlight.size,
        jobsThisHour: jobsThisHour(),
        lastServedUser,
        lock: lock.snapshot(),
      };
    },
    async close() {
      stopped = true;
      clearInterval(timer);
      await tickChain.catch(() => {});
      await Promise.all([...inFlight.values()].map(row => row.promise.catch(() => {})));
    },
  };
}
