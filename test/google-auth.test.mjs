import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac, createSign, generateKeyPairSync} from 'node:crypto';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server.mjs';
import {createStore} from '../lib/store.mjs';
import {hashPassword} from '../lib/password.mjs';
import {SESSION_COOKIE, SESSION_MAX_PER_USER, hashToken} from '../lib/auth.mjs';
import {
  GOOGLE_AUTH_CALLBACK, GOOGLE_AUTH_START, GOOGLE_AUTH_URL, GOOGLE_ERROR_PATH,
  GOOGLE_JWKS_URL, GOOGLE_OAUTH_COOKIE, GOOGLE_REJECT, GOOGLE_TOKEN_URL,
  b64url, createJwksCache, emailDomain, pkceChallenge, readGoogleSecrets,
  verifyGoogleIdToken,
} from '../lib/google-auth.mjs';
import {
  DEFAULT_OWNER_EMAIL, SCHEMA_USER_VERSION, USER_SCOPED_TABLES,
  applyMultiuserMigrations, inspectMigration, opsChecksum,
} from '../lib/migrations/multiuser.mjs';

const OWNER_EMAIL = 'Diego@diegodella.ar';
const PASSWORD = 'test-password-only';
const CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'test-google-client-secret-not-real';
const USER_EMAIL = 'ana@example.test';
const USER_PASSWORD = 'user-ana-password-12';
const KID = 'test-kid';

const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = publicKey.export({format: 'jwk'});
jwk.kid = KID;
jwk.alg = 'RS256';
jwk.use = 'sig';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'gl1-'));
}

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

function signJwt(payload, {alg = 'RS256', kid = KID, key = privateKey} = {}) {
  const header = b64url(JSON.stringify({alg, kid, typ: 'JWT'}));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  if (alg === 'none') return `${data}.`;
  if (alg === 'HS256') {
    return `${data}.${createHmac('sha256', 'not-rsa').update(data).digest('base64url')}`;
  }
  const sig = createSign('RSA-SHA256').update(data).end().sign(key);
  return `${data}.${sig.toString('base64url')}`;
}

function claims({nonce, sub = 'google-sub-ana', email = USER_EMAIL, extra = {}} = {}) {
  const t = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    azp: CLIENT_ID,
    exp: t + 3600,
    iat: t - 5,
    nonce,
    sub,
    email,
    email_verified: true,
    ...extra,
  };
}

function makeFetcher(opts = {}) {
  const captured = {tokenBody: null, jwksHits: 0, tokenHits: 0};
  const fetcher = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith(GOOGLE_TOKEN_URL)) {
      captured.tokenHits += 1;
      captured.tokenBody = String(init.body || '');
      if (opts.tokenDelay) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, opts.tokenDelay);
          init.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(Object.assign(new Error('aborted'), {name: 'AbortError'}));
          });
        });
      }
      if (opts.tokenError) {
        return {ok: false, status: 400, json: async () => ({error: 'invalid_grant'}), headers: {get: () => null}};
      }
      const idToken = typeof opts.idToken === 'function' ? opts.idToken(captured) : opts.idToken;
      return {
        ok: true,
        status: 200,
        json: async () => ({id_token: idToken, access_token: 'discard-me', token_type: 'Bearer'}),
        headers: {get: () => null},
      };
    }
    if (href.startsWith(GOOGLE_JWKS_URL)) {
      captured.jwksHits += 1;
      const keys = typeof opts.jwksKeys === 'function' ? opts.jwksKeys(captured) : (opts.jwksKeys || [jwk]);
      return {
        ok: true,
        status: 200,
        json: async () => ({keys}),
        headers: {get: name => String(name).toLowerCase() === 'cache-control' ? 'max-age=3600' : null},
      };
    }
    throw new Error('unexpected network ' + href);
  };
  return {fetcher, captured};
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
    googleClientId: CLIENT_ID,
    googleClientSecret: CLIENT_SECRET,
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

