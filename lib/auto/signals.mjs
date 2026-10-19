/**
 * Pure signal derivation: hysteresis, debounce, news opt-in, stable signatures.
 * No DB I/O. AU3 persists the returned signals / nextArmState.
 */

import {createHash} from 'node:crypto';
import {holdingDerived} from '../portfolio.mjs';
import {artParts, artWallClockToDate, isMarketOpen} from '../quote-time.mjs';
import {dayInBuenosAires} from '../usage.mjs';
import {
  AUTO_H_IN_PP, AUTO_H_OUT_PP, AUTO_DEBOUNCE_MS, AUTO_BROKEN_WAIT_MS,
  AUTO_COOLDOWN_MS,
} from './constants.mjs';
import {REASONS} from './reasons.mjs';
import {applyQuotesToTake, quoteOf, quoteFreshness, toIso, toMs} from './quotes.mjs';

export const H_IN = AUTO_H_IN_PP;
export const H_OUT = AUTO_H_OUT_PP;

export function signalPayload({kind, ticker = '', armEpoch = 0, sourceReviewId = ''} = {}) {
  const parts = [kind || '', ticker || '', String(armEpoch ?? 0)];
  if (sourceReviewId) parts.push(String(sourceReviewId));
  return parts.join('|');
}

/** sha256(kind|ticker|armEpoch|sourceReviewId?) — UNIQUE(take_id, signature) in AU1. */
export function signalSignature(input) {
  return createHash('sha256').update(signalPayload(input)).digest('hex');
}

export function armKey(kind, ticker) {
  return ticker ? `${kind}:${ticker}` : kind;
}

export function readArm(armState, kind, ticker) {
  const row = armState?.[armKey(kind, ticker)];
  return {
    armed: row?.armed !== false,
    epoch: Number.isInteger(row?.epoch) ? row.epoch : 0,
    lastFiredAt: row?.lastFiredAt || null,
  };
}

function writeArm(next, kind, ticker, patch) {
  next[armKey(kind, ticker)] = {...readArm(next, kind, ticker), ...patch};
}

export function isHoliday(now, holidays = []) {
  if (!holidays?.length) return false;
  const day = dayInBuenosAires(new Date(toMs(now)));
  return holidays.some(h => String(h) === day);
}

export function autoMarketOpen(now, {holidays} = {}) {
  const date = new Date(toMs(now));
  if (isHoliday(date, holidays)) return false;
  return isMarketOpen(date);
}

/** Close of the next weekday session strictly after `now` (17:00 ART). */
export function nextSessionClose(now) {
  const start = new Date(toMs(now));
  if (Number.isNaN(start.getTime())) return null;
  for (let i = 0; i < 10; i++) {
    const probe = new Date(start.getTime() + i * 86_400_000);
    const p = artParts(probe);
    if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;
    const close = artWallClockToDate(Number(p.year), Number(p.month), Number(p.day), 17, 0);
    if (close.getTime() > start.getTime()) return close.toISOString();
  }
  const p = artParts(start);
  return artWallClockToDate(Number(p.year), Number(p.month), Number(p.day), 17, 0).toISOString();
}

export function capEnters(actual, cap) {
  return Number.isFinite(actual) && Number.isFinite(cap) && actual >= cap + H_IN;
}

export function capRearms(actual, cap) {
  return Number.isFinite(actual) && Number.isFinite(cap) && actual < cap - H_OUT;
}

export function driftEnters(actual, weight, drift) {
  return Number.isFinite(actual) && Number.isFinite(weight) && Number.isFinite(drift)
    && Math.abs(actual - weight) >= drift + H_IN;
}

export function driftRearms(actual, weight, drift) {
  return Number.isFinite(actual) && Number.isFinite(weight) && Number.isFinite(drift)
    && Math.abs(actual - weight) < drift - H_OUT;
}

function newsTriggerOn(policy) {
  return policy?.newsTrigger === true || policy?.newsTrigger === 1;
}

