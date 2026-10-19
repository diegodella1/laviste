import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createApp} from '../server.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {hashPassword} from '../lib/password.mjs';
import {ROLE_FORBIDDEN} from '../lib/route-scope.mjs';
import {
  DEFAULT_LIMITS, CHAT_SIZE_CAP, TOKEN_RESERVE_UNITS, SUPERADMIN_EXEMPT,
} from '../lib/quota.mjs';
import {USAGE_TIMEZONE, dayInBuenosAires} from '../lib/usage.mjs';
import {
  QUOTA_CHAT, QUOTA_NEWS, QUOTA_TOKENS, QUOTA_TOKENS_USER, QUOTA_MONITORED, QUOTA_RATE,
  friendlyApiError,
} from '../public/copy.mjs';

const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_B_EMAIL = 'b@example.test';
const USER_B_PASSWORD = 'user-b-password-12';
const USER_C_EMAIL = 'c@example.test';
const USER_C_PASSWORD = 'user-c-password-12';
const ADMIN_KEY = 'k'.repeat(32);

function tmp() {
  return mkdtempSync(join(tmpdir(), 'quota-'));
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

async function adminHeaders(base, sessionHeaders) {
  const res = await fetch(base + '/api/admin/login', {
    method: 'POST',
    headers: sessionHeaders,
    body: JSON.stringify({key: ADMIN_KEY}),
  });
  assert.equal(res.status, 200, await res.text());
  return {
    Cookie: `${sessionHeaders.Cookie}; ${cookiePair(res)}`,
    'Content-Type': 'application/json',
  };
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
  return {status: res.status, data, headers: res.headers, retryAfter: res.headers.get('retry-after')};
}

function chatFetcher(usage = {input_tokens: 10, output_tokens: 4}) {
  return async () => ({
    ok: true,
    json: async () => ({
      status: 'completed',
      output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({message: 'Listo', proposal: templates[0]})}]}],
      usage,
    }),
  });
}

function failingThenOkFetcher() {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls === 1) return {ok: false, status: 500};
    return {
      ok: true,
      json: async () => ({
        status: 'completed',
        output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({message: 'Listo', proposal: templates[0]})}]}],
        usage: {input_tokens: 8, output_tokens: 2},
      }),
    };
  };
}

async function startApp({fetcher = chatFetcher(), extraUsers = [], researcher} = {}) {
  const dir = tmp();
  const app = createApp({
    dataDir: dir,
    password: OWNER_PASSWORD,
    ownerEmail: OWNER_EMAIL,
    adminKey: ADMIN_KEY,
    apiKey: 'sk-test-not-a-secret-xx',
    port: 0,
    quotesLive: false,
    fetcher,
    ...(researcher ? {researcher} : {}),
  });
  const users = {};
  for (const row of extraUsers) {
    users[row.email] = app.store.createUser({
      email: row.email, role: row.role || 'user', passwordHash: hashPassword(row.password),
    });
    if (row.limits) app.store.setUserLimits(users[row.email], row.limits, {updatedBy: app.store.ownerUserId()});
  }
  const base = await listen(app);
  return {dir, app, base, users};
}

async function closeApp(ctx) {
  if (ctx?.app?.server.listening) await ctx.app.close();
  else ctx?.app?.store.close();
  if (ctx?.dir) rmSync(ctx.dir, {recursive: true, force: true});
}

function putChat(app, userId, id = 'chat-1') {
  app.store.forUser(userId).putChat({
    id, title: 'A', messages: [], proposal: null, createdAt: new Date().toISOString(),
  });
  return id;
}

test('defaults, timezone and superadmin exemption are documented in code', () => {
  assert.equal(DEFAULT_LIMITS.chatPerDay, 20);
  assert.equal(DEFAULT_LIMITS.newsPerDay, 5);
  assert.equal(DEFAULT_LIMITS.tokensPerDay, 100_000);
  assert.equal(DEFAULT_LIMITS.monitoredTakes, 3);
  assert.equal(DEFAULT_LIMITS.rpm, 10);
  assert.equal(CHAT_SIZE_CAP, 100);
  assert.equal(TOKEN_RESERVE_UNITS, 4000);
  assert.equal(SUPERADMIN_EXEMPT, true);
  assert.equal(USAGE_TIMEZONE, 'America/Buenos_Aires');
  assert.match(dayInBuenosAires(), /^\d{4}-\d{2}-\d{2}$/);
});

