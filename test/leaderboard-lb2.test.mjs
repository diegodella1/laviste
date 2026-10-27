import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {createStore} from '../lib/store.mjs';
import {hashPassword} from '../lib/password.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {createDailyMarksJob} from '../lib/daily-marks.mjs';
import {
  addIsoDay, asPct, chainReturns, dailyReturn, daysActiveSince, computePublicStats,
  publicHoldings, recomputeAllPublicTakeStats, RANK_MIN_DAYS, RANK_MIN_MARKS,
  twrBetween, windowStartDay,
} from '../lib/leaderboard-stats.mjs';
import {
  assertLeaderboardPayload, collectJsonKeys, getLeaderboardItem, LEADERBOARD_CACHE_CONTROL,
  LEADERBOARD_FORBIDDEN_KEYS, LEADERBOARD_ITEM_FIELDS, LEADERBOARD_PAGE_FIELDS,
  LEADERBOARD_PAGE_SIZE, LEADERBOARD_TOP, listLeaderboard,
} from '../lib/leaderboard.mjs';
import {
  LEADERBOARD_CACHE_TTL_MS, bumpLeaderboardGeneration, resetLeaderboardGeneration,
} from '../lib/leaderboard-cache.mjs';
import {DEFAULT_OWNER_EMAIL} from '../lib/migrations/multiuser.mjs';

const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_B_EMAIL = 'b@example.test';
const USER_B_PASSWORD = 'user-b-password-12';

const FORBIDDEN_SUBSTRINGS = [
  OWNER_EMAIL, USER_B_EMAIL, 'user_id', 'take_id', 'display_name', 'password',
];

function tmp() {
  return mkdtempSync(join(tmpdir(), 'lb2-'));
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
  return {status: res.status, data, headers: res.headers, text};
}

function publicTake(title = 'Tesis pública demo') {
  const take = createTake(templates[0]);
  take.title = title;
  take.thesis = 'texto-publico-sin-correo';
  activate(take, 1_000_000, '2026-08-22T15:00:00.000Z');
  take.monitoringPaused = false;
  take.realPricesAt = '2026-08-22T15:00:00.000Z';
  take.benchmarkId = 'MERV';
  take.benchmarkLabel = 'Índice Merval';
  return take;
}

function seedMarks(scoped, takeId, {
  days = 20, start = '2026-09-01', value0 = 100, invested0 = 100,
  gain = 0.01, aporteOn = null, aporte = 0, eligible = true,
} = {}) {
  let invested = invested0;
  let value = value0;
  for (let i = 0; i < days; i++) {
    const day = addIsoDay(start, i);
    if (aporteOn === day) {
      invested += aporte;
      value += aporte;
    } else if (i > 0) {
      value = value * (1 + gain);
    }
    scoped.upsertDailyMark({
      takeId, day, value, invested,
      benchId: 'MERV', benchPrice: 1000 * ((1 + gain * 0.5) ** i),
      eligible,
    });
  }
}

function assertNoLeaks(payload, extraForbidden = []) {
  assertLeaderboardPayload(payload);
  const dumped = JSON.stringify(payload);
  for (const needle of [...FORBIDDEN_SUBSTRINGS, ...extraForbidden]) {
    assert.equal(dumped.includes(needle), false, `leaked ${needle}`);
  }
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(dumped), false, 'leaked email');
  const keys = collectJsonKeys(payload);
  for (const key of LEADERBOARD_FORBIDDEN_KEYS) {
    assert.equal(keys.has(key), false, `key ${key}`);
  }
}

