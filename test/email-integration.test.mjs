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

test.skip('Auto trade produces alert with enriched data', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {tradesEnabled: true}, {now: () => Date.now()});
    
    const scoped = store.forUser(userId);
    const take = createTake(templates[0]);
    activate(take, 1024000);
    take.realPricesAt = '2026-10-19T15:00:00.000Z';
    take.monitoringPaused = false;
    take.scenario = 'normal';
    scoped.putTake(take);
    
    const quotes = quotesApi(take, '2026-10-19T15:00:00.000Z');
    recordActivationOps(scoped, take, quotes);
    
    scoped.upsertAutoPolicy({
      takeId: take.id,
      enabled: true,
      newsTrigger: false,
      armState: {},
    });
    
    // Inflate cap ticker to trigger trade
    const h = take.holdings.find(row => row.ticker === 'YPF') || take.holdings[0];
    h.price = h.price * 1.15;
    scoped.putTake(take);
    quotes.getCached = ticker => {
      const holding = take.holdings.find(h => h.ticker === ticker);
      return holding ? quote(ticker, holding.price, '2026-10-19T15:01:00.000Z') : null;
    };
    
    const runner = createAutoRunner({
      store,
      quotesApi: quotes,
      now: () => new Date('2026-10-19T15:01:00.000Z'),
      env: {FEATURE_AUTO_SIM: '1', FEATURE_EMAIL: '1'},
    });
    
    const result = runner.processTake(take.id);
    assert.ok(result, 'Should process take');
    
    const trades = scoped.autoTradesForTake(take.id);
    assert.ok(trades.length > 0, 'Should have executed trade');
    
    const groups = store.db.prepare('SELECT * FROM email_alert_groups WHERE user_id = ? AND alert_type = ?')
      .all(userId, 'trades');
    
    assert.ok(groups.length > 0, 'Should have alert group');
    
    const events = JSON.parse(groups[0].events_json);
    assert.ok(events.length > 0, 'Should have trade event');
    
    const evt = events[0];
    assert.ok(evt.ticker, 'Event should have ticker');
    assert.ok(evt.side, 'Event should have side');
    assert.ok(evt.thesisName, 'Event should have thesis name');
    assert.ok(evt.reasonPlain, 'Event should have plain reason');
    assert.ok(evt.thesisName === take.title, 'Thesis name should match take title');
    
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
