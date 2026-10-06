import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioSeriesARS} from '../public/math.js';

test('aggregate ARS series starts when every take is active (no partial jump)', () => {
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
  assert.ok(h.every(p => p.at >= '2026-01-03'), 'must drop timestamps before last activation');
  assert.equal(h[0].value, 1010);
  assert.equal(h[0].benchmark, 1000);
  assert.ok(h.every(p => p.benchmark === 1000));
});
