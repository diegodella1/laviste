import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {createQuotesService} from '../lib/quotes.mjs';
import {buildTradeEnrichedData} from '../lib/email-enrichment.mjs';
import {ownerUserId} from '../lib/migrations/multiuser.mjs';

test('asset day %: extracted from valid quote with same-day validation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-day-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take));
  
  const today = '2026-11-09';
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // Insert quote with day_change_pct for today
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-09T17:00:00-03:00', 'data912', 0, 0.06, 1000, '2026-11-09T17:00:00-03:00');
  
  const quotes = createQuotesService(store, {demo: true});
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    quotes,
    now,
  });
  
  assert.strictEqual(enriched.assetDayPct, 0.06, 'assetDayPct extracted from valid quote');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset day %: genuine zero preserved', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-day-'));
  const store = createStore(dir);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take));
  
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // Quote with exactly zero day change
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1000, '2026-11-09T17:00:00-03:00', 'data912', 0, 0, 1000, '2026-11-09T17:00:00-03:00');
  
  const quotes = createQuotesService(store, {demo: true});
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    quotes,
    now,
  });
  
  assert.strictEqual(enriched.assetDayPct, 0, 'genuine zero preserved (not converted to null)');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset day %: null when quote missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-day-'));
  const store = createStore(dir);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take));
  
  const quotes = createQuotesService(store, {demo: true});
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'MISSING', kind: 'drift'},
    sized: {legs: []},
    quotes,
    now: new Date('2026-11-09T17:30:00-03:00'),
  });
  
  assert.strictEqual(enriched.assetDayPct, null, 'null when quote missing');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset day %: null when quote stale', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-day-'));
  const store = createStore(dir);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take));
  
  // Quote marked as stale
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-09T17:00:00-03:00', 'data912', 1, 0.06, 1000, '2026-11-09T17:00:00-03:00');
  
  const quotes = createQuotesService(store, {demo: true});
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    quotes,
    now: new Date('2026-11-09T17:30:00-03:00'),
  });
  
  assert.strictEqual(enriched.assetDayPct, null, 'null when quote stale');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset day %: null when quote from wrong day (old)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-day-'));
  const store = createStore(dir);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take));
  
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // Quote from yesterday (old day)
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:00:00-03:00', 'data912', 0, 0.06, 1000, '2026-11-08T17:00:00-03:00');
  
  const quotes = createQuotesService(store, {demo: true});
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    quotes,
    now,
  });
  
  assert.strictEqual(enriched.assetDayPct, null, 'null when quote from wrong ART day');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset day %: null when quote has future timestamp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-day-'));
  const store = createStore(dir);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take));
  
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // Quote with future timestamp (after now)
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-09T18:00:00-03:00', 'data912', 0, 0.06, 1000, '2026-11-09T18:00:00-03:00');
  
  const quotes = createQuotesService(store, {demo: true});
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    quotes,
    now,
  });
  
  assert.strictEqual(enriched.assetDayPct, null, 'null when quote has future timestamp');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset day %: null when dayChangePct missing from quote', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-day-'));
  const store = createStore(dir);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take));
  
  // Quote without day_change_pct (NULL in DB)
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale)
    VALUES (?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-09T17:00:00-03:00', 'data912', 0);
  
  const quotes = createQuotesService(store, {demo: true});
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    quotes,
    now: new Date('2026-11-09T17:30:00-03:00'),
  });
  
  assert.strictEqual(enriched.assetDayPct, null, 'null when dayChangePct not present in quote');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset day %: user/ticker match validated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-day-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take));
  
  // Insert quotes for two different tickers
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-09T17:00:00-03:00', 'data912', 0, 0.06, 1000, '2026-11-09T17:00:00-03:00');
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('YPF', 5000, '2026-11-09T17:00:00-03:00', 'data912', 0, -0.03, 5155, '2026-11-09T17:00:00-03:00');
  
  const quotes = createQuotesService(store, {demo: true});
  
  // Signal for VIST should get VIST quote
  const enrichedVIST = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    quotes,
    now: new Date('2026-11-09T17:30:00-03:00'),
  });
  
  assert.strictEqual(enrichedVIST.assetDayPct, 0.06, 'VIST signal gets VIST quote');
  
  // Signal for YPF should get YPF quote
  const enrichedYPF = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'YPF', kind: 'drift'},
    sized: {legs: []},
    quotes,
    now: new Date('2026-11-09T17:30:00-03:00'),
  });
  
  assert.strictEqual(enrichedYPF.assetDayPct, -0.03, 'YPF signal gets YPF quote');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset day %: null when quotes service not provided', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-day-'));
  const store = createStore(dir);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take));
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    quotes: null,  // No quotes service
    now: new Date('2026-11-09T17:30:00-03:00'),
  });
  
  assert.strictEqual(enriched.assetDayPct, null, 'null when quotes service not provided');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});
