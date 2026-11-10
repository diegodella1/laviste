import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {
  enqueueEmail, getEmailPrefs, updateEmailPrefs, initializeEmailPrefsForUser,
  isRecipientAllowed, warnIfProductionAllowlistEmpty, outboxDedupeKey, artDayString,
} from '../lib/email.mjs';
import {recordTradeAlert, recordPausaAlert, flushPendingAlerts, scheduleDailyDigest, ALERT_GROUP_WINDOW_MS} from '../lib/email-alerts.mjs';
import {
  ensureEmailPrefsAndDedupe, EMAIL_OUTBOX_DAY_INDEX, EMAIL_OUTBOX_DEDUPE_INDEX,
  SCHEMA_USER_VERSION,
} from '../lib/migrations/multiuser.mjs';

const DIEGO = 'diego@diegodella.ar';
const WINDOW = ALERT_GROUP_WINDOW_MS;

function tmp() {
  return mkdtempSync(join(tmpdir(), 'email-prefs-freq-'));
}

function cleanup(dir) {
  try { rmSync(dir, {recursive: true}); } catch { /* ignore */ }
}

function ownerStore(email = DIEGO) {
  const dir = tmp();
  const store = createStore(dir, {ownerEmail: email, ownerPassword: 'test-password-123'});
  const userId = store.ownerUserId();
  store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
  return {dir, store, userId};
}

function indexSql(db, name) {
  return db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name=?").get(name)?.sql || '';
}

