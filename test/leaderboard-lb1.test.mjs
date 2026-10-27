import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createApp} from '../server.mjs';
import {createStore} from '../lib/store.mjs';
import {hashPassword} from '../lib/password.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {
  SCHEMA_USER_VERSION, inspectMigration, verifyMigration,
  DEFAULT_OWNER_EMAIL,
} from '../lib/migrations/multiuser.mjs';
import {validatePublicAlias, ALIAS_ERR, aliasCodePoints} from '../lib/public-alias.mjs';
import {
  createDailyMarksJob, shouldWriteDailyMarks, markEligible, artCalendarDay,
} from '../lib/daily-marks.mjs';
import {leaderboardGeneration, resetLeaderboardGeneration} from '../lib/leaderboard-cache.mjs';
import {PRIVACY_PUBLIC_SECTION} from '../public/copy.mjs';

const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_B_EMAIL = 'b@example.test';
const USER_B_PASSWORD = 'user-b-password-12';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'lb1-'));
}

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

function cookiePair(res) {
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

async function login(base, email, password) {
  const res = await fetch(base + '/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password}),
  });
  assert.equal(res.status, 200, await res.text());
  return {Cookie: cookiePair(res), 'Content-Type': 'application/json'};
}

async function jsonReq(base, path, {method = 'GET', headers, body} = {}) {
  const res = await fetch(base + path, {
    method,
    headers: headers || {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return {status: res.status, data};
}

function activeTake(marker = 'tesis-lb1') {
  const take = createTake(templates[0]);
  take.thesis = marker;
  activate(take, 1_000_000);
  take.monitoringPaused = false;
  take.realPricesAt = new Date().toISOString();
  take.benchmarkId = 'MERV';
  return take;
}

async function startApp() {
  const dir = tmp();
  const app = createApp({
    dataDir: dir,
    password: OWNER_PASSWORD,
    ownerEmail: OWNER_EMAIL,
    apiKey: 'sk-test-not-used',
    port: 0,
    host: '127.0.0.1',
    quotesLive: false,
    quotesFixture: true,
    dailyMarksStartTimer: false,
  });
  const userB = app.store.createUser({
    email: USER_B_EMAIL,
    displayName: 'Bee',
    role: 'user',
    passwordHash: hashPassword(USER_B_PASSWORD),
  });
  const owner = app.store.forUser(app.store.ownerUserId());
  const other = app.store.forUser(userB);
  const takeA = activeTake('TESIS-A');
  const takeB = activeTake('TESIS-B');
  owner.putTake(takeA);
  other.putTake(takeB);
  const base = await listen(app);
  const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
  const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
  return {dir, app, base, userB, takeA, takeB, headersA, headersB, owner, other};
}

async function closeApp(ctx) {
  if (ctx?.app?.server.listening) await ctx.app.close();
  else ctx?.app?.store.close();
  if (ctx?.dir) rmSync(ctx.dir, {recursive: true, force: true});
}

test('alias validation covers length, charset, email local, reserved', () => {
  assert.equal(validatePublicAlias('nodo_sur'), 'nodo_sur');
  assert.equal(validatePublicAlias('  nodo   sur  '), 'nodo sur');
  assert.equal(aliasCodePoints('ñoño'), 4);
  assert.equal(validatePublicAlias('Ñandú sur'), 'Ñandú sur');
  assert.throws(() => validatePublicAlias('  '), {code: 'alias_requerido', message: ALIAS_ERR.required});
  assert.throws(() => validatePublicAlias('ab'), {code: 'alias_invalido', message: ALIAS_ERR.length});
  assert.throws(() => validatePublicAlias('x'.repeat(25)), {code: 'alias_invalido', message: ALIAS_ERR.length});
  assert.throws(() => validatePublicAlias('nico@'), {code: 'alias_invalido', message: ALIAS_ERR.at});
  assert.throws(() => validatePublicAlias('diego', {email: 'Diego@diegodella.ar'}), {
    code: 'alias_invalido', message: ALIAS_ERR.email,
  });
  assert.throws(() => validatePublicAlias('nodo!'), {code: 'alias_invalido', message: ALIAS_ERR.chars});
  assert.throws(() => validatePublicAlias('La Viste'), {code: 'alias_reservado', message: ALIAS_ERR.reserved});
  assert.throws(() => validatePublicAlias('laviste'), {code: 'alias_reservado'});
  assert.throws(() => validatePublicAlias('ADMIN'), {code: 'alias_reservado'});
  assert.throws(() => validatePublicAlias('SuperAdmin'), {code: 'alias_reservado'});
  assert.throws(() => validatePublicAlias('soporte'), {code: 'alias_reservado'});
  assert.throws(() => validatePublicAlias('Autor Anónimo'), {code: 'alias_reservado'});
});

test('v18 migration is idempotent, defaults private, and keeps triggers', () => {
  const dir = tmp();
  let first, second;
  try {
    first = createStore(dir, {ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12'});
    const take = activeTake();
    first.putTake(take);
    assert.equal(first.userVersion(), 18);
    const report = inspectMigration(first.db);
    assert.equal(report.ok, true, report.errors.join('; '));
    verifyMigration(first.db);
    const row = first.db.prepare('SELECT is_public, public_id, public_since FROM takes WHERE id=?').get(take.id);
    assert.equal(row.is_public, 0);
    assert.equal(row.public_id, null);
    assert.equal(first.db.prepare('SELECT COUNT(*) AS n FROM public_take_stats').get().n, 0);
    first.close();
    first = null;
    second = createStore(dir);
    assert.equal(second.userVersion(), SCHEMA_USER_VERSION);
    const again = inspectMigration(second.db);
    assert.equal(again.ok, true, again.errors.join('; '));
    const still = second.db.prepare('SELECT is_public FROM takes WHERE id=?').get(take.id);
    assert.equal(still.is_public, 0);
    const ownerId = second.ownerUserId();
    const other = second.createUser({email: 'other-lb1@example.test', passwordHash: 'x'});
    assert.throws(
      () => second.db.prepare(
        `INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
         VALUES (?,?,?,?,?,?)`,
      ).run('missing-take', null, '2026-10-27', 1, 1, 1),
      /take_daily_marks\.user_id is required/,
    );
    assert.throws(
      () => second.db.prepare(`
        INSERT INTO public_take_stats(
          public_id, take_id, user_id, title, alias, holdings_json, days_active,
          ranked, auto_label, window_end, computed_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run('pid-null', 'missing-take', null, 't', 'a', '[]', 1, 0, 0, '2026-10-27', '2026-10-27T00:00:00.000Z'),
      /public_take_stats\.user_id is required/,
    );
    assert.throws(
      () => second.db.prepare(
        `INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
         VALUES (?,?,?,?,?,?)`,
      ).run(take.id, other, '2026-10-27', 1, 1, 1),
      /take_daily_marks\.user_id must match takes\.user_id/,
    );
    assert.throws(
      () => second.db.prepare(`
        INSERT INTO public_take_stats(
          public_id, take_id, user_id, title, alias, holdings_json, days_active,
          ranked, auto_label, window_end, computed_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run('pid-other', take.id, other, 't', 'a', '[]', 1, 0, 0, '2026-10-27', '2026-10-27T00:00:00.000Z'),
      /public_take_stats\.user_id must match takes\.user_id/,
    );
    second.db.prepare(
      `INSERT INTO take_daily_marks(take_id, user_id, day, value, invested, eligible)
       VALUES (?,?,?,?,?,?)`,
    ).run(take.id, ownerId, '2026-10-27', 10, 9, 1);
    assert.equal(second.db.prepare('SELECT COUNT(*) AS n FROM take_daily_marks').get().n, 1);
  } finally {
    first?.close();
    second?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('v17 fixture migrates additively to v18 without publishing existing takes', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir, {ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12'});
    const take = activeTake();
    store.putTake(take);
    store.db.exec('DROP TABLE IF EXISTS take_daily_marks');
    store.db.exec('DROP TABLE IF EXISTS public_take_stats');
    store.db.exec('DROP INDEX IF EXISTS takes_public_id');
    store.db.exec('DROP INDEX IF EXISTS users_public_alias');
    store.db.exec('PRAGMA user_version=17');
    store.close();
    store = createStore(dir);
    assert.equal(store.userVersion(), 18);
    const report = inspectMigration(store.db);
    assert.equal(report.ok, true, report.errors.join('; '));
    assert.equal(store.db.prepare('SELECT is_public FROM takes WHERE id=?').get(take.id).is_public, 0);
    const check = spawnSync(process.execPath, ['scripts/migrate-check.mjs', join(dir, 'tesis.sqlite')], {
      encoding: 'utf8',
    });
    assert.equal(check.status, 0, check.stderr);
    assert.equal(JSON.parse(check.stdout).userVersion, 18);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('PUT alias and visibility: validate, isolate, unpublish clears public_id and stats', async () => {
  const ctx = await startApp();
  try {
    const {app, base, headersA, headersB, takeA, takeB} = ctx;
    resetLeaderboardGeneration();
    const bad = await jsonReq(base, '/api/me/alias', {
      method: 'PUT', headers: headersA, body: {alias: 'ab'},
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.code, 'alias_invalido');

    const reserved = await jsonReq(base, '/api/me/alias', {
      method: 'PUT', headers: headersA, body: {alias: 'admin'},
    });
    assert.equal(reserved.status, 400);
    assert.equal(reserved.data.code, 'alias_reservado');

    const ok = await jsonReq(base, '/api/me/alias', {
      method: 'PUT', headers: headersA, body: {alias: 'nodo_sur'},
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.alias, 'nodo_sur');
    const aliasAudit = app.store.listAuditLog({action: 'user.alias'});
    assert.equal(aliasAudit.length, 1);
    assert.equal(JSON.stringify(aliasAudit[0].meta).includes(takeA.title), false);

    const clash = await jsonReq(base, '/api/me/alias', {
      method: 'PUT', headers: headersB, body: {alias: 'NODO_SUR'},
    });
    assert.equal(clash.status, 409);
    assert.equal(clash.data.code, 'alias_en_uso');

    const foreign = await jsonReq(base, `/api/takes/${takeA.id}/visibility`, {
      method: 'PUT', headers: headersB, body: {public: true, version: takeA.version, alias: 'otra_voz'},
    });
    assert.equal(foreign.status, 404);
    assert.equal(app.store.forUser(app.store.ownerUserId()).takeVisibility(takeA.id).isPublic, false);

    const missingAlias = await jsonReq(base, `/api/takes/${takeB.id}/visibility`, {
      method: 'PUT', headers: headersB, body: {public: true, version: takeB.version},
    });
    assert.equal(missingAlias.status, 400);
    assert.equal(missingAlias.data.code, 'alias_requerido');

    const pub = await jsonReq(base, `/api/takes/${takeA.id}/visibility`, {
      method: 'PUT', headers: headersA, body: {public: true, version: takeA.version},
    });
    assert.equal(pub.status, 200, JSON.stringify(pub.data));
    assert.equal(pub.data.isPublic, true);
    assert.equal(typeof pub.data.publicId, 'string');
    assert.ok(pub.data.publicId.length >= 16);
    const firstId = pub.data.publicId;
    const publishAudit = app.store.listAuditLog({action: 'take.publish'});
    assert.equal(publishAudit.length, 1);
    assert.equal(publishAudit[0].target, takeA.id);
    assert.equal(JSON.stringify(publishAudit[0]).includes(takeA.title), false);

    app.store.db.prepare(`
      INSERT INTO public_take_stats(
        public_id, take_id, user_id, title, alias, holdings_json, days_active,
        ranked, auto_label, window_end, computed_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      firstId, takeA.id, app.store.ownerUserId(), 'no-title-in-api', 'nodo_sur', '[]',
      1, 0, 0, '2026-10-27', '2026-10-27T20:30:00.000Z',
    );
    const genBefore = leaderboardGeneration();
    const off = await jsonReq(base, `/api/takes/${takeA.id}/visibility`, {
      method: 'PUT', headers: headersA, body: {public: false, version: pub.data.take.version},
    });
    assert.equal(off.status, 200, JSON.stringify(off.data));
    assert.equal(off.data.isPublic, false);
    assert.equal(off.data.publicId, null);
    const cleared = app.store.db.prepare('SELECT is_public, public_id FROM takes WHERE id=?').get(takeA.id);
    assert.equal(cleared.is_public, 0);
    assert.equal(cleared.public_id, null);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM public_take_stats WHERE take_id=?').get(takeA.id).n, 0);
    assert.ok(leaderboardGeneration() > genBefore);

    const again = await jsonReq(base, `/api/takes/${takeA.id}/visibility`, {
      method: 'PUT', headers: headersA, body: {public: true, version: off.data.take.version},
    });
    assert.equal(again.status, 200);
    assert.notEqual(again.data.publicId, firstId);

    const gone = await jsonReq(base, '/api/leaderboard', {headers: headersA});
    assert.equal(gone.status, 404);
  } finally {
    await closeApp(ctx);
  }
});

test('archiving a public take unpublishes in the same transaction', async () => {
  const ctx = await startApp();
  try {
    const {app, base, headersA, takeA} = ctx;
    const pub = await jsonReq(base, `/api/takes/${takeA.id}/visibility`, {
      method: 'PUT', headers: headersA, body: {public: true, version: takeA.version, alias: 'nodo_sur'},
    });
    assert.equal(pub.status, 200, JSON.stringify(pub.data));
    app.store.db.prepare(`
      INSERT INTO public_take_stats(
        public_id, take_id, user_id, title, alias, holdings_json, days_active,
        ranked, auto_label, window_end, computed_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      pub.data.publicId, takeA.id, app.store.ownerUserId(), 'x', 'nodo_sur', '[]',
      1, 0, 0, '2026-10-27', '2026-10-27T20:30:00.000Z',
    );
    const archived = await jsonReq(base, `/api/takes/${takeA.id}/archive`, {
      method: 'POST', headers: headersA, body: {},
    });
    assert.equal(archived.status, 200);
    assert.equal(archived.data.phase, 'archived');
    const row = app.store.db.prepare('SELECT is_public, public_id, public_since FROM takes WHERE id=?').get(takeA.id);
    assert.equal(row.is_public, 0);
    assert.equal(row.public_id, null);
    assert.equal(row.public_since, null);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM public_take_stats WHERE take_id=?').get(takeA.id).n, 0);
    const audits = app.store.listAuditLog({action: 'take.unpublish'});
    assert.equal(audits.some(item => item.meta.reason === 'archive'), true);
    assert.equal(JSON.stringify(audits).includes(takeA.title), false);
  } finally {
    await closeApp(ctx);
  }
});

test('daily marks job writes one row per active take after 17:30 ART', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir, {ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12'});
    const owner = store.forUser(store.ownerUserId());
    const live = activeTake('marca-activa');
    live.benchmarkId = 'MERV';
    owner.putTake(live);
    const draft = createTake(templates[0]);
    owner.putTake(draft);
    store.db.prepare('INSERT INTO benchmark_cache(id,price,as_of,stale) VALUES (?,?,?,?)')
      .run('MERV', 1234.5, '2026-10-27T20:00:00.000Z', 0);

    const mondayBefore = new Date('2026-10-26T20:00:00.000Z'); // 17:00 ART
    const mondayAfter = new Date('2026-10-26T20:35:00.000Z'); // 17:35 ART
    const saturday = new Date('2026-10-24T20:35:00.000Z');
    assert.equal(shouldWriteDailyMarks(mondayBefore, null), false);
    assert.equal(shouldWriteDailyMarks(mondayAfter, null), true);
    assert.equal(shouldWriteDailyMarks(mondayAfter, artCalendarDay(mondayAfter)), false);
    assert.equal(shouldWriteDailyMarks(saturday, null), false);
    assert.equal(markEligible(live), true);
    assert.equal(markEligible(draft), false);

    const quotes = {
      getBenchmarkCached(id) {
        const row = store.db.prepare('SELECT price, as_of, stale FROM benchmark_cache WHERE id=?').get(id);
        return row ? {id, price: row.price, asOf: row.as_of, stale: !!row.stale} : null;
      },
    };
    const job = createDailyMarksJob({
      store, quotes, now: () => mondayAfter, startTimer: false,
    });
    const first = job.write();
    assert.equal(first.skipped, false);
    assert.equal(first.written, 1);
    const mark = store.db.prepare('SELECT * FROM take_daily_marks WHERE take_id=?').get(live.id);
    assert.equal(mark.user_id, store.ownerUserId());
    assert.equal(mark.day, '2026-10-26');
    assert.equal(mark.bench_id, 'MERV');
    assert.equal(mark.bench_price, 1234.5);
    assert.equal(mark.eligible, 1);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM take_daily_marks').get().n, 1);
    const second = job.write();
    assert.equal(second.skipped, true);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM take_daily_marks').get().n, 1);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM public_take_stats').get().n, 0);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('privacy copy for tesis públicas uses Ajustes and the LB0 sense', () => {
  assert.match(PRIVACY_PUBLIC_SECTION, /desde sus Ajustes/);
  assert.ok(!PRIVACY_PUBLIC_SECTION.includes('Preferencias'));
  assert.match(PRIVACY_PUBLIC_SECTION, /nunca se muestran tu correo/i);
  assert.match(PRIVACY_PUBLIC_SECTION, /despublicarla cuando quieras/i);
});
