import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {artDayKey, dayDelta} from '../public/math.js';
import {
  HOME_THESIS_DELTA_ZERO,
  HOME_THESIS_DELTA_UNKNOWN,
  TAKE_HEADER_MONEY_LABEL,
  TAKE_HEADER_EYEBROW,
} from '../public/copy.mjs';

const pt = (at, value) => ({at, value, benchmark: value});

test('dayDelta two ART days → ars and pct', () => {
  const d = dayDelta({
    history: [
      pt('2026-10-06T15:00:00.000Z', 1_000_000),
      pt('2026-10-07T15:00:00.000Z', 1_012_000),
    ],
  });
  assert.equal(d.ars, 12_000);
  assert.ok(Math.abs(d.pct - 1.2) < 1e-9);
  assert.equal(d.asOf, '2026-10-07T15:00:00.000Z');
});

test('dayDelta one history point → null', () => {
  assert.equal(dayDelta({history: [pt('2026-10-07T15:00:00.000Z', 1_000_000)]}), null);
  assert.equal(dayDelta({history: []}), null);
  assert.equal(dayDelta({}), null);
});

test('dayDelta same-day points use previous ART calendar day when present', () => {
  const d = dayDelta({
    history: [
      pt('2026-10-06T15:00:00.000Z', 1_000_000),
      pt('2026-10-07T12:00:00.000Z', 1_005_000),
      pt('2026-10-07T18:00:00.000Z', 992_000),
    ],
  });
  assert.equal(d.ars, -8_000);
  assert.ok(Math.abs(d.pct - -0.8) < 1e-9);
  assert.equal(d.asOf, '2026-10-07T18:00:00.000Z');
});

test('dayDelta only intraday points uses previous array entry', () => {
  const d = dayDelta({
    history: [
      pt('2026-10-07T12:00:00.000Z', 1_000_000),
      pt('2026-10-07T18:00:00.000Z', 1_010_000),
    ],
  });
  assert.equal(d.ars, 10_000);
  assert.ok(Math.abs(d.pct - 1) < 1e-9);
});

test('dayDelta buckets previous session on ART calendar, not UTC', () => {
  const lateUtc = '2026-10-07T02:30:00.000Z'; // 2026-10-06 23:30 ART
  const nextArt = '2026-10-07T12:00:00.000Z'; // 2026-10-07 09:00 ART
  assert.equal(artDayKey(lateUtc), '2026-10-06');
  assert.equal(artDayKey(nextArt), '2026-10-07');
  const d = dayDelta({
    history: [
      pt(lateUtc, 500_000),
      pt(nextArt, 508_000),
    ],
  });
  assert.equal(d.ars, 8_000);
});

test('dayDelta zero change is {ars:0,pct:0} not null', () => {
  const d = dayDelta({
    history: [
      pt('2026-10-06T15:00:00.000Z', 800_000),
      pt('2026-10-07T15:00:00.000Z', 800_000),
    ],
  });
  assert.equal(d.ars, 0);
  assert.equal(d.pct, 0);
});

test('dayDelta prev value not > 0 → null', () => {
  assert.equal(dayDelta({
    history: [
      pt('2026-10-06T15:00:00.000Z', 0),
      pt('2026-10-07T15:00:00.000Z', 100),
    ],
  }), null);
});

test('dayDelta sorts unsorted history', () => {
  const d = dayDelta({
    history: [
      pt('2026-10-07T15:00:00.000Z', 110),
      pt('2026-10-06T15:00:00.000Z', 100),
    ],
  });
  assert.equal(d.ars, 10);
});

test('dayDelta prefers history over take.dayChange', () => {
  const d = dayDelta({
    history: [
      pt('2026-10-06T15:00:00.000Z', 100),
      pt('2026-10-07T15:00:00.000Z', 110),
    ],
    dayChange: {ars: 999, pct: 50, asOf: 'ignored'},
  });
  assert.equal(d.ars, 10);
  assert.ok(Math.abs(d.pct - 10) < 1e-9);
});

test('dayDelta falls back to take.dayChange when history cannot derive', () => {
  const d = dayDelta({
    history: [pt('2026-10-07T15:00:00.000Z', 100)],
    dayChange: {ars: -420, pct: -0.5, asOf: '2026-10-07T15:00:00.000Z'},
  });
  assert.equal(d.ars, -420);
  assert.equal(d.pct, -0.5);
  assert.equal(d.asOf, '2026-10-07T15:00:00.000Z');
});

test('GROUP PR B copy keys', () => {
  assert.equal(HOME_THESIS_DELTA_ZERO, '0,0% hoy');
  assert.equal(HOME_THESIS_DELTA_UNKNOWN, '—');
  assert.equal(TAKE_HEADER_MONEY_LABEL, 'Dinero de práctica · ARS');
  assert.equal(TAKE_HEADER_EYEBROW, 'Cartera de práctica');
});

test('take header binds this take total; home still aggregates', () => {
  const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const takePage = src.slice(src.indexOf('function takePage'), src.indexOf('function news('));
  assert.match(takePage, /money\(total\(t\)\)/);
  assert.match(takePage, /TAKE_HEADER_MONEY_LABEL/);
  assert.match(takePage, /take-hero-n/);
  assert.doesNotMatch(takePage, /ts\.reduce/);
  const home = src.slice(src.indexOf('function home()'), src.indexOf('function thesisRow'));
  assert.match(home, /ts\.reduce\(\(s, t\) => s \+ total\(t\)/);
  const thesisRow = src.slice(src.indexOf('function thesisRow'), src.indexOf('function aggregateHistory'));
  assert.match(thesisRow, /dayDeltaHtml\(t\)/);
  assert.match(thesisRow, /phase !== 'draft'/);
});
