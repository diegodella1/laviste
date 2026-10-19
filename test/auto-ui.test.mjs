import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  isRuleItem, isAutoTradeItem, itemMatchesNewsFilter, NEWS_FILTER_RULES,
} from '../public/novedades.mjs';
import {REASONS} from '../lib/auto/reasons.mjs';
import {
  AUTO_CONSENT_VERSION, AUTO_NEWS_CONSENT_VERSION, AUTO_CONSENT_ITEMS,
  AUTO_NEWS_CONSENT_ITEMS, AUTO_CHIP_ON, AUTO_CHIP_PAUSED, AUTO_CHIP_OFF,
  AUTO_UNDO_LABEL, AUTO_UNDO_HINT, AUTO_UNDO_HINT_CLOSED, AUTO_UNDO_PARTIAL,
  AUTO_UNDO_ERRORS, AUTO_UNDO_ERROR_DEFAULT, AUTO_SWITCH_HINT,
  AUTO_NEWS_SWITCH_HINT_LOCKED, AUTO_EMPTY, AUTO_EVENT_REVERSED_TITLE,
  SETTINGS_ASK_NOTE, SETTINGS_ASK_NOTE_AUTO, ENTRY_LEAD, ENTRY_LEAD_AUTO,
  AUTO_SWITCH_OFF, AUTO_NEWS_SWITCH_LABEL, friendlyApiError, autoUndoErrorCopy,
} from '../public/copy.mjs';
import {
  autoUiVisible, autoChipState, autoChipHtml, autoSettingsHtml, autoConsentFormHtml,
  autoNewsConsentFormHtml, autoUndoButtonHtml, autoUndoModalHtml,
  formatUndoPreview, formatUndoPreviewLine, autoPutBody, autoTradeUndoable,
  defaultAutoPolicy, pauseReasonLabel,
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
  assert.match(html, new RegExp(AUTO_SWITCH_HINT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /data-action="auto-news-toggle"/);
  assert.match(html, /data-action="auto-news-toggle"[^>]*aria-checked="false"|aria-checked="false"[^>]*data-action="auto-news-toggle"/);
  assert.match(html, /disabled/);
  assert.ok(html.includes(AUTO_NEWS_SWITCH_LABEL));
  assert.ok(html.includes(AUTO_NEWS_SWITCH_HINT_LOCKED));
});

