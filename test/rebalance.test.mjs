import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {templates, rebalanceToTarget, createTake, activate} from '../lib/engine.mjs';

test('rebalance endpoint guards auth, version, math, and never calls IOL', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'reb-'));
  const iolCalls = [];
  const iolFetcher = async url => {
    iolCalls.push(url);
    return {ok: true, json: async () => ({})};
  };
  const app = createApp({dataDir: dir, password: 'rebalance-test-pass', apiKey: 'x', port: 0, seed: false, iolFetcher});
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    assert.equal((await fetch(base + '/api/takes/x/rebalance', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'})).status, 401);
    const login = await fetch(base + '/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password: 'rebalance-test-pass'})});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = {Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:' + app.server.address().port};
    assert.equal((await fetch(base + '/api/takes/nope/rebalance', {method: 'POST', headers, body: JSON.stringify({version: 1})})).status, 404);
    const make = await fetch(base + '/api/takes', {method: 'POST', headers, body: JSON.stringify({proposal: templates[1]})});
    const take = await make.json();
    await fetch(base + `/api/takes/${take.id}/activate`, {method: 'POST', headers, body: JSON.stringify({amount: 1024000})});
    const draft = await (await fetch(base + '/api/takes', {method: 'POST', headers, body: JSON.stringify({proposal: templates[2]})})).json();
    assert.equal((await fetch(base + `/api/takes/${draft.id}/rebalance`, {method: 'POST', headers, body: JSON.stringify({version: 1})})).status, 409);
    const active = app.store.take(take.id);
    active.holdings.find(h => h.ticker === 'YPF').units = 16;
    active.version = (active.version || 1) + 1;
    app.store.putTake(active);
    const stale = await fetch(base + `/api/takes/${take.id}/rebalance`, {method: 'POST', headers, body: JSON.stringify({version: 1})});
    assert.equal(stale.status, 409);
    const fresh = app.store.take(take.id);
    const reb = await fetch(base + `/api/takes/${take.id}/rebalance`, {method: 'POST', headers, body: JSON.stringify({version: fresh.version})});
    assert.equal(reb.status, 200);
    const body = await reb.json();
    assert.ok(body.take.events.some(e => e.type === 'rebalance_applied'));
    assert.equal(iolCalls.length, 0);
    await fetch(base + `/api/takes/${take.id}/archive`, {method: 'POST', headers, body: '{}'});
    const archived = app.store.take(take.id);
    assert.equal((await fetch(base + `/api/takes/${take.id}/rebalance`, {method: 'POST', headers, body: JSON.stringify({version: archived.version})})).status, 409);
  } finally {
    await app.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('rebalanceToTarget adjusts units toward weights', () => {
  const t = createTake(templates[1]);
  activate(t, 1024000);
  const ypf = t.holdings.find(h => h.ticker === 'YPF');
  ypf.units = 16;
  const before = ypf.units;
  rebalanceToTarget(t);
  assert.ok(ypf.units <= before);
  assert.ok(t.events[0].type === 'rebalance_applied');
});