function seedUser(app, {email = USER_EMAIL, status = 'active', role = 'user', googleSub = null} = {}) {
  const id = app.store.createUser({
    email, status, role, displayName: 'Ana', passwordHash: hashPassword(USER_PASSWORD),
  });
  if (googleSub) {
    app.store.db.prepare('UPDATE users SET google_sub=? WHERE id=?').run(googleSub, id);
  }
  return id;
}

async function startGoogle(base) {
  const res = await fetch(base + GOOGLE_AUTH_START, {redirect: 'manual'});
  const location = res.headers.get('location') || '';
  const loc = location.startsWith('http') ? new URL(location) : null;
  const oauth = (res.headers.getSetCookie?.() || []).find(c => c.startsWith(`${GOOGLE_OAUTH_COOKIE}=`)) || '';
  return {
    res,
    loc,
    state: loc?.searchParams.get('state') || '',
    nonce: loc?.searchParams.get('nonce') || '',
    challenge: loc?.searchParams.get('code_challenge') || '',
    method: loc?.searchParams.get('code_challenge_method') || '',
    oauthPair: oauth.split(';')[0],
    oauthHeader: oauth,
  };
}

const CROSS_SITE_GOOGLE = {
  'Sec-Fetch-Site': 'cross-site',
  Origin: 'https://accounts.google.com',
  Referer: 'https://accounts.google.com/',
};

