import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {USER_SCOPED_METHODS} from '../lib/store-access.mjs';
import {USER_SCOPED_TABLES} from '../lib/migrations/multiuser.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {
  recordActivationOps, recordAporteOp, recordRetiroOp, recordCorreccionOp, recordTradeOp,
} from '../lib/ops.mjs';
import {createPendingOrder, confirmPendingOrder, cancelPendingOrder} from '../lib/orders.mjs';
import {createScheduler} from '../lib/scheduler.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'mu-access-'));
}

function fingerprint(db, userId) {
  const data = {};
  for (const table of USER_SCOPED_TABLES) {
    data[table] = db.prepare(`SELECT * FROM ${table} WHERE user_id=? ORDER BY id`).all(userId);
  }
  data.idempotency = db.prepare('SELECT key, fingerprint FROM idempotency WHERE key LIKE ? ORDER BY key')
    .all(`${userId}:%`);
  data.proposals = db.prepare("SELECT key FROM settings WHERE key LIKE ? ORDER BY key")
    .all(`proposal:${userId}:%`);
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function ownerOpsChecksum(db, ownerId) {
  const rows = db.prepare('SELECT id, amount, at FROM ops WHERE user_id=? ORDER BY id').all(ownerId);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function activeTake(template = templates[0], amount = 1_000_000) {
  const take = createTake(template);
  activate(take, amount);
  take.monitoringPaused = false;
  take.nextCheckAt = new Date(Date.now() - 1000).toISOString();
  return take;
}

function seedPair(store) {
  const ownerId = store.ownerUserId();
  const otherId = store.createUser({email: 'b@example.test', displayName: 'Bee'});
  const owner = store.forUser(ownerId);
  const other = store.forUser(otherId);
  const takeA = activeTake(templates[0], 1_000_000);
  const takeB = activeTake(templates[1], 800_000);
  owner.putTake(takeA);
  owner.version(takeA);
  owner.putChat({id: 'chat-a', messages: [{role: 'user', content: 'secreto-de-A'}], proposal: null});
  other.putTake(takeB);
  other.version(takeB);
  other.putChat({id: 'chat-b', messages: [{role: 'user', content: 'secreto-de-B'}], proposal: null});
  return {ownerId, otherId, owner, other, takeA, takeB};
}

test('forUser(owner) matches admin while only the owner has rows', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const take = activeTake();
    store.putTake(take);
    store.putChat({id: 'c-owner', messages: []});
    const scoped = store.forUser(store.ownerUserId());
    assert.equal(store.admin.scope, 'admin');
    assert.equal(scoped.scope, 'user');
    assert.equal(scoped.userId, store.ownerUserId());
    assert.deepEqual(scoped.takes().map(t => t.id).sort(), store.takes().map(t => t.id).sort());
    assert.deepEqual(scoped.chats().map(c => c.id).sort(), store.chats().map(c => c.id).sort());
    assert.equal(scoped.take(take.id).thesis, take.thesis);
    for (const name of USER_SCOPED_METHODS) assert.equal(typeof scoped[name], 'function', name);
    assert.equal(store.admin.forUser, undefined);
    assert.equal(scoped.admin, undefined);
    assert.equal(scoped.db, undefined);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('unknown forUser id is 404 and does not create a user', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const before = store.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    assert.throws(() => store.forUser(randomUUID()), err => err.status === 404);
    assert.throws(() => store.forUser('not-a-uuid'), err => err.status === 404);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, before);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('store.forUser isolates every user-owned table; foreign ids are invisible', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const {owner, other, takeA, takeB} = seedPair(store);
    owner.putReview({id: 'rev-a', takeId: takeA.id, summary: 'review-A'});
    owner.putJob({id: 'job-a', takeId: takeA.id, status: 'queued'});
    other.putReview({id: 'rev-b', takeId: takeB.id, summary: 'review-B'});
    other.putJob({id: 'job-b', takeId: takeB.id, status: 'queued'});

    assert.equal(owner.take(takeB.id), null);
    assert.equal(owner.chat('chat-b'), null);
    assert.equal(owner.job('job-b'), null);
    assert.equal(owner.reviews(takeB.id).length, 0);
    assert.equal(owner.versions(takeB.id).length, 0);
    assert.equal(owner.opsForTake(takeB.id).length, 0);
    assert.equal(owner.ordersForTake(takeB.id).length, 0);
    assert.equal(owner.jobs().some(j => j.id === 'job-b'), false);
    assert.equal(owner.takes().some(t => t.id === takeB.id), false);
    assert.equal(owner.chats().some(c => c.id === 'chat-b'), false);
    assert.equal(JSON.stringify(owner.takes()).includes('secreto-de-B'), false);
    assert.equal(JSON.stringify(owner.chats()).includes('secreto-de-B'), false);

    assert.equal(other.take(takeA.id), null);
    assert.equal(other.chat('chat-a'), null);
    assert.equal(other.job('job-a'), null);
    assert.ok(other.take(takeB.id));
    assert.equal(other.chat('chat-b').messages[0].content, 'secreto-de-B');

    assert.equal(store.admin.takes().length, owner.takes().length + other.takes().length);
    assert.equal(store.take(takeB.id).id, takeB.id);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('cross-user writes 404 and leave the other user unchanged', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const {ownerId, otherId, owner, other, takeA, takeB} = seedPair(store);
    other.putReview({id: 'rev-b', takeId: takeB.id, summary: 'review-B'});
    other.putJob({id: 'job-b', takeId: takeB.id, status: 'queued'});
    const beforeB = fingerprint(store.db, otherId);
    const beforeA = fingerprint(store.db, ownerId);

    assert.throws(() => owner.putTake({...takeB, title: 'hacked'}), err => err.status === 404);
    assert.throws(() => owner.putReview({id: 'rev-x', takeId: takeB.id, summary: 'no'}), err => err.status === 404);
    assert.throws(() => owner.putJob({id: 'job-x', takeId: takeB.id, status: 'queued'}), err => err.status === 404);
    assert.throws(() => owner.version(takeB), err => err.status === 404);
    assert.throws(() => owner.insertOp({
      id: 'op-x', takeId: takeB.id, kind: 'aporte', at: '2026-01-06T00:00:00.000Z',
      ticker: null, units: null, amount: 1, currency: 'ARS', price: null,
      quoteAsOf: null, quoteProvider: null, quoteClass: 'missing', quoteEligible: 0, quoteStale: 0,
      parentId: null, batchId: 'bx', idempotencyKey: 'k-x', fingerprint: 'f', note: '', meta: {},
      createdAt: '2026-01-06T00:00:00.000Z',
    }), err => err.status === 404);
    assert.throws(() => owner.insertOrder({
      id: 'ord-x', takeId: takeB.id, kind: 'aporte', status: 'pending', takeVersion: 1,
      payload: {}, preview: {}, fingerprint: 'f', idempotencyKey: 'same-key',
      createdAt: '2026-01-06T00:00:00.000Z',
    }), err => err.status === 404);
    assert.throws(() => owner.updateOrder({id: 'missing', status: 'cancelled'}), err => err.status === 404);

    other.putTake(takeB);
    assert.equal(other.take(takeB.id).title, takeB.title);
    assert.equal(fingerprint(store.db, otherId), beforeB);
    assert.equal(fingerprint(store.db, ownerId), beforeA);
    assert.equal(store.take(takeA.id).title, takeA.title);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('idempotency and proposal keys are namespaced per user', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const {owner, other, takeA, takeB} = seedPair(store);
    const key = 'POST:/api/takes:same';
    owner.remember(key, 'fp-a', {takeId: takeA.id});
    other.remember(key, 'fp-b', {takeId: takeB.id});
    assert.equal(owner.idempotent(key).data.takeId, takeA.id);
    assert.equal(other.idempotent(key).data.takeId, takeB.id);
    assert.notEqual(owner.idempotent(key).fingerprint, other.idempotent(key).fingerprint);

    const proposal = 'proposal:chat-x:hash';
    owner.setSetting(proposal, {takeId: takeA.id});
    other.setSetting(proposal, {takeId: takeB.id});
    assert.equal(owner.setting(proposal).takeId, takeA.id);
    assert.equal(other.setting(proposal).takeId, takeB.id);
    assert.equal(store.setting(proposal), null);
    assert.ok(store.setting(`proposal:${owner.userId}:chat-x:hash`));
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('owner forUser still reads legacy unprefixed proposal and idempotency keys', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const take = activeTake();
    store.putTake(take);
    store.remember('legacy-idem', 'fp', {ok: true});
    store.setSetting('proposal:chat-old:hash', {takeId: take.id});
    const owner = store.forUser(store.ownerUserId());
    assert.equal(owner.idempotent('legacy-idem').data.ok, true);
    assert.equal(owner.setting('proposal:chat-old:hash').takeId, take.id);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('ops and orders through forUser 404 on foreign takes and do not collide keys', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const {ownerId, otherId, owner, other, takeA, takeB} = seedPair(store);
    const quotes = {getCached: () => null};
    recordActivationOps(owner, takeA, quotes);
    recordActivationOps(other, takeB, quotes);
    const beforeB = fingerprint(store.db, otherId);
    const ownerChecksum = ownerOpsChecksum(store.db, ownerId);

    assert.throws(() => recordAporteOp(owner, takeB, 1000, 'ap-cross'), err => err.status === 404);
    assert.throws(() => recordRetiroOp(owner, takeB, 1000, 're-cross'), err => err.status === 404);
    assert.throws(() => recordCorreccionOp(owner, takeB, {cashDelta: 1, note: 'x'}), err => err.status === 404);
    assert.throws(() => recordTradeOp(owner, takeB, {
      side: 'compra', ticker: 'GGAL', units: 1, amount: 1, price: 1, by: 'units', line: 'x',
    }, quotes, 'tr-cross'), err => err.status === 404);
    assert.throws(() => createPendingOrder(owner, takeB, {kind: 'aporte', amount: 1000}, 'ord-cross'), err => err.status === 404);

    const pendingB = createPendingOrder(other, takeB, {kind: 'aporte', amount: 5000}, 'same-client-key');
    const pendingA = createPendingOrder(owner, takeA, {kind: 'aporte', amount: 4000}, 'same-client-key');
    assert.equal(pendingA.replay, false);
    assert.equal(pendingB.replay, false);
    assert.equal(owner.order(pendingB.order.id), null);
    assert.equal(other.order(pendingA.order.id), null);
    assert.throws(() => confirmPendingOrder(owner, takeA, pendingB.order.id, quotes), err => err.status === 404);
    assert.throws(() => cancelPendingOrder(owner, takeB, pendingB.order.id), err => err.status === 404);
    assert.throws(() => confirmPendingOrder(owner, takeB, pendingB.order.id, quotes), err => err.status === 404);

    cancelPendingOrder(other, takeB, pendingB.order.id);
    assert.equal(other.order(pendingB.order.id).status, 'cancelled');
    assert.equal(owner.pendingOrders().some(o => o.id === pendingB.order.id), false);

    assert.equal(fingerprint(store.db, otherId) !== beforeB, true);
    assert.equal(ownerOpsChecksum(store.db, ownerId), ownerChecksum);
    assert.equal(owner.opsForTake(takeB.id).length, 0);
    assert.ok(other.opsForTake(takeB.id).length > 0);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('scheduler ticks both users without crossing reviews, jobs or take JSON', async () => {
  const dir = tmp();
  let store;
  let scheduler;
  try {
    store = createStore(dir);
    const {owner, other, takeA, takeB} = seedPair(store);
    owner.putTake(takeA);
    other.putTake(takeB);
    const seen = [];
    scheduler = createScheduler(store, () => ({apiKey: 'test', newsLimit: 10}), {
      researcher: async original => {
        seen.push(original.id);
        return {
          id: `rev-${original.id}`,
          takeId: original.id,
          version: original.version,
          at: new Date().toISOString(),
          sources: [],
          events: [],
          attention: 'track',
          summary: `solo-${original.id}`,
          reason: 'evidencia propia',
          resolved: false,
          applied: true,
        };
      },
    });
    scheduler.enqueue(takeA);
    scheduler.enqueue(takeB);
    await scheduler.tick();
    await scheduler.tick();

    assert.deepEqual(new Set(seen), new Set([takeA.id, takeB.id]));
    assert.equal(owner.job(store.admin.jobs().find(j => j.takeId === takeA.id).id).status, 'completed');
    assert.equal(other.reviews(takeB.id)[0].summary, `solo-${takeB.id}`);
    assert.equal(owner.reviews(takeB.id).length, 0);
    assert.equal(other.reviews(takeA.id).length, 0);
    assert.equal(JSON.stringify(owner.reviews(takeA.id)).includes(takeB.id), false);
    assert.equal(JSON.stringify(other.take(takeB.id)).includes(takeA.id), false);
    assert.equal(owner.jobs().some(j => j.takeId === takeB.id), false);
    assert.equal(other.jobs().some(j => j.takeId === takeA.id), false);
    assert.equal(store.take(takeA.id).coverage, 'partial');
    assert.equal(store.take(takeB.id).coverage, 'partial');
  } finally {
    await scheduler?.close();
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
