/** Process-wide AI semaphore (Fase 2 / PR 2D). N global + 1 per user. */

import {randomUUID} from 'node:crypto';
import {AI_BUSY_GLOBAL, AI_BUSY_USER} from './copy.mjs';

/** Small default: ~768MB container on a Raspberry Pi. Override with AI_CONCURRENCY. */
export const DEFAULT_AI_GLOBAL_SLOTS = 2;
export const DEFAULT_AI_PER_USER_SLOTS = 1;
/** OpenAI fetch timeout is 90s; expire hung leases shortly after. */
export const DEFAULT_AI_LEASE_MS = 120_000;
export const AI_BUSY_RETRY_AFTER = 5;

/**
 * HTTP policy (documented choice): fail immediately with 429.
 * Queueing the request would hold an open connection on a memory-tight Pi.
 * The scheduler never waits either: it skips this tick and retries later.
 *
 * Acquire is atomic (user + global together) so there is no lock-order deadlock.
 * release() is idempotent. Slots are always released in `finally`, and a lease
 * timeout is a safety net if a caller forgets.
 */

export function envInt(name, fallback, {min = 1, max = 1000, from} = {}) {
  const raw = from !== undefined ? from : process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

export function resolveInt(optionValue, envName, fallback, bounds) {
  if (optionValue != null && optionValue !== '') {
    const n = Number(optionValue);
    if (Number.isInteger(n) && n >= bounds.min && n <= bounds.max) return n;
  }
  return envInt(envName, fallback, bounds);
}

export function aiBusyError(reason) {
  const user = reason === 'user';
  return Object.assign(new Error(user ? AI_BUSY_USER : AI_BUSY_GLOBAL), {
    status: 429,
    code: user ? 'ai_busy_user' : 'ai_busy',
    retryAfter: AI_BUSY_RETRY_AFTER,
  });
}

export function createAiSemaphore({
  globalSlots = DEFAULT_AI_GLOBAL_SLOTS,
  perUserSlots = DEFAULT_AI_PER_USER_SLOTS,
  leaseMs = DEFAULT_AI_LEASE_MS,
  now = () => Date.now(),
} = {}) {
  const globalCap = Math.max(1, Number(globalSlots) || DEFAULT_AI_GLOBAL_SLOTS);
  const userCap = Math.max(1, Number(perUserSlots) || DEFAULT_AI_PER_USER_SLOTS);
  const lease = Math.max(1, Number(leaseMs) || DEFAULT_AI_LEASE_MS);
  let globalUsed = 0;
  const userUsed = new Map();
  const leases = new Map();

  function expire(at = now()) {
    for (const [id, row] of leases) {
      if (row.until <= at) free(id, row.userId);
    }
  }

  function free(id, userId) {
    if (!leases.delete(id)) return;
    globalUsed = Math.max(0, globalUsed - 1);
    const next = (userUsed.get(userId) || 1) - 1;
    if (next <= 0) userUsed.delete(userId);
    else userUsed.set(userId, next);
  }

  function snapshot() {
    expire();
    return {
      globalUsed,
      globalSlots: globalCap,
      perUserSlots: userCap,
      users: Object.fromEntries(userUsed),
      leases: leases.size,
    };
  }

  function tryAcquire(userId) {
    expire();
    const uid = userId || '__anon__';
    const used = userUsed.get(uid) || 0;
    if (used >= userCap) return {ok: false, reason: 'user'};
    if (globalUsed >= globalCap) return {ok: false, reason: 'global'};
    const id = randomUUID();
    globalUsed += 1;
    userUsed.set(uid, used + 1);
    leases.set(id, {userId: uid, until: now() + lease});
    return {ok: true, id, userId: uid};
  }

  function acquireOrThrow(userId) {
    const handle = tryAcquire(userId);
    if (!handle.ok) throw aiBusyError(handle.reason);
    return handle;
  }

  function release(handle) {
    if (!handle?.id) return;
    const row = leases.get(handle.id);
    if (!row) return;
    free(handle.id, row.userId);
  }

  async function withSlot(userId, fn) {
    const handle = acquireOrThrow(userId);
    try {
      return await fn();
    } finally {
      release(handle);
    }
  }

  return {tryAcquire, acquireOrThrow, release, withSlot, snapshot, expire};
}
