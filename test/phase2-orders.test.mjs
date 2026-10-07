import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {
  createTake, activate, templates, applyAporte, applyRetiro, applyTrade,
  applyTargetWeights, previewTrade, previewRetiro, previewTargetWeights, money, value,
  updateSettings,
} from '../lib/engine.mjs';
import {createApp} from '../server.mjs';
import {recordActivationOps, recordAporteOp, recordRetiroOp, recordTradeOp, booksFromOps, assertBooksMatchTake} from '../lib/ops.mjs';
import {createPendingOrder, confirmPendingOrder, cancelPendingOrder} from '../lib/orders.mjs';
import {QUOTE_CLASSES} from '../lib/quote-eligibility.mjs';

const chatFetcher = async () => ({
  ok: true,
  json: async () => ({
    status: 'completed',
    output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({message: 'ok', proposal: templates[1]})}]}],
    usage: {input_tokens: 1, output_tokens: 1},
  }),
});

function tmp() { return mkdtempSync(join(tmpdir(), 'p2-')); }

function activeTake(amount = 1_024_000) {
  const take = createTake(templates[1]);
  activate(take, amount);
  return take;
}

test('buy/sell support amount and quantity; leftovers stay cash', () => {
  const t = activeTake();
  const ggal = t.holdings.find(h => h.ticker === 'GGAL');
  const byUnits = previewTrade(t, {side: 'compra', ticker: 'GGAL', by: 'units', units: 2});
  assert.equal(byUnits.units, 2);
  assert.equal(byUnits.amount, money(2 * ggal.price));
  const cash = t.cash;
  applyTrade(t, {side: 'compra', ticker: 'GGAL', by: 'units', units: 2});
  assert.equal(ggal.units, byUnits.unitsAfter);
  assert.equal(t.cash, money(cash - byUnits.amount));
  const byAmt = previewTrade(t, {side: 'venta', ticker: 'GGAL', by: 'amount', amount: ggal.price * 2.4});
  assert.equal(byAmt.units, 2);
  assert.ok(byAmt.leftoverAmount > 0);
  applyTrade(t, {side: 'venta', ticker: 'GGAL', by: 'amount', amount: ggal.price * 2.4});
  assert.equal(t.cash, cash);
});

test('trade preview rejects over-cash buy and over-units sell', () => {
  const t = activeTake();
  const h = t.holdings[0];
  assert.throws(() => previewTrade(t, {side: 'compra', ticker: h.ticker, by: 'amount', amount: t.cash + h.price}), /efectivo/);
  assert.throws(() => previewTrade(t, {side: 'venta', ticker: h.ticker, by: 'units', units: h.units + 1}), /unidades/);
  assert.throws(() => previewTrade(t, {side: 'compra', ticker: h.ticker, by: 'amount', amount: h.price * 0.4}), /una unidad/);
});