async function callback(base, {state, code = 'ok-code', cookie, headers} = {}) {
  const url = `${base}${GOOGLE_AUTH_CALLBACK}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
  const reqHeaders = {...headers};
  if (cookie) reqHeaders.Cookie = cookie;
  return fetch(url, {redirect: 'manual', headers: reqHeaders});
}

function sessionPair(res) {
  return (res.headers.getSetCookie?.() || []).find(c => c.startsWith(`${SESSION_COOKIE}=`)) || '';
}

function audit(app, action) {
  return app.store.listAuditLog({action, limit: 50});
}

async function withEnv(vars, fn) {
  const prev = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    if (vars[key] == null) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try { return await fn(); }
  finally {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test('readGoogleSecrets disables Google when files are missing', () => {
  const secrets = readGoogleSecrets({
    clientIdFile: '/no/such/google_client_id',
    clientSecretFile: '/no/such/google_client_secret',
  });
  assert.equal(secrets.enabled, false);
  assert.equal(secrets.clientId, '');
  assert.equal(secrets.clientSecret, '');
});

test('v16 migration is idempotent, unique on google_sub, and keeps counts', () => {
  const dir = tmp();
  const path = join(dir, 'tesis.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS takes(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS usage(day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY, take_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(take_id, version));
    CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, take_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, take_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS consumption(day TEXT NOT NULL, kind TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, searches INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, kind));
    CREATE TABLE IF NOT EXISTS idempotency(key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS quote_cache(ticker TEXT PRIMARY KEY, price REAL NOT NULL, as_of TEXT NOT NULL, provider TEXT NOT NULL, stale INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS benchmark_cache(id TEXT PRIMARY KEY, price REAL NOT NULL, as_of TEXT NOT NULL, stale INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS agent_prompt_versions(
      id TEXT PRIMARY KEY, version INTEGER NOT NULL UNIQUE, body TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      who TEXT NOT NULL DEFAULT 'admin', source TEXT NOT NULL, created_at TEXT NOT NULL, char_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ops(
      id TEXT PRIMARY KEY, take_id TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL, ticker TEXT, units INTEGER,
      amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'ARS', price REAL, quote_as_of TEXT, quote_provider TEXT,
      quote_class TEXT NOT NULL, quote_eligible INTEGER NOT NULL, quote_stale INTEGER NOT NULL DEFAULT 0,
      parent_id TEXT, batch_id TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '', meta TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders(
      id TEXT PRIMARY KEY, take_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, take_version INTEGER NOT NULL,
      payload TEXT NOT NULL, preview TEXT NOT NULL, fingerprint TEXT NOT NULL, idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL, confirmed_at TEXT, cancelled_at TEXT
    );
    CREATE TABLE IF NOT EXISTS news_feeds(
      id TEXT PRIMARY KEY, label TEXT NOT NULL, url TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_ok_at TEXT, last_error TEXT, last_probe_at TEXT,
      etag TEXT, last_modified TEXT
    );
    PRAGMA user_version=8;
  `);
  db.exec('BEGIN IMMEDIATE');
  applyMultiuserMigrations(db, {
    version: 8, stopAt: 15, ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: PASSWORD,
  });
  db.exec('COMMIT');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 15);
  assert.equal(db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'google_sub'), false);
  const before = {
    checksum: opsChecksum(db),
    counts: Object.fromEntries(USER_SCOPED_TABLES.map(table => {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      return [table, n];
    })),
  };
  db.close();
  let first, second;
  try {
    first = createStore(dir);
    assert.equal(first.userVersion(), 16);
    const report = inspectMigration(first.db);
    assert.equal(report.ok, true, report.errors.join('; '));
    assert.equal(report.opsChecksum, before.checksum);
    assert.deepEqual(report.counts, before.counts);
    const a = first.createUser({email: 'a@example.test'});
    const b = first.createUser({email: 'b@example.test'});
    first.db.prepare('UPDATE users SET google_sub=? WHERE id=?').run('same-sub', a);
    assert.throws(
      () => first.db.prepare('UPDATE users SET google_sub=? WHERE id=?').run('same-sub', b),
      /UNIQUE/,
    );
    first.close();
    first = null;
    second = createStore(dir);
    assert.equal(second.userVersion(), SCHEMA_USER_VERSION);
    const again = inspectMigration(second.db);
    assert.equal(again.ok, true, again.errors.join('; '));
    assert.deepEqual(again.counts, before.counts);
    const check = spawnSync(process.execPath, [resolve('scripts/migrate-check.mjs'), path], {encoding: 'utf8'});
    assert.equal(check.status, 0, check.stderr);
    assert.equal(JSON.parse(check.stdout).userVersion, 16);
    assert.equal(check.stdout.includes(CLIENT_SECRET), false);
  } finally {
    first?.close();
    second?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('disabled without secret files: 404, session.google.enabled=false, server boots', async () => {
  const dir = tmp();
  let app;
  await withEnv({GOOGLE_CLIENT_ID_FILE: '/no/such/id', GOOGLE_CLIENT_SECRET_FILE: '/no/such/secret'}, async () => {
    try {
      const started = await startApp(dir, {googleClientId: '', googleClientSecret: ''});
      app = started.app;
      assert.equal(app.google.enabled, false);
      assert.equal((await fetch(started.base + GOOGLE_AUTH_START, {redirect: 'manual'})).status, 404);
      assert.equal((await fetch(started.base + GOOGLE_AUTH_CALLBACK, {redirect: 'manual'})).status, 404);
      const session = await (await fetch(started.base + '/api/session')).json();
      assert.equal(session.google.enabled, false);
      const login = await fetch(started.base + '/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email: OWNER_EMAIL, password: PASSWORD}),
      });
      assert.equal(login.status, 200);
    } finally {
      await closeApp(app, dir);
    }
  });
});

