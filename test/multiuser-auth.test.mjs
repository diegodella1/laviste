import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {createStore} from '../lib/store.mjs';
import {hashPassword, verifyPassword} from '../lib/password.mjs';
import {
  createAuth, hashToken, LOGIN_GENERIC_ERROR, LOGIN_LOCKOUT_ERROR,
  LOGIN_MAX_ATTEMPTS, SESSION_COOKIE, SESSION_TTL_MS,
} from '../lib/auth.mjs';
import {DEFAULT_OWNER_EMAIL, normalizeEmail} from '../lib/migrations/multiuser.mjs';

const OWNER_EMAIL = 'Diego@diegodella.ar';
const OWNER_EMAIL_NORM = normalizeEmail(OWNER_EMAIL);
const PASSWORD = 'test-password-only';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'mu-auth-'));
}

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

function cookieHeader(res) {
  return res.headers.get('set-cookie') || '';
}

function cookiePair(res) {
  return cookieHeader(res).split(';')[0];
}

function tokenFromCookie(setCookie) {
  const pair = setCookie.split(';')[0];
  return pair.slice(pair.indexOf('=') + 1);
}

async function startApp(dir, options = {}) {
  const app = createApp({
    dataDir: dir,
    password: PASSWORD,
    ownerEmail: OWNER_EMAIL,
    apiKey: '',
    port: 0,
    host: '127.0.0.1',
    secure: false,
    origin: '',
    quotesLive: false,
    ...options,
  });
  const base = await listen(app);
  return {app, base};
}

