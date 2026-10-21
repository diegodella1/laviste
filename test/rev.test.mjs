import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  RELOAD_GUARD_KEY, pageRevision, revisionMismatch, reloadOnceForRevision,
  clearRevisionReloadGuard, syncRevisionFromHealth, importOrReload,
  formFieldsDirty, resetDeferredRevisionReload,
} from '../public/rev.mjs';

test('pageRevision reads /r/<sha>/ from the module script src', () => {
  const doc = {
    querySelector() {
      return {getAttribute: () => '/r/deadbeef0123/app.js'};
    },
  };
  assert.equal(pageRevision(doc, 'http://127.0.0.1/app.js'), 'deadbeef0123');
  assert.equal(pageRevision({querySelector: () => null}, 'http://127.0.0.1/r/cafebabe99/rev.mjs'), 'cafebabe99');
  assert.equal(pageRevision({querySelector: () => null}, 'http://127.0.0.1/app.js'), '');
});

test('revisionMismatch ignores development and empty sides', () => {
  assert.equal(revisionMismatch('', 'abc'), false);
  assert.equal(revisionMismatch('abc', ''), false);
  assert.equal(revisionMismatch('abc', 'development'), false);
  assert.equal(revisionMismatch('abc', 'abc'), false);
  assert.equal(revisionMismatch('oldrev', 'newrev'), true);
});

test('formFieldsDirty compares value to defaultValue', () => {
  const clean = {querySelectorAll: () => [{type: 'email', value: '', defaultValue: '', disabled: false}]};
  const dirty = {querySelectorAll: () => [{type: 'email', value: 'a@b.c', defaultValue: '', disabled: false}]};
  assert.equal(formFieldsDirty(clean), false);
  assert.equal(formFieldsDirty(dirty), true);
});

test('reloadOnceForRevision fires once then guards', () => {
  resetDeferredRevisionReload();
  const store = new Map();
  const storage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k),
  };
  let reloads = 0;
  const loc = {reload: () => { reloads += 1; }};
  assert.equal(reloadOnceForRevision(storage, loc), true);
  assert.equal(reloads, 1);
  assert.equal(storage.getItem(RELOAD_GUARD_KEY), '1');
  assert.equal(reloadOnceForRevision(storage, loc), false);
  assert.equal(reloads, 1);
  clearRevisionReloadGuard(storage);
  assert.equal(storage.getItem(RELOAD_GUARD_KEY), null);
  assert.equal(reloadOnceForRevision(storage, loc), true);
  assert.equal(reloads, 2);
});

test('syncRevisionFromHealth reloads on mismatch and clears the guard on match', () => {
  const store = new Map();
  const storage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k),
  };
  let reloads = 0;
  const loc = {reload: () => { reloads += 1; }};
  const doc = {querySelector: () => ({getAttribute: () => '/r/pageRev01/app.js'})};
  assert.equal(syncRevisionFromHealth({revision: 'otherRev01'}, {document: doc, storage, location: loc}), true);
  assert.equal(reloads, 1);
  assert.equal(syncRevisionFromHealth({revision: 'otherRev01'}, {document: doc, storage, location: loc}), false);
  assert.equal(reloads, 1);
  store.clear();
  assert.equal(syncRevisionFromHealth({revision: 'pageRev01'}, {document: doc, storage, location: loc}), false);
  assert.equal(reloads, 1);
  assert.equal(storage.getItem(RELOAD_GUARD_KEY), null);
});

function memoryStorage() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k),
  };
}

test('reloadOnceForRevision defers while a form field is dirty', () => {
  resetDeferredRevisionReload();
  const store = new Map();
  const storage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k),
  };
  let reloads = 0;
  const loc = {reload: () => { reloads += 1; }};
  const field = {type: 'email', value: 'typed@example.test', defaultValue: '', disabled: false};
  const listeners = [];
  const eventTarget = {
    addEventListener(type, fn) { listeners.push([type, fn]); },
  };
  let idleCb;
  assert.equal(reloadOnceForRevision(storage, loc, {
    document: {querySelectorAll: () => [field], addEventListener() {}},
    eventTarget,
    requestIdleCallback: cb => { idleCb = cb; },
  }), false);
  assert.equal(reloads, 0);
  idleCb();
  assert.equal(reloads, 0, 'idle does not reload while dirty');
  field.value = '';
  const hash = listeners.find(([type]) => type === 'hashchange');
  assert.ok(hash);
  hash[1]();
  assert.equal(reloads, 1);
  assert.equal(storage.getItem(RELOAD_GUARD_KEY), '1');
});

test('importOrReload reloads once when the specifier is missing', async () => {
  const storage = memoryStorage();
  let reloads = 0;
  const loc = {reload: () => { reloads += 1; }};
  await assert.rejects(() => importOrReload('./nope-missing-chunk.mjs', {
    health: null, storage, location: loc,
  }));
  assert.equal(reloads, 1);
  await assert.rejects(() => importOrReload('./nope-missing-chunk.mjs', {
    health: null, storage, location: loc,
  }));
  assert.equal(reloads, 1);
});

test('importOrReload reloads once when /api/health revision differs', async () => {
  const storage = memoryStorage();
  let reloads = 0;
  const loc = {reload: () => { reloads += 1; }};
  const doc = {querySelector: () => ({getAttribute: () => '/r/pageRev01/app.js'})};
  await assert.rejects(() => importOrReload('./def-short.mjs', {
    health: {revision: 'otherRev01'}, document: doc, storage, location: loc,
  }));
  assert.equal(reloads, 1);
  const mod = await importOrReload('./def-short.mjs', {
    health: {revision: 'pageRev01'}, document: doc, storage, location: loc,
  });
  assert.equal(typeof mod.DEF_SHORT, 'string');
  assert.equal(reloads, 1);
});
