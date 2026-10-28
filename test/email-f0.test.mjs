import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../lib/store.mjs';
import {emailEnabled} from '../lib/features.mjs';
import {
  getEmailPrefs, updateEmailPrefs, createEmailVerificationToken,
  verifyEmailToken, enqueueEmail, getPendingEmails, markEmailSent, markEmailFailed,
  isEmailSuppressed, suppressEmail, getDailyEmailCount, incrementDailyEmailCount,
  processOutbox, initializeEmailPrefsForUser, sendViaResend, EMAIL_DAILY_LIMIT,
  EMAIL_FROM, LEGAL_FOOTER_SPANISH,
} from '../lib/email.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'email-test-'));
}

function cleanup(dir) {
  try { rmSync(dir, {recursive: true}); } catch {}
}

test('FEATURE_EMAIL is off by default', () => {
  assert.equal(emailEnabled({}), false);
  assert.equal(emailEnabled({FEATURE_EMAIL: '0'}), false);
  assert.equal(emailEnabled({FEATURE_EMAIL: '1'}), true);
  assert.equal(emailEnabled({FEATURE_EMAIL: 'true'}), true);
});

test('v19 migration creates email tables', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    assert.equal(store.userVersion(), 19);
    
    const tables = ['email_verification_tokens', 'email_outbox', 'email_prefs', 'email_suppressions', 'email_daily_counts'];
    for (const table of tables) {
      const row = store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
      assert.ok(row, `${table} table should exist`);
    }
    
    const userCols = store.db.prepare("PRAGMA table_info(users)").all().map(col => col.name);
    assert.ok(userCols.includes('email_verified'), 'users.email_verified should exist');
    assert.ok(userCols.includes('email_verified_at'), 'users.email_verified_at should exist');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('getEmailPrefs returns defaults for new user', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    const prefs = getEmailPrefs(store.db, userId);
    assert.equal(prefs.userId, userId);
    assert.equal(prefs.tradesEnabled, 0);
    assert.equal(prefs.newsEnabled, 0);
    assert.equal(prefs.thresholdAssetPct, 5.0);
    assert.equal(prefs.thresholdPortfolioPct, 3.0);
    assert.equal(prefs.updatedAt, null);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('updateEmailPrefs creates and updates preferences', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    const updated1 = updateEmailPrefs(store.db, userId, {tradesEnabled: true}, {now: () => now});
    assert.equal(updated1.tradesEnabled, 1);
    assert.equal(updated1.newsEnabled, 0);
    assert.ok(updated1.updatedAt);
    
    now += 1000;
    const updated2 = updateEmailPrefs(store.db, userId, {newsEnabled: true, thresholdAssetPct: 10.0}, {now: () => now});
    assert.equal(updated2.tradesEnabled, 1);
    assert.equal(updated2.newsEnabled, 1);
    assert.equal(updated2.thresholdAssetPct, 10.0);
    assert.notEqual(updated2.updatedAt, updated1.updatedAt);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('createEmailVerificationToken and verifyEmailToken flow', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    const userBefore = store.db.prepare('SELECT email_verified FROM users WHERE id=?').get(userId);
    assert.equal(userBefore.email_verified, 0);
    
    const {token, expiresAt} = createEmailVerificationToken(store.db, userId, {now: () => now});
    assert.ok(token);
    assert.ok(expiresAt);
    
    now += 1000;
    const result = verifyEmailToken(store.db, token, {now: () => now});
    assert.equal(result.userId, userId);
    assert.equal(result.email, 'test@example.com');
    
    const userAfter = store.db.prepare('SELECT email_verified, email_verified_at FROM users WHERE id=?').get(userId);
    assert.equal(userAfter.email_verified, 1);
    assert.ok(userAfter.email_verified_at);
    
    assert.throws(() => verifyEmailToken(store.db, token, {now: () => now}), /ya fue usado/);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('verifyEmailToken rejects expired token', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    const {token} = createEmailVerificationToken(store.db, userId, {now: () => now});
    now += 25 * 60 * 60 * 1000;
    
    assert.throws(() => verifyEmailToken(store.db, token, {now: () => now}), /expiró/);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('enqueueEmail and getPendingEmails', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    const email1 = enqueueEmail(store.db, {
      userId,
      template: 'test',
      toEmail: 'user@example.com',
      subject: 'Test',
      bodyText: 'Hello',
      bodyHtml: '<p>Hello</p>',
      meta: {foo: 'bar'},
      now: () => now,
    });
    assert.ok(email1.id);
    assert.equal(email1.status, 'pending');
    
    const pending = getPendingEmails(store.db, {limit: 10, now: () => now});
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, email1.id);
    assert.equal(pending[0].toEmail, 'user@example.com');
    assert.deepEqual(pending[0].meta, {foo: 'bar'});
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('markEmailSent and markEmailFailed update status', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    const email1 = enqueueEmail(store.db, {userId, template: 'test', toEmail: 'user@example.com', subject: 'Test', bodyText: 'Hello', now: () => now});
    const email2 = enqueueEmail(store.db, {userId, template: 'test', toEmail: 'user2@example.com', subject: 'Test', bodyText: 'Hello', now: () => now});
    
    markEmailSent(store.db, email1.id, {now: () => now});
    const sent = store.db.prepare('SELECT status, sent_at FROM email_outbox WHERE id=?').get(email1.id);
    assert.equal(sent.status, 'sent');
    assert.ok(sent.sent_at);
    
    markEmailFailed(store.db, email2.id, 'Test error', {now: () => now});
    const failed = store.db.prepare('SELECT status, error FROM email_outbox WHERE id=?').get(email2.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error, 'Test error');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('isEmailSuppressed and suppressEmail', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    
    const check1 = isEmailSuppressed(store.db, 'user@example.com');
    assert.equal(check1.suppressed, false);
    
    suppressEmail(store.db, 'user@example.com', 'bounce');
    const check2 = isEmailSuppressed(store.db, 'user@example.com');
    assert.equal(check2.suppressed, true);
    assert.equal(check2.reason, 'bounce');
    
    suppressEmail(store.db, 'USER@EXAMPLE.COM', 'complaint');
    const check3 = isEmailSuppressed(store.db, 'user@example.com');
    assert.equal(check3.suppressed, true);
    assert.equal(check3.reason, 'complaint');
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('getDailyEmailCount and incrementDailyEmailCount', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    const day = '2026-10-28';
    
    const count1 = getDailyEmailCount(store.db, userId, day);
    assert.equal(count1, 0);
    
    const count2 = incrementDailyEmailCount(store.db, userId, day);
    assert.equal(count2, 1);
    
    const count3 = incrementDailyEmailCount(store.db, userId, day);
    assert.equal(count3, 2);
    
    const count4 = getDailyEmailCount(store.db, userId, day);
    assert.equal(count4, 2);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('processOutbox respects FEATURE_EMAIL flag', async () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    enqueueEmail(store.db, {userId, template: 'test', toEmail: 'user@example.com', subject: 'Test', bodyText: 'Hello'});
    
    const result = await processOutbox(store.db, {env: {FEATURE_EMAIL: '0'}});
    assert.equal(result.reason, 'feature_disabled');
    assert.equal(result.processed, 0);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('processOutbox respects missing API key', async () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    enqueueEmail(store.db, {userId, template: 'test', toEmail: 'user@example.com', subject: 'Test', bodyText: 'Hello'});
    
    const result = await processOutbox(store.db, {env: {FEATURE_EMAIL: '1'}});
    assert.equal(result.reason, 'no_api_key');
    assert.equal(result.processed, 0);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('processOutbox skips unverified emails', async () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    enqueueEmail(store.db, {userId, template: 'test', toEmail: 'test@example.com', subject: 'Test', bodyText: 'Hello', now: () => now});
    
    const mockFetch = async () => ({ok: true, json: async () => ({id: 'mock-id'})});
    const result = await processOutbox(store.db, {
      apiKey: 'test-key',
      fetcher: mockFetch,
      env: {FEATURE_EMAIL: '1'},
      now: () => now,
    });
    
    assert.equal(result.skipped, 1);
    assert.equal(result.sent, 0);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('processOutbox skips suppressed emails', async () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    suppressEmail(store.db, 'test@example.com', 'bounce');
    enqueueEmail(store.db, {userId, template: 'test', toEmail: 'test@example.com', subject: 'Test', bodyText: 'Hello', now: () => now});
    
    const mockFetch = async () => ({ok: true, json: async () => ({id: 'mock-id'})});
    const result = await processOutbox(store.db, {
      apiKey: 'test-key',
      fetcher: mockFetch,
      env: {FEATURE_EMAIL: '1'},
      now: () => now,
    });
    
    assert.equal(result.skipped, 1);
    assert.equal(result.sent, 0);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('processOutbox enforces daily limit', async () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    const day = new Date(now).toISOString().slice(0, 10);
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    
    for (let i = 0; i < EMAIL_DAILY_LIMIT; i++) {
      incrementDailyEmailCount(store.db, userId, day);
    }
    
    enqueueEmail(store.db, {userId, template: 'test', toEmail: 'test@example.com', subject: 'Test', bodyText: 'Hello', now: () => now});
    
    const mockFetch = async () => ({ok: true, json: async () => ({id: 'mock-id'})});
    const result = await processOutbox(store.db, {
      apiKey: 'test-key',
      fetcher: mockFetch,
      env: {FEATURE_EMAIL: '1'},
      now: () => now,
    });
    
    assert.equal(result.skipped, 1);
    assert.equal(result.sent, 0);
    
    const emailRow = store.db.prepare('SELECT status, error FROM email_outbox LIMIT 1').get();
    assert.equal(emailRow.status, 'failed');
    assert.ok(emailRow.error.includes('Daily limit'));
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('processOutbox sends verified emails with List-Unsubscribe', async () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    let now = 1000000000000;
    
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    enqueueEmail(store.db, {userId, template: 'test', toEmail: 'test@example.com', subject: 'Test Subject', bodyText: 'Hello World', now: () => now});
    
    let capturedPayload = null;
    const mockFetch = async (url, opts) => {
      capturedPayload = JSON.parse(opts.body);
      return {ok: true, json: async () => ({id: 'mock-id'})};
    };
    
    const result = await processOutbox(store.db, {
      apiKey: 'test-key',
      fetcher: mockFetch,
      env: {FEATURE_EMAIL: '1'},
      now: () => now,
    });
    
    assert.equal(result.sent, 1);
    assert.ok(capturedPayload);
    assert.equal(capturedPayload.from, EMAIL_FROM);
    assert.deepEqual(capturedPayload.to, ['test@example.com']);
    assert.equal(capturedPayload.subject, 'Test Subject');
    assert.equal(capturedPayload.text, 'Hello World');
    assert.ok(capturedPayload.headers['List-Unsubscribe']);
    assert.ok(capturedPayload.headers['List-Unsubscribe'].includes('laviste.diegodella.ar'));
    
    const emailRow = store.db.prepare('SELECT status, sent_at FROM email_outbox LIMIT 1').get();
    assert.equal(emailRow.status, 'sent');
    assert.ok(emailRow.sent_at);
    
    const count = getDailyEmailCount(store.db, userId, new Date(now).toISOString().slice(0, 10));
    assert.equal(count, 1);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('initializeEmailPrefsForUser sets defaults based on auto policy', () => {
  const dir = tmp();
  try {
    const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-123'});
    const userId = store.ownerUserId();
    
    const prefs1 = initializeEmailPrefsForUser(store.db, userId, {hasAutoPolicyEnabled: false});
    assert.equal(prefs1.tradesEnabled, 0);
    assert.equal(prefs1.newsEnabled, 0);
    
    const user2Id = store.createUser({email: 'user2@example.com', password: 'password123', role: 'user'});
    const prefs2 = initializeEmailPrefsForUser(store.db, user2Id, {hasAutoPolicyEnabled: true});
    assert.equal(prefs2.tradesEnabled, 1);
    assert.equal(prefs2.newsEnabled, 0);
    
    const prefs2Again = initializeEmailPrefsForUser(store.db, user2Id, {hasAutoPolicyEnabled: false});
    assert.equal(prefs2Again.tradesEnabled, 1);
    
    store.close();
  } finally {
    cleanup(dir);
  }
});

test('sendViaResend formats request correctly', async () => {
  let capturedUrl = null;
  let capturedOpts = null;
  
  const mockFetch = async (url, opts) => {
    capturedUrl = url;
    capturedOpts = opts;
    return {ok: true, json: async () => ({id: 'test-msg-id'})};
  };
  
  const result = await sendViaResend({
    to: 'user@example.com',
    subject: 'Test',
    text: 'Hello',
    html: '<p>Hello</p>',
    headers: {'X-Custom': 'value'},
  }, {apiKey: 'test-key', fetcher: mockFetch});
  
  assert.equal(result.ok, true);
  assert.equal(result.messageId, 'test-msg-id');
  assert.ok(capturedUrl.includes('api.resend.com'));
  assert.equal(capturedOpts.method, 'POST');
  assert.ok(capturedOpts.headers.Authorization.includes('test-key'));
  
  const payload = JSON.parse(capturedOpts.body);
  assert.equal(payload.from, EMAIL_FROM);
  assert.deepEqual(payload.to, ['user@example.com']);
  assert.equal(payload.subject, 'Test');
  assert.equal(payload.text, 'Hello');
  assert.equal(payload.html, '<p>Hello</p>');
  assert.equal(payload.headers['X-Custom'], 'value');
});

test('sendViaResend throws when API key missing', async () => {
  await assert.rejects(
    () => sendViaResend({to: 'user@example.com', subject: 'Test', text: 'Hello'}),
    /RESEND_API_KEY not configured/
  );
});

test('sendViaResend throws on API error', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 400,
    text: async () => 'Bad request',
  });
  
  await assert.rejects(
    () => sendViaResend({to: 'user@example.com', subject: 'Test', text: 'Hello'}, {apiKey: 'test-key', fetcher: mockFetch}),
    /Resend API error.*400/
  );
});

test('LEGAL_FOOTER_SPANISH is present and non-empty', () => {
  assert.ok(LEGAL_FOOTER_SPANISH.length > 20);
  assert.ok(LEGAL_FOOTER_SPANISH.includes('educativo'));
  assert.ok(LEGAL_FOOTER_SPANISH.includes('simulado'));
  assert.ok(LEGAL_FOOTER_SPANISH.includes('práctica'));
});
