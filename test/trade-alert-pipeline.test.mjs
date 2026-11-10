import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {createQuotesService} from '../lib/quotes.mjs';
import {recordTradeAlert, flushPendingAlerts} from '../lib/email-alerts.mjs';
import {ownerUserId} from '../lib/migrations/multiuser.mjs';

test('trade alert pipeline: valid quote day_change_pct persisted to event', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-alert-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  // Setup verified email for alerts
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // Insert valid quote with day_change_pct
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-09T17:00:00-03:00', 'data912', 0, 0.06, 1000, '2026-11-09T17:00:00-03:00');
  
  // Record trade alert (simulate producer)
  recordTradeAlert(store.db, {
    userId,
    takeId: 'test-take-001',
    tradeKind: 'drift',
    deltaPercent: 0.05,
    ticker: 'VIST',
    side: 'compra',
    thesisName: 'Test Thesis',
    reasonPlain: 'Test reason',
    weightBeforePct: 0.08,
    weightAfterPct: 0.12,
    weightDeltaPct: 0.04,
    assetDayPct: 0.06,  // Valid day return
    portfolioDayPct: 0.01,
    thesisImpactPct: 0.05,
    portfolioImpactPct: 0.02,
    thesisNames: ['Test Thesis'],
    now: () => now,
  });
  
  // Verify event stored in alert group
  const group = store.db.prepare(`SELECT * FROM email_alert_groups WHERE user_id=?`).get(userId);
  assert.ok(group, 'Alert group created');
  
  const events = JSON.parse(group.events_json);
  assert.equal(events.length, 1, 'One event recorded');
  assert.equal(events[0].ticker, 'VIST', 'Ticker stored');
  assert.equal(events[0].assetDayPct, 0.06, 'assetDayPct persisted to event');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade alert pipeline: null assetDayPct when quote missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-alert-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // No quote in database
  
  recordTradeAlert(store.db, {
    userId,
    takeId: 'test-take-001',
    tradeKind: 'drift',
    deltaPercent: 0.05,
    ticker: 'MISSING',
    side: 'compra',
    thesisName: 'Test Thesis',
    reasonPlain: 'Test reason',
    weightBeforePct: null,
    weightAfterPct: null,
    weightDeltaPct: null,
    assetDayPct: null,  // No quote available
    portfolioDayPct: null,
    thesisImpactPct: 0.05,
    portfolioImpactPct: 0.02,
    thesisNames: ['Test Thesis'],
    now: () => now,
  });
  
  const group = store.db.prepare(`SELECT * FROM email_alert_groups WHERE user_id=?`).get(userId);
  const events = JSON.parse(group.events_json);
  assert.equal(events[0].assetDayPct, null, 'assetDayPct null when quote missing');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade alert pipeline: null assetDayPct when quote stale', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-alert-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // Insert stale quote
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-09T17:00:00-03:00', 'data912', 1, 0.06, 1000, '2026-11-09T17:00:00-03:00');
  
  recordTradeAlert(store.db, {
    userId,
    takeId: 'test-take-001',
    tradeKind: 'drift',
    deltaPercent: 0.05,
    ticker: 'VIST',
    side: 'compra',
    thesisName: 'Test Thesis',
    reasonPlain: 'Test reason',
    weightBeforePct: null,
    weightAfterPct: null,
    weightDeltaPct: null,
    assetDayPct: null,  // Stale quote rejected
    portfolioDayPct: null,
    thesisImpactPct: 0.05,
    portfolioImpactPct: 0.02,
    thesisNames: ['Test Thesis'],
    now: () => now,
  });
  
  const group = store.db.prepare(`SELECT * FROM email_alert_groups WHERE user_id=?`).get(userId);
  const events = JSON.parse(group.events_json);
  assert.equal(events[0].assetDayPct, null, 'assetDayPct null when quote stale');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade alert pipeline: null assetDayPct when quote from wrong day', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-alert-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // Quote from yesterday (wrong ART day)
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-08T17:00:00-03:00', 'data912', 0, 0.06, 1000, '2026-11-08T17:00:00-03:00');
  
  recordTradeAlert(store.db, {
    userId,
    takeId: 'test-take-001',
    tradeKind: 'drift',
    deltaPercent: 0.05,
    ticker: 'VIST',
    side: 'compra',
    thesisName: 'Test Thesis',
    reasonPlain: 'Test reason',
    weightBeforePct: null,
    weightAfterPct: null,
    weightDeltaPct: null,
    assetDayPct: null,  // Wrong day rejected
    portfolioDayPct: null,
    thesisImpactPct: 0.05,
    portfolioImpactPct: 0.02,
    thesisNames: ['Test Thesis'],
    now: () => now,
  });
  
  const group = store.db.prepare(`SELECT * FROM email_alert_groups WHERE user_id=?`).get(userId);
  const events = JSON.parse(group.events_json);
  assert.equal(events[0].assetDayPct, null, 'assetDayPct null when quote from wrong day');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade alert pipeline: null assetDayPct when quote has future timestamp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-alert-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // Quote with future timestamp
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-09T18:00:00-03:00', 'data912', 0, 0.06, 1000, '2026-11-09T18:00:00-03:00');
  
  recordTradeAlert(store.db, {
    userId,
    takeId: 'test-take-001',
    tradeKind: 'drift',
    deltaPercent: 0.05,
    ticker: 'VIST',
    side: 'compra',
    thesisName: 'Test Thesis',
    reasonPlain: 'Test reason',
    weightBeforePct: null,
    weightAfterPct: null,
    weightDeltaPct: null,
    assetDayPct: null,  // Future timestamp rejected
    portfolioDayPct: null,
    thesisImpactPct: 0.05,
    portfolioImpactPct: 0.02,
    thesisNames: ['Test Thesis'],
    now: () => now,
  });
  
  const group = store.db.prepare(`SELECT * FROM email_alert_groups WHERE user_id=?`).get(userId);
  const events = JSON.parse(group.events_json);
  assert.equal(events[0].assetDayPct, null, 'assetDayPct null when quote has future timestamp');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade alert pipeline: genuine zero assetDayPct preserved', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-alert-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // Quote with exactly zero day change
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1000, '2026-11-09T17:00:00-03:00', 'data912', 0, 0, 1000, '2026-11-09T17:00:00-03:00');
  
  recordTradeAlert(store.db, {
    userId,
    takeId: 'test-take-001',
    tradeKind: 'drift',
    deltaPercent: 0.05,
    ticker: 'VIST',
    side: 'compra',
    thesisName: 'Test Thesis',
    reasonPlain: 'Test reason',
    weightBeforePct: null,
    weightAfterPct: null,
    weightDeltaPct: null,
    assetDayPct: 0,  // Zero is valid
    portfolioDayPct: null,
    thesisImpactPct: 0.05,
    portfolioImpactPct: 0.02,
    thesisNames: ['Test Thesis'],
    now: () => now,
  });
  
  const group = store.db.prepare(`SELECT * FROM email_alert_groups WHERE user_id=?`).get(userId);
  const events = JSON.parse(group.events_json);
  assert.strictEqual(events[0].assetDayPct, 0, 'genuine zero preserved');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade alert pipeline: user/ticker match validated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-alert-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // Insert quotes for multiple tickers
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-09T17:00:00-03:00', 'data912', 0, 0.06, 1000, '2026-11-09T17:00:00-03:00');
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('YPF', 5000, '2026-11-09T17:00:00-03:00', 'data912', 0, -0.03, 5155, '2026-11-09T17:00:00-03:00');
  
  // Record alert for VIST
  recordTradeAlert(store.db, {
    userId,
    takeId: 'test-take-001',
    tradeKind: 'drift',
    deltaPercent: 0.05,
    ticker: 'VIST',
    side: 'compra',
    thesisName: 'Test Thesis',
    reasonPlain: 'Test reason',
    weightBeforePct: null,
    weightAfterPct: null,
    weightDeltaPct: null,
    assetDayPct: 0.06,  // VIST day change
    portfolioDayPct: null,
    thesisImpactPct: 0.05,
    portfolioImpactPct: 0.02,
    thesisNames: ['Test Thesis'],
    now: () => now,
  });
  
  // Record alert for YPF in same window (within 15 min)
  const nowSameWindow = new Date(now.getTime() + 5 * 60 * 1000);  // 5 minutes later
  
  recordTradeAlert(store.db, {
    userId,
    takeId: 'test-take-002',
    tradeKind: 'drift',
    deltaPercent: -0.02,
    ticker: 'YPF',
    side: 'venta',
    thesisName: 'Energy Thesis',
    reasonPlain: 'Another reason',
    weightBeforePct: null,
    weightAfterPct: null,
    weightDeltaPct: null,
    assetDayPct: -0.03,  // YPF day change (different from VIST)
    portfolioDayPct: null,
    thesisImpactPct: -0.02,
    portfolioImpactPct: -0.01,
    thesisNames: ['Energy Thesis'],
    now: () => nowSameWindow,
  });
  
  const group = store.db.prepare(`SELECT * FROM email_alert_groups WHERE user_id=?`).get(userId);
  const events = JSON.parse(group.events_json);
  
  assert.equal(events.length, 2, 'Two events in group');
  
  // Verify each event has correct ticker and assetDayPct
  const vistEvent = events.find(e => e.ticker === 'VIST');
  const ypfEvent = events.find(e => e.ticker === 'YPF');
  
  assert.ok(vistEvent, 'VIST event exists');
  assert.ok(ypfEvent, 'YPF event exists');
  assert.equal(vistEvent.assetDayPct, 0.06, 'VIST has correct day change');
  assert.equal(ypfEvent.assetDayPct, -0.03, 'YPF has correct day change (negative)');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('trade alert pipeline: null assetDayPct when dayChangePct missing from quote', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trade-alert-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  
  const now = new Date('2026-11-09T17:30:00-03:00');
  
  // Quote without day_change_pct field
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale)
    VALUES (?,?,?,?,?)`)
    .run('VIST', 1060, '2026-11-09T17:00:00-03:00', 'data912', 0);
  
  recordTradeAlert(store.db, {
    userId,
    takeId: 'test-take-001',
    tradeKind: 'drift',
    deltaPercent: 0.05,
    ticker: 'VIST',
    side: 'compra',
    thesisName: 'Test Thesis',
    reasonPlain: 'Test reason',
    weightBeforePct: null,
    weightAfterPct: null,
    weightDeltaPct: null,
    assetDayPct: null,  // dayChangePct not available
    portfolioDayPct: null,
    thesisImpactPct: 0.05,
    portfolioImpactPct: 0.02,
    thesisNames: ['Test Thesis'],
    now: () => now,
  });
  
  const group = store.db.prepare(`SELECT * FROM email_alert_groups WHERE user_id=?`).get(userId);
  const events = JSON.parse(group.events_json);
  assert.equal(events[0].assetDayPct, null, 'assetDayPct null when dayChangePct missing');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});
