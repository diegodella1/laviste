import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {hashPassword} from '../lib/password.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {recordAporteOp} from '../lib/ops.mjs';
import {createPendingOrder} from '../lib/orders.mjs';
import {USER_SCOPED_TABLES} from '../lib/migrations/multiuser.mjs';
import {ROUTE_SCOPE, ROLE_FORBIDDEN, routeScopeNeedle} from '../lib/route-scope.mjs';
import {LOGIN_GENERIC_ERROR} from '../lib/auth.mjs';

const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_B_EMAIL = 'b@example.test';
const USER_B_PASSWORD = 'user-b-password-12';
const ADMIN_KEY = 'k'.repeat(32);
const MARKER_A = 'TESIS-PRIVADA-DE-A-NO-CRUZAR';
const MARKER_B = 'TESIS-PRIVADA-DE-B-NO-CRUZAR';
const SECRET_KEY = 'sk-secret-should-never-leak-xx';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'mu-routes-'));
}

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

function cookiePair(res) {
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

function fingerprint(db, userId) {
  const data = {};
  for (const table of USER_SCOPED_TABLES) {
    data[table] = db.prepare(`SELECT * FROM ${table} WHERE user_id=? ORDER BY id`).all(userId);
  }
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function activeTake(marker, template = templates[0], amount = 1_024_000) {
  const take = createTake(template);
  take.thesis = marker;
  activate(take, amount);
  take.monitoringPaused = false;
  take.nextCheckAt = new Date(Date.now() - 1000).toISOString();
  return take;
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
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return {status: res.status, data};
}

function seedUserData(scoped, {marker, chatId, jobId}) {
  const take = activeTake(marker);
  scoped.putTake(take);
  scoped.version(take);
  recordAporteOp(scoped, take, 15_000, `aporte-${chatId}`);
  scoped.putReview({
    id: randomUUID(), takeId: take.id, applied: true, summary: `review-${marker}`,
  });
  scoped.putJob({
    id: jobId, takeId: take.id, status: 'queued', createdAt: new Date().toISOString(),
  });
  const pending = createPendingOrder(scoped, take, {kind: 'aporte', amount: 20_000, version: take.version});
  scoped.putChat({
    id: chatId,
    title: marker,
    takeId: take.id,
    messages: [{role: 'user', content: marker}],
    proposal: templates[0],
    createdAt: new Date().toISOString(),
  });
  return {take, orderId: pending.order.id, chatId, jobId};
}

const capturedBodies = [];
const chatFetcher = async (url, options) => {
  capturedBodies.push(options?.body || '');
  return {
    ok: true,
    json: async () => ({
      status: 'completed',
      output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({message: 'Propuesta lista', proposal: templates[0]})}]}],
      usage: {input_tokens: 1, output_tokens: 1},
    }),
  };
};

async function startIsolatedApp(options = {}) {
  const dir = tmp();
  capturedBodies.length = 0;
  const app = createApp({
    dataDir: dir,
    password: OWNER_PASSWORD,
    ownerEmail: OWNER_EMAIL,
    apiKey: SECRET_KEY,
    adminKey: ADMIN_KEY,
    port: 0,
    host: '127.0.0.1',
    quotesLive: false,
    quotesFixture: true,
    fetcher: chatFetcher,
    ...options,
  });
  const userB = app.store.createUser({
    email: USER_B_EMAIL,
    displayName: 'Bee',
    role: 'user',
    passwordHash: hashPassword(USER_B_PASSWORD),
  });
  const owner = app.store.forUser(app.store.ownerUserId());
  const other = app.store.forUser(userB);
  const a = seedUserData(owner, {marker: MARKER_A, chatId: randomUUID(), jobId: randomUUID()});
  const b = seedUserData(other, {marker: MARKER_B, chatId: randomUUID(), jobId: randomUUID()});
  const base = await listen(app);
  const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
  const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
  return {dir, app, base, userB, owner, other, a, b, headersA, headersB};
}

async function closeApp(ctx) {
  if (ctx?.app?.server.listening) await ctx.app.close();
  else ctx?.app?.store.close();
  if (ctx?.dir) rmSync(ctx.dir, {recursive: true, force: true});
}

