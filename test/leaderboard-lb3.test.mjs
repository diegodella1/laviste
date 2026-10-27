import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  MINUS, NBSP, NNBSP, pctSigned1, ppSigned1, srSignedPct, srSignedPp,
} from '../public/format.mjs';
import {
  ALIAS_ERR_AT, ALIAS_ERR_EMAIL, ALIAS_ERR_LENGTH, ALIAS_ERR_TAKEN,
  NAV_PUBLIC, PUB_DISCLAIMER, PUB_EMPTY_BODY, PUB_NORANK_TITLE, PUB_ONLY_MINE,
  PUB_RANK_TITLE, PUB_TAG_AUTO, PUB_TAG_PRACTICE, PUBLIC_CHIP, PUBLIC_CONSENT_CHECK,
  PUBLIC_CONSENT_CONFIRM, PUBLIC_DISABLED_DRAFT, PUBLIC_SECTION_TITLE,
  PUBLIC_SWITCH_LABEL, USER_MENU_ALIAS, friendlyApiError, friendlyPublicError,
} from '../public/copy.mjs';
import {clientValidateAlias} from '../public/public-alias.mjs';
import {
  mineEntries, moreCount, publicAliasModalHtml, publicChipHtml, publicConsentHtml,
  publicDetailPageHtml, publicListPageHtml, publicSwitchSectionHtml, sortHoldings,
  splitBoardItems, windowRange,
} from '../public/publicas.mjs';
import {ajustesPageHtml} from '../public/ajustes.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function item(over = {}) {
  return {
    publicId: 'aaaaaaaaaaaaaaaa',
    title: 'Energía en Vaca Muerta',
    alias: 'nodo_sur',
    pctSince: 11.2,
    pct30d: 6.8,
    bench30d: 4.7,
    benchLabel: 'Índice Merval',
    holdings: [{ticker: 'YPF', weight: 35}, {ticker: 'GGAL', weight: 20}, {ticker: 'PAM', weight: 20}],
    daysActive: 40,
    ranked: true,
    position: 1,
    autoLabel: false,
    note: null,
    stale: false,
    mine: false,
    ...over,
  };
}

test('LB0-7 pctSigned1 / ppSigned1 formats', () => {
  assert.equal(pctSigned1(6.8), `+6,8${NNBSP}%`);
  assert.equal(pctSigned1(-2.4), `${MINUS}2,4${NNBSP}%`);
  assert.equal(pctSigned1(-0.04), `0,0${NNBSP}%`);
  assert.equal(pctSigned1(0.04), `0,0${NNBSP}%`);
  assert.equal(pctSigned1(null), '—');
  assert.equal(ppSigned1(2.1), `+2,1${NBSP}pp`);
  assert.equal(ppSigned1(-0.4), `${MINUS}0,4${NBSP}pp`);
  assert.equal(ppSigned1(0), `0,0${NBSP}pp`);
});

test('LB0-8 screen-reader signed numbers', () => {
  assert.equal(srSignedPct(6.8), 'más 6,8 por ciento');
  assert.equal(srSignedPct(-2.4), 'menos 2,4 por ciento');
  assert.equal(srSignedPct(0), '0 por ciento');
  assert.equal(srSignedPct(null), 'sin dato');
  assert.equal(srSignedPp(2.1), 'más 2,1 puntos porcentuales');
  assert.equal(srSignedPp(-0.4), 'menos 0,4 puntos porcentuales');
});

test('LB0-26 client alias validation', () => {
  assert.equal(clientValidateAlias('ab').message, ALIAS_ERR_LENGTH);
  assert.equal(clientValidateAlias('nico@').message, ALIAS_ERR_AT);
  assert.equal(clientValidateAlias('Diego', {email: 'diego@example.test'}).message, ALIAS_ERR_EMAIL);
  assert.equal(clientValidateAlias('diego', {email: 'Diego@example.test'}).message, ALIAS_ERR_EMAIL);
  assert.equal(clientValidateAlias('nodo_sur', {email: 'diego@example.test'}).ok, true);
});

test('friendlyApiError maps alias and visibility codes', () => {
  assert.equal(friendlyApiError({code: 'alias_en_uso', message: 'x'}), ALIAS_ERR_TAKEN);
  assert.equal(friendlyPublicError({code: 'alias_en_uso'}), ALIAS_ERR_TAKEN);
  assert.equal(friendlyApiError({code: 'version_cambiada', message: 'x'}).includes('cambió'), true);
});

