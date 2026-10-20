import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createApp} from '../server.mjs';
import {createStore} from '../lib/store.mjs';
import {hashPassword, verifyPassword} from '../lib/password.mjs';
import {
  createAuth, hashToken, ADMIN_RESET_MAX, RESET_CHECK_MAX, RESET_TTL_MS,
  SESSION_COOKIE, PW_ERR_SHORT, RESET_INVALID_TITLE, RESET_RATE,
  ADMIN_RESET_SELF, ADMIN_RESET_SUSPENDED, ADMIN_RESET_RATE,
} from '../lib/auth.mjs';

const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_EMAIL = 'ana@example.test';
const USER_PASSWORD = 'user-ana-password-12';
const NEW_PASSWORD = 'nueva-clave-12x';
const ADMIN_KEY = 'k'.repeat(32);
const RESET_PASSWORD = resolve('scripts/reset-password.mjs');
const ORIGIN = 'https://laviste.example.test';
const LINK_RE = /^https?:\/\/[^/]+\/app#\/restablecer\?t=[A-Za-z0-9_-]{43}$/;

function tmp() {
  return mkdtempSync(join(tmpdir(), 'p0a-reset-'));
}

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

function cookiePair(res) {
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

function jsonHeaders(cookie) {
  const headers = {'Content-Type': 'application/json'};
  if (cookie) headers.Cookie = cookie;
  return headers;
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

async function startApp(dir, options = {}) {
  const app = createApp({
    dataDir: dir,
    password: OWNER_PASSWORD,
    ownerEmail: OWNER_EMAIL,
    adminKey: ADMIN_KEY,
    apiKey: '',
    port: 0,
    host: '127.0.0.1',
    secure: true,
    origin: ORIGIN,
    quotesLive: false,
    ...options,
  });
  const base = await listen(app);
  return {app, base};
}

async function closeApp(app, dir) {
  if (app?.server.listening) await app.close();
  else app?.store.close();
  if (dir) rmSync(dir, {recursive: true, force: true});
}

async function login(base, email, password) {
  const res = await fetch(base + '/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password}),
  });
  assert.equal(res.status, 200, await res.text());
  return cookiePair(res);
}

async function adminHeaders(base, sessionCookie) {
  const res = await fetch(base + '/api/admin/login', {
    method: 'POST',
    headers: jsonHeaders(sessionCookie),
    body: JSON.stringify({key: ADMIN_KEY}),
  });
  assert.equal(res.status, 200, await res.text());
  return `${sessionCookie}; ${cookiePair(res)}`;
}

function seedUser(app, extra = {}) {
  return app.store.createUser({
    email: USER_EMAIL, status: 'active', role: 'user', displayName: 'Ana',
    passwordHash: hashPassword(USER_PASSWORD), ...extra,
  });
}

function tokenFromLink(link) {
  return decodeURIComponent(String(link).split('t=')[1] || '');
}

function spawnCli(args, {dir, input = '', origin = ORIGIN} = {}) {
  return spawnSync(process.execPath, [RESET_PASSWORD, ...args], {
    encoding: 'utf8',
    input,
    env: {...process.env, DATA_DIR: dir, APP_ORIGIN: origin},
  });
}

test('P0A-29/30/31 admin reset-access gate, self and suspended', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const userId = seedUser(app);
    const ownerCookie = await login(started.base, OWNER_EMAIL, OWNER_PASSWORD);
    const userCookie = await login(started.base, USER_EMAIL, USER_PASSWORD);
    const unauth = await jsonReq(started.base + `/api/admin/users/${userId}/reset-access`, {
      method: 'POST', headers: jsonHeaders(ownerCookie), body: {},
    });
    assert.equal(unauth.status, 401);
    const adminCookie = await adminHeaders(started.base, ownerCookie);
    const ownerId = app.store.ownerUserId();
    const self = await jsonReq(started.base + `/api/admin/users/${ownerId}/reset-access`, {
      method: 'POST', headers: jsonHeaders(adminCookie), body: {},
    });
    assert.equal(self.status, 409);
    assert.equal(self.data.code, 'reset_self');
    assert.equal(self.data.error, ADMIN_RESET_SELF);
    app.store.db.prepare('UPDATE users SET status=? WHERE id=?').run('suspended', userId);
    const susp = await jsonReq(started.base + `/api/admin/users/${userId}/reset-access`, {
      method: 'POST', headers: jsonHeaders(adminCookie), body: {},
    });
    assert.equal(susp.status, 409);
    assert.equal(susp.data.code, 'reset_target_suspended');
    assert.equal(susp.data.error, ADMIN_RESET_SUSPENDED);
    assert.equal(userCookie.includes(SESSION_COOKIE), true);
  } finally {
    await closeApp(app, dir);
  }
});

