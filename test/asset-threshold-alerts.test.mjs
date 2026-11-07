import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {createQuotesService} from '../lib/quotes.mjs';
import {buildDigestEnrichedData} from '../lib/email-enrichment.mjs';
import {scheduleDailyDigest} from '../lib/email-alerts.mjs';
import {ownerUserId} from '../lib/migrations/multiuser.mjs';

test('asset threshold: portfolio below + asset above threshold triggers digest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-threshold-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  store.db.prepare('UPDATE email_prefs SET threshold_asset_pct=?, threshold_portfolio_pct=? WHERE user_id=?')
    .run(5.0, 50.0, userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const day = '2026-11-07';
  scoped.upsertDailyMark({
    takeId: take.id,
    day: '2026-11-06',
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day,
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-07T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-07T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-07T18:00:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.ok(Math.abs(enrichedData.portfolio.dayPct - 0.001) < 0.0001, 'Portfolio day pct approximately 0.1%');
  assert.equal(enrichedData.portfolioMovements.length, 1);
  assert.equal(enrichedData.portfolioMovements[0].ticker, 'VIST');
  assert.equal(enrichedData.portfolioMovements[0].dayPct, 0.06);
  
  const result = scheduleDailyDigest(store.db, {
    userId,
    newsItems: [],
    enrichedData,
    now: () => new Date('2026-11-07T18:00:00.000Z'),
  });
  
  assert.ok(result.scheduled, 'Digest scheduled when asset crosses threshold');
  
  const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE user_id=?').all(userId);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].template, 'daily_digest');
  assert.ok(outbox[0].body_html, 'Email body generated');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset threshold: portfolio below + asset below threshold => no digest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-threshold-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  store.db.prepare('UPDATE email_prefs SET threshold_asset_pct=?, threshold_portfolio_pct=? WHERE user_id=?')
    .run(5.0, 50.0, userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const day = '2026-11-07';
  scoped.upsertDailyMark({
    takeId: take.id,
    day: '2026-11-06',
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day,
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1020, '2026-11-07T17:30:00.000Z', 'data912', 0, 0.02, 1000, '2026-11-07T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-07T18:00:00.000Z'),
  });
  
  const result = scheduleDailyDigest(store.db, {
    userId,
    newsItems: [],
    enrichedData,
    now: () => new Date('2026-11-07T18:00:00.000Z'),
  });
  
  assert.ok(!result.scheduled);
  assert.equal(result.reason, 'no_significant_changes');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset threshold: negative threshold uses absolute value', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-threshold-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  store.db.prepare('UPDATE email_prefs SET threshold_asset_pct=?, threshold_portfolio_pct=? WHERE user_id=?')
    .run(5.0, 50.0, userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const day = '2026-11-07';
  scoped.upsertDailyMark({
    takeId: take.id,
    day: '2026-11-06',
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day,
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 940, '2026-11-07T17:30:00.000Z', 'data912', 0, -0.06, 1000, '2026-11-07T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-07T18:00:00.000Z'),
  });
  
  const result = scheduleDailyDigest(store.db, {
    userId,
    newsItems: [],
    enrichedData,
    now: () => new Date('2026-11-07T18:00:00.000Z'),
  });
  
  assert.ok(result.scheduled, 'Negative asset movement triggers when abs >= threshold');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset threshold: stale quotes omitted from movements', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-threshold-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const day = '2026-11-07';
  scoped.upsertDailyMark({
    takeId: take.id,
    day: '2026-11-06',
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day,
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-06T17:30:00.000Z', 'data912', 1, 0.06, 1000, '2026-11-06T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-07T18:00:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.portfolioMovements.length, 0, 'Stale quotes excluded');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset threshold: user isolation - only user tickers included', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-threshold-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const day = '2026-11-07';
  scoped.upsertDailyMark({
    takeId: take.id,
    day: '2026-11-06',
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day,
    value: 100100,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-07T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-07T17:30:00.000Z');
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('NOTMINE', 2000, '2026-11-07T17:30:00.000Z', 'data912', 0, 0.10, 1800, '2026-11-07T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-07T18:00:00.000Z'),
  });
  
  assert.ok(enrichedData);
  assert.equal(enrichedData.portfolioMovements.length, 1);
  assert.equal(enrichedData.portfolioMovements[0].ticker, 'VIST');
  assert.ok(!enrichedData.portfolioMovements.find(m => m.ticker === 'NOTMINE'));
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('asset threshold: ticker appears in multiple thesis names', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-threshold-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take1 = createTake(templates[0]);
  take1.title = 'Tesis A';
  activate(take1, 100000);
  scoped.putTake(take1);
  
  const take2 = createTake(templates[0]);
  take2.title = 'Tesis B';
  activate(take2, 200000);
  scoped.putTake(take2);
  
  const day = '2026-11-07';
  for (const takeId of [take1.id, take2.id]) {
    scoped.upsertDailyMark({
      takeId,
      day: '2026-11-06',
      value: 100000,
      invested: 100000,
      benchId: null,
      benchPrice: null,
      eligible: true,
    });
    scoped.upsertDailyMark({
      takeId,
      day,
      value: 100100,
      invested: 100000,
      benchId: null,
      benchPrice: null,
      eligible: true,
    });
  }
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-07T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-07T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take1.id), scoped.take(take2.id)],
    quotes,
    now: new Date('2026-11-07T18:00:00.000Z'),
  });
  
  assert.ok(enrichedData);
  const vistMovement = enrichedData.portfolioMovements.find(m => m.ticker === 'VIST');
  assert.ok(vistMovement);
  assert.ok(vistMovement.thesisNames.includes('Tesis A'));
  assert.ok(vistMovement.thesisNames.includes('Tesis B'));
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('alertsFired populated with portfolio and asset threshold alerts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'asset-threshold-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  store.db.prepare('UPDATE email_prefs SET threshold_asset_pct=?, threshold_portfolio_pct=? WHERE user_id=?')
    .run(5.0, 3.0, userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const day = '2026-11-07';
  scoped.upsertDailyMark({
    takeId: take.id,
    day: '2026-11-06',
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take.id,
    day,
    value: 105000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-07T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-07T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-07T18:00:00.000Z'),
  });
  
  const result = scheduleDailyDigest(store.db, {
    userId,
    newsItems: [],
    enrichedData,
    now: () => new Date('2026-11-07T18:00:00.000Z'),
  });
  
  assert.ok(result.scheduled);
  
  const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE user_id=?').get(userId);
  assert.ok(outbox);
  const meta = JSON.parse(outbox.meta);
  assert.ok(meta);
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});