test('happy path links mixed-case email, then later login matches google_sub', async () => {
  const dir = tmp();
  let nonce = '';
  const {fetcher, captured} = makeFetcher({
    idToken: () => signJwt(claims({nonce, email: 'ANA@example.test'})),
  });
  let app;
  try {
    const started = await startApp(dir, {googleFetcher: fetcher});
    app = started.app;
    const userId = seedUser(app);
    const go = await startGoogle(started.base);
    assert.equal(go.res.status, 302);
    assert.equal(go.loc.origin + go.loc.pathname, GOOGLE_AUTH_URL);
    assert.equal(go.method, 'S256');
    assert.ok(go.oauthHeader.includes('HttpOnly'));
    assert.ok(go.oauthHeader.includes('SameSite=Lax'));
    assert.ok(go.oauthHeader.includes('Path=/api/auth/google'));
    nonce = go.nonce;
    const cb = await callback(started.base, {state: go.state, cookie: go.oauthPair});
    assert.equal(cb.status, 200);
    const html = await cb.text();
    assert.match(html, /http-equiv="refresh"/i);
    assert.match(html, /url=\/app/);
    const cookies = cb.headers.getSetCookie();
    const session = cookies.find(c => c.startsWith(`${SESSION_COOKIE}=`));
    assert.ok(session);
    assert.ok(session.includes('SameSite=Strict'));
    assert.ok(session.includes('HttpOnly'));
    assert.ok(session.includes('Path=/'));
    const cleared = cookies.find(c => c.startsWith(`${GOOGLE_OAUTH_COOKIE}=`));
    assert.ok(cleared.includes('Max-Age=0'));
    const row = app.store.db.prepare('SELECT google_sub, google_linked_at, email FROM users WHERE id=?').get(userId);
    assert.equal(row.google_sub, 'google-sub-ana');
    assert.ok(row.google_linked_at);
    assert.equal(row.email, USER_EMAIL);
    const sess = await (await fetch(started.base + '/api/session', {
      headers: {Cookie: session.split(';')[0]},
    })).json();
    assert.equal(sess.authenticated, true);
    assert.equal(sess.user.email, USER_EMAIL);
    assert.equal(sess.google.enabled, true);
    assert.equal(audit(app, 'auth.google.link').length, 1);
    assert.equal(audit(app, 'auth.google.link')[0].meta.emailDomain, emailDomain(USER_EMAIL));
    assert.equal(audit(app, 'auth.google.login').length, 1);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
  } finally {
    await closeApp(app, dir);
  }
});

test('second login resolves by google_sub', async () => {
  const dir = tmp();
  let nonce = '';
  const {fetcher} = makeFetcher({
    idToken: () => signJwt(claims({nonce, email: 'otra@example.test'})),
  });
  let app;
  try {
    const started = await startApp(dir, {googleFetcher: fetcher});
    app = started.app;
    seedUser(app, {googleSub: 'google-sub-ana'});
    const go = await startGoogle(started.base);
    nonce = go.nonce;
    const cb = await callback(started.base, {state: go.state, cookie: go.oauthPair});
    assert.equal(cb.status, 200);
    const sess = await (await fetch(started.base + '/api/session', {
      headers: {Cookie: sessionPair(cb).split(';')[0]},
    })).json();
    assert.equal(sess.authenticated, true);
    assert.equal(sess.user.email, USER_EMAIL);
    assert.equal(audit(app, 'auth.google.link').length, 0);
    assert.equal(audit(app, 'auth.google.login').length, 1);
  } finally {
    await closeApp(app, dir);
  }
});

test('PKCE verifier posted to the token endpoint matches the start challenge', async () => {
  const dir = tmp();
  let nonce = '';
  const {fetcher, captured} = makeFetcher({
    idToken: () => signJwt(claims({nonce})),
  });
  let app;
  try {
    const started = await startApp(dir, {googleFetcher: fetcher});
    app = started.app;
    seedUser(app);
    const go = await startGoogle(started.base);
    nonce = go.nonce;
    const cb = await callback(started.base, {state: go.state, cookie: go.oauthPair});
    assert.equal(cb.status, 200);
    const params = new URLSearchParams(captured.tokenBody);
    assert.equal(params.get('grant_type'), 'authorization_code');
    assert.equal(params.get('client_id'), CLIENT_ID);
    assert.equal(params.get('code_verifier')?.length >= 43, true);
    assert.equal(pkceChallenge(params.get('code_verifier')), go.challenge);
    assert.equal(captured.tokenBody.includes(CLIENT_SECRET), true);
  } finally {
    await closeApp(app, dir);
  }
});

