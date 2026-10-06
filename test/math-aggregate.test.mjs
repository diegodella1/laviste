import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioSeriesARS} from '../public/math.js';

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
