/**
 * Logged-in leaderboard reads. List payload is built from public_take_stats only.
 * Never put user_id, take_id, email, or amounts in the JSON.
 */

import {
  LEADERBOARD_CACHE_TTL_MS,
  getLeaderboardPageCache, leaderboardGeneration, setLeaderboardPageCache,
} from './leaderboard-cache.mjs';
import {marksInWindowForTake} from './leaderboard-stats.mjs';
import {dayInBuenosAires} from './usage.mjs';

export const LEADERBOARD_PAGE_SIZE = 20;
export const LEADERBOARD_TOP = 50;
export const LEADERBOARD_CACHE_CONTROL = 'private, no-store';

export const LEADERBOARD_ITEM_FIELDS = Object.freeze([
  'publicId', 'title', 'alias', 'pctSince', 'pct30d', 'bench30d', 'benchLabel',
  'holdings', 'daysActive', 'ranked', 'position', 'autoLabel', 'note', 'stale',
  'mine', 'windowEnd', 'computedAt',
]);

export const LEADERBOARD_PAGE_FIELDS = Object.freeze([
  'items', 'mineSummary', 'windowEnd', 'computedAt', 'total', 'nextPage',
]);

export const LEADERBOARD_FORBIDDEN_KEYS = Object.freeze([
  'user_id', 'take_id', 'userId', 'takeId', 'email', 'units', 'cash', 'invested',
  'amount', 'price', 'value', 'display_name', 'displayName', 'password',
]);

function parseHoldings(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(row => row && typeof row.ticker === 'string')
      .map(row => ({ticker: row.ticker, weight: Number(row.weight) || 0}));
  } catch {
    return [];
  }
}

