/**
 * Precompute public_take_stats from take_daily_marks.
 * % 30d is TWR net of aportes: r_d = V_d / (V_{d-1} + CF_d) − 1, then chained.
 */

import {BENCHMARKS} from './benchmark.mjs';
import {bumpLeaderboardGeneration} from './leaderboard-cache.mjs';
import {dayInBuenosAires} from './usage.mjs';

export const RANK_MIN_DAYS = 30;
export const RANK_MIN_MARKS = 15;
export const WINDOW_DAYS = 30;
export const STALE_AFTER_DAYS = 3;

const NOTE_NUEVAS = 'nuevas';

export function addIsoDay(day, delta) {
  const [year, month, date] = String(day).split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date + Number(delta)));
  return utc.toISOString().slice(0, 10);
}

export function isoDayDiff(from, to) {
  const [fy, fm, fd] = String(from).split('-').map(Number);
  const [ty, tm, td] = String(to).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function windowStartDay(windowEnd, days = WINDOW_DAYS) {
  return addIsoDay(windowEnd, 1 - days);
}

export function daysActiveSince(activatedAt, windowEnd) {
  if (!activatedAt || !windowEnd) return 0;
  const start = typeof activatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(activatedAt)
    ? activatedAt
    : dayInBuenosAires(activatedAt);
  const diff = isoDayDiff(start, windowEnd);
  return diff >= 0 ? diff + 1 : 0;
}

export function asPct(twr) {
  if (!Number.isFinite(twr)) return null;
  return Math.round(twr * 10_000) / 100;
}

/**
 * Daily TWR net of cashflows (aportes / retiros).
 * CF_d = invested_d − invested_{d-1}; r_d = V_d / (V_{d-1} + CF_d) − 1.
 */
export function dailyReturn(prev, next) {
  if (!prev || !next) return null;
  const startValue = Number(prev.value);
  const endValue = Number(next.value);
  const startInvested = Number(prev.invested);
  const endInvested = Number(next.invested);
  if (![startValue, endValue, startInvested, endInvested].every(Number.isFinite)) return null;
  const cashflow = endInvested - startInvested;
  const denom = startValue + cashflow;
  if (!(denom > 0) || !(endValue >= 0)) return null;
  return endValue / denom - 1;
}

export function benchDailyReturn(prev, next) {
  const start = Number(prev?.bench_price ?? prev?.benchPrice);
  const end = Number(next?.bench_price ?? next?.benchPrice);
  if (!(start > 0) || !(end > 0)) return null;
  return end / start - 1;
}

export function chainReturns(returns) {
  const finite = (returns || []).filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((acc, rate) => acc * (1 + rate), 1) - 1;
}

export function publicHoldings(take) {
  return (take?.holdings || [])
    .filter(row => row && typeof row.ticker === 'string')
    .map(row => ({ticker: row.ticker, weight: Number(row.weight) || 0}));
}

export function countEligibleInWindow(marks, windowEnd) {
  const start = windowStartDay(windowEnd);
  return (marks || []).filter(row => (
    row.eligible
    && row.day >= start
    && row.day <= windowEnd
  )).length;
}

function sortMarks(marks) {
  return (marks || []).slice().sort((a, b) => String(a.day).localeCompare(String(b.day)));
}

export function twrBetween(marks, fromDay, toDay) {
  const ordered = sortMarks(marks).filter(row => row.day <= toDay);
  if (ordered.length < 2) return null;
  let startIdx = 0;
  if (fromDay) {
    const firstIn = ordered.findIndex(row => row.day >= fromDay);
    startIdx = firstIn <= 0 ? 0 : firstIn - 1;
  }
  const slice = ordered.slice(startIdx);
  if (slice.length < 2) return null;
  const rates = [];
  for (let i = 1; i < slice.length; i++) {
    const rate = dailyReturn(slice[i - 1], slice[i]);
    if (rate != null) rates.push(rate);
  }
  return chainReturns(rates);
}

export function benchTwrBetween(marks, fromDay, toDay) {
  const ordered = sortMarks(marks).filter(row => row.day <= toDay);
  if (ordered.length < 2) return null;
  let startIdx = 0;
  if (fromDay) {
    const firstIn = ordered.findIndex(row => row.day >= fromDay);
    startIdx = firstIn <= 0 ? 0 : firstIn - 1;
  }
  const slice = ordered.slice(startIdx);
  const rates = [];
  for (let i = 1; i < slice.length; i++) {
    const rate = benchDailyReturn(slice[i - 1], slice[i]);
    if (rate != null) rates.push(rate);
  }
  return chainReturns(rates);
}

function loadMarks(db, takeId) {
  return db.prepare(`
    SELECT day, value, invested, bench_id, bench_price, eligible
    FROM take_daily_marks
    WHERE take_id=?
    ORDER BY day ASC
  `).all(takeId).map(row => ({
    day: row.day,
    value: row.value,
    invested: row.invested,
    bench_id: row.bench_id,
    bench_price: row.bench_price,
    eligible: !!row.eligible,
  }));
}

function benchLabelFor(take, marks) {
  if (take?.benchmarkLabel) return take.benchmarkLabel;
  const id = take?.benchmarkId || marks.find(row => row.bench_id)?.bench_id;
  return (id && BENCHMARKS[id]?.label) || null;
}

function isStale(windowEnd, computedDay) {
  if (!windowEnd || !computedDay) return false;
  return isoDayDiff(windowEnd, computedDay) > STALE_AFTER_DAYS;
}

export function switchProgress(store, take, {now = new Date()} = {}) {
  const marks = take?.id ? loadMarks(store.db, take.id) : [];
  const computedDay = dayInBuenosAires(now);
  const windowEnd = marks.at(-1)?.day || computedDay;
  return {
    daysActive: daysActiveSince(take?.activatedAt, windowEnd),
    marksInWindow: countEligibleInWindow(marks, windowEnd),
  };
}

function autoEnabledFor(store, takeId, userId) {
  const row = userId
    ? store.db.prepare('SELECT enabled FROM auto_policies WHERE take_id=? AND user_id=?').get(takeId, userId)
    : store.db.prepare('SELECT enabled FROM auto_policies WHERE take_id=?').get(takeId);
  return !!row?.enabled;
}

function listPublicRefs(db) {
  return db.prepare(`
    SELECT t.id AS take_id, t.public_id, t.public_since, t.user_id,
           u.public_alias AS alias, u.status AS user_status
    FROM takes t
    JOIN users u ON u.id = t.user_id
    WHERE t.is_public = 1 AND t.public_id IS NOT NULL
  `).all();
}

function upsertStats(db, row) {
  db.prepare(`
    INSERT INTO public_take_stats(
      public_id, take_id, user_id, title, alias, bench_label, pct_since, pct_30d,
      bench_30d, holdings_json, days_active, ranked, auto_label, note, window_end, computed_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(public_id) DO UPDATE SET
      take_id=excluded.take_id,
      user_id=excluded.user_id,
      title=excluded.title,
      alias=excluded.alias,
      bench_label=excluded.bench_label,
      pct_since=excluded.pct_since,
      pct_30d=excluded.pct_30d,
      bench_30d=excluded.bench_30d,
      holdings_json=excluded.holdings_json,
      days_active=excluded.days_active,
      ranked=excluded.ranked,
      auto_label=excluded.auto_label,
      note=excluded.note,
      window_end=excluded.window_end,
      computed_at=excluded.computed_at
  `).run(
    row.publicId, row.takeId, row.userId, row.title, row.alias, row.benchLabel,
    row.pctSince, row.pct30d, row.bench30d, JSON.stringify(row.holdings),
    row.daysActive, row.ranked ? 1 : 0, row.autoLabel ? 1 : 0, row.note,
    row.windowEnd, row.computedAt,
  );
}

export function computePublicStats({
  take, alias, marks, autoLabel = false, now = new Date(),
}) {
  const computedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const computedDay = dayInBuenosAires(now);
  const ordered = sortMarks(marks);
  const windowEnd = ordered.at(-1)?.day || computedDay;
  const start30 = windowStartDay(windowEnd);
  const daysActive = daysActiveSince(take?.activatedAt, windowEnd);
  const marksInWindow = countEligibleInWindow(ordered, windowEnd);
  const ranked = daysActive >= RANK_MIN_DAYS && marksInWindow >= RANK_MIN_MARKS;
  return {
    title: String(take?.title || '').trim() || 'Tesis',
    alias,
    benchLabel: benchLabelFor(take, ordered),
    pctSince: asPct(twrBetween(ordered, ordered[0]?.day, windowEnd)),
    pct30d: asPct(twrBetween(ordered, start30, windowEnd)),
    bench30d: asPct(benchTwrBetween(ordered, start30, windowEnd)),
    holdings: publicHoldings(take),
    daysActive,
    marksInWindow,
    ranked,
    autoLabel: !!autoLabel,
    note: ranked ? null : NOTE_NUEVAS,
    stale: isStale(windowEnd, computedDay),
    windowEnd,
    computedAt,
  };
}

function statsRowForRef(store, ref, {now} = {}) {
  if (ref.user_status !== 'active' || !ref.alias) return null;
  const scoped = store.forUser ? store.forUser(ref.user_id) : store;
  const take = scoped.take(ref.take_id);
  if (!take || take.phase === 'archived') return null;
  const computed = computePublicStats({
    take,
    alias: ref.alias,
    marks: loadMarks(store.db, ref.take_id),
    autoLabel: autoEnabledFor(store, ref.take_id, ref.user_id),
    now,
  });
  return {
    publicId: ref.public_id,
    takeId: ref.take_id,
    userId: ref.user_id,
    ...computed,
  };
}

function deleteOrphans(db, keepPublicIds) {
  const keep = new Set(keepPublicIds);
  const existing = db.prepare('SELECT public_id FROM public_take_stats').all();
  const remove = db.prepare('DELETE FROM public_take_stats WHERE public_id=?');
  let deleted = 0;
  for (const row of existing) {
    if (keep.has(row.public_id)) continue;
    remove.run(row.public_id);
    deleted += 1;
  }
  return deleted;
}

export function recomputePublicTakeStats(store, {takeId, now = new Date()} = {}) {
  const refs = listPublicRefs(store.db).filter(ref => !takeId || ref.take_id === takeId);
  let written = 0;
  for (const ref of refs) {
    const row = statsRowForRef(store, ref, {now});
    if (!row) continue;
    upsertStats(store.db, row);
    written += 1;
  }
  if (takeId && !written) {
    store.db.prepare('DELETE FROM public_take_stats WHERE take_id=?').run(takeId);
  }
  bumpLeaderboardGeneration();
  return {written};
}

export function recomputeAllPublicTakeStats(store, {now = new Date()} = {}) {
  const refs = listPublicRefs(store.db);
  const keep = [];
  let written = 0;
  for (const ref of refs) {
    const row = statsRowForRef(store, ref, {now});
    if (!row) continue;
    upsertStats(store.db, row);
    keep.push(row.publicId);
    written += 1;
  }
  const deleted = deleteOrphans(store.db, keep);
  bumpLeaderboardGeneration();
  return {written, deleted};
}

export function refreshPublicStatsAlias(store, userId, alias) {
  const result = store.db.prepare('UPDATE public_take_stats SET alias=? WHERE user_id=?').run(alias, userId);
  if (result.changes > 0) bumpLeaderboardGeneration();
  return result.changes;
}

export function marksInWindowForTake(store, takeId, {now = new Date()} = {}) {
  const windowEnd = store.db.prepare(
    'SELECT MAX(day) AS day FROM take_daily_marks WHERE take_id=?',
  ).get(takeId)?.day || dayInBuenosAires(now);
  const start = windowStartDay(windowEnd);
  return store.db.prepare(`
    SELECT COUNT(*) AS n FROM take_daily_marks
    WHERE take_id=? AND eligible=1 AND day>=? AND day<=?
  `).get(takeId, start, windowEnd).n;
}