function reviewIsBroken(review) {
  if (!review || review.applied !== true) return false;
  if (review.previousAttention === 'review') return false;
  if (review.newAttention !== 'review') return false;
  const events = review.events || [];
  const sourceIds = review.sourceIds || review.source_ids || [];
  return events.length >= 1 && sourceIds.length >= 1;
}

function reviewRearmsBroken(review) {
  if (!review || review.resolved !== true) return false;
  return review.newAttention === 'track' || review.newAttention === 'watch';
}

function inCooldown(arm, now, recentAutoTrades, kind, ticker) {
  const nowMs = toMs(now);
  if (arm.lastFiredAt && nowMs - toMs(arm.lastFiredAt) < AUTO_COOLDOWN_MS) return true;
  return (recentAutoTrades || []).some(trade => {
    if (trade.kind !== kind) return false;
    if (ticker && trade.ticker && trade.ticker !== ticker) return false;
    if (ticker && trade.meta?.ticker && trade.meta.ticker !== ticker) return false;
    const at = trade.executedAt || trade.createdAt;
    return at && nowMs - toMs(at) < AUTO_COOLDOWN_MS;
  });
}

function pendingFor(pendingSignals, kind, ticker, epoch) {
  return (pendingSignals || []).find(s => (
    s.kind === kind
    && (s.ticker || '') === (ticker || '')
    && (s.armEpoch ?? 0) === epoch
    && (s.status === 'pending' || s.status === 'confirmed')
  )) || null;
}

function buildSignal({
  kind, ticker, armEpoch, sourceReviewId, status, now, quoteAsOf, expiresAt, meta, reason,
  detectedAt,
}) {
  return {
    kind,
    ticker: ticker || null,
    armEpoch,
    sourceReviewId: sourceReviewId || null,
    signature: signalSignature({kind, ticker: ticker || '', armEpoch, sourceReviewId}),
    status,
    quoteAsOf: quoteAsOf || null,
    detectedAt: detectedAt ? toIso(detectedAt) : toIso(now),
    expiresAt: expiresAt || null,
    reason: reason || null,
    meta: meta || {},
  };
}

function observeHoldings(live) {
  const rows = [];
  for (const h of live.holdings || []) {
    const d = holdingDerived(live, h);
    rows.push({
      ticker: h.ticker,
      actual: d.actual,
      weight: h.weight,
      cap: d.cap,
      drift: d.drift,
      units: h.units,
      capHit: capEnters(d.actual, d.cap),
      driftHit: driftEnters(d.actual, h.weight, d.drift),
      capExit: capRearms(d.actual, d.cap),
      driftExit: driftRearms(d.actual, h.weight, d.drift),
      chip: d.ruleChip,
    });
  }
  return rows;
}

function quoteAsOfFor(quotes, ticker) {
  return quoteOf(quotes, ticker)?.asOf || null;
}

function expireIfPending(pendingSignals, kind, ticker, epoch, now, obs) {
  const pending = pendingFor(pendingSignals, kind, ticker, epoch);
  if (pending?.status !== 'pending') return null;
  return buildSignal({
    kind, ticker, armEpoch: epoch, sourceReviewId: pending.sourceReviewId,
    status: 'expired', now, reason: REASONS.CONDICION_AUSENTE,
    quoteAsOf: pending.quoteAsOf, detectedAt: pending.detectedAt, expiresAt: pending.expiresAt,
    meta: {...(pending.meta || {}), actual: obs.actual, cap: obs.cap, drift: obs.drift, weight: obs.weight},
  });
}

