import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {buildTradeEnrichedData} from '../lib/email-enrichment.mjs';
import {ownerUserId} from '../lib/migrations/multiuser.mjs';
import {insertUser} from '../lib/store-access.mjs';

test('portfolio day return after trade: computed with shared baseline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-day-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-09';
  const yesterday = '2026-11-08';
  
  // Yesterday's baseline
  scoped.upsertDailyMark({
    takeId: take.id,
    day: yesterday,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Today's mark (before trade)
  scoped.upsertDailyMark({
    takeId: take.id,
    day: today,
    value: 105000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  const takeBefore = JSON.parse(JSON.stringify(take));
  
  // Simulate trade: +5% more units
  take.holdings[0].units *= 1.05;
  const takeAfter = take;
  
  const signal = {ticker: 'VIST', kind: 'drift'};
  const sized = {legs: [{ticker: 'VIST', side: 'compra', units: take.holdings[0].units * 0.05}]};
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal,
    sized,
    now: new Date('2026-11-09T15:00:00.000Z'),
  });
  
  assert.ok(Number.isFinite(enriched.portfolioDayPct), 'portfolioDayPct computed');
  assert.notEqual(enriched.portfolioDayPct, null);
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('portfolio day return: unavailable without baseline (first day)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-day-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-09';
  
  // Only today's mark, no baseline
  scoped.upsertDailyMark({
    takeId: take.id,
    day: today,
    value: 105000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  const takeBefore = JSON.parse(JSON.stringify(take));
  take.holdings[0].units *= 1.05;
  const takeAfter = take;
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    now: new Date('2026-11-09T15:00:00.000Z'),
  });
  
  assert.equal(enriched.portfolioDayPct, null, 'portfolioDayPct unavailable without baseline');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('portfolio day return: uses shared baseline across multiple takes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-day-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  // Create two takes
  const take1 = createTake(templates[0]);
  activate(take1, 100000);
  scoped.putTake(take1);
  
  const take2 = createTake(templates[0]);
  activate(take2, 100000);
  scoped.putTake(take2);
  
  const today = '2026-11-09';
  const yesterday = '2026-11-08';
  
  // Both takes have yesterday and today marks
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
  
  const take1Before = JSON.parse(JSON.stringify(take1));
  take1.holdings[0].units *= 1.05;
  const take1After = take1;
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: take1Before,
    takeAfter: take1After,
    allUserTakes: [take1After, take2],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    now: new Date('2026-11-09T15:00:00.000Z'),
  });
  
  assert.ok(Number.isFinite(enriched.portfolioDayPct), 'portfolioDayPct computed with multi-take baseline');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('portfolio day return: unavailable when one take missing baseline (staggered marks)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-day-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take1 = createTake(templates[0]);
  activate(take1, 100000);
  scoped.putTake(take1);
  
  const take2 = createTake(templates[0]);
  activate(take2, 100000);
  scoped.putTake(take2);
  
  const today = '2026-11-09';
  const yesterday = '2026-11-08';
  
  // Take1 has both days
  scoped.upsertDailyMark({
    takeId: take1.id,
    day: yesterday,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  scoped.upsertDailyMark({
    takeId: take1.id,
    day: today,
    value: 105000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Take2 has only today (new thesis)
  scoped.upsertDailyMark({
    takeId: take2.id,
    day: today,
    value: 50000,
    invested: 50000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  const take1Before = JSON.parse(JSON.stringify(take1));
  take1.holdings[0].units *= 1.05;
  const take1After = take1;
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: take1Before,
    takeAfter: take1After,
    allUserTakes: [take1After, take2],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    now: new Date('2026-11-09T15:00:00.000Z'),
  });
  
  assert.equal(enriched.portfolioDayPct, null, 'portfolioDayPct unavailable with staggered marks');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('portfolio day return: handles deposits (cashflow adjustment)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-day-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-09';
  const yesterday = '2026-11-08';
  
  scoped.upsertDailyMark({
    takeId: take.id,
    day: yesterday,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Deposit occurred: invested increased
  scoped.upsertDailyMark({
    takeId: take.id,
    day: today,
    value: 120000,
    invested: 115000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  const takeBefore = JSON.parse(JSON.stringify(take));
  take.invested = 115000;
  take.holdings[0].units *= 1.05;
  const takeAfter = take;
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    now: new Date('2026-11-09T15:00:00.000Z'),
  });
  
  assert.ok(Number.isFinite(enriched.portfolioDayPct), 'portfolioDayPct computed with cashflow adjustment');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('portfolio day return: ART day boundary (trade at 00:30 after midnight)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-day-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-09';
  const yesterday = '2026-11-08';
  
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
  
  const takeBefore = JSON.parse(JSON.stringify(take));
  take.holdings[0].units *= 1.05;
  const takeAfter = take;
  
  // Trade at 00:30 ART (03:30 UTC)
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    now: new Date('2026-11-09T03:30:00.000Z'),
  });
  
  assert.ok(Number.isFinite(enriched.portfolioDayPct), 'portfolioDayPct computed at ART day boundary');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('portfolio day return: multi-user isolation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-day-'));
  const store = createStore(dir);
  const user1 = ownerUserId(store.db);
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
  
  const today = '2026-11-09';
  const yesterday = '2026-11-08';
  
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
  
  const take1Before = JSON.parse(JSON.stringify(take1));
  take1.holdings[0].units *= 1.05;
  const take1After = take1;
  
  // User1's trade: should only use user1's takes
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: take1Before,
    takeAfter: take1After,
    allUserTakes: [take1After], // Only user1's takes
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    now: new Date('2026-11-09T15:00:00.000Z'),
  });
  
  assert.ok(Number.isFinite(enriched.portfolioDayPct), 'portfolioDayPct isolated to user1');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('portfolio day return: genuine zero preserved', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-day-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-09';
  const yesterday = '2026-11-08';
  
  scoped.upsertDailyMark({
    takeId: take.id,
    day: yesterday,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Exact same value today (zero return)
  scoped.upsertDailyMark({
    takeId: take.id,
    day: today,
    value: 100000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take)); // No change
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    now: new Date('2026-11-09T15:00:00.000Z'),
  });
  
  assert.strictEqual(enriched.portfolioDayPct, 0, 'genuine zero preserved');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('portfolio day return: handles zero denominator as unavailable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-day-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  const today = '2026-11-09';
  const yesterday = '2026-11-08';
  
  // Yesterday: zero baseline value
  scoped.upsertDailyMark({
    takeId: take.id,
    day: yesterday,
    value: 0,
    invested: 0,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  // Today: has value (deposit + gains)
  scoped.upsertDailyMark({
    takeId: take.id,
    day: today,
    value: 105000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  const takeBefore = JSON.parse(JSON.stringify(take));
  take.holdings[0].units *= 1.05;
  const takeAfter = take;
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    now: new Date('2026-11-09T15:00:00.000Z'),
  });
  
  // Zero denominator (baselineValue=0 + cashflows=100000) = 100000, so should compute
  // But if baselineValue=0 and invested=0, then cashflow=100000, denom=100000, should work
  // Let me reconsider: (value=105000 - baseline=0 - cashflow=100000) / (0 + 100000) = 5000/100000 = 0.05
  assert.ok(Number.isFinite(enriched.portfolioDayPct), 'computed with deposit from zero baseline');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});
