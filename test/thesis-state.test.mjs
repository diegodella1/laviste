import test from 'node:test';
import assert from 'node:assert/strict';
import {createTake, activate, review, templates} from '../lib/engine.mjs';
import {holdingDerived, effectiveAttention, effectiveVerdict, portfolioRuleState} from '../lib/portfolio.mjs';
import {
  computeThesisState,
  viewStatusSnapshot,
  viewsAgree,
  roundsToCapDisplay,
  formatCapMotivo,
  countByAttention,
  takeMatchesAttention,
} from '../lib/thesis-state.mjs';
import {pct1, pctInt, NNBSP} from '../lib/format.mjs';
import {VERDICT_NO_ACTION} from '../lib/copy.mjs';
import {buildTimeline} from '../lib/timeline.mjs';

function takeWithActual(ticker, actualPct, {cap = 25, weight = 20, attention = 'track'} = {}) {
  const total = 1_000_000;
  const value = total * actualPct / 100;
  return {
    id: 't-state',
    phase: 'active',
    invested: total,
    cash: total - value,
    attention,
    attentionReason: '',
    checkedAt: '2026-10-15T20:38:00.000Z',
    settings: {cap, drift: 5, cadence: 'standard', mode: 'ask', paused: false},
    holdings: [{ticker, name: ticker, units: 1, price: value, weight, bucket: 'Energía'}],
    events: [],
  };
}

test('cap compare uses unrounded weight: 24.96 / 25.00 / 25.04 vs tope 25', () => {
  const cases = [
    {actual: 24.96, breach: false, display: `25,0${NNBSP}%`},
    {actual: 25.00, breach: false, display: `25,0${NNBSP}%`},
    {actual: 25.04, breach: true, display: `25,0${NNBSP}%`},
  ];
  for (const c of cases) {
    const t = takeWithActual('VIST', c.actual);
    const d = holdingDerived(t, t.holdings[0]);
    assert.equal(d.ruleChip === 'cap', c.breach, `breach ${c.actual}`);
    assert.equal(pct1(d.actual), c.display, `display ${c.actual}`);
    const st = computeThesisState(t);
    if (c.breach) {
      assert.equal(st.attention, 'review');
      assert.match(st.motivo, /supera el tope/);
      assert.ok(!st.motivo.includes('(redondeado)'));
    } else {
      assert.equal(st.attention, 'track');
      assert.ok(roundsToCapDisplay(d.actual, d.cap));
      assert.match(st.motivo, /redondeado/);
      assert.match(st.motivo, /dentro del tope/);
    }
    assert.ok(!st.motivo.includes('25.0'));
  }
});

test('stale chequeo 25.0% cannot disagree with live 22.5% Dentro', () => {
  const t = takeWithActual('VIST', 22.5, {weight: 22, attention: 'review'});
  t.attentionReason = 'VIST 25.0% > tope 25%';
  t.events = [{
    id: 'old',
    at: '2026-10-15T20:38:00.000Z',
    type: 'chequeo',
    title: 'Chequeo de reglas',
    body: 'Hay una posición por encima del límite de concentración.',
    verdict: 'action',
    verdictText: 'Acción sugerida: revisar concentración o desvíos',
    ruleCite: 'VIST 25.0% > tope 25%',
  }];
  const {items, verdict} = buildTimeline(t, [], []);
  const live = portfolioRuleState(t);
  assert.equal(live.hasCapBreach, false);
  const d = holdingDerived(t, t.holdings[0]);
  assert.equal(d.ruleChip, 'ok');
  const att = effectiveAttention(t, items);
  assert.equal(att.attention, 'track');
  const ev = effectiveVerdict(t, verdict);
  assert.equal(ev.kind, 'none');
  const snap = viewStatusSnapshot(t, {timelineItems: items, quotesAsOf: '2026-10-15T19:27:00.000Z'});
  assert.equal(snap.home.attention, 'track');
  assert.equal(snap.posiciones[0].statusLabel, 'Dentro');
  assert.equal(snap.novedades.title, VERDICT_NO_ACTION);
  assert.ok(viewsAgree(snap));
  assert.ok(!snap.home.motivo.includes('25.0'));
  assert.match(snap.header.metaLine, /precios de las/);
});

