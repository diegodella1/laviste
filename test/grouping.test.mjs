import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {bucketsFor, libroPrimary, formatThemePct, bucketKey, hasOpenWeightAction} from '../lib/portfolio.mjs';
import {NNBSP, pctInt, pct1} from '../lib/format.mjs';
import {POS_BUCKET_UNGROUPED, POS_BUCKET_CASH, positionsChipLabel} from '../lib/copy.mjs';

function takeWithHoldings(rows, {cash = 100000, invested = 1000000} = {}) {
  return {
    cash,
    invested,
    holdings: rows,
    settings: {cap: 25, drift: 5},
    phase: 'active',
  };
}

test('bucketKey defaults empty/missing to Sin agrupar', () => {
  assert.equal(bucketKey({bucket: ''}), POS_BUCKET_UNGROUPED);
  assert.equal(bucketKey({bucket: '  '}), POS_BUCKET_UNGROUPED);
  assert.equal(bucketKey({}), POS_BUCKET_UNGROUPED);
  assert.equal(bucketKey({bucket: 'Energía'}), 'Energía');
});

test('bucketsFor groups themes, isolates cash, and percents sum ~100', () => {
  const t = takeWithHoldings([
    {ticker: 'YPF', bucket: 'Energía', units: 10, price: 20000, weight: 25},
    {ticker: 'PAM', bucket: 'Energía', units: 10, price: 10000, weight: 22},
    {ticker: 'GGAL', bucket: 'Finanzas', units: 20, price: 6500, weight: 18},
    {ticker: 'VIST', bucket: '', units: 5, price: 13000, weight: 15},
  ], {cash: 205000, invested: 1000000});
  const {themes, cash} = bucketsFor(t);
  assert.equal(cash.name, POS_BUCKET_CASH);
  assert.ok(!themes.some(b => b.kind === 'cash' || b.name === POS_BUCKET_CASH));
  const energia = themes.find(b => b.name === 'Energía');
  const finanzas = themes.find(b => b.name === 'Finanzas');
  const ungrouped = themes.find(b => b.name === POS_BUCKET_UNGROUPED);
  assert.ok(energia && energia.holdings.length === 2);
  assert.ok(finanzas && finanzas.holdings.map(h => h.ticker).includes('GGAL'));
  assert.ok(ungrouped && ungrouped.holdings.map(h => h.ticker).includes('VIST'));
  const pctSum = themes.reduce((s, b) => s + b.pct, 0) + cash.pct;
  assert.ok(Math.abs(pctSum - 100) < 0.15, `pct sum ${pctSum}`);
  assert.ok(themes[0].pct >= themes[themes.length - 1].pct);
});

test('bucketsFor cash-only is 100% Efectivo', () => {
  const {themes, cash} = bucketsFor(takeWithHoldings([], {cash: 500000, invested: 500000}));
  assert.equal(themes.length, 0);
  assert.equal(cash.name, POS_BUCKET_CASH);
  assert.ok(Math.abs(cash.pct - 100) < 0.01);
});

test('bucketsFor draft uses objective weights when not invested', () => {
  const t = createTake(templates[0]);
  const {themes, cash, invested} = bucketsFor(t);
  assert.equal(invested, false);
  const obj = t.holdings.reduce((s, h) => s + h.weight, 0);
  const themePct = themes.reduce((s, b) => s + b.pct, 0);
  assert.ok(Math.abs(themePct - obj) < 0.01);
  assert.ok(Math.abs(themePct + cash.pct - 100) < 0.01);
});

test('formatThemePct uses integer when whole, comma decimal otherwise', () => {
  assert.equal(formatThemePct(48), pctInt(48));
  assert.equal(formatThemePct(25.8), pct1(25.8));
  assert.equal(formatThemePct(10.04), pctInt(10));
  assert.ok(formatThemePct(25.8).includes(NNBSP));
  assert.ok(!formatThemePct(25.8).includes('25.8'));
});

test('positionsChipLabel pluralizes', () => {
  assert.equal(positionsChipLabel(1), '1 posición');
  assert.equal(positionsChipLabel(12), '12 posiciones');
});

test('libroPrimary is deposit when ok and trade on cap/drift breach', () => {
  const ok = createTake(templates[0]);
  activate(ok, 1000000);
  assert.equal(hasOpenWeightAction(ok), false);
  assert.equal(libroPrimary(ok), 'deposit');

  const cap = createTake(templates[0]);
  activate(cap, 1000000);
  const ypf = cap.holdings.find(h => h.ticker === 'YPF');
  cap.cash = 760000;
  for (const h of cap.holdings) {
    if (h.ticker !== 'YPF') {
      h.units = 0;
      h.price = h.entryPrice;
    }
  }
  ypf.units = 15;
  ypf.price = 17600;
  assert.equal(hasOpenWeightAction(cap), true);
  assert.equal(libroPrimary(cap), 'trade');
});

test('Posiciones markup keeps buckets before the table and one Libro primary', () => {
  const app = readFileSync('public/app.js', 'utf8');
  const css = readFileSync('public/app-theme.css', 'utf8');
  const brand = readFileSync('public/brand.css', 'utf8');
  const desk = app.slice(app.indexOf('function libroActions'), app.indexOf('function idea'));
  assert.ok(app.includes('comp-bar'));
  assert.ok(app.includes('compositionHtml'));
  assert.ok(app.includes('positionsDisclosure'));
  assert.ok(app.indexOf('compositionHtml(t)') < app.indexOf('positionsDisclosure(t)'));
  assert.ok(app.indexOf('positionsDisclosure(t)') < app.indexOf('practiceDesk(t)'));
  assert.ok(!desk.includes('Aplicar en práctica'), 'Libro must not steal Aplicar en práctica');
  assert.ok(desk.includes('libro-primary'));
  assert.ok(desk.includes('LIBRO_MORE'));
  assert.match(css, /\.comp-bar\s*\{/);
  assert.match(css, /\.positions-chip/);
  assert.match(css, /\.libro-more/);
  assert.ok(brand.includes('--tb-1:#3B82F6'));
  assert.ok(brand.includes('--tb-5:#94A3B8'));
  assert.ok(!brand.includes('--tb-1:#059669'));
  assert.ok(!brand.includes('--tb-2:#EF4444'));
  assert.ok(brand.includes('--lv-accent:#3B82F6'));
  assert.ok(brand.includes('--lv-accent-text:#2563EB'));
  assert.ok(brand.includes('--lv-gain-text:#047857'));
  assert.ok(brand.includes('--lv-review-text:#B91C1C'));
  assert.ok(brand.includes('--lv-loss-text:#B91C1C'));
  assert.ok(brand.includes('--lv-watch:#D97706'));
  assert.ok(brand.includes('--lv-watch-text:#B45309'));
  assert.ok(!brand.includes('--lv-review-text:#DC2626'));
  assert.ok(!brand.includes('--lv-loss-text:#DC2626'));
  assert.ok(brand.includes('--lv-r-ctrl:8px'));
  assert.ok(!brand.includes('--lv-r-ctrl:10px'));
});
