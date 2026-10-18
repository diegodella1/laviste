import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  implicationLine,
  newsChipLabel,
  previewNovedades,
  curatedNovedades,
  itemMatchesNewsFilter,
  NEWS_FILTER_NEWS,
  NEWS_FILTER_RULES,
} from '../public/novedades.mjs';
import {seriesForRange, artDayKey} from '../public/math.js';
import {resultPhrase, chartAriaSummary, chartNoHistoryMessage} from '../public/chart-copy.mjs';
import {pctInt, NNBSP, artShortDayMonth} from '../public/format.mjs';
import {computeThesisState} from '../public/thesis-state.mjs';
import {P1_CHART_NO_HISTORY} from '../public/copy.mjs';

test('P1 Open Q: novedades have no relevance field; implication only when affected exists', () => {
  assert.equal(implicationLine({type: 'news', title: 'Nota', body: 'texto'}), '');
  assert.equal(implicationLine({type: 'news', evidence: [{title: 'x', fact: 'y'}]}), '');
  assert.equal(
    implicationLine({type: 'news', evidence: [{affected: 'Energía'}]}),
    'Afecta a: Energía',
  );
  assert.equal(
    implicationLine({type: 'news', affected: 'Finanzas', weightImpact: 'Sin cambios en los pesos'}),
    'Afecta a: Finanzas · Sin cambios en los pesos',
  );
  assert.equal(implicationLine({relevance: '  '}), '');
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /implicationLine/);
  assert.match(app, /computeThesisState/);
  assert.ok(!app.includes('toFixed(0)+\'%\'') && !app.includes('toFixed(0)}%'));
});

test('proposal and admin preview use pctInt, not toFixed(0)%', () => {
  const app = readFileSync('public/app.js', 'utf8');
  const admin = readFileSync('public/admin-agent.mjs', 'utf8');
  const porQue = readFileSync('public/por-que.mjs', 'utf8');
  assert.ok(!app.includes('cash.toFixed(0)'));
  assert.ok(!admin.includes('cash.toFixed(0)'));
  assert.match(app, /pctInt\(cash\)/);
  assert.match(admin, /pctInt\(cash\)/);
  assert.match(porQue, /pctInt\(h\.weight\)/);
  assert.equal(pctInt(13.8), `14${NNBSP}%`);
});

test('news chip uses nuevas only when last-seen exists', () => {
  assert.equal(newsChipLabel(12, 0), 'Novedades · 12');
  assert.equal(newsChipLabel(12, 2), 'Novedades · 2 nuevas');
});

test('curated novedades filter and preview cap at 3', () => {
  const now = Date.parse('2026-10-15T20:00:00.000Z');
  const items = [
    {key: 'n1', at: new Date(now).toISOString(), type: 'news', title: 'Nota', body: 'a'},
    {key: 'n2', at: new Date(now - 3600_000).toISOString(), type: 'news', title: 'Nota 2', body: 'b'},
    {key: 'c1', at: new Date(now - 7200_000).toISOString(), type: 'chequeo', title: 'Chequeo', body: 'ok', verdict: 'none'},
    {key: 'n3', at: new Date(now - 10800_000).toISOString(), type: 'news', title: 'Nota 3', body: 'c'},
    {key: 'n4', at: new Date(now - 14400_000).toISOString(), type: 'news', title: 'Nota 4', body: 'd'},
  ];
  const preview = previewNovedades(items, {limit: 3, now});
  assert.equal(preview.shownCount, 3);
  assert.ok(preview.hiddenCount >= 1);
  const newsOnly = curatedNovedades(items, {filter: NEWS_FILTER_NEWS, showAll: true, now});
  assert.ok(newsOnly.days.flatMap(d => d.cards).every(c => c.kind !== 'card' || itemMatchesNewsFilter(c.item, NEWS_FILTER_NEWS)));
  const rules = curatedNovedades(items, {filter: NEWS_FILTER_RULES, showAll: true, now});
  assert.ok(rules.totalCount >= 1);
});

