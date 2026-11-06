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

test('Trade enrichment uses actual before/after weights, portfolio-wide day return', () => {
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
    
    // Insert historical marks for yesterday and today (for all user takes)
    const yesterday = '2026-10-19';
    const today = '2026-10-20';
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(takeBefore.id, userId, yesterday, 1000000, 1000000);
    
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(takeBefore.id, userId, today, 1020000, 1000000);
    
    const enriched = buildTradeEnrichedData({
      db: store.db,
      take: takeBefore,
      takeAfter,
      signal: {ticker: 'YPF', kind: 'drift'},
      now: new Date('2026-10-20T15:00:00-03:00'),
    });
    
    assert.ok(enriched, 'Should have enriched data');
    assert.equal(enriched.ticker, 'YPF', 'Should have ticker');
    assert.equal(enriched.side, 'compra', 'Should be compra (drift)');
    assert.ok(Number.isFinite(enriched.weightBeforePct), 'Should have weightBeforePct from actual holdings');
    assert.ok(Number.isFinite(enriched.weightAfterPct), 'Should have weightAfterPct from actual holdings');
    assert.ok(enriched.weightAfterPct > enriched.weightBeforePct, 'Weight should increase after buy');
    
    // Portfolio day return should be computed from portfolio-wide marks (2% from yesterday to today)
    assert.ok(enriched.portfolioDayPct !== null, 'Should have portfolio day return');
    assert.ok(Math.abs(enriched.portfolioDayPct - 0.02) < 0.001, 
      `Portfolio day return should be ~2% (${(enriched.portfolioDayPct * 100).toFixed(2)}%)`);
    
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
