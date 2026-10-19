import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

test('IOL routes are unreachable when FEATURE_IOL is off', async () => {
  const prev = process.env.FEATURE_IOL;
  process.env.FEATURE_IOL = '0';
  const dir = mkdtempSync(join(tmpdir(), 'iol-off-'));
  const app = createApp({dataDir: dir, password: 'test-password-only', apiKey: '', port: 0, quotesLive: false});
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const login = await fetch(base + '/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: 'diego@diegodella.ar', password: 'test-password-only'})});
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = {Cookie: cookie, 'Content-Type': 'application/json'};
  const state = await (await fetch(base + '/api/state', {headers})).json();
  assert.equal(state.config.iolEnabled, false);
  const connect = await fetch(base + '/api/integrations/iol', {method: 'POST', headers, body: JSON.stringify({username: 'u', password: 'p'})});
  assert.equal(connect.status, 404);
  await app.close();
  rmSync(dir, {recursive: true, force: true});
  if (prev === undefined) delete process.env.FEATURE_IOL;
  else process.env.FEATURE_IOL = prev;
});

test('IOL routes work when FEATURE_IOL is on', async () => {
  const prev = process.env.FEATURE_IOL;
  process.env.FEATURE_IOL = '1';
  const dir = mkdtempSync(join(tmpdir(), 'iol-on-'));
  const key = join(dir, 'master.key');
  writeFileSync(key, '12'.repeat(32));
  const app = createApp({
    dataDir: dir, password: 'test-password-only', apiKey: '', port: 0, quotesLive: false, masterKeyPath: key,
    iolFetcher: async url => ({ok: true, json: async () => (url.endsWith('/token') ? {access_token: 'a', refresh_token: 'b', expires_in: 900} : {cuentas: []})}),
  });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const login = await fetch(base + '/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: 'diego@diegodella.ar', password: 'test-password-only'})});
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = {Cookie: cookie, 'Content-Type': 'application/json'};
  const connect = await fetch(base + '/api/integrations/iol', {method: 'POST', headers, body: JSON.stringify({username: 'u', password: 'p'})});
  assert.equal(connect.status, 200);
  await app.close();
  rmSync(dir, {recursive: true, force: true});
  if (prev === undefined) delete process.env.FEATURE_IOL;
  else process.env.FEATURE_IOL = prev;
});