function parsePage(raw) {
  const n = Number.parseInt(String(raw ?? '1'), 10);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function compareRanked(a, b) {
  const ap = Number.isFinite(a.pct_30d) ? a.pct_30d : -Infinity;
  const bp = Number.isFinite(b.pct_30d) ? b.pct_30d : -Infinity;
  if (bp !== ap) return bp - ap;
  return String(a.public_id).localeCompare(String(b.public_id));
}

function compareNuevas(a, b) {
  const byWindow = String(b.window_end || '').localeCompare(String(a.window_end || ''));
  if (byWindow) return byWindow;
  return String(a.public_id).localeCompare(String(b.public_id));
}

function orderStatsRows(rows) {
  const ranked = rows.filter(row => row.ranked).sort(compareRanked);
  const nuevas = rows.filter(row => !row.ranked).sort(compareNuevas);
  const top = ranked.slice(0, LEADERBOARD_TOP).map((row, index) => ({...row, position: index + 1}));
  const overflow = ranked.slice(LEADERBOARD_TOP).map(row => ({...row, position: null, note: row.note || 'fuera'}));
  return [...top, ...nuevas, ...overflow];
}

function publicItem(row, {mine = false, nowDay = null} = {}) {
  return {
    publicId: row.public_id,
    title: row.title,
    alias: row.alias,
    pctSince: row.pct_since == null ? null : Number(row.pct_since),
    pct30d: row.pct_30d == null ? null : Number(row.pct_30d),
    bench30d: row.bench_30d == null ? null : Number(row.bench_30d),
    benchLabel: row.bench_label || null,
    holdings: parseHoldings(row.holdings_json),
    daysActive: Number(row.days_active) || 0,
    ranked: !!row.ranked,
    position: row.position ?? null,
    autoLabel: !!row.auto_label,
    note: row.note || null,
    stale: isoStale(row.window_end, nowDay),
    mine: !!mine,
    windowEnd: row.window_end,
    computedAt: row.computed_at,
  };
}

function loadStatsRows(db) {
  return db.prepare(`
    SELECT public_id, title, alias, bench_label, pct_since, pct_30d, bench_30d,
           holdings_json, days_active, ranked, auto_label, note, window_end, computed_at
    FROM public_take_stats
  `).all();
}

function minePublicIds(db, userId) {
  if (!userId) return new Set();
  return new Set(
    db.prepare('SELECT public_id FROM takes WHERE user_id=? AND is_public=1 AND public_id IS NOT NULL')
      .all(userId)
      .map(row => row.public_id),
  );
}

function mineTakeIdByPublicId(db, userId, publicId) {
  if (!userId || !publicId) return null;
  return db.prepare(
    'SELECT id FROM takes WHERE user_id=? AND public_id=? AND is_public=1',
  ).get(userId, publicId)?.id || null;
}

function isoStale(windowEnd, nowDay) {
  if (!windowEnd || !nowDay) return false;
  return windowEnd <= addDaysSafe(nowDay, -3);
}

function addDaysSafe(day, delta) {
  const [year, month, date] = String(day).split('-').map(Number);
  if (![year, month, date].every(Number.isFinite)) return day;
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

function pageWindowEnd(items) {
  return items.find(item => item.windowEnd)?.windowEnd || null;
}

function pageComputedAt(items) {
  return items.find(item => item.computedAt)?.computedAt || null;
}

function mineSummaryFor(items, store, userId, mineIds) {
  const mineItems = items.filter(item => mineIds.has(item.publicId));
  if (!mineItems.length) return null;
  const primary = mineItems.find(item => item.ranked) || mineItems[0];
  const takeId = mineTakeIdByPublicId(store.db, userId, primary.publicId);
  return {
    publicId: primary.publicId,
    ranked: primary.ranked,
    position: primary.position,
    daysActive: primary.daysActive,
    marksInWindow: takeId ? marksInWindowForTake(store, takeId) : 0,
  };
}

function stripInternal(rows, {nowDay} = {}) {
  return orderStatsRows(rows).map(row => publicItem(row, {nowDay}));
}

function buildPagePayload(items, page) {
  const total = items.length;
  const start = (page - 1) * LEADERBOARD_PAGE_SIZE;
  const slice = items.slice(start, start + LEADERBOARD_PAGE_SIZE);
  const nextPage = start + LEADERBOARD_PAGE_SIZE < total ? page + 1 : null;
  return {
    items: slice,
    windowEnd: pageWindowEnd(items),
    computedAt: pageComputedAt(items),
    total,
    nextPage,
  };
}

function withViewer(pagePayload, allItems, store, userId) {
  const mineIds = minePublicIds(store.db, userId);
  const items = pagePayload.items.map(item => ({...item, mine: mineIds.has(item.publicId)}));
  return {
    items,
    mineSummary: mineSummaryFor(allItems, store, userId, mineIds),
    windowEnd: pagePayload.windowEnd,
    computedAt: pagePayload.computedAt,
    total: pagePayload.total,
    nextPage: pagePayload.nextPage,
  };
}

export function listLeaderboard(store, {page: rawPage = 1, userId, now = Date.now()} = {}) {
  const page = parsePage(rawPage);
  const nowDay = typeof now === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(now)
    ? now
    : dayInBuenosAires(now);
  const cached = getLeaderboardPageCache(page, {now, ttlMs: LEADERBOARD_CACHE_TTL_MS});
  if (cached) return withViewer(cached.page, cached.allItems, store, userId);
  const allItems = stripInternal(loadStatsRows(store.db), {nowDay});
  const pagePayload = buildPagePayload(allItems, page);
  setLeaderboardPageCache(page, {page: pagePayload, allItems}, {now});
  return withViewer(pagePayload, allItems, store, userId);
}

export function getLeaderboardItem(store, publicId, {userId, now = Date.now()} = {}) {
  const id = String(publicId || '').trim();
  if (!/^[a-f0-9]{16,64}$/i.test(id)) return null;
  const row = store.db.prepare(`
    SELECT public_id, title, alias, bench_label, pct_since, pct_30d, bench_30d,
           holdings_json, days_active, ranked, auto_label, note, window_end, computed_at
    FROM public_take_stats
    WHERE public_id=?
  `).get(id);
  if (!row) return null;
  const ordered = orderStatsRows(loadStatsRows(store.db));
  const ranked = ordered.find(item => item.public_id === row.public_id);
  const nowDay = typeof now === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(now)
    ? now
    : dayInBuenosAires(now);
  const item = publicItem(
    {...row, position: ranked?.position ?? null, note: ranked?.note ?? row.note},
    {nowDay},
  );
  const mineIds = minePublicIds(store.db, userId);
  const mine = mineIds.has(item.publicId);
  const takeId = mine ? mineTakeIdByPublicId(store.db, userId, item.publicId) : null;
  return {
    ...item,
    mine,
    mineSummary: mine ? {
      publicId: item.publicId,
      ranked: item.ranked,
      position: item.position,
      daysActive: item.daysActive,
      marksInWindow: takeId ? marksInWindowForTake(store, takeId, {now}) : 0,
    } : null,
    windowEnd: item.windowEnd,
    computedAt: item.computedAt,
  };
}

export function collectJsonKeys(value, into = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonKeys(item, into);
    return into;
  }
  if (!value || typeof value !== 'object') return into;
  for (const [key, child] of Object.entries(value)) {
    into.add(key);
    collectJsonKeys(child, into);
  }
  return into;
}

export function assertLeaderboardPayload(payload) {
  const keys = collectJsonKeys(payload);
  for (const key of LEADERBOARD_FORBIDDEN_KEYS) {
    if (keys.has(key)) throw new Error(`leaderboard payload leaked ${key}`);
  }
  return true;
}

export {leaderboardGeneration};
