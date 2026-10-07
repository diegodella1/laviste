/** Preview → pending → confirm. Holdings move only on confirm. Practice only — no broker. */

import {createHash, randomUUID} from 'node:crypto';
import {assert} from './engine.mjs';
import {
  previewAporte, applyAporte, previewRetiro, applyRetiro,
  previewTrade, applyTrade, previewTargetWeights, applyTargetWeights,
} from './engine.mjs';
import {recordAporteOp, recordRetiroOp, recordTradeOp} from './ops.mjs';

export const ORDER_KINDS = Object.freeze(['trade', 'aporte', 'retiro', 'weights']);

const fingerprintOf = payload => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

export function normalizeIntent(data) {
  const kind = data?.kind;
  assert(ORDER_KINDS.includes(kind), 'Tipo de orden inválido.');
  if (kind === 'aporte' || kind === 'retiro') return {kind, amount: data.amount};
  if (kind === 'trade') {
    return {kind, side: data.side, ticker: data.ticker, by: data.by, units: data.units ?? null, amount: data.amount ?? null};
  }
  return {kind, weights: data.weights};
}

export function previewIntent(take, intent) {
  const n = normalizeIntent(intent);
  if (n.kind === 'aporte') return previewAporte(take, n.amount);
  if (n.kind === 'retiro') return previewRetiro(take, n.amount);
  if (n.kind === 'trade') return previewTrade(take, n);
  return previewTargetWeights(take, n.weights);
}

function previewFingerprint(preview) {
  if (preview.kind === 'trade') {
    return fingerprintOf({kind: 'trade', side: preview.side, ticker: preview.ticker, units: preview.units, amount: preview.amount, price: preview.price});
  }
  if (preview.kind === 'aporte' || preview.kind === 'retiro') {
    return fingerprintOf({kind: preview.kind, amount: preview.amount, cashAfter: preview.cashAfter, investedAfter: preview.investedAfter});
  }
  return fingerprintOf({kind: 'weights', holdings: preview.holdings.map(h => ({ticker: h.ticker, weight: h.weight}))});
}

function applyIntent(take, intent, now) {
  const n = normalizeIntent(intent);
  if (n.kind === 'aporte') return {preview: previewAporte(take, n.amount), applied: applyAporte(take, n.amount, now)};
  if (n.kind === 'retiro') return {preview: previewRetiro(take, n.amount), applied: applyRetiro(take, n.amount, now)};
  if (n.kind === 'trade') return {preview: applyTrade(take, n, now)};
  return {preview: applyTargetWeights(take, n.weights, now)};
}

function writeLedger(store, take, preview, quotes, idempotencyKey) {
  if (preview.kind === 'aporte') return recordAporteOp(store, take, preview.amount, idempotencyKey);
  if (preview.kind === 'retiro') return recordRetiroOp(store, take, preview.amount, idempotencyKey);
  if (preview.kind === 'trade') return recordTradeOp(store, take, preview, quotes, idempotencyKey);
  return {ops: [], replay: false};
}

export function createPendingOrder(store, take, data, idempotencyKey = null) {
  assert(take.phase === 'active', 'Solo podés armar órdenes en una práctica activa.', 409);
  const intent = normalizeIntent(data);
  const preview = previewIntent(take, intent);
  const fingerprint = fingerprintOf({intent, preview: previewFingerprint(preview), version: take.version});
  if (idempotencyKey) {
    const replayed = store.orderByIdempotency(idempotencyKey);
    if (replayed) {
      assert(replayed.fingerprint === fingerprint, 'La orden ya existe con otros datos.', 409);
      return {replay: true, order: replayed};
    }
  }
  const existing = store.pendingOrderForTake(take.id);
  assert(!existing, 'Ya hay una orden pendiente. Confirmala o cancelala.', 409);
  const now = new Date().toISOString();
  const order = {
    id: randomUUID(), takeId: take.id, kind: intent.kind, status: 'pending',
    takeVersion: take.version || 1, payload: intent, preview, fingerprint,
    idempotencyKey: idempotencyKey || null, createdAt: now, confirmedAt: null, cancelledAt: null,
  };
  store.insertOrder(order);
  return {replay: false, order};
}

export function confirmPendingOrder(store, take, orderId, quotes, idempotencyKey = null) {
  const order = store.order(orderId);
  assert(order && order.takeId === take.id, 'No encontramos esa orden.', 404);
  if (order.status === 'confirmed') return {replay: true, order, take, ops: []};
  assert(order.status === 'pending', 'Esa orden ya no está pendiente.', 409);
  assert(take.phase === 'active', 'Solo podés confirmar en una práctica activa.', 409);
  assert((take.version || 1) === order.takeVersion, 'La tesis cambió. Actualizá la vista e intentá de nuevo.', 409);
  const fresh = previewIntent(take, order.payload);
  assert(previewFingerprint(fresh) === previewFingerprint(order.preview), 'La vista previa ya no coincide. Armala de nuevo.', 409);
  const now = new Date().toISOString();
  const {preview} = applyIntent(take, order.payload, now);
  const recorded = writeLedger(store, take, preview, quotes, idempotencyKey || `confirm:${order.id}`);
  order.status = 'confirmed';
  order.confirmedAt = now;
  store.updateOrder(order);
  return {replay: false, order, take, ops: recorded.ops || [], preview};
}

export function cancelPendingOrder(store, take, orderId) {
  const order = store.order(orderId);
  assert(order && order.takeId === take.id, 'No encontramos esa orden.', 404);
  assert(order.status === 'pending', 'Esa orden ya no está pendiente.', 409);
  order.status = 'cancelled';
  order.cancelledAt = new Date().toISOString();
  store.updateOrder(order);
  return {order};
}
