import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {
  P1_CHART_NO_HISTORY, P1_NEW_THESIS,
  TD_LOADING, TD_LOAD_ERROR_TITLE, TD_LOAD_ERROR_BODY, TD_RETRY, TD_GO_TAKES,
  TD_NOT_FOUND_TITLE, TD_NOT_FOUND_BODY, TD_NEW_WHY, TD_NEW_NEXT, TD_NEW_NEXT_ON,
  TD_ARCHIVED_BANNER, TD_ARCHIVED_ASK, TD_ARCHIVED_AT,
  TD_CMP_GROUP, TD_CMP_CAPITAL, TD_CMP_INDEX, TD_INDEX_PENDING, TD_INDEX_NOT_YET,
  TD_SINCE_START, PRACTICE_FOOTER,
} from '../public/copy.mjs';
import {
  isNewTake, indexShortLabel, newNextLabel, indexPointCount,
  takeLoadingHtml, takeLoadErrorHtml, takeNotFoundHtml,
  archivedBannerHtml, compareGroupHtml, takeNewStatsHtml, takeAskDockHtml,
} from '../public/tesis-detalle.mjs';
import {ajustesPageHtml} from '../public/ajustes.mjs';
import {pctSigned, NNBSP} from '../public/format.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function activeTake() {
  const t = createTake(templates[0]);
  activate(t, 1_000_000);
  t.monitoringPaused = false;
  return t;
}

test('TD-23 loading skeleton has aria-busy and never says not-found', () => {
  const html = takeLoadingHtml({esc});
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="status"/);
  assert.ok(html.includes(TD_LOADING));
  assert.ok(html.indexOf('role="status"') < html.indexOf('aria-busy="true"'), 'P2-a status lives outside the busy wrapper');
  assert.ok(!html.includes(TD_NOT_FOUND_TITLE));
  assert.ok(!html.includes('No encontramos esa tesis'));
  assert.match(html, /class="sk sk-chart"/);
  assert.match(html, /class="sk sk-chip"/);
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /const loadingTake = !stateLoaded && page === 'take'/);
  assert.match(app, /takeLoadingHtml\(\{esc\}\)/);
  assert.match(app, /takeLoadErrorHtml\(\{esc\}\)/);
  const takePage = app.slice(app.indexOf('function takePage'), app.indexOf('function news('));
  assert.ok(!takePage.includes('No encontramos esa tesis.'));
  assert.match(takePage, /takeNotFoundHtml/);
  assert.equal(stateLoadedGuard(app), true);
});

function stateLoadedGuard(app) {
  return /loadingTake[\s\S]*takeLoadingHtml/.test(app)
    && /if \(!loadFailed\) stateLoaded = true/.test(app);
}

test('TD-24 load error is a callout with one Reintentar and Ir a Mis tesis', () => {
  const html = takeLoadErrorHtml({esc});
  assert.match(html, /role="alert"/);
  assert.ok(html.includes(TD_LOAD_ERROR_TITLE));
  assert.ok(html.includes(TD_LOAD_ERROR_BODY));
  assert.ok(html.includes(TD_RETRY));
  assert.ok(html.includes(TD_GO_TAKES));
  assert.equal((html.match(/class="btn primary"/g) || []).length, 1);
  assert.equal((html.match(/data-action="retry-state"/g) || []).length, 1);
  assert.ok(!html.includes(P1_NEW_THESIS));
  assert.ok(!html.includes('Nueva tesis'));
  assert.match(html, /<h1 tabindex="-1">/);
  assert.match(html, /href="#\/takes"/);
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /action === 'retry-state'/);
  assert.match(app, /if \(!stateLoaded\) \{\s*loadFailed = true;/);
  assert.match(app, /Mostramos lo último que vimos/);
  assert.match(app, /const seen = lastOkAt \? hhmm\(lastOkAt\) : ''/);
  assert.ok(!html.includes('chat-dock'));
});

