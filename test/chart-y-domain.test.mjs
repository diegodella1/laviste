import test from 'node:test';
import assert from 'node:assert/strict';
import {computeChartYExtents} from '../public/chart-suizo.mjs';
import {uniqueArsAxisLabels} from '../public/format.mjs';

test('flat ~1M value and capital get padded band (not y=0)', () => {
  const capital = 1_000_000;
  const vals = [1_000_000, 1_008_790, capital];
  const {ymin, ymax} = computeChartYExtents(vals, 'ars', 0.1);
  assert.ok(ymin > 900_000, `ymin ${ymin} should stay near 1M`);
  assert.ok(ymax < 1_150_000, `ymax ${ymax} should stay near 1M`);
  assert.ok(ymax - ymin < 250_000, 'band should be tight around 1M');
  const values = [];
  for (let g = 0; g <= 4; g++) values.push(ymin + ((ymax - ymin) * g) / 4);
  const ticks = uniqueArsAxisLabels(values);
  assert.equal(new Set(ticks).size, ticks.length, ticks.join('|'));
  assert.ok(ticks.some(t => /1,\d/.test(t) && /M/.test(t)), ticks.join('|'));
  assert.ok(!ticks.some(t => /0,0/.test(t) && /M/.test(t)), ticks.join('|'));
});

test('growth from zero still anchors at 0 when series starts near origin', () => {
  const vals = [0, 250_000, 500_000, 1_000_000];
  const {ymin} = computeChartYExtents(vals, 'ars', 0.1);
  assert.equal(ymin, 0);
});

test('multi-thesis seeded band keeps millions ticks', () => {
  const vals = [2_100_000, 2_150_000, 2_180_000, 2_220_000, 2_250_000, 2_250_000];
  const {ymin, ymax} = computeChartYExtents(vals, 'ars', 0.1);
  const values = [];
  for (let g = 0; g <= 4; g++) values.push(ymin + ((ymax - ymin) * g) / 4);
  const ticks = uniqueArsAxisLabels(values);
  assert.equal(new Set(ticks).size, ticks.length, ticks.join('|'));
  assert.ok(ticks.some(t => /2,\d/.test(t) && /M/.test(t)), ticks.join('|'));
  assert.ok(!ticks.every(t => /0,0/.test(t)), ticks.join('|'));
});
