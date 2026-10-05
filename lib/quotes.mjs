import {catalog} from './engine.mjs';
import {BENCHMARKS} from './benchmark.mjs';
import {isMarketOpen, resolveQuoteAsOf} from './quote-time.mjs';
import {runRealPriceMigration, tryLazyBenchmarkBase, indexSnapshotForTake} from './quote-migration.mjs';

const REFRESH_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

export {isMarketOpen};
export const DATA912_SYMBOL = {YPF: 'YPFD', PAM: 'PAMP'};

export function yahooSymbol(ticker) {
  const local = DATA912_SYMBOL[ticker] || ticker;
  return `${local}.BA`;
}

export const CATALOG_TICKERS = catalog.map(c => c.ticker);

export function formatQuoteTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires'});
}

async function fetchJson(url, fetcher, timeoutMs = FETCH_TIMEOUT_MS) {
  const res = await fetcher(url, {headers: {'User-Agent': 'LaViste/1.1 (practice quotes)'}, signal: AbortSignal.timeout(timeoutMs)});
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), {status: res.status});
  return res.json();
}

export function createData912Adapter(fetcher) {
  return {
    name: 'data912',
    async fetchTickers(tickers) {
      const fetchedAt = new Date();
      const [stocks, cedears] = await Promise.all([
        fetchJson('https://data912.com/live/arg_stocks', fetcher),
        fetchJson('https://data912.com/live/arg_cedears', fetcher),
      ]);
      const map = new Map();
      for (const row of [...stocks, ...cedears]) map.set(row.symbol, row.c);
      const out = new Map();
      for (const ticker of tickers) {
        const sym = DATA912_SYMBOL[ticker] || ticker;
        const price = map.get(sym);
        if (Number.isFinite(price) && price > 0) {
          const asOf = resolveQuoteAsOf({fetchedAt});
          out.set(ticker, {ticker, price, asOf, provider: 'data912', stale: false, available: true});
        }
      }
      return out;
    },
    async fetchBenchmark(benchmark) {
      if (!benchmark.data912) throw new Error('benchmark not on data912');
      const fetchedAt = new Date();
      const cedears = await fetchJson('https://data912.com/live/arg_cedears', fetcher);
      const row = cedears.find(r => r.symbol === benchmark.data912);
      if (!row?.c) throw new Error('benchmark missing');
      return {id: benchmark.id, price: row.c, asOf: resolveQuoteAsOf({fetchedAt}), stale: false};
    },
  };
}