test('attention counts and filter use computeThesisState, not persisted chequeo', () => {
  const stale = takeWithActual('VIST', 22.5, {weight: 22, attention: 'review'});
  stale.attentionReason = 'VIST 25.0% > tope 25%';
  stale.phase = 'active';
  const liveReview = takeWithActual('YPF', 26, {attention: 'track'});
  liveReview.phase = 'active';
  const counts = countByAttention([stale, liveReview]);
  assert.equal(counts.track, 1);
  assert.equal(counts.review, 1);
  assert.equal(takeMatchesAttention(stale, 'review'), false);
  assert.equal(takeMatchesAttention(stale, 'track'), true);
  assert.equal(takeMatchesAttention(liveReview, 'review'), true);
});

test('Home, cabecera, Posiciones and Novedades share one state', () => {
  const over = takeWithActual('VIST', 25.04);
  const ok = takeWithActual('VIST', 22.5, {weight: 22});
  for (const t of [over, ok]) {
    const snap = viewStatusSnapshot(t, {quotesAsOf: t.checkedAt});
    assert.equal(snap.home.attention, snap.header.attention);
    assert.equal(snap.home.motivo, snap.header.motivo);
    assert.equal(snap.home.attention, snap.novedades.attention);
    assert.ok(viewsAgree(snap), JSON.stringify(snap));
  }
  const overSnap = viewStatusSnapshot(over);
  assert.equal(overSnap.home.attention, 'review');
  assert.equal(overSnap.posiciones[0].statusLabel, 'Sobre tope');
  assert.equal(overSnap.novedades.title, 'Hay algo para revisar');
  const okSnap = viewStatusSnapshot(ok);
  assert.equal(okSnap.posiciones[0].statusLabel, 'Dentro');
  assert.equal(okSnap.novedades.title, VERDICT_NO_ACTION);
});

test('formatCapMotivo uses es-AR comma and thin space, never 25.0%', () => {
  const s = formatCapMotivo('VIST', 25.04, 25);
  assert.equal(s, `VIST 25,0${NNBSP}% supera el tope de ${pctInt(25)}.`);
  assert.ok(!s.includes('25.0'));
  const r = formatCapMotivo('VIST', 24.96, 25, {roundedWithin: true});
  assert.match(r, /redondeado/);
});

test('news review is kept when live weights are Dentro', () => {
  const t = takeWithActual('VIST', 22.5, {weight: 22, attention: 'review'});
  t.attentionReason = 'Se necesita confirmar adopción.';
  const snap = viewStatusSnapshot(t);
  assert.equal(snap.home.attention, 'review');
  assert.equal(snap.home.motivo, 'Se necesita confirmar adopción.');
  assert.equal(snap.posiciones[0].statusLabel, 'Dentro');
  assert.ok(viewsAgree(snap));
});

test('live cap without chequeo still elevates review', () => {
  const t = takeWithActual('YPF', 26);
  assert.ok(portfolioRuleState(t).hasCapBreach);
  assert.equal(effectiveAttention(t, []).attention, 'review');
  assert.equal(computeThesisState(t).attention, 'review');
});

test('createTake + review does not store ASCII-dot percents', () => {
  const t = createTake(templates[0]);
  activate(t, 1_000_000);
  t.holdings[0].price = t.holdings[0].price * 1.5;
  review(t, 'check');
  const cite = t.events[0].ruleCite || '';
  assert.ok(!cite.includes('.0%'), cite);
  if (cite) assert.ok(cite.includes(',') || cite.includes(NNBSP), cite);
});