test('splitBoardItems keeps API order and buckets', () => {
  const ranked = item({position: 1});
  const nueva = item({publicId: 'b', ranked: false, position: null, daysActive: 4, title: 'Nueva'});
  const out = item({publicId: 'c', ranked: false, note: 'correccion', title: 'Fuera'});
  const overflow = item({publicId: 'd', ranked: true, position: null, note: 'fuera'});
  const split = splitBoardItems([ranked, nueva, out, overflow]);
  assert.deepEqual(split.ranked.map(i => i.publicId), [ranked.publicId]);
  assert.deepEqual(split.nuevas.map(i => i.publicId), ['b']);
  assert.deepEqual(split.fuera.map(i => i.publicId), ['c']);
  assert.equal(split.overflow.length, 1);
});

test('holdings sort by weight then ticker', () => {
  const rows = sortHoldings([{ticker: 'PAM', weight: 20}, {ticker: 'YPF', weight: 35}, {ticker: 'GGAL', weight: 20}]);
  assert.deepEqual(rows.map(r => r.ticker), ['YPF', 'GGAL', 'PAM']);
});

test('windowRange is 30 calendar days ending on windowEnd', () => {
  const {from, to} = windowRange('2026-10-17');
  assert.ok(from);
  assert.ok(to);
  assert.notEqual(from, to);
});

test('list page: table + cards, disclaimer, no primary, no gain/loss', () => {
  const html = publicListPageHtml({
    list: {items: [item({mine: true}), item({publicId: 'bbbbbbbbbbbbbbbb', ranked: false, position: null, daysActive: 8})], total: 2, nextPage: null, windowEnd: '2026-10-17'},
    takes: [{isPublic: true, publicId: 'aaaaaaaaaaaaaaaa', title: 'Energía en Vaca Muerta', phase: 'active'}],
    moreK: 0, esc,
  });
  assert.match(html, /<table class="lb-table"/);
  assert.match(html, /<caption class="sr-only">/);
  assert.match(html, /th scope="col"/);
  assert.match(html, /th scope="row"/);
  assert.match(html, /aria-sort="descending"/);
  assert.match(html, /<ol class="lb-cards"/);
  assert.ok(html.includes(PUB_DISCLAIMER.replace('Práctica simulada. ', '')));
  assert.ok(html.includes(PUB_RANK_TITLE));
  assert.ok(html.includes(PUB_TAG_PRACTICE));
  assert.ok(!html.includes(`>${PUB_TAG_AUTO}<`));
  assert.equal(html.includes('class="btn primary"'), false);
  assert.equal(html.includes('class="gain"') || html.includes('class="loss"'), false);
  assert.ok(html.includes('YPF'));
  assert.ok(html.includes(`35${NNBSP}%`) || html.includes('35'));
  assert.ok(!html.includes('$'));
  assert.ok(!html.includes('En camino'));
  assert.ok(html.includes(PUB_ONLY_MINE) === false || html.includes('Tu tesis'));
});

test('empty / norank / error / gone states', () => {
  const empty = publicListPageHtml({list: {items: [], total: 0}, esc});
  assert.ok(empty.includes(PUB_EMPTY_BODY));
  assert.ok(empty.includes(PUB_DISCLAIMER.replace('Práctica simulada. ', '')));
  const norank = publicListPageHtml({
    list: {items: [item({ranked: false, position: null, daysActive: 3})], total: 1, windowEnd: '2026-10-17'},
    esc,
  });
  assert.ok(norank.includes(PUB_NORANK_TITLE));
  const err = publicListPageHtml({error: true, esc});
  assert.match(err, /role="alert"/);
  assert.match(err, /data-action="pub-retry"/);
  const gone = publicDetailPageHtml({gone: true, esc});
  assert.ok(gone.includes('ya no es pública'));
  assert.ok(gone.includes(PUB_DISCLAIMER.replace('Práctica simulada. ', '')));
});

test('loading skeleton is 8 rows and detail omits chart when no series', () => {
  const html = publicListPageHtml({loading: true, esc});
  assert.equal((html.match(/class="sk lb-sk"/g) || []).length, 8);
  assert.match(html, /aria-busy="true"/);
  const detail = publicDetailPageHtml({item: item(), esc});
  assert.ok(!detail.includes('base 100'));
  assert.ok(!detail.includes('class="btn primary"'));
  assert.ok(detail.includes('Composición objetivo'));
});