test('P0A-33/35/36 admin link is hashed, single-use, audits without token', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const userId = seedUser(app);
    const otherCookie = await login(started.base, USER_EMAIL, USER_PASSWORD);
    const ownerCookie = await login(started.base, OWNER_EMAIL, OWNER_PASSWORD);
    const adminCookie = await adminHeaders(started.base, ownerCookie);
    const t0 = Date.now();
    const reset = await jsonReq(started.base + `/api/admin/users/${userId}/reset-access`, {
      method: 'POST', headers: jsonHeaders(adminCookie), body: {},
    });
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.match(reset.data.link, LINK_RE);
    const exp = Date.parse(reset.data.expiresAt);
    assert.ok(Math.abs(exp - (t0 + RESET_TTL_MS)) < 5000);
    const token = tokenFromLink(reset.data.link);
    const hashed = hashToken(token);
    const row = app.store.db.prepare('SELECT token_hash, source FROM password_resets WHERE user_id=?').get(userId);
    assert.equal(row.token_hash, hashed);
    assert.equal(row.source, 'admin');
    const tables = app.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const {name} of tables) {
      const dump = JSON.stringify(app.store.db.prepare(`SELECT * FROM ${name}`).all());
      assert.equal(dump.includes(token), false, name);
    }
    assert.equal((await jsonReq(started.base + '/api/state', {headers: jsonHeaders(otherCookie)})).status, 401);
    const oldLogin = await jsonReq(started.base + '/api/login', {
      method: 'POST', headers: jsonHeaders(), body: {email: USER_EMAIL, password: USER_PASSWORD},
    });
    assert.equal(oldLogin.status, 401);
    const firstCheck = await jsonReq(started.base + '/api/auth/reset/check', {
      method: 'POST', headers: jsonHeaders(), body: {token},
    });
    assert.equal(firstCheck.status, 200);
    const second = await jsonReq(started.base + `/api/admin/users/${userId}/reset-access`, {
      method: 'POST', headers: jsonHeaders(adminCookie), body: {},
    });
    assert.equal(second.status, 200);
    const stale = await jsonReq(started.base + '/api/auth/reset/check', {
      method: 'POST', headers: jsonHeaders(), body: {token},
    });
    assert.equal(stale.status, 400);
    assert.equal(stale.data.code, 'reset_invalid');
    const audits = app.store.listAuditLog({action: 'auth.reset_link_created'});
    assert.ok(audits.length >= 1);
    assert.equal(audits[0].actorUserId, app.store.ownerUserId());
    assert.equal(audits[0].target, userId);
    assert.ok(audits[0].meta.expiresAt);
    assert.equal(JSON.stringify(audits).includes(token), false);
  } finally {
    await closeApp(app, dir);
  }
});

