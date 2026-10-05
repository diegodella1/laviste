import {randomUUID} from 'node:crypto';
import {money, value} from './engine.mjs';
import {chooseBenchmark} from './benchmark.mjs';

export function allRealQuotesReady(quotes, tickers) {
  return tickers.every(t => {
    const q = quotes.getCached(t);
    return q && q.provider !== 'demo' && q.price > 0;
  });
}

export function migrateActiveTake(take, quotes, now = new Date().toISOString()) {
  if (take.phase !== 'active' || take.realPricesAt) return false;
  const amount = take.invested;
  for (const h of take.holdings) {
    const q = quotes.getCached(h.ticker);
    if (!q?.price) return false;
    h.price = q.price;
    h.referencePrice = q.price;
  }
  const holdings = take.holdings.map(h => ({
    ...h,
    units: Math.floor(amount * h.weight / 100 / h.price),
    entryPrice: h.price,
    referencePrice: h.price,
  }));
  if (!holdings.every(h => h.units > 0)) return false;
  take.holdings = holdings;
  take.cash = money(amount - holdings.reduce((s, h) => s + h.units * h.price, 0));
  if (!take.benchmarkId) {
    const bench = chooseBenchmark(take.holdings);
    take.benchmarkId = bench.id;
    take.benchmarkLabel = bench.label;
  }
  const benchRow = quotes.getBenchmarkCached(take.benchmarkId);
  take.benchmarkBase = benchRow?.price ?? null;
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
  return true;
}

export function runRealPriceMigration(store, quotes, tickers, now = new Date().toISOString()) {
  if (quotes.isDemo?.()) return {skipped: 'demo'};
  if (!allRealQuotesReady(quotes, tickers)) return {skipped: 'quotes_incomplete'};
  let migrated = 0;
  store.transaction(() => {
    for (const take of store.takes()) {
      if (migrateActiveTake(take, quotes, now)) {
        store.putTake(take);
        migrated++;
      }
    }
    if (migrated) store.setSetting('realQuotesMigration', {at: now, count: migrated});
  });
  return {migrated};
}
