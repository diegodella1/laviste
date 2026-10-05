import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBenchmark, indexLevelAt, BENCHMARKS} from '../lib/benchmark.mjs';

test('chooseBenchmark picks Merval for BYMA-heavy takes', () => {
  const local = [{ticker: 'YPF', weight: 25}, {ticker: 'PAM', weight: 25}, {ticker: 'VIST', weight: 25}, {ticker: 'GGAL', weight: 15}];
  assert.equal(chooseBenchmark(local).id, BENCHMARKS.MERV.id);
});

test('chooseBenchmark picks SPY CEDEAR for global/CEDEAR-heavy takes', () => {
  const cedear = [{ticker: 'NVDA', weight: 25}, {ticker: 'AMD', weight: 25}, {ticker: 'MSFT', weight: 20}, {ticker: 'GOOGL', weight: 15}];
  assert.equal(chooseBenchmark(cedear).id, BENCHMARKS.SPY_AR.id);
});

test('indexLevelAt scales invested capital with index move', () => {
  assert.equal(indexLevelAt({id: 'MERV'}, 110, 100, 1_000_000), 1_100_000);
});
