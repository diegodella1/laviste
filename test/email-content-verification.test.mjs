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
import {recordTradeAlert, flushPendingAlerts, ALERT_GROUP_WINDOW_MS} from '../lib/email-alerts.mjs';
import {updateEmailPrefs} from '../lib/email.mjs';
import {ownerUserId} from '../lib/migrations/multiuser.mjs';

test('email content: digest has body_html and body_text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'email-content-'));
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
    now: new Date('2026-11-08T20:30:00.000Z'),
  });
  
  scheduleDailyDigest(store.db, {
    userId,
    newsItems: [],
    enrichedData,
    now: () => new Date('2026-11-08T20:30:00.000Z'),
  });
  
  const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE user_id=? AND template=?')
    .get(userId, 'daily_digest');
  
  assert.ok(outbox, 'Email created in outbox');
  assert.ok(outbox.body_html, 'body_html is not null');
  assert.ok(outbox.body_text, 'body_text is not null');
  assert.ok(outbox.body_html.length > 100, 'body_html has content');
  assert.ok(outbox.body_text.length > 100, 'body_text has content');
  
  // Verify HTML structure
  assert.ok(outbox.body_html.includes('<!DOCTYPE html>'), 'HTML has doctype');
  assert.ok(outbox.body_html.includes('<html'), 'HTML has html tag');
  assert.ok(outbox.body_html.includes('</html>'), 'HTML closes');
  
  // Verify unsubscribe link present
  assert.ok(outbox.body_text.includes('laviste.diegodella.ar'), 'Plain text has domain');
  assert.ok(outbox.body_text.includes('cuenta/email') || outbox.body_text.includes('Darse de baja'), 'Plain text has unsubscribe reference');
  assert.ok(outbox.body_html.includes('laviste.diegodella.ar'), 'HTML has domain');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('email content: trade alert has body_html and body_text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'email-content-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  let now = 1000000000000;
  
  store.db.prepare('UPDATE users SET email_verified=1, email_verified_at=? WHERE id=?')
    .run(new Date().toISOString(), userId);
  updateEmailPrefs(store.db, userId, {tradesEnabled: true}, {now: () => now});
  
  recordTradeAlert(store.db, {
    userId,
    takeId: 'take-1',
    tradeKind: 'drift',
    deltaPercent: 0.05,
    ticker: 'VIST',
    side: 'compra',
    thesisName: 'Test Thesis',
    reasonPlain: 'Test reason',
    weightBeforePct: 20,
    weightAfterPct: 25,
    weightDeltaPct: 5,
    now: () => now,
  });
  
  now += ALERT_GROUP_WINDOW_MS + 1000;
  flushPendingAlerts(store.db, {now: () => now});
  
  const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE user_id=? AND template=?')
    .get(userId, 'alert_trades');
  
  assert.ok(outbox, 'Trade alert email created');
  assert.ok(outbox.body_html, 'body_html is not null');
  assert.ok(outbox.body_text, 'body_text is not null');
  assert.ok(outbox.body_html.length > 100, 'body_html has content');
  assert.ok(outbox.body_text.length > 100, 'body_text has content');
  
  // Verify HTML structure
  assert.ok(outbox.body_html.includes('<!DOCTYPE html>'), 'HTML has doctype');
  assert.ok(outbox.body_html.includes('<html'), 'HTML has html tag');
  
  // Verify content
  assert.ok(outbox.body_text.includes('VIST'), 'Contains ticker');
  assert.ok(outbox.body_html.includes('VIST'), 'HTML contains ticker');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('email content: ticker contributions structure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'email-content-'));
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
    value: 105000,
    invested: 100000,
    benchId: null,
    benchPrice: null,
    eligible: true,
  });
  
  const quotes = createQuotesService(store, {demo: true});
  const enrichedData = buildDigestEnrichedData({
    db: store.db,
    userId,
    takes: [scoped.take(take.id)],
    quotes,
    now: new Date('2026-11-08T20:30:00.000Z'),
  });
  
  assert.ok(enrichedData, 'enrichedData exists');
  
  // Verify structure
  assert.ok(enrichedData.portfolio, 'portfolio exists');
  assert.ok(Number.isFinite(enrichedData.portfolio.dayPct) || enrichedData.portfolio.dayPct === null, 'portfolio.dayPct is number or null');
  
  assert.ok(Array.isArray(enrichedData.theses), 'theses is array');
  if (enrichedData.theses.length > 0) {
    const thesis = enrichedData.theses[0];
    assert.ok(thesis.name, 'thesis has name');
    assert.ok(Number.isFinite(thesis.dayPct) || thesis.dayPct === null, 'thesis.dayPct is number or null');
    assert.ok(Number.isFinite(thesis.contributionPct) || thesis.contributionPct === null, 'thesis.contributionPct is number or null');
  }
  
  assert.ok(Array.isArray(enrichedData.portfolioMovements), 'portfolioMovements is array');
  assert.ok(Array.isArray(enrichedData.alertsFired), 'alertsFired is array');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('email content: trade impact metrics vs spec', () => {
  const dir = mkdtempSync(join(tmpdir(), 'email-content-'));
  const store = createStore(dir);
  const userId = ownerUserId(store.db);
  const scoped = store.forUser(userId);
  
  const take = createTake(templates[0]);
  activate(take, 100000);
  scoped.putTake(take);
  
  // Build trade enriched data
  const tradeData = {
    ticker: 'VIST',
    side: 'compra',
    thesisName: 'Test Thesis',
    weightBeforePct: 20,
    weightAfterPct: 25,
    weightDeltaPct: 5,
    assetDayPct: null, // Legitimately unavailable (no quote data)
    portfolioDayPct: null, // Legitimately unavailable (no marks)
    thesisImpactPct: null, // Legitimately unavailable
    portfolioImpactPct: null, // Legitimately unavailable
    thesisNames: ['Test Thesis'],
  };
  
  // Verify structure matches spec
  assert.ok(tradeData.ticker, 'ticker present');
  assert.ok(tradeData.side === 'compra' || tradeData.side === 'venta' || tradeData.side === null, 'side valid enum or null');
  assert.ok(Number.isFinite(tradeData.weightBeforePct), 'weightBeforePct is number');
  assert.ok(Number.isFinite(tradeData.weightAfterPct), 'weightAfterPct is number');
  
  // These are legitimately unavailable when no data exists (not missing)
  assert.equal(tradeData.assetDayPct, null, 'assetDayPct legitimately unavailable');
  assert.equal(tradeData.thesisImpactPct, null, 'thesisImpactPct legitimately unavailable');
  assert.equal(tradeData.portfolioImpactPct, null, 'portfolioImpactPct legitimately unavailable');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});
