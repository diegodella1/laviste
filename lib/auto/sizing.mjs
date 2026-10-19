/**
 * Integer-unit sizing on top of previewTrade. Pure — mutates a scratch take only.
 */

import {holdingDerived, takeTotal} from '../portfolio.mjs';
import {money, previewTrade} from '../engine.mjs';
import {REASONS, allowed, blocked} from './reasons.mjs';

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

export function tryPreviewTrade(take, intent) {
  try {
    return {ok: true, preview: previewTrade(take, intent)};
  } catch (error) {
    const msg = String(error?.message || '');
    if (/efectivo/.test(msg)) return blocked(REASONS.SIN_EFECTIVO, {detail: msg});
    if (/unidades/.test(msg)) return blocked(REASONS.UNIDADES_INSUFICIENTES, {detail: msg});
    return blocked(REASONS.PREVIEW_RECHAZADO, {detail: msg});
  }
}

export function targetUnitsFor(take, ticker) {
  const h = holdingOf(take, ticker);
  if (!h || !(h.price > 0)) return 0;
  const total = takeTotal(take);
  return Math.floor((total * (Number(h.weight) || 0)) / 100 / h.price);
}

export function actualAfterUnits(take, ticker, unitsAfter) {
  const h = holdingOf(take, ticker);
  if (!h || !(h.price > 0)) return 0;
  const total = takeTotal(take);
  if (!(total > 0)) return 0;
  return (unitsAfter * h.price / total) * 100;
}

function capOf(take, h) {
  return holdingDerived(take, h).cap;
}

function maxBuyUnits(take, ticker) {
  const h = holdingOf(take, ticker);
  if (!h || !(h.price > 0)) return 0;
  const cap = capOf(take, h);
  const maxWeight = Math.min(cap, h.weight);
  const maxByWeight = Math.floor(takeTotal(take) * maxWeight / 100 / h.price);
  const maxByCash = Math.floor((take.cash || 0) / h.price);
  return Math.max(0, Math.min(maxByWeight - h.units, maxByCash));
}

function postWeightOk(take, ticker, unitsAfter) {
  const h = holdingOf(take, ticker);
  if (!h) return true;
  const cap = capOf(take, h);
  return actualAfterUnits(take, ticker, unitsAfter) <= cap + 1e-9;
}

function legFromPreview(preview) {
  return {
    side: preview.side,
    ticker: preview.ticker,
    units: preview.units,
    price: preview.price,
    amount: preview.amount,
    line: preview.line,
    cashAfter: preview.cashAfter,
    unitsAfter: preview.unitsAfter,
  };
}

function applyPreview(take, preview) {
  const h = holdingOf(take, preview.ticker);
  if (h) h.units = preview.unitsAfter;
  take.cash = preview.cashAfter;
}

function pack({kind, ticker = null, legs, pauseAfter = null, consumesLimit = true}) {
  const amount = money(legs.reduce((s, l) => s + Math.abs(l.amount || 0), 0));
  return allowed({
    kind, ticker, legs, pauseAfter, consumesLimit, amount,
  });
}

export function sizeCapTrade(take, ticker) {
  const h = holdingOf(take, ticker);
  if (!h) return blocked(REASONS.UNIDADES_INSUFICIENTES);
  const target = targetUnitsFor(take, ticker);
  let qty = Math.max(0, h.units - target);
  if (qty < 1 && h.units >= 1 && holdingDerived(take, h).actual > holdingDerived(take, h).cap) {
    qty = 1;
  }
  if (qty < 1) return blocked(REASONS.SIN_PATAS);
  const previewed = tryPreviewTrade(take, {side: 'venta', ticker, by: 'units', units: qty});
  if (!previewed.ok) return previewed;
  return pack({kind: 'cap', ticker, legs: [legFromPreview(previewed.preview)]});
}

export function sizeDriftTrade(take, ticker) {
  const h = holdingOf(take, ticker);
  if (!h) return blocked(REASONS.UNIDADES_INSUFICIENTES);
  const target = targetUnitsFor(take, ticker);
  if (h.units > target) {
    const qty = h.units - target;
    const previewed = tryPreviewTrade(take, {side: 'venta', ticker, by: 'units', units: qty});
    if (!previewed.ok) return previewed;
    return pack({kind: 'drift', ticker, legs: [legFromPreview(previewed.preview)]});
  }
  const qty = Math.min(target - h.units, maxBuyUnits(take, ticker));
  if (qty < 1) {
    if (target > h.units && (take.cash || 0) < h.price) return blocked(REASONS.SIN_EFECTIVO);
    return blocked(REASONS.SIN_PATAS);
  }
  if (!postWeightOk(take, ticker, h.units + qty)) {
    return blocked(REASONS.PESO_POSTERIOR_MAYOR_AL_TOPE);
  }
  const previewed = tryPreviewTrade(take, {side: 'compra', ticker, by: 'units', units: qty});
  if (!previewed.ok) return previewed;
  return pack({kind: 'drift', ticker, legs: [legFromPreview(previewed.preview)]});
}

/** Sell floor(units/2) of each position with units≥2. A 1-unit line is left untouched. */
export function sizeBrokenBatch(take) {
  const scratch = cloneTake(take);
  const legs = [];
  for (const h of scratch.holdings || []) {
    const qty = Math.floor((h.units || 0) / 2);
    if (qty < 1) continue;
    const previewed = tryPreviewTrade(scratch, {side: 'venta', ticker: h.ticker, by: 'units', units: qty});
    if (!previewed.ok) return previewed;
    applyPreview(scratch, previewed.preview);
    legs.push(legFromPreview(previewed.preview));
  }
  return pack({kind: 'broken', ticker: null, legs, pauseAfter: 'tesis_rota'});
}

export function sizeSignal(take, signal) {
  if (!signal?.kind) return blocked(REASONS.SIN_PATAS);
  if (signal.kind === 'cap') return sizeCapTrade(take, signal.ticker);
  if (signal.kind === 'drift') return sizeDriftTrade(take, signal.ticker);
  if (signal.kind === 'broken') return sizeBrokenBatch(take);
  return blocked(REASONS.SIN_PATAS);
}
