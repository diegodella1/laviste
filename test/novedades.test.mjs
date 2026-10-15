import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldHideSuggestedAction,
  groupNovedades,
  isUnchangedChequeo,
  formatDayHeading,
  emptyNovedadesCopy,
  NOVEDADES_PAGE_SIZE,
} from '../lib/novedades.mjs';
import {computeThesisState} from '../lib/thesis-state.mjs';
import {VERDICT_NO_ACTION} from '../lib/copy.mjs';

test('suggested action equal to body is hidden', () => {
  const body = 'Revisá los pesos de VIST.';
  assert.equal(shouldHideSuggestedAction('Acción sugerida: Revisá los pesos de VIST.', body), true);
  assert.equal(shouldHideSuggestedAction('revisá los pesos de vist.', body), true);
  assert.equal(shouldHideSuggestedAction('Acción sugerida: bajá VIST al 22 %.', body), false);
});

test('Acción sugerida is hidden when live estado is sin acción', () => {
  const action = 'Acción sugerida: revisar concentración o desvíos';
  const body = 'Hay una posición por encima del límite de concentración.';
  assert.equal(shouldHideSuggestedAction(action, body), false);
  assert.equal(shouldHideSuggestedAction(action, body, {pageNoAction: true}), true);
  const ok = computeThesisState({
    phase: 'active', invested: 1_000_000, cash: 800_000, attention: 'track',
    settings: {cap: 25, drift: 5},
    holdings: [{ticker: 'VIST', units: 1, price: 200_000, weight: 20}],
  });
  assert.equal(ok.verdict.kind, 'none');
  assert.equal(shouldHideSuggestedAction(action, body, {pageNoAction: ok.verdict.kind === 'none'}), true);
});

test('one verdict: Revisar never ships alongside Sin acción necesaria', () => {
  const review = computeThesisState({
    phase: 'active', invested: 1_000_000, cash: 740_000, attention: 'track',
    settings: {cap: 25, drift: 5},
    holdings: [{ticker: 'VIST', units: 1, price: 260_000, weight: 20}],
  });
  const ok = computeThesisState({
    phase: 'active', invested: 1_000_000, cash: 800_000, attention: 'track',
    settings: {cap: 25, drift: 5},
    holdings: [{ticker: 'VIST', units: 1, price: 200_000, weight: 20}],
  });
  assert.equal(review.verdict.title, 'Hay algo para revisar');
  assert.notEqual(review.verdict.title, VERDICT_NO_ACTION);
  assert.equal(ok.verdict.title, VERDICT_NO_ACTION);
  assert.notEqual(ok.verdict.title, 'Hay algo para revisar');
});

test('groupNovedades caps at 20, 7 days, collapses unchanged chequeos', () => {
  const now = Date.parse('2026-10-15T20:00:00.000Z');
  const items = [];
  for (let i = 0; i < 12; i++) {
    items.push({
      key: `c-${i}`,
      at: new Date(now - i * 3600_000).toISOString(),
      type: 'chequeo',
      title: 'Chequeo de reglas',
      body: 'Sin cambios',
      verdict: 'none',
    });
  }
  items.unshift({
    key: 'n-1',
    at: new Date(now).toISOString(),
    type: 'news',
    title: 'Revisión de noticias',
    body: 'Pampa, Vista e YPF avanzan.',
    verdict: 'action',
  });
  const g = groupNovedades(items, {now, showAll: false});
  const collapsed = g.days.flatMap(d => d.cards).filter(c => c.kind === 'collapsed-chequeos');
  assert.ok(collapsed.length >= 1);
  assert.ok(collapsed[0].count >= 2);
  assert.ok(g.shownCount <= NOVEDADES_PAGE_SIZE);
  assert.equal(isUnchangedChequeo(items[1]), true);
});

test('Mostrar anteriores counts overflow', () => {
  const now = Date.parse('2026-10-15T12:00:00.000Z');
  const items = Array.from({length: 25}, (_, i) => ({
    key: `n-${i}`,
    at: new Date(now - i * 3600_000).toISOString(),
    type: 'news',
    title: 'Nota',
    body: 'x'.repeat(40),
    verdict: 'none',
  }));
  const g = groupNovedades(items, {now, showAll: false, pageSize: 20});
  assert.equal(g.shownCount, 20);
  assert.ok(g.hiddenCount >= 5);
  const all = groupNovedades(items, {now, showAll: true, pageSize: 20});
  assert.equal(all.shownCount, 25);
  assert.equal(all.hiddenCount, 0);
});

test('day heading and empty copy', () => {
  const now = new Date('2026-10-15T20:00:00.000Z');
  const h = formatDayHeading(now.toISOString(), now);
  assert.match(h, /Hoy/i);
  const empty = emptyNovedadesCopy({settings: {cadence: 'standard'}, nextCheckAt: '2026-10-15T20:30:00.000Z'});
  assert.match(empty, /Todavía no hay novedades/);
  assert.match(empty, /17:30|20:30|17\.30|20\.30/);
});
