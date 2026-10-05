import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createQuotesService, createDemoAdapter, createYahooAdapter, isMarketOpen, demoCatalogPrices} from '../lib/quotes.mjs';
import {CATALOG_TICKERS} from '../lib/quotes.mjs';

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