function advancePrice(obs, {
  quotes, now, nextArm, pendingSignals, recentAutoTrades, blocks,
}) {
  if (!obs.capHit && !obs.driftHit) {
    const expired = [];
    for (const kind of ['cap', 'drift']) {
      const arm = readArm(nextArm, kind, obs.ticker);
      const exit = kind === 'cap' ? obs.capExit : obs.driftExit;
      if (!arm.armed && exit) {
        writeArm(nextArm, kind, obs.ticker, {armed: true, epoch: arm.epoch + 1, lastFiredAt: arm.lastFiredAt});
      }
      const signal = expireIfPending(pendingSignals, kind, obs.ticker, arm.epoch, now, obs);
      if (signal) expired.push(signal);
    }
    return expired;
  }

  const kind = obs.capHit ? 'cap' : 'drift';
  const extras = [];
  if (obs.capHit) {
    const driftArm = readArm(nextArm, 'drift', obs.ticker);
    const expiredDrift = expireIfPending(
      pendingSignals, 'drift', obs.ticker, driftArm.epoch, now, obs,
    );
    if (expiredDrift) extras.push(expiredDrift);
  }
  const arm = readArm(nextArm, kind, obs.ticker);
  if (!arm.armed) return extras.length ? extras : null;
  if (inCooldown(arm, now, recentAutoTrades, kind, obs.ticker)) {
    blocks.push({reason: REASONS.COOLDOWN, kind, ticker: obs.ticker});
    return extras.length ? extras : null;
  }

  const fresh = quoteFreshness(quoteOf(quotes, obs.ticker), now);
  if (!fresh.ok) {
    blocks.push({reason: fresh.reason, kind, ticker: obs.ticker});
    return null;
  }

  const asOf = quoteAsOfFor(quotes, obs.ticker);
  const pending = pendingFor(pendingSignals, kind, obs.ticker, arm.epoch);
  const meta = {actual: obs.actual, cap: obs.cap, drift: obs.drift, weight: obs.weight, chip: obs.chip};
  if (!pending) {
    return buildSignal({kind, ticker: obs.ticker, armEpoch: arm.epoch, status: 'pending', now, quoteAsOf: asOf, meta});
  }
  if (pending.status === 'confirmed') return null;
  const prevAsOf = pending.quoteAsOf;
  const gap = prevAsOf && asOf ? Date.parse(asOf) - Date.parse(prevAsOf) : 0;
  if (asOf && prevAsOf && asOf !== prevAsOf && gap >= AUTO_DEBOUNCE_MS) {
    writeArm(nextArm, kind, obs.ticker, {armed: false, epoch: arm.epoch});
    return buildSignal({
      kind, ticker: obs.ticker, armEpoch: arm.epoch, status: 'confirmed', now,
      quoteAsOf: asOf, meta, detectedAt: pending.detectedAt,
    });
  }
  return buildSignal({
    kind, ticker: obs.ticker, armEpoch: arm.epoch, status: 'pending', now,
    quoteAsOf: pending.quoteAsOf || asOf, meta, detectedAt: pending.detectedAt,
  });
}