test('defaults and backfill: auto each/each, without auto off, digest daily, news off', () => {
  const {dir, store, userId} = ownerStore();
  try {
    const none = getEmailPrefs(store.db, userId);
    assert.equal(none.tradesEnabled, 0);
    assert.equal(none.tradesFreq, 'off');
    assert.equal(none.pausaFreq, 'off');
    assert.equal(none.digestFreq, 'daily');
    assert.equal(none.newsEnabled, 0);
    assert.equal(none.tradesMaxPerDay, 1);

    const prefsOff = initializeEmailPrefsForUser(store.db, userId, {hasAutoPolicyEnabled: false});
    assert.equal(prefsOff.tradesEnabled, 0);
    assert.equal(prefsOff.tradesFreq, 'off');
    assert.equal(prefsOff.pausaFreq, 'off');
    assert.equal(prefsOff.digestFreq, 'daily');
    assert.equal(prefsOff.newsEnabled, 0);

    const user2 = store.createUser({email: 'auto@example.test', password: 'password123', role: 'user'});
    const prefsOn = initializeEmailPrefsForUser(store.db, user2, {hasAutoPolicyEnabled: true});
    assert.equal(prefsOn.tradesEnabled, 1);
    assert.equal(prefsOn.tradesFreq, 'each');
    assert.equal(prefsOn.pausaFreq, 'each');
    assert.equal(prefsOn.digestFreq, 'daily');
    assert.equal(prefsOn.newsEnabled, 0);

    const backfillId = store.createUser({email: 'legacy@example.test', password: 'password123', role: 'user'});
    store.db.prepare(`
      INSERT INTO email_prefs(user_id, trades_enabled, news_enabled, threshold_asset_pct, threshold_portfolio_pct, updated_at)
      VALUES (?, 1, 0, 5.0, 3.0, ?)
    `).run(backfillId, '2026-11-09T12:00:00.000Z');
    store.db.exec(`
      ALTER TABLE email_prefs DROP COLUMN trades_freq;
      ALTER TABLE email_prefs DROP COLUMN trades_max_per_day;
      ALTER TABLE email_prefs DROP COLUMN pausa_freq;
      ALTER TABLE email_prefs DROP COLUMN digest_freq;
    `);
    ensureEmailPrefsAndDedupe(store.db);
    ensureEmailPrefsAndDedupe(store.db);
    const backfilled = store.db.prepare('SELECT * FROM email_prefs WHERE user_id=?').get(backfillId);
    assert.equal(backfilled.trades_enabled, 1);
    assert.equal(backfilled.trades_freq, 'each');
    assert.equal(backfilled.pausa_freq, 'each');
    assert.equal(backfilled.digest_freq, 'daily');
    assert.equal(backfilled.news_enabled, 0);
    assert.equal(store.userVersion(), 21);
    assert.equal(SCHEMA_USER_VERSION, 21);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('ensure step is idempotent and user_version stays 21', () => {
  const {dir, store} = ownerStore();
  try {
    ensureEmailPrefsAndDedupe(store.db);
    ensureEmailPrefsAndDedupe(store.db);
    assert.equal(store.userVersion(), 21);
    const cols = store.db.prepare('PRAGMA table_info(email_prefs)').all().map(c => c.name);
    for (const col of ['trades_freq', 'trades_max_per_day', 'pausa_freq', 'digest_freq']) {
      assert.ok(cols.includes(col), col);
    }
    assert.ok(store.db.prepare('PRAGMA table_info(email_outbox)').all().some(c => c.name === 'dedupe_key'));
    const skip = store.db.prepare('PRAGMA table_info(email_alert_groups)').all().some(c => c.name === 'skip_reason');
    assert.ok(skip);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('old unique UTC-day index is dropped; unique index is on dedupe_key', () => {
  const {dir, store} = ownerStore();
  try {
    const daySql = indexSql(store.db, EMAIL_OUTBOX_DAY_INDEX);
    assert.ok(daySql);
    assert.ok(!/\bUNIQUE\b/i.test(daySql), 'legacy UTC-day index must not be UNIQUE');
    assert.match(daySql, /date\(scheduled_at\)/i);
    const dedupeSql = indexSql(store.db, EMAIL_OUTBOX_DEDUPE_INDEX);
    assert.match(dedupeSql, /UNIQUE/i);
    assert.match(dedupeSql, /dedupe_key/);
    assert.match(dedupeSql, /pending/);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('dedupe_key blocks a second digest for the same ART day', () => {
  const {dir, store, userId} = ownerStore();
  try {
    const firstAt = '2026-11-09T15:42:00.000Z';
    const sameArt = '2026-11-09T21:00:00.000Z';
    const nextArt = '2026-11-10T06:00:00.000Z';
    assert.equal(artDayString(firstAt), '2026-11-09');
    assert.equal(artDayString(sameArt), '2026-11-09');
    assert.equal(artDayString(nextArt), '2026-11-10');

    const first = enqueueEmail(store.db, {
      userId, template: 'daily_digest', toEmail: DIEGO, subject: 'one', bodyText: 'one',
      now: () => Date.parse(firstAt),
    });
    assert.equal(first.status, 'pending');
    assert.equal(first.dedupeKey, `digest:${userId}:2026-11-09`);

    const dup = enqueueEmail(store.db, {
      userId, template: 'daily_digest', toEmail: DIEGO, subject: 'two', bodyText: 'two',
      scheduledAt: sameArt, now: () => Date.parse(firstAt),
    });
    assert.equal(dup.duplicate, true);
    assert.equal(dup.reason, 'already_queued_or_sent');
    assert.equal(dup.id, first.id);

    const scheduled = scheduleDailyDigest(store.db, {
      userId,
      newsItems: [{title: 'n', url: 'https://example.test/n'}],
      enrichedData: {portfolio: {dayPct: 0.05}, theses: [], autoActions: []},
      now: () => Date.parse(firstAt),
    });
    assert.equal(scheduled.scheduled, false);
    assert.equal(scheduled.reason, 'already_scheduled');

    const nextDay = enqueueEmail(store.db, {
      userId, template: 'daily_digest', toEmail: DIEGO, subject: 'next', bodyText: 'next',
      scheduledAt: nextArt, now: () => Date.parse(nextArt),
    });
    assert.equal(nextDay.status, 'pending');
    assert.equal(nextDay.dedupeKey, `digest:${userId}:2026-11-10`);
    assert.notEqual(nextDay.id, first.id);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('max_per_day: N alerts pass and the next is deferred to the digest', () => {
  const {dir, store, userId} = ownerStore();
  try {
    let now = Date.parse('2026-11-09T18:00:00.000Z');
    updateEmailPrefs(store.db, userId, {tradesFreq: 'max_per_day', tradesMaxPerDay: 1}, {now: () => now});

    const first = recordTradeAlert(store.db, {
      userId, takeId: 'take-1', ticker: 'YPFD', side: 'compra', thesisName: 'Energía',
      reasonPlain: 'Rebalance', now: () => now,
    });
    now += WINDOW + 1000;
    const flush1 = flushPendingAlerts(store.db, {now: () => now});
    assert.equal(flush1.flushed, 1);
    const sent = store.db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template='alert_trades'").get().n;
    assert.equal(sent, 1);
    const key = outboxDedupeKey({template: 'alert_trades', userId, groupId: first.id});
    assert.equal(
      store.db.prepare('SELECT dedupe_key FROM email_outbox WHERE template=?').get('alert_trades').dedupe_key,
      key,
    );

    recordTradeAlert(store.db, {
      userId, takeId: 'take-1', ticker: 'PAMP', side: 'venta', thesisName: 'Energía',
      reasonPlain: 'Tope', now: () => now,
    });
    now += WINDOW + 1000;
    const flush2 = flushPendingAlerts(store.db, {now: () => now});
    assert.equal(flush2.flushed, 0);
    const deferred = store.db.prepare(
      "SELECT status, skip_reason FROM email_alert_groups WHERE skip_reason='deferred_digest'",
    ).get();
    assert.equal(deferred.status, 'failed');
    assert.equal(deferred.skip_reason, 'deferred_digest');
    assert.equal(
      store.db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template='alert_trades'").get().n,
      1,
    );

    const digest = scheduleDailyDigest(store.db, {
      userId,
      newsItems: [],
      enrichedData: {
        portfolio: {dayPct: 0.01},
        theses: [],
        autoActions: [{ticker: 'PAMP', side: 'venta', thesisName: 'Energía', reasonPlain: 'Tope'}],
      },
      now: () => now,
    });
    assert.equal(digest.scheduled, true);
    const body = store.db.prepare("SELECT body_text FROM email_outbox WHERE template='daily_digest'").get().body_text;
    assert.match(body, /PAMP/);
    assert.match(body, /Qué hizo el modo Automático/i);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('digest_only defers alerts into the digest; off does not enqueue', () => {
  const {dir, store, userId} = ownerStore();
  try {
    let now = Date.parse('2026-11-09T18:00:00.000Z');
    updateEmailPrefs(store.db, userId, {tradesFreq: 'digest_only', pausaFreq: 'digest_only'}, {now: () => now});
    assert.equal(getEmailPrefs(store.db, userId).tradesEnabled, 0);

    recordTradeAlert(store.db, {
      userId, takeId: 'take-1', ticker: 'GGAL', side: 'compra', thesisName: 'Bancos',
      reasonPlain: 'Drift', now: () => now,
    });
    now += WINDOW + 1000;
    const flush = flushPendingAlerts(store.db, {now: () => now});
    assert.equal(flush.flushed, 0);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM email_outbox').get().n, 0);
    const group = store.db.prepare('SELECT status, skip_reason FROM email_alert_groups').get();
    assert.equal(group.skip_reason, 'deferred_digest');

    const digest = scheduleDailyDigest(store.db, {
      userId,
      newsItems: [],
      enrichedData: {
        portfolio: {dayPct: 0.04},
        theses: [],
        autoActions: [{ticker: 'GGAL', side: 'compra', thesisName: 'Bancos', reasonPlain: 'Drift'}],
      },
      now: () => now,
    });
    assert.equal(digest.scheduled, true);
    assert.match(
      store.db.prepare("SELECT body_text FROM email_outbox WHERE template='daily_digest'").get().body_text,
      /GGAL/,
    );

    const user2 = store.createUser({email: 'off@example.test', password: 'password123', role: 'user'});
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user2);
    updateEmailPrefs(store.db, user2, {tradesFreq: 'off', pausaFreq: 'off', digestFreq: 'off'}, {now: () => now});
    recordPausaAlert(store.db, {userId: user2, takeId: 'take-2', reason: 'pausa', now: () => now});
    now += WINDOW + 1000;
    flushPendingAlerts(store.db, {now: () => now});
    const offGroup = store.db.prepare(
      'SELECT status, skip_reason FROM email_alert_groups WHERE user_id=?',
    ).get(user2);
    assert.equal(offGroup.status, 'failed');
    assert.equal(offGroup.skip_reason, 'off');
    assert.equal(
      store.db.prepare('SELECT COUNT(*) AS n FROM email_outbox WHERE user_id=?').get(user2).n,
      0,
    );
    const skippedDigest = scheduleDailyDigest(store.db, {
      userId: user2,
      newsItems: [{title: 'n', url: 'https://example.test/n'}],
      now: () => now,
    });
    assert.equal(skippedDigest.scheduled, false);
    assert.equal(skippedDigest.reason, 'digest_off');
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('empty allowlist in production blocks every recipient', () => {
  const {dir, store, userId} = ownerStore();
  try {
    assert.equal(isRecipientAllowed(DIEGO, {}), true);
    assert.equal(isRecipientAllowed(DIEGO, {NODE_ENV: 'production'}), false);
    assert.equal(isRecipientAllowed(DIEGO, {COOKIE_SECURE: 'true'}), false);
    assert.equal(isRecipientAllowed(DIEGO, {NODE_ENV: 'production', EMAIL_ALLOWLIST: DIEGO}), true);

    const blocked = enqueueEmail(store.db, {
      userId, template: 'daily_digest', toEmail: DIEGO, subject: 'x', bodyText: 'x',
      env: {NODE_ENV: 'production'},
    });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.reason, 'recipient_not_allowed');
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM email_outbox').get().n, 0);

    const warnings = [];
    const warned = warnIfProductionAllowlistEmpty({NODE_ENV: 'production'}, {
      warn: msg => warnings.push(msg),
    });
    assert.equal(warned, true);
    assert.match(warnings[0], /email_allowlist_empty_in_production/);
    assert.equal(warnIfProductionAllowlistEmpty({NODE_ENV: 'test'}, {warn() {}}), false);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('old prefs fields still work and invalid freqs are rejected', () => {
  const {dir, store, userId} = ownerStore();
  try {
    const enabled = updateEmailPrefs(store.db, userId, {tradesEnabled: true, newsEnabled: true});
    assert.equal(enabled.tradesEnabled, 1);
    assert.equal(enabled.newsEnabled, 1);
    assert.equal(enabled.tradesFreq, 'each');
    assert.equal(enabled.pausaFreq, 'each');
    assert.equal(enabled.digestFreq, 'daily');

    const capped = updateEmailPrefs(store.db, userId, {tradesFreq: 'max_per_day', tradesMaxPerDay: 3});
    assert.equal(capped.tradesEnabled, 1);
    assert.equal(capped.tradesFreq, 'max_per_day');
    assert.equal(capped.tradesMaxPerDay, 3);
    assert.equal(capped.newsEnabled, 1);

    assert.throws(() => updateEmailPrefs(store.db, userId, {tradesFreq: 'weekly'}), /tradesFreq/);
    assert.throws(() => updateEmailPrefs(store.db, userId, {pausaFreq: 'max_per_day'}), /pausaFreq/);
    assert.throws(() => updateEmailPrefs(store.db, userId, {digestFreq: 'each'}), /digestFreq/);
    assert.throws(() => updateEmailPrefs(store.db, userId, {tradesMaxPerDay: 6}), /1 y 5/);
  } finally {
    store.close();
    cleanup(dir);
  }
});
