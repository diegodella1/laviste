/**
 * Compensating undo at the CURRENT quote. Partial fills allowed. Pure preview.
 * Does not consume the 2/6 daily trade limits (AU3 still records kind='undo').
 */

import {createHash} from 'node:crypto';
import {money, previewTrade} from '../engine.mjs';
import {moneyARS} from '../portfolio.mjs';
import {
  AUTO_UNDO_AT, AUTO_UNDO_WINDOW_HOURS,
} from './constants.mjs';
import {REASONS, allowed, blocked} from './reasons.mjs';
import {quoteOf, toMs} from './quotes.mjs';
import {actualAfterUnits} from './sizing.mjs';
import {evaluateGuards} from './guards.mjs';

export {AUTO_UNDO_AT, AUTO_UNDO_WINDOW_HOURS};

function opposite(side) {
  return side === 'venta' ? 'compra' : 'venta';
}

function cloneTake(take) {
  return {
    ...take,
    holdings: (take.holdings || []).map(h => ({...h})),
    settings: {...(take.settings || {})},
  };
}

function holdingOf(take, ticker) {
  return (take.holdings || []).find(h => h.ticker === ticker) || null;
}

function originalLegs(trade) {
  const legs = trade?.meta?.legs || trade?.legs || [];
  return Array.isArray(legs) ? legs : [];
}

export function undoWindowMs(policy) {
  const hours = policy?.undoWindowHours ?? AUTO_UNDO_WINDOW_HOURS;
  return hours * 60 * 60 * 1000;
}

export function undoWindowOpen(trade, now, policy) {
  const at = trade?.executedAt || trade?.createdAt;
  if (!at) return false;
  return toMs(now) - toMs(at) <= undoWindowMs(policy);
}

function alreadyUndone(trade) {
  if (!trade) return true;
  if (trade.undoTradeId) return true;
  return trade.status === 'reversed' || trade.status === 'partially_reversed';
}

function pnlFor(originalSide, originalPrice, currentPrice, units) {
  if (originalSide === 'venta') return money((originalPrice - currentPrice) * units);
  return money((currentPrice - originalPrice) * units);
}

function formatPnl(n) {
  const abs = moneyARS(Math.abs(n));
  if (n < 0) return `−${abs}`;
  if (n > 0) return `+${abs}`;
  return abs;
}

function undoLine(leg) {
  const verb = leg.side === 'compra' ? 'Recomprás' : 'Vendés';
  const orig = leg.originalSide === 'venta' ? 'vendiste' : 'compraste';
  return `${verb} ${leg.units} u. de ${leg.ticker} a ${moneyARS(leg.price)} (${orig} a ${moneyARS(leg.originalPrice)}): ${formatPnl(leg.pnl)}`;
}