export function createYahooAdapter(fetcher) {
  return {
    name: 'yahoo',
    async fetchTickers(tickers) {
      const out = new Map();
      const fetchedAt = new Date();
      for (const ticker of tickers) {
        const sym = encodeURIComponent(yahooSymbol(ticker));
        const data = await fetchJson(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`, fetcher);
        const meta = data?.chart?.result?.[0]?.meta;
        const price = meta?.regularMarketPrice;
        if (Number.isFinite(price) && price > 0) {
          const asOf = resolveQuoteAsOf({providerMarketTimeSec: meta.regularMarketTime, fetchedAt});
          out.set(ticker, {ticker, price, asOf, provider: 'yahoo', stale: false, available: true});
        }
      }
      return out;
    },
    async fetchBenchmark(benchmark) {
      const fetchedAt = new Date();
      const sym = encodeURIComponent(benchmark.yahoo);
      const data = await fetchJson(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`, fetcher);
      const meta = data?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      if (!Number.isFinite(price) || price <= 0) throw new Error('benchmark missing');
      const asOf = resolveQuoteAsOf({providerMarketTimeSec: meta.regularMarketTime, fetchedAt});
      return {id: benchmark.id, price, asOf, stale: false};
    },
  };
}

export function createDemoAdapter(pricesByTicker) {
  const asOf = resolveQuoteAsOf({fetchedAt: new Date()});
  return {
    name: 'demo',
    async fetchTickers(tickers) {
      const out = new Map();
      for (const ticker of tickers) {
        const price = pricesByTicker[ticker];
        if (Number.isFinite(price)) out.set(ticker, {ticker, price, asOf, provider: 'demo', stale: false, available: true, sample: true});
      }
      return out;
    },
    async fetchBenchmark() {
      throw new Error('demo has no benchmark');
    },
  };
}

export function demoCatalogPrices() {
  return Object.fromEntries(catalog.map(c => [c.ticker, c.price]));
}

export function createQuotesService(store, options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  const primary = options.primary || createData912Adapter(fetcher);
  const fallback = options.fallback || createYahooAdapter(fetcher);
  const demo = options.demo ? createDemoAdapter(options.demoPrices || demoCatalogPrices()) : null;
  const adapters = demo ? [demo] : [primary, fallback];
  let backoffUntil = 0;
  let refreshTimer = null;
  let refreshing = null;

  function isDemo() {
    return !!demo;
  }

  function getCached(ticker) {
    const row = store.db.prepare('SELECT price, as_of, provider, stale FROM quote_cache WHERE ticker=?').get(ticker);
    if (!row) return null;
    return {ticker, price: row.price, asOf: row.as_of, provider: row.provider, stale: !!row.stale, available: true};
  }

  function putCached(quote, stale = false) {
    store.db.prepare('INSERT INTO quote_cache(ticker,price,as_of,provider,stale) VALUES (?,?,?,?,?) ON CONFLICT(ticker) DO UPDATE SET price=excluded.price,as_of=excluded.as_of,provider=excluded.provider,stale=excluded.stale')
      .run(quote.ticker, quote.price, quote.asOf, quote.provider, stale ? 1 : 0);
  }

  function getBenchmarkCached(id) {
    const row = store.db.prepare('SELECT price, as_of, stale FROM benchmark_cache WHERE id=?').get(id);
    return row ? {id, price: row.price, asOf: row.as_of, stale: !!row.stale} : null;
  }

  function putBenchmarkCached(row, stale = false) {
    store.db.prepare('INSERT INTO benchmark_cache(id,price,as_of,stale) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET price=excluded.price,as_of=excluded.as_of,stale=excluded.stale')
      .run(row.id, row.price, row.asOf, stale ? 1 : 0);
  }

  async function fetchWithFallback(tickers) {
    const need = new Set(tickers);
    const merged = new Map();
    for (const adapter of adapters) {
      if (!need.size) break;
      try {
        const batch = await adapter.fetchTickers([...need]);
        for (const [ticker, quote] of batch) {
          merged.set(ticker, quote);
          need.delete(ticker);
        }
      } catch {
        /* try next adapter */
      }
    }
    return merged;
  }

  async function fetchBenchmark(benchmark) {
    if (demo) throw new Error('demo has no benchmark');
    for (const adapter of adapters) {
      try {
        return await adapter.fetchBenchmark(benchmark);
      } catch {
        /* next */
      }
    }
    const cached = getBenchmarkCached(benchmark.id);
    if (cached) return {...cached, stale: true};
    throw new Error('benchmark unavailable');
  }

  async function refresh({force = false} = {}) {
    if (refreshing) return refreshing;
    if (!force && Date.now() < backoffUntil) return {skipped: 'backoff'};
    if (!force && !demo && !isMarketOpen()) return {skipped: 'closed', marketOpen: false};
    refreshing = (async () => {
      try {
        const fetched = await fetchWithFallback(CATALOG_TICKERS);
        const open = isMarketOpen();
        for (const ticker of CATALOG_TICKERS) {
          if (fetched.has(ticker)) {
            putCached(fetched.get(ticker), !open);
          } else {
            const prev = getCached(ticker);
            if (prev) putCached({...prev, stale: true}, true);
          }
        }
        if (!demo) {
          for (const bench of Object.values(BENCHMARKS)) {
            try {
              const row = await fetchBenchmark(bench);
              putBenchmarkCached(row, !open);
            } catch {
              const prev = getBenchmarkCached(bench.id);
              if (prev) putBenchmarkCached({...prev, stale: true}, true);
            }
          }
          runRealPriceMigration(store, {getCached, getBenchmarkCached, isDemo}, CATALOG_TICKERS);
        }
        store.setSetting('quotesMeta', {lastRefreshAt: new Date().toISOString(), marketOpen: open, real: !demo});
        return {ok: true, count: fetched.size};
      } catch (error) {
        backoffUntil = Date.now() + Math.min(60_000 * 15, 300_000);
        for (const ticker of CATALOG_TICKERS) {
          const prev = getCached(ticker);
          if (prev) putCached({...prev, stale: true}, true);
        }
        throw error;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  function catalogView() {
    return CATALOG_TICKERS.map(ticker => {
      const q = getCached(ticker);
      if (!q) return {ticker, available: false};
      return {...q, available: true};
    });
  }

  function status() {
    const quotes = catalogView();
    const stale = quotes.some(q => q.available && q.stale);
    const asOf = quotes.filter(q => q.available).map(q => q.asOf).filter(Boolean).sort().at(-1) || null;
    return {
      market: demo ? 'demo' : 'delayed',
      marketOpen: isMarketOpen(),
      asOf,
      stale,
      quotes,
      benchmarks: Object.values(BENCHMARKS).map(b => getBenchmarkCached(b.id)).filter(Boolean),
      indexCompareAvailable: !demo,
    };
  }

  function indexSnapshot(take) {
    return indexSnapshotForTake(take, {getBenchmarkCached});
  }

  const quotesApi = {getCached, getBenchmarkCached, isDemo};

  function applyCatalogToHoldings(holdings) {
    for (const h of holdings) {
      const q = getCached(h.ticker);
      if (q?.price && q.provider !== 'demo') {
        h.price = q.price;
        h.referencePrice = q.price;
      }
    }
  }

  function syncTakePrices(take, now = new Date().toISOString()) {
    if (!take.realPricesAt || take.phase !== 'active' || take.scenario !== 'normal') return false;
    const lazy = tryLazyBenchmarkBase(take, quotesApi, now);
    let changed = false;
    for (const h of take.holdings) {
      const q = getCached(h.ticker);
      if (q?.price && q.provider !== 'demo' && h.price !== q.price) {
        h.price = q.price;
        h.referencePrice = q.price;
        changed = true;
      }
    }
    if (changed) {
      const val = Math.round((take.cash + take.holdings.reduce((s, h) => s + h.units * h.price, 0)) * 100) / 100;
      const idx = indexSnapshot(take);
      const point = {at: now, value: val, benchmark: take.invested};
      if (idx != null) {
        point.index = idx;
        point.indexRecorded = true;
      }
      take.history.push(point);
      take.history = take.history.slice(-365);
    }
    return changed || lazy;
  }

  function syncAllTakes() {
    store.transaction(() => {
      for (const take of store.takes()) {
        if (syncTakePrices(take)) store.putTake(take);
        else if (tryLazyBenchmarkBase(take, quotesApi)) store.putTake(take);
      }
    });
  }

  async function tick() {
    try {
      await refresh();
      syncAllTakes();
    } catch {
      /* keep last cache */
    }
  }

  function startScheduler() {
    if (refreshTimer || demo) return;
    refreshTimer = setInterval(() => tick(), REFRESH_MS);
    refreshTimer.unref();
    tick().catch(() => {});
  }

  function stopScheduler() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  function attachBenchmarkOnActivate(take, benchmark) {
    const row = getBenchmarkCached(benchmark.id);
    take.benchmarkId = benchmark.id;
    take.benchmarkLabel = benchmark.label;
    take.benchmarkBase = row?.price || null;
  }

  return {
    refresh, tick, status, catalogView, getCached, getBenchmarkCached, indexSnapshot, syncTakePrices, syncAllTakes,
    applyCatalogToHoldings, attachBenchmarkOnActivate, startScheduler, stopScheduler, isMarketOpen, isDemo,
  };
}
