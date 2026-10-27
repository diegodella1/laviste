import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {createApp} from '../server.mjs';
import {createStore} from '../lib/store.mjs';
import {hashPassword, verifyPassword} from '../lib/password.mjs';
import {createTake, templates, activate} from '../lib/engine.mjs';
import {
  createAuth, LOGIN_GENERIC_ERROR, LOGIN_MAX_ATTEMPTS, PASSWORD_MAX,
  PW_ERR_CURRENT, PW_ERR_CURRENT_EMPTY, PW_ERR_EMAIL, PW_ERR_LONG, PW_ERR_MATCH,
  PW_ERR_NEW_EMPTY, PW_ERR_NOT_SET, PW_ERR_RATE, PW_ERR_SAME, PW_ERR_SHORT,
  RESET_INVALID_TITLE, RESET_RATE, ADMIN_RESET_SELF, ADMIN_RESET_SUSPENDED,
  ADMIN_RESET_ERR_NOT_FOUND, ADMIN_RESET_RATE, SESSION_COOKIE,
} from '../lib/auth.mjs';
import {inspectMigration, SCHEMA_USER_VERSION} from '../lib/migrations/multiuser.mjs';
import * as copy from '../public/copy.mjs';
import {LOGIN_GOOGLE_NOACCESS} from '../public/copy.mjs';
import {formatPrivacyUpdatedAt, PRIVACY_UPDATED_AT} from '../lib/site-date.mjs';

const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_EMAIL = 'ana@example.test';
const USER_PASSWORD = 'user-ana-password-12';
const NEW_PASSWORD = 'nueva-clave-12x';
const ADMIN_KEY = 'k'.repeat(32);
const CREATE_USER = resolve('scripts/create-user.mjs');
const ORIGIN = 'https://laviste.example.test';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'p0a-acc-'));
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
    secure: false,
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

function seedUser(app, {email = USER_EMAIL, password = USER_PASSWORD, status = 'active'} = {}) {
  return app.store.createUser({
    email, status, role: 'user', displayName: 'Ana', passwordHash: hashPassword(password),
  });
}

function spawnCli(script, args, {dir, input = ''} = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    input,
    env: {...process.env, DATA_DIR: dir},
  });
}

test('P0A-9 Google-only POST /api/me/password is 409 password_not_set', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const id = app.store.createUser({email: USER_EMAIL, role: 'user', status: 'active'});
    app.store.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run('', id);
    const token = app.auth.createSession(app.auth.userById(id), {ip: '127.0.0.1'});
    const cookie = `${SESSION_COOKIE}=${token}`;
    const before = app.store.db.prepare('SELECT password_hash FROM users WHERE id=?').get(id).password_hash;
    const res = await jsonReq(started.base + '/api/me/password', {
      headers: jsonHeaders(cookie), method: 'POST', body: {current: 'x', next: NEW_PASSWORD},
    });
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'password_not_set');
    assert.equal(res.data.error, PW_ERR_NOT_SET);
    const after = app.store.db.prepare('SELECT password_hash FROM users WHERE id=?').get(id).password_hash;
    assert.equal(after, before);
  } finally {
    await closeApp(app, dir);
  }
});

test('P0A-11/13/14/15 password validation codes and 400 not 401', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    seedUser(app);
    const cookie = await login(started.base, USER_EMAIL, USER_PASSWORD);
    const tooLong = await jsonReq(started.base + '/api/me/password', {
      headers: jsonHeaders(cookie), method: 'POST',
      body: {current: USER_PASSWORD, next: 'x'.repeat(PASSWORD_MAX + 1)},
    });
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.data.code, 'password_too_long');
    assert.equal(tooLong.data.error, PW_ERR_LONG);
    const asEmail = await jsonReq(started.base + '/api/me/password', {
      headers: jsonHeaders(cookie), method: 'POST',
      body: {current: USER_PASSWORD, next: `  ${USER_EMAIL.toUpperCase()}  `},
    });
    assert.equal(asEmail.status, 400);
    assert.equal(asEmail.data.code, 'password_is_email');
    assert.equal(asEmail.data.error, PW_ERR_EMAIL);
    const emptyCurrent = await jsonReq(started.base + '/api/me/password', {
      headers: jsonHeaders(cookie), method: 'POST',
      body: {current: '', next: NEW_PASSWORD},
    });
    assert.equal(emptyCurrent.status, 400);
    assert.equal(emptyCurrent.data.code, 'password_current_required');
    assert.equal(emptyCurrent.data.error, PW_ERR_CURRENT_EMPTY);
    const wrong = await jsonReq(started.base + '/api/me/password', {
      headers: jsonHeaders(cookie), method: 'POST',
      body: {current: 'not-the-password-12', next: NEW_PASSWORD},
    });
    assert.equal(wrong.status, 400, JSON.stringify(wrong.data));
    assert.notEqual(wrong.status, 401);
    assert.equal(wrong.data.code, 'password_current_invalid');
    const still = await jsonReq(started.base + '/api/me', {headers: jsonHeaders(cookie)});
    assert.equal(still.status, 200);
    const same = await jsonReq(started.base + '/api/me/password', {
      headers: jsonHeaders(cookie), method: 'POST',
      body: {current: USER_PASSWORD, next: USER_PASSWORD},
    });
    assert.equal(same.status, 400);
    assert.equal(same.data.code, 'password_same');
  } finally {
    await closeApp(app, dir);
  }
});