test('TD-25 unknown id after load uses not-found copy', () => {
  const html = takeNotFoundHtml({esc});
  assert.ok(html.includes(TD_NOT_FOUND_TITLE));
  assert.ok(html.includes(TD_NOT_FOUND_BODY));
  assert.ok(html.includes(TD_GO_TAKES));
  assert.match(html, /<h1 tabindex="-1">/);
  assert.match(html, /href="#\/takes"/);
  assert.ok(!html.includes(TD_RETRY));
  assert.ok(!html.includes('Nueva tesis'));
  assert.equal((html.match(/class="btn primary"/g) || []).length, 0);
  const app = readFileSync('public/app.js', 'utf8');
  const takePage = app.slice(app.indexOf('function takePage'), app.indexOf('function news('));
  assert.match(takePage, /if \(!t\) return \{body: takeNotFoundHtml/);
});

test('TD-26 new tesis: empty chart, 0,0 % muted, index segment toasts', () => {
  const t = activeTake();
  assert.equal(isNewTake(t), true);
  t.history.push({at: new Date().toISOString(), value: t.invested, benchmark: t.invested});
  assert.equal(isNewTake(t), false);
  const draft = createTake(templates[0]);
  assert.equal(isNewTake(draft), false);
  assert.equal(indexShortLabel('MERV'), 'Merval');
  assert.equal(indexShortLabel('SPY_AR'), 'CEDEAR SPY');
  assert.equal(indexShortLabel(null, 'Índice Merval'), 'Merval');
  const short = indexShortLabel(t.benchmarkId, t.benchmarkLabel);
  const cmp = compareGroupHtml({short, disabled: true, takeId: t.id, esc});
  assert.match(cmp, /role="group"/);
  assert.match(cmp, new RegExp(TD_CMP_GROUP));
  assert.ok(cmp.includes(TD_CMP_CAPITAL));
  assert.ok(cmp.includes(TD_CMP_INDEX(short)));
  assert.match(cmp, /aria-disabled="true"/);
  assert.match(cmp, /data-action="compare-index"/);
  const zero = pctSigned(0);
  assert.equal(zero, `0,0${NNBSP}%`);
  const stats = takeNewStatsHtml({
    pct: zero, pending: TD_INDEX_PENDING(short), detail: 'Aportaste', esc,
  });
  assert.ok(stats.includes(TD_SINCE_START));
  assert.match(stats, /stat-big muted/);
  assert.ok(stats.includes(zero));
  assert.ok(stats.includes(TD_INDEX_PENDING(short)));
  assert.equal(TD_NEW_WHY, 'Recién activada: todas las posiciones están en su objetivo.');
  assert.equal(TD_INDEX_NOT_YET(short), `La comparación con ${short} aparece cuando haya dos ruedas con su precio.`);
  assert.equal(P1_CHART_NO_HISTORY, 'El gráfico aparece después de la primera rueda con precios.');
  const app = readFileSync('public/app.js', 'utf8');
  const takePage = app.slice(app.indexOf('function takePage'), app.indexOf('function news('));
  assert.match(app, /isNewTake\(t\)/);
  assert.match(app, /TD_NEW_WHY/);
  assert.match(app, /compare-index/);
  assert.match(app, /TD_INDEX_NOT_YET/);
  assert.match(app, /chartNoHistoryMessage|P1_CHART_NO_HISTORY/);
  assert.match(app, /takeNewStatsHtml/);
  assert.match(takePage, /fresh\s*\n\s*\? HOME_THESIS_DELTA_ZERO/);
  assert.match(takePage, /headerActions\(t\)/);
  assert.match(readFileSync('public/chart-copy.mjs', 'utf8'), /P1_CHART_NO_HISTORY/);
});

test('TD-26 compare teaser only when not archived and fewer than 2 index points', () => {
  const none = [{at: '2026-10-01', value: 1_000_000}];
  const one = [{at: '2026-10-01', value: 1_000_000, index: 100}];
  const two = [
    {at: '2026-10-01', value: 1_000_000, index: 100},
    {at: '2026-10-02', value: 1_010_000, indexRecorded: true},
  ];
  assert.equal(indexPointCount(none), 0);
  assert.equal(indexPointCount(one), 1);
  assert.equal(indexPointCount(two), 2);
  const disabled = compareGroupHtml({short: 'Merval', disabled: true, takeId: 't1', esc});
  assert.match(disabled, /data-action="compare-index"/);
  assert.match(disabled, /aria-disabled="true"/);
  const app = readFileSync('public/app.js', 'utf8');
  const takeChart = app.slice(app.indexOf('function takeChartBlock'), app.indexOf('function pendingForTake'));
  assert.match(takeChart, /!archived && idxPts < 2 \? compareGroupHtml/);
  assert.match(takeChart, /h\.index != null \|\| h\.indexRecorded/);
  assert.ok(!takeChart.includes('compareGroupHtml({short, disabled: true, takeId: t.id, esc})') || takeChart.includes('idxPts < 2'));
});

test('TD-26 newNextLabel uses today or the ART date (P2-34b)', () => {
  const now = new Date('2026-10-20T16:00:00.000Z');
  const today = newNextLabel('2026-10-20T16:21:00.000Z', now);
  assert.match(today, /^Primera revisión: hoy a las /);
  assert.equal(today, TD_NEW_NEXT(today.slice('Primera revisión: hoy a las '.length)));
  const later = newNextLabel('2026-10-22T16:21:00.000Z', now);
  assert.ok(later.includes('a las'));
  assert.ok(!later.includes('hoy a las'));
  assert.match(later, /oct/i);
  assert.equal(newNextLabel(null, now), '');
  assert.ok(TD_NEW_NEXT_ON('22 oct', '13:21').includes('22 oct'));
});

test('TD-27 archived: banner, no pill/review, disabled dock, Ajustes = índice + gestionar', () => {
  assert.equal(TD_ARCHIVED_BANNER, 'Archivada: ya no se sigue. La historia queda como estaba.');
  assert.equal(TD_ARCHIVED_ASK, 'Archivada: no admite consultas');
  const banner = archivedBannerHtml({esc});
  assert.ok(banner.includes(TD_ARCHIVED_BANNER));
  const dock = takeAskDockHtml({
    id: 't1', placeholder: TD_ARCHIVED_ASK, buttonClass: 'btn', disabled: true, esc,
  });
  assert.ok(dock.includes(TD_ARCHIVED_ASK));
  assert.match(dock, /disabled/);
  assert.ok(!dock.includes('btn primary'));
  const archived = activeTake();
  archived.phase = 'archived';
  archived.monitoringPaused = true;
  const html = ajustesPageHtml({t: archived, esc, autoHtml: '<section data-auto-section="1"></section>'});
  assert.match(html, /id="indice"/);
  assert.match(html, /id="gestionar"/);
  assert.ok(!html.includes('id="seguimiento"'));
  assert.ok(!html.includes('id="reglas"'));
  assert.ok(!html.includes('data-auto-section'));
  assert.ok(!html.includes('Duplicar'));
  assert.ok(!html.includes('Desarchivar'));
  assert.ok(html.includes(TD_ARCHIVED_AT('')) || html.includes('La historia queda guardada'));
  const app = readFileSync('public/app.js', 'utf8');
  const takePage = app.slice(app.indexOf('function takePage'), app.indexOf('function news('));
  assert.match(takePage, /archivedBannerHtml/);
  assert.match(takePage, /TD_ARCHIVED_ASK/);
  assert.match(takePage, /disabled: archived \|\| paused/);
  assert.match(takePage, /const review = archived \|\| draft \? null/);
  assert.ok(!takePage.includes('archived || draft || fresh ? null'));
  assert.ok(!app.includes('data-action="unarchive"'));
  assert.ok(!app.includes('data-action="delete-take"'));
  assert.ok(!app.includes('Duplicar'));
});

test('TD-23/24/27 CSS: 44px targets, one Reintentar row at 390, skeleton', () => {
  const css = readFileSync('public/app-theme.css', 'utf8');
  assert.match(css, /\.take-loading/);
  assert.match(css, /\.chart-cmp button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.periods \.period[\s\S]*min-height:\s*44px/);
  assert.match(css, /\.take-state-actions \.btn\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.take-state-actions/);
  assert.match(css, /\.take-callout/);
  assert.match(css, /\.stat-big\.muted/);
});

test('TD3 keeps TD1 focus, TD2 header locks, no index selector, no alias, no secrets', () => {
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /function focusH1/);
  assert.match(app, /lastRenderedRouteKey/);
  assert.match(app, /restoreFocusKey/);
  assert.match(app, /const keep = sameRoute \? \(focusKeyOf\(document\.activeElement\) \|\| pendingFocusKey\) : null/);
  assert.match(app, /if \(!restored && !lastPanelKey\)/);
  assert.match(app, /headerActions\(t\)/);
  assert.match(app, /ideaHowHtml/);
  assert.match(app, /autoSettingsHtml/);
  assert.match(app, /t\.id, t\.version, t\.phase, t\.title/);
  const indexHtml = readFileSync('public/ajustes.mjs', 'utf8');
  const indexFn = indexHtml.slice(indexHtml.indexOf('function indexSectionHtml'), indexHtml.indexOf('function manageSectionHtml'));
  assert.ok(!indexFn.includes('<select'));
  assert.ok(!app.includes('GOOGLE_ALLOW_SUPERADMIN'));
  const files = ['public/copy.mjs', 'public/app.js', 'public/tesis-detalle.mjs', 'public/ajustes.mjs'];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/\bAutopilot\b/.test(text), `${file} has Autopilot`);
    assert.ok(!text.includes('Make it real'), `${file} has Make it real`);
    assert.ok(!text.includes('Duplicar como borrador'), `${file} has Duplicar`);
  }
  assert.ok(PRACTICE_FOOTER.includes('el análisis puede equivocarse'));
  assert.match(readFileSync('public/ajustes.mjs', 'utf8'), /TD_INDEX_CHOSEN|TD_INDEX_RULE/);
  assert.ok(!readFileSync('lib/google-auth.mjs', 'utf8').includes('changed-by-td3'));
});
