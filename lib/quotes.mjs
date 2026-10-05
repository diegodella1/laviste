import {catalog} from './engine.mjs';
import {BENCHMARKS, indexLevelAt} from './benchmark.mjs';

const REFRESH_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;
const TZ = 'America/Argentina/Buenos_Aires';

/** App ticker → data912 symbol (BYMA locals). */
export const DATA912_SYMBOL = {YPF: 'YPFD', PAM: 'PAMP'};

/** App ticker → Yahoo Finance symbol (ARS listings). */
export function yahooSymbol(ticker) {
  const local = DATA912_SYMBOL[ticker] || ticker;
  return `${local}.BA`;
}

export const CATALOG_TICKERS = catalog.map(c => c.ticker);

export function artParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short', hourCycle: 'h23'}).formatToParts(date).map(p => [p.type, p.value]),
  );
  return parts;
}

/** Mon–Fri ~11:00–17:00 ART (BYMA regular session). */
export function isMarketOpen(now = new Date()) {
  const p = artParts(now);
  const day = p.weekday;
  if (day === 'Sat' || day === 'Sun') return false;
  const hm = Number(p.hour) * 60 + Number(p.minute);
  return hm >= 11 * 60 && hm < 17 * 60;
}

export function formatQuoteTime(iso) {
  if (!iso) return '—';
  const p = artParts(new Date(iso));
  return `${p.hour}:${p.minute}`;
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
      const [stocks, cedears] = await Promise.all([
        fetchJson('https://data912.com/live/arg_stocks', fetcher),
        fetchJson('https://data912.com/live/arg_cedears', fetcher),
      ]);
      const map = new Map();
      for (const row of [...stocks, ...cedears]) map.set(row.symbol, row.c);
      const asOf = new Date().toISOString();
      const out = new Map();
      for (const ticker of tickers) {
        const sym = DATA912_SYMBOL[ticker] || ticker;
        const price = map.get(sym);
        if (Number.isFinite(price) && price > 0) out.set(ticker, {ticker, price, asOf, provider: 'data912', stale: false});
      }
      return out;
    },
    async fetchBenchmark(benchmark) {
      if (benchmark.data912) {
        const cedears = await fetchJson('https://data912.com/live/arg_cedears', fetcher);
        const row = cedears.find(r => r.symbol === benchmark.data912);
        if (!row?.c) throw new Error('benchmark missing');
        return {id: benchmark.id, price: row.c, asOf: new Date().toISOString(), stale: false};
      }
      throw new Error('benchmark not on data912');
    },
  };
}

