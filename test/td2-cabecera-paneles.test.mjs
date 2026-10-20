import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {
  TRY_SCENARIO, CHECK_ERROR, PRACTICE_FOOTER, P1_TODAY,
  TD_RULES_LINK, TD_CHIP_IN, TD_CHIP_DRIFT, TD_CHIP_OVER,
  TD_IDEA_HOW, TD_HOW_CADENCE, TD_HOW_AUTO_ON, TD_HOW_AUTO_OFF,
  TD_HOW_NEWS_ON, TD_HOW_NEWS_OFF, TD_IDEA_EDIT, TD_IDEA_SCENARIO, TD_IDEA_HISTORY,
} from '../public/copy.mjs';
import {
  ideaHowLines, ideaHowHtml, holdingRowHtml, positionChipHtml, positionChipKind,
  reglasHref, bucketHoldingsHtml, positionsRulesLinkHtml,
} from '../public/tesis-detalle.mjs';
import {nestedHashSection, takeHref, parseTakeParts} from '../public/take-route.mjs';
import {RULE_CHIP_LABEL} from '../public/thesis-state.mjs';
import {signedMoney, MINUS, NNBSP, NBSP} from '../public/format.mjs';
import {holdingDerived} from '../public/portfolio.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function activeTake() {
  const t = createTake(templates[0]);
  activate(t, 1_000_000);
  t.monitoringPaused = false;
  return t;
}

test('TD-16 copy: day delta uses U+2212, NBSP after $ and hoy', () => {
  const txt = `${signedMoney(-94494)} ${P1_TODAY}`;
  assert.equal(txt.includes(MINUS), true);
  assert.equal(txt.includes(`$${NBSP}`) || txt.includes('$ ') || /\$\u00a0/.test(txt), true);
  assert.ok(!txt.startsWith('-'));
  assert.ok(!txt.includes(`-${NBSP}$`) && !txt.includes('-$'));
  assert.match(txt, /hoy$/);
  const css = readFileSync('public/app-theme.css', 'utf8');
  assert.match(css, /\.take-hero-n \.delta\s*\{[^}]*letter-spacing:\s*0px/s);
  assert.match(css, /\.take-hero-n \.delta\s*\{[^}]*margin-left:\s*8px/s);
  assert.match(css, /\.take-hero-n \.delta\s*\{[^}]*font-size:\s*var\(--lv-text-sm\)/s);
  assert.match(readFileSync('public/brand.css', 'utf8'), /--lv-text-sm:\s*15px/);
});

test('TD-17 Probar escenario lives in La idea, not the cabecera', () => {
  const app = readFileSync('public/app.js', 'utf8');
  const header = app.slice(app.indexOf('function headerActions'), app.indexOf('function canApplyRebalance'));
  const idea = app.slice(app.indexOf('function idea(t)'), app.indexOf('function takeAutoHtml'));
  assert.equal(header.includes('scenario'), false, 'headerActions must not render Probar escenario');
  assert.equal(header.includes('TRY_SCENARIO'), false);
  assert.match(idea, /TD_IDEA_SCENARIO|data-action="scenario"/);
  assert.match(idea, /TD_IDEA_EDIT/);
  assert.match(idea, /TD_IDEA_HISTORY/);
  assert.equal(TD_IDEA_SCENARIO, TRY_SCENARIO);
  assert.equal(TD_IDEA_EDIT, 'Editar la idea');
  assert.equal(TD_IDEA_HISTORY, 'Historial de versiones');
  assert.match(idea, /ideaHowHtml/);
  assert.ok(!idea.includes('<h2>Reglas</h2>'));
});

test('TD-18 Cómo actúa follows cadence, drift and Automático/noticias', () => {
  const t = activeTake();
  t.settings.cadence = 'standard';
  t.settings.drift = 5;
  const off = ideaHowLines(t, {autoVisible: false});
  assert.deepEqual(off, [TD_HOW_CADENCE('standard')]);
  t.settings.cadence = 'patient';
  const patient = ideaHowLines(t, {autoVisible: true, autoOn: false, newsOn: false});
  assert.equal(patient[0], TD_HOW_CADENCE('patient'));
  assert.equal(patient[1], TD_HOW_AUTO_OFF);
  assert.equal(patient[2], TD_HOW_NEWS_OFF);
  t.settings.cadence = 'manual';
  t.settings.drift = 10;
  const on = ideaHowLines(t, {autoVisible: true, autoOn: true, newsOn: true});
  assert.equal(on[0], TD_HOW_CADENCE('manual'));
  assert.equal(on[1], TD_HOW_AUTO_ON(10));
  assert.equal(on[2], TD_HOW_NEWS_ON);
  const html = ideaHowHtml(t, {autoVisible: true, autoOn: true, newsOn: false, esc});
  assert.match(html, new RegExp(TD_IDEA_HOW));
  assert.match(html, /Solo manual/);
  assert.ok(!html.includes('cada 24 horas'));
});