test('callback is 200 + meta refresh + Strict session cookie and clears laviste_oauth', async () => {
  const dir = tmp();
  let nonce = '';
  const {fetcher} = makeFetcher({idToken: () => signJwt(claims({nonce}))});
  let app;
  try {
    const started = await startApp(dir, {googleFetcher: fetcher, secure: true});
    app = started.app;
    seedUser(app);
    const go = await startGoogle(started.base);
    nonce = go.nonce;
    assert.ok(go.oauthHeader.includes('Secure'));
    const cb = await callback(started.base, {state: go.state, cookie: go.oauthPair});
    assert.equal(cb.status, 200);
    assert.match(cb.headers.get('content-type'), /text\/html/);
    assert.notEqual(cb.status, 302);
    const session = sessionPair(cb);
    assert.ok(session.includes('SameSite=Strict'));
    assert.ok(session.includes('Secure'));
    const cleared = (cb.headers.getSetCookie() || []).find(c => c.startsWith(`${GOOGLE_OAUTH_COOKIE}=`));
    assert.ok(cleared.includes('Max-Age=0'));
    assert.ok(cleared.includes('Path=/api/auth/google'));
  } finally {
    await closeApp(app, dir);
  }
});

async function rejectCase(name, build) {
  test(name, async () => {
    const dir = tmp();
    let app;
    try {
      const ctx = await build(dir);
      app = ctx.app;
      assert.equal(ctx.res.status, 302);
      assert.equal(ctx.res.headers.get('location'), GOOGLE_ERROR_PATH);
      if (ctx.reason) {
        const rows = audit(app, 'auth.google.reject');
        assert.equal(rows.length >= 1, true);
        assert.equal(rows[0].actorUserId, null);
        assert.equal(rows[0].meta.reason, ctx.reason);
        assert.ok(rows[0].ipHash);
        const dumped = JSON.stringify(rows);
        assert.equal(dumped.includes('ANA@'), false);
        assert.equal(dumped.includes('id_token'), false);
        assert.equal(dumped.includes(CLIENT_SECRET), false);
      }
      const sessions = app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
      assert.equal(sessions, ctx.sessions ?? 0);
    } finally {
      await closeApp(app, dir);
    }
  });
}

await rejectCase('unknown email is rejected without creating a user', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({
    idToken: () => signJwt(claims({nonce, email: 'nadie@example.test', sub: 'unknown-sub'})),
  });
  const started = await startApp(dir, {googleFetcher: fetcher});
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  const res = await callback(started.base, {state: go.state, cookie: go.oauthPair});
  assert.equal(started.app.store.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  return {app: started.app, res, reason: GOOGLE_REJECT.no_user};
});

await rejectCase('email_verified=false is rejected', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({
    idToken: () => signJwt(claims({nonce, extra: {email_verified: false}})),
  });
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.email_unverified,
  };
});

await rejectCase('wrong aud is rejected', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({
    idToken: () => signJwt(claims({nonce, extra: {aud: 'other-client'}})),
  });
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.token_invalid,
  };
});

await rejectCase('wrong iss is rejected', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({
    idToken: () => signJwt(claims({nonce, extra: {iss: 'https://evil.example'}})),
  });
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.token_invalid,
  };
});

await rejectCase('wrong azp is rejected', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({
    idToken: () => signJwt(claims({nonce, extra: {azp: 'other-client'}})),
  });
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.token_invalid,
  };
});

await rejectCase('expired token is rejected', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({
    idToken: () => signJwt(claims({nonce, extra: {exp: Math.floor(Date.now() / 1000) - 120}})),
  });
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.token_invalid,
  };
});

await rejectCase('bad nonce is rejected', async dir => {
  const {fetcher} = makeFetcher({
    idToken: () => signJwt(claims({nonce: 'not-the-saved-nonce'})),
  });
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.token_invalid,
  };
});

await rejectCase('replayed state is rejected and only one session exists', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({idToken: () => signJwt(claims({nonce}))});
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  const first = await callback(started.base, {state: go.state, cookie: go.oauthPair});
  assert.equal(first.status, 200);
  const second = await callback(started.base, {state: go.state, cookie: go.oauthPair});
  assert.equal(started.app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
  return {app: started.app, res: second, reason: GOOGLE_REJECT.state_invalid, sessions: 1};
});

