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
  getEmailPrefs, updateEmailPrefs, initializeEmailPrefsForUser,
  promoteEmailPrefsOnAutoEnabled, unsubscribeUser,
} from '../lib/email.mjs';
import {SCHEMA_USER_VERSION} from '../lib/migrations/multiuser.mjs';
import * as copy from '../public/copy.mjs';

const OWNER_EMAIL = 'ana@ejemplo.com';
const OWNER_PASSWORD = 'test-password-123';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'cuenta-email-uat2-'));
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

async function startEmailApp(dir) {
  const app = createApp({
    dataDir: dir,
    password: OWNER_PASSWORD,
    ownerEmail: OWNER_EMAIL,
    port: 0,
    host: '127.0.0.1',
    quotesLive: false,
    autoStartTimer: false,
    emailWorkerStartTimer: false,
    env: {FEATURE_EMAIL: '1', FEATURE_AUTO_SIM: '1'},
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

test('N3: promote skips explicit off/off and unsubscribe; untouched default still promotes', () => {
  assert.equal(SCHEMA_USER_VERSION, 21);
  const {dir, store, userId} = ownerStore();
  try {
    initializeEmailPrefsForUser(store.db, userId, {hasAutoPolicyEnabled: false});
    assert.equal(getEmailPrefs(store.db, userId).tradesFreq, 'off');
    const promoted = promoteEmailPrefsOnAutoEnabled(store.db, userId);
    assert.equal(promoted.tradesFreq, 'each');
    assert.equal(promoted.pausaFreq, 'each');

    updateEmailPrefs(store.db, userId, {tradesFreq: 'off', pausaFreq: 'off', digestFreq: 'off'});
    const afterOff = promoteEmailPrefsOnAutoEnabled(store.db, userId);
    assert.equal(afterOff.tradesFreq, 'off');
    assert.equal(afterOff.pausaFreq, 'off');
    assert.equal(afterOff.digestFreq, 'off');

    updateEmailPrefs(store.db, userId, {tradesFreq: 'off', pausaFreq: 'off', digestFreq: 'daily'});
    const afterDaily = promoteEmailPrefsOnAutoEnabled(store.db, userId);
    assert.equal(afterDaily.tradesFreq, 'off');
    assert.equal(afterDaily.pausaFreq, 'off');

    unsubscribeUser(store.db, userId);
    const afterUnsub = promoteEmailPrefsOnAutoEnabled(store.db, userId);
    assert.equal(afterUnsub.tradesFreq, 'off');
    assert.equal(afterUnsub.digestFreq, 'off');
  } finally {
    store.close();
    cleanup(dir);
  }
});

test('N3: enabling Automático after Apagar todos does not restore each/each', async () => {
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
    initializeEmailPrefsForUser(store.db, userId, {hasAutoPolicyEnabled: true});
    updateEmailPrefs(store.db, userId, {tradesFreq: 'off', pausaFreq: 'off', digestFreq: 'off'});
    store.close();

    const started = await startEmailApp(dir);
    app = started.app;
    const liveId = app.store.ownerUserId();
    const liveTake = app.store.forUser(liveId).takes().find(t => t.phase === 'active');
    app.store.setSetting('autoTrading', {enabled: true, allowUserIds: [liveId], marketHolidays: []});
    const put = await jsonReq(started.base + `/api/takes/${liveTake.id}/auto`, {
      method: 'PUT',
      headers: started.headers,
      body: {enabled: true, consentVersion: 'v1', version: liveTake.version},
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    const prefs = getEmailPrefs(app.store.db, liveId);
    assert.equal(prefs.tradesFreq, 'off');
    assert.equal(prefs.pausaFreq, 'off');
    assert.equal(prefs.digestFreq, 'off');
  } finally {
    if (app?.server?.listening) await app.close();
    else app?.store?.close();
    cleanup(dir);
  }
});

test('F1: dirty resend skips outer finally so a third change cannot run in parallel', () => {
  const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const save = appJs.slice(appJs.indexOf('async function saveMailsPrefs'), appJs.indexOf('function queueMailsSave'));
  const dirty = save.slice(save.indexOf('if (mailsDirty)'), save.indexOf('mailsDesired = {...mailsConfirmed}'));
  assert.match(dirty, /return await saveMailsPrefs\(\)/);
  assert.match(dirty, /requeued = true/);
  assert.match(save, /if \(!requeued\)/);
});

test('F10: blocked-option error renders next to the triggering fieldset', () => {
  const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(appJs, /mailsErrorHtml\('pausa'\)/);
  assert.match(appJs, /mailsErrorHtml\('trades'\)/);
  assert.match(appJs, /mailsErrorHtml\('digest'\)/);
  assert.match(appJs, /showMailsControlError\(input\?\.name === 'mails-pausa' \? 'pausa'/);
  assert.match(appJs, /err\.scrollIntoView\(\{block: 'nearest'\}\)/);
});

test('F6: digest_required UI uses spec S11 copy; N-1 focus ring uses tokens', () => {
  const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const theme = readFileSync(new URL('../public/app-theme.css', import.meta.url), 'utf8');
  const save = appJs.slice(appJs.indexOf('async function saveMailsPrefs'), appJs.indexOf('function queueMailsSave'));
  assert.match(save, /err\.code === 'digest_required'[\s\S]*MAILS_DIGEST_CONFLICT/);
  assert.equal(copy.MAILS_DIGEST_CONFLICT, 'Con el resumen apagado, lo que mandaste al resumen no te va a llegar. Prendé el resumen o elegí otra opción.');
  assert.match(theme, /#account-mails:focus,/);
  assert.match(theme, /#account-mails:focus-visible \{/);
  assert.match(theme, /outline:\s*2px solid var\(--lv-focus\)/);
  assert.match(theme, /outline-offset:\s*4px/);
});
