import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createApp} from '../server.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {
  getEmailPrefs, updateEmailPrefs, initializeEmailPrefsForUser, processOutbox,
  enqueueEmail, createUnsubscribeToken, verifyUnsubscribeToken,
  unsubscribeSecret, DIGEST_REQUIRED_CODE, DIGEST_REQUIRED_MESSAGE,
  EMAIL_TRADES_DEFAULT_MAX, artDayString, getDailyEmailCount,
} from '../lib/email.mjs';
import {recordPausaAlert, recordTradeAlert, scheduleDailyDigest, ALERT_GROUP_WINDOW_MS} from '../lib/email-alerts.mjs';
import {buildDigestEnrichedData} from '../lib/email-enrichment.mjs';
import {ensureEmailPrefsAndDedupe, SCHEMA_USER_VERSION} from '../lib/migrations/multiuser.mjs';
import * as copy from '../public/copy.mjs';

const OWNER_EMAIL = 'ana@ejemplo.com';
const OWNER_PASSWORD = 'test-password-123';
const WINDOW = ALERT_GROUP_WINDOW_MS;

function tmp() {
  return mkdtempSync(join(tmpdir(), 'cuenta-email-mails-'));
}

function cleanup(dir) {
  try { rmSync(dir, {recursive: true, force: true}); } catch { /* ignore */ }
}

function ownerStore() {
  const dir = tmp();
  const store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
  const userId = store.ownerUserId();
  store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
  return {dir, store, userId};
}

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