test('P0A-37 admin reset rate limit 11th in an hour', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const ids = [];
    for (let i = 0; i < ADMIN_RESET_MAX + 1; i++) {
      ids.push(app.store.createUser({
        email: `u${i}@example.test`, role: 'user', passwordHash: hashPassword(USER_PASSWORD),
      }));
    }
    const ownerCookie = await login(started.base, OWNER_EMAIL, OWNER_PASSWORD);
    const adminCookie = await adminHeaders(started.base, ownerCookie);
    for (let i = 0; i < ADMIN_RESET_MAX; i++) {
      const res = await jsonReq(started.base + `/api/admin/users/${ids[i]}/reset-access`, {
        method: 'POST', headers: jsonHeaders(adminCookie), body: {},
      });
      assert.equal(res.status, 200, `link ${i}`);
    }
    const limited = await jsonReq(started.base + `/api/admin/users/${ids[ADMIN_RESET_MAX]}/reset-access`, {
      method: 'POST', headers: jsonHeaders(adminCookie), body: {},
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.data.code, 'reset_admin_rate_limited');
    assert.equal(limited.data.error, ADMIN_RESET_RATE);
  } finally {
    await closeApp(app, dir);
  }
});

test('P0A-39/40/42 consume reset, race, invalid next does not consume', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const userId = seedUser(app);
    const cookieA = await login(started.base, USER_EMAIL, USER_PASSWORD);
    const ownerCookie = await login(started.base, OWNER_EMAIL, OWNER_PASSWORD);
    const adminCookie = await adminHeaders(started.base, ownerCookie);
    const minted = await jsonReq(started.base + `/api/admin/users/${userId}/reset-access`, {
      method: 'POST', headers: jsonHeaders(adminCookie), body: {},
    });
    const token = tokenFromLink(minted.data.link);
    const short = await jsonReq(started.base + '/api/auth/reset', {
      method: 'POST', headers: jsonHeaders(), body: {token, next: 'eleven-char'},
    });
    assert.equal(short.status, 400);
    assert.equal(short.data.code, 'password_too_short');
    assert.equal(short.data.error, PW_ERR_SHORT);
    const ok = await jsonReq(started.base + '/api/auth/reset', {
      method: 'POST', headers: jsonHeaders(), body: {token, next: NEW_PASSWORD},
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const nextCookie = cookiePair({headers: ok.headers});
    assert.equal((await jsonReq(started.base + '/api/state', {headers: jsonHeaders(cookieA)})).status, 401);
    assert.equal((await jsonReq(started.base + '/api/me', {headers: jsonHeaders(nextCookie)})).status, 200);
    const reused = await jsonReq(started.base + '/api/auth/reset', {
      method: 'POST', headers: jsonHeaders(), body: {token, next: 'otra-clave-12x'},
    });
    assert.equal(reused.status, 400);
    assert.equal(reused.data.code, 'reset_invalid');
    assert.equal(reused.data.error, RESET_INVALID_TITLE);
    const audits = app.store.listAuditLog({action: 'auth.password_reset'});
    assert.equal(audits[0].meta.source, 'admin');
    const loginOk = await jsonReq(started.base + '/api/login', {
      method: 'POST', headers: jsonHeaders(), body: {email: USER_EMAIL, password: NEW_PASSWORD},
    });
    assert.equal(loginOk.status, 200);

    const minted2 = await jsonReq(started.base + `/api/admin/users/${userId}/reset-access`, {
      method: 'POST', headers: jsonHeaders(adminCookie), body: {},
    });
    const token2 = tokenFromLink(minted2.data.link);
    const [a, b] = await Promise.all([
      jsonReq(started.base + '/api/auth/reset', {
        method: 'POST', headers: jsonHeaders(), body: {token: token2, next: 'race-winner-12'},
      }),
      jsonReq(started.base + '/api/auth/reset', {
        method: 'POST', headers: jsonHeaders(), body: {token: token2, next: 'race-winner-12'},
      }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 400]);
  } finally {
    await closeApp(app, dir);
  }
});

test('P0A-41 expired and malformed tokens are reset_invalid', async () => {
  const dir = tmp();
  let nowMs = Date.now();
  let app;
  try {
    const started = await startApp(dir, {now: () => nowMs});
    app = started.app;
    const userId = seedUser(app);
    const ownerCookie = await login(started.base, OWNER_EMAIL, OWNER_PASSWORD);
    const adminCookie = await adminHeaders(started.base, ownerCookie);
    const minted = await jsonReq(started.base + `/api/admin/users/${userId}/reset-access`, {
      method: 'POST', headers: jsonHeaders(adminCookie), body: {},
    });
    const token = tokenFromLink(minted.data.link);
    nowMs += RESET_TTL_MS + 1000;
    const expired = await jsonReq(started.base + '/api/auth/reset/check', {
      method: 'POST', headers: jsonHeaders(), body: {token},
    });
    assert.equal(expired.status, 400);
    assert.equal(expired.data.code, 'reset_invalid');
    const bad = await jsonReq(started.base + '/api/auth/reset/check', {
      method: 'POST', headers: jsonHeaders(), body: {token: 'not-a-token'},
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.code, 'reset_invalid');
  } finally {
    await closeApp(app, dir);
  }
});

test('P0A-44/45 reset rate limit and sec-fetch-site guard', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const userId = seedUser(app);
    const ownerCookie = await login(started.base, OWNER_EMAIL, OWNER_PASSWORD);
    const adminCookie = await adminHeaders(started.base, ownerCookie);
    const minted = await jsonReq(started.base + `/api/admin/users/${userId}/reset-access`, {
      method: 'POST', headers: jsonHeaders(adminCookie), body: {},
    });
    const token = tokenFromLink(minted.data.link);
    for (let i = 0; i < RESET_CHECK_MAX; i++) {
      const res = await jsonReq(started.base + '/api/auth/reset/check', {
        method: 'POST', headers: jsonHeaders(), body: {token: 'x'.repeat(43)},
      });
      assert.equal(res.status, 400, `check ${i}`);
    }
    const limited = await jsonReq(started.base + '/api/auth/reset/check', {
      method: 'POST', headers: jsonHeaders(), body: {token},
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.data.code, 'reset_rate_limited');
    assert.equal(limited.data.error, RESET_RATE);
    const cross = await fetch(started.base + '/api/auth/reset', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'sec-fetch-site': 'cross-site'},
      body: JSON.stringify({token, next: NEW_PASSWORD}),
    });
    assert.equal(cross.status, 403);
  } finally {
    await closeApp(app, dir);
  }
});

