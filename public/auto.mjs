/** AU4 · Automático (práctica) UI helpers. Simulated money only. */

import {money, signedMoney} from './format.mjs';
import {
  AUTO_CHIP_NEWS_PAUSED, AUTO_CHIP_OFF, AUTO_CHIP_ON, AUTO_CHIP_PAUSED, AUTO_CHIP_WAITING,
  AUTO_CONSENT_CANCEL, AUTO_CONSENT_CHECK, AUTO_CONSENT_CONFIRM, AUTO_CONSENT_INTRO,
  AUTO_CONSENT_ITEMS, AUTO_CONSENT_TITLE, AUTO_CONSENT_VERSION,
  AUTO_EMPTY, AUTO_LAST,
  AUTO_NEWS_CONSENT_CANCEL, AUTO_NEWS_CONSENT_CHECK, AUTO_NEWS_CONSENT_CONFIRM,
  AUTO_NEWS_CONSENT_INTRO, AUTO_NEWS_CONSENT_ITEMS, AUTO_NEWS_CONSENT_TITLE,
  AUTO_NEWS_CONSENT_VERSION, AUTO_NEWS_SWITCH_HINT, AUTO_NEWS_SWITCH_HINT_LOCKED,
  AUTO_NEWS_SWITCH_LABEL, AUTO_NEWS_WAITING, AUTO_PAUSE_REASONS, AUTO_SECTION_LEAD,
  AUTO_SECTION_TITLE, AUTO_SWITCH_HINT, AUTO_SWITCH_LABEL, AUTO_SWITCH_OFF, AUTO_SWITCH_ON,
  AUTO_UNDO_ARIA, AUTO_UNDO_CANCEL, AUTO_UNDO_CONFIRM, AUTO_UNDO_HINT, AUTO_UNDO_HINT_CLOSED,
  AUTO_UNDO_LABEL, AUTO_UNDO_LEAD, AUTO_UNDO_PARTIAL, AUTO_UNDO_PREVIEW_FALLBACK,
  AUTO_WAITING_REASONS, PRACTICE_ORDER_NOTE,
} from './copy.mjs';

export const AUTO_UNDO_WINDOW_MS = 72 * 60 * 60 * 1000;

export function autoUiVisible(autoState) {
  return autoState?.available === true;
}

export function autoPolicyFor(autoState, takeId) {
  if (!autoUiVisible(autoState) || !takeId) return null;
  return autoState.policies?.[takeId] || null;
}

export function defaultAutoPolicy(takeId) {
  return {
    takeId: takeId || null,
    enabled: false,
    newsTrigger: false,
    pausedReason: null,
    consentVersion: null,
    newsConsentVersion: null,
  };
}

export function pauseReasonLabel(reason) {
  if (!reason) return '';
  return AUTO_PAUSE_REASONS[reason] || reason.replaceAll('_', ' ');
}

export function autoChipState(policy, {quotes, aiPaused} = {}) {
  if (!policy || !policy.enabled) return {kind: 'off', label: AUTO_CHIP_OFF, reasonLabel: ''};
  if (policy.pausedReason) {
    return {
      kind: 'paused',
      label: AUTO_CHIP_PAUSED,
      reasonLabel: pauseReasonLabel(policy.pausedReason),
    };
  }
  if (quotes && quotes.marketOpen === false) {
    return {
      kind: 'waiting',
      label: AUTO_CHIP_WAITING,
      reasonLabel: AUTO_WAITING_REASONS.mercado_cerrado,
    };
  }
  if (quotes && quotes.stale) {
    return {
      kind: 'waiting',
      label: AUTO_CHIP_WAITING,
      reasonLabel: AUTO_WAITING_REASONS.cotizacion_vieja,
    };
  }
  const newsPaused = !!(policy.newsTrigger && aiPaused);
  return {
    kind: 'on',
    label: newsPaused ? `${AUTO_CHIP_ON} · ${AUTO_CHIP_NEWS_PAUSED}` : AUTO_CHIP_ON,
    reasonLabel: newsPaused ? AUTO_NEWS_WAITING : '',
  };
}

export function autoChipHtml(policy, quotes, {esc, aiPaused, showOff = false} = {}) {
  if (!policy && !showOff) return '';
  const st = autoChipState(policy || defaultAutoPolicy(), {quotes, aiPaused});
  if (st.kind === 'off' && !showOff) return '';
  const aria = st.reasonLabel ? `${st.label}. ${st.reasonLabel}` : st.label;
  return `<span class="chip-s auto-chip auto-${esc(st.kind)}" aria-label="${esc(aria)}">${esc(st.label)}</span>`;
}

