import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createApp} from '../server.mjs';
import {askOpenAI} from '../lib/ai.mjs';
import {research} from '../lib/news.mjs';
import {createTake, templates} from '../lib/engine.mjs';
import {DEFAULT_AGENT_INSTRUCTIONS, SAMPLE_THESIS} from '../lib/agent-prompt.mjs';
import {hashPassword} from '../lib/password.mjs';
import {ROLE_FORBIDDEN} from '../lib/route-scope.mjs';
import {
  estimateCostMicro, tokenCounts, dayInBuenosAires, KNOWN_MODEL_IDS, USAGE_TIMEZONE,
} from '../lib/usage.mjs';

const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_B_EMAIL = 'b@example.test';
const USER_B_PASSWORD = 'user-b-password-12';
const ADMIN_KEY = 'k'.repeat(32);

function tmp() {
  return mkdtempSync(join(tmpdir(), 'usage-'));
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
  return {status: res.status, data};
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

function researchFetcher() {
  return async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.tools) {
      return {
        ok: true,
        json: async () => ({
          status: 'completed',
          output: [{
            type: 'web_search_call',
            action: {sources: [{url: 'https://example.test/a', title: 'A'}]},
            content: [{type: 'output_text', text: 'informe'}],
          }],
          usage: {input_tokens: 20, output_tokens: 5},
        }),
      };
    }
    const analysis = {
      summary: 'Sin cambio material.',
      attention: 'track',
      reason: 'La evidencia no altera la tesis.',
      resolved: false,
      sourceIds: [1],
      events: [{
        title: 'Hecho', fact: 'Dato', interpretation: 'Lectura', uncertainty: 'Límite',
        affected: 'Cartera', publishedAt: null, sourceIds: [1],
      }],
    };
    return {
      ok: true,
      json: async () => ({
        status: 'completed',
        output: [{content: [{type: 'output_text', text: JSON.stringify(analysis)}]}],
        usage: {input_tokens: 8, output_tokens: 3},
      }),
    };
  };
}

