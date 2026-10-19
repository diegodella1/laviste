import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTake, activate, templates, setDraftWeights, applyDraftProposal, updateSettings} from '../lib/engine.mjs';
import {createApp} from '../server.mjs';
import {
  ENTRY_PROPOSE_CTA, ENTRY_MANUAL_CTA, ENTRY_LEAD, ADJUST_AI_CTA, ADJUST_MANUAL_CTA,
  SETTINGS_ASK_NOTE, DRAFT_GUIDE,
} from '../public/copy.mjs';

const chatFetcher = async () => ({
  ok: true,
  json: async () => ({
    status: 'completed',
    output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({message: 'Propuesta lista', proposal: templates[1]})}]}],
    usage: {input_tokens: 1, output_tokens: 1},
  }),
});

function tmp() { return mkdtempSync(join(tmpdir(), 'p4-')); }

test('copy names Manual and Proponer without autopilot CTAs', () => {
  assert.equal(ENTRY_PROPOSE_CTA, 'Proponer cartera');
  assert.equal(ENTRY_MANUAL_CTA, 'Armar a mano');
  assert.match(ENTRY_LEAD, /No hay modo automático/);
  assert.match(SETTINGS_ASK_NOTE, /No hay ejecución automática/);
  assert.ok(ADJUST_AI_CTA);
  assert.ok(ADJUST_MANUAL_CTA);
  assert.ok(DRAFT_GUIDE);
  const appJs = readFileSync('public/app.js', 'utf8');
  assert.match(appJs, /#\/new\/proponer/);
  assert.match(appJs, /#\/new\/manual/);
  assert.ok(!appJs.includes('Autopilot'));
  assert.ok(!appJs.includes("mode: 'auto"));
  assert.ok(!appJs.includes('>Automático<'));
  assert.match(appJs, /mode: 'ask'/);
});

test('setDraftWeights edits a draft and rejects an active take', () => {
  const draft = createTake(templates[0]);
  const result = setDraftWeights(draft, draft.holdings.map(h => ({
    ticker: h.ticker,
    weight: h.ticker === 'YPF' ? 20 : h.weight,
  })));
  assert.equal(draft.holdings.find(h => h.ticker === 'YPF').weight, 20);
  assert.match(result.line, /YPF 25% → 20%/);
  const active = createTake(templates[0]);
  activate(active, 1_000_000);
  assert.throws(() => setDraftWeights(active, active.holdings.map(h => ({ticker: h.ticker, weight: h.weight}))), /borrador/);
});

test('applyDraftProposal replaces draft holdings from a chat proposal', () => {
  const draft = createTake(templates[0]);
  applyDraftProposal(draft, templates[1]);
  assert.equal(draft.title, templates[1].title);
  assert.deepEqual(draft.holdings.map(h => h.ticker), templates[1].holdings.map(h => h.ticker));
  const live = createTake(templates[0]);
  activate(live, 1_000_000);
  assert.throws(() => applyDraftProposal(live, templates[1]), /borrador/);
});

test('updateSettings still rejects any mode other than ask', () => {
  const t = createTake(templates[0]);
  assert.throws(() => updateSettings(t, {...t.settings, mode: 'autopilot'}), /autónoma/);
  assert.throws(() => updateSettings(t, {...t.settings, mode: 'auto'}), /autónoma/);
  updateSettings(t, {...t.settings, mode: 'ask', cadence: 'manual'});
  assert.equal(t.settings.mode, 'ask');
});

test('composition API and chat proposal sync stay in ask/confirm world', async () => {
  const dir = tmp();
  let app;
  const iolCalls = [];
  try {
    app = createApp({
      dataDir: dir, password: 'test-password-only', apiKey: 'test-key', port: 0, host: '127.0.0.1',
      seed: false, quotesLive: false, quotesFixture: true, fetcher: chatFetcher,
      iolFetcher: async url => { iolCalls.push(url); return {ok: true, json: async () => ({})}; },
    });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + app.server.address().port;
    const login = await fetch(origin + '/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: 'diego@diegodella.ar', password: 'test-password-only'})});
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = {Cookie: cookie, 'Content-Type': 'application/json', Origin: origin};

    const made = await fetch(origin + '/api/takes', {method: 'POST', headers, body: JSON.stringify({proposal: templates[0]})});
    assert.equal(made.status, 201);
    const draft = await made.json();
    assert.equal(draft.phase, 'draft');
    assert.equal(draft.settings.mode, 'ask');

    const weights = draft.holdings.map(h => ({ticker: h.ticker, weight: h.ticker === 'YPF' ? 18 : h.weight}));
    const composed = await fetch(origin + `/api/takes/${draft.id}/composition`, {method: 'POST', headers, body: JSON.stringify({weights})});
    assert.equal(composed.status, 200);
    const after = await composed.json();
    assert.equal(after.take.holdings.find(h => h.ticker === 'YPF').weight, 18);
    assert.equal(after.take.phase, 'draft');
    assert.equal(after.take.invested, 0);

    const chat = await (await fetch(origin + '/api/chats', {method: 'POST', headers, body: JSON.stringify({takeId: draft.id})})).json();
    const msg = await fetch(origin + `/api/chats/${chat.id}/messages`, {
      method: 'POST', headers, body: JSON.stringify({message: 'Proponé otra composición', adjusting: true}),
    });
    assert.equal(msg.status, 200);
    const synced = app.store.take(draft.id);
    assert.equal(synced.phase, 'draft');
    assert.equal(synced.title, templates[1].title);
    assert.deepEqual(synced.holdings.map(h => h.ticker), templates[1].holdings.map(h => h.ticker));

    await fetch(origin + `/api/takes/${draft.id}/activate`, {method: 'POST', headers, body: JSON.stringify({amount: 1_000_000})});
    const live = app.store.take(draft.id);
    const blocked = await fetch(origin + `/api/takes/${live.id}/composition`, {
      method: 'POST', headers, body: JSON.stringify({weights: live.holdings.map(h => ({ticker: h.ticker, weight: 20}))}),
    });
    assert.equal(blocked.status, 409);

    const settings = await fetch(origin + `/api/takes/${live.id}/settings`, {
      method: 'POST', headers,
      body: JSON.stringify({cadence: 'standard', mode: 'autopilot', cap: 25, drift: 5, paused: false, monitoringPaused: false}),
    });
    assert.equal(settings.status, 400);
    assert.equal(app.store.take(live.id).settings.mode, 'ask');
    assert.equal(iolCalls.length, 0);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
