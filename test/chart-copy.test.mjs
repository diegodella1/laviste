import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chartSinglePointMessage, aggregatePracticeCapital} from '../public/chart-copy.mjs';
import {money} from '../public/format.mjs';

test('single-point chart copy uses practice capital, not index base', () => {
  const capital = 2_250_000;
  const msg = chartSinglePointMessage(capital, {quoteMeta: 'precio demorado · 14:30'});
  assert.ok(msg.includes(money(capital)), 'should show formatted ARS capital');
  assert.ok(!msg.includes(money(100)), 'must not show index base as money');
  assert.ok(!msg.includes('La cartera empieza'), 'replaces old copy');
  assert.match(msg, /primer chequeo · precio demorado · 14:30/);
  assert.ok(!msg.includes('. precio'), 'meta joins with middle dot, not sentence break');
});

test('single-point chart copy falls back without capital', () => {
  const msg = chartSinglePointMessage(0, {quoteMeta: 'precio demorado · 14:30'});
  assert.equal(msg, 'El gráfico aparece con el primer chequeo · precio demorado · 14:30');
});

test('thesis scope uses tesis wording', () => {
  const msg = chartSinglePointMessage(750_000, {scope: 'thesis', quoteMeta: 'precio demorado · 10:00'});
  assert.ok(msg.startsWith('Tu tesis arranca con'));
  assert.ok(msg.includes(money(750_000)));
});

test('aggregatePracticeCapital sums active invested only', () => {
  const sum = aggregatePracticeCapital([
    {phase: 'active', invested: 1_000_000},
    {phase: 'archived', invested: 250_000},
    {phase: 'draft', invested: 999_999},
  ]);
  assert.equal(sum, 1_000_000);
});