async function startApp() {
  const dir = tmp();
  resetLeaderboardGeneration();
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
  const takeA = publicTake('Tesis pública demo');
  const takeB = publicTake('Tesis privada de B');
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

test('TWR chains r_d and ignores aportes', () => {
  const marks = [
    {day: '2026-09-01', value: 100, invested: 100},
    {day: '2026-09-02', value: 110, invested: 100},
    {day: '2026-09-03', value: 210, invested: 200},
  ];
  assert.equal(Number(dailyReturn(marks[0], marks[1]).toFixed(10)), 0.1);
  assert.equal(dailyReturn(marks[1], marks[2]), 0);
  assert.equal(Number(chainReturns([0.1, 0]).toFixed(10)), 0.1);
  assert.equal(Number(twrBetween(marks, '2026-09-02', '2026-09-03').toFixed(10)), 0.1);
  assert.equal(asPct(0.1), 10);
  assert.equal(daysActiveSince('2026-08-22T15:00:00.000Z', '2026-09-20'), RANK_MIN_DAYS);
  assert.equal(windowStartDay('2026-09-30'), '2026-09-01');
  const take = publicTake();
  const holdings = publicHoldings(take);
  assert.ok(holdings.length >= 2);
  assert.deepEqual(Object.keys(holdings[0]).sort(), ['ticker', 'weight']);
  const stats = computePublicStats({
    take, alias: 'nodo_sur', marks: marks.map((row, i) => ({...row, eligible: true, bench_price: 1000 + i})),
    now: new Date('2026-09-03T20:35:00.000Z'),
  });
  assert.equal(stats.pct30d, 10);
  assert.equal(stats.ranked, false);
  assert.equal(stats.note, 'nuevas');
  assert.equal(stats.marksInWindow, 3);
});

test('GET /api/leaderboard handler never uses store.admin or takes() for the list', () => {
  const src = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const start = src.indexOf("if(path==='/api/leaderboard'");
  const end = src.indexOf("if(path==='/api/export'");
  assert.ok(start > 0 && end > start);
  const block = src.slice(start, end);
  assert.match(block, /listLeaderboard/);
  assert.match(block, /getLeaderboardItem/);
  assert.equal(block.includes('store.admin'), false);
  assert.equal(/\btakes\(\)/.test(block), false);

  const lib = readFileSync(new URL('../lib/leaderboard.mjs', import.meta.url), 'utf8');
  assert.equal(lib.includes('store.admin'), false);
  assert.equal(/\btakes\(\)/.test(lib), false);
  assert.match(lib, /FROM public_take_stats/);
});

test('publish + marks precompute public stats; list/detail leak snapshot stays public-only', async () => {
  const ctx = await startApp();
  try {
    const {app, base, headersA, headersB, takeA, takeB, owner} = ctx;
    const alias = await jsonReq(base, '/api/me/alias', {
      method: 'PUT', headers: headersA, body: {alias: 'nodo_sur'},
    });
    assert.equal(alias.status, 200, JSON.stringify(alias.data));

    seedMarks(owner, takeA.id, {days: 20, start: '2026-09-01', gain: 0.01});
    const pub = await jsonReq(base, `/api/takes/${takeA.id}/visibility`, {
      method: 'PUT', headers: headersA, body: {public: true, version: takeA.version},
    });
    assert.equal(pub.status, 200, JSON.stringify(pub.data));
    assert.equal(typeof pub.data.daysActive, 'number');
    assert.equal(typeof pub.data.marksInWindow, 'number');
    assert.ok(pub.data.daysActive >= RANK_MIN_DAYS);
    assert.ok(pub.data.marksInWindow >= RANK_MIN_MARKS);
    assert.equal(pub.data.publicId.includes('@'), false);

    const listed = await jsonReq(base, '/api/leaderboard', {headers: headersA});
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    assert.equal(listed.headers.get('cache-control'), LEADERBOARD_CACHE_CONTROL);
    assert.equal(listed.data.total, 1);
    assert.equal(listed.data.nextPage, null);
    assert.equal(listed.data.items.length, 1);
    const row = listed.data.items[0];
    assert.equal(row.publicId, pub.data.publicId);
    assert.equal(row.title, 'Tesis pública demo');
    assert.equal(row.alias, 'nodo_sur');
    assert.equal(row.mine, true);
    assert.equal(row.ranked, true);
    assert.equal(row.position, 1);
    assert.equal(row.autoLabel, false);
    assert.equal(row.pct30d > 0, true);
    assert.equal(Array.isArray(row.holdings), true);
    assert.deepEqual(Object.keys(row.holdings[0]).sort(), ['ticker', 'weight']);
    assert.equal(listed.data.mineSummary.publicId, row.publicId);
    assert.equal(listed.data.mineSummary.daysActive, row.daysActive);
    assert.equal(listed.data.mineSummary.marksInWindow, pub.data.marksInWindow);

    const asB = await jsonReq(base, '/api/leaderboard', {headers: headersB});
    assert.equal(asB.status, 200);
    assert.equal(asB.data.items[0].mine, false);
    assert.equal(asB.data.mineSummary, null);
    assert.equal(asB.data.items.some(item => item.title.includes('privada')), false);

    const detail = await jsonReq(base, `/api/leaderboard/${row.publicId}`, {headers: headersA});
    assert.equal(detail.status, 200, JSON.stringify(detail.data));
    assert.equal(detail.headers.get('cache-control'), LEADERBOARD_CACHE_CONTROL);
    assert.equal(detail.data.publicId, row.publicId);
    assert.equal(detail.data.mine, true);
    assert.equal(detail.data.mineSummary.marksInWindow, pub.data.marksInWindow);

    const missing = await jsonReq(base, '/api/leaderboard/deadbeefdeadbeef', {headers: headersA});
    assert.equal(missing.status, 404);
    const anon = await jsonReq(base, '/api/leaderboard');
    assert.equal(anon.status, 401);

    const snapshot = {
      list: listed.data,
      detail: detail.data,
    };
    assertNoLeaks(snapshot, [takeA.id, takeB.id, String(takeA.invested), String(takeA.cash)]);
    for (const key of Object.keys(row)) {
      assert.ok(LEADERBOARD_ITEM_FIELDS.includes(key), `unexpected item key ${key}`);
    }
    const pageKeys = Object.keys(listed.data);
    for (const key of pageKeys) {
      assert.ok(LEADERBOARD_PAGE_FIELDS.includes(key), `unexpected page key ${key}`);
    }

    const renamed = await jsonReq(base, '/api/me/alias', {
      method: 'PUT', headers: headersA, body: {alias: 'nodo.este'},
    });
    assert.equal(renamed.status, 200);
    const afterAlias = await jsonReq(base, '/api/leaderboard', {headers: headersA});
    assert.equal(afterAlias.data.items[0].alias, 'nodo.este');

    const off = await jsonReq(base, `/api/takes/${takeA.id}/visibility`, {
      method: 'PUT', headers: headersA, body: {public: false, version: pub.data.take.version},
    });
    assert.equal(off.status, 200);
    const empty = await jsonReq(base, '/api/leaderboard', {headers: headersA});
    assert.equal(empty.status, 200);
    assert.equal(empty.data.total, 0);
    assert.equal(empty.data.items.length, 0);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM public_take_stats').get().n, 0);
    assertNoLeaks(empty.data);
  } finally {
    await closeApp(ctx);
  }
});

test('daily marks recompute ranked order; cache is keyed by page+generation and TTL 60s', async () => {
  const ctx = await startApp();
  try {
    const {app, base, headersA, takeA, owner} = ctx;
    const takeHi = publicTake('Tesis alta');
    const takeNew = publicTake('Tesis nueva');
    takeNew.activatedAt = '2026-09-18T15:00:00.000Z';
    owner.putTake(takeHi);
    owner.putTake(takeNew);
    owner.setPublicAlias('nodo_sur');
    owner.publishTake(takeA.id);
    owner.publishTake(takeHi.id);
    owner.publishTake(takeNew.id);
    seedMarks(owner, takeA.id, {days: 20, start: '2026-09-01', gain: 0.005});
    seedMarks(owner, takeHi.id, {days: 20, start: '2026-09-01', gain: 0.02});
    seedMarks(owner, takeNew.id, {days: 5, start: '2026-09-16', gain: 0.03});

    recomputeAllPublicTakeStats(app.store, {now: new Date('2026-09-20T20:35:00.000Z')});

    const listed = await jsonReq(base, '/api/leaderboard', {headers: headersA});
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    assert.equal(listed.data.total, 3);
    const titles = listed.data.items.map(item => item.title);
    assert.equal(titles[0], 'Tesis alta');
    assert.equal(titles[1], 'Tesis pública demo');
    assert.equal(titles[2], 'Tesis nueva');
    assert.equal(listed.data.items[0].position, 1);
    assert.equal(listed.data.items[1].position, 2);
    assert.equal(listed.data.items[2].ranked, false);
    assert.equal(listed.data.items[2].position, null);
    assert.equal(listed.data.items[2].note, 'nuevas');
    assertNoLeaks(listed.data, [takeA.id, takeHi.id, takeNew.id]);

    resetLeaderboardGeneration();
    const first = listLeaderboard(app.store, {page: 1, userId: app.store.ownerUserId(), now: 1_000});
    app.store.db.prepare("UPDATE public_take_stats SET title='mutado' WHERE title='Tesis alta'").run();
    const cached = listLeaderboard(app.store, {page: 1, userId: app.store.ownerUserId(), now: 1_000});
    assert.equal(cached.items[0].title, first.items[0].title);
    assert.equal(cached.items[0].title, 'Tesis alta');
    const expired = listLeaderboard(app.store, {
      page: 1, userId: app.store.ownerUserId(), now: 1_000 + LEADERBOARD_CACHE_TTL_MS + 1,
    });
    assert.equal(expired.items[0].title, 'mutado');
    bumpLeaderboardGeneration();
    app.store.db.prepare("UPDATE public_take_stats SET title='Tesis alta' WHERE title='mutado'").run();
    const afterBump = listLeaderboard(app.store, {page: 1, userId: app.store.ownerUserId(), now: 2_000});
    assert.equal(afterBump.items[0].title, 'Tesis alta');
    assert.equal(LEADERBOARD_CACHE_TTL_MS, 60_000);
    assert.equal(LEADERBOARD_PAGE_SIZE, 20);
    assert.equal(LEADERBOARD_TOP, 50);

    const dir = tmp();
    const store = createStore(dir, {ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12'});
    try {
      const scoped = store.forUser(store.ownerUserId());
      const live = publicTake('Marca publica');
      scoped.putTake(live);
      scoped.setPublicAlias('nodo_sur');
      scoped.publishTake(live.id);
      assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM public_take_stats').get().n, 0);
      const job = createDailyMarksJob({
        store,
        quotes: {getBenchmarkCached: () => ({id: 'MERV', price: 1234.5})},
        now: () => new Date('2026-10-26T20:35:00.000Z'),
        startTimer: false,
      });
      const written = job.write();
      assert.equal(written.skipped, false);
      assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM public_take_stats').get().n, 1);
      const row = store.db.prepare('SELECT alias, title, ranked FROM public_take_stats').get();
      assert.equal(row.alias, 'nodo_sur');
      assert.equal(row.title, 'Marca publica');
      assert.equal(row.ranked, 0);
    } finally {
      store.close();
      rmSync(dir, {recursive: true, force: true});
    }
  } finally {
    await closeApp(ctx);
  }
});

test('pagination is 20 and top 50; extra ranked takes have no position', () => {
  const dir = tmp();
  let store;
  try {
    resetLeaderboardGeneration();
    store = createStore(dir, {ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12'});
    const owner = store.forUser(store.ownerUserId());
    owner.setPublicAlias('nodo_sur');
    const takes = [];
    for (let i = 0; i < 21; i++) {
      const take = publicTake(`Tesis ${String(i + 1).padStart(2, '0')}`);
      owner.putTake(take);
      owner.publishTake(take.id);
      takes.push(take);
    }
    recomputeAllPublicTakeStats(store, {now: new Date('2026-09-20T20:35:00.000Z')});
    const page1 = listLeaderboard(store, {page: 1, userId: store.ownerUserId()});
    const page2 = listLeaderboard(store, {page: 2, userId: store.ownerUserId()});
    assert.equal(page1.items.length, 20);
    assert.equal(page1.nextPage, 2);
    assert.equal(page1.total, 21);
    assert.equal(page2.items.length, 1);
    assert.equal(page2.nextPage, null);
    assertNoLeaks(page1);
    assertNoLeaks(page2);
    const detail = getLeaderboardItem(store, page1.items[0].publicId, {userId: store.ownerUserId()});
    assert.equal(detail.publicId, page1.items[0].publicId);
    assertNoLeaks(detail, takes.map(take => take.id));
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
