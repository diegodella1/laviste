/** Per-user quotas and rate limits (Fase 2 / PR 2B). Day is America/Buenos_Aires. */

import {
  QUOTA_CHAT, QUOTA_NEWS, QUOTA_TOKENS, QUOTA_MONITORED, QUOTA_RATE, QUOTA_CHAT_SIZE,
} from './copy.mjs';
import {dayInBuenosAires, tokenCounts, USAGE_TIMEZONE} from './usage.mjs';

export const QUOTA_KINDS = Object.freeze(['chat', 'news', 'tokens']);
export const CHAT_SIZE_CAP = 100;
export const CHAT_MESSAGE_MAX = 4000;
export const TOKEN_RESERVE_UNITS = 4000;
export const RPM_WINDOW_MS = 60_000;
export const SUPERADMIN_EXEMPT = true;

/** Defaults set by Diego. Overridable per user by superadmin. */
export const DEFAULT_LIMITS = Object.freeze({
  chatPerDay: 20,
  newsPerDay: 5,
  tokensPerDay: 100_000,
  monitoredTakes: 3,
  rpm: 10,
});

const LIMIT_BOUNDS = Object.freeze({
  chatPerDay: {min: 0, max: 1000},
  newsPerDay: {min: 0, max: 1000},
  tokensPerDay: {min: 0, max: 10_000_000},
  monitoredTakes: {min: 0, max: 100},
  rpm: {min: 0, max: 120},
});

const KIND_LIMIT = Object.freeze({
  chat: 'chatPerDay',
  news: 'newsPerDay',
  tokens: 'tokensPerDay',
});

const KIND_ERROR = Object.freeze({
  chat: {code: 'quota_chat', message: QUOTA_CHAT},
  news: {code: 'quota_news', message: QUOTA_NEWS},
  tokens: {code: 'quota_tokens', message: QUOTA_TOKENS},
  monitored: {code: 'quota_monitored', message: QUOTA_MONITORED},
});

export function isQuotaKind(kind) {
  return QUOTA_KINDS.includes(kind);
}

export function isMonitoredTake(take) {
  return take?.phase === 'active' && !take.monitoringPaused;
}

export function countMonitoredTakes(takes) {
  return (takes || []).filter(isMonitoredTake).length;
}

export function nextMidnightBuenosAires(now = new Date()) {
  const day = dayInBuenosAires(now);
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1, 3, 0, 0)).toISOString();
}

export function secondsUntil(iso, now = new Date()) {
  const ms = Date.parse(iso) - now.getTime();
  return Math.max(1, Math.ceil(ms / 1000));
}

export function quotaError(kind, {now} = {}) {
  const spec = KIND_ERROR[kind];
  if (!spec) throw new Error('quota kind');
  const resetAt = nextMidnightBuenosAires(now);
  return Object.assign(new Error(spec.message), {
    status: 429,
    code: spec.code,
    resetAt,
    retryAfter: secondsUntil(resetAt, now),
  });
}

export function rateLimitError({retryAfter} = {}) {
  const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 60;
  return Object.assign(new Error(QUOTA_RATE), {
    status: 429,
    code: 'rate_limit',
    retryAfter: wait,
  });
}

export function chatSizeError() {
  return Object.assign(new Error(QUOTA_CHAT_SIZE), {status: 400, code: 'chat_size'});
}

export function defaultsPayload() {
  return {
    ...DEFAULT_LIMITS,
    chatSizeCap: CHAT_SIZE_CAP,
    chatMessageMax: CHAT_MESSAGE_MAX,
    timezone: USAGE_TIMEZONE,
    superadminExempt: SUPERADMIN_EXEMPT,
  };
}

function parseBound(field, value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  const bound = LIMIT_BOUNDS[field];
  if (!Number.isInteger(n) || n < bound.min || n > bound.max) {
    throw Object.assign(new Error('Límite inválido.'), {status: 400});
  }
  return n;
}

export function normalizeLimitPatch(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const patch = {};
  for (const field of Object.keys(LIMIT_BOUNDS)) {
    if (Object.prototype.hasOwnProperty.call(src, field)) patch[field] = parseBound(field, src[field]);
  }
  return patch;
}

export function mergeLimits(override) {
  const row = override || {};
  return {
    chatPerDay: row.chatPerDay ?? DEFAULT_LIMITS.chatPerDay,
    newsPerDay: row.newsPerDay ?? DEFAULT_LIMITS.newsPerDay,
    tokensPerDay: row.tokensPerDay ?? DEFAULT_LIMITS.tokensPerDay,
    monitoredTakes: row.monitoredTakes ?? DEFAULT_LIMITS.monitoredTakes,
    rpm: row.rpm ?? DEFAULT_LIMITS.rpm,
  };
}

