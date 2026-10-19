import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  isRuleItem, isAutoTradeItem, itemMatchesNewsFilter, NEWS_FILTER_RULES,
} from '../public/novedades.mjs';
import {
  AUTO_CONSENT_VERSION, AUTO_NEWS_CONSENT_VERSION, AUTO_CONSENT_ITEMS,
  AUTO_NEWS_CONSENT_ITEMS, AUTO_CHIP_ON, AUTO_CHIP_PAUSED, AUTO_CHIP_OFF,
  AUTO_UNDO_LABEL, SETTINGS_ASK_NOTE, SETTINGS_ASK_NOTE_AUTO, ENTRY_LEAD,
  ENTRY_LEAD_AUTO, AUTO_SWITCH_OFF, AUTO_NEWS_SWITCH_LABEL,
} from '../public/copy.mjs';
import {
  autoUiVisible, autoChipState, autoChipHtml, autoSettingsHtml, autoConsentFormHtml,
  autoNewsConsentFormHtml, autoUndoButtonHtml, formatUndoPreview, formatUndoPreviewLine,
  autoPutBody, autoTradeUndoable, defaultAutoPolicy, pauseReasonLabel,
} from '../public/auto.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

test('auto UI is hidden when GET /auto is 404 (available=false)', () => {
  assert.equal(autoUiVisible({available: false}), false);
  assert.equal(autoUiVisible({available: null}), false);
  assert.equal(autoUiVisible(null), false);
  assert.equal(autoSettingsHtml({visible: false, takeId: 't1', version: 1, esc}), '');
  assert.equal(autoChipHtml(null, {}, {esc}), '');
  assert.equal(autoChipHtml(defaultAutoPolicy('t1'), {}, {esc}), '');
});

test('auto UI renders only when available and news stays off by default', () => {
  const html = autoSettingsHtml({
    visible: true,
    policy: defaultAutoPolicy('t1'),
    takeId: 't1',
    version: 3,
    esc,
  });
  assert.match(html, /data-auto-section="1"/);
  assert.match(html, /role="switch"/);
  assert.match(html, /data-action="auto-toggle"/);
  assert.match(html, /aria-checked="false"/);
  assert.match(html, new RegExp(AUTO_SWITCH_OFF));
  assert.match(html, /data-action="auto-news-toggle"/);
  assert.match(html, /data-action="auto-news-toggle"[^>]*aria-checked="false"|aria-checked="false"[^>]*data-action="auto-news-toggle"/);
  assert.match(html, /disabled/);
  assert.ok(html.includes(AUTO_NEWS_SWITCH_LABEL));
});

test('consent is required before PUT enables Automático', () => {
  const form = autoConsentFormHtml({takeId: 't1', version: 4, esc});
  assert.match(form, /id="auto-consent-form"/);
  assert.match(form, /name="consent"/);
  assert.match(form, /required/);
  assert.ok(AUTO_CONSENT_ITEMS.length >= 4);
  assert.match(form, /2 operaciones/);
  assert.match(form, /50 %/);
  assert.match(form, /72 horas/);
  assert.match(form, /Dinero de práctica/);
  const body = autoPutBody({enabled: true, newsTrigger: false, consent: true, version: 4});
  assert.deepEqual(body, {
    enabled: true,
    newsTrigger: false,
    version: 4,
    consentVersion: AUTO_CONSENT_VERSION,
  });
  const off = autoPutBody({enabled: false, version: 4});
  assert.equal(off.consentVersion, undefined);
  assert.equal(off.enabled, false);
});

test('news option has its own consent and stays off unless confirmed', () => {
  const form = autoNewsConsentFormHtml({takeId: 't1', version: 4, esc});
  assert.match(form, /id="auto-news-consent-form"/);
  assert.match(form, /required/);
  assert.ok(AUTO_NEWS_CONSENT_ITEMS.some(t => /mitad/i.test(t)));
  const body = autoPutBody({enabled: true, newsTrigger: true, newsConsent: true, version: 4});
  assert.equal(body.newsTrigger, true);
  assert.equal(body.newsConsentVersion, AUTO_NEWS_CONSENT_VERSION);
});

