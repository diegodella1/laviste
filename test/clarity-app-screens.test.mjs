import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {
  ENTRY_PROPOSE_CTA, ENTRY_MANUAL_CTA, ENTRY_HEADING, ENTRY_PEDAGOGY,
  HOME_PEDAGOGY_TITLE, HOME_STAT_THESIS, DRAFT_MODE_PILL, DRAFT_COMP_TITLE,
  DRAFT_CAPITAL_PENDING, DRAFT_BASKET_FULL, DRAFT_BASKET_INCOMPLETE,
  draftBasketLabel, TD_SET_TITLE, TD_RULES_SAVE,
} from '../public/copy.mjs';
import {NNBSP, pctInt} from '../public/format.mjs';
import {ajustesPageHtml} from '../public/ajustes.mjs';

const app = readFileSync('public/app.js', 'utf8');
const theme = readFileSync('public/app-theme.css', 'utf8');
const brand = readFileSync('public/brand.css', 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function sliceFn(src, name, next) {
  const start = src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = next ? src.indexOf(`function ${next}`, start + 1) : src.length;
  assert.ok(end > start, `missing end after ${name}`);
  return src.slice(start, end);
}

test('Stitch Clarity maps onto existing authenticated routes', () => {
  const home = sliceFn(app, 'home()', 'thesisRow');
  const thesisRow = sliceFn(app, 'thesisRow', 'aggregateHistory');
  const beginner = sliceFn(app, 'beginnerEntries', 'homeDemoBlock');
  const newPage = sliceFn(app, 'newPage', 'chatPage');
  const takePage = sliceFn(app, 'takePage', 'news(');
  const draftPrep = sliceFn(app, 'draftPrepHtml', 'takePage');

  assert.match(home, /class="hero-n home-hero"/);
  assert.match(home, /class="home-dash"/);
  assert.match(home, /homePedagogyHtml/);
  assert.match(home, /HOME_STAT_THESIS/);
  assert.match(home, /ts\.reduce\(\(s, t\) => s \+ total\(t\)/);
  assert.match(home, /href="#\/new"/);
  assert.match(home, /class="btn primary"/);

  assert.match(thesisRow, /dayDeltaHtml\(t\)/);
  assert.match(thesisRow, /phase !== 'draft'/);
  assert.match(thesisRow, /data-action="activate"/);
  assert.match(thesisRow, /class="btn" data-action="activate"/);
  assert.ok(!/class="btn primary" data-action="activate"/.test(thesisRow));
  assert.match(thesisRow, /thesis-card/);

  assert.match(beginner, /#\/new\/proponer/);
  assert.match(beginner, /#\/new\/manual/);
  assert.match(beginner, /entry-card-propose/);
  assert.match(beginner, /class="btn primary"/);
  assert.equal(ENTRY_PROPOSE_CTA, 'Proponer cartera');
  assert.equal(ENTRY_MANUAL_CTA, 'Armar a mano');
  assert.match(ENTRY_HEADING, /idea o tesis/);

  assert.match(newPage, /ENTRY_HEADING/);
  assert.match(newPage, /beginnerEntries/);

  assert.match(takePage, /take-hero-n/);
  assert.match(takePage, /draftPrepHtml/);
  assert.match(draftPrep, /data-action="activate"/);
  assert.match(draftPrep, /data-action="draft-weights"/);
  assert.equal((draftPrep.match(/data-action="draft-weights"/g) || []).length, 1);
  assert.ok(!draftPrep.includes('class="lnk"'));
  assert.match(draftPrep, /DRAFT_GUIDE/);
  assert.equal(DRAFT_MODE_PILL.includes('Borrador'), true);
  assert.equal(DRAFT_COMP_TITLE.includes('canasta'), true);
  assert.equal(DRAFT_CAPITAL_PENDING, 'Se confirma al activar');
});

test('ajustes keeps TD1 contracts and adds Stitch numbered sections + band', () => {
  const t = createTake(templates[0]);
  activate(t, 1_000_000);
  t.monitoringPaused = false;
  const html = ajustesPageHtml({t, esc, autoHtml: '<section data-auto-section="1"><h2>Automático (práctica)</h2></section>'});
  assert.match(html, /class="ajustes-page"/);
  assert.match(html, new RegExp(`<h1 tabindex="-1">${TD_SET_TITLE}</h1>`));
  assert.match(html, /← /);
  assert.equal((html.match(/class="btn primary"/g) || []).length, 1);
  assert.match(html, new RegExp(TD_RULES_SAVE));
  assert.match(html, /sec-num/);
  assert.match(html, /<h2><span class="sec-num" aria-hidden="true"><\/span>Automático/);
  assert.match(html, /tolerance-band/);
  assert.match(html, /ajustes-savebar/);
  assert.match(html, /YPF/);
  assert.ok(!html.includes('cdn.tailwindcss.com'));
  assert.ok(!html.includes('aria-hidden="true">1</span>'));
  assert.ok(!html.includes('aria-hidden="true">2</span>'));
});

test('ajustes draft section chips start at 1 (no hardcoded 2 / ::before 3)', () => {
  const draft = createTake(templates[0]);
  const draftHtml = ajustesPageHtml({t: draft, esc, autoHtml: ''});
  assert.ok(!draftHtml.includes('id="seguimiento"'));
  assert.match(draftHtml, /id="td-rules"/);
  assert.equal((draftHtml.match(/class="sec-num"/g) || []).length, 1);
  assert.ok(!draftHtml.includes('aria-hidden="true">2</span>'));
  assert.ok(!theme.includes(".sec-auto h2::before"));
  assert.match(theme, /counter-reset:\s*lv-sec/);
  assert.match(theme, /\.ajustes-page \.sec-num::before \{[\s\S]*content:\s*counter\(lv-sec\)/);
  assert.match(theme, /\.ajustes-page \.sec-num \{[\s\S]*color:\s*var\(--lv-accent-ink\)/);
});

test('nueva preview bar uses theme buckets, not mint fill', () => {
  assert.match(theme, /\.entry-preview-bar i:nth-child\(3\) \{ background: var\(--tb-3\)/);
  const block = theme.slice(theme.indexOf('.entry-preview-bar i:nth-child'));
  assert.ok(!block.includes('--lv-gain-mint'));
  assert.ok(!block.includes('#10B981'));
});

test('draft canasta label uses the real weight sum', () => {
  assert.equal(draftBasketLabel(100, pctInt), DRAFT_BASKET_FULL);
  assert.equal(draftBasketLabel(99.98, pctInt), DRAFT_BASKET_FULL);
  assert.match(draftBasketLabel(62, pctInt), new RegExp(DRAFT_BASKET_INCOMPLETE));
  assert.ok(!draftBasketLabel(62, pctInt).startsWith('100%'));
  const bar = sliceFn(app, 'draftWeightBar', 'draftHoldingsHtml');
  assert.match(bar, /draftBasketLabel\(sum/);
  assert.ok(!/esc\(DRAFT_BASKET_FULL\)/.test(bar));
});

test('es-AR % uses thin space in pedagogy, canasta, and tolerance band', () => {
  assert.ok(ENTRY_PEDAGOGY.includes(`100${NNBSP}%`));
  assert.ok(DRAFT_BASKET_FULL.includes(`100${NNBSP}%`));
  assert.ok(!ENTRY_PEDAGOGY.includes('100%'));
  assert.ok(!DRAFT_BASKET_FULL.includes('100%'));

  const t = createTake(templates[0]);
  activate(t, 1_000_000);
  const html = ajustesPageHtml({t, esc, autoHtml: ''});
  const band = html.slice(html.indexOf('tolerance-band'), html.indexOf('rules-custom'));
  const visible = band.replace(/<[^>]+>/g, ' ');
  assert.ok(visible.includes(`20${NNBSP}%`));
  assert.ok(visible.includes(`30${NNBSP}%`));
  assert.ok(visible.includes(`25${NNBSP}%`));
  assert.ok(!/\d %/.test(visible));
  assert.ok(!visible.includes('20 %'));

  t.holdings[0].weight = 22.5;
  t.settings.drift = 3;
  const decimal = ajustesPageHtml({t, esc, autoHtml: ''});
  const decBand = decimal.slice(decimal.indexOf('tolerance-band'), decimal.indexOf('rules-custom'));
  const decVisible = decBand.replace(/<[^>]+>/g, ' ');
  assert.ok(decVisible.includes(`19,5${NNBSP}%`));
  assert.ok(decVisible.includes(`25,5${NNBSP}%`));
  assert.ok(!decVisible.includes('22.5'));
  assert.ok(!decVisible.includes('19.5'));
});

test('narrow home cards and tolerance head stack below 480px', () => {
  assert.match(theme, /@media \(max-width: 480px\) \{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(theme, /@media \(max-width: 480px\) \{[\s\S]*tolerance-band-head \{[\s\S]*flex-direction:\s*column/);
});

test('slate primary CTA lock holds (no Codex/Tailwind blue fill)', () => {
  assert.match(brand, /--lv-ink:\s*#0F172A/);
  assert.match(theme, /\.btn\.primary \{[\s\S]*?background:\s*var\(--lv-ink\)/);
  assert.match(theme, /--lv-r-ctrl/);
  assert.match(theme, /\.home-dash \{/);
  assert.match(theme, /\.draft-prep \{/);
  assert.match(theme, /\.lv-pedagogy \{/);
  assert.match(theme, /border-radius:\s*var\(--lv-r\)/);
  assert.equal(theme.includes('cdn.tailwindcss.com'), false);
  assert.equal(app.includes('cdn.tailwindcss.com'), false);
  assert.ok(!/background:\s*#2563EB/.test(theme));
  assert.ok(!/background:\s*#3B82F6/.test(theme.match(/\.btn\.primary \{[\s\S]*?\}/)[0]));
});

test('marketing / pre-login pages stay out of this port', () => {
  for (const file of ['public/home.html', 'public/how.html', 'public/about.html']) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!text.includes('home-dash'));
    assert.ok(!text.includes('draft-prep'));
    assert.ok(!text.includes('entry-card-propose'));
  }
});

test('pedagogical home copy stays practice-only', () => {
  assert.match(HOME_PEDAGOGY_TITLE, /evolución pedagógica/);
  assert.match(HOME_STAT_THESIS, /Estado de tesis/);
  assert.match(HOME_PEDAGOGY_TITLE + HOME_STAT_THESIS, /./);
  const pedagogy = readFileSync('public/copy.mjs', 'utf8');
  assert.match(pedagogy, /No se envían órdenes/);
  assert.ok(!pedagogy.includes('Make it real'));
  assert.ok(!/\bAutopilot\b/.test(pedagogy));
});
