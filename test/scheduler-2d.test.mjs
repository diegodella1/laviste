import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createScheduler, DEFAULT_JOBS_PER_HOUR, HOUR_MS} from '../lib/scheduler.mjs';
import {createAiSemaphore} from '../lib/ai-lock.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {hashPassword} from '../lib/password.mjs';
import {SCHEMA_USER_VERSION} from '../lib/migrations/multiuser.mjs';

const USER_A = 'a@example.test';
const USER_B = 'b@example.test';
const USER_C = 'c@example.test';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'sched2d-'));
}

function activeTake(template = templates[0]) {
  const take = createTake(template);
  activate(take, 1_000_000);
  take.monitoringPaused = false;
  take.nextCheckAt = new Date(Date.now() - 1000).toISOString();
  return take;
}

function fakeReview(take) {
  return {
    id: `rev-${take.id}`,
    takeId: take.id,
    version: take.version,
    at: new Date().toISOString(),
    sources: [],
    events: [],
    attention: 'track',
    summary: `solo-${take.id}`,
    reason: 'evidencia propia',
    resolved: false,
    applied: true,
  };
}

function seedUsers(store, emails) {
  const users = {};
  for (const email of emails) {
    users[email] = store.createUser({email, role: 'user', passwordHash: hashPassword(`${email}-password-12`)});
    store.setUserLimits(users[email], {newsPerDay: 20, tokensPerDay: 100_000, rpm: 40}, {updatedBy: store.ownerUserId()});
  }
  return users;
}

function putTakes(store, userId, n, templateOffset = 0) {
  const scoped = store.forUser(userId);
  const takes = [];
  for (let i = 0; i < n; i++) {
    const take = activeTake(templates[(i + templateOffset) % templates.length]);
    scoped.putTake(take);
    scoped.version(take);
    takes.push(take);
  }
  return takes;
}

