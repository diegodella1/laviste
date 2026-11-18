/**
 * «Explicaciones con texto asistido por IA»: apagado por defecto, sin red, y siempre con
 * plantilla determinista en español si la IA está apagada, falla, tarda o devuelve algo inválido.
 */
import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {applyAiExplanations, validateAiExplanation, explanationFacts} from '../lib/digest-ai.mjs';
import {DIGEST_SUPERTAKE_PROPOSALS, buildSupertakeEmail} from '../lib/digest-supertake.mjs';
import {templateExplanation} from '../lib/email-templates/supertake-copy.mjs';
import {FIXTURE_DOWN, cloneFixture} from './fixtures/digest-supertake-fixtures.mjs';

const quiet = {error: () => {}};
let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('network calls are not allowed in digest AI tests');
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function changed(data) {
  return data.theses.filter(t => t.statusPrev && t.status !== t.statusPrev);
}

test('AI explanations are OFF by default (proposal f) and use the template', async () => {
  assert.equal(DIGEST_SUPERTAKE_PROPOSALS.aiExplanations, false);
  let calls = 0;
  const out = await applyAiExplanations(cloneFixture(FIXTURE_DOWN), {generate: () => { calls++; return 'x'; }, logger: quiet});
  assert.equal(calls, 0, 'generator never called while disabled');
  for (const t of changed(out)) {
    assert.equal(t.explanationSource, 'template');
    assert.equal(t.explanation, templateExplanation(t));
  }
});

test('enabled but no generator → template', async () => {
  const out = await applyAiExplanations(cloneFixture(FIXTURE_DOWN), {enabled: true, logger: quiet});
  assert.ok(changed(out).every(t => t.explanationSource === 'template'));
});

test('generator throws → template fallback, nothing leaks', async () => {
  const logs = [];
  const out = await applyAiExplanations(cloneFixture(FIXTURE_DOWN), {
    enabled: true,
    generate: async () => { throw new Error('boom secret-ish detail'); },
    logger: {error: l => logs.push(l)},
  });
  assert.ok(changed(out).every(t => t.explanationSource === 'template'));
  assert.ok(logs.every(l => !l.includes('secret-ish')));
});

test('generator times out → template fallback', async () => {
  const timers = [];
  try {
    const out = await applyAiExplanations(cloneFixture(FIXTURE_DOWN), {
      enabled: true,
      timeoutMs: 20,
      generate: () => new Promise(resolve => {
        timers.push(setTimeout(() => resolve('tarde'), 500));
      }),
      logger: quiet,
    });
    assert.ok(changed(out).every(t => t.explanationSource === 'template'));
  } finally {
    for (const id of timers) clearTimeout(id);
  }
});

test('invalid AI text (amounts, English, invented numbers, missing closer) → template', async () => {
  const t = cloneFixture(FIXTURE_DOWN).theses[0];
  const facts = explanationFacts(t);
  const bad = [
    `YPF cayó y la cartera perdió $ 12.000; por ahora es ruido de mercado.`,
    `YPF fell today and dragged the thesis; ruido de mercado.`,
    `YPF cayó ${facts.topMover.dayPct} y el sector bajó 7 %; por ahora lo leemos como ruido de mercado.`,
    `YPF cayó ${facts.topMover.dayPct} y llevó a la tesis a ${facts.dayPct} hoy, así que la vigilamos.`,
    'corto',
  ];
  for (const text of bad) assert.equal(validateAiExplanation(text, facts), false, text);
  const out = await applyAiExplanations(cloneFixture(FIXTURE_DOWN), {enabled: true, generate: async () => bad[0], logger: quiet});
  assert.ok(changed(out).every(x => x.explanationSource === 'template'));
});

test('valid Spanish AI text is accepted and rendered in HTML and TXT', async () => {
  const generate = async facts => facts.topMover
    ? `${facts.topMover.ticker} cayó ${facts.topMover.dayPct} y arrastró a la tesis a ${facts.dayPct} hoy. La idea sigue en pie: por ahora lo leemos como ${facts.mustClose}.`
    : 'sin datos';
  const data = cloneFixture(FIXTURE_DOWN);
  data.theses = data.theses.filter(t => t.status === 'watch');
  const out = await applyAiExplanations(data, {enabled: true, generate, logger: quiet});
  const [t] = changed(out);
  assert.equal(t.explanationSource, 'ai');
  const {bodyText, bodyHtml, view} = buildSupertakeEmail(out);
  assert.equal(view.changes[0].explanationSource, 'ai');
  assert.ok(bodyText.includes(`| ${t.explanation}`));
  assert.ok(bodyHtml.includes('arrastró a la tesis'));
});

test('facts handed to the AI carry only percentages and labels, never ids or amounts', () => {
  const facts = explanationFacts(cloneFixture(FIXTURE_DOWN).theses[0]);
  const json = JSON.stringify(facts);
  assert.ok(!json.includes('energia-local'), 'no thesis id');
  assert.ok(!/weightPct|contributionPct|value|invested/.test(json));
  assert.equal(facts.mustClose, 'ruido de mercado');
});