test('reserve is atomic: parallel calls accept exactly the limit', async () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const userId = store.createUser({email: USER_B_EMAIL, passwordHash: hashPassword(USER_B_PASSWORD)});
    const limit = 11;
    const attempts = 50;
    const results = await Promise.all(Array.from({length: attempts}, () =>
      Promise.resolve(store.reserveUser(userId, 'chat', 1, limit)),
    ));
    assert.equal(results.filter(Boolean).length, limit);
    assert.equal(store.quotaUsed(userId).chat, limit);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('each quota kind, A/B isolation, 429 shape, release on failure', async () => {
  const fetcher = failingThenOkFetcher();
  const ctx = await startApp({
    fetcher,
    extraUsers: [
      {email: USER_B_EMAIL, password: USER_B_PASSWORD, limits: {chatPerDay: 1, newsPerDay: 1, tokensPerDay: 100_000, monitoredTakes: 3, rpm: 30}},
      {email: USER_C_EMAIL, password: USER_C_PASSWORD},
    ],
  });
  try {
    const {app, base, users} = ctx;
    const userB = users[USER_B_EMAIL];
    const userC = users[USER_C_EMAIL];
    putChat(app, userB, 'chat-b');
    putChat(app, userC, 'chat-c');
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const headersC = await login(base, USER_C_EMAIL, USER_C_PASSWORD);

    const fail = await jsonReq(base, '/api/chats/chat-b/messages', {
      method: 'POST', headers: headersB, body: {message: 'primer intento'},
    });
    assert.equal(fail.status, 502, JSON.stringify(fail.data));
    assert.equal(app.store.quotaUsed(userB).chat, 0, 'failed AI must release the chat reserve');

    const ok = await jsonReq(base, '/api/chats/chat-b/messages', {
      method: 'POST', headers: headersB, body: {message: 'segundo intento'},
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(app.store.quotaUsed(userB).chat, 1);

    const blocked = await jsonReq(base, '/api/chats/chat-b/messages', {
      method: 'POST', headers: headersB, body: {message: 'tercero'},
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.data.code, 'quota_chat');
    assert.equal(blocked.data.error, QUOTA_CHAT);
    assert.match(blocked.retryAfter || '', /^\d+$/);
    assert.match(blocked.data.resetAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(JSON.stringify(blocked.data).includes('user_quota'), false);
    assert.equal(JSON.stringify(blocked.data).includes(OWNER_PASSWORD), false);
    assert.equal(friendlyApiError(Object.assign(new Error(blocked.data.error), {code: blocked.data.code}), {superadmin: false}), QUOTA_CHAT);

    const stillC = await jsonReq(base, '/api/chats/chat-c/messages', {
      method: 'POST', headers: headersC, body: {message: 'hola desde C'},
    });
    assert.equal(stillC.status, 200, JSON.stringify(stillC.data));
    assert.equal(app.store.quotaUsed(userC).chat, 1);

    app.store.setUserLimits(userB, {tokensPerDay: 10, chatPerDay: 20}, {updatedBy: app.store.ownerUserId()});
    const tokenHit = await jsonReq(base, '/api/chats/chat-b/messages', {
      method: 'POST', headers: headersB, body: {message: 'tokens'},
    });
    assert.equal(tokenHit.status, 429);
    assert.equal(tokenHit.data.code, 'quota_tokens');
    assert.equal(tokenHit.data.error, QUOTA_TOKENS);
    assert.equal(friendlyApiError(Object.assign(new Error(tokenHit.data.error), {code: 'quota_tokens'}), {superadmin: false}), QUOTA_TOKENS_USER);
    assert.equal(friendlyApiError(Object.assign(new Error(tokenHit.data.error), {code: 'quota_tokens'}), {superadmin: true}), QUOTA_TOKENS);
  } finally {
    await closeApp(ctx);
  }
});

test('news and monitored takes limits; rpm 429', async () => {
  const ctx = await startApp({
    extraUsers: [
      {email: USER_B_EMAIL, password: USER_B_PASSWORD, limits: {newsPerDay: 1, monitoredTakes: 3, rpm: 30, chatPerDay: 20}},
      {email: USER_C_EMAIL, password: USER_C_PASSWORD, limits: {rpm: 1, chatPerDay: 20}},
    ],
    researcher: async take => ({
      id: 'rev-' + take.id, takeId: take.id, version: take.version, at: new Date().toISOString(),
      sources: [{id: 1, url: 'https://example.test/a', title: 'A'}],
      events: [], attention: 'track', summary: 'Sin cambio.', reason: 'Fixture.', resolved: false,
    }),
  });
  try {
    const {app, base, users} = ctx;
    const userB = users[USER_B_EMAIL];
    const scoped = app.store.forUser(userB);
    const takes = [];
    for (let i = 0; i < 3; i++) {
      const take = createTake(templates[i % templates.length]);
      activate(take, 1_024_000);
      take.monitoringPaused = false;
      scoped.putTake(take);
      scoped.version(take);
      takes.push(take);
    }
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const fourth = createTake(templates[0]);
    scoped.putTake(fourth);
    scoped.version(fourth);
    const activateHit = await jsonReq(base, `/api/takes/${fourth.id}/activate`, {
      method: 'POST', headers: headersB, body: {amount: 1_024_000},
    });
    assert.equal(activateHit.status, 429);
    assert.equal(activateHit.data.code, 'quota_monitored');
    assert.equal(activateHit.data.error, QUOTA_MONITORED);
    assert.equal(scoped.take(fourth.id).phase, 'draft');

    const paused = takes[0];
    paused.monitoringPaused = true;
    scoped.putTake(paused);
    const unpauseOk = await jsonReq(base, `/api/takes/${paused.id}/settings`, {
      method: 'POST', headers: headersB,
      body: {cadence: 'standard', mode: 'ask', cap: 25, drift: 5, paused: false, monitoringPaused: false},
    });
    assert.equal(unpauseOk.status, 200, JSON.stringify(unpauseOk.data));

    const review1 = await jsonReq(base, `/api/takes/${takes[1].id}/review`, {
      method: 'POST', headers: headersB, body: {},
    });
    assert.equal(review1.status, 202, JSON.stringify(review1.data));
    await app.scheduler.tick();
    const review2 = await jsonReq(base, `/api/takes/${takes[2].id}/review`, {
      method: 'POST', headers: headersB, body: {},
    });
    assert.equal(review2.status, 429, JSON.stringify(review2.data));
    assert.equal(review2.data.code, 'quota_news');
    assert.equal(review2.data.error, QUOTA_NEWS);

    const headersC = await login(base, USER_C_EMAIL, USER_C_PASSWORD);
    putChat(app, users[USER_C_EMAIL], 'rpm-chat');
    const first = await jsonReq(base, '/api/chats/rpm-chat/messages', {
      method: 'POST', headers: headersC, body: {message: 'uno'},
    });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const rpmHit = await jsonReq(base, '/api/chats/rpm-chat/messages', {
      method: 'POST', headers: headersC, body: {message: 'dos'},
    });
    assert.equal(rpmHit.status, 429);
    assert.equal(rpmHit.data.code, 'rate_limit');
    assert.equal(rpmHit.data.error, QUOTA_RATE);
    assert.match(rpmHit.retryAfter || '', /^\d+$/);
  } finally {
    await closeApp(ctx);
  }
});

test('superadmin override; regular user gets 403', async () => {
  const ctx = await startApp({
    extraUsers: [{email: USER_B_EMAIL, password: USER_B_PASSWORD}],
  });
  try {
    const {app, base, users} = ctx;
    const userB = users[USER_B_EMAIL];
    const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const forbidden = await jsonReq(base, `/api/admin/limits/${userB}`, {
      method: 'PUT', headers: headersB, body: {chatPerDay: 99},
    });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.data.error, ROLE_FORBIDDEN);
    assert.equal(app.store.userLimits(userB), null);

    const locked = await jsonReq(base, '/api/admin/limits', {headers: headersA});
    assert.equal(locked.status, 401);

    const admin = await adminHeaders(base, headersA);
    const listed = await jsonReq(base, '/api/admin/limits', {headers: admin});
    assert.equal(listed.status, 200);
    assert.equal(listed.data.defaults.chatPerDay, 20);
    assert.equal(listed.data.defaults.chatSizeCap, 100);
    assert.equal(listed.data.defaults.superadminExempt, true);
    assert.equal(listed.data.timezone, USAGE_TIMEZONE);
    const rowB = listed.data.users.find(u => u.userId === userB);
    assert.equal(rowB.effective.chatPerDay, 20);
    assert.equal(rowB.exempt, false);
    const ownerRow = listed.data.users.find(u => u.userId === app.store.ownerUserId());
    assert.equal(ownerRow.exempt, true);
    assert.equal(JSON.stringify(listed.data).includes(OWNER_PASSWORD), false);
    assert.equal(JSON.stringify(listed.data).includes('sk-test-not-a-secret-xx'), false);

    const saved = await jsonReq(base, `/api/admin/limits/${userB}`, {
      method: 'PUT', headers: admin, body: {chatPerDay: 4, newsPerDay: null},
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.override.chatPerDay, 4);
    assert.equal(saved.data.effective.chatPerDay, 4);
    assert.equal(saved.data.effective.newsPerDay, 5);
  } finally {
    await closeApp(ctx);
  }
});

test('GET /api/state quota is per user and chat size cap is 100', async () => {
  const ctx = await startApp({
    extraUsers: [{email: USER_B_EMAIL, password: USER_B_PASSWORD, limits: {chatPerDay: 6}}],
  });
  try {
    const {app, base, users} = ctx;
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const state = await jsonReq(base, '/api/state', {headers: headersB});
    assert.equal(state.status, 200);
    assert.equal(state.data.quota.exempt, false);
    assert.equal(state.data.quota.chat.limit, 6);
    assert.equal(state.data.quota.chatSizeCap, 100);
    assert.equal(state.data.quota.timezone, USAGE_TIMEZONE);
    const messages = Array.from({length: 100}, (_, i) => ({role: i % 2 ? 'assistant' : 'user', content: 'x'}));
    app.store.forUser(users[USER_B_EMAIL]).putChat({
      id: 'full', title: 'full', messages, proposal: null, createdAt: new Date().toISOString(),
    });
    const cap = await jsonReq(base, '/api/chats/full/messages', {
      method: 'POST', headers: headersB, body: {message: 'uno más'},
    });
    assert.equal(cap.status, 400);
    assert.equal(cap.data.code, 'chat_size');
  } finally {
    await closeApp(ctx);
  }
});

test('HTTP chat quota stops at the per-user limit (semaphore still serializes one user)', async () => {
  const ctx = await startApp({
    extraUsers: [{email: USER_B_EMAIL, password: USER_B_PASSWORD, limits: {chatPerDay: 2, rpm: 40}}],
  });
  try {
    const {app, base, users} = ctx;
    const userB = users[USER_B_EMAIL];
    putChat(app, userB, 'seq');
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const first = await jsonReq(base, '/api/chats/seq/messages', {
      method: 'POST', headers: headersB, body: {message: 'uno'},
    });
    const second = await jsonReq(base, '/api/chats/seq/messages', {
      method: 'POST', headers: headersB, body: {message: 'dos'},
    });
    const third = await jsonReq(base, '/api/chats/seq/messages', {
      method: 'POST', headers: headersB, body: {message: 'tres'},
    });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(second.status, 200, JSON.stringify(second.data));
    assert.equal(third.status, 429);
    assert.equal(third.data.code, 'quota_chat');
    assert.equal(app.store.quotaUsed(userB).chat, 2);
  } finally {
    await closeApp(ctx);
  }
});
