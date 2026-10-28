import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {
  ENTRY_PROPOSE_CTA, ENTRY_MANUAL_CTA, ENTRY_HEADING, HOME_PEDAGOGY_TITLE,
  HOME_STAT_THESIS, DRAFT_MODE_PILL, DRAFT_COMP_TITLE, DRAFT_CAPITAL_PENDING,
  TD_SET_TITLE, TD_RULES_SAVE,
} from '../public/copy.mjs';
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
  assert.match(draftPrep, /DRAFT_GUIDE/);
  assert.equal(DRAFT_MODE_PILL.includes('Borrador'), true);
  assert.equal(DRAFT_COMP_TITLE.includes('canasta'), true);
  assert.equal(DRAFT_CAPITAL_PENDING, 'Se confirma al activar');
});

test('ajustes keeps TD1 contracts and adds Stitch numbered sections + band', () => {
  const t = createTake(templates[0]);
  activate(t, 1_000_000);
  t.monitoringPaused = false;
  const html = ajustesPageHtml({t, esc, autoHtml: ''});
  assert.match(html, /class="ajustes-page"/);
  assert.match(html, new RegExp(`<h1 tabindex="-1">${TD_SET_TITLE}</h1>`));
  assert.match(html, /← /);
  assert.equal((html.match(/class="btn primary"/g) || []).length, 1);
  assert.match(html, new RegExp(TD_RULES_SAVE));
  assert.match(html, /sec-num/);
  assert.match(html, /tolerance-band/);
  assert.match(html, /ajustes-savebar/);
  assert.match(html, /YPF/);
  assert.ok(!html.includes('cdn.tailwindcss.com'));
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
