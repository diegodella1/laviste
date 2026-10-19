import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createStore} from '../lib/store.mjs';
import {SCHEMA_USER_VERSION} from '../lib/migrations/multiuser.mjs';
import {createTake, activate, templates, applyAporte, applyCorrection, rebalanceToTarget, money, value} from '../lib/engine.mjs';
import {createApp} from '../server.mjs';
import {demoCatalogPrices, CATALOG_TICKERS} from '../lib/quotes.mjs';
import {runRealPriceMigration} from '../lib/quote-migration.mjs';
import {BENCHMARKS} from '../lib/benchmark.mjs';
import {
  recordActivationOps, recordRebalanceOps, recordAporteOp, recordCorreccionOp,
  booksFromOps, assertBooksMatchTake,
} from '../lib/ops.mjs';
import {QUOTE_CLASSES} from '../lib/quote-eligibility.mjs';

const chatFetcher = async () => ({
  ok: true,
  json: async () => ({
    status: 'completed',
    output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({message: 'ok', proposal: templates[1]})}]}],
    usage: {input_tokens: 1, output_tokens: 1},
  }),
});

function tmp() { return mkdtempSync(join(tmpdir(), 'ops-')); }

function delayedQuotes(prices = demoCatalogPrices(), asOf = '2026-10-06T17:00:00.000Z') {
  return {
    getCached(ticker) {
      const price = prices[ticker];
      if (!(price > 0)) return null;
      return {ticker, price, asOf, provider: 'data912', stale: false, available: true, quoteClass: 'delayed', eligible: true};
    },
  };
}

