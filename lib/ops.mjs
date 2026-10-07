/** Persistent practice ops ledger. Writes are append-only; past ops are never rewritten. */

import {createHash, randomUUID} from 'node:crypto';
import {assert, money} from './engine.mjs';
import {snapshotUsedPrice, QUOTE_CLASSES} from './quote-eligibility.mjs';

/** `retiro` is the explicit cash-out inverse of `aporte` (reduces invested+cash).
 *  Not a negative aporte (direction would be ambiguous) and not `correccion` (that does not change invested). */
export const OP_KINDS = Object.freeze(['aporte', 'retiro', 'compra', 'venta', 'rebalance', 'correccion']);

const batchKey = (kind, takeId, suffix) => `ops-batch:${kind}:${takeId}:${suffix}`;
const fingerprintOf = payload => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

function quoteFields(snap) {
  return {
    quoteAsOf: snap.asOf,
    quoteProvider: snap.provider,
    quoteClass: snap.quoteClass,
    quoteEligible: snap.eligible ? 1 : 0,
    quoteStale: snap.stale ? 1 : 0,
  };
}

function cashSnap() {
  return {quoteClass: QUOTE_CLASSES.missing, eligible: false, price: null, asOf: null, provider: null, stale: false};
}

function buildOp({id, takeId, kind, at, ticker, units, amount, price, quote, parentId, batchId, idempotencyKey, fingerprint, note, meta}) {
  assert(OP_KINDS.includes(kind), 'Tipo de movimiento inválido.');
  assert(Number.isFinite(amount), 'Monto de movimiento inválido.');
  const snap = quote || cashSnap();
  return {
    id: id || randomUUID(),
    takeId,
    kind,
    at,
    ticker: ticker || null,
    units: units == null ? null : units,
    amount: money(amount),
    currency: 'ARS',
    price: price == null ? null : money(price),
    ...quoteFields(snap),
    parentId: parentId || null,
    batchId,
    idempotencyKey,
    fingerprint,
    note: note || '',
    meta: meta || {},
    createdAt: at,
  };
}

function replayOrInsert(store, batchIdempotencyKey, fingerprint, ops) {
  const existing = store.idempotent(batchIdempotencyKey);
  if (existing) {
    assert(existing.fingerprint === fingerprint, 'La operación ya existe con otros datos.', 409);
    return {replay: true, ops: store.opsByBatch(existing.data.batchId), batchId: existing.data.batchId};
  }
  for (const op of ops) store.insertOp(op);
  store.remember(batchIdempotencyKey, fingerprint, {batchId: ops[0].batchId, opIds: ops.map(o => o.id)});
  return {replay: false, ops, batchId: ops[0].batchId};
}

export function recordActivationOps(store, take, quotes) {
  assert(take.phase === 'active' && take.invested > 0, 'Solo se registran aportes de una práctica activa.', 409);
  const at = take.activatedAt;
  const payload = {
    kind: 'activate',
    invested: take.invested,
    cash: take.cash,
    holdings: take.holdings.map(h => ({ticker: h.ticker, units: h.units, price: h.price})),
  };
  const fingerprint = fingerprintOf(payload);
  const batchId = randomUUID();
  const aporte = buildOp({
    takeId: take.id, kind: 'aporte', at, amount: take.invested, batchId,
    idempotencyKey: `ops:activate:${take.id}:aporte`, fingerprint, note: 'Activación de práctica',
    meta: {source: 'activation'},
  });
  const compras = take.holdings.filter(h => h.units > 0).map(h => buildOp({
    takeId: take.id, kind: 'compra', at, ticker: h.ticker, units: h.units,
    amount: h.units * h.price, price: h.price, quote: snapshotUsedPrice(quotes, h.ticker, h.price),
    parentId: aporte.id, batchId, idempotencyKey: `ops:activate:${take.id}:compra:${h.ticker}`,
    fingerprint, note: `Compra de práctica ${h.ticker}`, meta: {source: 'activation'},
  }));
  return replayOrInsert(store, batchKey('activate', take.id, 'v1'), fingerprint, [aporte, ...compras]);
}

export function recordRebalanceOps(store, take, result, quotes, version) {
  const at = take.events?.[0]?.at || new Date().toISOString();
  const lines = result.trades || result.lines || [];
  const payload = {
    kind: 'rebalance',
    version,
    cash: take.cash,
    lines: lines.map(l => ({ticker: l.ticker, delta: l.delta, amount: l.amount, label: l.label})),
  };
  const fingerprint = fingerprintOf(payload);
  const batchId = randomUUID();
  const parent = buildOp({
    takeId: take.id, kind: 'rebalance', at, amount: 0, batchId,
    idempotencyKey: `ops:rebalance:${take.id}:${version}`, fingerprint,
    note: 'Rebalance a pesos objetivo', meta: {source: 'rebalance', version, trades: payload.lines, before: result.before, after: result.after},
  });
  const children = lines.filter(l => l && l.ticker && l.delta !== 0).map(l => {
    const kind = l.delta < 0 ? 'venta' : 'compra';
    const units = Math.abs(l.delta);
    const holding = take.holdings.find(h => h.ticker === l.ticker);
    const price = holding?.price ?? money(l.amount / units);
    return buildOp({
      takeId: take.id, kind, at, ticker: l.ticker, units, amount: l.amount, price,
      quote: snapshotUsedPrice(quotes, l.ticker, price), parentId: parent.id, batchId,
      idempotencyKey: `ops:rebalance:${take.id}:${version}:${kind}:${l.ticker}`,
      fingerprint, note: l.line || `${kind} ${l.ticker}`, meta: {source: 'rebalance', version},
    });
  });
  return replayOrInsert(store, batchKey('rebalance', take.id, String(version)), fingerprint, [parent, ...children]);
}

