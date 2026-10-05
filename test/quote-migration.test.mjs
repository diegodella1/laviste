import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {createQuotesService, demoCatalogPrices} from '../lib/quotes.mjs';
import {runRealPriceMigration, migrateActiveTake} from '../lib/quote-migration.mjs';

test('migration rebuilds units at real prices and is idempotent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-'));
  const store = createStore(dir);
  const take = createTake(templates[1]);
  activate(take, 1_024_000);
  take.holdings[0].price = 999;
  store.putTake(take);

  const quotes = createQuotesService(store, {demo: false, primary: {
    name: 'mock',
    async fetchTickers(tickers) {
      const prices = demoCatalogPrices();
      const fetchedAt = new Date('2026-10-06T14:30:00-03:00');
      const out = new Map();
      for (const t of tickers) out.set(t, {ticker: t, price: prices[t], asOf: fetchedAt.toISOString(), provider: 'data912', stale: false, available: true});
      return out;
    },
    async fetchBenchmark(b) {
      return {id: b.id, price: 2_000_000, asOf: new Date('2026-10-06T14:30:00-03:00').toISOString(), stale: false};
    },
  }, fallback: {name: 'noop', async fetchTickers() { return new Map(); }, async fetchBenchmark() { throw new Error(); }}});

  await quotes.refresh({force: true});
  const first = runRealPriceMigration(store, quotes, Object.keys(demoCatalogPrices()));
  assert.equal(first.migrated ?? 0, 0);
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
