import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates, value} from '../lib/engine.mjs';
import {recordActivationOps} from '../lib/ops.mjs';
import {createAutoRunner} from '../lib/auto/runner.mjs';
import {updateEmailPrefs} from '../lib/email.mjs';
import {createDailyMarksJob} from '../lib/daily-marks.mjs';
import {AUTO_DEBOUNCE_MS} from '../lib/auto/engine.mjs';

const OPEN = '2026-10-19T15:00:00.000Z';
const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';

function later(iso, ms) {
  return new Date(Date.parse(iso) + ms).toISOString();
}

function tmp() {
  return mkdtempSync(join(tmpdir(), 'email-wiring-'));
}

function cleanup(dir) {
  try { rmSync(dir, {recursive: true}); } catch {}
}

function quote(ticker, price, asOf) {
  return {ticker, price, asOf, provider: 'data912', stale: false, available: true};
}

function quotesApi(take, asOf = OPEN) {
  const map = {};
  for (const h of take.holdings) {
    map[h.ticker] = quote(h.ticker, h.price, asOf);
  }
  return {
    getCached: ticker => map[ticker] || null,
    isDemo: () => false,
    set(ticker, row) { map[ticker] = row; },
    bumpPrice(ticker, price, nextAsOf) {
      map[ticker] = quote(ticker, price, nextAsOf);
      const h = take.holdings.find(row => row.ticker === ticker);
      if (h) h.price = price;
    },
  };
}

function setupWorld() {
  const dir = tmp();
  const store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
  const userId = store.ownerUserId();
  store.setSetting('autoTrading', {enabled: true, allowUserIds: [userId], marketHolidays: []});
  const scoped = store.forUser(userId);
  const take = createTake(templates[0]);
  activate(take, 1_024_000);
  take.realPricesAt = OPEN;
  take.monitoringPaused = false;
  take.scenario = 'normal';
  scoped.putTake(take);
  const quotes = quotesApi(take, OPEN);
  recordActivationOps(scoped, take, quotes);
  return {dir, store, userId, scoped, take, quotes};
}