await rejectCase('missing laviste_oauth cookie is rejected', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({idToken: () => signJwt(claims({nonce}))});
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state}),
    reason: GOOGLE_REJECT.state_invalid,
  };
});

await rejectCase('wrong laviste_oauth cookie is rejected', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({idToken: () => signJwt(claims({nonce}))});
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: `${GOOGLE_OAUTH_COOKIE}=forged`}),
    reason: GOOGLE_REJECT.state_invalid,
  };
});

await rejectCase('expired state is rejected', async dir => {
  let nowMs = Date.now();
  let nonce = '';
  const {fetcher} = makeFetcher({idToken: () => signJwt(claims({nonce}))});
  const started = await startApp(dir, {googleFetcher: fetcher, now: () => nowMs});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  nowMs += 11 * 60 * 1000;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.state_invalid,
  };
});

await rejectCase('alg none and HS256 are rejected', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({
    idToken: () => signJwt(claims({nonce}), {alg: 'none'}),
  });
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  const none = await callback(started.base, {state: go.state, cookie: go.oauthPair});
  assert.equal(none.status, 302);
  const {fetcher: hs} = makeFetcher({
    idToken: () => signJwt(claims({nonce: 'x'}), {alg: 'HS256'}),
  });
  const started2Dir = tmp();
  const started2 = await startApp(started2Dir, {googleFetcher: hs});
  seedUser(started2.app);
  const go2 = await startGoogle(started2.base);
  const hsRes = await callback(started2.base, {state: go2.state, cookie: go2.oauthPair});
  await closeApp(started2.app, started2Dir);
  assert.equal(hsRes.status, 302);
  return {app: started.app, res: none, reason: GOOGLE_REJECT.token_invalid};
});

await rejectCase('unknown kid refetches once and then fails', async dir => {
  let nonce = '';
  const {fetcher, captured} = makeFetcher({
    idToken: () => signJwt(claims({nonce})),
    jwksKeys: () => [{...jwk, kid: 'other-kid'}],
  });
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  const res = await callback(started.base, {state: go.state, cookie: go.oauthPair});
  assert.equal(captured.jwksHits, 2);
  return {app: started.app, res, reason: GOOGLE_REJECT.token_invalid};
});

await rejectCase('invalid signature is rejected', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({
    idToken: () => {
      const jwt = signJwt(claims({nonce}));
      const parts = jwt.split('.');
      parts[2] = b64url(Buffer.from('not-a-signature'));
      return parts.join('.');
    },
  });
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.token_invalid,
  };
});

await rejectCase('suspended user is rejected', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({idToken: () => signJwt(claims({nonce}))});
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app, {status: 'suspended'});
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.suspended,
  };
});

await rejectCase('google_sub mismatch is rejected', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({idToken: () => signJwt(claims({nonce, sub: 'new-sub'}))});
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app, {googleSub: 'already-linked'});
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.sub_mismatch,
  };
});

await rejectCase('owner is rejected while GOOGLE_ALLOW_SUPERADMIN is off', async dir => {
  let nonce = '';
  const {fetcher} = makeFetcher({
    idToken: () => signJwt(claims({nonce, email: OWNER_EMAIL, sub: 'owner-sub'})),
  });
  const started = await startApp(dir, {googleFetcher: fetcher, googleAllowSuperadmin: false});
  const go = await startGoogle(started.base);
  nonce = go.nonce;
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.superadmin_blocked,
  };
});

await rejectCase('token endpoint error is a generic reject', async dir => {
  const {fetcher} = makeFetcher({tokenError: true, idToken: 'x'});
  const started = await startApp(dir, {googleFetcher: fetcher});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.token_invalid,
  };
});

await rejectCase('token endpoint timeout is a generic reject', async dir => {
  const {fetcher} = makeFetcher({tokenDelay: 80, idToken: 'x'});
  const started = await startApp(dir, {googleFetcher: fetcher, googleTokenTimeoutMs: 15});
  seedUser(started.app);
  const go = await startGoogle(started.base);
  return {
    app: started.app,
    res: await callback(started.base, {state: go.state, cookie: go.oauthPair}),
    reason: GOOGLE_REJECT.token_invalid,
  };
});

