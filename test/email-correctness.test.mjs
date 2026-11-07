import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {buildTradeEnrichedData, buildDigestEnrichedData} from '../lib/email-enrichment.mjs';
import {scheduleDailyDigest} from '../lib/email-alerts.mjs';
import {updateEmailPrefs} from '../lib/email.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'email-correctness-test-'));
}

function cleanup(dir) {
  try { rmSync(dir, {recursive: true}); } catch {}
}

test('Multi-leg trade: side matches executed leg for signal ticker, not legs[0]', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    
    const signal = {ticker: 'AAPL', kind: 'trigger'};
    const sized = {
      legs: [
        {ticker: 'MSFT', side: 'compra', amount: 100},
        {ticker: 'AAPL', side: 'venta', amount: 50},
        {ticker: 'GOOGL', side: 'compra', amount: 75},
      ],
    };
    
    const take = {
      id: 'take1',
      title: 'Tech Thesis',
      holdings: [
        {ticker: 'AAPL', units: 10, price: 150},
        {ticker: 'MSFT', units: 5, price: 300},
      ],
    };
    
    const takeAfter = {
      id: 'take1',
      title: 'Tech Thesis',
      holdings: [
        {ticker: 'AAPL', units: 5, price: 150},
        {ticker: 'MSFT', units: 10, price: 300},
      ],
    };
    
    const enriched = buildTradeEnrichedData({
      db,
      take,
      takeAfter,
      signal,
      sized,
    });
    
    assert.equal(enriched.ticker, 'AAPL', 'ticker should match signal.ticker');
    assert.equal(enriched.side, 'venta', 'side should match AAPL leg, not legs[0] (MSFT)');
  } finally {
    cleanup(dir);
  }
});

test('Multi-leg trade: invalid side enum stays null, never mapped to venta', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    
    const signal = {ticker: 'AAPL', kind: 'trigger'};
    const sized = {
      legs: [
        {ticker: 'AAPL', side: 'invalid_value', amount: 100},
      ],
    };
    
    const take = {id: 'take1', title: 'Thesis', holdings: []};
    const takeAfter = {id: 'take1', title: 'Thesis', holdings: []};
    
    const enriched = buildTradeEnrichedData({
      db,
      take,
      takeAfter,
      signal,
      sized,
    });
    
    assert.equal(enriched.side, null, 'invalid enum must stay null, never infer');
  } finally {
    cleanup(dir);
  }
});

test('Multi-leg trade: unknown side (missing leg) stays null', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    
    const signal = {ticker: 'TSLA', kind: 'trigger'};
    const sized = {
      legs: [
        {ticker: 'AAPL', side: 'compra', amount: 100},
        {ticker: 'MSFT', side: 'venta', amount: 50},
      ],
    };
    
    const take = {id: 'take1', title: 'Thesis', holdings: []};
    const takeAfter = {id: 'take1', title: 'Thesis', holdings: []};
    
    const enriched = buildTradeEnrichedData({
      db,
      take,
      takeAfter,
      signal,
      sized,
    });
    
    assert.equal(enriched.ticker, 'TSLA');
    assert.equal(enriched.side, null, 'no matching leg for TSLA, side must stay null');
  } finally {
    cleanup(dir);
  }
});

test('Threshold: +0.1% portfolio with 50% threshold should NOT send (respect contract)', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    const userId = store.ownerUserId();
    
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(db, userId, {
      thresholdAssetPct: 50.0,
      thresholdPortfolioPct: 50.0,
    }, {now: () => Date.now()});
    
    const enrichedData = {
      portfolio: {dayPct: 0.001, weekPct: null}, // 0.1%
      theses: [
        {name: 'Tech', dayPct: 0.001, contributionPct: 0.001},
      ],
      takeaway: null,
      autoActions: [],
      alertsFired: [],
      newsItems: [],
    };
    
    const result = scheduleDailyDigest(db, {
      userId,
      enrichedData,
    });
    
    assert.equal(result.scheduled, false, 'should not send: portfolio 0.1% < 50% threshold');
    assert.equal(result.reason, 'no_significant_changes');
  } finally {
    cleanup(dir);
  }
});

test('Threshold: +51% portfolio with 50% threshold SHOULD send', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    const userId = store.ownerUserId();
    
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(db, userId, {
      thresholdAssetPct: 50.0,
      thresholdPortfolioPct: 50.0,
    }, {now: () => Date.now()});
    
    const enrichedData = {
      portfolio: {dayPct: 0.51, weekPct: null},
      theses: [],
      takeaway: null,
      autoActions: [],
      alertsFired: [],
      newsItems: [],
    };
    
    const result = scheduleDailyDigest(db, {
      userId,
      enrichedData,
    });
    
    assert.equal(result.scheduled, true, 'should send: 51% >= 50% threshold');
  } finally {
    cleanup(dir);
  }
});

