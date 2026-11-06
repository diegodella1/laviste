/**
 * Integration tests: producers -> payload -> queued HTML+text
 * Verify end-to-end flow from daily marks and auto trades to email queue.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates, value} from '../lib/engine.mjs';
import {updateEmailPrefs} from '../lib/email.mjs';
import {createDailyMarksJob} from '../lib/daily-marks.mjs';
import {createAutoRunner} from '../lib/auto/runner.mjs';
import {recordActivationOps} from '../lib/ops.mjs';
import {buildDigestEnrichedData, buildTradeEnrichedData} from '../lib/email-enrichment.mjs';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildDigestHtml} from '../lib/email-templates/digest-html.mjs';
import {buildDigestText} from '../lib/email-templates/digest-text.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'email-integration-test-'));
}

function cleanup(dir) {
  try { rmSync(dir, {recursive: true}); } catch {}
}

function quote(ticker, price, asOf) {
  return {ticker, price, asOf, eligible: true, delay: 'now', stale: false};
}

function quotesApi(take, asOf) {
  const map = {};
  for (const h of take.holdings) {
    map[h.ticker] = quote(h.ticker, h.price, asOf);
  }
  return {
    getCached: ticker => map[ticker] || null,
    getBenchmarkCached: () => null,
    isDemo: () => false,
  };
}

test('Daily marks produces digest with enriched data', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {newsEnabled: true, thresholdPortfolioPct: 1.0}, {now: () => Date.now()});
    
    const scoped = store.forUser(userId);
    const take = createTake(templates[0]);
    activate(take, 1000000);
    take.realPricesAt = '2026-10-28T15:00:00.000Z';
    take.monitoringPaused = false;
    take.scenario = 'normal';
    
    // Inflate prices to trigger threshold
    for (const h of take.holdings) {
      h.price = h.price * 1.03;
    }
    
    scoped.putTake(take);
    
    // Insert historical marks for yesterday and today to enable daily return calculation
    const yesterday = '2026-10-27';
    const today = '2026-10-28';
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, yesterday, 1000000, 1000000);
    
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, today, 1030000, 1000000);
    
    const job = createDailyMarksJob({
      store,
      quotes: quotesApi(take, '2026-10-28T20:00:00.000Z'),
      now: () => new Date('2026-10-28T20:30:00.000Z'),
      env: {FEATURE_EMAIL: '1'},
    });
    
    const result = job.write({force: true});
    assert.ok(!result.skipped);
    assert.ok(result.written > 0);
    
    const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? AND user_id = ?')
      .get('daily_digest', userId);
    
    assert.ok(outbox, 'Digest email should be queued');
    assert.ok(outbox.body_html, 'Should have HTML body');
    assert.ok(outbox.body_text, 'Should have text body');
    assert.ok(outbox.subject.toLowerCase().includes('cartera') || outbox.subject.toLowerCase().includes('resumen'), 'Subject should mention portfolio or summary');
    
    // Verify enriched data is present in HTML
    assert.ok(outbox.body_html.includes(take.title), 'HTML should include thesis name');
    assert.ok(outbox.body_html.includes('%'), 'HTML should include percentages');
    assert.ok(outbox.body_html.includes('cartera'), 'HTML should include portfolio text');
    
    // Verify text fallback matches
    assert.ok(outbox.body_text.includes(take.title), 'Text should include thesis name');
    assert.ok(outbox.body_text.includes('%'), 'Text should include percentages');
    assert.ok(outbox.body_text.includes('cartera'), 'Text should include portfolio text');
    
    // Verify no currency amounts
    assert.ok(!outbox.body_html.match(/\$|USD|ARS|EUR/), 'HTML should not have currency');
    assert.ok(!outbox.body_text.match(/\$|USD|ARS|EUR/), 'Text should not have currency');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Trade enrichment uses actual before/after weights', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    const scoped = store.forUser(userId);
    const takeBefore = createTake(templates[0]);
    activate(takeBefore, 1000000);
    takeBefore.userId = userId;
    scoped.putTake(takeBefore);
    
    // Clone and modify for after state
    const takeAfter = JSON.parse(JSON.stringify(takeBefore));
    const holding = takeAfter.holdings.find(h => h.ticker === 'YPF');
    holding.units = holding.units * 1.2; // Increased by 20%
    
    const allUserTakes = [takeBefore];
    
    const enriched = buildTradeEnrichedData({
      db: store.db,
      take: takeBefore,
      takeAfter,
      allUserTakes,
      signal: {ticker: 'YPF', kind: 'drift'},
      sized: {legs: [{side: 'compra'}]},
      now: new Date('2026-10-20T15:00:00-03:00'),
    });
    
    assert.ok(enriched, 'Should have enriched data');
    assert.equal(enriched.ticker, 'YPF', 'Should have ticker');
    assert.equal(enriched.side, 'compra', 'Should be compra from sized legs');
    assert.ok(Number.isFinite(enriched.weightBeforePct), 'Should have weightBeforePct from actual holdings');
    assert.ok(Number.isFinite(enriched.weightAfterPct), 'Should have weightAfterPct from actual holdings');
    assert.ok(enriched.weightAfterPct > enriched.weightBeforePct, 'Weight should increase after buy');
    
    // Trade enrichment does NOT include portfolio day return (stale marks limitation)
    assert.equal(enriched.portfolioDayPct, null, 'Trade alerts do not include portfolio day return (stale marks)');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Digest portfolio day return differs from thesis return with multiple takes', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    // Create two takes (two theses)
    const take1 = createTake(templates[0]);
    activate(take1, 1000000); // 1M invested
    take1.userId = userId;
    scoped.putTake(take1);
    
    const take2 = createTake(templates[1] || templates[0]);
    activate(take2, 500000); // 500K invested
    take2.userId = userId;
    scoped.putTake(take2);
    
    const yesterday = '2026-10-20';
    const today = '2026-10-21';
    
    // Take1: +3% day return (1M → 1.03M)
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take1.id, userId, yesterday, 1000000, 1000000);
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take1.id, userId, today, 1030000, 1000000);
    
    // Take2: -1% day return (500K → 495K)
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take2.id, userId, yesterday, 500000, 500000);
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take2.id, userId, today, 495000, 500000);
    
    // Portfolio: (1.03M + 495K) / (1M + 500K) - 1 = 1.525M / 1.5M - 1 = +1.67%
    
    const allUserTakes = [take1, take2];
    
    // Use buildDigestEnrichedData (not trade) for portfolio-level metrics
    const enriched = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: allUserTakes,
      now: new Date('2026-10-21T15:00:00-03:00'),
    });
    
    assert.ok(enriched, 'Should have enriched digest data');
    assert.ok(enriched.portfolio.dayPct !== null, 'Digest should have portfolio day return');
    
    // Portfolio return (~1.67%) should differ from thesis 1 return (+3%)
    assert.ok(Math.abs(enriched.portfolio.dayPct - 0.03) > 0.005, 
      `Portfolio return (${(enriched.portfolio.dayPct * 100).toFixed(2)}%) should differ from single thesis +3%`);
    
    // Should be approximately +1.67%
    assert.ok(Math.abs(enriched.portfolio.dayPct - 0.0167) < 0.002,
      `Portfolio return should be ~1.67% (actual: ${(enriched.portfolio.dayPct * 100).toFixed(2)}%)`);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Daily return uses historical marks, not inception', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    const scoped = store.forUser(userId);
    const take = createTake(templates[0]);
    activate(take, 1000000);
    scoped.putTake(take);
    
    // Insert historical marks for yesterday and today
    const yesterday = '2026-11-05';
    const today = '2026-11-06';
    
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, yesterday, 1020000, 1000000); // +2% from inception
    
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, today, 1030200, 1000000); // +1% from yesterday, +3.02% from inception
    
    const enriched = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-11-06T20:00:00-03:00'),
    });
    
    assert.ok(enriched, 'Should have enriched data');
    assert.ok(enriched.portfolio.dayPct !== null, 'Should have portfolio day return');
    
    // Daily return should be ~1%, NOT ~3.02%
    assert.ok(Math.abs(enriched.portfolio.dayPct - 0.01) < 0.001, 
      `Day return should be ~1% (${(enriched.portfolio.dayPct * 100).toFixed(2)}%), not inception return`);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Omit portfolio metric when marks missing for today or yesterday', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take = createTake(templates[0]);
    activate(take, 1000000);
    scoped.putTake(take);
    
    // Only insert today's mark (no yesterday)
    const today = '2026-11-06';
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, today, 1020000, 1000000);
    
    const enriched = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-11-06T20:00:00-03:00'),
    });
    
    // Should omit portfolio day return when yesterday's mark is missing
    assert.ok(enriched, 'Should have enriched data structure');
    assert.equal(enriched.portfolio.dayPct, null, 'Should omit dayPct when yesterday mark missing');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Daily return handles cashflow (new investment) correctly', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take = createTake(templates[0]);
    activate(take, 1000000);
    scoped.putTake(take);
    
    const yesterday = '2026-11-05';
    const today = '2026-11-06';
    
    // Yesterday: 1M invested, 1M value
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, yesterday, 1000000, 1000000);
    
    // Today: 1.1M invested (100K new investment), 1.15M value
    // Without flow adjustment: (1.15M / 1M) - 1 = 15% WRONG
    // With flow adjustment: (1.15M / (1M + 100K)) - 1 = 4.55% CORRECT
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, today, 1150000, 1100000);
    
    const enriched = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-11-06T20:00:00-03:00'),
    });
    
    assert.ok(enriched.portfolio.dayPct !== null, 'Should have portfolio day return');
    
    // Should be ~4.55%, NOT ~15%
    assert.ok(Math.abs(enriched.portfolio.dayPct - 0.0455) < 0.001,
      `Day return should be ~4.55% with cashflow adjustment (actual: ${(enriched.portfolio.dayPct * 100).toFixed(2)}%)`);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Trade with unknown side uses neutral operación copy', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const takeBefore = createTake(templates[0]);
    activate(takeBefore, 1000000);
    takeBefore.userId = userId;
    scoped.putTake(takeBefore);
    
    const takeAfter = JSON.parse(JSON.stringify(takeBefore));
    
    // Call enrichment without sized - side will be null
    const enriched = buildTradeEnrichedData({
      db: store.db,
      take: takeBefore,
      takeAfter,
      allUserTakes: [takeBefore],
      signal: {ticker: 'YPF', kind: 'drift'}, // No sized parameter
      now: new Date('2026-10-20T15:00:00-03:00'),
    });
    
    assert.equal(enriched.side, null, 'Side should be null when sized unavailable');
    
    const html = buildTradeHtml({
      ticker: 'YPFD',
      side: null, // Unknown side
      thesisName: 'Energía',
      date: new Date(),
      weightBeforePct: 0.20,
      weightAfterPct: 0.25,
      weightDeltaPct: 0.05,
      assetDayPct: null,
      portfolioDayPct: null,
      reasonPlain: 'Test',
      thesisImpactPct: null,
      portfolioImpactPct: null,
    });
    
    // Should use neutral "Operación simulada" not "Compra" or "Venta"
    assert.ok(html.includes('Operación simulada'), 'Should use neutral "Operación simulada"');
    assert.ok(!html.includes('Compra simulada'), 'Should NOT say "Compra simulada"');
    assert.ok(!html.includes('Venta simulada'), 'Should NOT say "Venta simulada"');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Trade always omits portfolio block due to stale marks limitation', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const takeBefore = createTake(templates[0]);
    activate(takeBefore, 1000000);
    takeBefore.userId = userId;
    scoped.putTake(takeBefore);
    
    const takeAfter = JSON.parse(JSON.stringify(takeBefore));
    
    // Insert marks for today - still should return null for trades
    const today = '2026-10-20';
    const yesterday = '2026-10-19';
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(takeBefore.id, userId, yesterday, 1000000, 1000000);
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(takeBefore.id, userId, today, 1020000, 1000000);
    
    // Trade occurs post-17:30 with today's marks present
    const enriched = buildTradeEnrichedData({
      db: store.db,
      take: takeBefore,
      takeAfter,
      allUserTakes: [takeBefore],
      signal: {ticker: 'YPF', kind: 'drift'},
      sized: {legs: [{side: 'compra'}]},
      now: new Date('2026-10-20T21:00:00-03:00'), // Post-17:30
    });
    
    // Should ALWAYS be null for trade alerts (stale marks limitation)
    assert.equal(enriched.portfolioDayPct, null, 'Trade alerts must always have null portfolioDayPct (stale marks)');
    
    const html = buildTradeHtml({
      ticker: 'YPFD',
      side: 'compra',
      thesisName: 'Energía',
      date: new Date(),
      weightBeforePct: 0.20,
      weightAfterPct: 0.25,
      weightDeltaPct: 0.05,
      assetDayPct: null,
      portfolioDayPct: null,
      reasonPlain: 'Test',
      thesisImpactPct: null,
      portfolioImpactPct: null,
    });
    
    // Block must be omitted
    assert.ok(!html.includes('Tu cartera hoy'), 'Portfolio block must be omitted (stale marks)');
    assert.ok(!html.includes('después de esta operación'), 'Portfolio block must be omitted (stale marks)');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Daily return correctly adjusts for cashflow (new investment)', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take = createTake(templates[0]);
    activate(take, 1000000);
    take.userId = userId;
    scoped.putTake(take);
    
    // Day 1: invested 1M, value 1M
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, '2026-10-18', 1000000, 1000000);
    
    // Day 2: added 200k more (invested = 1.2M), value grew to 1.24M
    // Without flow adjustment: (1.24M - 1M) / 1M = +24%
    // With flow adjustment: cashflow = 200k, denom = 1M + 200k = 1.2M, return = 1.24M / 1.2M - 1 = +3.33%
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, '2026-10-19', 1240000, 1200000);
    
    const enriched = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-10-19T15:00:00-03:00'),
    });
    
    // Should be approximately +3.33%, not +24%
    assert.ok(enriched !== null, 'buildDigestEnrichedData should return data');
    assert.ok(enriched.portfolio.dayPct !== null, 'Should compute portfolio day return');
    assert.ok(Math.abs(enriched.portfolio.dayPct - 0.0333) < 0.001, `Expected ~3.33%, got ${(enriched.portfolio.dayPct * 100).toFixed(2)}%`);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Digest uses Friday marks for Monday (weekend baseline)', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take = createTake(templates[0]);
    activate(take, 1000000);
    take.userId = userId;
    scoped.putTake(take);
    
    // Friday Nov 1
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, '2026-11-01', 1000000, 1000000);
    
    // No marks for Saturday Nov 2 or Sunday Nov 3 (weekend)
    
    // Monday Nov 4
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, '2026-11-04', 1050000, 1000000);
    
    const enriched = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-11-04T15:00:00-03:00'),
    });
    
    assert.ok(enriched !== null, 'Should have enriched data');
    assert.ok(enriched.portfolio.dayPct !== null, 'Should compute return using Friday as baseline');
    // Friday 1M → Monday 1.05M = +5%
    assert.ok(Math.abs(enriched.portfolio.dayPct - 0.05) < 0.001, `Expected ~5%, got ${(enriched.portfolio.dayPct * 100).toFixed(2)}%`);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Digest returns null when baseline >5 days stale', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take = createTake(templates[0]);
    activate(take, 1000000);
    take.userId = userId;
    scoped.putTake(take);
    
    // Mark 6 days ago
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, '2026-10-25', 1000000, 1000000);
    
    // Mark today (Oct 31), but gap >5 days
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, '2026-10-31', 1050000, 1000000);
    
    const enriched = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-10-31T15:00:00-03:00'),
    });
    
    assert.ok(enriched !== null, 'Should have enriched data');
    assert.equal(enriched.portfolio.dayPct, null, 'Should return null when baseline >5 days stale');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Portfolio day return is null when yesterday marks missing', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take = createTake(templates[0]);
    activate(take, 1000000);
    take.userId = userId;
    scoped.putTake(take);
    
    // Only today's mark, no yesterday
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, '2026-10-19', 1100000, 1000000);
    
    const enriched = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-10-19T15:00:00-03:00'),
    });
    
    assert.ok(enriched !== null, 'buildDigestEnrichedData should return data');
    assert.equal(enriched.portfolio.dayPct, null, 'Should return null when yesterday mark missing');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Digest shows honest unavailable message when data unknown', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    const scoped = store.forUser(userId);
    
    const take = createTake(templates[0]);
    activate(take, 1000000);
    take.userId = userId;
    scoped.putTake(take);
    
    // No marks inserted - data unavailable
    const enriched = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-10-19T15:00:00-03:00'),
    });
    
    assert.ok(enriched !== null, 'Should have enriched data structure');
    assert.equal(enriched.portfolio.dayPct, null, 'Portfolio day return should be null (no marks)');
    
    const html = buildDigestHtml({
      userName: 'test',
      date: new Date(),
      portfolio: enriched.portfolio,
      theses: enriched.theses,
      takeaway: enriched.takeaway,
      autoActions: enriched.autoActions,
      alertsFired: enriched.alertsFired,
      tip: null,
      newsItems: enriched.newsItems,
      prefs: {},
    });
    
    // Should NOT claim "no movements" when data unknown
    assert.ok(!html.includes('no hubo movimientos'), 'Should NOT claim "no hubo movimientos" when data unavailable');
    assert.ok(html.includes('no está disponible todavía') || html.includes('not available'), 
      'Should show honest unavailable message');
    
    const text = buildDigestText({
      userName: 'test',
      date: new Date(),
      portfolio: enriched.portfolio,
      theses: enriched.theses,
      takeaway: enriched.takeaway,
      autoActions: enriched.autoActions,
      alertsFired: enriched.alertsFired,
      tip: null,
      newsItems: enriched.newsItems,
      prefs: {},
    });
    
    assert.ok(!text.includes('no hubo movimientos'), 'Text should NOT claim "no hubo movimientos" when data unavailable');
    assert.ok(text.includes('no está disponible todavía'), 'Text should show honest unavailable message');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Digest respects newsEnabled preference', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {newsEnabled: false, thresholdPortfolioPct: 1.0});
    
    const scoped = store.forUser(userId);
    const take = createTake(templates[0]);
    activate(take, 1000000);
    take.realPricesAt = '2026-10-28T15:00:00.000Z';
    take.monitoringPaused = false;
    
    for (const h of take.holdings) {
      h.price = h.price * 1.03;
    }
    
    scoped.putTake(take);
    
    // Insert historical marks for yesterday and today
    const yesterday = '2026-10-27';
    const today = '2026-10-28';
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, yesterday, 1000000, 1000000);
    
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, today, 1030000, 1000000);
    
    const job = createDailyMarksJob({
      store,
      quotes: quotesApi(take, '2026-10-28T20:00:00.000Z'),
      now: () => new Date('2026-10-28T20:30:00.000Z'),
      env: {FEATURE_EMAIL: '1'},
    });
    
    job.write({force: true});
    
    const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? AND user_id = ?')
      .get('daily_digest', userId);
    
    assert.ok(outbox, 'Digest should be queued');
    
    // News should not appear when newsEnabled is false
    assert.ok(!outbox.body_html.includes('NOTICIAS'), 'HTML should not have news section when disabled');
    assert.ok(!outbox.body_text.includes('NOTICIAS'), 'Text should not have news section when disabled');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Digest autoActions populated from persisted trade alerts for same user/day', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'user1@example.com', ownerPassword: 'test-password-123'});
    const user1 = store.ownerUserId();
    
    // Create second user
    const user2 = randomUUID();
    store.db.prepare('INSERT INTO users (id, email, email_verified, password_hash, role, created_at) VALUES (?, ?, 1, ?, ?, ?)')
      .run(user2, 'user2@example.com', '', 'user', new Date().toISOString());
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user1);
    updateEmailPrefs(store.db, user1, {thresholdPortfolioPct: 1.0}, {now: () => Date.now()});
    
    const scoped1 = store.forUser(user1);
    const take1 = createTake(templates[0]);
    activate(take1, 1000000);
    take1.realPricesAt = '2026-10-28T15:00:00.000Z';
    take1.monitoringPaused = false;
    scoped1.putTake(take1);
    
    // Insert marks for user1
    const yesterday = '2026-10-27';
    const today = '2026-10-28';
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take1.id, user1, yesterday, 1000000, 1000000);
    
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take1.id, user1, today, 1030000, 1000000);
    
    // Record trade alerts for user1 on today (within ART day bounds)
    const windowStart1 = new Date('2026-10-28T15:00:00.000Z'); // Within today's ART day
    const windowEnd1 = new Date('2026-10-28T16:00:00.000Z');
    const alert1 = {
      id: randomUUID(),
      user_id: user1,
      alert_type: 'trades',
      window_start: windowStart1.toISOString(),
      window_end: windowEnd1.toISOString(),
      event_count: 1,
      events_json: JSON.stringify([{
        ticker: 'YPFD',
        side: 'compra',
        thesisName: 'Energía local',
        reasonPlain: 'YPFD se desvió del peso objetivo',
        at: windowStart1.toISOString(),
      }]),
      status: 'pending',
      created_at: windowStart1.toISOString(),
    };
    store.db.prepare(`
      INSERT INTO email_alert_groups (id, user_id, alert_type, window_start, window_end, event_count, events_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(alert1.id, alert1.user_id, alert1.alert_type, alert1.window_start, alert1.window_end, alert1.event_count, alert1.events_json, alert1.status, alert1.created_at);
    
    // Record trade alert for user2 on same day (should be excluded)
    const alert2 = {
      id: randomUUID(),
      user_id: user2,
      alert_type: 'trades',
      window_start: windowStart1.toISOString(),
      window_end: windowEnd1.toISOString(),
      event_count: 1,
      events_json: JSON.stringify([{
        ticker: 'PAMP',
        side: 'venta',
        thesisName: 'Cobertura',
        reasonPlain: 'PAMP superó el tope',
        at: windowStart1.toISOString(),
      }]),
      status: 'pending',
      created_at: windowStart1.toISOString(),
    };
    store.db.prepare(`
      INSERT INTO email_alert_groups (id, user_id, alert_type, window_start, window_end, event_count, events_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(alert2.id, alert2.user_id, alert2.alert_type, alert2.window_start, alert2.window_end, alert2.event_count, alert2.events_json, alert2.status, alert2.created_at);
    
    // Build enriched data
    const enrichedData = buildDigestEnrichedData({
      db: store.db,
      userId: user1,
      takes: [take1],
      now: new Date('2026-10-28T20:00:00.000Z'),
    });
    
    assert.ok(enrichedData, 'Should return enriched data');
    assert.ok(Array.isArray(enrichedData.autoActions), 'Should have autoActions array');
    assert.equal(enrichedData.autoActions.length, 1, 'Should have exactly 1 action for user1');
    
    const action = enrichedData.autoActions[0];
    assert.equal(action.ticker, 'YPFD', 'Should have correct ticker');
    assert.equal(action.side, 'compra', 'Should have correct side');
    assert.equal(action.thesisName, 'Energía local', 'Should have correct thesis name');
    assert.equal(action.reasonPlain, 'YPFD se desvió del peso objetivo', 'Should have correct reason');
    
    // Verify user2's action is excluded
    assert.ok(!enrichedData.autoActions.some(a => a.ticker === 'PAMP'), 'Should not include other user\'s actions');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Digest autoActions respects ART day boundaries', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {thresholdPortfolioPct: 1.0}, {now: () => Date.now()});
    
    const scoped = store.forUser(userId);
    const take = createTake(templates[0]);
    activate(take, 1000000);
    take.realPricesAt = '2026-10-28T15:00:00.000Z';
    take.monitoringPaused = false;
    scoped.putTake(take);
    
    const yesterday = '2026-10-27';
    const today = '2026-10-28';
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, yesterday, 1000000, 1000000);
    
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, today, 1030000, 1000000);
    
    // Trade alert from yesterday (outside today's ART day: should be excluded)
    // ART day 2026-10-28 starts at 2026-10-28T03:00:00Z
    const yesterdayAlert = new Date('2026-10-28T02:59:59.000Z'); // Just before today's ART day start
    store.db.prepare(`
      INSERT INTO email_alert_groups (id, user_id, alert_type, window_start, window_end, event_count, events_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), userId, 'trades',
      yesterdayAlert.toISOString(),
      new Date(yesterdayAlert.getTime() + 3600000).toISOString(),
      1,
      JSON.stringify([{ticker: 'OLD', side: 'compra', thesisName: 'Test', reasonPlain: 'Yesterday trade'}]),
      'pending',
      yesterdayAlert.toISOString()
    );
    
    // Trade alert from today (within ART day: should be included)
    const todayAlert = new Date('2026-10-28T15:00:00.000Z'); // Well within today's ART day
    store.db.prepare(`
      INSERT INTO email_alert_groups (id, user_id, alert_type, window_start, window_end, event_count, events_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), userId, 'trades',
      todayAlert.toISOString(),
      new Date(todayAlert.getTime() + 3600000).toISOString(),
      1,
      JSON.stringify([{ticker: 'TODAY', side: 'venta', thesisName: 'Test', reasonPlain: 'Today trade'}]),
      'pending',
      todayAlert.toISOString()
    );
    
    const enrichedData = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-10-28T20:00:00.000Z'),
    });
    
    assert.ok(enrichedData, 'Should return enriched data');
    assert.equal(enrichedData.autoActions.length, 1, 'Should have exactly 1 action from today');
    assert.equal(enrichedData.autoActions[0].ticker, 'TODAY', 'Should only include today\'s action');
    assert.ok(!enrichedData.autoActions.some(a => a.ticker === 'OLD'), 'Should not include yesterday\'s action');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Digest autoActions handles true empty day', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {thresholdPortfolioPct: 1.0}, {now: () => Date.now()});
    
    const scoped = store.forUser(userId);
    const take = createTake(templates[0]);
    activate(take, 1000000);
    take.realPricesAt = '2026-10-28T15:00:00.000Z';
    take.monitoringPaused = false;
    scoped.putTake(take);
    
    const yesterday = '2026-10-27';
    const today = '2026-10-28';
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, yesterday, 1000000, 1000000);
    
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, today, 1030000, 1000000);
    
    // No trade alerts recorded for today
    
    const enrichedData = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-10-28T20:00:00.000Z'),
    });
    
    assert.ok(enrichedData, 'Should return enriched data');
    assert.ok(Array.isArray(enrichedData.autoActions), 'Should have autoActions array');
    assert.equal(enrichedData.autoActions.length, 0, 'Should have empty actions array for true empty day');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Digest autoActions handles missing optional fields gracefully', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {thresholdPortfolioPct: 1.0}, {now: () => Date.now()});
    
    const scoped = store.forUser(userId);
    const take = createTake(templates[0]);
    activate(take, 1000000);
    take.realPricesAt = '2026-10-28T15:00:00.000Z';
    take.monitoringPaused = false;
    scoped.putTake(take);
    
    const yesterday = '2026-10-27';
    const today = '2026-10-28';
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, yesterday, 1000000, 1000000);
    
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, today, 1030000, 1000000);
    
    // Record trade alert with missing side (null) and default values for optional fields
    const windowStart = new Date('2026-10-28T15:00:00.000Z');
    store.db.prepare(`
      INSERT INTO email_alert_groups (id, user_id, alert_type, window_start, window_end, event_count, events_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), userId, 'trades',
      windowStart.toISOString(),
      new Date(windowStart.getTime() + 3600000).toISOString(),
      2,
      JSON.stringify([
        {
          ticker: 'VIST',
          side: null, // Missing side
          thesisName: '', // Empty thesis name
          reasonPlain: '', // Empty reason
        },
        {
          ticker: 'GGAL',
          // side completely omitted
          // thesisName omitted
          // reasonPlain omitted
        },
      ]),
      'pending',
      windowStart.toISOString()
    );
    
    const enrichedData = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-10-28T20:00:00.000Z'),
    });
    
    assert.ok(enrichedData, 'Should return enriched data');
    assert.equal(enrichedData.autoActions.length, 2, 'Should have 2 actions');
    
    const action1 = enrichedData.autoActions[0];
    assert.equal(action1.ticker, 'VIST', 'Should have ticker');
    assert.equal(action1.side, null, 'Should preserve null side');
    assert.equal(action1.thesisName, 'Tesis', 'Should use fallback thesis name');
    assert.equal(action1.reasonPlain, 'Operación automática de práctica', 'Should use fallback reason');
    
    const action2 = enrichedData.autoActions[1];
    assert.equal(action2.ticker, 'GGAL', 'Should have ticker');
    assert.equal(action2.side, null, 'Should default missing side to null');
    assert.equal(action2.thesisName, 'Tesis', 'Should use fallback thesis name');
    assert.equal(action2.reasonPlain, 'Operación automática de práctica', 'Should use fallback reason');
    
    // Verify neutral rendering in templates
    const html = buildDigestHtml({
      date: new Date('2026-10-28'),
      portfolio: {dayPct: 0.03},
      theses: [],
      autoActions: enrichedData.autoActions,
      prefs: {},
    });
    
    assert.ok(html.includes('Operación simulada'), 'HTML should use neutral label for null side');
    assert.ok(!html.includes('Compra simulada · VIST'), 'Should not infer compra for null side');
    assert.ok(!html.includes('Venta simulada · VIST'), 'Should not infer venta for null side');
    
    const text = buildDigestText({
      date: new Date('2026-10-28'),
      portfolio: {dayPct: 0.03},
      theses: [],
      autoActions: enrichedData.autoActions,
      prefs: {},
    });
    
    assert.ok(text.includes('Operación simulada'), 'Text should use neutral label for null side');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('Digest autoActions excludes events with no ticker', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {thresholdPortfolioPct: 1.0}, {now: () => Date.now()});
    
    const scoped = store.forUser(userId);
    const take = createTake(templates[0]);
    activate(take, 1000000);
    take.realPricesAt = '2026-10-28T15:00:00.000Z';
    take.monitoringPaused = false;
    scoped.putTake(take);
    
    const yesterday = '2026-10-27';
    const today = '2026-10-28';
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, yesterday, 1000000, 1000000);
    
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, today, 1030000, 1000000);
    
    // Record alert with some events missing ticker
    const windowStart = new Date('2026-10-28T15:00:00.000Z');
    store.db.prepare(`
      INSERT INTO email_alert_groups (id, user_id, alert_type, window_start, window_end, event_count, events_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), userId, 'trades',
      windowStart.toISOString(),
      new Date(windowStart.getTime() + 3600000).toISOString(),
      3,
      JSON.stringify([
        {ticker: null, side: 'compra', thesisName: 'Test', reasonPlain: 'No ticker 1'},
        {ticker: 'YPFD', side: 'venta', thesisName: 'Valid', reasonPlain: 'Valid trade'},
        {side: 'compra', thesisName: 'Test', reasonPlain: 'No ticker 2'}, // ticker omitted
      ]),
      'pending',
      windowStart.toISOString()
    );
    
    const enrichedData = buildDigestEnrichedData({
      db: store.db,
      userId,
      takes: [take],
      now: new Date('2026-10-28T20:00:00.000Z'),
    });
    
    assert.ok(enrichedData, 'Should return enriched data');
    assert.equal(enrichedData.autoActions.length, 1, 'Should only include event with valid ticker');
    assert.equal(enrichedData.autoActions[0].ticker, 'YPFD', 'Should be the valid event');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});
