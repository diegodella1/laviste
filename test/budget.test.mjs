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
import {DEFAULT_AGENT_INSTRUCTIONS, SAMPLE_THESIS} from '../lib/agent-prompt.mjs';
import {
  DEFAULT_MONTHLY_CAP_USD, deriveBudgetState, estimateCallCostMicro, pricesAreLoaded,
  usdToMicro,
} from '../lib/budget.mjs';
import {dayInBuenosAires, defaultModelPrices} from '../lib/usage.mjs';
import {
  AI_PAUSED_USER, AI_PAUSED_DISABLED_ADMIN, AI_PRICES_MISSING, friendlyApiError,
} from '../public/copy.mjs';

const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_B_EMAIL = 'b@example.test';
const USER_B_PASSWORD = 'user-b-password-12';
const ADMIN_KEY = 'k'.repeat(32);

function tmp() {
  return mkdtempSync(join(tmpdir(), 'budget-'));
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

function seedSpend(store, userId, micro, {day} = {}) {
  const d = day || dayInBuenosAires();
  store.db.prepare(`INSERT INTO user_usage(user_id, day, kind, calls, prompt_tokens, completion_tokens, est_cost_micro)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id, day, kind) DO UPDATE SET
      est_cost_micro=est_cost_micro+excluded.est_cost_micro,
      calls=calls+excluded.calls`).run(userId, d, 'chat', 1, 0, 0, micro);
}

function loadPrices(store) {
  store.setModelPrices({
    models: {'gpt-5-mini': {promptUsdPerMTok: 1, completionUsdPerMTok: 1}},
  });
}

test('defaults, null prices and 79/80/100 ratios are documented in code', () => {
  assert.equal(DEFAULT_MONTHLY_CAP_USD, 20);
  assert.equal(pricesAreLoaded(defaultModelPrices()), false);
  assert.equal(estimateCallCostMicro({kind: 'chat', model: 'gpt-5-mini', prices: defaultModelPrices()}), 0);
  const cap = usdToMicro(20);
  const at79 = deriveBudgetState({
    enabled: true, monthlyCapUsd: 20, spentMonthMicro: Math.round(cap * 0.79),
    pricesLoaded: true,
  });
  const at80 = deriveBudgetState({
    enabled: true, monthlyCapUsd: 20, spentMonthMicro: Math.round(cap * 0.80),
    pricesLoaded: true,
  });
  const at100 = deriveBudgetState({
    enabled: true, monthlyCapUsd: 20, spentMonthMicro: cap, pricesLoaded: true,
  });
  assert.equal(at79.paused, false);
  assert.equal(at79.alert80, false);
  assert.equal(at80.paused, false);
  assert.equal(at80.alert80Month, true);
  assert.equal(at100.paused, true);
  assert.equal(at100.pauseReason, 'budget_month');
  const unpriced = deriveBudgetState({
    enabled: true, monthlyCapUsd: 20, spentMonthMicro: cap * 3, pricesLoaded: false,
  });
  assert.equal(unpriced.paused, false);
  assert.equal(unpriced.alert80, false);
});

test('null prices keep AI allowed; huge est_cost does not trip the cap', async () => {
  const ctx = await startApp({
    extraUsers: [{email: USER_B_EMAIL, password: USER_B_PASSWORD}],
  });
  try {
    const {app, base, users} = ctx;
    const userB = users[USER_B_EMAIL];
    seedSpend(app.store, userB, usdToMicro(500));
    assert.equal(app.store.isAiPaused(), false);
    assert.equal(app.store.budgetState().pricesLoaded, false);
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const chatId = putChat(app, userB);
    const sent = await jsonReq(base, `/api/chats/${chatId}/messages`, {
      method: 'POST', headers: headersB, body: {message: 'Hola tesis de Vaca Muerta para practicar.'},
    });
    assert.equal(sent.status, 200, JSON.stringify(sent.data));
    const stateA = await jsonReq(base, '/api/state', {
      headers: await login(base, OWNER_EMAIL, OWNER_PASSWORD),
    });
    assert.equal(stateA.data.ai.warningPrices, true);
    assert.equal(stateA.data.ai.paused, false);
    const stateB = await jsonReq(base, '/api/state', {headers: headersB});
    assert.equal(stateB.data.ai.paused, false);
    assert.equal(stateB.data.ai.spentMonthUsd, undefined);
  } finally {
    await closeApp(ctx);
  }
});

test('kill switch blocks chat, preview, openai test and review before reserve', async () => {
  let researchCalls = 0;
  const ctx = await startApp({
    extraUsers: [{email: USER_B_EMAIL, password: USER_B_PASSWORD}],
    researcher: async () => {
      researchCalls += 1;
      throw new Error('should not research');
    },
  });
  try {
    const {app, base, users} = ctx;
    const userB = users[USER_B_EMAIL];
    app.store.setAiControl({enabled: false}, {updatedBy: app.store.ownerUserId()});
    assert.equal(app.store.isAiPaused(), true);
    assert.equal(app.store.budgetState().pauseReason, 'disabled');

    const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const admin = await adminHeaders(base, headersA);
    const chatId = putChat(app, userB);
    const chat = await jsonReq(base, `/api/chats/${chatId}/messages`, {
      method: 'POST', headers: headersB, body: {message: 'Hola tesis de Vaca Muerta para practicar.'},
    });
    assert.equal(chat.status, 503);
    assert.equal(chat.data.code, 'ai_paused');
    assert.equal(app.store.quotaUsed(userB).chat, 0);
    assert.equal(
      friendlyApiError(Object.assign(new Error(chat.data.error), {code: chat.data.code}), {superadmin: false}),
      AI_PAUSED_USER,
    );
    assert.match(chat.data.error, /kill switch|apagada/i);
    assert.equal(JSON.stringify(chat.data).includes('sk-test'), false);

    const preview = await jsonReq(base, '/api/admin/agent-prompt/preview', {
      method: 'POST', headers: admin,
      body: {body: DEFAULT_AGENT_INSTRUCTIONS, sampleId: 'vaca', thesis: SAMPLE_THESIS.vaca},
    });
    assert.equal(preview.status, 503);
    assert.equal(preview.data.code, 'ai_paused');

    const tested = await jsonReq(base, '/api/integrations/openai/test', {
      method: 'POST', headers: admin, body: {target: 'chat'},
    });
    assert.equal(tested.status, 503);
    assert.equal(tested.data.code, 'ai_paused');

    const take = createTake(templates[0]);
    activate(take, 1_024_000);
    take.monitoringPaused = false;
    app.store.forUser(userB).putTake(take);
    const review = await jsonReq(base, `/api/takes/${take.id}/review`, {
      method: 'POST', headers: headersB, body: {},
    });
    assert.equal(review.status, 503);
    assert.equal(review.data.code, 'ai_paused');
    await app.scheduler.tick();
    assert.equal(researchCalls, 0);

    const stateB = await jsonReq(base, '/api/state', {headers: headersB});
    assert.equal(stateB.data.ai.paused, true);
    assert.equal(stateB.data.ai.pauseReason, undefined);
  } finally {
    await closeApp(ctx);
  }
});

test('budget 79/80/100% with prices loaded; 80% audits once; 100% is 503', async () => {
  const ctx = await startApp({
    extraUsers: [{email: USER_B_EMAIL, password: USER_B_PASSWORD}],
  });
  try {
    const {app, base, users} = ctx;
    const userB = users[USER_B_EMAIL];
    loadPrices(app.store);
    const cap = usdToMicro(20);
    const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const admin = await adminHeaders(base, headersA);

    seedSpend(app.store, userB, Math.round(cap * 0.79));
    const at79 = await jsonReq(base, '/api/admin/ai', {headers: admin});
    assert.equal(at79.status, 200);
    assert.equal(at79.data.paused, false);
    assert.equal(at79.data.alert80, false);
    assert.equal(app.store.listAuditLog({action: 'ai.budget.80'}).length, 0);
    const chatId = putChat(app, userB);
    const ok = await jsonReq(base, `/api/chats/${chatId}/messages`, {
      method: 'POST', headers: headersB, body: {message: 'Hola tesis de Vaca Muerta para practicar.'},
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));

    seedSpend(app.store, userB, Math.round(cap * 0.80) - Math.round(cap * 0.79));
    const at80 = await jsonReq(base, '/api/admin/ai', {headers: admin});
    assert.equal(at80.data.alert80, true);
    assert.equal(at80.data.paused, false);
    const alerts = app.store.listAuditLog({action: 'ai.budget.80'});
    assert.equal(alerts.length, 1);
    await jsonReq(base, '/api/admin/ai', {headers: admin});
    assert.equal(app.store.listAuditLog({action: 'ai.budget.80'}).length, 1);

    seedSpend(app.store, userB, cap);
    const blocked = await jsonReq(base, `/api/chats/${chatId}/messages`, {
      method: 'POST', headers: headersB, body: {message: 'Otro mensaje de tesis para el tope.'},
    });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.data.code, 'ai_paused');
    assert.equal(app.store.quotaUsed(userB).chat, 1);
    assert.equal(
      friendlyApiError(Object.assign(new Error(blocked.data.error), {code: 'ai_paused'}), {superadmin: false}),
      AI_PAUSED_USER,
    );
    const adminState = await jsonReq(base, '/api/state', {headers: headersA});
    assert.equal(adminState.data.ai.paused, true);
    assert.equal(adminState.data.ai.pauseReason, 'budget_month');
    assert.ok(adminState.data.ai.spentMonthUsd >= 20);
  } finally {
    await closeApp(ctx);
  }
});