test('every /api route in server.mjs is declared in ROUTE_SCOPE; handlers use forUser', () => {
  const src = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(src, /store\.forUser\(user\.id\)/);
  assert.equal(src.includes('legacyPasswordLogin'), false);
  assert.equal(src.includes('allowLegacy'), false);
  assert.equal(/\bstore\.takes\(\)/.test(src), false);
  assert.equal(/\bstore\.chats\(\)/.test(src), false);
  assert.match(src, /store\.admin\.takes\(\)/);
  assert.match(src, /store\.admin\.chats\(\)/);

  const literals = [...src.matchAll(/path==='(\/api\/[^']+)'/g)].map(m => m[1]);
  for (const lit of literals) {
    assert.ok(
      ROUTE_SCOPE.some(row => row.path === lit || row.path.startsWith(lit + '/') || lit.startsWith(row.path)),
      `undeclared literal ${lit}`,
    );
  }
  for (const row of ROUTE_SCOPE) {
    if (!row.path.includes(':')) {
      assert.ok(
        src.includes(`'${row.path}'`) || src.includes(`"${row.path}"`),
        `server.mjs missing ${row.method} ${row.path}`,
      );
      continue;
    }
    const needle = routeScopeNeedle(row.path);
    assert.ok(src.includes(needle) || new RegExp(needle).test(src), `server.mjs missing ${row.method} ${row.path}`);
  }
});

test('cross-user reads, writes and deletes 404; state and export stay filtered', async () => {
  const ctx = await startIsolatedApp();
  try {
    const {app, base, headersA, headersB, a, b, userB} = ctx;
    const beforeA = fingerprint(app.store.db, app.store.ownerUserId());
    const beforeB = fingerprint(app.store.db, userB);
    const reads = [
      `/api/takes/${a.take.id}/versions`,
      `/api/takes/${a.take.id}/reviews`,
      `/api/takes/${a.take.id}/ops`,
      `/api/takes/${a.take.id}/orders`,
      `/api/jobs/${a.jobId}`,
    ];

    for (const path of reads) {
      const res = await jsonReq(base, path, {headers: headersB});
      assert.equal(res.status, 404, path);
    }
    for (const path of [
      `/api/takes/${b.take.id}/versions`,
      `/api/takes/${b.take.id}/ops`,
      `/api/jobs/${b.jobId}`,
    ]) {
      const res = await jsonReq(base, path, {headers: headersA});
      assert.equal(res.status, 404, `owner ${path}`);
    }

    const writes = [
      {path: `/api/takes/${a.take.id}/activate`, body: {amount: 1_024_000}},
      {path: `/api/takes/${a.take.id}/review`, body: {}},
      {path: `/api/takes/${a.take.id}/scenario`, body: {scenario: 'normal'}},
      {path: `/api/takes/${a.take.id}/settings`, body: {cadence: 'standard', mode: 'ask', cap: 25, drift: 5, monitoringPaused: true}},
      {path: `/api/takes/${a.take.id}/idea`, body: {thesis: 'x'.repeat(20), invalidation: 'y'.repeat(10)}},
      {path: `/api/takes/${a.take.id}/archive`, body: {}},
      {path: `/api/takes/${a.take.id}/rebalance`, body: {version: a.take.version}},
      {path: `/api/takes/${a.take.id}/aporte`, body: {amount: 1000, version: a.take.version}},
      {path: `/api/takes/${a.take.id}/retiro`, body: {amount: 1000, version: a.take.version}},
      {path: `/api/takes/${a.take.id}/correccion`, body: {note: 'ajuste de prueba', cashDelta: 0, version: a.take.version}},
      {path: `/api/takes/${a.take.id}/composition`, body: {weights: a.take.holdings.map(h => ({ticker: h.ticker, weight: h.weight}))}},
      {path: `/api/takes/${a.take.id}/orders`, body: {kind: 'aporte', amount: 20_000, version: a.take.version}},
      {path: `/api/takes/${a.take.id}/orders/${a.orderId}/confirm`, body: {version: a.take.version}},
      {path: `/api/takes/${a.take.id}/orders/${a.orderId}/cancel`, body: {}},
      {path: `/api/chats/${a.chatId}/messages`, body: {message: 'hola desde B'}},
      {path: '/api/takes', body: {sourceChatId: a.chatId}},
      {path: '/api/chats', body: {takeId: a.take.id}},
    ];
    for (const item of writes) {
      const res = await jsonReq(base, item.path, {method: 'POST', headers: headersB, body: item.body});
      assert.equal(res.status, 404, item.path);
    }

    assert.equal(fingerprint(app.store.db, app.store.ownerUserId()), beforeA);
    assert.equal(fingerprint(app.store.db, userB), beforeB);

    const stateB = await jsonReq(base, '/api/state', {headers: headersB});
    assert.equal(stateB.status, 200);
    const idsB = new Set(stateB.data.takes.map(t => t.id));
    assert.equal(idsB.has(a.take.id), false);
    assert.equal(idsB.has(b.take.id), true);
    assert.equal(JSON.stringify(stateB.data).includes(MARKER_A), false);
    assert.equal(JSON.stringify(stateB.data).includes(MARKER_B), true);
    assert.equal(stateB.data.config.aiConfigured, true);
    assert.equal(stateB.data.config.model, undefined);
    assert.equal(stateB.data.config.dailyLimit, undefined);
    assert.equal(stateB.data.config.apiKey, undefined);
    assert.equal(JSON.stringify(stateB.data).includes(SECRET_KEY), false);

    const exportB = await jsonReq(base, '/api/export', {headers: headersB});
    assert.equal(exportB.status, 200);
    assert.equal(exportB.data.takes.some(t => t.id === a.take.id), false);
    assert.equal(exportB.data.takes.some(t => t.id === b.take.id), true);
    assert.equal(JSON.stringify(exportB.data).includes(MARKER_A), false);
    assert.equal(JSON.stringify(exportB.data).includes(SECRET_KEY), false);

    const stateA = await jsonReq(base, '/api/state', {headers: headersA});
    assert.equal(stateA.status, 200);
    assert.equal(stateA.data.takes.some(t => t.id === a.take.id), true);
    assert.equal(stateA.data.takes.some(t => t.id === b.take.id), false);
    assert.equal(JSON.stringify(stateA.data).includes(MARKER_B), false);
    assert.equal(stateA.data.config.model, 'gpt-5-mini');
    assert.equal(JSON.stringify(stateA.data).includes(SECRET_KEY), false);

    const exportA = await jsonReq(base, '/api/export', {headers: headersA});
    assert.equal(exportA.data.takes.some(t => t.id === b.take.id), false);
    assert.equal(JSON.stringify(exportA.data).includes(SECRET_KEY), false);

    const sameKey = 'same-client-key-99';
    const madeA = await jsonReq(base, '/api/takes', {
      method: 'POST',
      headers: {...headersA, 'Idempotency-Key': sameKey},
      body: {proposal: templates[1]},
    });
    const madeB = await jsonReq(base, '/api/takes', {
      method: 'POST',
      headers: {...headersB, 'Idempotency-Key': sameKey},
      body: {proposal: templates[1]},
    });
    assert.equal(madeA.status, 201);
    assert.equal(madeB.status, 201);
    assert.notEqual(madeA.data.id, madeB.data.id);
  } finally {
    await closeApp(ctx);
  }
});