test('P0A-16 password rate limit is per account', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    seedUser(app);
    const otherId = app.store.createUser({
      email: 'bee@example.test', role: 'user', passwordHash: hashPassword(USER_PASSWORD),
    });
    const cookieA = await login(started.base, USER_EMAIL, USER_PASSWORD);
    const cookieB = await login(started.base, 'bee@example.test', USER_PASSWORD);
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      const res = await jsonReq(started.base + '/api/me/password', {
        headers: jsonHeaders(cookieA), method: 'POST',
        body: {current: 'wrong-password-12', next: NEW_PASSWORD},
      });
      assert.equal(res.status, 400, `attempt ${i + 1}`);
    }
    const locked = await jsonReq(started.base + '/api/me/password', {
      headers: jsonHeaders(cookieA), method: 'POST',
      body: {current: USER_PASSWORD, next: NEW_PASSWORD},
    });
    assert.equal(locked.status, 429);
    assert.equal(locked.data.code, 'password_rate_limited');
    assert.equal(locked.data.error, PW_ERR_RATE);
    const other = await jsonReq(started.base + '/api/me/password', {
      headers: jsonHeaders(cookieB), method: 'POST',
      body: {current: USER_PASSWORD, next: NEW_PASSWORD},
    });
    assert.equal(other.status, 200, JSON.stringify(other.data));
    assert.equal(otherId, otherId);
  } finally {
    await closeApp(app, dir);
  }
});

test('P0A-17/18/19/20/22 change password rotates current, revokes others, audits, no secrets', async () => {
  const dir = tmp();
  let app;
  const logs = [];
  const tap = (...args) => logs.push(args.map(String).join(' '));
  const orig = {log: console.log, warn: console.warn, error: console.error, info: console.info};
  console.log = tap; console.warn = tap; console.error = tap; console.info = tap;
  try {
    const started = await startApp(dir);
    app = started.app;
    const userId = seedUser(app);
    const cookieA = await login(started.base, USER_EMAIL, USER_PASSWORD);
    const cookieB = await login(started.base, USER_EMAIL, USER_PASSWORD);
    const cookieC = await login(started.base, USER_EMAIL, USER_PASSWORD);
    const changed = await jsonReq(started.base + '/api/me/password', {
      headers: jsonHeaders(cookieC), method: 'POST',
      body: {current: USER_PASSWORD, next: NEW_PASSWORD},
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.data));
    assert.equal(changed.data.ok, true);
    assert.equal(changed.data.revokedSessions, 2);
    const nextCookie = cookiePair({headers: changed.headers});
    assert.ok(nextCookie);
    assert.notEqual(nextCookie, cookieC);
    assert.equal((await jsonReq(started.base + '/api/state', {headers: jsonHeaders(cookieA)})).status, 401);
    assert.equal((await jsonReq(started.base + '/api/state', {headers: jsonHeaders(cookieB)})).status, 401);
    assert.equal((await jsonReq(started.base + '/api/state', {headers: jsonHeaders(cookieC)})).status, 401);
    const mine = await jsonReq(started.base + '/api/me', {headers: jsonHeaders(nextCookie)});
    assert.equal(mine.status, 200);
    assert.equal(mine.data.sessionCount, 1);
    const dumped = JSON.stringify(changed.data) + changed.text + logs.join('\n');
    assert.equal(dumped.includes(NEW_PASSWORD), false);
    assert.equal(dumped.includes(USER_PASSWORD), false);
    assert.equal(dumped.includes('scrypt$'), false);
    const audits = app.store.listAuditLog({action: 'auth.password_changed'});
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actorUserId, userId);
    assert.equal(audits[0].target, userId);
    assert.equal(audits[0].meta.revokedSessions, 2);
    assert.equal(JSON.stringify(audits[0]).includes(NEW_PASSWORD), false);
    const oldLogin = await jsonReq(started.base + '/api/login', {
      method: 'POST', headers: jsonHeaders(), body: {email: USER_EMAIL, password: USER_PASSWORD},
    });
    assert.equal(oldLogin.status, 401);
    assert.equal(oldLogin.data.error, LOGIN_GENERIC_ERROR);
    const newLogin = await jsonReq(started.base + '/api/login', {
      method: 'POST', headers: jsonHeaders(), body: {email: USER_EMAIL, password: NEW_PASSWORD},
    });
    assert.equal(newLogin.status, 200);
  } finally {
    console.log = orig.log; console.warn = orig.warn; console.error = orig.error; console.info = orig.info;
    await closeApp(app, dir);
  }
});

