/**
 * One private mark per active take after the BYMA session (≈17:30 ART).
 * Iterates user by user. Does not write public_take_stats (LB2).
 */

import {value} from './engine.mjs';
import {artParts} from './quote-time.mjs';
import {dayInBuenosAires} from './usage.mjs';

export const DAILY_MARKS_SETTING = 'dailyMarksDay';
export const DAILY_MARKS_HOUR = 17;
export const DAILY_MARKS_MINUTE = 30;
export const DAILY_MARKS_INTERVAL_MS = 60_000;

export function artCalendarDay(now = new Date()) {
  const p = artParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Weekday after 17:30 ART, once per ART calendar day. */
export function shouldWriteDailyMarks(now = new Date(), lastDay = null) {
  const p = artParts(now);
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
  const hm = Number(p.hour) * 60 + Number(p.minute);
  if (hm < DAILY_MARKS_HOUR * 60 + DAILY_MARKS_MINUTE) return false;
  return lastDay !== `${p.year}-${p.month}-${p.day}`;
}

export function markEligible(take, val = value(take)) {
  return take?.phase === 'active'
    && (take.scenario || 'normal') === 'normal'
    && !!take.realPricesAt
    && Number.isFinite(val)
    && Number.isFinite(take.invested);
}

function asDate(now) {
  const raw = typeof now === 'function' ? now() : now;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number' || typeof raw === 'string') return new Date(raw);
  return new Date();
}

export function createDailyMarksJob({
  store,
  quotes,
  now = Date.now,
  startTimer = false,
  intervalMs = DAILY_MARKS_INTERVAL_MS,
  logger = console,
} = {}) {
  let timer = null;

  function lastDay() {
    return store.setting(DAILY_MARKS_SETTING) || null;
  }

  function write({force = false} = {}) {
    const at = asDate(now);
    const day = dayInBuenosAires(at);
    if (!force && !shouldWriteDailyMarks(at, lastDay())) {
      return {written: 0, skipped: true, day};
    }
    let written = 0;
    for (const user of store.listUsersLite()) {
      if (user.status !== 'active') continue;
      const scoped = store.forUser(user.id);
      for (const takeId of scoped.takeIds()) {
        const take = scoped.take(takeId);
        if (!take || take.phase !== 'active') continue;
        const val = value(take);
        const bench = take.benchmarkId ? quotes?.getBenchmarkCached?.(take.benchmarkId) : null;
        scoped.upsertDailyMark({
          takeId: take.id,
          day,
          value: val,
          invested: take.invested,
          benchId: take.benchmarkId || null,
          benchPrice: Number.isFinite(bench?.price) ? bench.price : null,
          eligible: markEligible(take, val),
        });
        written += 1;
      }
    }
    store.setSetting(DAILY_MARKS_SETTING, day);
    return {written, skipped: false, day};
  }

  function tick() {
    try {
      write();
    } catch (error) {
      const line = JSON.stringify({event: 'daily_marks_failed', type: error?.name || 'Error'});
      if (typeof logger?.error === 'function') logger.error(line);
      else console.error(line);
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, intervalMs);
    timer.unref?.();
    tick();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  if (startTimer) start();
  return {write, tick, start, stop, lastDay, shouldWrite: () => shouldWriteDailyMarks(asDate(now), lastDay())};
}