test('regular user gets 403 on superadmin routes; superadmin without step-up gets 401 on /api/admin', async () => {
  const ctx = await startIsolatedApp();
  try {
    const {base, headersA, headersB} = ctx;
    const superadminPaths = ROUTE_SCOPE.filter(row => row.scope === 'superadmin');
    for (const row of superadminPaths) {
      const path = row.path
        .replace(':oid', randomUUID())
        .replace(':id', randomUUID());
      const res = await jsonReq(base, path, {
        method: row.method,
        headers: headersB,
        body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(row.method) ? {} : undefined,
      });
      assert.equal(res.status, 403, `${row.method} ${path}`);
      assert.equal(res.data.error, ROLE_FORBIDDEN);
    }

    const admin = await jsonReq(base, '/api/admin/feeds', {headers: headersA});
    assert.equal(admin.status, 401);
    assert.equal(admin.data.error, 'Clave de administración requerida.');

    const refresh = await jsonReq(base, '/api/quotes/refresh', {method: 'POST', headers: headersA, body: {}});
    assert.equal(refresh.status, 200);

    const quotes = await jsonReq(base, '/api/quotes/status', {headers: headersB});
    assert.equal(quotes.status, 200);
  } finally {
    await closeApp(ctx);
  }
});

test('suspended user is blocked on /api and scheduler skips their jobs', async () => {
  const ctx = await startIsolatedApp({
    researcher: async take => ({
      id: `rev-${take.id}`,
      takeId: take.id,
      version: take.version,
      at: new Date().toISOString(),
      sources: [],
      events: [],
      attention: 'track',
      summary: `ran-${take.id}`,
      reason: 'ok',
      resolved: false,
      applied: true,
    }),
  });
  try {
    const {app, base, headersB, userB, b, a} = ctx;
    app.store.db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(userB);
    assert.equal((await jsonReq(base, '/api/state', {headers: headersB})).status, 401);
    const denied = await fetch(base + '/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: USER_B_EMAIL, password: USER_B_PASSWORD}),
    });
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), {error: LOGIN_GENERIC_ERROR});

    const jobB = app.store.forUser(userB).jobs().find(j => j.takeId === b.take.id);
    const jobA = app.store.forUser(app.store.ownerUserId()).jobs().find(j => j.takeId === a.take.id);
    await app.scheduler.tick();
    await app.scheduler.tick();
    assert.notEqual(app.store.admin.job(jobB.id).status, 'completed');
    assert.equal(app.store.admin.job(jobA.id).status, 'completed');
    assert.equal(app.store.forUser(userB).take(b.take.id).thesis, MARKER_B);
    assert.equal((app.store.forUser(userB).reviews(b.take.id) || []).some(r => r.summary === `ran-${b.take.id}`), false);
  } finally {
    await closeApp(ctx);
  }
});

