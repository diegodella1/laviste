import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFeedDigestCache, FEED_DIGEST_TTL_MS} from '../lib/feed-digest-cache.mjs';
import {loadEnabledFeedDigest, research, condenseFeedDigest} from '../lib/news.mjs';
import {createStore} from '../lib/store.mjs';
import {createScheduler} from '../lib/scheduler.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {hashPassword} from '../lib/password.mjs';
import {createAiSemaphore} from '../lib/ai-lock.mjs';

const rssXml = readFileSync(new URL('./fixtures/rss-sample.xml', import.meta.url), 'utf8');
const publicLookup = async () => [{address: '93.184.216.34', family: 4}];

function xmlResponse(xml) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({'content-type': 'application/rss+xml'}),
    arrayBuffer: async () => new TextEncoder().encode(xml),
  };
}

const analysis = () => ({
  summary: 'Cambió la evidencia',
  attention: 'review',
  reason: 'La evidencia contradice la demanda esperada.',
  resolved: false,
  sourceIds: [1],
  events: [{
    title: 'Informe', fact: 'Hecho de prueba', interpretation: 'Contradice el supuesto',
    uncertainty: 'Impacto pendiente', affected: 'Demanda', publishedAt: null, sourceIds: [1],
  }],
});

test('RSS cache hit/miss, TTL and coalesced inflight', async () => {
  assert.equal(FEED_DIGEST_TTL_MS, 120_000);
  let clock = 1_000;
  let loads = 0;
  const digest = condenseFeedDigest([{
    feed: {label: 'On', url: 'https://on.example/rss'},
    items: [{title: 'T', url: 'https://ejemplo.com/n1', snippet: 's', publishedAt: new Date(clock).toISOString()}],
  }]);
  const cache = createFeedDigestCache({
    ttlMs: 1_000,
    now: () => clock,
    load: async () => {
      loads += 1;
      return structuredClone(digest);
    },
  });
  const cfg = {feeds: [{label: 'On', url: 'https://on.example/rss', enabled: true}]};
  const first = await cache.get(cfg);
  assert.equal(loads, 1);
  first.items.push({title: 'mutado'});
  const second = await cache.get(cfg);
  assert.equal(loads, 1);
  assert.equal(cache.snapshot().hits, 1);
  assert.equal(second.items.some(item => item.title === 'mutado'), false);
  clock += 1_001;
  await cache.get(cfg);
  assert.equal(loads, 2);
  assert.equal(cache.snapshot().misses, 2);

  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let inflightLoads = 0;
  const coalesced = createFeedDigestCache({
    ttlMs: 5_000,
    load: async () => {
      await gate;
      inflightLoads += 1;
      return structuredClone(digest);
    },
  });
  const p1 = coalesced.get(cfg);
  const p2 = coalesced.get(cfg);
  release();
  const [a, b] = await Promise.all([p1, p2]);
  assert.equal(inflightLoads, 1);
  assert.equal(a.items[0].title, b.items[0].title);
});

test('research uses the shared RSS cache; classification stays per user', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rss-iso-'));
  let store;
  let scheduler;
  try {
    store = createStore(dir);
    const userA = store.createUser({email: 'a@example.test', role: 'user', passwordHash: hashPassword('user-a-password-12')});
    const userB = store.createUser({email: 'b@example.test', role: 'user', passwordHash: hashPassword('user-b-password-12')});
    store.setUserLimits(userA, {newsPerDay: 10, tokensPerDay: 100_000}, {updatedBy: store.ownerUserId()});
    store.setUserLimits(userB, {newsPerDay: 10, tokensPerDay: 100_000}, {updatedBy: store.ownerUserId()});
    store.insertNewsFeed({label: 'On', url: 'https://on.example/rss', enabled: true});
    const takeA = createTake(templates[0]);
    activate(takeA, 1_000_000);
    takeA.thesis = 'TESIS-CACHE-A';
    takeA.monitoringPaused = false;
    store.forUser(userA).putTake(takeA);
    const takeB = createTake(templates[1]);
    activate(takeB, 1_000_000);
    takeB.thesis = 'TESIS-CACHE-B';
    takeB.monitoringPaused = false;
    store.forUser(userB).putTake(takeB);

    const fetched = [];
    const cache = createFeedDigestCache({
      ttlMs: 60_000,
      load: (config, opts) => loadEnabledFeedDigest(config, opts),
    });
    const seen = [];
    scheduler = createScheduler(store, () => ({
      apiKey: 'test',
      model: 'gpt-5-mini',
      feedLookup: publicLookup,
      feedFetcher: async url => {
        fetched.push(String(url));
        return xmlResponse(rssXml);
      },
    }), {
      digestCache: cache,
      aiLock: createAiSemaphore({globalSlots: 2}),
      researcher: async (take, config) => {
        const digest = await config.feedDigestCache.get(config, {now: new Date().toISOString()});
        seen.push({takeId: take.id, thesis: take.thesis, cited: digest.citedCount, userId: config.userId});
        return {
          id: `rev-${take.id}`, takeId: take.id, version: take.version, at: new Date().toISOString(),
          sources: [], events: [], attention: 'track', summary: `solo-${take.thesis}`,
          reason: 'propia', resolved: false,
        };
      },
    });
    scheduler.enqueue(store.forUser(userA).take(takeA.id));
    scheduler.enqueue(store.forUser(userB).take(takeB.id));
    await scheduler.tick();
    assert.equal(fetched.length, 1);
    assert.equal(seen.length, 2);
    assert.equal(seen.find(row => row.takeId === takeA.id).thesis, 'TESIS-CACHE-A');
    assert.equal(seen.find(row => row.takeId === takeB.id).thesis, 'TESIS-CACHE-B');
    assert.equal(store.forUser(userA).reviews(takeB.id).length, 0);
    assert.equal(store.forUser(userB).reviews(takeA.id).length, 0);
    assert.equal(store.forUser(userA).reviews(takeA.id)[0].summary.includes('TESIS-CACHE-B'), false);
    assert.equal(JSON.stringify(cache.snapshot()).includes('TESIS-CACHE'), false);
  } finally {
    await scheduler?.close();
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('research() digest cache is a hit on the second user without re-fetch', async () => {
  const fetched = [];
  const cache = createFeedDigestCache({
    ttlMs: 60_000,
    load: (config, opts) => loadEnabledFeedDigest(config, opts),
  });
  const cfg = {
    apiKey: 'test',
    model: 'gpt-5-mini',
    feedDigestCache: cache,
    feeds: [{id: '1', label: 'On', url: 'https://on.example/rss', enabled: true}],
    feedLookup: publicLookup,
    feedFetcher: async url => {
      fetched.push(String(url));
      return xmlResponse(rssXml);
    },
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body);
      const input = JSON.parse(body.input);
      const review = {
        ...analysis(),
        summary: `clase-${String(input.thesis || '').slice(0, 24)}`,
        sourceIds: [1],
        events: [{...analysis().events[0], sourceIds: [1]}],
      };
      return {ok: true, json: async () => ({status: 'completed', output: [{content: [{type: 'output_text', text: JSON.stringify(review)}]}] })};
    },
  };
  const takeA = createTake(templates[0]);
  const takeB = createTake(templates[1]);
  const a = await research(takeA, cfg);
  const b = await research(takeB, cfg);
  assert.equal(fetched.length, 1);
  assert.equal(cache.snapshot().hits, 1);
  assert.equal(a.takeId, takeA.id);
  assert.equal(b.takeId, takeB.id);
  assert.notEqual(a.summary, b.summary);
  assert.equal(a.summary.includes(takeB.thesis.slice(0, 8)), false);
});
