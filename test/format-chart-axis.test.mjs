import test from 'node:test';
import assert from 'node:assert/strict';
import {computeChartYExtents} from '../public/chart-suizo.mjs';
import {moneyCompactArsAxis} from '../public/format.mjs';

test('moneyCompactArsAxis formats ~2.2M as one decimal millions', () => {
  assert.equal(moneyCompactArsAxis(2_200_000), '$ 2,2 M');
  assert.equal(moneyCompactArsAxis(2_250_000), '$ 2,3 M');
  assert.ok(!moneyCompactArsAxis(2_200_000).includes('0,0 M'));
});

test('moneyCompactArsAxis avoids sub-million M ticks', () => {
  assert.equal(moneyCompactArsAxis(850_000), '$ 850 mil');
  assert.ok(!moneyCompactArsAxis(850_000).includes(' M'));
});

test('seeded home chart tick range does not collapse to 0,0 M', () => {
  const capital = 2_250_000;
  const vals = [2_100_000, 2_150_000, 2_180_000, 2_220_000, 2_250_000, capital];
  const {ymin, ymax} = computeChartYExtents(vals, 'ars', 0.1);
  const ticks = [];
  for (let g = 0; g <= 4; g++) {
    const gv = ymin + ((ymax - ymin) * g) / 4;
    ticks.push(moneyCompactArsAxis(gv));
  }
  assert.ok(ticks.some(t => /2,[0-9] M/.test(t)), ticks.join('|'));
  assert.ok(!ticks.every(t => t === '$ 0,0 M'), ticks.join('|'));
});