test('new store is ledger schema v11 and does not invent ops for legacy takes', () => {
  const dir = tmp();
  const db = new DatabaseSync(join(dir, 'tesis.sqlite'));
  const take = createTake(templates[1]);
  activate(take, 1_024_000);
  db.exec('CREATE TABLE takes(id TEXT PRIMARY KEY, data TEXT NOT NULL); PRAGMA user_version=5;');
  db.prepare('INSERT INTO takes VALUES (?,?)').run(take.id, JSON.stringify(take));
  db.close();

  const store = createStore(dir);
  assert.equal(store.userVersion(), SCHEMA_USER_VERSION);
  assert.equal(store.opsForTake(take.id).length, 0);
  assert.equal(store.ordersForTake(take.id).length, 0);
  assert.equal(store.take(take.id).invested, 1_024_000);
  assert.ok(store.take(take.id).events.some(e => e.type === 'activation'));
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('reopening a store does not backfill ops from holdings or events', () => {
  const dir = tmp();
  let store = createStore(dir);
  const take = createTake(templates[0]);
  activate(take, 1_000_000);
  store.putTake(take);
  store.close();
  store = createStore(dir);
  assert.equal(store.opsForTake(take.id).length, 0);
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('activation ops reconstruct cash, units and invested; replay is idempotent', () => {
  const dir = tmp();
  const store = createStore(dir);
  const take = createTake(templates[1]);
  const quotes = delayedQuotes();
  for (const h of take.holdings) {
    const q = quotes.getCached(h.ticker);
    h.price = q.price;
    h.referencePrice = q.price;
  }
  activate(take, 1_024_000);
  const first = recordActivationOps(store, take, quotes);
  assert.equal(first.replay, false);
  assert.ok(first.ops.some(o => o.kind === 'aporte'));
  assert.ok(first.ops.filter(o => o.kind === 'compra').length >= 2);
  assert.ok(first.ops.filter(o => o.kind === 'compra').every(o => o.quoteClass === QUOTE_CLASSES.delayed && o.quoteEligible));
  assertBooksMatchTake(store.opsForTake(take.id), take);
  const second = recordActivationOps(store, take, quotes);
  assert.equal(second.replay, true);
  assert.equal(store.opsForTake(take.id).length, first.ops.length);
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('catalog activation is labeled ineligible; never silent delayed', () => {
  const dir = tmp();
  const store = createStore(dir);
  const take = createTake(templates[0]);
  activate(take, 1_000_000);
  recordActivationOps(store, take, {getCached: () => null});
  const ops = store.opsForTake(take.id);
  const compras = ops.filter(o => o.kind === 'compra');
  assert.ok(compras.length);
  assert.ok(compras.every(o => o.quoteClass === QUOTE_CLASSES.catalog && o.quoteEligible === false && o.quoteProvider === 'catalog'));
  assertBooksMatchTake(ops, take);
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('aporte increases capital without counting as yield; books still match', () => {
  const dir = tmp();
  const store = createStore(dir);
  const take = createTake(templates[1]);
  activate(take, 1_024_000);
  recordActivationOps(store, take, {getCached: () => null});
  const gap = money(value(take) - take.invested);
  applyAporte(take, 50_000);
  recordAporteOp(store, take, 50_000, 'aporte-1');
  assert.equal(money(value(take) - take.invested), gap);
  assert.equal(take.invested, 1_074_000);
  assertBooksMatchTake(store.opsForTake(take.id), take);
  const replay = recordAporteOp(store, take, 50_000, 'aporte-1');
  assert.equal(replay.replay, true);
  assert.equal(store.opsForTake(take.id).filter(o => o.kind === 'aporte').length, 2);
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('rebalance writes venta/compra children; reconstruction matches units and cash', () => {
  const dir = tmp();
  const store = createStore(dir);
  const take = createTake(templates[1]);
  activate(take, 1_024_000);
  recordActivationOps(store, take, {getCached: () => null});
  const ggal = take.holdings.find(h => h.ticker === 'GGAL');
  ggal.price = money(ggal.price * 1.4);
  const version = take.version || 1;
  const result = rebalanceToTarget(take);
  recordRebalanceOps(store, take, result, {getCached: () => null}, version);
  const ops = store.opsForTake(take.id);
  assert.ok(ops.some(o => o.kind === 'rebalance'));
  assert.ok(ops.some(o => o.kind === 'compra' || o.kind === 'venta'));
  assertBooksMatchTake(ops, take);
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('corrección is explicit and does not rewrite prior ops', () => {
  const dir = tmp();
  const store = createStore(dir);
  const take = createTake(templates[1]);
  activate(take, 1_024_000);
  recordActivationOps(store, take, {getCached: () => null});
  const before = store.opsForTake(take.id).map(o => ({id: o.id, price: o.price, amount: o.amount, kind: o.kind}));
  const ticker = take.holdings[0].ticker;
  applyCorrection(take, {ticker, unitsDelta: -1, cashDelta: take.holdings[0].price});
  recordCorreccionOp(store, take, {ticker, unitsDelta: -1, cashDelta: take.holdings[0].price, note: 'Ajuste de unidades', idempotencyKey: 'corr-1'});
  const after = store.opsForTake(take.id);
  assert.equal(after.filter(o => o.kind === 'correccion').length, 1);
  assert.deepEqual(after.filter(o => o.kind !== 'correccion').map(o => ({id: o.id, price: o.price, amount: o.amount, kind: o.kind})), before);
  assertBooksMatchTake(after, take);
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('quote refresh and real-price migration do not rewrite past ops', async () => {
  const dir = tmp();
  const store = createStore(dir);
  const take = createTake(templates[1]);
  activate(take, 1_024_000);
  recordActivationOps(store, take, {getCached: () => null});
  const frozen = store.opsForTake(take.id).map(o => ({id: o.id, price: o.price, quoteClass: o.quoteClass, amount: o.amount}));
  const asOf = new Date().toISOString();
  const prices = demoCatalogPrices();
  for (const [ticker, price] of Object.entries(prices)) {
    store.db.prepare('INSERT INTO quote_cache VALUES (?,?,?,?,?)').run(ticker, price * 2, asOf, 'data912', 0);
  }
  store.db.prepare('INSERT INTO benchmark_cache VALUES (?,?,?,?)').run(BENCHMARKS.MERV.id, 2_000_000, asOf, 0);
  store.db.prepare('INSERT INTO benchmark_cache VALUES (?,?,?,?)').run(BENCHMARKS.SPY_AR.id, 50_000, asOf, 0);
  store.putTake(take);
  const quotes = {getCached: t => ({ticker: t, price: prices[t] * 2, asOf, provider: 'data912', stale: false}), getBenchmarkCached: id => store.db.prepare('SELECT price, as_of, stale FROM benchmark_cache WHERE id=?').get(id), isDemo: () => false};
  runRealPriceMigration(store, quotes, CATALOG_TICKERS);
  const later = store.opsForTake(take.id);
  assert.deepEqual(later.map(o => ({id: o.id, price: o.price, quoteClass: o.quoteClass, amount: o.amount})), frozen);
  assert.ok(later.filter(o => o.kind === 'compra').every(o => o.quoteClass === QUOTE_CLASSES.catalog));
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('API activate/aporte/rebalance/correccion persist ops with idempotency', async () => {
  const dir = tmp();
  let app;
  try {
    app = createApp({
      dataDir: dir, password: 'test-password-only', apiKey: 'test-key', port: 0, host: '127.0.0.1',
      seed: false, quotesLive: false, quotesFixture: true, fetcher: chatFetcher,
    });
    await app.quotes.refresh({force: true});
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const login = await fetch(base + '/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password: 'test-password-only'})});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = {Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:' + app.server.address().port};
    const made = await fetch(base + '/api/takes', {method: 'POST', headers, body: JSON.stringify({proposal: templates[1]})});
    const draft = await made.json();
    const act = await fetch(base + `/api/takes/${draft.id}/activate`, {method: 'POST', headers, body: JSON.stringify({amount: 1_024_000})});
    assert.equal(act.status, 200);
    const listed = await (await fetch(base + `/api/takes/${draft.id}/ops`, {headers})).json();
    assert.ok(listed.some(o => o.kind === 'aporte'));
    assert.ok(listed.filter(o => o.kind === 'compra').every(o => o.quoteEligible === true));
    const take = app.store.take(draft.id);
    const ggal = take.holdings.find(h => h.ticker === 'GGAL');
    ggal.price = money(ggal.price * 1.5);
    take.version += 1;
    app.store.putTake(take);
    const fresh = app.store.take(draft.id);
    const reb = await fetch(base + `/api/takes/${draft.id}/rebalance`, {method: 'POST', headers, body: JSON.stringify({version: fresh.version})});
    assert.equal(reb.status, 200);
    const afterReb = app.store.take(draft.id);
    const aporte = await fetch(base + `/api/takes/${draft.id}/aporte`, {
      method: 'POST',
      headers: {...headers, 'Idempotency-Key': 'aporte-abc-1'},
      body: JSON.stringify({amount: 25_000, version: afterReb.version}),
    });
    assert.equal(aporte.status, 200);
    const body = await aporte.json();
    const invested = body.take.invested;
    const replay = await fetch(base + `/api/takes/${draft.id}/aporte`, {
      method: 'POST',
      headers: {...headers, 'Idempotency-Key': 'aporte-abc-1'},
      body: JSON.stringify({amount: 25_000, version: afterReb.version}),
    });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).take.invested, invested);
    const clash = await fetch(base + `/api/takes/${draft.id}/aporte`, {
      method: 'POST',
      headers: {...headers, 'Idempotency-Key': 'aporte-abc-1'},
      body: JSON.stringify({amount: 40_000, version: afterReb.version}),
    });
    assert.equal(clash.status, 409);
    const current = app.store.take(draft.id);
    const corr = await fetch(base + `/api/takes/${draft.id}/correccion`, {
      method: 'POST',
      headers: {...headers, 'Idempotency-Key': 'corr-abc-1'},
      body: JSON.stringify({version: current.version, cashDelta: 0, ticker: 'KO', unitsDelta: 0, note: 'sin efecto'}),
    });
    assert.equal(corr.status, 400);
    const okCorr = await fetch(base + `/api/takes/${draft.id}/correccion`, {
      method: 'POST',
      headers: {...headers, 'Idempotency-Key': 'corr-abc-2'},
      body: JSON.stringify({version: current.version, cashDelta: 100, ticker: null, unitsDelta: 0, note: 'Ajuste de caja'}),
    });
    assert.equal(okCorr.status, 200);
    const ops = app.store.opsForTake(draft.id);
    assertBooksMatchTake(ops, app.store.take(draft.id));
    const exported = await (await fetch(base + '/api/export', {headers})).json();
    assert.equal(exported.version, 4);
    assert.ok(exported.ops.length >= ops.length);
    assert.ok(Array.isArray(exported.orders));
    const qs = await (await fetch(base + '/api/quotes/status', {headers})).json();
    assert.ok(qs.eligibleCount > 0);
    assert.equal(qs.demo, false);
  } finally {
    await app?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
