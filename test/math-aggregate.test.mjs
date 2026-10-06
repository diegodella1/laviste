import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioSeriesARS, artDayKey} from '../public/math.js';

test('aggregate ARS capital line steps when theses activate on different dates', () => {
  const ts = [
    {
      phase: 'active',
      invested: 100,
      activatedAt: '2026-01-01T12:00:00.000Z',
      history: [
        {at: '2026-01-01T12:00:00.000Z', value: 100, benchmark: 100},
        {at: '2026-01-02T12:00:00.000Z', value: 110, benchmark: 105},
      ],
    },
    {
      phase: 'active',
      invested: 900,
      activatedAt: '2026-01-03T12:00:00.000Z',
      history: [{at: '2026-01-03T12:00:00.000Z', value: 900, benchmark: 900}],
    },
  ];
  const h = portfolioSeriesARS(ts);
  const early = h.filter(p => p.at < '2026-01-03');
  assert.ok(early.length >= 2, 'includes days before second activation');
  assert.ok(early.every(p => p.benchmark === 100), 'capital steps at first thesis only');
  assert.ok(early.every(p => p.value <= 110));
  const late = h.filter(p => p.at >= '2026-01-03');
  assert.ok(late.every(p => p.benchmark === 1000));
  assert.equal(late.at(-1).value, 1010);
});

test('capital and value step on the same ART bucket (no phantom drawdown)', () => {
  const ts = [
    {
      phase: 'active',
      invested: 750_000,
      activatedAt: '2026-10-01T15:00:00.000Z',
      history: [
        {at: '2026-10-01T15:00:00.000Z', value: 750_000, benchmark: 750_000},
        {at: '2026-10-05T18:00:00.000Z', value: 700_000, benchmark: 745_000},
      ],
    },
    {
      phase: 'active',
      invested: 1_000_000,
      activatedAt: '2026-10-06T03:00:00.000Z',
      history: [{at: '2026-10-06T03:00:00.000Z', value: 1_000_000, benchmark: 1_000_000}],
    },
    {
      phase: 'active',
      invested: 500_000,
      activatedAt: '2026-10-06T03:05:00.000Z',
      history: [{at: '2026-10-06T03:05:00.000Z', value: 500_000, benchmark: 500_000}],
    },
  ];
  const h = portfolioSeriesARS(ts);
  for (let i = 1; i < h.length; i++) {
    if (h[i].benchmark !== h[i - 1].benchmark) {
      assert.ok(
        h[i].value > h[i - 1].value,
        'valor must step up on the same x-point where capital steps',
      );
    }
  }
  for (const p of h) {
    assert.ok(
      p.value >= p.benchmark * 0.45,
      `no phantom loss at ${p.at}: capital ${p.benchmark} vs value ${p.value}`,
    );
  }
  assert.equal(h.at(-1).benchmark, 2_250_000);
  assert.equal(h.at(-1).value, 700_000 + 1_000_000 + 500_000);
});

test('activation near midnight ART buckets on the local calendar day', () => {
  const at = '2026-03-15T02:30:00.000Z';
  assert.equal(artDayKey(at), '2026-03-14');
  const ts = [
    {
      phase: 'active',
      invested: 200,
      activatedAt: '2026-03-10T15:00:00.000Z',
      history: [{at: '2026-03-10T15:00:00.000Z', value: 200, benchmark: 200}],
    },
    {
      phase: 'active',
      invested: 300,
      activatedAt: at,
      history: [{at, value: 300, benchmark: 300}],
    },
  ];
  const h = portfolioSeriesARS(ts);
  const step = h.find(p => p.benchmark === 500);
  assert.ok(step, 'includes combined capital');
  assert.equal(artDayKey(step.at), '2026-03-14');
  assert.equal(step.value, 500);
});
