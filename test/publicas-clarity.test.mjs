import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {artShortDayMonth} from '../public/format.mjs';
import {
  PUB_COL_30D_SHORT, PUB_COL_30D_SUB, PUB_COL_INDEX, PUB_COL_REASON, PUB_COL_STATE,
  PUB_MINE_NEW, PUB_MINE_OUT, PUB_MINE_RANKED, PUB_MINE_TITLE, PUB_OUT_REASON, PUB_RANK_COUNT,
  PUB_WINDOW, USER_MENU_ALIAS,
} from '../public/copy.mjs';
import {publicDetailPageHtml, publicListPageHtml, windowRange} from '../public/publicas.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function item(over = {}) {
  return {
    publicId: 'aaaaaaaaaaaaaaaa', title: 'Energía en Vaca Muerta', alias: 'nodo_sur',
    pctSince: 11.2, pct30d: 6.8, bench30d: 4.7, benchLabel: 'Índice Merval',
    holdings: [{ticker: 'YPF', weight: 35}, {ticker: 'GGAL', weight: 20}],
    daysActive: 40, ranked: true, position: 1, autoLabel: false, note: null, stale: false, mine: false,
    ...over,
  };
}

function board(over = {}) {
  return {
    items: [
      item({mine: true}),
      item({publicId: 'bbbbbbbbbbbbbbbb', title: 'Nueva tesis', ranked: false, position: null, daysActive: 8}),
      item({publicId: 'cccccccccccccccc', title: 'Fuera tesis', ranked: false, note: 'correccion'}),
    ],
    total: 3, nextPage: null, windowEnd: '2026-11-16',
    ...over,
  };
}

const css = readFileSync('public/app-theme.css', 'utf8');

test('F8 windowRange treats windowEnd as an ART calendar day', () => {
  assert.deepEqual(windowRange('2026-11-16'), {from: '18 oct', to: '16 nov'});
  assert.equal(artShortDayMonth('2026-11-16'), '16 nov');
  assert.equal(artShortDayMonth('2026-01-01'), '1 ene');
  // ISO instants still format in ART (02:00Z is the previous evening in Buenos Aires).
  assert.equal(artShortDayMonth('2026-10-06T15:00:00.000Z'), '6 oct');
  assert.equal(artShortDayMonth('2026-11-16T02:00:00.000Z'), '15 nov');
  assert.equal(artShortDayMonth('no-es-fecha'), '');
});

test('F8 list and detail read the corrected window', () => {
  const html = publicListPageHtml({list: board({items: [item({stale: true})]}), esc});
  assert.ok(html.includes(esc(PUB_WINDOW('18 oct', '16 nov'))));
  assert.ok(html.includes('cierre de la rueda del 16 nov'));
  assert.ok(html.includes('del 18 oct al 16 nov.'), 'caption');
  assert.ok(html.includes('Muestra el cierre del 16 nov.'), 'stale banner');
  assert.ok(html.includes('Ventana: hasta el 16 nov.'), 'how body');
  const detail = publicDetailPageHtml({item: item({windowEnd: '2026-11-16'}), esc});
  assert.ok(detail.includes('del 18 oct al 16 nov'));
});

test('F1 header: one wrapper div with eyebrow, h1 and lead; window moves to ranking head', () => {
  const html = publicListPageHtml({list: board(), esc});
  assert.match(html, /^<section class="pub-page"><div class="page-heading"><div><p class="eyebrow">/);
  const heading = html.slice(html.indexOf('<div class="page-heading">'), html.indexOf('<p class="disclaimer'));
  assert.equal(heading.includes('Ventana'), false);
  assert.match(heading, /<h1 tabindex="-1">Tesis públicas<\/h1>/);
  assert.match(html, /<div class="section-heading pub-rank-head"><h2 id="pub-rank">/);
  assert.ok(html.includes(`<p class="small muted">${esc(PUB_RANK_COUNT(1, '18 oct', '16 nov'))}</p>`));
  assert.equal(PUB_RANK_COUNT(1, '18 oct', '16 nov'), '1 tesis con puesto · del 18 oct al 16 nov');
  assert.equal(PUB_RANK_COUNT(4), '4 tesis con puesto');
});