test('switch section and consent dialog', () => {
  const t = createTake(templates[0]);
  activate(t, 1_000_000);
  t.isPublic = false;
  const off = publicSwitchSectionHtml({take: t, available: true, esc});
  assert.ok(off.includes(PUBLIC_SECTION_TITLE));
  assert.match(off, /role="switch"/);
  assert.match(off, /aria-checked="false"/);
  assert.ok(off.includes(PUBLIC_SWITCH_LABEL));
  const hidden = publicSwitchSectionHtml({take: t, available: false, esc});
  assert.equal(hidden, '');
  t.phase = 'draft';
  const draft = publicSwitchSectionHtml({take: t, available: true, esc});
  assert.match(draft, /aria-disabled="true"/);
  assert.ok(draft.includes(PUBLIC_DISABLED_DRAFT));
  t.phase = 'archived';
  assert.equal(publicSwitchSectionHtml({take: t, available: true, esc}), '');
  const consent = publicConsentHtml({needAlias: true, esc});
  assert.ok(consent.includes(PUBLIC_CONSENT_CHECK));
  assert.ok(consent.includes(PUBLIC_CONSENT_CONFIRM));
  assert.ok(!consent.includes(' required'));
  assert.match(consent, /disabled/);
  const alias = publicAliasModalHtml({value: 'nodo_sur', esc});
  assert.equal((alias.match(/btn primary/g) || []).length, 1);
});

test('ajustes only shows Visibilidad when HTML is passed', () => {
  const t = createTake(templates[0]);
  activate(t, 1_000_000);
  const bare = ajustesPageHtml({t, esc, autoHtml: ''});
  assert.ok(!bare.includes(PUBLIC_SECTION_TITLE));
  const withVis = ajustesPageHtml({
    t, esc, autoHtml: '',
    visibilityHtml: publicSwitchSectionHtml({take: t, available: true, esc}),
  });
  assert.ok(withVis.includes(PUBLIC_SECTION_TITLE));
  assert.ok(withVis.indexOf('id="seguimiento"') < withVis.indexOf('id="visibilidad"'));
});

test('chip, mine beyond top 50, pagination helper', () => {
  assert.match(publicChipHtml({esc}), new RegExp(PUBLIC_CHIP));
  const mine = mineEntries({
    takes: [{isPublic: true, publicId: 'far', title: 'Lejos', phase: 'active'}],
    items: [],
    mineSummary: {publicId: 'far', ranked: true, position: null},
  });
  assert.equal(mine[0].beyond || !mine[0].position, true);
  assert.equal(moreCount(20, 2), 20);
  assert.equal(moreCount(50, 3), 0);
  assert.equal(moreCount(12, null), 0);
});

test('nav, routes and feature probe are wired in app.js', () => {
  const app = readFileSync('public/app.js', 'utf8');
  const css = readFileSync('public/app-theme.css', 'utf8');
  assert.match(app, /#\/publicas',\s*NAV_PUBLIC/);
  assert.match(app, /page === 'publicas'/);
  assert.match(app, /apiOptional\('\/leaderboard'\)/);
  assert.match(app, /searchParams\.set\('next'/);
  assert.match(app, /data-action="alias-edit"/);
  assert.match(app, /action === 'public-toggle'/);
  assert.match(app, /USER_MENU_ALIAS/);
  assert.ok(app.indexOf("['#/takes', 'Mis tesis']") < app.indexOf("['#/publicas', NAV_PUBLIC]"));
  assert.ok(app.indexOf("['#/publicas', NAV_PUBLIC]") < app.indexOf("['#/new', 'Nueva tesis']"));
  assert.match(css, /@media \(max-width: 719px\)/);
  assert.match(css, /\.lb-table-wrap \{ display: none; \}/);
  assert.match(css, /\.lb-cards \{ display: block; \}/);
  assert.equal(NAV_PUBLIC, 'Tesis públicas');
});

test('LB0-31 delta never introduces banned UI words', () => {
  const files = ['public/publicas.mjs', 'public/public-alias.mjs', 'public/copy.mjs', 'public/app.js'];
  const banned = [
    /\bTake\b/, /Autopilot/, /SuperTake/, /Leaderboard/, /ganarle/, /le ganó/,
    /copiar cartera/, /copiá/,
  ];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const re of banned) {
      assert.equal(re.test(text), false, `${file} matches ${re}`);
    }
    assert.ok(!text.includes('Preferencias'), `${file} Preferencias`);
  }
});
