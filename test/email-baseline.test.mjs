import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {buildDigestEnrichedData} from '../lib/email-enrichment.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'email-baseline-test-'));
}

function cleanup(dir) {
  try { rmSync(dir, {recursive: true}); } catch {}
}

test('Reproduction A: Take1 has -2,-1,today; Take2 only -2,today => use shared -2 baseline', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take1 = createTake(templates[0]);
    take1.title = 'Take1';
    activate(take1, 500000);
    scoped.putTake(take1);
    
    const take2 = createTake(templates[1]);
    take2.title = 'Take2';
    activate(take2, 500000);
    scoped.putTake(take2);
    
    // Take1: marks at -2, -1, today
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-04', 500000, 500000, 1)
    `).run(take1.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-05', 510000, 500000, 1)
    `).run(take1.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 525000, 500000, 1)
    `).run(take1.id, userId);
    
    // Take2: marks at -2, today (no -1)
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-04', 500000, 500000, 1)
    `).run(take2.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 525000, 500000, 1)
    `).run(take2.id, userId);
    
    const enriched = buildDigestEnrichedData({
      db,
      userId,
      takes: [take1, take2],
      now: new Date('2026-11-06T14:00:00-03:00'),
    });
    
    assert.ok(enriched, 'should have enriched data');
    
    // Portfolio should use -2 baseline (2026-11-04) since both takes have it
    // Portfolio: (1050000 - 1000000) / 1000000 = 0.05 = 5%
    assert.ok(Math.abs(enriched.portfolio.dayPct - 0.05) < 0.0001, 'portfolio should be 5%');
    
    // Both theses should use the same -2 baseline
    assert.equal(enriched.theses.length, 2, 'should have 2 theses');
    
    // Each thesis: (525000 - 500000) / 500000 = 0.05 = 5%
    for (const thesis of enriched.theses) {
      assert.ok(Math.abs(thesis.dayPct - 0.05) < 0.0001, `${thesis.name} should be 5%`);
    }
    
    // Contributions should sum to portfolio return
    const sumContributions = enriched.theses.reduce((sum, t) => sum + t.contributionPct, 0);
    assert.ok(Math.abs(sumContributions - 0.05) < 0.0001, 'contributions should sum to 5%');
  } finally {
    cleanup(dir);
  }
});

test('Reproduction B: marks only -6 days + today => both portfolio and thesis unavailable', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take = createTake(templates[0]);
    take.title = 'Test Thesis';
    activate(take, 1000000);
    scoped.putTake(take);
    
    // Marks at -6 days (outside 5-day window) and today
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-10-31', 1000000, 1000000, 1)
    `).run(take.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 1050000, 1000000, 1)
    `).run(take.id, userId);
    
    const enriched = buildDigestEnrichedData({
      db,
      userId,
      takes: [take],
      now: new Date('2026-11-06T14:00:00-03:00'),
    });
    
    assert.ok(enriched, 'should have enriched data structure');
    // No valid baseline within 5-day window: both should be unavailable
    assert.equal(enriched.portfolio.dayPct, null, 'portfolio should be unavailable (outside 5-day window)');
    assert.equal(enriched.theses.length, 0, 'theses should be empty (no valid baseline)');
  } finally {
    cleanup(dir);
  }
});

test('Inconsistent current-day mark coverage: missing today for one take => all unavailable', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take1 = createTake(templates[0]);
    take1.title = 'Take1';
    activate(take1, 500000);
    scoped.putTake(take1);
    
    const take2 = createTake(templates[1]);
    take2.title = 'Take2';
    activate(take2, 500000);
    scoped.putTake(take2);
    
    // Take1: has yesterday and today
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-05', 500000, 500000, 1)
    `).run(take1.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 525000, 500000, 1)
    `).run(take1.id, userId);
    
    // Take2: has yesterday but NO today
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-05', 500000, 500000, 1)
    `).run(take2.id, userId);
    
    const enriched = buildDigestEnrichedData({
      db,
      userId,
      takes: [take1, take2],
      now: new Date('2026-11-06T14:00:00-03:00'),
    });
    
    assert.ok(enriched, 'should have enriched data structure');
    // Missing today for one take: all comparative metrics unavailable
    assert.equal(enriched.portfolio.dayPct, null, 'portfolio should be unavailable (incomplete today)');
    assert.equal(enriched.theses.length, 0, 'theses should be empty (incomplete today)');
  } finally {
    cleanup(dir);
  }
});