test('100 takes / 200 chats are per user; owner seed is unchanged by user B', async () => {
  const dir = tmp();
  let app;
  try {
    app = createApp({
      dataDir: dir,
      password: OWNER_PASSWORD,
      ownerEmail: OWNER_EMAIL,
      apiKey: SECRET_KEY,
      port: 0,
      seed: true,
      quotesLive: false,
      fetcher: chatFetcher,
    });
    const userB = app.store.createUser({
      email: USER_B_EMAIL, role: 'user', passwordHash: hashPassword(USER_B_PASSWORD),
    });
    const other = app.store.forUser(userB);
    const proto = createTake(templates[0]);
    for (let i = 0; i < 100; i++) other.putTake({...structuredClone(proto), id: randomUUID()});
    for (let i = 0; i < 200; i++) other.putChat({id: randomUUID(), title: 'c', messages: [], proposal: null});
    const base = await listen(app);
    const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);

    const overflowTake = await jsonReq(base, '/api/takes', {
      method: 'POST', headers: headersB, body: {proposal: templates[0]},
    });
    assert.equal(overflowTake.status, 400);
    const overflowChat = await jsonReq(base, '/api/chats', {method: 'POST', headers: headersB, body: {}});
    assert.equal(overflowChat.status, 400);

    const ownerTake = await jsonReq(base, '/api/takes', {
      method: 'POST', headers: headersA, body: {proposal: templates[1]},
    });
    assert.equal(ownerTake.status, 201);
    const ownerChat = await jsonReq(base, '/api/chats', {method: 'POST', headers: headersA, body: {}});
    assert.equal(ownerChat.status, 201);

    const stateA = await jsonReq(base, '/api/state', {headers: headersA});
    assert.equal(stateA.data.takes.some(t => t.id === ownerTake.data.id), true);
    assert.equal(stateA.data.takes.length >= 4, true);
    assert.equal(stateA.data.takes.length < 50, true);
    const stateB = await jsonReq(base, '/api/state', {headers: headersB});
    assert.equal(stateB.data.takes.length, 100);
    assert.equal(stateB.data.chats.length, 200);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('chat context sent to the model never includes another user thesis', async () => {
  const ctx = await startIsolatedApp();
  try {
    const {base, headersA, a} = ctx;
    capturedBodies.length = 0;
    const chat = ctx.app.store.forUser(ctx.app.store.ownerUserId()).chats().find(c => c.takeId === a.take.id);
    const res = await jsonReq(base, `/api/chats/${chat.id}/messages`, {
      method: 'POST', headers: headersA, body: {message: 'Seguimos con mi tesis'},
    });
    assert.equal(res.status, 200);
    const sent = capturedBodies.join('\n');
    assert.equal(sent.includes(MARKER_B), false);
    assert.equal(sent.includes(MARKER_A), true);
    assert.equal(sent.includes(SECRET_KEY), false);
  } finally {
    await closeApp(ctx);
  }
});