test('Threshold: exactly 50% with 50% threshold SHOULD send', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    const userId = store.ownerUserId();
    
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(db, userId, {
      thresholdAssetPct: 50.0,
      thresholdPortfolioPct: 50.0,
    }, {now: () => Date.now()});
    
    const enrichedData = {
      portfolio: {dayPct: 0.50, weekPct: null},
      theses: [],
      takeaway: null,
      autoActions: [],
      alertsFired: [],
      newsItems: [],
    };
    
    const result = scheduleDailyDigest(db, {
      userId,
      enrichedData,
    });
    
    assert.equal(result.scheduled, true, 'should send: 50% >= 50% threshold (exact)');
  } finally {
    cleanup(dir);
  }
});

test('Contributions: deposit-only with flat market should yield zero contribution', () => {
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
    
    // Day 1: 1M portfolio, 1M invested
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-05', 1000000, 1000000, 1)
    `).run(take.id, userId);
    
    // Day 2: 1.1M portfolio (100K deposit), 1.1M invested, flat market
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 1100000, 1100000, 1)
    `).run(take.id, userId);
    
    const enriched = buildDigestEnrichedData({
      db,
      userId,
      takes: [take],
      now: new Date('2026-11-06T14:00:00-03:00'),
    });
    
    assert.ok(enriched, 'should have enriched data');
    assert.equal(enriched.theses.length, 1);
    assert.equal(enriched.theses[0].dayPct, 0, 'dayPct should be 0 (flat after cashflow adjustment)');
    assert.equal(enriched.theses[0].contributionPct, 0, 'contributionPct should be 0 (no P&L)');
  } finally {
    cleanup(dir);
  }
});

test('Contributions: multi-take reconciliation sums to portfolio return', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const db = store.db;
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take1 = createTake(templates[0]);
    take1.title = 'Tech';
    activate(take1, 500000);
    scoped.putTake(take1);
    
    const take2 = createTake(templates[1]);
    take2.title = 'Bonds';
    activate(take2, 500000);
    scoped.putTake(take2);
    
    // Day 1: Tech 500K invested/500K value, Bonds 500K invested/500K value
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-05', 500000, 500000, 1)
    `).run(take1.id, userId);
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-05', 500000, 500000, 1)
    `).run(take2.id, userId);
    
    // Day 2: Tech +10% return (550K value, 500K invested), Bonds +5% return (525K value, 500K invested)
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 550000, 500000, 1)
    `).run(take1.id, userId);
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
    
    assert.ok(enriched);
    assert.equal(enriched.theses.length, 2);
    
    // Portfolio return: (1075000 - 1000000) / 1000000 = 0.075 = 7.5%
    assert.ok(Math.abs(enriched.portfolio.dayPct - 0.075) < 0.0001, 'portfolio return should be ~7.5%');
    
    // Sum of contributions should equal portfolio return
    const sumContributions = enriched.theses.reduce((sum, t) => sum + t.contributionPct, 0);
    assert.ok(Math.abs(sumContributions - 0.075) < 0.0001, 'sum of contributions should equal portfolio return');
  } finally {
    cleanup(dir);
  }
});

test('Contributions: withdrawal reduces invested, P&L calculated correctly', () => {
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
    
    // Day 1: 1M value, 1M invested
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-05', 1000000, 1000000, 1)
    `).run(take.id, userId);
    
    // Day 2: 950K value (50K withdrawal + flat market), 950K invested
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 950000, 950000, 1)
    `).run(take.id, userId);
    
    const enriched = buildDigestEnrichedData({
      db,
      userId,
      takes: [take],
      now: new Date('2026-11-06T14:00:00-03:00'),
    });
    
    assert.ok(enriched);
    assert.equal(enriched.theses[0].dayPct, 0, 'dayPct should be 0 (flat after cashflow adjustment)');
    assert.equal(enriched.theses[0].contributionPct, 0, 'contributionPct should be 0');
  } finally {
    cleanup(dir);
  }
});

test('Contributions: Monday uses Friday baseline, not missing Sunday', () => {
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
    
    // Friday 2026-11-06
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 1000000, 1000000, 1)
    `).run(take.id, userId);
    
    // No marks Saturday/Sunday
    
    // Monday 2026-11-09 (3 days later)
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-09', 1050000, 1000000, 1)
    `).run(take.id, userId);
    
    const enriched = buildDigestEnrichedData({
      db,
      userId,
      takes: [take],
      now: new Date('2026-11-09T14:00:00-03:00'),
    });
    
    assert.ok(enriched, 'should find Friday as prior baseline');
    assert.equal(enriched.theses.length, 1);
    assert.ok(Math.abs(enriched.theses[0].dayPct - 0.05) < 0.0001, 'should compute return vs Friday baseline');
  } finally {
    cleanup(dir);
  }
});

test('Contributions: missing baseline day yields empty theses array', () => {
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
    
    // Only today's mark, no prior baseline
    db.prepare(`
      INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, '2026-11-06', 1000000, 1000000, 1)
    `).run(take.id, userId);
    
    const enriched = buildDigestEnrichedData({
      db,
      userId,
      takes: [take],
      now: new Date('2026-11-06T14:00:00-03:00'),
    });
    
    assert.ok(enriched);
    assert.equal(enriched.theses.length, 0, 'no prior baseline, no thesis rows');
  } finally {
    cleanup(dir);
  }
});