export function createYahooAdapter(fetcher) {
  return {
    name: 'yahoo',
    async fetchTickers(tickers) {
      const out = new Map();
      const asOf = new Date().toISOString();
      for (const ticker of tickers) {
        const sym = encodeURIComponent(yahooSymbol(ticker));
        const data = await fetchJson(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`, fetcher);
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (Number.isFinite(price) && price > 0) out.set(ticker, {ticker, price, asOf, provider: 'yahoo', stale: false});
      }
      return out;
    },
    async fetchBenchmark(benchmark) {
      const sym = encodeURIComponent(benchmark.yahoo);
      const data = await fetchJson(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`, fetcher);
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (!Number.isFinite(price) || price <= 0) throw new Error('benchmark missing');
      return {id: benchmark.id, price, asOf: new Date().toISOString(), stale: false};
    },
  };
}

export function createDemoAdapter(pricesByTicker) {
  const asOf = new Date().toISOString();
  return {
    name: 'demo',
    async fetchTickers(tickers) {
      const out = new Map();
      for (const ticker of tickers) {
        const price = pricesByTicker[ticker];
        if (Number.isFinite(price)) out.set(ticker, {ticker, price, asOf, provider: 'demo', stale: false});
      }
      return out;
    },
    async fetchBenchmark(benchmark) {
      const base = benchmark.id === 'MERV' ? 2_000_000 : 20_000;
      return {id: benchmark.id, price: base, asOf, stale: false};
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

  function getCached(ticker) {
    const row = store.db.prepare('SELECT price, as_of, provider, stale FROM quote_cache WHERE ticker=?').get(ticker);
    if (!row) return null;
    return {ticker, price: row.price, asOf: row.as_of, provider: row.provider, stale: !!row.stale};
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
          const quote = fetched.get(ticker) || getCached(ticker);
          if (quote) putCached(quote, !fetched.has(ticker) || !open);
          else if (getCached(ticker)) putCached({...getCached(ticker), stale: true}, true);
        }
        for (const bench of Object.values(BENCHMARKS)) {
          try {
            const row = await fetchBenchmark(bench);
            putBenchmarkCached(row, !open);
          } catch {
            const prev = getBenchmarkCached(bench.id);
            if (prev) putBenchmarkCached(prev, true);
          }
        }
        store.setSetting('quotesMeta', {lastRefreshAt: new Date().toISOString(), marketOpen: open});
        return {ok: true, count: fetched.size};
      } catch (error) {
        backoffUntil = Date.now() + Math.min(60_000 * 15, 300_000);
        for (const ticker of CATALOG_TICKERS) {
          const prev = getCached(ticker);
          if (prev) putCached(prev, true);
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
      const fallbackPrice = catalog.find(c => c.ticker === ticker)?.price;
      return q || {ticker, price: fallbackPrice, asOf: null, provider: 'demo', stale: true};
    });
  }

  function status() {
    const meta = store.setting('quotesMeta') || {};
    const quotes = catalogView();
    const stale = quotes.some(q => q.stale);
    const asOf = quotes.map(q => q.asOf).filter(Boolean).sort().at(-1) || null;
    return {
      market: demo ? 'demo' : 'delayed',
      marketOpen: isMarketOpen(),
      asOf,
      stale,
      quotes,
      benchmarks: Object.values(BENCHMARKS).map(b => getBenchmarkCached(b.id)).filter(Boolean),
    };
  }

  function benchmarkLevel(take) {
    if (!take.benchmarkId || !take.benchmarkBase || !take.invested) return take.invested;
    const row = getBenchmarkCached(take.benchmarkId);
    if (!row?.price) return take.invested;
    return indexLevelAt({id: take.benchmarkId}, row.price, take.benchmarkBase, take.invested);
  }

  function applyCatalogToHoldings(holdings) {
    for (const h of holdings) {
      const q = getCached(h.ticker);
      if (q?.price) {
        h.price = q.price;
        if (!h.referencePrice) h.referencePrice = q.price;
      }
    }
  }

  function syncTakePrices(take, now = new Date().toISOString()) {
    if (take.phase !== 'active' || take.scenario !== 'normal') return false;
    let changed = false;
    for (const h of take.holdings) {
      const q = getCached(h.ticker);
      if (q?.price && h.price !== q.price) {
        h.price = q.price;
        h.referencePrice = q.price;
        changed = true;
      }
    }
    if (changed) {
      const last = take.history.at(-1);
      const idx = benchmarkLevel(take);
      if (!last || last.value !== take.cash + take.holdings.reduce((s, h) => s + h.units * h.price, 0)) {
        const val = Math.round((take.cash + take.holdings.reduce((s, h) => s + h.units * h.price, 0)) * 100) / 100;
        take.history.push({at: now, value: val, benchmark: take.invested, index: idx});
        take.history = take.history.slice(-365);
      }
    }
    return changed;
  }

  function syncAllTakes() {
    store.transaction(() => {
      for (const take of store.takes()) {
        if (syncTakePrices(take)) store.putTake(take);
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
    refresh, tick, status, catalogView, getCached, benchmarkLevel, syncTakePrices, syncAllTakes,
    applyCatalogToHoldings, attachBenchmarkOnActivate, startScheduler, stopScheduler, isMarketOpen,
  };
}