test('TD-19 Posiciones show reason, real %, obj and Dentro/Desvío/Sobre tope', () => {
  assert.equal(TD_CHIP_IN, 'Dentro');
  assert.equal(TD_CHIP_DRIFT, 'Desvío');
  assert.equal(TD_CHIP_OVER, 'Sobre tope');
  assert.equal(RULE_CHIP_LABEL.drift, 'Desvío');
  assert.equal(positionChipKind('ok').label, 'Dentro');
  assert.equal(positionChipKind('drift').label, 'Desvío');
  assert.equal(positionChipKind('cap').label, 'Sobre tope');
  assert.ok(!positionChipHtml('drift').includes('Revisar'));
  const t = activeTake();
  const ypf = t.holdings.find(h => h.ticker === 'YPF');
  const row = holdingRowHtml(t, ypf, {esc});
  assert.match(row, /data-ticker="YPF"/);
  assert.ok(row.includes(ypf.reason));
  assert.match(row, /obj\./);
  assert.ok(row.includes(NNBSP) || row.includes('%'));
  const d = holdingDerived(t, ypf);
  assert.ok(row.includes('pos-chip') || Number.isFinite(d.actual));
  assert.equal(reglasHref(t.id), `#/tesis/${t.id}/ajustes#reglas`);
  assert.equal(takeHref(t.id, 'ajustes') + '#reglas', reglasHref(t.id));
  const link = positionsRulesLinkHtml(t, {esc});
  assert.ok(link.includes(TD_RULES_LINK));
  assert.match(link, /#reglas/);
});

test('TD-19 bucketsFor holdings render in composition helpers', async () => {
  const {bucketsFor} = await import('../public/portfolio.mjs');
  const t = activeTake();
  const {themes} = bucketsFor(t, {ungrouped: 'Sin agrupar', cashName: 'Efectivo'});
  const html = themes.map(b => bucketHoldingsHtml(t, {...b, colorVar: 'var(--tb-1)'}, {esc})).join('');
  for (const h of t.holdings) {
    assert.ok(html.includes(h.ticker), `missing ticker ${h.ticker}`);
    assert.ok(html.includes(h.reason), `missing reason ${h.ticker}`);
  }
  assert.ok(!html.includes('>Revisar<'));
});

test('TD-20/21 panel chip 44px, open ink, panel without shadow, 88dvh sheet', () => {
  const css = readFileSync('public/app-theme.css', 'utf8');
  assert.match(css, /\.panel-chip\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.panel-chip\.on[\s\S]*background:\s*var\(--lv-ink\)/);
  assert.ok(!/\.panel-chip\.on\s*\{[^}]*#F0F0F0/s.test(css));
  assert.match(css, /\.lv-panel\s*\{[^}]*box-shadow:\s*none/s);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*max-height:\s*88dvh/);
  assert.match(css, /\.take-header h1:focus:not\(:focus-visible\)/);
  assert.match(css, /\.lv-panel #panel-title:focus:not\(:focus-visible\)/);
});

test('TD-22 review error is not repeated in the cabecera', () => {
  const app = readFileSync('public/app.js', 'utf8');
  const takePage = app.slice(app.indexOf('function takePage'), app.indexOf('function news('));
  assert.match(takePage, /review\.state !== 'error'/);
  assert.match(app, /class="check-error"/);
  assert.equal(CHECK_ERROR, 'No pudimos revisar ahora. Probá de nuevo.');
});

test('TD-42/43 formats, footer and no SuperTake CTAs', () => {
  const files = ['public/copy.mjs', 'public/app.js', 'public/tesis-detalle.mjs'];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/\bAutopilot\b/.test(text), `${file} has Autopilot`);
    assert.ok(!text.includes('Make it real'), `${file} has Make it real`);
  }
  assert.match(readFileSync('public/app.js', 'utf8'), /practiceFooter\(\)/);
  assert.ok(PRACTICE_FOOTER.includes('el análisis puede equivocarse'));
  assert.ok(TD_HOW_CADENCE('standard').includes('24 horas'));
  assert.ok(!TD_HOW_AUTO_ON(5).includes('Autopilot'));
  assert.equal(nestedHashSection('#/tesis/abc/ajustes#reglas'), 'reglas');
  assert.equal(nestedHashSection('#/tesis/abc/ajustes'), '');
  assert.match(readFileSync('server.mjs', 'utf8'), /'\/tesis-detalle\.mjs':'tesis-detalle\.mjs'/);
});