test('enabled switch shows empty state until there is a trade', () => {
  const empty = autoSettingsHtml({
    visible: true,
    policy: {enabled: true, newsTrigger: false},
    takeId: 't1',
    version: 3,
    esc,
    trades: [],
  });
  assert.ok(empty.includes(AUTO_EMPTY));
  const withTrade = autoSettingsHtml({
    visible: true,
    policy: {enabled: true, newsTrigger: false},
    takeId: 't1',
    version: 3,
    esc,
    trades: [{id: 'tr1', takeId: 't1', kind: 'cap', executedAt: '2026-10-19T15:00:00.000Z'}],
  });
  assert.match(withTrade, /Última operación/);
  assert.match(withTrade, /#\/take\/t1\/news/);
});

test('consent is required before PUT enables Automático', () => {
  const form = autoConsentFormHtml({takeId: 't1', version: 4, esc});
  assert.match(form, /id="auto-consent-form"/);
  assert.match(form, /name="consent"/);
  assert.match(form, /required/);
  assert.match(form, /id="auto-consent-list"/);
  assert.match(form, /aria-describedby="auto-consent-list"/);
  assert.match(form, /type="submit" disabled/);
  assert.ok(AUTO_CONSENT_ITEMS.length >= 4);
  assert.match(form, /2 operaciones/);
  assert.match(form, /50 %/);
  assert.match(form, /72 horas/);
  assert.match(form, /dinero de práctica/i);
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
  assert.match(form, /type="submit" disabled/);
  assert.match(form, /mitad/i);
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
  assert.match(waiting.reasonLabel, /cerrado/i);
  const htmlOn = autoChipHtml({enabled: true}, {marketOpen: true}, {esc});
  assert.match(htmlOn, /auto-on/);
  assert.match(htmlOn, /aria-label="/);
  assert.ok(!htmlOn.includes('title='));
  assert.equal(autoChipHtml({enabled: false}, {}, {esc}), '');
  assert.match(autoChipHtml({enabled: false}, {}, {esc, showOff: true}), /auto-off/);
});

test('undo button is secondary, described, and disabled when the market is closed', () => {
  const trade = {
    id: 'tr1',
    status: 'executed',
    executedAt: new Date().toISOString(),
    meta: {legs: [{side: 'venta', ticker: 'YPF', units: 10, price: 1200}]},
  };
  const item = {type: 'auto_trade', meta: {autoTradeId: 'tr1', undoable: true}};
  assert.equal(autoTradeUndoable(item, []), null);
  assert.ok(autoTradeUndoable(item, [trade]));
  const btn = autoUndoButtonHtml(item, [trade], {esc, takeId: 't1', version: 2, quotes: {marketOpen: true}});
  assert.match(btn, /data-action="auto-undo"/);
  assert.match(btn, new RegExp(`>${AUTO_UNDO_LABEL}<`));
  assert.ok(!btn.includes('ghost'));
  assert.ok(!btn.includes('primary'));
  assert.match(btn, /aria-describedby="/);
  assert.match(btn, /aria-label="Deshacer venta de 10 u\. de YPF al precio actual"/);
  assert.match(btn, /Al precio actual, no al original/);
  const closed = autoUndoButtonHtml(item, [trade], {
    esc, takeId: 't1', version: 2, quotes: {marketOpen: false},
  });
  assert.match(closed, /aria-disabled="true"/);
  assert.ok(closed.includes(AUTO_UNDO_HINT_CLOSED));
  const reversed = autoUndoButtonHtml(item, [{...trade, status: 'reversed'}], {esc, takeId: 't1', version: 2});
  assert.equal(reversed, '');
});

test('undo modal uses the server line and shows the partial notice', () => {
  const html = autoUndoModalHtml({
    line: 'Recomprás 6 u. a $ 16.000 (vendiste a $ 1.200): −$ 88.800',
    partial: true,
    takeId: 't1',
    tradeId: 'tr1',
    version: 2,
    fingerprint: 'abc123',
    esc,
  });
  assert.match(html, /Recomprás 6 u\./);
  assert.ok(html.includes(AUTO_UNDO_PARTIAL));
  assert.match(html, /data-fingerprint="abc123"/);
});

test('undo preview helper (fallback) uses current price and P&L in rioplatense', () => {
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
});

test('no raw AUTO reason codes reach the UI', () => {
  assert.equal(
    friendlyApiError({code: 'mercado_cerrado', message: 'mercado_cerrado'}),
    AUTO_UNDO_ERRORS.mercado_cerrado,
  );
  assert.equal(autoUndoErrorCopy('mercado_cerrado'), AUTO_UNDO_ERRORS.mercado_cerrado);
  assert.equal(autoUndoErrorCopy('limite_tesis'), AUTO_UNDO_ERROR_DEFAULT);
  for (const superadmin of [false, true]) {
    for (const code of Object.values(REASONS)) {
      const mapped = friendlyApiError({code, message: code}, {superadmin});
      assert.notEqual(mapped, code, `raw ${code} leaked (superadmin=${superadmin})`);
      assert.ok(!mapped.includes(code), `raw ${code} in «${mapped}»`);
    }
  }
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
  assert.match(ENTRY_LEAD_AUTO, /Automático de práctica/);
  assert.ok(!SETTINGS_ASK_NOTE_AUTO.includes('aplicado automáticamente'));
  assert.equal(AUTO_EVENT_REVERSED_TITLE, 'Operación deshecha · Automático');
  assert.ok(AUTO_UNDO_HINT('22 oct, 19:23').includes('22 oct, 19:23'));
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /'PUT'/);
  assert.match(app, /action === 'auto-toggle'/);
  assert.match(app, /auto-consent-form/);
  assert.match(app, /\/auto\/trades\//);
  assert.match(app, /undo\/preview/);
  assert.match(app, /initialFocus/);
  assert.ok(!app.includes('>Automático<'));
  assert.match(app, /mode: 'ask'/);
  assert.match(readFileSync('server.mjs', 'utf8'), /'\/auto\.mjs':'auto\.mjs'/);
  assert.match(readFileSync('server.mjs', 'utf8'), /autoUndoPreview/);
  assert.match(readFileSync('lib/auto/runner.mjs', 'utf8'), /assert\(fingerprint/);
});