test('P0A-23/24 revoke others and hide button source contract', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const userId = seedUser(app);
    const cookieA = await login(started.base, USER_EMAIL, USER_PASSWORD);
    await login(started.base, USER_EMAIL, USER_PASSWORD);
    await login(started.base, USER_EMAIL, USER_PASSWORD);
    const me = await jsonReq(started.base + '/api/me', {headers: jsonHeaders(cookieA)});
    assert.equal(me.data.sessionCount, 3);
    const revoked = await jsonReq(started.base + '/api/me/sessions/revoke-others', {
      headers: jsonHeaders(cookieA), method: 'POST', body: {},
    });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.data.revoked, 2);
    const still = await jsonReq(started.base + '/api/me', {headers: jsonHeaders(cookieA)});
    assert.equal(still.status, 200);
    assert.equal(still.data.sessionCount, 1);
    const audits = app.store.listAuditLog({action: 'auth.sessions_revoked_others'});
    assert.equal(audits[0].target, userId);
    assert.equal(audits[0].meta.revoked, 2);
    const appJs = readFileSync('public/app.js', 'utf8');
    assert.match(appJs, /sessionCount \|\| 1\) > 1/);
  } finally {
    await closeApp(app, dir);
  }
});

test('P0A-25 export as user only includes that user', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const userId = seedUser(app);
    const otherId = app.store.createUser({
      email: 'otra@example.test', role: 'user', passwordHash: hashPassword(USER_PASSWORD),
    });
    const takeA = createTake(templates[0]);
    takeA.title = 'Tesis de Ana';
    activate(takeA, 100_000);
    app.store.forUser(userId).putTake(takeA);
    const takeB = createTake(templates[0]);
    takeB.title = 'Tesis secreta de otra';
    activate(takeB, 100_000);
    app.store.forUser(otherId).putTake(takeB);
    const cookie = await login(started.base, USER_EMAIL, USER_PASSWORD);
    const exp = await jsonReq(started.base + '/api/export', {headers: jsonHeaders(cookie)});
    assert.equal(exp.status, 200);
    const blob = JSON.stringify(exp.data);
    assert.match(blob, /Tesis de Ana/);
    assert.equal(blob.includes('Tesis secreta de otra'), false);
  } finally {
    await closeApp(app, dir);
  }
});

test('create-user CLI Google-only insert and duplicate-email refusal', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
    store.close();
    store = null;
    const created = spawnCli(CREATE_USER, ['--email', '  Ana@Example.TEST  '], {dir});
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /^[0-9a-f-]{36} ana@example.test\n$/);
    assert.equal(created.stdout.includes('scrypt$'), false);
    store = createStore(dir);
    const row = store.db.prepare(
      'SELECT id,email,role,status,password_hash,google_sub FROM users WHERE email=?',
    ).get('ana@example.test');
    assert.equal(row.role, 'user');
    assert.equal(row.status, 'active');
    assert.equal(row.password_hash, '');
    assert.equal(row.google_sub, null);
    const audits = store.listAuditLog({action: 'user.create_cli'});
    assert.equal(audits.length, 1);
    store.close();
    store = null;
    const dup = spawnCli(CREATE_USER, ['--email', 'ANA@example.test'], {dir});
    assert.notEqual(dup.status, 0);
    assert.match(dup.stderr, /Ya existe/);
    const superadmin = spawnCli(CREATE_USER, ['--email', 'otro@example.test', '--role', 'superadmin'], {dir});
    assert.notEqual(superadmin.status, 0);
    assert.match(superadmin.stderr, /superadmin/i);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('LOGIN_GOOGLE_NOACCESS is the dedicated no-access line', () => {
  assert.equal(
    LOGIN_GOOGLE_NOACCESS,
    'Esta cuenta de Google no tiene acceso a La Viste. Pedile acceso a quien administra La Viste.',
  );
});

