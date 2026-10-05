import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates, value} from '../lib/engine.mjs';
import {createQuotesService, demoCatalogPrices} from '../lib/quotes.mjs';
import {runRealPriceMigration, tryLazyBenchmarkBase, migrateActiveTake} from '../lib/quote-migration.mjs';
import {BENCHMARKS} from '../lib/benchmark.mjs';

function mockQuotes(store, {benchmark = true} = {}) {
  return createQuotesService(store, {demo: false, primary: {
    name: 'mock',
    async fetchTickers(tickers) {
      const prices = demoCatalogPrices();
      const fetchedAt = new Date('2026-10-06T14:30:00-03:00');
      const out = new Map();
      for (const t of tickers) out.set(t, {ticker: t, price: prices[t], asOf: fetchedAt.toISOString(), provider: 'data912', stale: false, available: true});
      return out;
    },
    async fetchBenchmark(b) {
      if (!benchmark) throw new Error('benchmark down');
      return {id: b.id, price: 2_000_000, asOf: new Date('2026-10-06T14:30:00-03:00').toISOString(), stale: false};
    },
  }, fallback: {name: 'noop', async fetchTickers() { return new Map(); }, async fetchBenchmark() { throw new Error(); }}});
}

test('migration rebuilds units at real prices and is idempotent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-'));
  const store = createStore(dir);
  const take = createTake(templates[1]);
  activate(take, 1_024_000);
  take.holdings[0].price = 999;
  store.putTake(take);

  const quotes = mockQuotes(store);
  await quotes.refresh({force: true});
  const updated = store.take(take.id);
  assert.ok(updated.realPricesAt);
  assert.ok(updated.history[0].indexRecorded);
  assert.equal(updated.events[0].title, 'Precios reales activados');
  assert.ok(updated.holdings.every(h => h.price !== 999));

  const second = runRealPriceMigration(store, quotes, Object.keys(demoCatalogPrices()));
  assert.equal(second.migrated, 0);

  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('lazy benchmarkBase anchors index at portfolio value when Yahoo was down at migration', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-'));
  const store = createStore(dir);
  const take = createTake(templates[1]);
  activate(take, 1_024_000);
  store.putTake(take);

  const quotes = mockQuotes(store, {benchmark: false});
  await quotes.refresh({force: true});
  const migrated = store.take(take.id);
  assert.ok(migrated.realPricesAt);
  assert.equal(migrated.benchmarkBase, null);
  assert.equal(migrated.history[0].indexRecorded, undefined);

  store.db.prepare('INSERT INTO benchmark_cache VALUES (?,?,?,?)').run(BENCHMARKS.MERV.id, 2_100_000, new Date().toISOString(), 0);
  const api = {getCached: t => quotes.getCached(t), getBenchmarkCached: id => quotes.getBenchmarkCached(id), isDemo: () => false};
  assert.ok(tryLazyBenchmarkBase(migrated, api));
  assert.equal(migrated.benchmarkBase, 2_100_000);
  const anchor = migrated.history.at(-1);
  assert.ok(anchor.indexRecorded);
  assert.equal(anchor.index, value(migrated));

  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('zero-unit migration skip is recorded in quotesMeta', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-'));
  const store = createStore(dir);
  const take = createTake(templates[1]);
  activate(take, 100_000);
  store.putTake(take);

  const quotes = mockQuotes(store);
  const prices = demoCatalogPrices();
  const asOf = new Date().toISOString();
  for (const [ticker, price] of Object.entries(prices)) {
    store.db.prepare('INSERT INTO quote_cache VALUES (?,?,?,?,?)').run(ticker, price, asOf, 'data912', 0);
  }
  store.db.prepare('UPDATE quote_cache SET price=? WHERE ticker=?').run(999_999, 'VIST');
  const result = runRealPriceMigration(store, quotes, Object.keys(prices));
  assert.equal(result.migrated, 0);
  assert.ok(result.migrationSkipped.some(s => s.skipped === 'zero_units'));
  const meta = store.setting('quotesMeta');
  assert.ok(meta.migrationSkipped?.length);

  store.close();
  rmSync(dir, {recursive: true, force: true});
});
