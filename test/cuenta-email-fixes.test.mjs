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
  getEmailPrefs, updateEmailPrefs, initializeEmailPrefsForUser, presentEmailPrefs,
  promoteEmailPrefsOnAutoEnabled, processOutbox, enqueueEmail,
  createUnsubscribeToken, verifyUnsubscribeToken, unsubscribeSecret,
  EMAIL_TRADES_DEFAULT_MAX, EMAIL_UNSUBSCRIBE_TTL_MS,
} from '../lib/email.mjs';
import {ensureEmailPrefsAndDedupe, SCHEMA_USER_VERSION} from '../lib/migrations/multiuser.mjs';
import * as copy from '../public/copy.mjs';

const OWNER_EMAIL = 'ana@ejemplo.com';
const OWNER_PASSWORD = 'test-password-123';
const UNSUB_SECRET = 'unsub-secret-de-prueba-12';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'cuenta-email-fixes-'));
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

test('P1-1/F8: chosen digest-off option is not disabled; P2-7 follows S11', () => {
  const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(appJs, /digestOffDisabled = false/);
  assert.doesNotMatch(appJs, /digestOffDisabled = needsDigest;/);
  assert.doesNotMatch(appJs, /mailsOpt\(\{name: 'mails-digest', value: 'off'[^}]*MAILS_DIGEST_OFF_BLOCK/);
});

test('F1: dirty queue keeps desired and resends it', () => {
  const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const save = appJs.slice(appJs.indexOf('async function saveMailsPrefs'), appJs.indexOf('function queueMailsSave'));
  assert.match(save, /if \(mailsDirty\) \{/);
  const dirty = save.slice(save.indexOf('if (mailsDirty)'), save.indexOf('mailsDesired = {...mailsConfirmed}'));
  assert.match(dirty, /return saveMailsPrefs\(\)/);
  assert.doesNotMatch(dirty, /mailsDesired = \{\.\.\.mailsConfirmed\}/);
});

test('F2/F3/P2 CSS: hidden select, scroll-margin, amber border, rules gap, max-row, 390', () => {
  const theme = readFileSync(new URL('../public/app-theme.css', import.meta.url), 'utf8');
  assert.match(theme, /\.account-page \.mails-section \.mails-max-row\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(theme, /#account-mails \{\s*scroll-margin-top:/);
  assert.match(theme, /\.account-page \.callout\.amber \{\s*border-left:\s*3px solid var\(--lv-warning\)/);
  assert.match(theme, /\.mails-rules-title \{\s*margin-top:\s*24px/);
  assert.match(theme, /\.mails-max-row select \{\s*max-width:\s*240px/);
  assert.match(theme, /\.mails-quick \.btn \{\s*width:\s*100%/);
  assert.match(theme, /\.account-page \.mails-section select \{\s*font-size:\s*16px/);
  assert.match(theme, /\.opt-sub,\s*\.opt-block \{\s*font-size:\s*14px/);
  assert.match(theme, /\.opt\.is-disabled \.opt-title,/);
  assert.doesNotMatch(theme, /\.opt\.is-disabled \{\s*cursor: default;\s*opacity:/);
});

test('F5/F10/F12 source pins', () => {
  const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(appJs, /mailsSaveStatus === 'all-off'\) document\.getElementById\('account-mails'\)\?\.focus\(\)/);
  assert.match(appJs, /err\.scrollIntoView\(\{block: 'nearest'\}\)/);
  assert.match(appJs, /id === 'email' && meState\?\.emailEnabled && meState\.emailPrefs \? MAILS_DOC_TITLE/);
});

test('F14: GET /api/me does not insert prefs; overlay N=3; F4 promotes intact off/off', async () => {
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
    const me = await jsonReq(started.base + '/api/me', {headers: started.headers});
    assert.equal(me.status, 200);
    assert.equal(me.data.emailPrefs.tradesMaxPerDay, EMAIL_TRADES_DEFAULT_MAX);
    assert.equal(me.data.emailPrefs.updatedAt, null);
    const row = app.store.db.prepare('SELECT user_id FROM email_prefs WHERE user_id=?').get(liveId);
    assert.equal(row, undefined);

    initializeEmailPrefsForUser(app.store.db, liveId, {hasAutoPolicyEnabled: false});
    assert.equal(getEmailPrefs(app.store.db, liveId).tradesFreq, 'off');

    app.store.setSetting('autoTrading', {enabled: true, allowUserIds: [liveId], marketHolidays: []});
    const liveTake = app.store.forUser(liveId).takes().find(t => t.phase === 'active');
    const put = await jsonReq(started.base + `/api/takes/${liveTake.id}/auto`, {
      method: 'PUT',
      headers: started.headers,
      body: {enabled: true, consentVersion: 'v1', version: liveTake.version},
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    const prefs = getEmailPrefs(app.store.db, liveId);
    assert.equal(prefs.tradesFreq, 'each');
    assert.equal(prefs.pausaFreq, 'each');
  } finally {
    if (app?.server?.listening) await app.close();
    else app?.store?.close();
    cleanup(dir);
  }
});

test('F4: explicit max_per_day is not overwritten when enabling Automático', () => {
  const {dir, store, userId} = ownerStore();
  try {
    updateEmailPrefs(store.db, userId, {tradesFreq: 'max_per_day', tradesMaxPerDay: 2, pausaFreq: 'off'});
    const after = promoteEmailPrefsOnAutoEnabled(store.db, userId);
    assert.equal(after.tradesFreq, 'max_per_day');
    assert.equal(after.tradesMaxPerDay, 2);
    assert.equal(after.pausaFreq, 'off');
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('F11: max-per-day backfill runs once', () => {
  const {dir, store, userId} = ownerStore();
  try {
    assert.equal(SCHEMA_USER_VERSION, 21);
    updateEmailPrefs(store.db, userId, {tradesFreq: 'each', tradesMaxPerDay: 1});
    ensureEmailPrefsAndDedupe(store.db);
    assert.equal(getEmailPrefs(store.db, userId).tradesMaxPerDay, 3);
    updateEmailPrefs(store.db, userId, {tradesFreq: 'each', tradesMaxPerDay: 1});
    ensureEmailPrefsAndDedupe(store.db);
    assert.equal(getEmailPrefs(store.db, userId).tradesMaxPerDay, 1);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('F13: no default secret, tokens expire, session unsubscribe still works', async () => {
  assert.equal(unsubscribeSecret({}), '');
  assert.equal(unsubscribeSecret({APP_PASSWORD: 'x', NODE_ENV: 'production'}), '');
  assert.equal(unsubscribeSecret({EMAIL_UNSUBSCRIBE_SECRET: UNSUB_SECRET, APP_PASSWORD: 'x'}), UNSUB_SECRET);
  assert.equal(createUnsubscribeToken('11111111-1111-1111-1111-111111111111', {secret: ''}), '');
  assert.equal(verifyUnsubscribeToken('a.b.c', {secret: ''}), null);

  const userId = '11111111-1111-1111-1111-111111111111';
  const now = 1_700_000_000_000;
  const token = createUnsubscribeToken(userId, {secret: UNSUB_SECRET, now, ttlMs: EMAIL_UNSUBSCRIBE_TTL_MS});
  assert.match(token, /^11111111-1111-1111-1111-111111111111\.\d+\./);
  assert.equal(verifyUnsubscribeToken(token, {secret: UNSUB_SECRET, now}).userId, userId);
  assert.equal(verifyUnsubscribeToken(token, {secret: UNSUB_SECRET, now: now + EMAIL_UNSUBSCRIBE_TTL_MS + 1000}), null);
  assert.equal(verifyUnsubscribeToken(token, {secret: 'otra', now}), null);

  const dir = tmp();
  let app;
  try {
    const store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
    const uid = store.ownerUserId();
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(uid);
    store.close();
    const started = await startEmailApp(dir);
    app = started.app;

    const noSecret = createUnsubscribeToken(uid, {
      secret: unsubscribeSecret({APP_PASSWORD: OWNER_PASSWORD, NODE_ENV: 'production'}),
    });
    assert.equal(noSecret, '');

    const sessionOff = await jsonReq(started.base + '/api/email/unsubscribe', {
      method: 'POST',
      headers: started.headers,
      body: {},
    });
    assert.equal(sessionOff.status, 200);
    assert.equal(getEmailPrefs(app.store.db, uid).digestFreq, 'off');
  } finally {
    if (app?.server?.listening) await app.close();
    else app?.store?.close();
    cleanup(dir);
  }
});

test('F13: processOutbox signs with EMAIL_UNSUBSCRIBE_SECRET and omits token without it', async () => {
  const {dir, store, userId} = ownerStore();
  try {
    enqueueEmail(store.db, {
      userId, template: 'test', toEmail: OWNER_EMAIL, subject: 'Hola', bodyText: 'Hola',
    });
    let captured = null;
    await processOutbox(store.db, {
      apiKey: 're_test',
      fetcher: async (_url, opts) => {
        captured = JSON.parse(opts.body);
        return {ok: true, json: async () => ({id: 'mock'})};
      },
      env: {FEATURE_EMAIL: '1'},
    });
    assert.match(captured.headers['List-Unsubscribe'], /\/app#\/cuenta\/email/);
    assert.equal(captured.headers['List-Unsubscribe-Post'], undefined);

    enqueueEmail(store.db, {
      userId, template: 'test', toEmail: OWNER_EMAIL, subject: 'Hola 2', bodyText: 'Hola',
    });
    captured = null;
    await processOutbox(store.db, {
      apiKey: 're_test',
      fetcher: async (_url, opts) => {
        captured = JSON.parse(opts.body);
        return {ok: true, json: async () => ({id: 'mock'})};
      },
      env: {FEATURE_EMAIL: '1', EMAIL_UNSUBSCRIBE_SECRET: UNSUB_SECRET},
    });
    assert.match(captured.headers['List-Unsubscribe'], /\/api\/email\/unsubscribe\?token=/);
    assert.equal(captured.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    const token = new URL(captured.headers['List-Unsubscribe'].slice(1, -1)).searchParams.get('token');
    assert.equal(verifyUnsubscribeToken(token, {secret: UNSUB_SECRET}).userId, userId);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('F13: one-click with EMAIL_UNSUBSCRIBE_SECRET unsubscribes', async () => {
  const dir = tmp();
  let app;
  try {
    const store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
    const userId = store.ownerUserId();
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    store.close();
    const started = await startEmailApp(dir, {EMAIL_UNSUBSCRIBE_SECRET: UNSUB_SECRET});
    app = started.app;
    const token = createUnsubscribeToken(userId, {secret: UNSUB_SECRET});
    const oneClick = await fetch(started.base + '/api/email/unsubscribe?token=' + encodeURIComponent(token), {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Sec-Fetch-Site': 'cross-site'},
      body: 'List-Unsubscribe=One-Click',
    });
    assert.equal(oneClick.status, 200, await oneClick.text());
    assert.equal(getEmailPrefs(app.store.db, userId).tradesFreq, 'off');

    await app.close();
    app = null;
    const prod = await startEmailApp(dir, {NODE_ENV: 'production'});
    app = prod.app;
    const passwordToken = createUnsubscribeToken(userId, {secret: OWNER_PASSWORD});
    const closed = await fetch(prod.base + '/api/email/unsubscribe?token=' + encodeURIComponent(passwordToken), {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Sec-Fetch-Site': 'cross-site'},
      body: 'List-Unsubscribe=One-Click',
    });
    assert.equal(closed.status, 400);
    const sessionOff = await jsonReq(prod.base + '/api/email/unsubscribe', {
      method: 'POST',
      headers: prod.headers,
      body: {},
    });
    assert.equal(sessionOff.status, 200);
  } finally {
    if (app?.server?.listening) await app.close();
    else app?.store?.close();
    cleanup(dir);
  }
});

test('presentEmailPrefs overlays N=3 without writing; copy keys stay in spec tone', () => {
  const none = presentEmailPrefs({
    userId: 'x', tradesFreq: 'off', tradesMaxPerDay: 1, pausaFreq: 'off',
    digestFreq: 'daily', newsEnabled: 0, updatedAt: null,
  });
  assert.equal(none.tradesMaxPerDay, EMAIL_TRADES_DEFAULT_MAX);
  assert.equal(copy.MAILS_DIGEST_NEEDED_BLOCK, 'Necesita el resumen diario prendido.');
  const env = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(env, /# EMAIL_UNSUBSCRIBE_SECRET\s*$/m);
  assert.doesNotMatch(env, /EMAIL_UNSUBSCRIBE_SECRET=.+/);
});