export function recordAporteOp(store, take, amount, idempotencyKey) {
  const at = new Date().toISOString();
  const payload = {kind: 'aporte', takeId: take.id, amount: money(amount), invested: take.invested, cash: take.cash};
  const fingerprint = fingerprintOf(payload);
  const batchId = randomUUID();
  const key = idempotencyKey || `ops:aporte:${take.id}:${fingerprint}`;
  const op = buildOp({
    takeId: take.id, kind: 'aporte', at, amount, batchId, idempotencyKey: `ops:aporte:${take.id}:${key}`,
    fingerprint, note: 'Aporte de práctica', meta: {source: 'aporte'},
  });
  return replayOrInsert(store, batchKey('aporte', take.id, key), fingerprint, [op]);
}

export function recordRetiroOp(store, take, amount, idempotencyKey) {
  const at = new Date().toISOString();
  const payload = {kind: 'retiro', takeId: take.id, amount: money(amount), invested: take.invested, cash: take.cash};
  const fingerprint = fingerprintOf(payload);
  const batchId = randomUUID();
  const key = idempotencyKey || `ops:retiro:${take.id}:${fingerprint}`;
  const op = buildOp({
    takeId: take.id, kind: 'retiro', at, amount, batchId, idempotencyKey: `ops:retiro:${take.id}:${key}`,
    fingerprint, note: 'Retiro de práctica', meta: {source: 'retiro'},
  });
  return replayOrInsert(store, batchKey('retiro', take.id, key), fingerprint, [op]);
}

export function recordTradeOp(store, take, preview, quotes, idempotencyKey) {
  const at = new Date().toISOString();
  const kind = preview.side;
  const payload = {
    kind, takeId: take.id, ticker: preview.ticker, units: preview.units,
    amount: preview.amount, price: preview.price, by: preview.by,
  };
  const fingerprint = fingerprintOf(payload);
  const batchId = randomUUID();
  const key = idempotencyKey || `ops:trade:${take.id}:${fingerprint}`;
  const op = buildOp({
    takeId: take.id, kind, at, ticker: preview.ticker, units: preview.units,
    amount: preview.amount, price: preview.price,
    quote: snapshotUsedPrice(quotes, preview.ticker, preview.price),
    batchId, idempotencyKey: `ops:trade:${take.id}:${key}`, fingerprint,
    note: preview.line, meta: {source: 'trade', by: preview.by},
  });
  return replayOrInsert(store, batchKey('trade', take.id, key), fingerprint, [op]);
}

export function recordCorreccionOp(store, take, {cashDelta = 0, ticker = null, unitsDelta = 0, note, idempotencyKey}) {
  const at = new Date().toISOString();
  const payload = {kind: 'correccion', takeId: take.id, cashDelta: money(cashDelta), ticker, unitsDelta, cash: take.cash};
  const fingerprint = fingerprintOf(payload);
  const batchId = randomUUID();
  const key = idempotencyKey || `ops:correccion:${take.id}:${fingerprint}`;
  const op = buildOp({
    takeId: take.id, kind: 'correccion', at, ticker, units: unitsDelta || null, amount: cashDelta, batchId,
    idempotencyKey: `ops:correccion:${take.id}:${key}`, fingerprint, note: note || 'Corrección de libro',
    meta: {source: 'correccion', cashDelta: money(cashDelta), unitsDelta, ticker},
  });
  return replayOrInsert(store, batchKey('correccion', take.id, key), fingerprint, [op]);
}

/** Reconstruct cash, invested and units from ops. Rebalance parents do not move cash. */
export function booksFromOps(ops) {
  const ordered = [...ops].sort((a, b) => {
    if (a.rowid != null && b.rowid != null && a.rowid !== b.rowid) return a.rowid - b.rowid;
    if (a.at !== b.at) return a.at.localeCompare(b.at);
    const rank = {aporte: 0, retiro: 1, rebalance: 2, venta: 3, correccion: 4, compra: 5};
    return (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9);
  });
  let cash = 0;
  let invested = 0;
  const units = {};
  for (const op of ordered) {
    if (op.kind === 'aporte') {
      cash = money(cash + op.amount);
      invested = money(invested + op.amount);
    } else if (op.kind === 'retiro') {
      cash = money(cash - op.amount);
      invested = money(Math.max(0, invested - op.amount));
    } else if (op.kind === 'compra') {
      cash = money(cash - op.amount);
      units[op.ticker] = (units[op.ticker] || 0) + op.units;
    } else if (op.kind === 'venta') {
      cash = money(cash + op.amount);
      units[op.ticker] = (units[op.ticker] || 0) - op.units;
    } else if (op.kind === 'correccion') {
      cash = money(cash + op.amount);
      if (op.ticker && op.units) units[op.ticker] = (units[op.ticker] || 0) + op.units;
    }
  }
  return {cash, invested, units};
}

export function assertBooksMatchTake(ops, take) {
  const books = booksFromOps(ops);
  assert(books.invested === take.invested, 'El libro no reconstruye el capital aportado.');
  assert(books.cash === take.cash, 'El libro no reconstruye el efectivo.');
  for (const h of take.holdings) {
    assert((books.units[h.ticker] || 0) === h.units, `El libro no reconstruye ${h.ticker}.`);
  }
  return books;
}

export function quotesApiFromService(quotes) {
  if (!quotes) return {getCached: () => null};
  return {getCached: ticker => quotes.getCached(ticker)};
}
