import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createQuotesService, createDemoAdapter, createYahooAdapter, isMarketOpen, demoCatalogPrices, cacheNeedsBootstrap} from '../lib/quotes.mjs';
import {CATALOG_TICKERS} from '../lib/quotes.mjs';
import {BENCHMARKS} from '../lib/benchmark.mjs';
import {lastSessionCloseIso} from '../lib/quote-time.mjs';

test('demo adapter fills cache and fallback uses second provider', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quotes-'));
  const store = createStore(dir);
  const prices = demoCatalogPrices();
  const primary = {
    name: 'fail',
    async fetchTickers() { throw new Error('down'); },
    async fetchBenchmark() { throw new Error('down'); },
  };
  const fallback = createDemoAdapter(prices);
  const quotes = createQuotesService(store, {primary, fallback: fallback, demo: false});
  await quotes.refresh({force: true});
  const row = quotes.getCached('NVDA');
  assert.ok(row?.price === prices.NVDA);
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('isMarketOpen respects BYMA session window', () => {
  const sunday = new Date('2026-10-04T15:00:00-03:00');
  const tuesday = new Date('2026-10-06T14:30:00-03:00');
  const tuesdayNight = new Date('2026-10-06T18:30:00-03:00');
  assert.equal(isMarketOpen(sunday), false);
  assert.equal(isMarketOpen(tuesday), true);
  assert.equal(isMarketOpen(tuesdayNight), false);
});

test('demo refresh populates sqlite cache', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quotes-'));
  const store = createStore(dir);
  const quotes = createQuotesService(store, {demo: true, demoPrices: demoCatalogPrices()});
  await quotes.refresh({force: true});
  assert.ok(quotes.getCached('YPF'));
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('yahoo adapter parses chart meta', async () => {
  const adapter = createYahooAdapter(async () => ({
    ok: true,
    json: async () => ({chart: {result: [{meta: {regularMarketPrice: 1234}}]}}),
  }));
  const map = await adapter.fetchTickers(['NVDA']);
  assert.equal(map.get('NVDA').price, 1234);
});

test('catalog tickers cover engine catalog', () => {
  assert.equal(CATALOG_TICKERS.length, 16);
});

function closedMarketQuotes(store, {primary, onFetch} = {}) {
  const prices = demoCatalogPrices();
  const asOf = lastSessionCloseIso(new Date('2026-10-06T20:25:00-03:00'));
  let fetchCalls = 0;
  const mockPrimary = primary || {
    name: 'mock',
    async fetchTickers(tickers) {
      fetchCalls++;
      onFetch?.();
      const out = new Map();
      for (const t of tickers) out.set(t, {ticker: t, price: prices[t], asOf, provider: 'data912', stale: false, available: true});
      return out;
    },
    async fetchBenchmark(b) {
      return {id: b.id, price: b.id === 'MERV' ? 2_000_000 : 50_000, asOf, stale: false};
    },
  };
  const quotes = createQuotesService(store, {
    primary: mockPrimary,
    fallback: {name: 'noop', async fetchTickers() { return new Map(); }, async fetchBenchmark() { throw new Error(); }},
    marketOpen: () => false,
  });
  return {quotes, getFetchCalls: () => fetchCalls};
}

test('empty cache with closed market runs one bootstrap fetch then stops', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quotes-'));
  const store = createStore(dir);
  assert.equal(cacheNeedsBootstrap(store), true);
  const {quotes, getFetchCalls} = closedMarketQuotes(store);

  const first = await quotes.refresh();
  assert.equal(first.ok, true);
  assert.equal(first.bootstrap, true);
  assert.equal(getFetchCalls(), 1);
  assert.ok(quotes.getCached('NVDA')?.stale);
  assert.equal(cacheNeedsBootstrap(store), false);

  const second = await quotes.refresh();
  assert.equal(second.skipped, 'closed');
  assert.equal(getFetchCalls(), 1);

  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('populated cache with closed market does not fetch', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quotes-'));
  const store = createStore(dir);
  const asOf = lastSessionCloseIso(new Date('2026-10-06T20:25:00-03:00'));
  const prices = demoCatalogPrices();
  for (const [ticker, price] of Object.entries(prices)) {
    store.db.prepare('INSERT INTO quote_cache VALUES (?,?,?,?,?)').run(ticker, price, asOf, 'data912', 1);
  }
  for (const bench of Object.values(BENCHMARKS)) {
    store.db.prepare('INSERT INTO benchmark_cache VALUES (?,?,?,?)').run(bench.id, 1, asOf, 1);
  }
  assert.equal(cacheNeedsBootstrap(store), false);
  const {quotes, getFetchCalls} = closedMarketQuotes(store);

  const result = await quotes.refresh();
  assert.equal(result.skipped, 'closed');
  assert.equal(getFetchCalls(), 0);

  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('bootstrap failure applies backoff before retry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quotes-'));
  const store = createStore(dir);
  let fetchCalls = 0;
  const {quotes, getFetchCalls} = closedMarketQuotes(store, {
    primary: {
      name: 'fail',
      async fetchTickers() {
        fetchCalls++;
        throw new Error('network');
      },
      async fetchBenchmark() { throw new Error('network'); },
    },
  });
  const calls = () => fetchCalls || getFetchCalls();

  await quotes.refresh().catch(() => {});
  assert.equal(calls(), 1);
  const retry = await quotes.refresh();
  assert.equal(retry.skipped, 'backoff');
  assert.equal(calls(), 1);

  store.close();
  rmSync(dir, {recursive: true, force: true});
});
