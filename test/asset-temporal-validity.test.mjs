import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {createQuotesService} from '../lib/quotes.mjs';
import {buildDigestEnrichedData} from '../lib/email-enrichment.mjs';
import {scheduleDailyDigest} from '../lib/email-alerts.mjs';
import {ownerUserId} from '../lib/migrations/multiuser.mjs';

test('temporal validity: old-day quote rejected even if stale=false', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
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
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Quote with yesterday's timestamp, stale=false (the blocker case)
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-07T20:00:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-07T20:00:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T20:30:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.portfolioMovements.length, 0, 'Old-day quote excluded despite stale=false');
  
  const result = scheduleDailyDigest(store.db, {
    userId,
    newsItems: [],
    enrichedData,
    now: () => new Date('2026-11-08T20:30:00.000Z'),
  });
  
  assert.ok(!result.scheduled, 'No digest when only old-day quote');
  assert.equal(result.reason, 'no_significant_changes');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('temporal validity: mismatched quote and change timestamps rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
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
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Price from today, but change from yesterday
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-07T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T20:30:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.portfolioMovements.length, 0, 'Mismatched timestamps excluded');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('temporal validity: valid same-day quote accepted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  store.db.prepare('UPDATE email_prefs SET threshold_asset_pct=? WHERE user_id=?')
    .run(5.0, userId);
  
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
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Valid: both timestamps from today
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-08T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T20:30:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.portfolioMovements.length, 1, 'Valid same-day quote included');
  assert.equal(enrichedData.portfolioMovements[0].ticker, 'VIST');
  assert.equal(enrichedData.portfolioMovements[0].dayPct, 0.06);
  
  const result = scheduleDailyDigest(store.db, {
    userId,
    newsItems: [],
    enrichedData,
    now: () => new Date('2026-11-08T20:30:00.000Z'),
  });
  
  assert.ok(result.scheduled, 'Digest scheduled for valid same-day quote above threshold');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('temporal validity: missing changeAsOf rejected when dayChangePct present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
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
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // dayChangePct present but changeAsOf missing
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.06, 1000, null);
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T20:30:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.portfolioMovements.length, 0, 'Missing changeAsOf rejected');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('temporal validity: ART midnight boundary (21:30 ART = 00:30Z next day)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  store.db.prepare('UPDATE email_prefs SET threshold_asset_pct=? WHERE user_id=?')
    .run(5.0, userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const artDay = '2026-11-07';
  const prevDay = '2026-11-06';
  
  scoped.upsertDailyMark({
    takeId: take.id,
    day: prevDay,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day: artDay,
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // UTC 2026-11-08T00:30Z = ART 2026-11-07T21:30 (still Nov 7 in ART)
  // Quote timestamp also from ART Nov 7
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-07T20:00:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-07T20:00:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T00:30:00.000Z'), // ART 2026-11-07T21:30
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.portfolioMovements.length, 1, 'Same ART day accepted despite UTC boundary');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('temporal validity: stale quote excluded even if from today', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
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
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Quote from today but marked stale
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:30:00.000Z', 'data912', 1, 0.06, 1000, '2026-11-08T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T20:30:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.portfolioMovements.length, 0, 'Stale quote excluded');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('temporal validity: future quote date rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
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
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Quote dated tomorrow
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-09T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-09T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T20:30:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.portfolioMovements.length, 0, 'Future quote date excluded');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('temporal validity: user isolation with mixed valid/invalid quotes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  store.db.prepare('UPDATE email_prefs SET threshold_asset_pct=? WHERE user_id=?')
    .run(5.0, userId);
  
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
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // VIST: valid (today)
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-08T17:30:00.000Z');
  
  // YPFD: invalid (yesterday)
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('YPF', 2120, '2026-11-07T17:30:00.000Z', 'data912', 0, 0.08, 2000, '2026-11-07T17:30:00.000Z');
  
  // PAMP: invalid (mismatched timestamps)
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('PAM', 1100, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.05, 1050, '2026-11-07T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T20:30:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.portfolioMovements.length, 1, 'Only valid quote included');
  assert.equal(enrichedData.portfolioMovements[0].ticker, 'VIST');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('temporal validity: zero day-change preserved when timestamps valid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
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
  
  // Zero day-change with valid timestamps
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1000, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.0, 1000, '2026-11-08T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T20:30:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.portfolioMovements.length, 1, 'Zero preserved with valid timestamps');
  assert.equal(enrichedData.portfolioMovements[0].dayPct, 0.0);
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});
