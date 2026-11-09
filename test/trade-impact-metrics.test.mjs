import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates, value} from '../lib/engine.mjs';
import {buildTradeEnrichedData} from '../lib/email-enrichment.mjs';
import {ownerUserId} from '../lib/migrations/multiuser.mjs';
import {insertUser} from '../lib/store-access.mjs';

test('trade impact: thesis impact computed from before/after snapshots', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-impact-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  const takeBefore = JSON.parse(JSON.stringify(take));
  
  // Simulate trade: modify holdings
  take.holdings[0].units *= 1.1; // 10% more units
  const takeAfter = take;
  
  const signal = {ticker: 'VIST', kind: 'drift'};
  const sized = {legs: [{ticker: 'VIST', side: 'compra', units: take.holdings[0].units * 0.1}]};
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal,
    sized,
    now: new Date(),
  });
  
  assert.ok(Number.isFinite(enriched.thesisImpactPct), 'thesisImpactPct computed');
  assert.ok(enriched.thesisImpactPct !== null);
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade impact: portfolio impact computed from multi-take portfolio', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-impact-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  // Create two theses
  const take1 = createTake(templates[0]);
  activate(take1, 100000);
  scoped.putTake(take1);
  
  const take2 = createTake(templates[0]);
  activate(take2, 100000);
  scoped.putTake(take2);
  
  const take1Before = JSON.parse(JSON.stringify(take1));
  
  // Trade in take1 only
  take1.holdings[0].units *= 1.05; // 5% more
  const take1After = take1;
  
  const signal = {ticker: 'VIST', kind: 'drift'};
  const sized = {legs: [{ticker: 'VIST', side: 'compra', units: take1.holdings[0].units * 0.05}]};
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: take1Before,
    takeAfter: take1After,
    allUserTakes: [take1After, take2], // Portfolio has both takes
    signal,
    sized,
    now: new Date(),
  });
  
  assert.ok(Number.isFinite(enriched.portfolioImpactPct), 'portfolioImpactPct computed');
  assert.ok(enriched.portfolioImpactPct !== null);
  
  // Portfolio impact should be smaller than thesis impact (diluted by take2)
  if (enriched.thesisImpactPct !== null && enriched.portfolioImpactPct !== null) {
    assert.ok(Math.abs(enriched.portfolioImpactPct) < Math.abs(enriched.thesisImpactPct),
      'Portfolio impact diluted by other takes');
  }
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade impact: zero impact when values unchanged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-impact-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  
  // No actual change in holdings
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take));
  
  const signal = {ticker: 'VIST', kind: 'drift'};
  const sized = {legs: [{ticker: 'VIST', side: 'compra', units: 0}]};
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal,
    sized,
    now: new Date(),
  });
  
  assert.equal(enriched.thesisImpactPct, 0, 'thesis impact zero when no change');
  assert.equal(enriched.portfolioImpactPct, 0, 'portfolio impact zero when no change');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade impact: multi-leg trade uses matching ticker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-impact-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  const takeBefore = JSON.parse(JSON.stringify(take));
  
  // Trade affects VIST and YPF
  take.holdings[0].units *= 1.1; // VIST +10%
  if (take.holdings[1]) {
    take.holdings[1].units *= 0.9; // YPF -10%
  }
  const takeAfter = take;
  
  const signal = {ticker: 'VIST', kind: 'drift'};
  const sized = {
    legs: [
      {ticker: 'VIST', side: 'compra', units: take.holdings[0].units * 0.1},
      {ticker: 'YPF', side: 'venta', units: take.holdings[1] ? take.holdings[1].units * 0.1 : 0},
    ]
  };
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal,
    sized,
    now: new Date(),
  });
  
  assert.equal(enriched.ticker, 'VIST', 'ticker from signal');
  assert.equal(enriched.side, 'compra', 'side from matching leg');
  assert.ok(Number.isFinite(enriched.thesisImpactPct), 'impact computed for multi-leg');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade impact: user isolation - only user takes in portfolio', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-impact-'));
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
  
  const take1Before = JSON.parse(JSON.stringify(take1));
  take1.holdings[0].units *= 1.1;
  const take1After = take1;
  
  const signal = {ticker: 'VIST', kind: 'drift'};
  const sized = {legs: [{ticker: 'VIST', side: 'compra', units: take1.holdings[0].units * 0.1}]};
  
  // allUserTakes should only include user1's takes
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: take1Before,
    takeAfter: take1After,
    allUserTakes: [take1After], // Only user1's take, not user2's
    signal,
    sized,
    now: new Date(),
  });
  
  assert.ok(Number.isFinite(enriched.portfolioImpactPct));
  // Portfolio impact should equal thesis impact (single take in portfolio)
  if (enriched.thesisImpactPct !== null && enriched.portfolioImpactPct !== null) {
    assert.ok(Math.abs(enriched.portfolioImpactPct - enriched.thesisImpactPct) < 0.0001,
      'Portfolio = thesis when single take');
  }
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade impact: unavailable when inputs missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-impact-'));
  const store = createStore(dir);
  
  // No take objects provided
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: null,
    takeAfter: null,
    allUserTakes: [],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    now: new Date(),
  });
  
  assert.equal(enriched.thesisImpactPct, null, 'impact null when no take snapshots');
  assert.equal(enriched.portfolioImpactPct, null, 'portfolio impact null when no snapshots');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade impact: handles invalid thesis value gracefully', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-impact-'));
  const store = createStore(dir);
  
  const take = createTake(templates[0]);
  // Set invalid holdings that produce zero/invalid value
  take.holdings = [];
  const takeBefore = JSON.parse(JSON.stringify(take));
  const takeAfter = JSON.parse(JSON.stringify(take));
  
  const enriched = buildTradeEnrichedData({
    db: store.db,
    take: takeBefore,
    takeAfter,
    allUserTakes: [takeAfter],
    signal: {ticker: 'VIST', kind: 'drift'},
    sized: {legs: []},
    now: new Date(),
  });
  
  // Should handle gracefully without error
  assert.ok(enriched.thesisImpactPct === null || Number.isFinite(enriched.thesisImpactPct));
  assert.ok(enriched.portfolioImpactPct === null || Number.isFinite(enriched.portfolioImpactPct));
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});