test('recordTradeAlert is called when FEATURE_EMAIL=1 and auto trades', () => {
  const {dir, store, userId, scoped, take, quotes} = setupWorld();
  try {
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {tradesEnabled: true});
    
    scoped.upsertAutoPolicy({
      takeId: take.id,
      enabled: true,
      armState: {lastReviewId: null},
    });
    
    const h = take.holdings.find(row => row.ticker === 'YPF');
    const newPrice = h.price * 1.15;
    quotes.bumpPrice('YPF', newPrice, OPEN);
    
    let currentTime = new Date(OPEN);
    const runner = createAutoRunner({
      store,
      quotesApi: quotes,
      now: () => currentTime,
      env: {FEATURE_AUTO_SIM: '1', FEATURE_EMAIL: '1'},
    });
    
    runner.onSynced(take.id);
    
    currentTime = new Date(later(OPEN, AUTO_DEBOUNCE_MS));
    const t2 = currentTime.toISOString();
    quotes.bumpPrice('YPF', newPrice, t2);
    
    const live = scoped.take(take.id);
    for (const holding of live.holdings) {
      const q = quotes.getCached(holding.ticker);
      if (q?.price) holding.price = q.price;
    }
    scoped.putTake(live);
    
    const result = runner.onSynced(take.id);
    assert.ok(result.ok);
    
    const trades = scoped.autoTradesForTake(take.id);
    assert.ok(trades.length > 0);
    
    const alerts = store.db.prepare('SELECT * FROM email_alert_groups WHERE user_id = ? AND alert_type = ?')
      .all(userId, 'trades');
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].event_count, 1);
    
    const events = JSON.parse(alerts[0].events_json);
    assert.equal(events[0].takeId, take.id);
    assert.equal(events[0].tradeKind, 'cap');
    assert.ok(Number.isFinite(events[0].deltaPercent));
    
    runner.close();
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('recordTradeAlert is not called when FEATURE_EMAIL=0', () => {
  const {dir, store, userId, scoped, take, quotes} = setupWorld();
  try {
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {tradesEnabled: true});
    
    scoped.upsertAutoPolicy({
      takeId: take.id,
      enabled: true,
      armState: {lastReviewId: null},
    });
    
    const h = take.holdings.find(row => row.ticker === 'YPF');
    quotes.bumpPrice('YPF', h.price * 1.15, OPEN);
    
    const runner = createAutoRunner({
      store,
      quotesApi: quotes,
      now: () => new Date(OPEN),
      env: {FEATURE_AUTO_SIM: '1', FEATURE_EMAIL: '0'},
    });
    
    const result = runner.processTake(take.id);
    assert.ok(result.ok);
    
    const alerts = store.db.prepare('SELECT * FROM email_alert_groups WHERE user_id = ?').all(userId);
    assert.equal(alerts.length, 0);
    
    runner.close();
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('recordPausaAlert is called when auto pauses policy with FEATURE_EMAIL=1', () => {
  const {dir, store, userId, scoped, take, quotes} = setupWorld();
  try {
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {tradesEnabled: true});
    
    scoped.upsertAutoPolicy({
      takeId: take.id,
      enabled: true,
      armState: {lastReviewId: null},
    });
    
    take.holdings = [];
    scoped.putTake(take);
    
    const runner = createAutoRunner({
      store,
      quotesApi: quotes,
      now: () => new Date(OPEN),
      env: {FEATURE_AUTO_SIM: '1', FEATURE_EMAIL: '1'},
      inject: {failLedger: true},
    });
    
    const result = runner.processTake(take.id);
    assert.equal(result.ok, false);
    
    const alerts = store.db.prepare('SELECT * FROM email_alert_groups WHERE user_id = ? AND alert_type = ?')
      .all(userId, 'pausa');
    assert.equal(alerts.length, 1);
    
    const events = JSON.parse(alerts[0].events_json);
    assert.equal(events[0].takeId, take.id);
    assert.ok(events[0].reason);
    
    runner.close();
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('recordPausaAlert is not called when FEATURE_EMAIL=0', () => {
  const {dir, store, userId, scoped, take, quotes} = setupWorld();
  try {
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {tradesEnabled: true});
    
    scoped.upsertAutoPolicy({
      takeId: take.id,
      enabled: true,
      armState: {lastReviewId: null},
    });
    
    take.holdings = [];
    scoped.putTake(take);
    
    const runner = createAutoRunner({
      store,
      quotesApi: quotes,
      now: () => new Date(OPEN),
      env: {FEATURE_AUTO_SIM: '1', FEATURE_EMAIL: '0'},
      inject: {failLedger: true},
    });
    
    runner.processTake(take.id);
    
    const alerts = store.db.prepare('SELECT * FROM email_alert_groups WHERE user_id = ? AND alert_type = ?')
      .all(userId, 'pausa');
    assert.equal(alerts.length, 0);
    
    runner.close();
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('scheduleDailyDigest is called from daily marks when FEATURE_EMAIL=1', () => {
  const {dir, store, userId, scoped, take, quotes} = setupWorld();
  try {
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {newsEnabled: true, thresholdAssetPct: 2.0});
    
    const live = scoped.take(take.id);
    const h = live.holdings.find(row => row.ticker === 'YPF');
    const newPrice = h.price * 1.10;
    quotes.bumpPrice('YPF', newPrice, '2026-10-28T15:00:00.000Z');
    for (const holding of live.holdings) {
      const q = quotes.getCached(holding.ticker);
      if (q?.price) holding.price = q.price;
    }
    scoped.putTake(live);
    
    const artTime = new Date('2026-10-28T20:30:00.000Z');
    const job = createDailyMarksJob({
      store,
      quotes,
      now: () => artTime,
      env: {FEATURE_EMAIL: '1'},
    });
    
    const result = job.write({force: true});
    assert.ok(!result.skipped);
    assert.ok(result.written > 0);
    
    const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? AND user_id = ?')
      .get('daily_digest', userId);
    assert.ok(outbox);
    assert.ok(outbox.subject.toLowerCase().includes('resumen'));
    assert.ok(outbox.body_text.includes('cartera'));
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('scheduleDailyDigest is not called when FEATURE_EMAIL=0', () => {
  const {dir, store, userId, scoped, take, quotes} = setupWorld();
  try {
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {newsEnabled: true, thresholdAssetPct: 2.0});
    
    const h = take.holdings[0];
    h.value = h.invested * 1.06;
    scoped.putTake(take);
    
    const artTime = new Date('2026-10-28T20:30:00.000Z');
    
    const job = createDailyMarksJob({
      store,
      quotes,
      now: () => artTime,
      env: {FEATURE_EMAIL: '0'},
    });
    
    const result = job.write({force: true});
    assert.ok(!result.skipped);
    
    const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE template = ?').all('daily_digest');
    assert.equal(outbox.length, 0);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('email alerts do not break auto trades on failure', () => {
  const {dir, store, userId, scoped, take, quotes} = setupWorld();
  try {
    scoped.upsertAutoPolicy({
      takeId: take.id,
      enabled: true,
      armState: {lastReviewId: null},
    });
    
    const h = take.holdings.find(row => row.ticker === 'YPF');
    const newPrice = h.price * 1.15;
    quotes.bumpPrice('YPF', newPrice, OPEN);
    
    let currentTime = new Date(OPEN);
    const runner = createAutoRunner({
      store,
      quotesApi: quotes,
      now: () => currentTime,
      env: {FEATURE_AUTO_SIM: '1', FEATURE_EMAIL: '1'},
    });
    
    runner.onSynced(take.id);
    
    currentTime = new Date(later(OPEN, AUTO_DEBOUNCE_MS));
    const t2 = currentTime.toISOString();
    quotes.bumpPrice('YPF', newPrice, t2);
    
    const live = scoped.take(take.id);
    for (const holding of live.holdings) {
      const q = quotes.getCached(holding.ticker);
      if (q?.price) holding.price = q.price;
    }
    scoped.putTake(live);
    
    const result = runner.onSynced(take.id);
    assert.ok(result.ok);
    
    const trades = scoped.autoTradesForTake(take.id);
    assert.ok(trades.length > 0);
    
    runner.close();
    store.close();
  } finally {
    cleanup(dir);
  }
});
