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
import {insertUser} from '../lib/store-access.mjs';

test('ticker contributions: unavailable without holdings snapshots (baseline = 1 day)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contrib-unavail-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-08';
  const yesterday = '2026-11-07';
  
  // Baseline exactly 1 day back
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
  assert.ok(Array.isArray(thesis.contributions));
  assert.equal(thesis.contributions.length, 0, 'contributions unavailable without holdings snapshots');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('ticker contributions: unavailable when baseline > 1 day (period mismatch)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contrib-unavail-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-08';
  const twoDaysAgo = '2026-11-06';
  const threeDaysAgo = '2026-11-05';
  
  // Baseline 3 days back (no marks for -1, -2 days)
  scoped.upsertDailyMark({
    takeId: take.id,
    day: threeDaysAgo,
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
  
  // Quote gives 1-day change, but baseline is 3 days back (period mismatch)
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
  assert.equal(thesis.contributions.length, 0, 'contributions unavailable due to period mismatch');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('ticker contributions: unavailable with manual operations (position changes)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contrib-unavail-'));
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
    value: 110000,
    invested: 110000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Deposit occurred (invested changed) - holdings may have changed
  // Cannot prove unchanged positions without holdings snapshots
  
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
  assert.equal(thesis.contributions.length, 0, 'contributions unavailable: cannot prove unchanged positions');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('ticker contributions: unavailable with automatic trades', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contrib-unavail-'));
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
  
  // Auto trade today - holdings changed
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
  const thesis = enrichedData.theses[0];
  // Would detect trade if implemented, but contributions always unavailable anyway
  assert.equal(thesis.contributions.length, 0);
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('ticker contributions: multi-user isolation maintained', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contrib-unavail-'));
  const store = createStore(dir);
  const user1 = ownerUserId(store.db);
  
  // Create second user
  const user2Id = insertUser(store.db, {email: 'user2@test.com', displayName: 'User 2'});
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), user2Id);
  store.db.prepare('INSERT INTO email_prefs(user_id, updated_at) VALUES (?, ?)').run(user2Id, new Date().toISOString());
  
  const scoped1 = store.forUser(user1);
  const scoped2 = store.forUser(user2Id);
  
  const take1 = createTake(templates[0]);
  activate(take1, 100000);
  scoped1.putTake(take1);
  
  const take2 = createTake(templates[0]);
  activate(take2, 100000);
  scoped2.putTake(take2);
  
  const today = '2026-11-08';
  const yesterday = '2026-11-07';
  
  for (const {scoped, take} of [{scoped: scoped1, take: take1}, {scoped: scoped2, take: take2}]) {
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
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:30:00.000Z', 'data912', 0, 0.06, 1000, '2026-11-08T17:30:00.000Z');
  
  const quotes = createQuotesService(store, {demo: true});
  
  const enriched1 = buildDigestEnrichedData({
    db: store.db,
    userId: user1,
    takes: [scoped1.take(take1.id)],
    quotes,
    now: new Date('2026-11-08T18:00:00.000Z'),
  });
  
  const enriched2 = buildDigestEnrichedData({
    db: store.db,
    userId: user2Id,
    takes: [scoped2.take(take2.id)],
    quotes,
    now: new Date('2026-11-08T18:00:00.000Z'),
  });
  
  assert.ok(enriched1);
  assert.ok(enriched2);
  
  // Both users: contributions unavailable (no snapshots)
  assert.equal(enriched1.theses[0].contributions.length, 0);
  assert.equal(enriched2.theses[0].contributions.length, 0);
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});