function advanceBroken({
  policy, latestReview, now, armState, nextArm, pendingSignals, recentAutoTrades,
  holidays, blocks, marketOpen,
}) {
  const arm = readArm(nextArm, 'broken', null);
  if (reviewRearmsBroken(latestReview) && !arm.armed) {
    writeArm(nextArm, 'broken', null, {armed: true, epoch: arm.epoch + 1, lastFiredAt: arm.lastFiredAt});
  }
  if (!newsTriggerOn(policy)) {
    if (reviewIsBroken(latestReview)) blocks.push({reason: REASONS.NEWS_TRIGGER_APAGADO, kind: 'broken'});
    return null;
  }
  if (!reviewIsBroken(latestReview) && !pendingFor(pendingSignals, 'broken', null, arm.epoch)) {
    return null;
  }

  const pending = pendingFor(pendingSignals, 'broken', null, arm.epoch);
  if (pending?.status === 'pending') {
    if (latestReview && pending.sourceReviewId && latestReview.id !== pending.sourceReviewId) {
      const attentionChanged = latestReview.newAttention && latestReview.newAttention !== 'review';
      if (attentionChanged || reviewRearmsBroken(latestReview)) {
        return buildSignal({
          kind: 'broken', armEpoch: arm.epoch, sourceReviewId: pending.sourceReviewId,
          status: 'expired', now, reason: REASONS.CONDICION_AUSENTE,
          expiresAt: pending.expiresAt,
        });
      }
    }
    if (!marketOpen) return pending;
    const waited = toMs(now) - toMs(pending.detectedAt || now);
    if (waited < AUTO_BROKEN_WAIT_MS) return pending;
    if (!reviewIsBroken(latestReview) && latestReview?.id === pending.sourceReviewId) {
      return buildSignal({
        kind: 'broken', armEpoch: arm.epoch, sourceReviewId: pending.sourceReviewId,
        status: 'expired', now, reason: REASONS.CONDICION_AUSENTE, expiresAt: pending.expiresAt,
      });
    }
    writeArm(nextArm, 'broken', null, {armed: false, epoch: arm.epoch});
    return buildSignal({
      kind: 'broken', armEpoch: arm.epoch, sourceReviewId: pending.sourceReviewId || latestReview?.id,
      status: 'confirmed', now, expiresAt: pending.expiresAt,
      meta: {previousAttention: latestReview?.previousAttention, newAttention: latestReview?.newAttention},
    });
  }

  if (!reviewIsBroken(latestReview) || !arm.armed) return null;
  if (inCooldown(arm, now, recentAutoTrades, 'broken', null)) {
    blocks.push({reason: REASONS.COOLDOWN, kind: 'broken'});
    return null;
  }
  return buildSignal({
    kind: 'broken',
    armEpoch: arm.epoch,
    sourceReviewId: latestReview.id,
    status: 'pending',
    now,
    expiresAt: nextSessionClose(now),
    meta: {previousAttention: latestReview.previousAttention, newAttention: latestReview.newAttention},
  });
}

/**
 * @param {object} take
 * @param {object} [opts]
 * @param {object} [opts.quotes]
 * @param {object} [opts.latestReview]
 * @param {object} [opts.armState]
 * @param {Date|string|number} [opts.now]
 * @param {object} [opts.policy] newsTrigger, pausedReason, enabled
 * @param {object[]} [opts.pendingSignals]
 * @param {object[]} [opts.recentAutoTrades]
 * @param {string[]} [opts.holidays]
 */
export function deriveSignals(take, {
  quotes, latestReview, armState, now = new Date(), policy, pendingSignals,
  recentAutoTrades, holidays,
} = {}) {
  const blocks = [];
  const nextArm = {...(armState || policy?.armState || {})};
  const enabled = policy?.enabled !== false && policy?.enabled !== 0;
  if (!enabled) {
    return {signals: [], nextArmState: nextArm, blocks: [{reason: REASONS.AUTO_TESIS_APAGADO}]};
  }
  if (policy?.pausedReason === 'tesis_rota') {
    return {signals: [], nextArmState: nextArm, blocks: [{reason: REASONS.TESIS_ROTA, kind: 'broken'}]};
  }

  const marketOpen = autoMarketOpen(now, {holidays});
  const live = applyQuotesToTake(take, quotes);
  const signals = [];

  if (!marketOpen) {
    blocks.push({reason: isHoliday(now, holidays) ? REASONS.FERIADO : REASONS.MERCADO_CERRADO});
  } else {
    for (const obs of observeHoldings(live)) {
      const signal = advancePrice(obs, {
        quotes, now, nextArm, pendingSignals, recentAutoTrades, blocks,
      });
      if (Array.isArray(signal)) signals.push(...signal);
      else if (signal) signals.push(signal);
    }
  }

  const broken = advanceBroken({
    policy, latestReview, now, armState, nextArm, pendingSignals, recentAutoTrades,
    holidays, blocks, marketOpen,
  });
  if (broken) signals.push(broken);

  return {signals, nextArmState: nextArm, blocks, take: live};
}
