/** AU4 · Automático (práctica) UI helpers. Simulated money only. */

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
  AUTO_SWITCH_PAUSED, AUTO_SWITCH_TRACKING_PAUSED, AUTO_PAUSED_INCONSISTENCY,
  AUTO_UNDO_ARIA, AUTO_UNDO_CANCEL, AUTO_UNDO_CONFIRM, AUTO_UNDO_HINT, AUTO_UNDO_HINT_CLOSED,
  AUTO_UNDO_LABEL, AUTO_UNDO_LEAD, AUTO_UNDO_PARTIAL,
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

export function autoEffectiveState({
  enabled = false,
  pausedReason = null,
  monitoringPaused = false,
  available = true,
} = {}) {
  if (available === false) return {kind: 'hidden', label: '', reasonLabel: ''};
  if (enabled && pausedReason) {
    return {
      kind: 'paused',
      label: pausedReason === 'error_libro' ? AUTO_PAUSED_INCONSISTENCY : AUTO_SWITCH_PAUSED,
      reasonLabel: pauseReasonLabel(pausedReason),
    };
  }
  if (enabled && monitoringPaused) {
    return {kind: 'tracking_paused', label: AUTO_SWITCH_TRACKING_PAUSED, reasonLabel: ''};
  }
  if (enabled) return {kind: 'on', label: AUTO_SWITCH_ON, reasonLabel: ''};
  return {kind: 'off', label: AUTO_SWITCH_OFF, reasonLabel: ''};
}