async function withScheduler(opts, fn) {
  const dir = tmp();
  let store;
  let scheduler;
  try {
    store = createStore(dir);
    const result = await fn(store, (extra = {}) => {
      scheduler = createScheduler(store, () => ({apiKey: 'test', model: 'gpt-5-mini'}), extra);
      return scheduler;
    });
    return result;
  } finally {
    await scheduler?.close();
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
}

test('2D added no schema version; current schema is v16 after GL1', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, SCHEMA_USER_VERSION);
    assert.equal(SCHEMA_USER_VERSION, 16);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('round-robin fairness across 3 users', async () => {
  await withScheduler({}, async (store, make) => {
    const users = seedUsers(store, [USER_A, USER_B, USER_C]);
    const ids = [users[USER_A], users[USER_B], users[USER_C]];
    const takesByUser = ids.map((id, i) => putTakes(store, id, 3, i));
    const started = [];
    const lock = createAiSemaphore({globalSlots: 2, perUserSlots: 1});
    const scheduler = make({
      aiLock: lock,
      jobsPerHour: 100,
      researcher: async take => {
        started.push(store.userIdForTake(take.id));
        await new Promise(resolve => setTimeout(resolve, 15));
        return fakeReview(take);
      },
    });
    for (const [i, takes] of takesByUser.entries()) {
      const scoped = store.forUser(ids[i]);
      for (const take of takes) scheduler.enqueue(scoped.take(take.id));
    }
    for (let i = 0; i < 6; i++) await scheduler.tick();
    assert.equal(started.length, 9);
    const sorted = [...ids].sort();
    assert.deepEqual(new Set(started.slice(0, 2)), new Set(sorted.slice(0, 2)));
    const counts = {};
    for (const uid of started) counts[uid] = (counts[uid] || 0) + 1;
    for (const uid of ids) assert.equal(counts[uid], 3);
    const firstThreeUnique = new Set(started.slice(0, 3));
    assert.equal(firstThreeUnique.size, 3, 'all three users start before any finishes a third job');
    for (const uid of ids) {
      const reviews = store.forUser(uid).takes().flatMap(take => store.forUser(uid).reviews(take.id));
      assert.equal(reviews.length, 3);
      for (const other of ids.filter(id => id !== uid)) {
        assert.equal(JSON.stringify(reviews).includes(other), false);
      }
    }
  });
});

test('jobs/hour cap skips extras without dropping them', async () => {
  await withScheduler({}, async (store, make) => {
    const users = seedUsers(store, [USER_A, USER_B, USER_C]);
    const takes = [
      ...putTakes(store, users[USER_A], 1, 0),
      ...putTakes(store, users[USER_B], 1, 1),
      ...putTakes(store, users[USER_C], 1, 2),
    ];
    let clock = 1_000_000;
    const skips = [];
    const ran = [];
    const scheduler = make({
      jobsPerHour: 2,
      now: () => clock,
      onSkip: (reason, extra) => skips.push({reason, ...extra}),
      researcher: async take => {
        ran.push(take.id);
        return fakeReview(take);
      },
    });
    for (const take of takes) {
      const uid = store.userIdForTake(take.id);
      scheduler.enqueue(store.forUser(uid).take(take.id));
    }
    await scheduler.tick();
    assert.equal(ran.length, 2);
    const leftover = store.admin.jobs().filter(job => job.status === 'queued');
    assert.equal(leftover.length, 1);
    await scheduler.tick();
    assert.equal(ran.length, 2);
    assert.ok(skips.some(row => row.reason === 'jobs_per_hour'));
    clock += HOUR_MS + 1;
    await scheduler.tick();
    assert.equal(ran.length, 3);
    assert.equal(store.admin.jobs().filter(job => job.status === 'completed').length, 3);
  });
});

test('skips paused, suspended and over-quota users with a logged reason', async () => {
  await withScheduler({}, async (store, make) => {
    const users = seedUsers(store, [USER_A, USER_B, USER_C]);
    const takeSuspended = putTakes(store, users[USER_B], 1, 1)[0];
    const takeQuota = putTakes(store, users[USER_C], 1, 2)[0];
    const takeOk = putTakes(store, store.ownerUserId(), 1, 0)[0];
    const ran = [];
    const skips = [];
    const scheduler = make({
      jobsPerHour: 50,
      onSkip: (reason, extra) => skips.push({reason, ...extra}),
      researcher: async take => {
        ran.push(take.id);
        return fakeReview(take);
      },
    });
    scheduler.enqueue(store.forUser(users[USER_B]).take(takeSuspended.id));
    scheduler.enqueue(store.forUser(users[USER_C]).take(takeQuota.id));
    scheduler.enqueue(store.forUser(store.ownerUserId()).take(takeOk.id));

    store.setAiControl({enabled: false}, {updatedBy: store.ownerUserId()});
    await scheduler.tick();
    assert.equal(ran.length, 0);
    assert.ok(skips.some(row => row.reason === 'ai_paused'));
    store.setAiControl({enabled: true}, {updatedBy: store.ownerUserId()});

    store.db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(users[USER_B]);
    store.setUserLimits(users[USER_C], {newsPerDay: 0}, {updatedBy: store.ownerUserId()});
    await scheduler.tick();
    await scheduler.tick();
    assert.deepEqual(ran, [takeOk.id]);
    assert.ok(skips.some(row => row.reason === 'suspended_or_missing' && row.takeId === takeSuspended.id));
    assert.ok(skips.some(row => row.reason === 'quota_news' && row.userId === users[USER_C]));
    assert.notEqual(store.admin.job(store.admin.jobs().find(j => j.takeId === takeSuspended.id).id).status, 'completed');
    assert.equal(store.forUser(users[USER_C]).reviews(takeQuota.id).length, 0);
    assert.equal(store.forUser(store.ownerUserId()).reviews(takeOk.id)[0].summary, `solo-${takeOk.id}`);
  });
});

test('A/B isolation still holds when two users run in the same tick', async () => {
  await withScheduler({}, async (store, make) => {
    const users = seedUsers(store, [USER_A, USER_B]);
    const takeA = putTakes(store, users[USER_A], 1, 0)[0];
    const takeB = putTakes(store, users[USER_B], 1, 1)[0];
    takeA.thesis = 'TESIS-ALPHA-UNICA';
    takeB.thesis = 'TESIS-BETA-UNICA';
    store.forUser(users[USER_A]).putTake(takeA);
    store.forUser(users[USER_B]).putTake(takeB);
    const seen = [];
    const scheduler = make({
      aiLock: createAiSemaphore({globalSlots: 2, perUserSlots: 1}),
      researcher: async take => {
        seen.push({id: take.id, thesis: take.thesis, userId: store.userIdForTake(take.id)});
        return fakeReview(take);
      },
    });
    scheduler.enqueue(store.forUser(users[USER_A]).take(takeA.id));
    scheduler.enqueue(store.forUser(users[USER_B]).take(takeB.id));
    await scheduler.tick();
    assert.equal(seen.length, 2);
    const rowA = seen.find(row => row.id === takeA.id);
    const rowB = seen.find(row => row.id === takeB.id);
    assert.equal(rowA.thesis, 'TESIS-ALPHA-UNICA');
    assert.equal(rowB.thesis, 'TESIS-BETA-UNICA');
    assert.equal(rowA.userId, users[USER_A]);
    assert.equal(rowB.userId, users[USER_B]);
    assert.equal(store.forUser(users[USER_A]).reviews(takeB.id).length, 0);
    assert.equal(store.forUser(users[USER_B]).reviews(takeA.id).length, 0);
    assert.equal(JSON.stringify(store.forUser(users[USER_A]).take(takeA.id)).includes('TESIS-BETA-UNICA'), false);
    assert.equal(JSON.stringify(store.forUser(users[USER_B]).take(takeB.id)).includes('TESIS-ALPHA-UNICA'), false);
    const news = store.usage().find(row => row.kind === 'news');
    assert.equal(news?.calls || 0, 2);
  });
});

test('default jobs/hour is conservative for the Pi', () => {
  assert.equal(DEFAULT_JOBS_PER_HOUR, 20);
  assert.equal(HOUR_MS, 3_600_000);
});