test('two callbacks racing the same state create one session', async () => {
  const dir = tmp();
  let nonce = '';
  const {fetcher} = makeFetcher({idToken: () => signJwt(claims({nonce}))});
  let app;
  try {
    const started = await startApp(dir, {googleFetcher: fetcher});
    app = started.app;
    seedUser(app);
    const go = await startGoogle(started.base);
    nonce = go.nonce;
    const [a, b] = await Promise.all([
      callback(started.base, {state: go.state, cookie: go.oauthPair}),
      callback(started.base, {state: go.state, cookie: go.oauthPair}),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 302]);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
  } finally {
    await closeApp(app, dir);
  }
});

test('Google session respects SESSION_MAX_PER_USER; password login still works', async () => {
  const dir = tmp();
  let nonce = '';
  const {fetcher} = makeFetcher({idToken: () => signJwt(claims({nonce}))});
  let app;
  try {
    const started = await startApp(dir, {googleFetcher: fetcher});
    app = started.app;
    const userId = seedUser(app);
    const user = app.store.db.prepare('SELECT id,email,role,status FROM users WHERE id=?').get(userId);
    for (let i = 0; i < SESSION_MAX_PER_USER; i += 1) {
      app.auth.createSession(user, {ip: '127.0.0.1', ua: 't'});
    }
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(userId).n, 10);
    const go = await startGoogle(started.base);
    nonce = go.nonce;
    const cb = await callback(started.base, {state: go.state, cookie: go.oauthPair});
    assert.equal(cb.status, 200);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(userId).n, SESSION_MAX_PER_USER);
    const login = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: USER_EMAIL, password: USER_PASSWORD}),
    });
    assert.equal(login.status, 200);
  } finally {
    await closeApp(app, dir);
  }
});

test('verifyGoogleIdToken accepts accounts.google.com iss and rejects iat in the future', async () => {
  const {fetcher} = makeFetcher({jwksKeys: [jwk]});
  const jwks = createJwksCache({fetcher});
  const t = Math.floor(Date.now() / 1000);
  const ok = await verifyGoogleIdToken(signJwt({
    iss: 'accounts.google.com', aud: CLIENT_ID, exp: t + 60, iat: t, nonce: 'n', sub: 's',
  }), {clientId: CLIENT_ID, nonce: 'n', jwks});
  assert.equal(ok.sub, 's');
  await assert.rejects(() => verifyGoogleIdToken(signJwt({
    iss: 'https://accounts.google.com', aud: CLIENT_ID, exp: t + 60, iat: t + 120, nonce: 'n', sub: 's',
  }), {clientId: CLIENT_ID, nonce: 'n', jwks}));
});

test('start is rate-limited per IP', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    let last;
    for (let i = 0; i < 11; i += 1) {
      last = await fetch(started.base + GOOGLE_AUTH_START, {redirect: 'manual'});
    }
    assert.equal(last.status, 429);
  } finally {
    await closeApp(app, dir);
  }
});

