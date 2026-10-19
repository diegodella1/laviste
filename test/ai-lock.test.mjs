import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {hashPassword} from '../lib/password.mjs';
import {templates} from '../lib/engine.mjs';
import {
  createAiSemaphore, aiBusyError, envInt, resolveInt, DEFAULT_AI_GLOBAL_SLOTS,
} from '../lib/ai-lock.mjs';
import {AI_BUSY_USER, AI_BUSY_GLOBAL, friendlyApiError} from '../public/copy.mjs';

const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_B_EMAIL = 'b@example.test';
const USER_B_PASSWORD = 'user-b-password-12';
const USER_C_EMAIL = 'c@example.test';
const USER_C_PASSWORD = 'user-c-password-12';
const USER_D_EMAIL = 'd@example.test';
const USER_D_PASSWORD = 'user-d-password-12';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'ailock-'));
}

function cookiePair(res) {
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
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
  return {status: res.status, data, retryAfter: res.headers.get('retry-after')};
}

function chatOk() {
  return {
    ok: true,
    json: async () => ({
      status: 'completed',
      output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({message: 'Listo', proposal: templates[0]})}]}],
      usage: {input_tokens: 4, output_tokens: 2},
    }),
  };
}

function gatedFetcher() {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered = 0;
  const fetcher = async () => {
    entered += 1;
    await gate;
    return chatOk();
  };
  return {fetcher, release: () => release(), entered: () => entered};
}

async function waitUntil(fn, ms = 1500) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function putChat(app, userId, id) {
  app.store.forUser(userId).putChat({
    id, title: 'A', messages: [], proposal: null, createdAt: new Date().toISOString(),
  });
}

async function startApp({fetcher, extraUsers = [], aiConcurrency = 2} = {}) {
  const dir = tmp();
  const app = createApp({
    dataDir: dir,
    password: OWNER_PASSWORD,
    ownerEmail: OWNER_EMAIL,
    apiKey: 'sk-test-not-a-secret-xx',
    port: 0,
    quotesLive: false,
    aiConcurrency,
    fetcher: fetcher || (async () => chatOk()),
  });
  const users = {};
  for (const row of extraUsers) {
    users[row.email] = app.store.createUser({
      email: row.email, role: 'user', passwordHash: hashPassword(row.password),
    });
    app.store.setUserLimits(users[row.email], {rpm: 40, chatPerDay: 20}, {updatedBy: app.store.ownerUserId()});
  }
  const base = await listen(app);
  return {dir, app, base, users};
}

async function closeApp(ctx) {
  if (ctx?.app?.server.listening) await ctx.app.close();
  else ctx?.app?.store.close();
  if (ctx?.dir) rmSync(ctx.dir, {recursive: true, force: true});
}

test('defaults, envInt and 429 copy are es-AR', () => {
  assert.equal(DEFAULT_AI_GLOBAL_SLOTS, 2);
  assert.equal(envInt('NO_SUCH', 2, {min: 1, max: 8}), 2);
  assert.equal(resolveInt(3, 'NO_SUCH', 2, {min: 1, max: 8}), 3);
  assert.equal(resolveInt(99, 'NO_SUCH', 2, {min: 1, max: 8}), 2);
  const userErr = aiBusyError('user');
  const globErr = aiBusyError('global');
  assert.equal(userErr.status, 429);
  assert.equal(userErr.code, 'ai_busy_user');
  assert.equal(userErr.message, AI_BUSY_USER);
  assert.equal(globErr.code, 'ai_busy');
  assert.equal(globErr.message, AI_BUSY_GLOBAL);
  assert.equal(friendlyApiError(userErr, {superadmin: false}), AI_BUSY_USER);
});

