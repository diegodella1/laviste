import {randomUUID} from 'node:crypto';
import {money, value} from './engine.mjs';
import {chooseBenchmark, indexScaleForTake, indexLevelAt} from './benchmark.mjs';

export function allRealQuotesReady(quotes, tickers) {
  return tickers.every(t => {
    const q = quotes.getCached(t);
    return q && q.provider !== 'demo' && q.price > 0;
  });
}

/** Set benchmarkBase when it arrives after migration/activation; anchor index at current portfolio value. */
export function tryLazyBenchmarkBase(take, quotes, now = new Date().toISOString()) {
  if (!take.realPricesAt || take.benchmarkBase || !take.benchmarkId || take.phase !== 'active') return false;
  const row = quotes.getBenchmarkCached(take.benchmarkId);
  if (!row?.price) return false;
  take.benchmarkBase = row.price;
  const val = value(take);
  take.indexAnchorValue = val;
  take.history.push({at: now, value: val, benchmark: take.invested, index: val, indexRecorded: true});
  take.history = take.history.slice(-365);
  return true;
}

export function migrateActiveTake(take, quotes, now = new Date().toISOString()) {
  if (take.phase !== 'active' || take.realPricesAt) return {skipped: 'not_eligible'};
  const amount = take.invested;
  for (const h of take.holdings) {
    const q = quotes.getCached(h.ticker);
    if (!q?.price) return {skipped: 'missing_quote', ticker: h.ticker, takeId: take.id};
    h.price = q.price;
    h.referencePrice = q.price;
  }
  const holdings = take.holdings.map(h => ({
    ...h,
    units: Math.floor(amount * h.weight / 100 / h.price),
    entryPrice: h.price,
    referencePrice: h.price,
  }));
  const zero = holdings.filter(h => h.units <= 0).map(h => h.ticker);
  if (zero.length) return {skipped: 'zero_units', takeId: take.id, tickers: zero};
  take.holdings = holdings;
  take.cash = money(amount - holdings.reduce((s, h) => s + h.units * h.price, 0));
  if (!take.benchmarkId) {
    const bench = chooseBenchmark(take.holdings);
    take.benchmarkId = bench.id;
    take.benchmarkLabel = bench.label;
  }
  const benchRow = quotes.getBenchmarkCached(take.benchmarkId);
  take.benchmarkBase = benchRow?.price ?? null;
  take.indexAnchorValue = amount;
  const total = value(take);
  const point = {at: now, value: total, benchmark: amount};
  if (take.benchmarkBase) {
    point.index = amount;
    point.indexRecorded = true;
  }
  take.history = [point];
  take.realPricesAt = now;
  take.events.unshift({
    id: randomUUID(),
    at: now,
    type: 'real_prices',
    title: 'Precios reales activados',
    body: 'La cartera de práctica se rearmó con precios demorados en ARS y unidades enteras. El historial anterior usaba precios ficticios y no se mezcla con esta serie.',
    source: 'Migración de cotizaciones',
    status: take.status,
    verdict: 'none',
    verdictText: 'No necesitás hacer nada',
  });
  take.events = take.events.slice(0, 150);
  return {migrated: true};
}

export function runRealPriceMigration(store, quotes, tickers, now = new Date().toISOString()) {
  if (quotes.isDemo?.()) return {skipped: 'demo'};
  if (!allRealQuotesReady(quotes, tickers)) return {skipped: 'quotes_incomplete'};
  let migrated = 0;
  const migrationSkipped = [];
  store.transaction(() => {
    for (const take of store.takes()) {
      const result = migrateActiveTake(take, quotes, now);
      if (result.migrated) {
        store.putTake(take);
        migrated++;
      } else if (result.skipped && result.skipped !== 'not_eligible') {
        migrationSkipped.push(result);
      }
      if (tryLazyBenchmarkBase(take, quotes, now)) store.putTake(take);
    }
    const prev = store.setting('quotesMeta') || {};
    store.setSetting('quotesMeta', {
      ...prev,
      ...(migrated ? {realQuotesMigration: {at: now, count: migrated}} : {}),
      ...(migrationSkipped.length ? {migrationSkipped} : {migrationSkipped: undefined}),
    });
    if (migrated) store.setSetting('realQuotesMigration', {at: now, count: migrated});
  });
  return {migrated, migrationSkipped};
}

export function indexSnapshotForTake(take, quotes) {
  if (!take.realPricesAt || !take.benchmarkBase || !take.benchmarkId) return null;
  const row = quotes.getBenchmarkCached(take.benchmarkId);
  if (!row?.price) return null;
  const scale = indexScaleForTake(take);
  return indexLevelAt({id: take.benchmarkId}, row.price, take.benchmarkBase, scale);
}