test('GET /api/me returns account flags without secrets', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    seedUser(app);
    const cookie = await login(started.base, USER_EMAIL, USER_PASSWORD);
    const me = await jsonReq(started.base + '/api/me', {headers: jsonHeaders(cookie)});
    assert.equal(me.status, 200);
    assert.equal(me.data.email, USER_EMAIL);
    assert.equal(me.data.hasPassword, true);
    assert.equal(me.data.googleLinked, false);
    assert.equal(me.data.publicAlias, null);
    assert.equal(typeof me.data.googleEnabled, 'boolean');
    assert.equal(me.data.sessionCount >= 1, true);
    assert.equal(JSON.stringify(me.data).includes('scrypt$'), false);
    assert.equal(JSON.stringify(me.data).includes(USER_PASSWORD), false);
  } finally {
    await closeApp(app, dir);
  }
});

test('audit_log older than 12 months is purged; 11 months stays', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
    const nowMs = Date.parse('2026-10-20T15:00:00.000Z');
    const eleven = new Date(nowMs);
    eleven.setUTCMonth(eleven.getUTCMonth() - 11);
    const thirteen = new Date(nowMs);
    thirteen.setUTCMonth(thirteen.getUTCMonth() - 13);
    store.db.prepare(`INSERT INTO audit_log(id, at, actor_user_id, action, target, meta, ip_hash)
      VALUES (?,?,?,?,?,?,?)`).run('keep-11', eleven.toISOString(), null, 'auth.test', 'keep', '{}', null);
    store.db.prepare(`INSERT INTO audit_log(id, at, actor_user_id, action, target, meta, ip_hash)
      VALUES (?,?,?,?,?,?,?)`).run('drop-13', thirteen.toISOString(), null, 'auth.test', 'drop', '{}', null);
    const result = store.purgeAuditLog({now: () => nowMs});
    assert.equal(result.deleted, 1);
    const ids = store.db.prepare('SELECT id FROM audit_log WHERE action=? ORDER BY id').all('auth.test').map(r => r.id);
    assert.deepEqual(ids, ['keep-11']);
    const again = store.purgeAuditLog({now: () => nowMs});
    assert.equal(again.deleted, 0);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('P0A-48 public copy, v18 migration and error-text parity', () => {
  execFileSync('node', ['scripts/build-site.mjs'], {env: {...process.env, FEATURE_IOL: '0'}});
  const confirmarMark = '[' + 'CONFIRMAR';
  const PUBLIC_BANNED = [
    'OpenAI requerido', 'clave de OpenAI en Configuración', 'clave OpenAI en Configuración',
    'clave OpenAI propia', 'credenciales propias', 'contraseña de este espacio',
    'contraseña del espacio', 'único espacio privado', 'no ofrece cuentas individuales',
    'Ir a Configuración', confirmarMark,
  ];
  const files = ['scripts/build-site.mjs', ...readdirSync('public').filter(f => f.endsWith('.html')).map(f => `public/${f}`)];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const phrase of PUBLIC_BANNED) {
      assert.ok(!text.includes(phrase), `${file} must not contain «${phrase}»`);
    }
  }
  const privacy = readFileSync('public/privacy.html', 'utf8');
  for (const heading of ['Cuentas individuales', 'Si entrás con Google', 'Sesiones y cookies', 'Registro de seguridad', 'Análisis con IA', 'Tesis públicas']) {
    assert.ok(privacy.includes(heading), heading);
  }
  assert.match(privacy, /Actualizada el .+ de 2026/);
  assert.equal(privacy.includes('5 de octubre de 2026'), false);
  assert.ok(privacy.includes(`Actualizada el ${formatPrivacyUpdatedAt(PRIVACY_UPDATED_AT)}`));
  assert.match(privacy, /Se conserva por 12 meses/);
  assert.match(privacy, /Diego Dell'Agostino/);
  assert.match(privacy, /diego@diegodella\.ar/);
  assert.ok(privacy.includes('Ninguna otra cuenta puede verlas ni modificarlas, salvo lo que elijas publicar de una tesis (ver «Tesis públicas»).'));
  assert.ok(privacy.includes('Si elegís un alias público, también lo guardamos.'));
  assert.match(privacy, /Nunca se muestran tu correo/);
  assert.equal(privacy.includes('tu email'), false);
  const about = readFileSync('public/about.html', 'utf8');
  assert.match(about, /Diego Dell(?:'|\&apos;)Agostino/);
  assert.doesNotMatch(
    about.replaceAll(/https?:\/\/[^\s"'<>]*diegodella\.ar/g, '').replaceAll(/diego@diegodella\.ar/g, ''),
    /Diego Della\b/,
  );
  assert.equal(about.includes('application/ld+json'), false);
  const terceros = privacy.slice(privacy.indexOf('Conexiones con terceros'), privacy.indexOf('Tus controles'));
  assert.ok(terceros.includes('La Viste usa Cloudflare Web Analytics para medir visitas de forma agregada, sin cookies y sin identificar personas.'));
  const sesiones = privacy.slice(privacy.indexOf('Sesiones y cookies'), privacy.indexOf('Registro de seguridad'));
  assert.equal(sesiones.includes('Cloudflare'), false);
  const home = readFileSync('public/home.html', 'utf8');
  assert.ok(home.includes('¿Qué hago si olvido mi contraseña?'));
  assert.ok(home.includes('o con Google'));
  const dir = tmp();
  let store;
  try {
    store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
    store.db.exec('DROP TABLE IF EXISTS password_resets');
    store.db.exec('PRAGMA user_version=16');
    store.close();
    store = createStore(dir);
    assert.equal(store.userVersion(), SCHEMA_USER_VERSION);
    assert.equal(SCHEMA_USER_VERSION, 18);
    const report = inspectMigration(store.db);
    assert.equal(report.ok, true, report.errors.join('; '));
    store.close();
    store = createStore(dir);
    assert.equal(store.userVersion(), SCHEMA_USER_VERSION);
    const check = spawnSync(process.execPath, ['scripts/migrate-check.mjs', join(dir, 'tesis.sqlite')], {encoding: 'utf8'});
    assert.equal(check.status, 0, check.stderr);
    const migrateReport = JSON.parse(check.stdout);
    assert.equal(migrateReport.ok, true);
    assert.equal(migrateReport.userVersion, SCHEMA_USER_VERSION);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
  const pairs = [
    ['PW_ERR_CURRENT_EMPTY', PW_ERR_CURRENT_EMPTY, copy.PW_ERR_CURRENT_EMPTY],
    ['PW_ERR_CURRENT', PW_ERR_CURRENT, copy.PW_ERR_CURRENT],
    ['PW_ERR_NEW_EMPTY', PW_ERR_NEW_EMPTY, copy.PW_ERR_NEW_EMPTY],
    ['PW_ERR_SHORT', PW_ERR_SHORT, copy.PW_ERR_SHORT],
    ['PW_ERR_LONG', PW_ERR_LONG, copy.PW_ERR_LONG],
    ['PW_ERR_EMAIL', PW_ERR_EMAIL, copy.PW_ERR_EMAIL],
    ['PW_ERR_SAME', PW_ERR_SAME, copy.PW_ERR_SAME],
    ['PW_ERR_MATCH', PW_ERR_MATCH, copy.PW_ERR_MATCH],
    ['PW_ERR_RATE', PW_ERR_RATE, copy.PW_ERR_RATE],
    ['PW_ERR_NOT_SET', PW_ERR_NOT_SET, copy.PW_ERR_NOT_SET],
    ['RESET_INVALID_TITLE', RESET_INVALID_TITLE, copy.RESET_INVALID_TITLE],
    ['RESET_RATE', RESET_RATE, copy.RESET_RATE],
    ['ADMIN_RESET_SELF', ADMIN_RESET_SELF, copy.ADMIN_RESET_SELF],
    ['ADMIN_RESET_SUSPENDED', ADMIN_RESET_SUSPENDED, copy.ADMIN_RESET_SUSPENDED],
    ['ADMIN_RESET_ERR_NOT_FOUND', ADMIN_RESET_ERR_NOT_FOUND, copy.ADMIN_RESET_ERR_NOT_FOUND],
    ['ADMIN_RESET_RATE', ADMIN_RESET_RATE, copy.ADMIN_RESET_RATE],
  ];
  for (const [name, a, b] of pairs) {
    assert.equal(a, b, name);
  }
});