export function isExemptRole(role) {
  return SUPERADMIN_EXEMPT && role === 'superadmin';
}

export function limitForKind(limits, kind) {
  const key = KIND_LIMIT[kind];
  if (!key) throw Object.assign(new Error('Tipo de cuota inválido.'), {status: 400});
  return limits[key];
}

export function quotaSnapshot({exempt, limits, used, monitoredUsed, now} = {}) {
  const resetAt = nextMidnightBuenosAires(now);
  const day = dayInBuenosAires(now);
  const row = (kind, amount, limit) => ({
    used: amount,
    limit,
    remaining: exempt ? null : Math.max(0, limit - amount),
  });
  return {
    timezone: USAGE_TIMEZONE,
    day,
    resetAt,
    exempt: !!exempt,
    chatSizeCap: CHAT_SIZE_CAP,
    chat: row('chat', used?.chat || 0, limits.chatPerDay),
    news: row('news', used?.news || 0, limits.newsPerDay),
    tokens: row('tokens', used?.tokens || 0, limits.tokensPerDay),
    monitoredTakes: {
      used: monitoredUsed || 0,
      limit: limits.monitoredTakes,
      remaining: exempt ? null : Math.max(0, limits.monitoredTakes - (monitoredUsed || 0)),
    },
    rpm: {limit: limits.rpm},
  };
}

export function createRpmTracker({windowMs = RPM_WINDOW_MS} = {}) {
  const windows = new Map();
  function assertRpm(userId, limit, now = Date.now()) {
    if (!userId || !Number.isFinite(limit)) return;
    if (limit <= 0) throw rateLimitError({retryAfter: Math.ceil(windowMs / 1000)});
    const recent = (windows.get(userId) || []).filter(at => now - at < windowMs);
    if (recent.length >= limit) {
      const retryAfter = Math.ceil((recent[0] + windowMs - now) / 1000);
      throw rateLimitError({retryAfter});
    }
    recent.push(now);
    windows.set(userId, recent);
  }
  function purge(now = Date.now()) {
    for (const [id, times] of windows) {
      const recent = times.filter(at => now - at < windowMs);
      if (recent.length) windows.set(id, recent);
      else windows.delete(id);
    }
  }
  return {assertRpm, purge};
}

export function beginUserQuota(api, user, kinds, {now} = {}) {
  const limits = api.effectiveLimits(user.id, user.role);
  const reserved = kinds.map(({kind, n}) => ({
    kind,
    n: n ?? (kind === 'tokens' ? TOKEN_RESERVE_UNITS : 1),
  }));
  if (limits.exempt) return {exempt: true, userId: user.id, reserved, now};
  const taken = [];
  try {
    for (const row of reserved) {
      const cap = limitForKind(limits, row.kind);
      if (!api.reserveUser(user.id, row.kind, row.n, cap, {now})) {
        throw quotaError(row.kind, {now});
      }
      taken.push(row);
    }
  } catch (error) {
    for (const row of taken) api.releaseUser(user.id, row.kind, row.n, {now});
    throw error;
  }
  return {exempt: false, userId: user.id, reserved, now};
}

export function commitUserQuota(api, handle, usage, {now} = {}) {
  if (!handle) return;
  const at = now || handle.now;
  if (!handle.exempt) {
    const tokenRow = handle.reserved.find(row => row.kind === 'tokens');
    if (tokenRow) {
      const {promptTokens, completionTokens} = tokenCounts(usage);
      api.reconcileUser(handle.userId, 'tokens', tokenRow.n, promptTokens + completionTokens, {now: at});
    }
  }
  for (const row of handle.reserved) {
    if (row.kind === 'tokens') continue;
    api.bumpConsumption(row.kind, row.n);
  }
}

export function rollbackUserQuota(api, handle, {now} = {}) {
  if (!handle || handle.exempt) return;
  const at = now || handle.now;
  for (const row of handle.reserved) api.releaseUser(handle.userId, row.kind, row.n, {now: at});
}

export async function withUserQuota(api, user, kinds, fn, {now} = {}) {
  const handle = beginUserQuota(api, user, kinds, {now});
  try {
    const result = await fn();
    commitUserQuota(api, handle, result?.usage, {now});
    return result;
  } catch (error) {
    rollbackUserQuota(api, handle, {now});
    throw error;
  }
}

export function assertMonitoredRoom(api, user, takes, {wouldAdd = 1, alreadyCounted = false} = {}) {
  const limits = api.effectiveLimits(user.id, user.role);
  if (limits.exempt) return;
  const used = countMonitoredTakes(takes);
  const next = alreadyCounted ? used : used + wouldAdd;
  if (next > limits.monitoredTakes) throw quotaError('monitored');
}