test('semaphore limits global and per user under concurrency; releases on throw', async () => {
  const lock = createAiSemaphore({globalSlots: 2, perUserSlots: 1});
  const held = [lock.tryAcquire('a'), lock.tryAcquire('b')];
  assert.equal(held.every(h => h.ok), true);
  assert.equal(lock.tryAcquire('c').reason, 'global');
  assert.equal(lock.tryAcquire('a').reason, 'user');
  lock.release(held[0]);
  assert.equal(lock.tryAcquire('c').ok, true);
  assert.equal(lock.snapshot().globalUsed, 2);

  const one = createAiSemaphore({globalSlots: 2, perUserSlots: 1});
  await assert.rejects(() => one.withSlot('u', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(one.snapshot().globalUsed, 0);
  assert.equal(one.snapshot().users.u, undefined);
  const ok = await one.withSlot('u', async () => 'yes');
  assert.equal(ok, 'yes');
  assert.equal(one.snapshot().globalUsed, 0);

  const raced = createAiSemaphore({globalSlots: 2, perUserSlots: 1});
  const results = await Promise.all(Array.from({length: 6}, (_, i) =>
    raced.withSlot(`u${i}`, async () => {
      await new Promise(resolve => setTimeout(resolve, 15));
      return 'ok';
    }).then(() => 'ok', err => err.code),
  ));
  assert.equal(results.filter(row => row === 'ok').length, 2);
  assert.equal(results.filter(row => row === 'ai_busy').length, 4);
  assert.equal(raced.snapshot().globalUsed, 0);

  const same = createAiSemaphore({globalSlots: 2, perUserSlots: 1});
  const pair = await Promise.allSettled([
    same.withSlot('x', () => new Promise(resolve => setTimeout(resolve, 20))),
    same.withSlot('x', () => new Promise(resolve => setTimeout(resolve, 20))),
  ]);
  const codes = pair.map(row => row.status === 'fulfilled' ? 'ok' : row.reason.code);
  assert.deepEqual(codes.sort(), ['ai_busy_user', 'ok']);
  assert.equal(same.snapshot().globalUsed, 0);
});

test('lease timeout force-releases hung slots without double-free', () => {
  let t = 1_000;
  const lock = createAiSemaphore({globalSlots: 1, perUserSlots: 1, leaseMs: 50, now: () => t});
  const first = lock.acquireOrThrow('u');
  t += 51;
  const second = lock.acquireOrThrow('u');
  assert.equal(second.ok, true);
  lock.release(first);
  assert.equal(lock.snapshot().globalUsed, 1);
  lock.release(second);
  assert.equal(lock.snapshot().globalUsed, 0);
});

test('HTTP: same user 429 while busy; slot released after throw; two users in parallel', async () => {
  const gated = gatedFetcher();
  const ctx = await startApp({
    fetcher: gated.fetcher,
    aiConcurrency: 2,
    extraUsers: [
      {email: USER_B_EMAIL, password: USER_B_PASSWORD},
      {email: USER_C_EMAIL, password: USER_C_PASSWORD},
    ],
  });
  try {
    const {app, base, users} = ctx;
    putChat(app, users[USER_B_EMAIL], 'b1');
    putChat(app, users[USER_B_EMAIL], 'b2');
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const first = jsonReq(base, '/api/chats/b1/messages', {
      method: 'POST', headers: headersB, body: {message: 'uno'},
    });
    await waitUntil(() => gated.entered() >= 1);
    const busy = await jsonReq(base, '/api/chats/b2/messages', {
      method: 'POST', headers: headersB, body: {message: 'dos'},
    });
    assert.equal(busy.status, 429);
    assert.equal(busy.data.code, 'ai_busy_user');
    assert.equal(busy.data.error, AI_BUSY_USER);
    assert.equal(busy.retryAfter, '5');
    assert.equal(JSON.stringify(busy.data).includes('sk-test'), false);
    gated.release();
    assert.equal((await first).status, 200);
    assert.equal(app.aiLock.snapshot().globalUsed, 0);
  } finally {
    await closeApp(ctx);
  }
});

test('HTTP: two users share N=2; a third gets global 429; throw releases the slot', async () => {
  let failOnce = true;
  let entered = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ctx = await startApp({
    aiConcurrency: 2,
    extraUsers: [
      {email: USER_B_EMAIL, password: USER_B_PASSWORD},
      {email: USER_C_EMAIL, password: USER_C_PASSWORD},
      {email: USER_D_EMAIL, password: USER_D_PASSWORD},
    ],
    fetcher: async () => {
      entered += 1;
      await gate;
      if (failOnce) {
        failOnce = false;
        throw Object.assign(new Error('El proveedor falló.'), {status: 502});
      }
      return chatOk();
    },
  });
  try {
    const {app, base, users} = ctx;
    putChat(app, users[USER_B_EMAIL], 'b');
    putChat(app, users[USER_C_EMAIL], 'c');
    putChat(app, users[USER_D_EMAIL], 'd');
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const headersC = await login(base, USER_C_EMAIL, USER_C_PASSWORD);
    const headersD = await login(base, USER_D_EMAIL, USER_D_PASSWORD);
    const pB = jsonReq(base, '/api/chats/b/messages', {method: 'POST', headers: headersB, body: {message: 'b'}});
    const pC = jsonReq(base, '/api/chats/c/messages', {method: 'POST', headers: headersC, body: {message: 'c'}});
    await waitUntil(() => entered >= 2);
    const d = await jsonReq(base, '/api/chats/d/messages', {
      method: 'POST', headers: headersD, body: {message: 'd'},
    });
    assert.equal(d.status, 429);
    assert.equal(d.data.code, 'ai_busy');
    assert.equal(d.data.error, AI_BUSY_GLOBAL);
    release();
    const b = await pB;
    const c = await pC;
    const statuses = [b.status, c.status].sort();
    assert.deepEqual(statuses, [200, 502]);
    assert.equal(app.aiLock.snapshot().globalUsed, 0);
    const retry = await jsonReq(base, '/api/chats/d/messages', {
      method: 'POST', headers: headersD, body: {message: 'd-ok'},
    });
    assert.equal(retry.status, 200, JSON.stringify(retry.data));
  } finally {
    await closeApp(ctx);
  }
});