test('GET /api/session is 200 {authenticated:false} before login; protected routes stay 401', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const session = await fetch(started.base + '/api/session');
    assert.equal(session.status, 200);
    const body = await session.json();
    assert.equal(body.authenticated, false);
    assert.equal(body.required, true);
    assert.equal(body.user, undefined);
    assert.equal(body.role, undefined);
    assert.equal((await fetch(started.base + '/api/state')).status, 401);
    assert.equal((await fetch(started.base + '/api/takes')).status, 401);
    assert.equal((await fetch(started.base + '/api/export')).status, 401);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('owner logs in with mixed-case email and current password; session carries superadmin', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir, {secure: true});
    app = started.app;
    const login = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: OWNER_EMAIL, password: PASSWORD}),
    });
    assert.equal(login.status, 200);
    const setCookie = cookieHeader(login);
    assert.ok(setCookie.includes('HttpOnly'));
    assert.ok(setCookie.includes('SameSite=Strict'));
    assert.ok(setCookie.includes('Secure'));
    assert.ok(setCookie.includes('Path=/'));
    assert.ok(setCookie.includes('Max-Age=43200'));
    const payload = await login.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.role, 'superadmin');
    assert.equal(payload.user.email, OWNER_EMAIL_NORM);
    assert.equal(payload.user.role, 'superadmin');
    assert.equal(payload.user.password, undefined);
    assert.equal(payload.user.password_hash, undefined);

    const token = tokenFromCookie(setCookie);
    const hash = hashToken(token);
    const row = app.store.db.prepare('SELECT token_hash, user_id FROM sessions').get();
    assert.equal(row.token_hash, hash);
    assert.equal(row.token_hash === token, false);
    assert.equal(app.store.db.prepare('SELECT 1 FROM sessions WHERE token_hash=?').get(token), undefined);

    const session = await (await fetch(started.base + '/api/session', {headers: {Cookie: cookiePair(login)}})).json();
    assert.equal(session.authenticated, true);
    assert.equal(session.role, 'superadmin');
    assert.equal(session.user.email, OWNER_EMAIL_NORM);
    assert.equal(session.user.displayName, 'Diego');
    const state = await fetch(started.base + '/api/state', {headers: {Cookie: cookiePair(login)}});
    assert.equal(state.status, 200);
    const stateBody = await state.json();
    assert.equal(stateBody.config.password, undefined);
    assert.equal(stateBody.config.apiKey, undefined);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('wrong password and unknown email return the same generic 401', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const wrong = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: OWNER_EMAIL, password: 'definitely-wrong-12'}),
    });
    assert.equal(wrong.status, 401);
    assert.deepEqual(await wrong.json(), {error: LOGIN_GENERIC_ERROR});
    const unknown = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: 'nadie@example.test', password: PASSWORD}),
    });
    assert.equal(unknown.status, 401);
    assert.deepEqual(await unknown.json(), {error: LOGIN_GENERIC_ERROR});
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('password-only login is rejected after 1D with the generic error', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const login = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({password: PASSWORD}),
    });
    assert.equal(login.status, 401);
    assert.deepEqual(await login.json(), {error: LOGIN_GENERIC_ERROR});
    const empty = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: '', password: PASSWORD}),
    });
    assert.equal(empty.status, 401);
    assert.deepEqual(await empty.json(), {error: LOGIN_GENERIC_ERROR});
    const ok = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: OWNER_EMAIL, password: PASSWORD}),
    });
    assert.equal(ok.status, 200);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('logout revokes the hashed session and clears the cookie', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const login = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: OWNER_EMAIL_NORM, password: PASSWORD}),
    });
    const cookie = cookiePair(login);
    const headers = {Cookie: cookie, 'Content-Type': 'application/json'};
    const out = await fetch(started.base + '/api/logout', {method: 'POST', headers, body: '{}'});
    assert.equal(out.status, 200);
    const cleared = cookieHeader(out);
    assert.ok(cleared.includes(`${SESSION_COOKIE}=`));
    assert.ok(cleared.includes('Max-Age=0'));
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
    assert.equal((await fetch(started.base + '/api/state', {headers: {Cookie: cookie}})).status, 401);
    const session = await (await fetch(started.base + '/api/session', {headers: {Cookie: cookie}})).json();
    assert.equal(session.authenticated, false);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('session survives process restart and expires when expires_at is past', async () => {
  const dir = tmp();
  let first;
  let second;
  try {
    first = await startApp(dir);
    const login = await fetch(first.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: OWNER_EMAIL, password: PASSWORD}),
    });
    const cookie = cookiePair(login);
    await first.app.close();
    first = null;

    second = await startApp(dir);
    const session = await (await fetch(second.base + '/api/session', {headers: {Cookie: cookie}})).json();
    assert.equal(session.authenticated, true);
    assert.equal(session.user.email, OWNER_EMAIL_NORM);
    assert.equal((await fetch(second.base + '/api/state', {headers: {Cookie: cookie}})).status, 200);

    second.app.store.db.prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z'").run();
    assert.equal((await fetch(second.base + '/api/state', {headers: {Cookie: cookie}})).status, 401);
    const expired = await (await fetch(second.base + '/api/session', {headers: {Cookie: cookie}})).json();
    assert.equal(expired.authenticated, false);
    assert.equal(second.app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  } finally {
    if (first?.app?.server.listening) await first.app.close();
    if (second?.app?.server.listening) await second.app.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('login rate limit is per email+IP and does not lock another account', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const otherId = app.store.createUser({
      email: 'b@example.test',
      displayName: 'Bee',
      role: 'user',
      passwordHash: hashPassword('other-password-12'),
    });
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      const res = await fetch(started.base + '/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email: OWNER_EMAIL, password: 'wrong-password-12'}),
      });
      assert.equal(res.status, 401);
    }
    const locked = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: OWNER_EMAIL, password: PASSWORD}),
    });
    assert.equal(locked.status, 429);
    assert.deepEqual(await locked.json(), {error: LOGIN_LOCKOUT_ERROR});

    const other = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: 'B@example.test', password: 'other-password-12'}),
    });
    assert.equal(other.status, 200);
    const body = await other.json();
    assert.equal(body.role, 'user');
    assert.equal(body.user.id, otherId);
    assert.equal(body.user.email, 'b@example.test');
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('empty APP_PASSWORD keeps localhost open and does not treat empty hash as a match', async () => {
  const dir = tmp();
  let app;
  try {
    app = createApp({
      dataDir: dir,
      password: '',
      ownerEmail: OWNER_EMAIL,
      apiKey: '',
      port: 0,
      host: '127.0.0.1',
      origin: '',
      quotesLive: false,
    });
    const base = await listen(app);
    const owner = app.store.db.prepare('SELECT password_hash FROM users WHERE id=?').get(app.store.ownerUserId());
    assert.equal(owner.password_hash, '');
    assert.equal(verifyPassword('', ''), false);
    const session = await (await fetch(base + '/api/session')).json();
    assert.equal(session.authenticated, true);
    assert.equal(session.required, false);
    assert.equal(session.role, 'superadmin');
    const denied = await fetch(base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: OWNER_EMAIL, password: 'anything-at-all-12'}),
    });
    assert.equal(denied.status, 401);
    assert.equal((await fetch(base + '/api/state')).status, 200);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('bootstrap fills an empty owner hash from APP_PASSWORD without rotating an existing one', async () => {
  const dir = tmp();
  let store;
  let app;
  try {
    store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: ''});
    const before = store.db.prepare('SELECT password_hash FROM users WHERE id=?').get(store.ownerUserId());
    assert.equal(before.password_hash, '');
    store.close();
    store = null;

    const started = await startApp(dir);
    app = started.app;
    const after = app.store.db.prepare('SELECT password_hash FROM users WHERE id=?').get(app.store.ownerUserId());
    assert.equal(verifyPassword(PASSWORD, after.password_hash), true);
    const login = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: OWNER_EMAIL, password: PASSWORD}),
    });
    assert.equal(login.status, 200);

    const existing = after.password_hash;
    app.auth.bootstrapOwnerPassword('some-other-password-12');
    const still = app.store.db.prepare('SELECT password_hash FROM users WHERE id=?').get(app.store.ownerUserId());
    assert.equal(still.password_hash, existing);
  } finally {
    store?.close();
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('suspended user cannot login and an existing session stops working', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const userId = app.store.createUser({
      email: 'paused@example.test',
      role: 'user',
      passwordHash: hashPassword('paused-password-12'),
    });
    const login = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: 'paused@example.test', password: 'paused-password-12'}),
    });
    assert.equal(login.status, 200);
    const cookie = cookiePair(login);
    app.store.db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(userId);
    assert.equal((await fetch(started.base + '/api/state', {headers: {Cookie: cookie}})).status, 401);
    const again = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: 'paused@example.test', password: 'paused-password-12'}),
    });
    assert.equal(again.status, 401);
    assert.deepEqual(await again.json(), {error: LOGIN_GENERIC_ERROR});
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('createAuth stores hashed tokens and slides expiry near the halfway mark', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: PASSWORD});
    let now = Date.parse('2026-10-19T12:00:00.000Z');
    const auth = createAuth(store, {now: () => now});
    const result = auth.login({email: OWNER_EMAIL, password: PASSWORD, ip: '127.0.0.1'});
    const row = store.db.prepare('SELECT token_hash, expires_at FROM sessions').get();
    assert.equal(row.token_hash, hashToken(result.token));
    assert.equal(row.token_hash.length, 64);
    const firstExpiry = Date.parse(row.expires_at);
    assert.equal(firstExpiry, now + SESSION_TTL_MS);

    now += SESSION_TTL_MS / 2 - 1000;
    auth.sessionFromToken(result.token);
    const mid = Date.parse(store.db.prepare('SELECT expires_at FROM sessions').get().expires_at);
    assert.equal(mid, firstExpiry);

    now += 2000;
    const slid = auth.sessionFromToken(result.token);
    assert.equal(Date.parse(slid.expiresAt), now + SESSION_TTL_MS);
    assert.equal(createHash('sha256').update(result.token).digest('hex'), row.token_hash);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('owner default email stays diego@diegodella.ar', () => {
  assert.equal(DEFAULT_OWNER_EMAIL, 'diego@diegodella.ar');
  assert.equal(OWNER_EMAIL_NORM, 'diego@diegodella.ar');
});