test('F3/F4 Tus tesis públicas is a settings-section card with a link-btn alias', () => {
  const html = publicListPageHtml({
    list: board(),
    takes: [{isPublic: true, publicId: 'bbbbbbbbbbbbbbbb', title: 'Nueva tesis', phase: 'active'}],
    esc,
  });
  assert.match(html, /<section class="pub-mine settings-section" id="mias" tabindex="-1" aria-labelledby="pub-mine-h">/);
  assert.ok(html.includes(`<h2 id="pub-mine-h">${esc(PUB_MINE_TITLE)}</h2>`));
  assert.equal(PUB_MINE_TITLE, 'Tus tesis públicas');
  assert.ok(html.includes(`<button type="button" class="link-btn" data-action="alias-edit">${esc(USER_MENU_ALIAS)}</button>`));
  assert.ok(html.includes('<ul class="pub-mine-list">'));
  assert.ok(html.includes(`<span class="pub-mine-status">${esc(PUB_MINE_RANKED(1, 1))}</span>`));
  assert.equal(PUB_MINE_RANKED(3, 8), 'Puesto 3 de 8');
  assert.equal(PUB_MINE_RANKED(3), 'Puesto 3');
  assert.equal(PUB_MINE_NEW, 'En Nuevas');
  assert.equal(PUB_MINE_OUT, 'Fuera del ranking este período');
  assert.equal(html.includes(' · Puesto'), false);
  assert.match(css, /\.pub-mine-list \{\s*list-style: none;/);
  assert.match(css, /\.pub-mine \.link-btn \{\s*margin-left: 0;/);
});

test('F6 ranking table has 5 columns, colgroup and right-aligned numbers', () => {
  const html = publicListPageHtml({list: board(), esc});
  const table = html.slice(html.indexOf('<table class="lb-table" '), html.indexOf('</table>'));
  const thead = table.slice(table.indexOf('<thead>'), table.indexOf('</thead>'));
  assert.equal((thead.match(/<th scope="col"/g) || []).length, 5);
  assert.ok(table.includes('<colgroup><col class="c-pos"><col><col class="c-num"><col class="c-num"><col class="c-num"></colgroup>'));
  assert.ok(thead.includes(`${PUB_COL_30D_SHORT} <span aria-hidden="true">↓</span><span class="lb-sub">${PUB_COL_30D_SUB}</span>`));
  assert.ok(thead.includes(`>${PUB_COL_INDEX}<`));
  // copy-banned forbids «vs. índice»; the key keeps «vs. Índice» and thead renders it uppercase.
  assert.equal(PUB_COL_INDEX, 'vs. Índice');
  assert.equal(thead.includes('Alias'), false);
  assert.equal(thead.includes('Etiquetas'), false);
  const row = table.slice(table.indexOf('<tbody>'));
  assert.equal((row.match(/<td /g) || []).length, 4);
  assert.match(row, /<th scope="row"><a class="lb-title"[^>]*>Energía en Vaca Muerta<\/a><div class="lb-meta"><span class="lb-by">por nodo_sur<\/span><span class="chip-s lb-tag">Práctica<\/span><span class="chip-s lb-tag lb-mine-chip">Tu tesis<\/span><\/div>/);
  assert.match(css, /\.lb-table \.lb-n \{\s*text-align: right;\s*font-variant-numeric: tabular-nums;/);
  assert.match(css, /\.lb-table thead th \{\s*font: 600 10px var\(--lv-sans\);\s*text-transform: uppercase;\s*letter-spacing: 0\.08em;/);
});

test('F2/F11 side tables: 3 columns, Estado / Motivo headers, no nth-child widths', () => {
  const html = publicListPageHtml({list: board(), esc});
  const sides = html.split('<table class="lb-table lb-table-side"').slice(1).map(t => t.slice(0, t.indexOf('</table>')));
  assert.equal(sides.length, 2);
  const heads = sides.map(t => [...t.slice(t.indexOf('<thead>'), t.indexOf('</thead>')).matchAll(/<th scope="col"[^>]*>([^<]*)/g)].map(m => m[1]));
  assert.deepEqual(heads, [['Tesis', 'Desde el inicio', PUB_COL_STATE], ['Tesis', 'Desde el inicio', PUB_COL_REASON]]);
  assert.equal(PUB_COL_STATE, 'Estado');
  assert.equal(PUB_COL_REASON, 'Motivo');
  assert.ok(sides[1].includes(`<td class="small lb-state">${PUB_OUT_REASON}</td>`));
  assert.equal(sides[0].includes('<th scope="col">Activa</th>'), false);
  assert.ok(sides[0].includes('<colgroup><col><col class="c-num"><col class="c-state"></colgroup>'));
  assert.doesNotMatch(css, /\.lb-table[^{]*nth-child/);
});

test('F5/F7/F9/F10 CSS: section h2 size, card 30d value, stale contrast, legend rule', () => {
  assert.match(css, /\.pub-page h2 \{ font-size: 1\.15rem; \}/);
  assert.match(css, /\.lb-card \{\s*display: grid;\s*grid-template-columns: 32px minmax\(0, 1fr\);\s*column-gap: 8px;/);
  assert.match(css, /\.lb-card-30 \.lb-num \{ font: inherit; \}/);
  assert.match(css, /\.lb-stale \{ color: var\(--lv-watch-text\); font-size: 12px;/);
  assert.doesNotMatch(css, /\.lb-stale \{ color: var\(--lv-warning\)/);
  assert.doesNotMatch(css, /@media \(max-width: 370px\) \{\s*\.lb-card/);
  assert.match(css, /\.pub-legend \{[^}]*border-top: 1px solid var\(--lv-line\);[^}]*padding-top: 12px|\.pub-legend \{[^}]*padding-top: 12px;[^}]*border-top: 1px solid var\(--lv-line\);/);
});

test('F7 mobile cards: position + body grid, meta line, 30d label kept', () => {
  const html = publicListPageHtml({list: board(), esc});
  const cards = html.slice(html.indexOf('<ol class="lb-cards"'), html.indexOf('</ol>'));
  assert.match(cards, /<li class="lb-card lb-mine">\s*<span class="lb-pos num" aria-hidden="true">1<\/span>\s*<div class="lb-card-body"><a class="lb-title"/);
  assert.ok(cards.includes('<p class="lb-card-lab">Resultado de práctica · 30 días</p>'));
  assert.ok(cards.includes('<div class="lb-meta"><span class="lb-by">por nodo_sur</span>'));
});

test('F12/F13 states: loading head, empty card, error retry spacing', () => {
  const loading = publicListPageHtml({loading: true, esc});
  assert.match(loading, /<div class="section-heading pub-rank-head"><h2 id="pub-rank">Ranking a 30 días<\/h2><\/div><div class="lb-skeleton" aria-busy="true"/);
  const empty = publicListPageHtml({list: {items: [], total: 0}, esc});
  assert.match(empty, /<section class="home-empty card-empty pub-empty" aria-labelledby="pub-empty-h"><h2 id="pub-empty-h">Todavía no hay tesis públicas\.<\/h2>/);
  assert.match(empty, /<a class="btn" href="#\/takes">Ir a Mis tesis<\/a>/);
  const err = publicListPageHtml({error: true, esc});
  assert.match(err, /<div class="callout error" role="alert">[^<]+<\/div>\s*<button type="button" class="btn pub-retry" data-action="pub-retry">/);
  assert.match(css, /\.pub-page \.callout\.error \+ \.pub-retry \{ margin-top: 12px; \}/);
  for (const html of [loading, empty, err]) {
    assert.equal(html.includes('class="btn primary"'), false);
    assert.equal(html.includes('Ventana'), false);
  }
});
