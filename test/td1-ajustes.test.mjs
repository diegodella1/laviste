import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {
  P1_PREFS, AUTO_CONSENT_ITEMS, AUTO_PAUSE_REASONS, PRIVACY_PUBLIC_SECTION,
  TD_SETTINGS_BTN, TD_SETTINGS_ARIA, TD_SET_TITLE, TD_SET_LEAD,
  TD_ARCHIVE_BTN, TD_ARCHIVE_TITLE, TD_ARCHIVE_CANCEL, TD_ARCHIVE_CONFIRM,
  TD_ARCHIVED_TOAST, TD_RULES_SAVE, TD_CAD_SAVED, TD_ERR_CAP_RANGE,
  TD_ERR_DRIFT_RANGE, TD_ERR_CAP_BELOW_WEIGHT, TD_INDEX_RULE, TD_INDEX_DRAFT,
  TD_INDEX_CHOSEN, PRACTICE_FOOTER, TD_PRESET_BAL_SUB, TD_AUTO_LIMITS,
} from '../public/copy.mjs';
import {
  ajustesPageHtml, archiveModalHtml, settingsPayload, validateCapDrift,
  maxTargetWeight, parseNum, presetFor, presetBlockedReason, RULES_PRESETS,
  cadenceLabel, archivedAtLabel,
} from '../public/ajustes.mjs';
import {
  takeHref, canonicalTakeHash, isAjustesTab, panelFromRoute, parseTakeParts,
} from '../public/take-route.mjs';
import {NNBSP, MINUS} from '../public/format.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function activeTake() {
  const t = createTake(templates[0]);
  activate(t, 1_000_000);
  t.monitoringPaused = false;
  return t;
}

test('TD1 copy renames Preferencias → Ajustes (4 strings)', () => {
  assert.equal(P1_PREFS, 'Ajustes');
  assert.equal(TD_SETTINGS_BTN, 'Ajustes');
  assert.match(AUTO_CONSENT_ITEMS[3], /desde Ajustes/);
  assert.ok(!AUTO_CONSENT_ITEMS[3].includes('Preferencias'));
  assert.match(AUTO_PAUSE_REASONS.politica_pausada, /desde Ajustes/);
  assert.ok(!AUTO_PAUSE_REASONS.politica_pausada.includes('Preferencias'));
  assert.match(PRIVACY_PUBLIC_SECTION, /desde sus Ajustes/);
  assert.ok(!PRIVACY_PUBLIC_SECTION.includes('Preferencias'));
});

test('TD1 user-facing sources drop Preferencias and banned SuperTake CTAs', () => {
  const files = ['public/copy.mjs', 'public/app.js', 'public/ajustes.mjs', 'public/auto.mjs', 'public/tesis-detalle.mjs'];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!text.includes('Preferencias'), `${file} still has Preferencias`);
    assert.ok(!/\bAutopilot\b/.test(text), `${file} has Autopilot`);
    assert.ok(!text.includes('Make it real'), `${file} has Make it real`);
  }
  const app = readFileSync('public/app.js', 'utf8');
  assert.ok(!app.includes('Desarchivar'));
  assert.ok(!app.includes('data-action="unarchive"'));
  assert.ok(!app.includes('data-action="delete-take"'));
  assert.match(app, /practiceFooter\(\)/);
  assert.equal(PRACTICE_FOOTER.includes('el análisis puede equivocarse'), true);
});

test('takeHref is canonical #/tesis and aliases canonicalize to ajustes', () => {
  const id = 'abc-1';
  assert.equal(takeHref(id), '#/tesis/abc-1');
  assert.equal(takeHref(id, 'ajustes'), '#/tesis/abc-1/ajustes');
  assert.equal(takeHref(id, 'settings'), '#/tesis/abc-1/ajustes');
  assert.equal(takeHref(id, 'preferencias'), '#/tesis/abc-1/ajustes');
  assert.equal(takeHref(id, 'positions'), '#/tesis/abc-1/positions');
  assert.equal(takeHref(id, 'news', 'k1'), '#/tesis/abc-1/news/k1');
  assert.equal(canonicalTakeHash('#/take/' + id), '#/tesis/' + id);
  assert.equal(canonicalTakeHash('#/take/' + id + '/settings'), '#/tesis/' + id + '/ajustes');
  assert.equal(canonicalTakeHash('#/tesis/' + id + '/preferencias'), '#/tesis/' + id + '/ajustes');
  assert.equal(canonicalTakeHash('#/tesis/' + id + '/ajustes'), null);
  assert.equal(isAjustesTab('settings'), true);
  assert.equal(isAjustesTab('preferencias'), true);
  assert.equal(isAjustesTab('ajustes'), true);
  assert.equal(panelFromRoute('settings'), null);
  assert.equal(panelFromRoute('positions'), 'positions');
  assert.deepEqual(parseTakeParts('#/tesis/' + id + '/ajustes'), ['take', id, 'ajustes']);
  assert.deepEqual(parseTakeParts('#/take/' + id + '/news'), ['take', id, 'news']);
});