test('Unified baseline: three takes with staggered history => all use same shared baseline', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take1 = createTake(templates[0]);
    take1.title = 'Take1';
    activate(take1, 300000);
    scoped.putTake(take1);
    
    const take2 = createTake(templates[1]);
    take2.title = 'Take2';
    activate(take2, 400000);
    scoped.putTake(take2);
    
    const take3 = createTake(templates[0]);
    take3.title = 'Take3';
    activate(take3, 300000);
    scoped.putTake(take3);
    
    // All have marks at -3 and today
    // Take1 also has -1, Take2 also has -2
    // Shared baseline must be -3 (where ALL have valid marks)
    
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-03', 300000, 300000, 1)
    `).run(take1.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-05', 310000, 300000, 1)
    `).run(take1.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 318000, 300000, 1)
    `).run(take1.id, userId);
    
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-03', 400000, 400000, 1)
    `).run(take2.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-04', 408000, 400000, 1)
    `).run(take2.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 424000, 400000, 1)
    `).run(take2.id, userId);
    
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-03', 300000, 300000, 1)
    `).run(take3.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 318000, 300000, 1)
    `).run(take3.id, userId);
    
    const enriched = buildDigestEnrichedData({
      db,
      userId,
      takes: [take1, take2, take3],
      now: new Date('2026-11-06T14:00:00-03:00'),
    });
    
    assert.ok(enriched);
    
    // Portfolio baseline: -3 (2026-11-03) where all have marks
    // Portfolio: (1060000 - 1000000) / 1000000 = 0.06 = 6%
    assert.ok(Math.abs(enriched.portfolio.dayPct - 0.06) < 0.0001, 'portfolio should be 6%');
    
    assert.equal(enriched.theses.length, 3, 'should have 3 theses');
    
    // All contributions must sum to portfolio return
    const sumContributions = enriched.theses.reduce((sum, t) => sum + t.contributionPct, 0);
    assert.ok(Math.abs(sumContributions - 0.06) < 0.0001, 'contributions should sum to 6%');
  } finally {
    cleanup(dir);
  }
});

test('Contributions reconciliation: deposit + market move with unified baseline', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take1 = createTake(templates[0]);
    take1.title = 'Stocks';
    activate(take1, 600000);
    scoped.putTake(take1);
    
    const take2 = createTake(templates[1]);
    take2.title = 'Bonds';
    activate(take2, 400000);
    scoped.putTake(take2);
    
    // Day -2: Total 1M (600K + 400K)
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-04', 600000, 600000, 1)
    `).run(take1.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-04', 400000, 400000, 1)
    `).run(take2.id, userId);
    
    // Today: Stocks 660K (+10%), Bonds 420K (no deposit, +5%)
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 660000, 600000, 1)
    `).run(take1.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 420000, 400000, 1)
    `).run(take2.id, userId);
    
    const enriched = buildDigestEnrichedData({
      db,
      userId,
      takes: [take1, take2],
      now: new Date('2026-11-06T14:00:00-03:00'),
    });
    
    assert.ok(enriched);
    
    // Portfolio: (1080000 - 1000000) / 1000000 = 0.08 = 8%
    assert.ok(Math.abs(enriched.portfolio.dayPct - 0.08) < 0.0001, 'portfolio should be 8%');
    
    assert.equal(enriched.theses.length, 2);
    
    // Stocks: 10% return on 600K = 60K P&L, contribution = 60K / 1000K = 6%
    // Bonds: 5% return on 400K = 20K P&L, contribution = 20K / 1000K = 2%
    // Sum: 8%
    const sumContributions = enriched.theses.reduce((sum, t) => sum + t.contributionPct, 0);
    assert.ok(Math.abs(sumContributions - 0.08) < 0.0001, 'contributions should sum to 8%');
  } finally {
    cleanup(dir);
  }
});
