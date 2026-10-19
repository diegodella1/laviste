import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server.mjs';
import {createStore} from '../lib/store.mjs';
import {SCHEMA_USER_VERSION} from '../lib/migrations/multiuser.mjs';
import {
  assertFeedUrl,
  assertPublicFeedUrl,
  fetchFeedXml,
  filterEnabledFeeds,
  parseFeedXml,
  probeFeed,
  validateFeedFields,
} from '../lib/feeds.mjs';
import {FUENTES_COPY} from '../public/admin-fuentes.mjs';

const adminKey = 'k'.repeat(32);
const rssXml = readFileSync(new URL('./fixtures/rss-sample.xml', import.meta.url), 'utf8');
const atomXml = readFileSync(new URL('./fixtures/atom-sample.xml', import.meta.url), 'utf8');
const publicLookup = async () => [{address: '93.184.216.34', family: 4}];

function tmp() {
  return mkdtempSync(join(tmpdir(), 'laviste-feeds-'));
}

function xmlResponse(xml, extra = {}) {
  return {
    ok: true,
    status: extra.status ?? 200,
    headers: new Headers(extra.headers || {'content-type': 'application/rss+xml'}),
    arrayBuffer: async () => new TextEncoder().encode(xml),
  };
}

async function login(base, password) {
  const res = await fetch(base + '/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: 'diego@diegodella.ar', password})});
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

async function adminLogin(base, sessionCookie) {
  const res = await fetch(base + '/api/admin/login', {method: 'POST', headers: {Cookie: sessionCookie, 'Content-Type': 'application/json'}, body: JSON.stringify({key: adminKey})});
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

async function withApp(options, fn) {
  const dir = tmp();
  let app;
  try {
    app = createApp({
      dataDir: dir,
      password: 'space-password-ok',
      adminKey,
      port: 0,
      feedLookup: publicLookup,
      feedFetcher: async () => xmlResponse(rssXml),
      ...options,
    });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    await fn({app, base, dir});
  } finally {
    if (app?.server?.listening) await app.close();
    else app?.store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
}

test('parseFeedXml reads RSS titles, links and newest-first order', () => {
  const parsed = parseFeedXml(rssXml);
  assert.equal(parsed.feedTitle, 'Mercado de práctica');
  assert.equal(parsed.itemCount, 7);
  assert.equal(parsed.items[0].title, 'BCRA mantiene la tasa de política');
  assert.equal(parsed.items[0].url, 'https://ejemplo.com/bcra-tasa');
  assert.match(parsed.items[0].snippet, /tasa de referencia/);
});

test('parseFeedXml reads Atom entries and optional links', () => {
  const parsed = parseFeedXml(atomXml);
  assert.equal(parsed.itemCount, 3);
  assert.equal(parsed.items[0].title, 'Inflación de septiembre desacelera');
  assert.equal(parsed.items[0].url, 'https://ejemplo.com/inflacion');
  assert.equal(parsed.items[2].url, null);
});

test('probeFeed returns at most five titles and does not call OpenAI', async () => {
  let hitOpenAi = false;
  const result = await probeFeed('https://ejemplo.com/rss', {
    lookupFn: publicLookup,
    fetcher: async url => {
      if (String(url).includes('openai.com')) hitOpenAi = true;
      return xmlResponse(rssXml);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.itemCount, 7);
  assert.equal(result.items.length, 5);
  assert.equal(result.items[0].title, 'BCRA mantiene la tasa de política');
  assert.equal(hitOpenAi, false);
  assert.ok(result.latencyMs >= 0);
});

test('SSRF rejects javascript, http, localhost and private literals', () => {
  const blocked = [
    'javascript:alert(1)',
    'http://ejemplo.com/rss',
    'https://localhost/rss',
    'https://127.0.0.1/rss',
    'https://10.0.0.8/rss',
    'https://192.168.1.9/rss',
    'https://169.254.1.1/rss',
    'https://[::1]/rss',
    'https://user:pass@ejemplo.com/rss',
  ];
  for (const url of blocked) {
    assert.throws(() => assertFeedUrl(url));
  }
  const ok = assertFeedUrl('https://ejemplo.com/feed.xml');
  assert.equal(ok.protocol, 'https:');
});

test('SSRF rejects hostnames that resolve to private addresses', async () => {
  await assert.rejects(
    () => assertPublicFeedUrl('https://evil.example/rss', {lookupFn: async () => [{address: '127.0.0.1', family: 4}]}),
    /no está permitida/,
  );
  await assert.rejects(
    () => assertPublicFeedUrl('https://evil.example/rss', {lookupFn: async () => [{address: '10.1.2.3', family: 4}]}),
    /no está permitida/,
  );
});

test('safe redirect handling refuses a hop to a private URL', async () => {
  await assert.rejects(() => fetchFeedXml('https://ejemplo.com/rss', {
    lookupFn: publicLookup,
    fetcher: async () => ({
      ok: false,
      status: 302,
      headers: new Headers({location: 'https://127.0.0.1/secret'}),
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
  }), /no está permitida|URL https válida/);
});

test('enable/disable filter keeps only enabled feeds', () => {
  const list = [
    {id: '1', label: 'On', enabled: true},
    {id: '2', label: 'Off', enabled: false},
  ];
  assert.deepEqual(filterEnabledFeeds(list).map(f => f.id), ['1']);
  const dir = tmp();
  const store = createStore(dir);
  try {
    store.insertNewsFeed({label: 'Activa', url: 'https://a.example/rss', enabled: true});
    store.insertNewsFeed({label: 'Pausada', url: 'https://b.example/rss', enabled: false});
    assert.equal(store.listNewsFeeds().length, 2);
    assert.equal(store.listNewsFeeds({enabled: true}).length, 1);
    assert.equal(store.listNewsFeeds({enabled: true})[0].label, 'Activa');
    assert.equal(store.listNewsFeeds({enabled: false})[0].label, 'Pausada');
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('news_feeds migrates through user_version 11 with empty seed', () => {
  const dir = tmp();
  const db = new DatabaseSync(join(dir, 'tesis.sqlite'));
  db.exec('CREATE TABLE takes(id TEXT PRIMARY KEY, data TEXT NOT NULL); PRAGMA user_version=7;');
  db.close();
  const store = createStore(dir);
  try {
    assert.equal(store.userVersion(), SCHEMA_USER_VERSION);
    assert.equal(store.listNewsFeeds().length, 0);
    const fresh = createStore(tmp() + '-fresh');
    try {
      assert.equal(fresh.userVersion(), SCHEMA_USER_VERSION);
      assert.equal(fresh.listNewsFeeds().length, 0);
    } finally {
      fresh.close();
    }
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('listNewsFeeds sorts by updated_at DESC', async () => {
  const dir = tmp();
  const store = createStore(dir);
  try {
    const first = store.insertNewsFeed({label: 'Vieja', url: 'https://old.example/rss'});
    await new Promise(r => setTimeout(r, 15));
    const second = store.insertNewsFeed({label: 'Nueva', url: 'https://new.example/rss'});
    assert.equal(store.listNewsFeeds()[0].id, second.id);
    await new Promise(r => setTimeout(r, 15));
    store.updateNewsFeed(first.id, {label: 'Vieja tocada'});
    assert.equal(store.listNewsFeeds()[0].id, first.id);
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('admin feed APIs enforce session, admin cookie, https-only and stay out of /api/state', async () => {
  const dir = tmp();
  let app;
  try {
    app = createApp({dataDir: dir, password: 'space-password-ok', adminKey: '', port: 0});
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    assert.equal((await fetch(base + '/api/admin/feeds')).status, 503);
    await app.close();
    app = null;

    await withApp({}, async ({app: live, base: base2}) => {
      assert.equal((await fetch(base2 + '/api/admin/feeds')).status, 401);
      const session = await login(base2, 'space-password-ok');
      const headers = {Cookie: session, 'Content-Type': 'application/json'};
      assert.equal((await fetch(base2 + '/api/admin/feeds', {headers})).status, 401);
      const adminCookie = await adminLogin(base2, session);
      const both = {Cookie: `${session}; ${adminCookie}`, 'Content-Type': 'application/json'};
      const empty = await (await fetch(base2 + '/api/admin/feeds', {headers: both})).json();
      assert.deepEqual(empty.feeds, []);

      const httpReject = await fetch(base2 + '/api/admin/feeds', {
        method: 'POST', headers: both, body: JSON.stringify({label: 'HTTP', url: 'http://ejemplo.com/rss'}),
      });
      assert.equal(httpReject.status, 400);

      const createdRes = await fetch(base2 + '/api/admin/feeds', {
        method: 'POST', headers: both, body: JSON.stringify({label: 'Ámbito demo', url: 'https://ejemplo.com/rss'}),
      });
      assert.equal(createdRes.status, 201);
      const created = await createdRes.json();
      assert.equal(created.enabled, true);
      assert.equal(created.url, 'https://ejemplo.com/rss');

      const patched = await (await fetch(base2 + `/api/admin/feeds/${created.id}`, {
        method: 'PATCH', headers: both, body: JSON.stringify({enabled: false}),
      })).json();
      assert.equal(patched.enabled, false);

      const probe = await fetch(base2 + `/api/admin/feeds/${created.id}/probe`, {
        method: 'POST', headers: both, body: '{}',
      });
      assert.equal(probe.status, 200);
      const probed = await probe.json();
      assert.equal(probed.ok, true);
      assert.equal(probed.items.length, 5);
      assert.equal(JSON.stringify(probed).includes('api.openai.com'), false);

      const state = await (await fetch(base2 + '/api/state', {headers: {Cookie: session}})).json();
      assert.equal('feeds' in state, false);
      assert.equal(JSON.stringify(state).includes('https://ejemplo.com/rss'), false);
      assert.equal(JSON.stringify(state).includes('Ámbito demo'), false);

      const del = await fetch(base2 + `/api/admin/feeds/${created.id}`, {
        method: 'DELETE', headers: both, body: '{}',
      });
      assert.equal(del.status, 200);
      const after = await (await fetch(base2 + '/api/admin/feeds', {headers: both})).json();
      assert.equal(after.feeds.length, 0);
      assert.ok(live.store.reviews().length === 0);
    });
  } finally {
    if (app?.server?.listening) await app.close();
    else app?.store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('draft probe-by-url and create validation stay https-only', async () => {
  await withApp({}, async ({base}) => {
    const session = await login(base, 'space-password-ok');
    const adminCookie = await adminLogin(base, session);
    const both = {Cookie: `${session}; ${adminCookie}`, 'Content-Type': 'application/json'};
    const bad = await fetch(base + '/api/admin/feeds/probe', {
      method: 'POST', headers: both, body: JSON.stringify({url: 'javascript:alert(1)'}),
    });
    assert.equal(bad.status, 400);
    const ok = await fetch(base + '/api/admin/feeds/probe', {
      method: 'POST', headers: both, body: JSON.stringify({url: 'https://ejemplo.com/rss'}),
    });
    assert.equal(ok.status, 200);
    const data = await ok.json();
    assert.equal(data.ok, true);
    assert.equal(data.items[0].title, 'BCRA mantiene la tasa de política');
  });
});

test('validateFeedFields enforces label length and https URL', () => {
  assert.throws(() => validateFeedFields({label: '', url: 'https://ejemplo.com/rss'}));
  assert.throws(() => validateFeedFields({label: 'ok', url: 'http://ejemplo.com/rss'}));
  const ok = validateFeedFields({label: '  BCRA  ', url: 'https://ejemplo.com/rss'});
  assert.equal(ok.label, 'BCRA');
  assert.equal(ok.enabled, true);
});

test('Admin Fuentes copy, nav and settings entry are locked', () => {
  const ui = readFileSync(new URL('../public/admin-fuentes.mjs', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../public/integrations.js', import.meta.url), 'utf8');
  const agent = readFileSync(new URL('../public/admin-agent.mjs', import.meta.url), 'utf8');
  const news = readFileSync(new URL('../lib/news.mjs', import.meta.url), 'utf8');
  for (const value of Object.values(FUENTES_COPY)) {
    if (value.includes('{')) continue;
    assert.ok(ui.includes(value), `missing copy «${value}»`);
  }
  assert.match(app, /#\/admin\/fuentes/);
  assert.match(app, /Admin · Fuentes/);
  assert.match(app, /La Viste · Admin · Fuentes/);
  assert.equal(settings.includes(FUENTES_COPY.settingsLink), true);
  assert.equal(agent.includes(FUENTES_COPY.settingsLink), true);
  assert.equal(news.includes('news_feeds'), false);
  assert.match(news, /from '\.\/feeds\.mjs'/);
});
