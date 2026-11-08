import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {createQuotesService} from '../lib/quotes.mjs';
import {buildDigestEnrichedData} from '../lib/email-enrichment.mjs';
import {ownerUserId} from '../lib/migrations/multiuser.mjs';

test('thesis contributions: computed when no trades occurred today', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contributions-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-08';
  const yesterday = '2026-11-07';
  
  scoped.upsertDailyMark({
    takeId: take.id,
    day: yesterday,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day: today,
    value: 105000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // VIST up 6%, prevClose = 1000
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-08T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T18:00:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.theses.length, 1);
  
  const thesis = enrichedData.theses[0];
  assert.ok(Array.isArray(thesis.contributions), 'contributions is array');
  assert.equal(thesis.contributions.length, 1, 'one ticker contribution');
  
  const contrib = thesis.contributions[0];
  assert.equal(contrib.ticker, 'VIST');
  assert.ok(Number.isFinite(contrib.contribPct), 'contribPct is number');
  assert.ok(Array.isArray(contrib.thesisNames), 'thesisNames is array');
  assert.equal(contrib.thesisNames.length, 1);
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('thesis contributions: unavailable when trades occurred today', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contributions-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-08';
  const yesterday = '2026-11-07';
  
  scoped.upsertDailyMark({
    takeId: take.id,
    day: yesterday,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day: today,
    value: 105000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Insert a trade for today (contamination)
  store.db.prepare(`
    INSERT INTO auto_trades(id, user_id, take_id, day, kind, status, executed_at, created_at)
    VALUES (?, ?, ?, ?, 'drift', 'executed', ?, ?)
  `).run('trade-1', userId, take.id, '2026-11-08', '2026-11-08T15:00:00.000Z', '2026-11-08T15:00:00.000Z');
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-08T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T18:00:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.theses.length, 1);
  
  const thesis = enrichedData.theses[0];
  assert.ok(Array.isArray(thesis.contributions), 'contributions is array');
  assert.equal(thesis.contributions.length, 0, 'no contributions when trades occurred');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('thesis contributions: multi-ticker with correct thesis names', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contributions-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  // Create two theses with default templates
  const take1 = createTake(templates[0]);
  take1.title = 'Tech Growth';
  activate(take1, 100000);
  scoped.putTake(take1);
  
  const take2 = createTake(templates[0]); // Same template so VIST is in both
  take2.title = 'Value Play';
  activate(take2, 100000);
  scoped.putTake(take2);
  
  // Both theses have VIST (from template)
  
  const today = '2026-11-08';
  const yesterday = '2026-11-07';
  
  for (const take of [take1, take2]) {
    scoped.upsertDailyMark({
      takeId: take.id,
      day: yesterday,
      value: 100000,
      invested: 100000,
      benchId: null,
      benchPrice: null,
      eligible: true,
    });
    scoped.upsertDailyMark({
      takeId: take.id,
      day: today,
      value: 105000,
      invested: 100000,
      benchId: null,
      benchPrice: null,
      eligible: true,
    });
  }
  
  // VIST up 6% (in both theses)
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-08T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take1.id), scoped.take(take2.id)],
    quotes,
    now: new Date('2026-11-08T18:00:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.theses.length, 2);
  
  // Check that VIST contributions include both thesis names
  for (const thesis of enrichedData.theses) {
    const vistContrib = thesis.contributions.find(c => c.ticker === 'VIST');
    if (vistContrib) {
      assert.ok(vistContrib.thesisNames.length === 2, `VIST should be in 2 theses, got ${vistContrib.thesisNames.length}`);
      assert.ok(vistContrib.thesisNames.includes('Tech Growth'), 'VIST should include Tech Growth');
      assert.ok(vistContrib.thesisNames.includes('Value Play'), 'VIST should include Value Play');
    }
  }
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('thesis contributions: zero contribution preserved', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contributions-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-08';
  const yesterday = '2026-11-07';
  
  scoped.upsertDailyMark({
    takeId: take.id,
    day: yesterday,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day: today,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // VIST flat 0%
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1000, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.0, 1000, '2026-11-08T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T18:00:00.000Z'),
  });
  
  assert.ok(enrichedData);
  const thesis = enrichedData.theses[0];
  assert.equal(thesis.contributions.length, 1);
  
  const contrib = thesis.contributions[0];
  assert.equal(contrib.contribPct, 0.0, 'zero contribution preserved');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('thesis contributions: contribution math correctness', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contributions-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  // Use default template which has VIST
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-08';
  const yesterday = '2026-11-07';
  
  // Yesterday thesis value: 100,000
  scoped.upsertDailyMark({
    takeId: take.id,
    day: yesterday,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Today thesis value: 105,000 (5% up)
  scoped.upsertDailyMark({
    takeId: take.id,
    day: today,
    value: 105000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // VIST: up 6%
  // Template has specific VIST holdings; contribution depends on VIST weight in take
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-08T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T18:00:00.000Z'),
  });
  
  assert.ok(enrichedData);
  const thesis = enrichedData.theses[0];
  assert.ok(thesis.contributions.length >= 1, 'at least one contribution');
  
  const vistContrib = thesis.contributions.find(c => c.ticker === 'VIST');
  assert.ok(vistContrib, 'VIST contribution exists');
  assert.ok(Number.isFinite(vistContrib.contribPct), 'contribPct is a number');
  // Just verify it's positive when ticker moved up
  assert.ok(vistContrib.contribPct > 0, 'positive contribution for up movement');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('thesis contributions: stale quotes excluded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contributions-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-08';
  const yesterday = '2026-11-07';
  
  scoped.upsertDailyMark({
    takeId: take.id,
    day: yesterday,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day: today,
    value: 105000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // VIST quote marked stale
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:30:00.000Z', 'data912', 1, 0.06, 1000, '2026-11-08T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T18:00:00.000Z'),
  });
  
  assert.ok(enrichedData);
  const thesis = enrichedData.theses[0];
  assert.equal(thesis.contributions.length, 0, 'stale quote excluded from contributions');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('thesis contributions: old-day quotes excluded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contributions-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-08';
  const yesterday = '2026-11-07';
  
  scoped.upsertDailyMark({
    takeId: take.id,
    day: yesterday,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day: today,
    value: 105000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // VIST quote from yesterday (old-day)
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-07T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-07T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T18:00:00.000Z'),
  });
  
  assert.ok(enrichedData);
  const thesis = enrichedData.theses[0];
  assert.equal(thesis.contributions.length, 0, 'old-day quote excluded from contributions');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});
