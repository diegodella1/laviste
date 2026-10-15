import test from 'node:test';
import assert from 'node:assert/strict';
import {pct1, pctInt, pctSigned, money, signedMoney, uniqueArsAxisLabels, moneyCompactArsAxis, NNBSP, MINUS} from '../public/format.mjs';

test('pct1 is 1 decimal, comma, thin space before %', () => {
  assert.equal(pct1(25.04), `25,0${NNBSP}%`);
  assert.equal(pct1(22.5), `22,5${NNBSP}%`);
  assert.equal(pct1(Number.NaN), '—');
  assert.ok(!pct1(25).includes('25.0'));
  assert.equal(pct1(13), `13,0${NNBSP}%`);
});

test('money and signedMoney are es-AR with typographic minus', () => {
  const m = money(1_012_380);
  assert.ok(m.includes('1.012.380'));
  assert.ok(m.startsWith('$'));
  assert.equal(signedMoney(-1760).includes(MINUS), true);
  assert.ok(signedMoney(-1760).includes('1.760') || signedMoney(-1760).includes('1760'));
  assert.equal(pctSigned(-0.2).startsWith(MINUS), true);
  assert.equal(pctInt(25), `25${NNBSP}%`);
});

test('unique Y ticks around 985 mil – 1,015 M never repeat', () => {
  const values = [980_000, 990_000, 1_000_000, 1_010_000, 1_020_000];
  const labels = uniqueArsAxisLabels(values);
  assert.equal(new Set(labels).size, labels.length, labels.join(' · '));
  assert.ok(labels.some(l => /mil/.test(l)));
  assert.ok(labels.some(l => /M/.test(l)));
  assert.ok(!labels.some(l => l.includes('25.0')));
});

test('moneyCompactArsAxis still compact for a single tick', () => {
  assert.match(moneyCompactArsAxis(2_200_000), /2,2/);
  assert.match(moneyCompactArsAxis(850_000), /850/);
});
