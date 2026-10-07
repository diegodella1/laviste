import test from 'node:test';
import assert from 'node:assert/strict';
import {pickXTickIndices, chartPads} from '../public/chart-suizo.mjs';

test('pickXTickIndices enforces minimum pixel gap on narrow charts', () => {
  const w = 390;
  const {padL, padR} = chartPads(w);
  const plotW = w - padL - padR;
  const n = 9;
  const X = i => padL + (i / (n - 1)) * plotW;
  const idx = pickXTickIndices(n, w, 56, padL, padR);
  assert.ok(idx.length >= 2);
  assert.equal(idx[0], 0);
  assert.equal(idx[idx.length - 1], n - 1);
  for (let k = 1; k < idx.length; k++) {
    assert.ok(X(idx[k]) - X(idx[k - 1]) >= 55.5, `gap too small between ${idx[k - 1]} and ${idx[k]}`);
  }
  assert.ok(idx.length <= 5, `expected thinned ticks, got ${idx.length}`);
});