export function switchHtml({checked, disabled, action, takeId, label, hint, esc}) {
  const on = !!checked;
  const aria = on ? 'true' : 'false';
  const state = on ? AUTO_SWITCH_ON : AUTO_SWITCH_OFF;
  const dis = disabled ? ' disabled aria-disabled="true"' : '';
  const hintId = hint ? `auto-hint-${action}-${takeId}` : '';
  const described = hint ? ` aria-describedby="${esc(hintId)}"` : '';
  return `<button type="button" class="auto-switch" role="switch" aria-checked="${aria}" aria-label="${esc(label)}" data-action="${esc(action)}" data-id="${esc(takeId)}"${described}${dis}><span class="auto-switch-track" aria-hidden="true"><span class="auto-switch-thumb"></span></span><span class="auto-switch-text"><span class="auto-switch-label">${esc(label)}</span><span class="auto-switch-state">${esc(state)}</span></span></button>${hint ? `<p id="${esc(hintId)}" class="small muted auto-switch-hint">${esc(hint)}</p>` : ''}`;
}

function lastTradeLabel(trades, takeId) {
  const last = (trades || [])
    .filter(row => row.takeId === takeId && row.kind !== 'undo')
    .sort((a, b) => Date.parse(b.executedAt || b.createdAt || 0) - Date.parse(a.executedAt || a.createdAt || 0))[0];
  if (!last) return '';
  const at = last.executedAt || last.createdAt;
  if (!at) return '';
  return new Date(at).toLocaleString('es-AR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

export function autoSettingsHtml({visible, policy, takeId, version, esc, aiPaused, trades} = {}) {
  if (!visible) return '';
  const p = policy || defaultAutoPolicy(takeId);
  const newsDisabled = !p.enabled;
  const newsHint = !p.enabled
    ? AUTO_NEWS_SWITCH_HINT_LOCKED
    : (p.enabled && p.newsTrigger && aiPaused ? AUTO_NEWS_WAITING : AUTO_NEWS_SWITCH_HINT);
  const last = lastTradeLabel(trades, takeId);
  const status = p.enabled
    ? (last
      ? `<p class="small muted auto-last">${esc(AUTO_LAST(last))} <a class="lnk" href="#/take/${esc(takeId)}/news">Ver en Novedades</a></p>`
      : `<p class="small muted auto-empty">${esc(AUTO_EMPTY)}</p>`)
    : '';
  return `<section class="settings-section auto-section" data-auto-section="1" data-version="${esc(version)}"><h2>${esc(AUTO_SECTION_TITLE)}</h2><p class="small muted">${esc(AUTO_SECTION_LEAD)}</p>${switchHtml({
    checked: p.enabled, disabled: false, action: 'auto-toggle', takeId, label: AUTO_SWITCH_LABEL,
    hint: AUTO_SWITCH_HINT, esc,
  })}${switchHtml({
    checked: !!p.newsTrigger, disabled: newsDisabled, action: 'auto-news-toggle', takeId,
    label: AUTO_NEWS_SWITCH_LABEL, hint: newsHint, esc,
  })}${status}</section>`;
}

function consentListHtml(items, esc, listId) {
  return `<ul class="auto-consent-list" id="${esc(listId)}">${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

export function autoConsentFormHtml({takeId, version, esc}) {
  return `<p class="modal-copy">${esc(AUTO_CONSENT_INTRO)}</p>${consentListHtml(AUTO_CONSENT_ITEMS, esc, 'auto-consent-list')}<form id="auto-consent-form" data-id="${esc(takeId)}" data-version="${esc(version)}"><label class="check-label"><input type="checkbox" name="consent" value="1" required aria-describedby="auto-consent-list"> ${esc(AUTO_CONSENT_CHECK)}</label><div class="form-actions"><button class="btn ghost" type="button" data-action="close">${esc(AUTO_CONSENT_CANCEL)}</button><button class="btn primary" type="submit" disabled>${esc(AUTO_CONSENT_CONFIRM)}</button></div></form>`;
}

export function autoNewsConsentFormHtml({takeId, version, esc}) {
  return `<p class="modal-copy">${esc(AUTO_NEWS_CONSENT_INTRO)}</p>${consentListHtml(AUTO_NEWS_CONSENT_ITEMS, esc, 'auto-news-consent-list')}<form id="auto-news-consent-form" data-id="${esc(takeId)}" data-version="${esc(version)}"><label class="check-label"><input type="checkbox" name="consent" value="1" required aria-describedby="auto-news-consent-list"> ${esc(AUTO_NEWS_CONSENT_CHECK)}</label><div class="form-actions"><button class="btn ghost" type="button" data-action="close">${esc(AUTO_NEWS_CONSENT_CANCEL)}</button><button class="btn primary" type="submit" disabled>${esc(AUTO_NEWS_CONSENT_CONFIRM)}</button></div></form>`;
}

export {AUTO_CONSENT_TITLE, AUTO_NEWS_CONSENT_TITLE, AUTO_CONSENT_VERSION, AUTO_NEWS_CONSENT_VERSION};

export function autoTradeIdOf(item) {
  return item?.meta?.autoTradeId || item?.meta?.auto_trade_id || '';
}

export function findAutoTrade(trades, tradeId) {
  return (trades || []).find(t => t.id === tradeId) || null;
}

export function autoTradeUndoable(item, trades, now = Date.now()) {
  if (item?.type !== 'auto_trade') return null;
  const id = autoTradeIdOf(item);
  if (!id) return null;
  if (item.meta?.undoable === false) return null;
  const trade = findAutoTrade(trades, id);
  if (!trade) return null;
  if (trade.undoTradeId || trade.status === 'reversed' || trade.status === 'partially_reversed') return null;
  const at = Date.parse(trade.executedAt || trade.createdAt || '');
  if (Number.isFinite(at) && now - at > AUTO_UNDO_WINDOW_MS) return null;
  return {id, trade};
}

export function formatUndoUntil(executedAt) {
  const at = Date.parse(executedAt || '');
  if (!Number.isFinite(at)) return '';
  return new Date(at + AUTO_UNDO_WINDOW_MS).toLocaleString('es-AR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

function undoAriaLine(trade) {
  const legs = originalLegs(trade);
  if (!legs.length) return 'esta operación';
  const leg = legs[0];
  const side = leg.side === 'compra' ? 'compra' : 'venta';
  return `${side} de ${Math.max(0, Math.floor(leg.units || 0))} u. de ${leg.ticker}`;
}

export function autoUndoButtonHtml(item, trades, {esc, takeId, version, now, quotes} = {}) {
  const row = autoTradeUndoable(item, trades, now);
  if (!row) return '';
  const closed = quotes && quotes.marketOpen === false;
  const until = formatUndoUntil(row.trade.executedAt || row.trade.createdAt);
  const hint = closed ? AUTO_UNDO_HINT_CLOSED : AUTO_UNDO_HINT(until);
  const hintId = `auto-undo-hint-${esc(row.id)}`;
  const aria = AUTO_UNDO_ARIA(undoAriaLine(row.trade));
  const disabled = closed ? ' aria-disabled="true"' : '';
  return `<div class="auto-undo-row"><button type="button" class="btn auto-undo-btn" data-action="auto-undo" data-id="${esc(takeId)}" data-trade="${esc(row.id)}" data-version="${esc(version)}" aria-label="${esc(aria)}" aria-describedby="${hintId}"${disabled}>${esc(AUTO_UNDO_LABEL)}</button><p id="${hintId}" class="auto-undo-hint">${esc(hint)}</p></div>`;
}

export function autoUndoModalHtml({line, partial, takeId, tradeId, version, fingerprint, esc}) {
  const notice = partial ? `<p class="small auto-undo-partial">${esc(AUTO_UNDO_PARTIAL)}</p>` : '';
  return `<p class="modal-copy">${esc(AUTO_UNDO_LEAD)}</p><p class="auto-undo-preview">${esc(line)}</p>${notice}<p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><div class="form-actions"><button class="btn ghost" type="button" data-action="close">${esc(AUTO_UNDO_CANCEL)}</button><button class="btn primary" type="button" data-action="auto-undo-confirm" data-id="${esc(takeId)}" data-trade="${esc(tradeId)}" data-version="${esc(version)}" data-fingerprint="${esc(fingerprint)}">${esc(AUTO_UNDO_CONFIRM)}</button></div>`;
}

function oppositeSide(side) {
  return side === 'venta' ? 'compra' : 'venta';
}

function originalLegs(trade) {
  const legs = trade?.meta?.legs || trade?.legs || [];
  return Array.isArray(legs) ? legs : [];
}

export function currentPriceFor(ticker, take, quotes) {
  const live = (quotes?.quotes || []).find(q => q.ticker === ticker);
  if (live?.price > 0) return live.price;
  const holding = (take?.holdings || []).find(h => h.ticker === ticker);
  return holding?.price > 0 ? holding.price : 0;
}

export function formatUndoPreviewLine(leg, currentPrice) {
  const originalSide = leg.originalSide || leg.side;
  const side = leg.side === 'compra' || leg.side === 'venta'
    ? (leg.originalSide ? leg.side : oppositeSide(originalSide))
    : oppositeSide(originalSide);
  const verb = side === 'compra' ? 'Recomprás' : 'Vendés';
  const orig = originalSide === 'venta' ? 'vendiste' : 'compraste';
  const units = Math.max(0, Math.floor(leg.units || 0));
  const originalPrice = Number(leg.originalPrice ?? leg.price);
  const price = Number(currentPrice || 0);
  const pnl = originalSide === 'venta'
    ? (originalPrice - price) * units
    : (price - originalPrice) * units;
  return `${verb} ${units} u. a ${money(price)} (${orig} a ${money(originalPrice)}): ${signedMoney(pnl)}`;
}

export function formatUndoPreview(trade, take, quotes) {
  const legs = originalLegs(trade);
  if (!legs.length) return AUTO_UNDO_PREVIEW_FALLBACK;
  return legs.map(leg => {
    const ticker = leg.ticker;
    const current = currentPriceFor(ticker, take, quotes);
    return formatUndoPreviewLine(leg, current);
  }).join(' · ');
}

export function autoPutBody({enabled, newsTrigger, consent, newsConsent, version}) {
  const body = {enabled: !!enabled, version: Number(version)};
  if (newsTrigger !== undefined) body.newsTrigger = !!newsTrigger;
  if (consent) body.consentVersion = AUTO_CONSENT_VERSION;
  if (newsConsent) body.newsConsentVersion = AUTO_NEWS_CONSENT_VERSION;
  return body;
}