async function jsonReq(url, {method = 'GET', headers, body} = {}) {
  const res = await fetch(url, {
    method,
    headers: headers || {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return {status: res.status, data, headers: res.headers, text};
}

async function startEmailApp(dir, extraEnv = {}) {
  const app = createApp({
    dataDir: dir,
    password: OWNER_PASSWORD,
    ownerEmail: OWNER_EMAIL,
    port: 0,
    host: '127.0.0.1',
    quotesLive: false,
    autoStartTimer: false,
    emailWorkerStartTimer: false,
    env: {FEATURE_EMAIL: '1', FEATURE_AUTO_SIM: '1', ...extraEnv},
  });
  const base = await listen(app);
  const login = await jsonReq(base + '/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: {email: OWNER_EMAIL, password: OWNER_PASSWORD},
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const headers = {'Content-Type': 'application/json', Cookie: cookie};
  return {app, base, headers, cookie};
}

test('no-row getEmailPrefs still pins tradesMaxPerDay 1; new rows default to 3', () => {
  const {dir, store, userId} = ownerStore();
  try {
    const none = getEmailPrefs(store.db, userId);
    assert.equal(none.tradesMaxPerDay, 1);
    assert.equal(none.updatedAt, null);

    const created = initializeEmailPrefsForUser(store.db, userId, {hasAutoPolicyEnabled: true});
    assert.equal(created.tradesMaxPerDay, EMAIL_TRADES_DEFAULT_MAX);
    assert.equal(created.tradesFreq, 'each');
    assert.equal(SCHEMA_USER_VERSION, 21);
    assert.equal(store.userVersion(), 21);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('backfill raises leftover default N=1 to 3 except explicit max_per_day', () => {
  const {dir, store, userId} = ownerStore();
  try {
    updateEmailPrefs(store.db, userId, {tradesFreq: 'each', tradesMaxPerDay: 1});
    const other = store.createUser({email: 'beto@ejemplo.com', password: 'password123', role: 'user'});
    updateEmailPrefs(store.db, other, {tradesFreq: 'max_per_day', tradesMaxPerDay: 1});
    ensureEmailPrefsAndDedupe(store.db);
    ensureEmailPrefsAndDedupe(store.db);
    assert.equal(getEmailPrefs(store.db, userId).tradesMaxPerDay, 3);
    assert.equal(getEmailPrefs(store.db, other).tradesMaxPerDay, 1);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('updateEmailPrefs rejects digest off with digest_only or max_per_day', () => {
  const {dir, store, userId} = ownerStore();
  try {
    updateEmailPrefs(store.db, userId, {tradesFreq: 'each', digestFreq: 'daily'});
    assert.throws(
      () => updateEmailPrefs(store.db, userId, {tradesFreq: 'digest_only', digestFreq: 'off'}),
      err => err.code === DIGEST_REQUIRED_CODE && err.message === DIGEST_REQUIRED_MESSAGE,
    );
    assert.throws(
      () => updateEmailPrefs(store.db, userId, {tradesFreq: 'max_per_day', tradesMaxPerDay: 3, digestFreq: 'off'}),
      err => err.code === DIGEST_REQUIRED_CODE,
    );
    assert.throws(
      () => updateEmailPrefs(store.db, userId, {pausaFreq: 'digest_only', digestFreq: 'off'}),
      err => err.code === DIGEST_REQUIRED_CODE,
    );
    const ok = updateEmailPrefs(store.db, userId, {tradesFreq: 'off', pausaFreq: 'off', digestFreq: 'off'});
    assert.equal(ok.digestFreq, 'off');
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('HMAC unsubscribe token is per user and rejects a forged token', () => {
  const secret = 'clave-de-prueba-12';
  const userId = '11111111-1111-1111-1111-111111111111';
  const token = createUnsubscribeToken(userId, {secret});
  assert.equal(verifyUnsubscribeToken(token, {secret}).userId, userId);
  assert.equal(verifyUnsubscribeToken(token, {secret: 'otra'}), null);
  assert.equal(verifyUnsubscribeToken('nope', {secret}), null);
  const other = createUnsubscribeToken('22222222-2222-2222-2222-222222222222', {secret});
  assert.notEqual(token, other);
});

test('tradesFreq off is filtered out of digest autoActions; pausas appear in the digest', () => {
  const {dir, store, userId} = ownerStore();
  try {
    const scoped = store.forUser(userId);
    const take = createTake(templates[0]);
    activate(take, 1_000_000);
    take.monitoringPaused = false;
    scoped.putTake(take);

    const dayStart = '2026-11-09T15:00:00.000Z';
    recordTradeAlert(store.db, {
      userId, takeId: take.id, ticker: 'YPFD', side: 'compra', thesisName: take.title,
      reasonPlain: 'Rebalance de práctica', now: () => Date.parse(dayStart),
    });
    recordPausaAlert(store.db, {
      userId, takeId: take.id, reason: 'tesis_rota', now: () => Date.parse(dayStart) + 1000,
    });

    updateEmailPrefs(store.db, userId, {tradesFreq: 'each', pausaFreq: 'digest_only', digestFreq: 'daily'});
    const on = buildDigestEnrichedData({
      db: store.db, userId, takes: [take], now: new Date('2026-11-09T20:00:00.000Z'),
    });
    assert.ok(on.autoActions.some(a => a.ticker === 'YPFD'));
    assert.ok(on.pausaActions.length >= 1);
    assert.match(on.pausaActions[0].reasonPlain, /Tesis rota|pausa/i);

    updateEmailPrefs(store.db, userId, {tradesFreq: 'off', pausaFreq: 'digest_only', digestFreq: 'daily'});
    const off = buildDigestEnrichedData({
      db: store.db, userId, takes: [take], now: new Date('2026-11-09T20:00:00.000Z'),
    });
    assert.equal(off.autoActions.length, 0);
    assert.ok(off.pausaActions.length >= 1);

    const digest = scheduleDailyDigest(store.db, {
      userId,
      newsItems: [],
      enrichedData: off,
      now: () => Date.parse('2026-11-09T16:00:00.000Z'),
    });
    assert.equal(digest.scheduled, true);
    const body = store.db.prepare("SELECT body_text FROM email_outbox WHERE template='daily_digest'").get().body_text;
    assert.match(body, /Pausas de Automático/i);
    assert.doesNotMatch(body, /YPFD/);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('shouldSend ignores news when newsEnabled is off if nothing else qualifies', () => {
  const {dir, store, userId} = ownerStore();
  try {
    updateEmailPrefs(store.db, userId, {newsEnabled: false, digestFreq: 'daily'});
    const skipped = scheduleDailyDigest(store.db, {
      userId,
      newsItems: [{title: 'Solo noticias', url: 'https://ejemplo.com/n'}],
      enrichedData: {portfolio: {dayPct: 0.001}, theses: [], autoActions: [], pausaActions: [], portfolioMovements: []},
      now: () => Date.parse('2026-11-09T16:00:00.000Z'),
    });
    assert.equal(skipped.scheduled, false);
    assert.equal(skipped.reason, 'no_significant_changes');
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('processOutbox counts the ART day and signs List-Unsubscribe one-click', async () => {
  const {dir, store, userId} = ownerStore();
  try {
    const now = Date.parse('2026-11-09T01:30:00.000Z');
    const utcDay = new Date(now).toISOString().slice(0, 10);
    const artDay = artDayString(now);
    assert.notEqual(utcDay, artDay);

    enqueueEmail(store.db, {
      userId, template: 'test', toEmail: OWNER_EMAIL, subject: 'Hola', bodyText: 'Hola',
      now: () => now,
    });
    let captured = null;
    const result = await processOutbox(store.db, {
      apiKey: 're_test',
      fetcher: async (_url, opts) => {
        captured = JSON.parse(opts.body);
        return {ok: true, json: async () => ({id: 'mock'})};
      },
      env: {FEATURE_EMAIL: '1', EMAIL_UNSUBSCRIBE_SECRET: 'unsub-secret-de-prueba-12'},
      now: () => now,
    });
    assert.equal(result.sent, 1);
    assert.equal(getDailyEmailCount(store.db, userId, artDay), 1);
    assert.equal(getDailyEmailCount(store.db, userId, utcDay), 1);
    assert.match(captured.headers['List-Unsubscribe'], /\/api\/email\/unsubscribe\?token=/);
    assert.equal(captured.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    const token = new URL(captured.headers['List-Unsubscribe'].slice(1, -1)).searchParams.get('token');
    assert.equal(verifyUnsubscribeToken(token, {secret: unsubscribeSecret({EMAIL_UNSUBSCRIBE_SECRET: 'unsub-secret-de-prueba-12'})}).userId, userId);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('GET /api/me exposes emailVerified and PUT prefs enforces digest_required', async () => {
  const dir = tmp();
  let app;
  try {
    const store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
    store.close();
    const started = await startEmailApp(dir);
    app = started.app;
    const me = await jsonReq(started.base + '/api/me', {headers: started.headers});
    assert.equal(me.status, 200);
    assert.equal(typeof me.data.emailVerified, 'boolean');
    assert.equal(me.data.emailEnabled, true);
    assert.ok(me.data.emailPrefs);
    assert.equal(me.data.emailPrefs.tradesMaxPerDay, EMAIL_TRADES_DEFAULT_MAX);

    const rejected = await jsonReq(started.base + '/api/me/email/prefs', {
      method: 'PUT',
      headers: started.headers,
      body: {tradesFreq: 'digest_only', digestFreq: 'off'},
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.data.code, DIGEST_REQUIRED_CODE);
    assert.equal(rejected.data.error, DIGEST_REQUIRED_MESSAGE);

    const ok = await jsonReq(started.base + '/api/me/email/prefs', {
      method: 'PUT',
      headers: started.headers,
      body: {tradesFreq: 'each', pausaFreq: 'each', digestFreq: 'daily', tradesMaxPerDay: 3, newsEnabled: false},
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.tradesFreq, 'each');
  } finally {
    if (app?.server?.listening) await app.close();
    else app?.store?.close();
    cleanup(dir);
  }
});

test('unsubscribe requires a signed token or the session user', async () => {
  const dir = tmp();
  let app;
  try {
    const store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
    const userId = store.ownerUserId();
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    store.close();
    const started = await startEmailApp(dir, {EMAIL_UNSUBSCRIBE_SECRET: 'unsub-secret-de-prueba-12'});
    app = started.app;
    const secret = unsubscribeSecret({EMAIL_UNSUBSCRIBE_SECRET: 'unsub-secret-de-prueba-12'});

    const anon = await jsonReq(started.base + '/api/email/unsubscribe', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: {email: OWNER_EMAIL},
    });
    assert.equal(anon.status, 401);

    const bad = await fetch(started.base + '/api/email/unsubscribe?token=forjado', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Sec-Fetch-Site': 'cross-site'},
      body: 'List-Unsubscribe=One-Click',
    });
    assert.equal(bad.status, 400);

    const token = createUnsubscribeToken(userId, {secret});
    const oneClick = await fetch(started.base + '/api/email/unsubscribe?token=' + encodeURIComponent(token), {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Sec-Fetch-Site': 'cross-site'},
      body: 'List-Unsubscribe=One-Click',
    });
    assert.equal(oneClick.status, 200, await oneClick.text());
    const prefs = getEmailPrefs(app.store.db, userId);
    assert.equal(prefs.tradesFreq, 'off');
    assert.equal(prefs.pausaFreq, 'off');
    assert.equal(prefs.digestFreq, 'off');
    const suppressed = app.store.db.prepare('SELECT reason FROM email_suppressions WHERE email=?').get(OWNER_EMAIL);
    assert.equal(suppressed.reason, 'unsubscribe');
  } finally {
    if (app?.server?.listening) await app.close();
    else app?.store?.close();
    cleanup(dir);
  }
});

test('enabling Automático initializes email prefs for a user without a row', async () => {
  const dir = tmp();
  let app;
  try {
    const store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
    const userId = store.ownerUserId();
    store.setSetting('autoTrading', {enabled: true, allowUserIds: [userId], marketHolidays: []});
    const take = createTake(templates[0]);
    activate(take, 1_000_000);
    take.monitoringPaused = false;
    store.forUser(userId).putTake(take);
    store.close();
    const started = await startEmailApp(dir);
    app = started.app;
    const liveId = app.store.ownerUserId();
    app.store.setSetting('autoTrading', {enabled: true, allowUserIds: [liveId], marketHolidays: []});
    const liveTake = app.store.forUser(liveId).takes().find(t => t.phase === 'active') || app.store.forUser(liveId).take(take.id);
    const before = app.store.db.prepare('SELECT user_id FROM email_prefs WHERE user_id=?').get(liveId);
    assert.equal(before, undefined);

    const put = await jsonReq(started.base + `/api/takes/${liveTake.id}/auto`, {
      method: 'PUT',
      headers: started.headers,
      body: {enabled: true, consentVersion: 'v1', version: liveTake.version},
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    const prefs = getEmailPrefs(app.store.db, userId);
    assert.equal(prefs.tradesFreq, 'each');
    assert.equal(prefs.pausaFreq, 'each');
    assert.equal(prefs.tradesMaxPerDay, EMAIL_TRADES_DEFAULT_MAX);
  } finally {
    if (app?.server?.listening) await app.close();
    else app?.store?.close();
    cleanup(dir);
  }
});

test('Mails copy, J help, and cuenta markup reuse existing Clarity controls', () => {
  assert.equal(copy.MAILS_DIGEST_NEEDED_BLOCK, 'Necesita el resumen diario prendido.');
  assert.equal(copy.MAILS_DIGEST_OFF_BLOCK, 'Necesita que operaciones y pausas no usen el resumen.');
  assert.equal(copy.MAILS_ERR_DIGEST, 'El resumen diario tiene que estar prendido para esa opción. Prendelo o elegí otra.');
  assert.equal(DIGEST_REQUIRED_MESSAGE, 'El resumen diario tiene que estar prendido si las operaciones o las pausas van al resumen.');
  assert.match(copy.ACCOUNT_LEAD, /mails que te mandamos/);
  assert.equal(copy.MAILS_RULE_DIGEST('3 %', '5 %').includes('3 %'), true);
  assert.equal(copy.friendlyApiError({code: 'digest_required'}), copy.MAILS_ERR_DIGEST);

  const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(appJs, /id="cuenta-mails"/);
  assert.match(appJs, /#\/verificar-email|verificar-email/);
  assert.match(appJs, /mails-digest-conflict/);
  assert.match(appJs, /MAILS_DIGEST_NEEDED_BLOCK/);
  assert.match(appJs, /MAILS_DIGEST_OFF_BLOCK/);
  assert.match(appJs, /switchHtml\(/);
  assert.match(appJs, /class="opt/);
  assert.match(appJs, /label class="field mails-max-row"/);
  assert.doesNotMatch(appJs, /new-mails-widget|MailsStepper|segmented-control/);

  const theme = readFileSync(new URL('../public/app-theme.css', import.meta.url), 'utf8');
  assert.match(theme, /\.account-page \.mails-section \.opt-grid/);
});
