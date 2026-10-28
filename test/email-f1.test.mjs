import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {updateEmailPrefs} from '../lib/email.mjs';
import {
  recordTradeAlert, recordPausaAlert, flushPendingAlerts,
  scheduleDailyDigest, getNextDigestTime,
  ALERT_GROUP_WINDOW_MS, SILENCE_START_HOUR, SILENCE_END_HOUR, DIGEST_HOUR,
} from '../lib/email-alerts.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'email-f1-test-'));
}

function cleanup(dir) {
  try { rmSync(dir, {recursive: true}); } catch {}
}

test('v20 migration creates email_alert_groups table', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    assert.equal(store.userVersion(), 20);
    
    const row = store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='email_alert_groups'").get();
    assert.ok(row, 'email_alert_groups table should exist');
    
    const cols = store.db.prepare("PRAGMA table_info(email_alert_groups)").all().map(col => col.name);
    assert.ok(cols.includes('id'));
    assert.ok(cols.includes('user_id'));
    assert.ok(cols.includes('alert_type'));
    assert.ok(cols.includes('window_start'));
    assert.ok(cols.includes('window_end'));
    assert.ok(cols.includes('event_count'));
    assert.ok(cols.includes('events_json'));
    assert.ok(cols.includes('status'));
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('recordTradeAlert groups events within 15min window', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    const result1 = recordTradeAlert(store.db, {
      userId,
      takeId: 'take-1',
      tradeKind: 'drift',
      deltaPercent: 0.05,
      now: () => now,
    });
    assert.ok(result1.id);
    
    now += 5 * 60 * 1000;
    const result2 = recordTradeAlert(store.db, {
      userId,
      takeId: 'take-2',
      tradeKind: 'cap',
      deltaPercent: 0.03,
      now: () => now,
    });
    
    assert.equal(result2.id, result1.id);
    
    const group = store.db.prepare('SELECT * FROM email_alert_groups WHERE id = ?').get(result1.id);
    assert.equal(group.event_count, 2);
    const events = JSON.parse(group.events_json);
    assert.equal(events.length, 2);
    assert.equal(events[0].takeId, 'take-1');
    assert.equal(events[1].takeId, 'take-2');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('recordTradeAlert creates new group after window expires', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    const result1 = recordTradeAlert(store.db, {
      userId,
      takeId: 'take-1',
      tradeKind: 'drift',
      deltaPercent: 0.05,
      now: () => now,
    });
    
    now += ALERT_GROUP_WINDOW_MS + 1000;
    const result2 = recordTradeAlert(store.db, {
      userId,
      takeId: 'take-2',
      tradeKind: 'cap',
      deltaPercent: 0.03,
      now: () => now,
    });
    
    assert.notEqual(result2.id, result1.id);
    
    const groups = store.db.prepare('SELECT * FROM email_alert_groups ORDER BY window_start').all();
    assert.equal(groups.length, 2);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('recordPausaAlert groups pausa events', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    const result1 = recordPausaAlert(store.db, {
      userId,
      takeId: 'take-1',
      reason: 'Límite de operaciones alcanzado',
      now: () => now,
    });
    
    now += 3 * 60 * 1000;
    const result2 = recordPausaAlert(store.db, {
      userId,
      takeId: 'take-2',
      reason: 'Tesis rota',
      now: () => now,
    });
    
    assert.equal(result2.id, result1.id);
    
    const group = store.db.prepare('SELECT * FROM email_alert_groups WHERE id = ?').get(result1.id);
    assert.equal(group.alert_type, 'pausa');
    assert.equal(group.event_count, 2);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('flushPendingAlerts enqueues emails after window expires', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {tradesEnabled: true}, {now: () => now});
    
    recordTradeAlert(store.db, {
      userId,
      takeId: 'take-1',
      tradeKind: 'drift',
      deltaPercent: 0.05,
      now: () => now,
    });
    
    now += ALERT_GROUP_WINDOW_MS + 1000;
    
    const result = flushPendingAlerts(store.db, {now: () => now});
    assert.equal(result.flushed, 1);
    
    const group = store.db.prepare('SELECT status FROM email_alert_groups LIMIT 1').get();
    assert.equal(group.status, 'sent');
    
    const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? LIMIT 1').get('alert_trades');
    assert.ok(outbox);
    assert.ok(outbox.subject.includes('Automático'));
    assert.ok(outbox.body_text.includes('ejecutó'));
    assert.ok(outbox.body_text.includes('educativo'));
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('flushPendingAlerts skips when trades disabled', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {tradesEnabled: false}, {now: () => now});
    
    recordTradeAlert(store.db, {
      userId,
      takeId: 'take-1',
      tradeKind: 'drift',
      deltaPercent: 0.05,
      now: () => now,
    });
    
    now += ALERT_GROUP_WINDOW_MS + 1000;
    
    const result = flushPendingAlerts(store.db, {now: () => now});
    assert.equal(result.flushed, 0);
    
    const group = store.db.prepare('SELECT status FROM email_alert_groups LIMIT 1').get();
    assert.equal(group.status, 'failed');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('flushPendingAlerts respects silence window 22:00-08:00 ART', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    const ART_OFFSET_MS = -3 * 60 * 60 * 1000;
    const artDate = new Date('2026-10-28T23:00:00.000Z');
    artDate.setTime(artDate.getTime() - ART_OFFSET_MS);
    let now = artDate.getTime();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {tradesEnabled: true}, {now: () => now});
    
    recordTradeAlert(store.db, {
      userId,
      takeId: 'take-1',
      tradeKind: 'drift',
      deltaPercent: 0.05,
      now: () => now,
    });
    
    now += ALERT_GROUP_WINDOW_MS + 1000;
    
    flushPendingAlerts(store.db, {now: () => now});
    
    const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? LIMIT 1').get('alert_trades');
    assert.ok(outbox);
    
    const scheduled = new Date(outbox.scheduled_at);
    const scheduledART = new Date(scheduled.getTime() + ART_OFFSET_MS);
    assert.equal(scheduledART.getUTCHours(), SILENCE_END_HOUR);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('flushPendingAlerts sends immediately outside silence window', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    const ART_OFFSET_MS = -3 * 60 * 60 * 1000;
    const artDate = new Date('2026-10-28T15:00:00.000Z');
    artDate.setTime(artDate.getTime() - ART_OFFSET_MS);
    let now = artDate.getTime();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {tradesEnabled: true}, {now: () => now});
    
    recordTradeAlert(store.db, {
      userId,
      takeId: 'take-1',
      tradeKind: 'drift',
      deltaPercent: 0.05,
      now: () => now,
    });
    
    now += ALERT_GROUP_WINDOW_MS + 1000;
    
    flushPendingAlerts(store.db, {now: () => now});
    
    const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? LIMIT 1').get('alert_trades');
    assert.ok(outbox);
    
    const scheduled = new Date(outbox.scheduled_at);
    const diff = Math.abs(scheduled.getTime() - now);
    assert.ok(diff < 5000);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('scheduleDailyDigest creates digest at 18:00 ART', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    const ART_OFFSET_MS = -3 * 60 * 60 * 1000;
    const artDate = new Date('2026-10-28T10:00:00.000Z');
    artDate.setTime(artDate.getTime() - ART_OFFSET_MS);
    let now = artDate.getTime();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {newsEnabled: true}, {now: () => now});
    
    const movements = [{symbol: 'AAPL', deltaPercent: 0.06}];
    const news = [{title: 'Important news', url: 'https://example.com/news'}];
    
    const result = scheduleDailyDigest(store.db, {
      userId,
      portfolioMovements: movements,
      newsItems: news,
      now: () => now,
    });
    
    assert.ok(result.scheduled);
    
    const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? LIMIT 1').get('daily_digest');
    assert.ok(outbox);
    assert.ok(outbox.subject.includes('Resumen diario'));
    assert.ok(outbox.body_text.includes('portfolio'));
    assert.ok(outbox.body_text.includes('AAPL'));
    assert.ok(outbox.body_text.includes('Important news'));
    assert.ok(outbox.body_text.includes('educativo'));
    
    const scheduled = new Date(outbox.scheduled_at);
    const scheduledART = new Date(scheduled.getTime() + ART_OFFSET_MS);
    assert.equal(scheduledART.getUTCHours(), DIGEST_HOUR);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('scheduleDailyDigest respects threshold_asset_pct', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    const ART_OFFSET_MS = -3 * 60 * 60 * 1000;
    const artDate = new Date('2026-10-28T10:00:00.000Z');
    artDate.setTime(artDate.getTime() - ART_OFFSET_MS);
    let now = artDate.getTime();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {thresholdAssetPct: 5.0}, {now: () => now});
    
    const belowThreshold = [{symbol: 'AAPL', deltaPercent: 0.03}];
    const result1 = scheduleDailyDigest(store.db, {
      userId,
      portfolioMovements: belowThreshold,
      newsItems: [],
      now: () => now,
    });
    assert.equal(result1.scheduled, false);
    assert.equal(result1.reason, 'no_significant_changes');
    
    const aboveThreshold = [{symbol: 'AAPL', deltaPercent: 0.06}];
    const result2 = scheduleDailyDigest(store.db, {
      userId,
      portfolioMovements: aboveThreshold,
      newsItems: [],
      now: () => now,
    });
    assert.ok(result2.scheduled);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('scheduleDailyDigest includes news only when newsEnabled', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    const ART_OFFSET_MS = -3 * 60 * 60 * 1000;
    const artDate = new Date('2026-10-28T10:00:00.000Z');
    artDate.setTime(artDate.getTime() - ART_OFFSET_MS);
    let now = artDate.getTime();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {newsEnabled: false}, {now: () => now});
    
    const movements = [{symbol: 'AAPL', deltaPercent: 0.06}];
    const news = [{title: 'Important news', url: 'https://example.com/news'}];
    
    scheduleDailyDigest(store.db, {
      userId,
      portfolioMovements: movements,
      newsItems: news,
      now: () => now,
    });
    
    const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? LIMIT 1').get('daily_digest');
    assert.ok(outbox);
    assert.ok(outbox.body_text.includes('AAPL'));
    assert.ok(!outbox.body_text.includes('Important news'));
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('getNextDigestTime returns next 18:00 ART', () => {
  const ART_OFFSET_MS = -3 * 60 * 60 * 1000;
  
  const artBefore = new Date('2026-10-28T10:00:00.000Z');
  artBefore.setTime(artBefore.getTime() - ART_OFFSET_MS);
  const before = artBefore.getTime();
  const nextBefore = getNextDigestTime(() => before);
  const nextBeforeART = new Date(nextBefore.getTime() + ART_OFFSET_MS);
  assert.equal(nextBeforeART.getUTCHours(), DIGEST_HOUR);
  assert.equal(nextBeforeART.getUTCDate(), 28);
  
  const artAfter = new Date('2026-10-28T19:00:00.000Z');
  artAfter.setTime(artAfter.getTime() - ART_OFFSET_MS);
  const after = artAfter.getTime();
  const nextAfter = getNextDigestTime(() => after);
  const nextAfterART = new Date(nextAfter.getTime() + ART_OFFSET_MS);
  assert.equal(nextAfterART.getUTCHours(), DIGEST_HOUR);
  assert.equal(nextAfterART.getUTCDate(), 29);
});

test('alert emails contain only percentages, no currency amounts', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {tradesEnabled: true}, {now: () => now});
    
    recordTradeAlert(store.db, {
      userId,
      takeId: 'take-1',
      tradeKind: 'drift',
      deltaPercent: 0.0523,
      now: () => now,
    });
    
    now += ALERT_GROUP_WINDOW_MS + 1000;
    flushPendingAlerts(store.db, {now: () => now});
    
    const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? LIMIT 1').get('alert_trades');
    assert.ok(outbox.body_text.includes('+5.23%'));
    assert.ok(!outbox.body_text.match(/\$|USD|ARS|EUR/));
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('digest email contains only percentages, no currency amounts', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    const ART_OFFSET_MS = -3 * 60 * 60 * 1000;
    const artDate = new Date('2026-10-28T10:00:00.000Z');
    artDate.setTime(artDate.getTime() - ART_OFFSET_MS);
    let now = artDate.getTime();
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {thresholdAssetPct: 2.0}, {now: () => now});
    
    const movements = [{symbol: 'AAPL', deltaPercent: -0.0312}];
    scheduleDailyDigest(store.db, {
      userId,
      portfolioMovements: movements,
      newsItems: [],
      now: () => now,
    });
    
    const outbox = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? LIMIT 1').get('daily_digest');
    assert.ok(outbox);
    assert.ok(outbox.body_text.includes('-3.12%'));
    assert.ok(!outbox.body_text.match(/\$|USD|ARS|EUR/));
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('all emails include Spanish legal footer', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {tradesEnabled: true}, {now: () => now});
    
    recordTradeAlert(store.db, {
      userId,
      takeId: 'take-1',
      tradeKind: 'drift',
      deltaPercent: 0.05,
      now: () => now,
    });
    
    now += ALERT_GROUP_WINDOW_MS + 1000;
    flushPendingAlerts(store.db, {now: () => now});
    
    const trades = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? LIMIT 1').get('alert_trades');
    assert.ok(trades.body_text.includes('educativo'));
    assert.ok(trades.body_text.includes('simulado'));
    
    recordPausaAlert(store.db, {
      userId,
      takeId: 'take-2',
      reason: 'Test',
      now: () => now,
    });
    
    now += ALERT_GROUP_WINDOW_MS + 1000;
    flushPendingAlerts(store.db, {now: () => now});
    
    const pausa = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? LIMIT 1').get('alert_pausa');
    assert.ok(pausa.body_text.includes('educativo'));
    
    const ART_OFFSET_MS = -3 * 60 * 60 * 1000;
    const artDate = new Date('2026-10-28T10:00:00.000Z');
    artDate.setTime(artDate.getTime() - ART_OFFSET_MS);
    const nowDigest = artDate.getTime();
    
    scheduleDailyDigest(store.db, {
      userId,
      portfolioMovements: [{symbol: 'AAPL', deltaPercent: 0.06}],
      newsItems: [],
      now: () => nowDigest,
    });
    
    const digest = store.db.prepare('SELECT * FROM email_outbox WHERE template = ? LIMIT 1').get('daily_digest');
    assert.ok(digest.body_text.includes('educativo'));
    
    store.close();
  } finally {
    cleanup(dir);
  }
});