test('ajustes page renders for an owned active tesis (not a panel)', () => {
  const t = activeTake();
  const html = ajustesPageHtml({t, esc, autoHtml: '<section data-auto-section="1"></section>'});
  assert.match(html, /class="ajustes-page"/);
  assert.match(html, new RegExp(`<h1 tabindex="-1">${TD_SET_TITLE}</h1>`));
  assert.match(html, new RegExp(`href="#/tesis/${t.id}"`));
  assert.match(html, /← /);
  assert.ok(html.includes(TD_SET_LEAD));
  assert.ok(!html.includes('lv-panel'));
  assert.ok(!html.includes('id="take-panel"'));
  assert.equal((html.match(/class="btn primary"/g) || []).length, 1);
  assert.match(html, new RegExp(TD_RULES_SAVE));
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /name="td-cadence"/);
  assert.match(html, /data-action="pause-follow"/);
  assert.match(html, /role="switch"/);
  assert.match(html, /id="indice"/);
  assert.ok(html.includes(t.benchmarkLabel || 'Índice'));
  assert.ok(!html.includes('<select'));
  assert.ok(!html.includes('account-dl'));
  assert.match(html, /class="index-chosen"/);
  if (t.benchmarkLabel) {
    assert.ok(html.indexOf(t.benchmarkLabel) < html.indexOf(TD_INDEX_CHOSEN));
  }
  assert.ok(html.includes(TD_INDEX_RULE) || html.includes(TD_INDEX_CHOSEN));
  assert.match(html, new RegExp(TD_ARCHIVE_BTN.replace('…', '…')));
  assert.ok(!html.includes('Duplicar'));
  assert.ok(!html.includes('Desarchivar'));
  assert.ok(html.includes('novalidate'));
});

test('ajustes phase matrix: draft hides follow/archive, archived hides rules', () => {
  const draft = createTake(templates[0]);
  const draftHtml = ajustesPageHtml({t: draft, esc, autoHtml: '<section data-auto-section="1"></section>'});
  assert.ok(!draftHtml.includes('id="seguimiento"'));
  assert.ok(draftHtml.includes('id="reglas"'));
  assert.ok(!draftHtml.includes('data-auto-section'));
  assert.ok(draftHtml.includes(TD_INDEX_DRAFT));
  assert.ok(!draftHtml.includes(TD_ARCHIVE_BTN));
  assert.ok(!draftHtml.includes('Desarchivar'));

  const archived = activeTake();
  archived.phase = 'archived';
  archived.monitoringPaused = true;
  const archivedHtml = ajustesPageHtml({t: archived, esc, autoHtml: '<section data-auto-section="1"></section>'});
  assert.ok(!archivedHtml.includes('id="seguimiento"'));
  assert.ok(!archivedHtml.includes('id="reglas"'));
  assert.ok(!archivedHtml.includes('data-auto-section'));
  assert.ok(!archivedHtml.includes(TD_ARCHIVE_BTN));
  assert.ok(!archivedHtml.includes('Desarchivar'));
  assert.ok(archivedHtml.includes(archivedAtLabel(archived)));
  assert.match(archivedHtml, /id="indice"/);
});

test('Ajustada preset is aria-disabled when a weight is over 20%', () => {
  const t = activeTake();
  assert.ok(maxTargetWeight(t) > 20);
  const tight = RULES_PRESETS.find(p => p.id === 'tight');
  const reason = presetBlockedReason(tight, t);
  assert.match(reason, /No disponible/);
  assert.match(reason, /YPF/);
  const html = ajustesPageHtml({t, esc, autoHtml: ''});
  assert.match(html, /preset-opt is-disabled/);
  assert.match(html, /name="td-preset"[^>]*aria-disabled="true"/);
  assert.match(html, /aria-describedby="td-preset-tight-reason"/);
  assert.ok(!html.includes('preset-opt is-disabled" aria-disabled'));
  assert.equal(presetFor(25, 5)?.id, 'bal');
  assert.equal(presetFor(21, 4), null);
});

test('cap/drift validation is client-side (P2-24)', () => {
  const maxW = 25;
  assert.equal(validateCapDrift(9, 5, maxW).cap, TD_ERR_CAP_RANGE);
  assert.equal(validateCapDrift(26, 5, maxW).cap, TD_ERR_CAP_RANGE);
  assert.equal(validateCapDrift(20, 5, maxW).cap, TD_ERR_CAP_BELOW_WEIGHT(25));
  assert.equal(validateCapDrift(25, 0, maxW).drift, TD_ERR_DRIFT_RANGE);
  assert.equal(validateCapDrift(25, 21, maxW).drift, TD_ERR_DRIFT_RANGE);
  assert.deepEqual(validateCapDrift(25, 5, maxW), {});
  assert.equal(parseNum('20,5'), 20.5);
  assert.equal(cadenceLabel('patient'), 'Paciente');
});

