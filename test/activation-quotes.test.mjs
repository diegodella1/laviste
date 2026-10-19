import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {templates} from '../lib/engine.mjs';
import {demoCatalogPrices, CATALOG_TICKERS} from '../lib/quotes.mjs';
import {BENCHMARKS} from '../lib/benchmark.mjs';
import {prepareHoldingsQuotesForActivation, tryStampRealPricesAtActivation, runRealPriceMigration} from '../lib/quote-migration.mjs';

const chatFetcher = async () => ({
  ok: true,
  json: async () => ({
    status: 'completed',
    output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({message: 'ok', proposal: templates[0]})}]}],
    usage: {input_tokens: 1, output_tokens: 1},
  }),
});

function emptyQuotesPrimary() {
  return {
    name: 'empty',
    async fetchTickers() { return new Map(); },
    async fetchBenchmark() { throw new Error('no benchmark'); },
  };
}

async function login(base) {
  const login = await fetch(base + '/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'diego@diegodella.ar', password: 'test-password-only'}),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  return {Cookie: cookie, 'Content-Type': 'application/json'};
}

test('activation with empty quote cache does not stamp realPricesAt; refresh migrates later', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'act-empty-'));
  let app;
  try {
    app = createApp({
      dataDir: dir,
      password: 'test-password-only',
      apiKey: 'test-key',
      port: 0,
      host: '127.0.0.1',
      seed: false,
      quotesLive: false,
      quotesPrimary: emptyQuotesPrimary(),
      quotesFallback: emptyQuotesPrimary(),
      fetcher: chatFetcher,
    });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const headers = await login(base);
    const make = await fetch(base + '/api/takes', {method: 'POST', headers, body: JSON.stringify({proposal: templates[1]})});
    const draft = await make.json();
    const act = await fetch(base + `/api/takes/${draft.id}/activate`, {method: 'POST', headers, body: JSON.stringify({amount: 1_024_000})});
    assert.equal(act.status, 200);
    const take = await act.json();
    assert.equal(take.phase, 'active');
    assert.equal(take.realPricesAt, undefined);

    const prices = demoCatalogPrices();
    const asOf = new Date().toISOString();
    for (const [ticker, price] of Object.entries(prices)) {
      app.store.db.prepare('INSERT INTO quote_cache VALUES (?,?,?,?,?)').run(ticker, price, asOf, 'data912', 0);
    }
    app.store.db.prepare('INSERT INTO benchmark_cache VALUES (?,?,?,?)').run(BENCHMARKS.MERV.id, 2_000_000, asOf, 0);
    app.store.db.prepare('INSERT INTO benchmark_cache VALUES (?,?,?,?)').run(BENCHMARKS.SPY_AR.id, 50_000, asOf, 0);
    runRealPriceMigration(app.store, app.quotes, CATALOG_TICKERS);
    const migrated = app.store.take(draft.id);
    assert.ok(migrated.realPricesAt);
    assert.equal(migrated.events.find(e => e.type === 'real_prices')?.title, 'Precios reales activados');
    assert.ok(migrated.holdings.every(h => h.entryPrice === h.price && h.referencePrice === h.price));
    const second = runRealPriceMigration(app.store, app.quotes, CATALOG_TICKERS);
    assert.equal(second.migrated, 0);
  } finally {
    await app?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('activation with full quote cache stamps realPricesAt at activation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'act-full-'));
  let app;
  try {
    app = createApp({
      dataDir: dir,
      password: 'test-password-only',
      apiKey: 'test-key',
      port: 0,
      host: '127.0.0.1',
      seed: false,
      quotesLive: false,
      quotesFixture: true,
      fetcher: chatFetcher,
    });
    await app.quotes.refresh({force: true});
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const headers = await login(base);
    const make = await fetch(base + '/api/takes', {method: 'POST', headers, body: JSON.stringify({proposal: templates[1]})});
    const draft = await make.json();
    const act = await fetch(base + `/api/takes/${draft.id}/activate`, {method: 'POST', headers, body: JSON.stringify({amount: 1_024_000})});
    const take = await act.json();
    assert.ok(take.realPricesAt);
    assert.equal(take.realPricesAt, take.activatedAt);
    assert.ok(take.history[0].indexRecorded);
    assert.equal(runRealPriceMigration(app.store, app.quotes, CATALOG_TICKERS).migrated, 0);
  } finally {
    await app?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('partial quote cache at activation does not stamp or mix cached prices into holdings', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'act-partial-'));
  const prices = demoCatalogPrices();
  const asOf = new Date().toISOString();
  const store = (await import('../lib/store.mjs')).createStore(dir);
  store.db.prepare('INSERT INTO quote_cache VALUES (?,?,?,?,?)').run('YPF', 99_999, asOf, 'data912', 0);
  store.db.prepare('INSERT INTO benchmark_cache VALUES (?,?,?,?)').run(BENCHMARKS.MERV.id, 2_000_000, asOf, 0);
  store.close();

  let app;
  try {
    app = createApp({
      dataDir: dir,
      password: 'test-password-only',
      apiKey: 'test-key',
      port: 0,
      host: '127.0.0.1',
      seed: false,
      quotesLive: false,
      quotesPrimary: emptyQuotesPrimary(),
      quotesFallback: emptyQuotesPrimary(),
      fetcher: chatFetcher,
    });
    const quotesApi = {getCached: t => app.quotes.getCached(t), getBenchmarkCached: id => app.quotes.getBenchmarkCached(id), isDemo: () => false};
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const headers = await login(base);
    const make = await fetch(base + '/api/takes', {method: 'POST', headers, body: JSON.stringify({proposal: templates[0]})});
    const draft = await make.json();
    const before = app.store.take(draft.id);
    const catalogYpf = prices.YPF;
    assert.equal(prepareHoldingsQuotesForActivation(before, quotesApi), false);
    const act = await fetch(base + `/api/takes/${draft.id}/activate`, {method: 'POST', headers, body: JSON.stringify({amount: 1_024_000})});
    const take = await act.json();
    assert.equal(take.realPricesAt, undefined);
    assert.equal(take.holdings.find(h => h.ticker === 'YPF').price, catalogYpf);
  } finally {
    await app?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('prepare/stamp helpers require benchmark cache when stamping', () => {
  const prices = demoCatalogPrices();
  const tickers = ['GGAL', 'AMD'];
  const holdings = tickers.map(t => ({ticker: t, weight: 40, price: prices[t], referencePrice: prices[t], units: 0, reason: 'x'}));
  const quotes = {
    isDemo: () => false,
    getCached: t => ({ticker: t, price: prices[t], provider: 'data912'}),
    getBenchmarkCached: () => null,
  };
  const take = {holdings, invested: 0, activatedAt: new Date().toISOString(), benchmarkId: BENCHMARKS.MERV.id, benchmarkBase: null, history: [{at: 'x', value: 1, benchmark: 1}]};
  assert.equal(prepareHoldingsQuotesForActivation(take, quotes), true);
  take.invested = 1_000_000;
  assert.equal(tryStampRealPricesAtActivation(take, quotes), false);
  assert.equal(take.realPricesAt, undefined);
});
