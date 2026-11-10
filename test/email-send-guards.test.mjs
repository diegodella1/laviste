import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {
  enqueueEmail, processOutbox, sendViaResend, markEmailSent, parseEmailAllowlist,
  isRecipientAllowed, EMAIL_FROM,
} from '../lib/email.mjs';
import {scheduleDailyDigest} from '../lib/email-alerts.mjs';
import {EMAIL_OUTBOX_DAY_INDEX, SCHEMA_USER_VERSION} from '../lib/migrations/multiuser.mjs';

const DIEGO = 'diego@diegodella.ar';
const OTHER = 'other@example.test';
const ALLOW = {EMAIL_ALLOWLIST: DIEGO};

function tmp() {
  return mkdtempSync(join(tmpdir(), 'email-guards-'));
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

test('parseEmailAllowlist is empty until configured', () => {
  assert.deepEqual(parseEmailAllowlist({}), []);
  assert.equal(isRecipientAllowed(OTHER, {}), true);
  assert.deepEqual(parseEmailAllowlist(ALLOW), [DIEGO]);
  assert.equal(isRecipientAllowed(DIEGO, ALLOW), true);
  assert.equal(isRecipientAllowed('Diego@diegodella.ar', ALLOW), true);
  assert.equal(isRecipientAllowed(OTHER, ALLOW), false);
});

test('EMAIL_ALLOWLIST blocks other recipients at enqueue', () => {
  const {dir, store, userId} = ownerStore();
  try {
    const ok = enqueueEmail(store.db, {
      userId, template: 'daily_digest', toEmail: DIEGO, subject: 'ok', bodyText: 'ok',
      env: ALLOW,
    });
    assert.equal(ok.status, 'pending');
    assert.ok(ok.id);

    const blocked = enqueueEmail(store.db, {
      userId, template: 'alert_trades', toEmail: OTHER, subject: 'no', bodyText: 'no',
      env: ALLOW, now: () => Date.parse('2026-11-10T12:00:00.000Z'),
    });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.reason, 'recipient_not_allowed');
    assert.equal(blocked.id, null);
    const rows = store.db.prepare('SELECT template, to_email FROM email_outbox').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].to_email, DIEGO);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('EMAIL_ALLOWLIST blocks other recipients at sendViaResend and processOutbox', async () => {
  const {dir, store, userId} = ownerStore();
  try {
    let resendCalls = 0;
    const fetcher = async () => {
      resendCalls++;
      return {ok: true, json: async () => ({id: 'should-not-send'})};
    };

    await assert.rejects(
      () => sendViaResend(
        {to: OTHER, subject: 'x', text: 'x'},
        {apiKey: 're_test', fetcher, env: ALLOW},
      ),
      /EMAIL_ALLOWLIST/,
    );
    assert.equal(resendCalls, 0);

    const now = Date.parse('2026-11-09T15:00:00.000Z');
    enqueueEmail(store.db, {
      userId, template: 'daily_digest', toEmail: OTHER, subject: 'x', bodyText: 'x',
      now: () => now, env: {},
    });
    const result = await processOutbox(store.db, {
      apiKey: 're_test', fetcher, env: {FEATURE_EMAIL: '1', EMAIL_ALLOWLIST: DIEGO}, now: () => now,
    });
    assert.equal(result.sent, 0);
    assert.equal(result.skipped, 1);
    assert.equal(resendCalls, 0);
    const row = store.db.prepare('SELECT status, error FROM email_outbox LIMIT 1').get();
    assert.equal(row.status, 'failed');
    assert.match(row.error, /EMAIL_ALLOWLIST/);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('one pending or sent row per user template UTC day; sent digest blocks 21:00Z schedule', () => {
  const {dir, store, userId} = ownerStore();
  try {
    const now = Date.parse('2026-11-09T15:42:00.000Z');
    const first = enqueueEmail(store.db, {
      userId, template: 'daily_digest', toEmail: DIEGO, subject: 'test digest', bodyText: 'sample',
      now: () => now,
    });
    assert.equal(first.status, 'pending');
    markEmailSent(store.db, first.id, {now: () => now});

    const second = enqueueEmail(store.db, {
      userId, template: 'daily_digest', toEmail: DIEGO, subject: 'again', bodyText: 'again',
      scheduledAt: '2026-11-09T21:00:00.000Z', now: () => now,
    });
    assert.equal(second.duplicate, true);
    assert.equal(second.reason, 'already_queued_or_sent');
    assert.equal(second.id, first.id);

    const scheduled = scheduleDailyDigest(store.db, {
      userId,
      newsItems: [{title: 'n', url: 'https://example.test/n'}],
      enrichedData: {portfolio: {dayPct: 0.05}, theses: [], autoActions: []},
      now: () => now,
    });
    assert.equal(scheduled.scheduled, false);
    assert.equal(scheduled.reason, 'already_scheduled');

    const count = store.db.prepare(
      "SELECT COUNT(*) AS n FROM email_outbox WHERE template='daily_digest'",
    ).get().n;
    assert.equal(count, 1);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('template test still allows two rows the same day', () => {
  const {dir, store, userId} = ownerStore();
  try {
    const now = 1_000_000_000_000;
    const a = enqueueEmail(store.db, {
      userId, template: 'test', toEmail: 'a@example.test', subject: 'a', bodyText: 'a', now: () => now,
    });
    const b = enqueueEmail(store.db, {
      userId, template: 'test', toEmail: 'b@example.test', subject: 'b', bodyText: 'b', now: () => now,
    });
    assert.ok(a.id);
    assert.ok(b.id);
    assert.notEqual(a.id, b.id);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('FEATURE_EMAIL=0 does not send; duplicate guard still applies at enqueue', async () => {
  const {dir, store, userId} = ownerStore();
  try {
    const now = Date.parse('2026-11-09T16:00:00.000Z');
    enqueueEmail(store.db, {
      userId, template: 'daily_digest', toEmail: DIEGO, subject: 'one', bodyText: 'one', now: () => now,
    });
    const dup = enqueueEmail(store.db, {
      userId, template: 'daily_digest', toEmail: DIEGO, subject: 'two', bodyText: 'two', now: () => now,
    });
    assert.equal(dup.duplicate, true);

    let resendCalls = 0;
    const result = await processOutbox(store.db, {
      apiKey: 're_test',
      fetcher: async () => { resendCalls++; return {ok: true, json: async () => ({id: 'x'})}; },
      env: {FEATURE_EMAIL: '0', EMAIL_ALLOWLIST: DIEGO},
      now: () => now,
    });
    assert.equal(result.reason, 'feature_disabled');
    assert.equal(result.processed, 0);
    assert.equal(resendCalls, 0);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('unique day index exists and SCHEMA_USER_VERSION stays 21', () => {
  const {dir, store} = ownerStore();
  try {
    assert.equal(SCHEMA_USER_VERSION, 21);
    const idx = store.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name=?",
    ).get(EMAIL_OUTBOX_DAY_INDEX);
    assert.ok(idx?.sql);
    assert.match(idx.sql, /date\(scheduled_at\)/i);
    assert.match(idx.sql, /pending/);
    assert.match(idx.sql, /template <> 'test'/);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('allowlisted diego recipient can still be sent when FEATURE_EMAIL=1', async () => {
  const {dir, store, userId} = ownerStore();
  try {
    const now = Date.parse('2026-11-09T16:00:00.000Z');
    enqueueEmail(store.db, {
      userId, template: 'daily_digest', toEmail: DIEGO, subject: 'Tu cartera', bodyText: 'sample',
      now: () => now, env: ALLOW,
    });
    let captured = null;
    const result = await processOutbox(store.db, {
      apiKey: 're_test',
      fetcher: async (_url, opts) => {
        captured = JSON.parse(opts.body);
        return {ok: true, json: async () => ({id: 'msg-1'})};
      },
      env: {FEATURE_EMAIL: '1', EMAIL_ALLOWLIST: DIEGO},
      now: () => now,
    });
    assert.equal(result.sent, 1);
    assert.equal(captured.from, EMAIL_FROM);
    assert.deepEqual(captured.to, [DIEGO]);
  } finally {
    store.close();
    cleanup(dir);
  }
});