test('tokenCounts maps Responses usage and estimateCostMicro uses config rates', () => {
  assert.deepEqual(tokenCounts({input_tokens: 1000, output_tokens: 500}), {promptTokens: 1000, completionTokens: 500});
  assert.deepEqual(tokenCounts({prompt_tokens: 3, completion_tokens: 7}), {promptTokens: 3, completionTokens: 7});
  assert.equal(estimateCostMicro(1000, 500, {promptUsdPerMTok: 0.25, completionUsdPerMTok: 2}), 1250);
  assert.equal(estimateCostMicro(1000, 500, {promptUsdPerMTok: null, completionUsdPerMTok: null}), 0);
  assert.equal(estimateCostMicro(100, 20, null), 0);
  assert.match(dayInBuenosAires(new Date('2026-10-19T03:30:00.000Z')), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(USAGE_TIMEZONE, 'America/Buenos_Aires');
});

test('user_usage stays isolated between two users while consumption stays global', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const ownerId = store.ownerUserId();
    const otherId = store.createUser({email: USER_B_EMAIL, passwordHash: hashPassword(USER_B_PASSWORD)});
    store.setModelPrices({
      models: {'gpt-5-mini': {promptUsdPerMTok: 0.25, completionUsdPerMTok: 2}},
    });
    store.recordUserUsage({userId: ownerId, kind: 'chat', usage: {input_tokens: 1000, output_tokens: 500}, model: 'gpt-5-mini'});
    store.recordUserUsage({userId: otherId, kind: 'chat', usage: {input_tokens: 40, output_tokens: 10}, model: 'gpt-5-mini'});
    store.tokens('chat', {input_tokens: 1000, output_tokens: 500}, 0);
    store.tokens('chat', {input_tokens: 40, output_tokens: 10}, 0);

    const owner = store.db.prepare('SELECT * FROM user_usage WHERE user_id=? AND kind=?').get(ownerId, 'chat');
    const other = store.db.prepare('SELECT * FROM user_usage WHERE user_id=? AND kind=?').get(otherId, 'chat');
    assert.equal(owner.calls, 1);
    assert.equal(owner.prompt_tokens, 1000);
    assert.equal(owner.completion_tokens, 500);
    assert.equal(owner.est_cost_micro, 1250);
    assert.equal(other.calls, 1);
    assert.equal(other.prompt_tokens, 40);
    assert.equal(other.completion_tokens, 10);
    assert.equal(other.est_cost_micro, 30);
    assert.equal(owner.day, other.day);
    assert.equal(owner.day, dayInBuenosAires());

    const global = store.usage().find(row => row.kind === 'chat');
    assert.equal(global.input_tokens, 1040);
    assert.equal(global.output_tokens, 510);

    const listed = store.listUserUsage({userId: ownerId, from: owner.day, to: owner.day});
    assert.equal(listed.rows.length, 1);
    assert.equal(listed.rows[0].userId, ownerId);
    assert.equal(listed.rows.some(row => row.userId === otherId), false);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('askOpenAI onUsage receives the acting userId; research tags research then review', async () => {
  const metas = [];
  await askOpenAI([{role: 'user', content: 'Armá la propuesta'}], null, {
    apiKey: 'test', model: 'gpt-5-mini', userId: '11111111-1111-4111-8111-111111111111', usageKind: 'chat',
    onUsage: (usage, searches, meta) => metas.push({usage, searches, meta}),
    fetcher: chatFetcher({input_tokens: 12, output_tokens: 20}),
  });
  assert.equal(metas.length, 1);
  assert.equal(metas[0].meta.userId, '11111111-1111-4111-8111-111111111111');
  assert.equal(metas[0].meta.kind, 'chat');
  assert.equal(metas[0].usage.input_tokens, 12);

  const researchMeta = [];
  const digest = {
    windowStart: new Date().toISOString(),
    citedCount: 0,
    feeds: [],
    items: [],
  };
  await research(createTake(templates[0]), {
    apiKey: 'test', model: 'gpt-5-mini', digest,
    userId: '22222222-2222-4222-8222-222222222222',
    onUsage: (usage, searches, meta) => researchMeta.push(meta),
    fetcher: researchFetcher(),
  });
  assert.deepEqual(researchMeta.map(m => m.kind), ['research', 'review']);
  assert.ok(researchMeta.every(m => m.userId === '22222222-2222-4222-8222-222222222222'));
});

test('chat and preview record per-user usage; a regular user cannot read admin usage or prices', async () => {
  const dir = tmp();
  let app;
  try {
    app = createApp({
      dataDir: dir,
      password: OWNER_PASSWORD,
      ownerEmail: OWNER_EMAIL,
      adminKey: ADMIN_KEY,
      apiKey: 'sk-test-not-a-secret-xx',
      port: 0,
      quotesLive: false,
      fetcher: chatFetcher({input_tokens: 100, output_tokens: 20}),
    });
    const userB = app.store.createUser({
      email: USER_B_EMAIL, role: 'user', passwordHash: hashPassword(USER_B_PASSWORD),
    });
    app.store.setModelPrices({
      models: {'gpt-5-mini': {promptUsdPerMTok: 1, completionUsdPerMTok: 2}},
    });
    const owner = app.store.forUser(app.store.ownerUserId());
    const other = app.store.forUser(userB);
    owner.putChat({id: 'chat-a', title: 'A', messages: [], proposal: null, createdAt: new Date().toISOString()});
    other.putChat({id: 'chat-b', title: 'B', messages: [], proposal: null, createdAt: new Date().toISOString()});

    const base = await listen(app);
    const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);

    const chatA = await jsonReq(base, '/api/chats/chat-a/messages', {
      method: 'POST', headers: headersA, body: {message: 'hola desde A'},
    });
    assert.equal(chatA.status, 200, JSON.stringify(chatA.data));
    const chatB = await jsonReq(base, '/api/chats/chat-b/messages', {
      method: 'POST', headers: headersB, body: {message: 'hola desde B'},
    });
    assert.equal(chatB.status, 200, JSON.stringify(chatB.data));

    const usageA = app.store.db.prepare('SELECT * FROM user_usage WHERE user_id=? AND kind=?')
      .get(app.store.ownerUserId(), 'chat');
    const usageB = app.store.db.prepare('SELECT * FROM user_usage WHERE user_id=? AND kind=?').get(userB, 'chat');
    assert.equal(usageA.calls, 1);
    assert.equal(usageA.prompt_tokens, 100);
    assert.equal(usageB.calls, 1);
    assert.equal(usageB.prompt_tokens, 100);
    assert.equal(usageA.user_id === usageB.user_id, false);
    const global = app.store.usage().find(row => row.kind === 'chat');
    assert.equal(global.input_tokens, 200);
    assert.equal(global.calls, 2);

    const forbiddenUsage = await jsonReq(base, '/api/admin/usage', {headers: headersB});
    assert.equal(forbiddenUsage.status, 403);
    assert.equal(forbiddenUsage.data.error, ROLE_FORBIDDEN);
    const forbiddenPrices = await jsonReq(base, '/api/admin/model-prices', {headers: headersB});
    assert.equal(forbiddenPrices.status, 403);
    const forbiddenPut = await jsonReq(base, '/api/admin/model-prices', {
      method: 'PUT', headers: headersB, body: {models: {'gpt-5-mini': {promptUsdPerMTok: 9, completionUsdPerMTok: 9}}},
    });
    assert.equal(forbiddenPut.status, 403);

    const locked = await jsonReq(base, '/api/admin/usage', {headers: headersA});
    assert.equal(locked.status, 401);

    const admin = await adminHeaders(base, headersA);
    const listed = await jsonReq(base, '/api/admin/usage', {headers: admin});
    assert.equal(listed.status, 200);
    const rows = listed.data.rows;
    assert.equal(rows.filter(r => r.kind === 'chat').length, 2);
    assert.equal(rows.some(r => r.userId === userB && r.kind === 'chat'), true);
    assert.equal(JSON.stringify(listed.data).includes(OWNER_PASSWORD), false);
    assert.equal(JSON.stringify(listed.data).includes('sk-test-not-a-secret-xx'), false);

    const prices = await jsonReq(base, '/api/admin/model-prices', {headers: admin});
    assert.equal(prices.status, 200);
    assert.equal(KNOWN_MODEL_IDS[0] in prices.data.models, true);
    assert.equal(listed.data.timezone, USAGE_TIMEZONE);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('preview records kind=preview for the acting superadmin and consumption still uses chat', async () => {
  const dir = tmp();
  let app;
  try {
    app = createApp({
      dataDir: dir,
      password: OWNER_PASSWORD,
      ownerEmail: OWNER_EMAIL,
      adminKey: ADMIN_KEY,
      apiKey: 'sk-test-not-a-secret-xx',
      port: 0,
      quotesLive: false,
      fetcher: chatFetcher({input_tokens: 15, output_tokens: 5}),
    });
    const base = await listen(app);
    const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const admin = await adminHeaders(base, headersA);
    const preview = await jsonReq(base, '/api/admin/agent-prompt/preview', {
      method: 'POST',
      headers: admin,
      body: {body: DEFAULT_AGENT_INSTRUCTIONS, sampleId: 'vaca', thesis: SAMPLE_THESIS.vaca},
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    const row = app.store.db.prepare('SELECT * FROM user_usage WHERE kind=?').get('preview');
    assert.equal(row.user_id, app.store.ownerUserId());
    assert.equal(row.prompt_tokens, 15);
    assert.equal(row.calls, 1);
    const chatUsage = app.store.db.prepare('SELECT * FROM user_usage WHERE kind=?').get('chat');
    assert.equal(chatUsage, undefined);
    const global = app.store.usage().find(r => r.kind === 'chat');
    assert.equal(global.input_tokens, 15);
    assert.equal(global.calls, 1);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('PUT model-prices is superadmin-only and does not invent billed rates', async () => {
  const dir = tmp();
  let app;
  try {
    app = createApp({
      dataDir: dir, password: OWNER_PASSWORD, ownerEmail: OWNER_EMAIL,
      adminKey: ADMIN_KEY, apiKey: 'sk-test', port: 0, quotesLive: false, fetcher: chatFetcher(),
    });
    const userB = app.store.createUser({
      email: USER_B_EMAIL, role: 'user', passwordHash: hashPassword(USER_B_PASSWORD),
    });
    void userB;
    const base = await listen(app);
    const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const admin = await adminHeaders(base, headersA);
    const seeded = await jsonReq(base, '/api/admin/model-prices', {headers: admin});
    assert.equal(seeded.data.models['gpt-5-mini'].promptUsdPerMTok, null);
    const saved = await jsonReq(base, '/api/admin/model-prices', {
      method: 'PUT', headers: admin,
      body: {models: {'gpt-5-mini': {promptUsdPerMTok: 0.25, completionUsdPerMTok: 2}}},
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.models['gpt-5-mini'].promptUsdPerMTok, 0.25);
    const asUser = await jsonReq(base, '/api/admin/model-prices', {
      method: 'PUT', headers: headersB,
      body: {models: {'gpt-5-mini': {promptUsdPerMTok: 99, completionUsdPerMTok: 99}}},
    });
    assert.equal(asUser.status, 403);
    assert.equal(app.store.modelPrices().models['gpt-5-mini'].promptUsdPerMTok, 0.25);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
