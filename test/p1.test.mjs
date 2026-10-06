import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {holdingDerived, effectiveAttention, effectiveVerdict, portfolioRuleState, proposalDiff, targetDiff, money, relatedNews} from '../lib/portfolio.mjs';
import {VERDICT_NO_ACTION} from '../lib/copy.mjs';
import {buildTimeline} from '../lib/timeline.mjs';
import {createTake, activate, review} from '../lib/engine.mjs';
import {templates} from '../lib/engine.mjs';

test('holdingDerived YPF band math', () => {
  const t = createTake(templates[0]);
  activate(t, 1024000);
  const ypf = t.holdings.find(h => h.ticker === 'YPF');
  t.cash = 760000;
  for (const h of t.holdings) {
    if (h.ticker !== 'YPF') {
      h.units = 0;
      h.price = h.entryPrice;
    }
  }
  ypf.units = 15;
  ypf.price = 17600;
  const d = holdingDerived(t, ypf);
  assert.ok(Math.abs(d.actual - 25.8) < 0.2);
  assert.equal(d.hi, 25);
});

test('effectiveAttention elevates watch on cap breach chequeo', () => {
  const t = createTake(templates[0]);
  activate(t, 1000000);
  t.attention = 'track';
  const ypf = t.holdings.find(h => h.ticker === 'YPF');
  ypf.units = 20;
  ypf.price = 20000;
  review(t, 'check');
  const {items} = buildTimeline(t, [], []);
  const eff = effectiveAttention(t, items);
  assert.equal(eff.attention, 'review');
});

test('effectiveAttention elevates review on live cap breach without fresh chequeo', () => {
  const t = createTake(templates[0]);
  activate(t, 1000000);
  t.attention = 'track';
  const ypf = t.holdings.find(h => h.ticker === 'YPF');
  t.cash = 760000;
  for (const h of t.holdings) {
    if (h.ticker !== 'YPF') {
      h.units = 0;
      h.price = h.entryPrice;
    }
  }
  ypf.units = 15;
  ypf.price = 17600;
  assert.ok(portfolioRuleState(t).hasCapBreach);
  const eff = effectiveAttention(t, []);
  assert.equal(eff.attention, 'review');
});

test('effectiveVerdict overrides stale no-action when live cap breach', () => {
  const t = createTake(templates[0]);
  activate(t, 1000000);
  const ypf = t.holdings.find(h => h.ticker === 'YPF');
  t.cash = 760000;
  for (const h of t.holdings) {
    if (h.ticker !== 'YPF') {
      h.units = 0;
      h.price = h.entryPrice;
    }
  }
  ypf.units = 15;
  ypf.price = 17600;
  const stale = {text: VERDICT_NO_ACTION, kind: 'none'};
  const eff = effectiveVerdict(t, stale);
  assert.equal(eff.kind, 'action');
  assert.ok(eff.ruleCite?.includes('> tope'));
});

test('proposalDiff detects changes', () => {
  const a = structuredClone(templates[0]);
  const b = structuredClone(templates[0]);
  b.holdings[0].weight = 20;
  const d = proposalDiff(a, b);
  assert.equal(d.changed.length, 1);
});

test('money uses ARS locale glyph', () => {
  const s = money(1024000);
  assert.ok(s.includes('1.024.000') || s.includes('1 024 000'));
  assert.ok(!s.includes('US$'));
});

test('timeline files stay identical', () => {
  const lib = readFileSync('lib/timeline.mjs', 'utf8');
  const pub = readFileSync('public/timeline.mjs', 'utf8');
  assert.equal(lib, pub);
});

test('buildTimeline keys are stable', () => {
  const t = createTake(templates[0]);
  activate(t, 1000000);
  const {items} = buildTimeline(t, [], []);
  const keys = items.map(i => i.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every(Boolean));
});

test('relatedNews word boundary', () => {
  const reviews = [{takeId: 'x', events: [{title: 'YPFD note', fact: 'no', affected: 'YPFD'}]}];
  assert.equal(relatedNews(reviews, 'x', {ticker: 'YPF', name: 'Pampa Energía'}).length, 0);
  reviews[0].events.push({title: 'YPF sube', fact: 'YPF crece', affected: 'YPF'});
  assert.equal(relatedNews(reviews, 'x', {ticker: 'YPF', name: 'Pampa Energía'}).length, 1);
});