test('seriesForRange collapses 1M/Todo by session and never inserts weekend holes', () => {
  const points = [
    {at: '2026-10-09T20:00:00.000Z', value: 1_000_000}, // vie
    {at: '2026-10-09T21:00:00.000Z', value: 1_002_000},
    {at: '2026-10-13T14:00:00.000Z', value: 1_010_000}, // mar (skip weekend)
  ];
  const all = seriesForRange(points, 'all');
  assert.equal(all.length, 2);
  assert.equal(artDayKey(all[0].at), '2026-10-09');
  assert.equal(artDayKey(all[1].at), '2026-10-13');
  const week = seriesForRange(points, 'week', {now: Date.parse('2026-10-15T20:00:00.000Z')});
  assert.ok(week.length >= 2);
  assert.ok(!week.some(p => /2026-10-10|2026-10-11/.test(artDayKey(p.at))));
  const month = seriesForRange(points, 'month', {now: Date.parse('2026-10-15T20:00:00.000Z')});
  assert.equal(month.length, 2);
});

test('result phrase and chart empty copy are es-AR, no alert on tie', () => {
  const up = resultPhrase({invested: 1_000_000, value: 1_012_380, activatedAt: '2026-10-06T15:00:00.000Z'});
  assert.equal(up.label, 'Tu resultado desde el inicio');
  assert.equal(up.tone, 'gain');
  assert.match(up.detail, /Aportaste/);
  assert.match(up.detail, /6 oct/);
  const flat = resultPhrase({invested: 1_000_000, value: 1_000_000, activatedAt: '2026-10-06T15:00:00.000Z'});
  assert.equal(flat.tone, 'ink');
  assert.equal(chartNoHistoryMessage(), P1_CHART_NO_HISTORY);
  const sum = chartAriaSummary([
    {at: '2026-10-06T15:00:00.000Z', value: 1_008_500},
    {at: '2026-10-15T15:00:00.000Z', value: 1_012_380},
  ]);
  assert.match(sum, /6 oct/);
  assert.match(sum, /15 oct/);
  assert.equal(artShortDayMonth('2026-10-06T15:00:00.000Z'), '6 oct');
});

test('computeThesisState remains the single live state source in the SPA', () => {
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /function stateForTake\(t\) \{\s*return computeThesisState/);
  const st = computeThesisState({
    phase: 'active', invested: 1_000_000, cash: 800_000, attention: 'track',
    settings: {cap: 25, drift: 5},
    holdings: [{ticker: 'YPF', units: 1, price: 200_000, weight: 20}],
  });
  assert.equal(st.attention, 'track');
});

test('P1 UX notes: panel below topbar, thin-space weights, rail only on take', () => {
  const css = readFileSync('public/app-theme.css', 'utf8');
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(css, /\.lv-panel\s*\{[^}]*top:\s*var\(--lv-topbar-h,\s*52px\)/s);
  assert.match(css, /\.lv-scrim\s*\{[^}]*inset:\s*var\(--lv-topbar-h,\s*52px\)/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.news-filter\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(app, /function syncTopbarHeight/);
  assert.match(app, /history\.back\(\)/);
  assert.match(app, /setAttribute\('inert'/);
  assert.match(app, /page === 'take' \? thesisRailHtml/);
  assert.match(app, /controls = on \? ' aria-controls="take-panel"'/);
  assert.match(app, /La suma debe quedar entre \$\{pctInt\(30\)\} y \$\{pctInt\(95\)\}/);
  assert.equal(pctInt(30), `30${NNBSP}%`);
  assert.equal(pctInt(95), `95${NNBSP}%`);
});

test('chart empty range with history uses period-empty copy', () => {
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /take && !full\.length/);
  assert.match(app, /chartPeriodEmptyMessage/);
  assert.match(app, /function availableChartRanges/);
});

test('one cobalt primary per context is encoded in dockButtonClass', () => {
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /function dockButtonClass\(t, panel\)/);
  assert.match(app, /t\.phase === 'draft'\) return 'btn btn-g'/);
  assert.match(app, /panel === 'positions' && t\.phase === 'active'\) return 'btn btn-g'/);
  assert.match(app, /panel === 'news' && canApplyRebalance\(t\)\) return 'btn btn-g'/);
});
