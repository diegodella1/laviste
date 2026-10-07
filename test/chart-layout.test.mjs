import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chartPads,
  chartShowEndLabels,
  pickXTickIndices,
  CHART_PAD_R_COMPACT,
  CHART_PAD_R_WIDE,
  X_TICK_MIN_PX,
} from '../public/chart-suizo.mjs';

test('360/390 hide end labels and use compact right pad', () => {
  for (const w of [360, 390]) {
    assert.equal(chartShowEndLabels(w), false);
    const pads = chartPads(w);
    assert.equal(pads.padR, CHART_PAD_R_COMPACT);
    assert.ok(pads.padL >= 48);
    const n = 9;
    const plotW = w - pads.padL - pads.padR;
    const X = i => pads.padL + (i / (n - 1)) * plotW;
    const idx = pickXTickIndices(n, w, X_TICK_MIN_PX, pads.padL, pads.padR);
    assert.equal(idx[0], 0);
    assert.equal(idx[idx.length - 1], n - 1);
    for (let k = 1; k < idx.length; k++) {
      assert.ok(X(idx[k]) - X(idx[k - 1]) >= 55.5, `gap at ${w}px`);
    }
  }
});

test('wide charts keep room for end labels', () => {
  assert.equal(chartShowEndLabels(640), true);
  assert.equal(chartShowEndLabels(1440), true);
  assert.equal(chartPads(1440).padR, CHART_PAD_R_WIDE);
});