test('status chip: on, paused with reason, off hidden on tesis', () => {
  assert.equal(autoChipState(null).kind, 'off');
  assert.equal(autoChipState({enabled: false}).label, AUTO_CHIP_OFF);
  assert.equal(autoChipState({enabled: true}).kind, 'on');
  assert.equal(autoChipState({enabled: true}).label, AUTO_CHIP_ON);
  const paused = autoChipState({enabled: true, pausedReason: 'tesis_rota'});
  assert.equal(paused.kind, 'paused');
  assert.equal(paused.label, AUTO_CHIP_PAUSED);
  assert.match(paused.reasonLabel, /rota/i);
  assert.match(pauseReasonLabel('error_libro'), /libro/);
  const waiting = autoChipState({enabled: true}, {quotes: {marketOpen: false}});
  assert.equal(waiting.kind, 'waiting');
  const htmlOn = autoChipHtml({enabled: true}, {marketOpen: true}, {esc});
  assert.match(htmlOn, /auto-on/);
  assert.equal(autoChipHtml({enabled: false}, {}, {esc}), '');
  assert.match(autoChipHtml({enabled: false}, {}, {esc, showOff: true}), /auto-off/);
});

test('undo preview uses current price and P&L in rioplatense', () => {
  const line = formatUndoPreviewLine({
    side: 'venta', ticker: 'YPF', units: 10, price: 1200,
  }, 1250);
  assert.match(line, /^Recomprás 10 u\. a /);
  assert.match(line, /vendiste a /);
  assert.match(line, /1\.250/);
  assert.match(line, /1\.200/);
  assert.match(line, /500/);
  assert.match(line, /[−-]/);
  const trade = {
    id: 'tr1',
    status: 'executed',
    executedAt: new Date().toISOString(),
    meta: {legs: [{side: 'venta', ticker: 'YPF', units: 10, price: 1200}]},
  };
  const take = {holdings: [{ticker: 'YPF', price: 1250, units: 4}]};
  assert.match(formatUndoPreview(trade, take, {}), /Recomprás 10 u\./);
  const item = {type: 'auto_trade', meta: {autoTradeId: 'tr1', undoable: true}};
  assert.ok(autoTradeUndoable(item, [trade]));
  const btn = autoUndoButtonHtml(item, [trade], {esc, takeId: 't1', version: 2});
  assert.match(btn, /data-action="auto-undo"/);
  assert.match(btn, new RegExp(AUTO_UNDO_LABEL.replace(/[()]/g, '\\$&')));
  const reversed = autoUndoButtonHtml(item, [{...trade, status: 'reversed'}], {esc, takeId: 't1', version: 2});
  assert.equal(reversed, '');
});

test('novedades treat auto_trade as a rule item', () => {
  const item = {type: 'auto_trade', title: 'Venta de práctica · Automático', body: 'Motivo: tope.'};
  assert.equal(isAutoTradeItem(item), true);
  assert.equal(isRuleItem(item), true);
  assert.equal(itemMatchesNewsFilter(item, NEWS_FILTER_RULES), true);
  assert.equal(isRuleItem({type: 'auto_trade_reversed'}), true);
  assert.equal(isRuleItem({type: 'news'}), false);
});

test('copy keeps ask-only defaults and conditions auto variants', () => {
  assert.match(ENTRY_LEAD, /No hay modo automático/);
  assert.match(SETTINGS_ASK_NOTE, /No hay ejecución automática/);
  assert.match(SETTINGS_ASK_NOTE_AUTO, /Automático de práctica/);
  assert.match(ENTRY_LEAD_AUTO, /libro simulado/);
  assert.ok(!SETTINGS_ASK_NOTE_AUTO.includes('aplicado automáticamente'));
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /'PUT'/);
  assert.match(app, /action === 'auto-toggle'/);
  assert.match(app, /auto-consent-form/);
  assert.match(app, /\/auto\/trades\//);
  assert.ok(!app.includes('>Automático<'));
  assert.match(app, /mode: 'ask'/);
  assert.match(readFileSync('server.mjs', 'utf8'), /'\/auto\.mjs':'auto\.mjs'/);
});