test('P0A-46/47 reset-password CLI password and --link', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
    const userId = store.createUser({
      email: USER_EMAIL, role: 'user', passwordHash: hashPassword(USER_PASSWORD),
    });
    const auth = createAuth(store);
    auth.createSession(auth.userById(userId), {ip: '127.0.0.1'});
    store.close();
    store = null;
    const missing = spawnCli(['--email', 'nadie@example.test', '--stdin'], {dir, input: `${NEW_PASSWORD}\n`});
    assert.equal(missing.status, 2);
    const short = spawnCli(['--email', USER_EMAIL, '--stdin'], {dir, input: 'shortshort1\n'});
    assert.equal(short.status, 3);
    const ok = spawnCli(['--email', 'Ana@example.test', '--stdin'], {dir, input: `${NEW_PASSWORD}\n`});
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(ok.stdout.includes(NEW_PASSWORD), false);
    assert.equal(ok.stdout.includes('scrypt$'), false);
    assert.equal(ok.stderr.includes(NEW_PASSWORD), false);
    store = createStore(dir);
    const row = store.db.prepare('SELECT password_hash FROM users WHERE email=?').get(USER_EMAIL);
    assert.equal(verifyPassword(NEW_PASSWORD, row.password_hash), true);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(userId).n, 0);
    const audits = store.listAuditLog({action: 'auth.reset_cli'});
    assert.equal(audits[0].meta.mode, 'password');
    store.close();
    store = null;
    const linked = spawnCli(['--email', OWNER_EMAIL, '--link'], {dir});
    assert.equal(linked.status, 0, linked.stderr);
    assert.match(linked.stdout.split('\n')[0], LINK_RE);
    assert.match(linked.stdout, /Vence:/);
    store = createStore(dir);
    const cliRow = store.db.prepare("SELECT source FROM password_resets WHERE source='cli'").get();
    assert.equal(cliRow.source, 'cli');
    const sha = createHash('sha256');
    assert.ok(sha);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