function fingerprintOf(legs) {
  const stable = legs.map(l => ({
    side: l.side, ticker: l.ticker, units: l.units, price: l.price, amount: l.amount,
  }));
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function clipBuy(take, ticker, requested, price) {
  const h = holdingOf(take, ticker);
  const cap = take.settings?.cap ?? 25;
  const byCash = Math.floor((take.cash || 0) / price);
  let qty = Math.min(requested, Math.max(0, byCash));
  let clippedBy = qty < requested ? (byCash < requested ? 'cash' : null) : null;
  while (qty >= 1 && actualAfterUnits(take, ticker, (h?.units || 0) + qty) > cap + 1e-9) {
    qty -= 1;
    clippedBy = 'cap';
  }
  if (qty < 1 && requested >= 1) clippedBy = clippedBy || (byCash < 1 ? 'cash' : 'cap');
  return {qty, clippedBy};
}

function clipSell(take, ticker, requested) {
  const h = holdingOf(take, ticker);
  const have = h?.units || 0;
  const qty = Math.min(requested, have);
  return {qty, clippedBy: qty < requested ? 'units' : null};
}

function applyLeg(take, preview) {
  const h = holdingOf(take, preview.ticker);
  if (h) h.units = preview.unitsAfter;
  take.cash = preview.cashAfter;
}

/**
 * Preview the compensating trade at live quotes. Partial is ok; all-zero is not.
 * `consumesLimit` is always false (2/día and 6/día). Turnover is applied by guards.
 */
export function previewUndo({trade, take, quotes, now = new Date(), policy} = {}) {
  if (alreadyUndone(trade)) return blocked(REASONS.YA_DESHECHO, {consumesLimit: false, reactivate: false});
  if (!undoWindowOpen(trade, now, policy)) {
    return blocked(REASONS.VENTANA_DESHACER_VENCIDA, {consumesLimit: false, reactivate: false});
  }
  const source = originalLegs(trade);
  if (!source.length) return blocked(REASONS.SIN_PATAS, {consumesLimit: false, reactivate: false});

  const scratch = cloneTake(take);
  const legs = [];
  const clipReasons = [];
  for (const orig of source) {
    const side = opposite(orig.side);
    const q = quoteOf(quotes, orig.ticker);
    const price = q?.price > 0 ? money(q.price) : money(holdingOf(scratch, orig.ticker)?.price);
    const requested = Math.max(0, Math.floor(orig.units || 0));
    if (!(price > 0) || requested < 1) {
      legs.push(emptyLeg(orig, side, price, requested, 'quote'));
      continue;
    }
    const clipped = side === 'compra'
      ? clipBuy(scratch, orig.ticker, requested, price)
      : clipSell(scratch, orig.ticker, requested);
    if (clipped.qty < 1) {
      if (clipped.clippedBy) clipReasons.push(clipReason(clipped.clippedBy));
      legs.push(emptyLeg(orig, side, price, requested, clipped.clippedBy));
      continue;
    }
    let preview;
    try {
      preview = previewTrade(scratch, {side, ticker: orig.ticker, by: 'units', units: clipped.qty});
    } catch (error) {
      const msg = String(error?.message || '');
      const reason = /efectivo/.test(msg) ? REASONS.SIN_EFECTIVO
        : /unidades/.test(msg) ? REASONS.UNIDADES_INSUFICIENTES
        : REASONS.PREVIEW_RECHAZADO;
      clipReasons.push(reason);
      legs.push(emptyLeg(orig, side, price, requested, clipped.clippedBy));
      continue;
    }
    applyLeg(scratch, preview);
    const pnl = pnlFor(orig.side, money(orig.price), preview.price, preview.units);
    const leg = {
      side: preview.side,
      ticker: preview.ticker,
      units: preview.units,
      requestedUnits: requested,
      price: preview.price,
      originalSide: orig.side,
      originalPrice: money(orig.price),
      originalUnits: requested,
      amount: preview.amount,
      pnl,
      clippedBy: clipped.clippedBy,
      line: '',
    };
    leg.line = undoLine(leg);
    legs.push(leg);
  }

  const filled = legs.filter(l => l.units >= 1);
  const amount = money(filled.reduce((s, l) => s + Math.abs(l.amount || 0), 0));
  const pnl = money(filled.reduce((s, l) => s + (l.pnl || 0), 0));
  const partial = filled.length !== source.length || filled.some(l => l.units !== l.requestedUnits);
  const fingerprint = fingerprintOf(filled);
  const base = {
    consumesLimit: false,
    reactivate: false,
    undoAt: AUTO_UNDO_AT,
    legs,
    filled,
    amount,
    pnl,
    partial,
    fingerprint,
    line: filled.map(l => l.line).join(' · '),
  };
  if (!filled.length) {
    return blocked(clipReasons[0] || REASONS.SIN_PATAS, {...base, reasons: clipReasons.length ? clipReasons : [REASONS.SIN_PATAS]});
  }
  return allowed(base);
}

function clipReason(clippedBy) {
  if (clippedBy === 'cash') return REASONS.SIN_EFECTIVO;
  if (clippedBy === 'units') return REASONS.UNIDADES_INSUFICIENTES;
  if (clippedBy === 'cap') return REASONS.PESO_POSTERIOR_MAYOR_AL_TOPE;
  return REASONS.SIN_PATAS;
}

function emptyLeg(orig, side, price, requested, clippedBy) {
  return {
    side,
    ticker: orig.ticker,
    units: 0,
    requestedUnits: requested,
    price: price || 0,
    originalSide: orig.side,
    originalPrice: money(orig.price || 0),
    originalUnits: requested,
    amount: 0,
    pnl: 0,
    clippedBy: clippedBy || null,
    line: `no se pudo deshacer ${orig.ticker}`,
  };
}

export function evaluateUndo(input) {
  const preview = previewUndo(input);
  const guards = evaluateGuards({
    ...input,
    kind: 'undo',
    sized: preview.ok
      ? {ok: true, amount: preview.amount, legs: preview.filled}
      : preview,
    extraAmount: preview.amount || 0,
    signal: {kind: 'undo', ticker: preview.filled?.[0]?.ticker || null},
  });
  if (!guards.ok) {
    return {
      ...preview,
      ok: false,
      reason: guards.reason,
      reasons: guards.reasons,
      consumesLimit: false,
      reactivate: false,
    };
  }
  if (!preview.ok) return preview;
  return {...preview, reason: null, reasons: []};
}