test('pre-call estimate blocks a call that would cross 100%', async () => {
  const ctx = await startApp({
    extraUsers: [{email: USER_B_EMAIL, password: USER_B_PASSWORD}],
  });
  try {
    const {app, base, users} = ctx;
    const userB = users[USER_B_EMAIL];
    loadPrices(app.store);
    const cap = usdToMicro(20);
    seedSpend(app.store, userB, cap - 1);
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const chatId = putChat(app, userB);
    const blocked = await jsonReq(base, `/api/chats/${chatId}/messages`, {
      method: 'POST', headers: headersB, body: {message: 'Hola tesis de Vaca Muerta para practicar.'},
    });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.data.code, 'ai_paused');
    assert.equal(app.store.quotaUsed(userB).chat, 0);
  } finally {
    await closeApp(ctx);
  }
});

test('superadmin-only AI controls; user gets 403; changes go to audit_log', async () => {
  const ctx = await startApp({
    extraUsers: [{email: USER_B_EMAIL, password: USER_B_PASSWORD}],
  });
  try {
    const {app, base} = ctx;
    const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const forbiddenGet = await jsonReq(base, '/api/admin/ai', {headers: headersB});
    assert.equal(forbiddenGet.status, 403);
    assert.equal(forbiddenGet.data.error, ROLE_FORBIDDEN);
    const forbiddenPut = await jsonReq(base, '/api/admin/ai', {
      method: 'PUT', headers: headersB, body: {enabled: false},
    });
    assert.equal(forbiddenPut.status, 403);
    assert.equal(app.store.aiControl().enabled, true);

    const locked = await jsonReq(base, '/api/admin/ai', {headers: headersA});
    assert.equal(locked.status, 401);

    const admin = await adminHeaders(base, headersA);
    const listed = await jsonReq(base, '/api/admin/ai', {headers: admin});
    assert.equal(listed.status, 200);
    assert.equal(listed.data.enabled, true);
    assert.equal(listed.data.monthlyCapUsd, 20);
    assert.equal(listed.data.warningPrices, true);
    assert.match(listed.data.userCopy, /pausa/);
    assert.equal(JSON.stringify(listed.data).includes(OWNER_PASSWORD), false);
    assert.equal(JSON.stringify(listed.data).includes('sk-test-not-a-secret-xx'), false);

    const saved = await jsonReq(base, '/api/admin/ai', {
      method: 'PUT', headers: admin,
      body: {enabled: false, monthlyCapUsd: 15, dailyCapUsd: 2},
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.enabled, false);
    assert.equal(saved.data.monthlyCapUsd, 15);
    assert.equal(saved.data.dailyCapUsd, 2);
    const enabledLogs = app.store.listAuditLog({action: 'ai.enabled'});
    const capLogs = app.store.listAuditLog({action: 'ai.caps'});
    assert.equal(enabledLogs.length >= 1, true);
    assert.equal(capLogs.length >= 1, true);
    assert.equal(enabledLogs[0].meta.enabled, false);
    assert.equal(JSON.stringify(enabledLogs).includes(OWNER_PASSWORD), false);

    const on = await jsonReq(base, '/api/admin/ai', {
      method: 'PUT', headers: admin, body: {enabled: true},
    });
    assert.equal(on.data.enabled, true);
    assert.equal(friendlyApiError(Object.assign(new Error(AI_PAUSED_DISABLED_ADMIN), {code: 'ai_paused'}), {superadmin: true}), AI_PAUSED_DISABLED_ADMIN);
    assert.equal(AI_PRICES_MISSING.includes('Precios sin cargar'), true);
  } finally {
    await closeApp(ctx);
  }
});

test('optional daily cap pauses independently of the monthly cap', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
    loadPrices(store);
    store.setAiControl({dailyCapUsd: 1, monthlyCapUsd: 20});
    const userId = store.createUser({email: USER_B_EMAIL, passwordHash: hashPassword(USER_B_PASSWORD)});
    seedSpend(store, userId, usdToMicro(1));
    const state = store.budgetState();
    assert.equal(state.paused, true);
    assert.equal(state.pauseReason, 'budget_day');
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