export function autoChipState(policy, {quotes, aiPaused, monitoringPaused} = {}) {
  if (!policy || !policy.enabled) return {kind: 'off', label: AUTO_CHIP_OFF, reasonLabel: ''};
  if (policy.pausedReason) {
    return {
      kind: 'paused',
      label: AUTO_CHIP_PAUSED,
      reasonLabel: pauseReasonLabel(policy.pausedReason),
    };
  }
  if (monitoringPaused) {
    return {
      kind: 'paused',
      label: AUTO_CHIP_PAUSED,
      reasonLabel: AUTO_SWITCH_TRACKING_PAUSED,
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

export function autoChipHtml(policy, quotes, {esc, aiPaused, showOff = false, monitoringPaused} = {}) {
  if (!policy && !showOff) return '';
  const st = autoChipState(policy || defaultAutoPolicy(), {quotes, aiPaused, monitoringPaused});
  if (st.kind === 'off' && !showOff) return '';
  const extra = st.reasonLabel
    ? `<span class="visually-hidden">. ${esc(st.reasonLabel)}</span>`
    : '';
  return `<span class="chip-s auto-chip auto-${esc(st.kind)}">${esc(st.label)}${extra}</span>`;
}

export function switchHtml({checked, disabled, action, takeId, label, hint, esc, onLabel, offLabel, paused}) {
  const on = !!checked;
  const aria = on ? 'true' : 'false';
  const state = on ? (onLabel || AUTO_SWITCH_ON) : (offLabel || AUTO_SWITCH_OFF);
  const dis = disabled ? ' disabled aria-disabled="true"' : '';
  const hintId = hint ? `auto-hint-${action}-${takeId}` : '';
  const described = hint ? ` aria-describedby="${esc(hintId)}"` : '';
  const pausedClass = paused ? ' is-paused' : '';
  return `<button type="button" class="auto-switch${pausedClass}" role="switch" aria-checked="${aria}" aria-label="${esc(label)}" data-action="${esc(action)}" data-id="${esc(takeId)}"${described}${dis}><span class="auto-switch-track" aria-hidden="true"><span class="auto-switch-thumb"></span></span><span class="auto-switch-text"><span class="auto-switch-label">${esc(label)}</span><span class="auto-switch-state">${esc(state)}</span></span></button>${hint ? `<p id="${esc(hintId)}" class="small muted auto-switch-hint">${esc(hint)}</p>` : ''}`;
}

export function lastTradeLabel(trades, takeId) {
  const last = (trades || [])
    .filter(row => row.takeId === takeId && row.kind !== 'undo' && row.status !== 'reversed')
    .sort((a, b) => Date.parse(b.executedAt || b.createdAt || 0) - Date.parse(a.executedAt || a.createdAt || 0))[0];
  if (!last) return '';
  const at = last.executedAt || last.createdAt;
  if (!at) return '';
  return new Date(at).toLocaleString('es-AR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

function autoPausedHtml({reasonLabel, esc}) {
  return reasonLabel
    ? `<p class="small muted auto-reason">${esc(reasonLabel)}</p>`
    : '';
}

export function autoSettingsHtml({
  visible, policy, takeId, version, esc, aiPaused, trades, monitoringPaused,
} = {}) {
  if (!visible) return '';
  const p = policy || defaultAutoPolicy(takeId);
  const effective = autoEffectiveState({
    enabled: !!p.enabled,
    pausedReason: p.pausedReason || null,
    monitoringPaused: !!monitoringPaused,
    available: true,
  });
  const newsDisabled = !p.enabled;
  const newsHint = !p.enabled
    ? AUTO_NEWS_SWITCH_HINT_LOCKED
    : (p.enabled && p.newsTrigger && aiPaused ? AUTO_NEWS_WAITING : AUTO_NEWS_SWITCH_HINT);
  const last = lastTradeLabel(trades, takeId);
  const status = p.enabled
    ? (last
      ? `<p class="small muted auto-last">${esc(AUTO_LAST(last))} <a class="lnk" href="#/tesis/${esc(takeId)}/news">Ver en Novedades</a></p>`
      : `<p class="small muted auto-empty">${esc(AUTO_EMPTY)}</p>`)
    : '';
  const paused = effective.kind === 'paused'
    ? autoPausedHtml({reasonLabel: effective.reasonLabel, esc})
    : '';
  return `<section class="settings-section auto-section" data-auto-section="1" data-version="${esc(version)}"><h2>${esc(AUTO_SECTION_TITLE)}</h2><p class="small muted">${esc(AUTO_SECTION_LEAD)}</p>${switchHtml({
    checked: p.enabled, disabled: false, action: 'auto-toggle', takeId, label: AUTO_SWITCH_LABEL,
    hint: AUTO_SWITCH_HINT, esc, onLabel: effective.label,
    paused: effective.kind === 'paused' || effective.kind === 'tracking_paused',
  })}${switchHtml({
    checked: !!p.newsTrigger, disabled: newsDisabled, action: 'auto-news-toggle', takeId,
    label: AUTO_NEWS_SWITCH_LABEL, hint: newsHint, esc,
  })}${paused}${status}</section>`;
}

function consentListHtml(items, esc, listId) {
  return `<ul class="auto-consent-list" id="${esc(listId)}">${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

export function autoConsentFormHtml({takeId, version, esc, next}) {
  const nextAttr = next ? ` data-next="${esc(next)}"` : '';
  return `<p class="modal-copy">${esc(AUTO_CONSENT_INTRO)}</p>${consentListHtml(AUTO_CONSENT_ITEMS, esc, 'auto-consent-list')}<form id="auto-consent-form" data-id="${esc(takeId)}" data-version="${esc(version)}"${nextAttr}><label class="check-label"><input type="checkbox" name="consent" value="1" required aria-describedby="auto-consent-list"> ${esc(AUTO_CONSENT_CHECK)}</label><div class="form-actions"><button class="btn ghost" type="button" data-action="close">${esc(AUTO_CONSENT_CANCEL)}</button><button class="btn primary" type="submit" disabled>${esc(AUTO_CONSENT_CONFIRM)}</button></div></form>`;
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

function originalLegs(trade) {
  const legs = trade?.meta?.legs || trade?.legs || [];
  return Array.isArray(legs) ? legs : [];
}

export function acceptedConsentVersion(policy) {
  const version = policy?.consentVersion;
  return typeof version === 'string' && version.trim() ? version.trim() : '';
}

function consentFlag(flag, constant) {
  if (flag === true) return constant;
  if (typeof flag === 'string' && flag.trim()) return flag.trim();
  return '';
}

export function autoPutBody({enabled, newsTrigger, consent, newsConsent, version}) {
  const body = {enabled: !!enabled, version: Number(version)};
  if (newsTrigger !== undefined) body.newsTrigger = !!newsTrigger;
  const consentVersion = consentFlag(consent, AUTO_CONSENT_VERSION);
  if (consentVersion) body.consentVersion = consentVersion;
  const newsConsentVersion = consentFlag(newsConsent, AUTO_NEWS_CONSENT_VERSION);
  if (newsConsentVersion) body.newsConsentVersion = newsConsentVersion;
  return body;
}