test('settings payload is complete and archive dialog has no primary', () => {
  const t = activeTake();
  t.settings.cadence = 'patient';
  t.settings.cap = 25;
  t.settings.drift = 5;
  t.monitoringPaused = false;
  assert.deepEqual(settingsPayload(t, {cadence: 'manual'}), {
    cadence: 'manual', mode: 'ask', cap: 25, drift: 5, paused: false, monitoringPaused: false,
  });
  const modal = archiveModalHtml({esc, takeId: t.id});
  assert.ok(!modal.includes('btn primary'));
  assert.ok(!modal.includes('class="btn primary"'));
  assert.match(modal, new RegExp(TD_ARCHIVE_CANCEL));
  assert.match(modal, new RegExp(TD_ARCHIVE_CONFIRM));
  assert.match(modal, /data-action="close"/);
  assert.match(modal, /data-action="archive-confirm"/);
  assert.match(modal, /id="archive-error"/);
  assert.equal(TD_ARCHIVE_TITLE('Bancos'), '¿Archivar «Bancos»?');
  assert.equal(TD_ARCHIVED_TOAST, 'Tesis archivada.');
  assert.equal(TD_SETTINGS_ARIA, 'Ajustes de la tesis');
  assert.equal(TD_CAD_SAVED('Estándar'), 'Frecuencia: Estándar.');
});

test('TD1 a11y: h1 outline, novalidate, archive focus, no unarchive', () => {
  const css = readFileSync('public/app-theme.css', 'utf8');
  assert.match(css, /\.ajustes-page h1:focus:not\(:focus-visible\)/);
  assert.match(css, /\.opt:has\(input:focus-visible\)/);
  assert.match(css, /\.opt:has\(input:checked\)::after/);
  assert.match(css, /\.take-ajustes-btn \{[\s\S]*min-height: 44px/);
  assert.match(css, /\.ajustes-page \.back \{[\s\S]*min-height: 44px/);
  const t = activeTake();
  const html = ajustesPageHtml({t, esc, autoHtml: ''});
  assert.match(html, /<h1 tabindex="-1">/);
  assert.match(html, /novalidate/);
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-checked=/);
  const modal = archiveModalHtml({esc, takeId: t.id});
  assert.match(modal, /data-action="close"/);
  assert.ok(!modal.includes('btn primary'));
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /initialFocus: '\.form-actions \[data-action="close"\]'/);
  assert.match(app, /restoreFocusKey/);
  assert.match(app, /lastRenderedRouteKey/);
  assert.match(app, /b\.focus\(\{preventScroll: true\}\)/);
  assert.match(app, /function login[\s\S]*?filter = 'all'/);
  assert.match(app, /function applySessionUser[\s\S]*?filter = 'all'/);
  assert.ok(!app.includes('data-action="unarchive"'));
  assert.ok(!html.includes('Desarchivar'));
  const archived = activeTake();
  archived.phase = 'archived';
  const archivedHtml = ajustesPageHtml({t: archived, esc, autoHtml: ''});
  assert.ok(!archivedHtml.includes('data-action="archive"'));
  assert.ok(!archivedHtml.includes('data-action="unarchive"'));
  assert.ok(!archivedHtml.includes('Desarchivar'));
});

test('TD-42 Ajustes copy uses thin space before % and no ASCII minus on money', () => {
  const t = activeTake();
  const html = ajustesPageHtml({t, esc, autoHtml: ''});
  const text = html.replace(/<[^>]+>/g, ' ');
  assert.ok(!text.includes(`-${t.settings.cap}`));
  assert.ok(!text.includes('-$'));
  assert.ok(!text.includes(MINUS + '$'));
  assert.ok(TD_PRESET_BAL_SUB.includes(`${NNBSP}%`));
  assert.ok(TD_ERR_CAP_RANGE.includes(`${NNBSP}%`));
  assert.ok(TD_AUTO_LIMITS.includes(`50${NNBSP}%`));
  assert.ok(!html.includes('Visibilidad'));
  assert.ok(!html.includes('Duplicar como borrador'));
});

test('app.js wires Ajustes as a page, chips without Preferencias, archive confirm', () => {
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /takeAjustesPage/);
  assert.match(app, /isAjustesTab\(tab\)/);
  assert.match(app, /canonicalizeHash/);
  assert.match(app, /TD_ARCHIVE_TITLE/);
  assert.match(app, /initialFocus: '\.form-actions \[data-action="close"\]'/);
  assert.match(app, /filter = 'archived'/);
  assert.match(app, /take-ajustes-btn/);
  assert.ok(!app.includes("['settings', P1_PREFS]"));
  assert.match(app, /La Viste · Ajustes · /);
  assert.match(app, /action === 'pause-follow'/);
  assert.match(app, /action === 'archive-confirm'/);
  assert.match(readFileSync('server.mjs', 'utf8'), /'\/ajustes\.mjs':'ajustes\.mjs'/);
  assert.match(readFileSync('server.mjs', 'utf8'), /'\/take-route\.mjs':'take-route\.mjs'/);
});