test('retiro is explicit cash-out; books reconstruct; yield gap unchanged', () => {
  const dir = tmp();
  const store = createStore(dir);
  const take = activeTake();
  recordActivationOps(store, take, {getCached: () => null});
  const gap = money(value(take) - take.invested);
  applyAporte(take, 40_000);
  recordAporteOp(store, take, 40_000, 'ap-1');
  applyRetiro(take, 15_000);
  recordRetiroOp(store, take, 15_000, 'ret-1');
  assert.equal(take.invested, 1_049_000);
  assert.equal(money(value(take) - take.invested), gap);
  assertBooksMatchTake(store.opsForTake(take.id), take);
  assert.throws(() => previewRetiro(take, take.cash + 1), /efectivo/);
  const replay = recordRetiroOp(store, take, 15_000, 'ret-1');
  assert.equal(replay.replay, true);
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('manual trade writes compra/venta without rewriting past ops', () => {
  const dir = tmp();
  const store = createStore(dir);
  const take = activeTake();
  recordActivationOps(store, take, {getCached: () => null});
  const before = store.opsForTake(take.id).map(o => o.id);
  const preview = applyTrade(take, {side: 'compra', ticker: 'KO', by: 'units', units: 1});
  recordTradeOp(store, take, preview, {getCached: () => null}, 'trade-1');
  const after = store.opsForTake(take.id);
  assert.equal(after.filter(o => o.kind === 'compra' && o.meta?.source === 'trade').length, 1);
  assert.ok(before.every(id => after.some(o => o.id === id)));
  assertBooksMatchTake(after, take);
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('weight edit saves targets without moving units or cash', () => {
  const t = activeTake();
  const units = t.holdings.map(h => h.units);
  const cash = t.cash;
  const weights = t.holdings.map(h => ({ticker: h.ticker, weight: h.ticker === 'GGAL' ? 22 : h.ticker === 'KO' ? 23 : h.weight}));
  const preview = previewTargetWeights(t, weights);
  assert.equal(preview.unitsUnchanged, true);
  applyTargetWeights(t, weights);
  assert.deepEqual(t.holdings.map(h => h.units), units);
  assert.equal(t.cash, cash);
  assert.equal(t.holdings.find(h => h.ticker === 'GGAL').weight, 22);
  assert.equal(t.events[0].type, 'weights_updated');
});

test('pending order does not move holdings until confirm', () => {
  const dir = tmp();
  const store = createStore(dir);
  const take = activeTake();
  recordActivationOps(store, take, {getCached: () => null});
  store.putTake(take);
  const cash = take.cash;
  const units = take.holdings.find(h => h.ticker === 'KO').units;
  const created = createPendingOrder(store, take, {kind: 'trade', side: 'compra', ticker: 'KO', by: 'units', units: 1});
  assert.equal(created.order.status, 'pending');
  assert.equal(take.cash, cash);
  assert.equal(take.holdings.find(h => h.ticker === 'KO').units, units);
  assert.equal(store.opsForTake(take.id).filter(o => o.meta?.source === 'trade').length, 0);
  confirmPendingOrder(store, take, created.order.id, {getCached: () => null});
  assert.equal(take.holdings.find(h => h.ticker === 'KO').units, units + 1);
  assert.ok(take.cash < cash);
  assertBooksMatchTake(store.opsForTake(take.id), take);
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('cancel pending leaves books untouched; one pending per take', () => {
  const dir = tmp();
  const store = createStore(dir);
  const take = activeTake();
  recordActivationOps(store, take, {getCached: () => null});
  const snap = {cash: take.cash, invested: take.invested, units: take.holdings.map(h => h.units)};
  const first = createPendingOrder(store, take, {kind: 'aporte', amount: 10_000});
  assert.throws(() => createPendingOrder(store, take, {kind: 'retiro', amount: 1_000}), /pendiente/);
  cancelPendingOrder(store, take, first.order.id);
  assert.equal(take.cash, snap.cash);
  assert.equal(take.invested, snap.invested);
  assert.deepEqual(take.holdings.map(h => h.units), snap.units);
  createPendingOrder(store, take, {kind: 'retiro', amount: 1_000});
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('catalog trade is labeled ineligible; never silent delayed', () => {
  const dir = tmp();
  const store = createStore(dir);
  const take = activeTake();
  recordActivationOps(store, take, {getCached: () => null});
  const preview = applyTrade(take, {side: 'compra', ticker: 'KO', by: 'units', units: 1});
  recordTradeOp(store, take, preview, {getCached: () => null}, 'cat-1');
  const op = store.opsForTake(take.id).find(o => o.meta?.source === 'trade');
  assert.equal(op.quoteClass, QUOTE_CLASSES.catalog);
  assert.equal(op.quoteEligible, false);
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('autopilot stays rejected; IOL is not called by order APIs', async () => {
  const t = activeTake();
  assert.throws(() => updateSettings(t, {...t.settings, mode: 'autopilot'}), /autónoma/);
  const dir = tmp();
  let app;
  const iolCalls = [];
  try {
    app = createApp({
      dataDir: dir, password: 'test-password-only', apiKey: 'test-key', port: 0, host: '127.0.0.1',
      seed: false, quotesLive: false, quotesFixture: true, fetcher: chatFetcher,
      iolFetcher: async url => { iolCalls.push(url); return {ok: true, json: async () => ({})}; },
    });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const login = await fetch(base + '/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password: 'test-password-only'})});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = {Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:' + app.server.address().port};
    const made = await fetch(base + '/api/takes', {method: 'POST', headers, body: JSON.stringify({proposal: templates[1]})});
    const draft = await made.json();
    await fetch(base + `/api/takes/${draft.id}/activate`, {method: 'POST', headers, body: JSON.stringify({amount: 1_024_000})});
    const take = app.store.take(draft.id);
    const preview = await fetch(base + `/api/takes/${draft.id}/orders`, {
      method: 'POST', headers, body: JSON.stringify({kind: 'aporte', amount: 20_000, version: take.version}),
    });
    assert.equal(preview.status, 201);
    const pending = await preview.json();
    assert.equal(pending.order.status, 'pending');
    assert.equal(app.store.take(draft.id).invested, 1_024_000);
    const confirm = await fetch(base + `/api/takes/${draft.id}/orders/${pending.order.id}/confirm`, {
      method: 'POST', headers, body: JSON.stringify({version: take.version}),
    });
    assert.equal(confirm.status, 200);
    const body = await confirm.json();
    assert.equal(body.take.invested, 1_044_000);
    assert.ok(body.ops.some(o => o.kind === 'aporte'));
    const weights = take.holdings.map(h => ({ticker: h.ticker, weight: h.ticker === 'GGAL' ? 22 : h.ticker === 'VALE' ? 18 : h.weight}));
    const current = app.store.take(draft.id);
    const wPrev = await fetch(base + `/api/takes/${draft.id}/orders`, {
      method: 'POST', headers, body: JSON.stringify({kind: 'weights', weights, version: current.version}),
    });
    assert.equal(wPrev.status, 201);
    const wOrder = await wPrev.json();
    const unitsBefore = current.holdings.map(h => h.units);
    const wOk = await fetch(base + `/api/takes/${draft.id}/orders/${wOrder.order.id}/confirm`, {
      method: 'POST', headers, body: JSON.stringify({version: current.version}),
    });
    assert.equal(wOk.status, 200);
    const afterW = app.store.take(draft.id);
    assert.deepEqual(afterW.holdings.map(h => h.units), unitsBefore);
    assert.equal(afterW.holdings.find(h => h.ticker === 'GGAL').weight, 22);
    const tradeTake = app.store.take(draft.id);
    const buy = await fetch(base + `/api/takes/${draft.id}/orders`, {
      method: 'POST', headers, body: JSON.stringify({kind: 'trade', side: 'compra', ticker: 'KO', by: 'amount', amount: tradeTake.holdings.find(h => h.ticker === 'KO').price * 1.8, version: tradeTake.version}),
    });
    assert.equal(buy.status, 201);
    const buyOrder = await buy.json();
    assert.equal(buyOrder.order.preview.units, 1);
    const buyOk = await fetch(base + `/api/takes/${draft.id}/orders/${buyOrder.order.id}/confirm`, {
      method: 'POST', headers, body: JSON.stringify({version: tradeTake.version}),
    });
    assert.equal(buyOk.status, 200);
    assertBooksMatchTake(app.store.opsForTake(draft.id), app.store.take(draft.id));
    const retTake = app.store.take(draft.id);
    const ret = await fetch(base + `/api/takes/${draft.id}/retiro`, {
      method: 'POST', headers: {...headers, 'Idempotency-Key': 'retiro-abc-1'},
      body: JSON.stringify({amount: 5_000, version: retTake.version}),
    });
    assert.equal(ret.status, 200);
    const replay = await fetch(base + `/api/takes/${draft.id}/retiro`, {
      method: 'POST', headers: {...headers, 'Idempotency-Key': 'retiro-abc-1'},
      body: JSON.stringify({amount: 5_000, version: retTake.version}),
    });
    assert.equal(replay.status, 200);
    const settings = await fetch(base + `/api/takes/${draft.id}/settings`, {
      method: 'POST', headers, body: JSON.stringify({...retTake.settings, mode: 'auto', monitoringPaused: false}),
    });
    assert.equal(settings.status, 400);
    assert.equal(iolCalls.length, 0);
    const state = await (await fetch(base + '/api/state', {headers})).json();
    assert.ok(Array.isArray(state.orders));
  } finally {
    await app?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