test('cross-site Google callback reaches OAuth validation and succeeds', async () => {
  const dir = tmp();
  let nonce = '';
  const {fetcher, captured} = makeFetcher({idToken: () => signJwt(claims({nonce}))});
  let app;
  try {
    const started = await startApp(dir, {googleFetcher: fetcher});
    app = started.app;
    seedUser(app);
    const go = await startGoogle(started.base);
    nonce = go.nonce;
    assert.ok(go.oauthHeader.includes('SameSite=Lax'));
    assert.ok(go.oauthHeader.includes('HttpOnly'));
    assert.ok(!/SameSite=Strict/i.test(go.oauthHeader));
    const cb = await callback(started.base, {
      state: go.state, cookie: go.oauthPair, headers: CROSS_SITE_GOOGLE,
    });
    assert.notEqual(cb.status, 403);
    const body = await cb.text();
    assert.equal(body.includes('Acceso desde otro sitio rechazado'), false);
    assert.equal(cb.status, 200);
    assert.match(cb.headers.get('content-type') || '', /text\/html/);
    assert.match(body, /http-equiv="refresh"/i);
    assert.match(body, /url=\/app/);
    assert.equal(captured.tokenHits, 1);
    assert.equal(captured.jwksHits >= 1, true);
    const session = sessionPair(cb);
    assert.ok(session);
    assert.ok(session.includes('SameSite=Strict'));
    const sess = await (await fetch(started.base + '/api/session', {
      headers: {Cookie: session.split(';')[0]},
    })).json();
    assert.equal(sess.authenticated, true);
  } finally {
    await closeApp(app, dir);
  }
});

test('cross-site callback with bad state redirects to login, never raw JSON', async () => {
  const dir = tmp();
  const {fetcher, captured} = makeFetcher({idToken: () => signJwt(claims({nonce: 'n'}))});
  let app;
  try {
    const started = await startApp(dir, {googleFetcher: fetcher});
    app = started.app;
    seedUser(app);
    const go = await startGoogle(started.base);
    const cb = await callback(started.base, {
      state: 'not-the-saved-state', cookie: go.oauthPair, headers: CROSS_SITE_GOOGLE,
    });
    const body = await cb.text();
    assert.notEqual(cb.status, 403);
    assert.equal(cb.status, 302);
    assert.equal(cb.headers.get('location'), GOOGLE_ERROR_PATH);
    assert.equal((cb.headers.get('content-type') || '').includes('application/json'), false);
    assert.equal(body.includes('Acceso desde otro sitio rechazado'), false);
    assert.equal(body.includes('"error"'), false);
    assert.equal(captured.tokenHits, 0);
    assert.equal(audit(app, 'auth.google.reject')[0]?.meta.reason, GOOGLE_REJECT.state_invalid);
  } finally {
    await closeApp(app, dir);
  }
});

test('cross-site guard still rejects other API and mutating routes', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const cross = {'Sec-Fetch-Site': 'cross-site', Origin: 'https://accounts.google.com'};
    const state = await fetch(started.base + '/api/state', {headers: cross});
    assert.equal(state.status, 403);
    assert.deepEqual(await state.json(), {error: 'Acceso desde otro sitio rechazado.'});
    const start = await fetch(started.base + GOOGLE_AUTH_START, {redirect: 'manual', headers: cross});
    assert.equal(start.status, 403);
    assert.deepEqual(await start.json(), {error: 'Acceso desde otro sitio rechazado.'});
    const login = await fetch(started.base + '/api/login', {
      method: 'POST',
      headers: {...cross, 'Content-Type': 'application/json'},
      body: JSON.stringify({email: OWNER_EMAIL, password: PASSWORD}),
    });
    assert.equal(login.status, 403);
    assert.deepEqual(await login.json(), {error: 'Acceso desde otro sitio rechazado.'});
    const logout = await fetch(started.base + '/api/logout', {
      method: 'POST',
      headers: {...cross, 'Content-Type': 'application/json'},
      body: '{}',
    });
    assert.equal(logout.status, 403);
  } finally {
    await closeApp(app, dir);
  }
});

test('secret files enable Google when readable', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'google_client_id'), CLIENT_ID, {mode: 0o600});
  writeFileSync(join(dir, 'google_client_secret'), CLIENT_SECRET, {mode: 0o600});
  let app;
  try {
    const started = await startApp(dir, {
      googleClientId: '',
      googleClientSecret: '',
      googleClientIdFile: join(dir, 'google_client_id'),
      googleClientSecretFile: join(dir, 'google_client_secret'),
    });
    app = started.app;
    assert.equal(app.google.enabled, true);
    const session = await (await fetch(started.base + '/api/session')).json();
    assert.equal(session.google.enabled, true);
  } finally {
    await closeApp(app, dir);
  }
});
