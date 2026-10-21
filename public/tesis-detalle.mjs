/** TD2/TD3 · Cabecera, paneles y estados del detalle (frontend only). */

import {holdingDerived, formatThemePct} from './portfolio.mjs';
import {pct1, pctInt, artShortDayMonth} from './format.mjs';
import {tickerMarkHtml} from './ticker-logo.mjs';
import {takeHref} from './take-route.mjs';
import {artClock, artDayKey} from './timeline.mjs';
import {
  TD_CHIP_IN, TD_CHIP_DRIFT, TD_CHIP_OVER,
  TD_HOW_CADENCE, TD_HOW_AUTO_ON, TD_HOW_AUTO_OFF, TD_HOW_AUTO_PAUSED,
  TD_HOW_AUTO_TRACKING_PAUSED, TD_HOW_NEWS_ON, TD_HOW_NEWS_OFF,
  TD_IDEA_HOW, TD_RULES_LINK, TD_PCT_OF_TOTAL, TD_OBJ_LABEL,
  POS_BUCKET_CASH,
  TD_LOADING, TD_LOAD_ERROR_TITLE, TD_LOAD_ERROR_BODY, TD_RETRY, TD_GO_TAKES,
  TD_NOT_FOUND_TITLE, TD_NOT_FOUND_BODY,
  TD_NEW_NEXT, TD_NEW_NEXT_ON,
  TD_ARCHIVED_BANNER,
  TD_CMP_GROUP, TD_CMP_CAPITAL, TD_CMP_INDEX,
  TD_SINCE_START, TD_INDEX_PENDING,
  TAKE_HEADER_EYEBROW, TAKE_ASK_CTA,
} from './copy.mjs';
import {autoEffectiveState} from './auto.mjs';

export function positionChipKind(ruleChip) {
  if (ruleChip === 'ok') return {label: TD_CHIP_IN, cls: 'track'};
  if (ruleChip === 'cap') return {label: TD_CHIP_OVER, cls: 'review'};
  if (ruleChip === 'drift') return {label: TD_CHIP_DRIFT, cls: 'watch'};
  return {label: '—', cls: 'muted'};
}

export function positionChipHtml(ruleChip) {
  const {label, cls} = positionChipKind(ruleChip);
  return `<span class="pos-chip ${cls}">${label}</span>`;
}

export function ideaHowLines(t, {
  autoVisible = false, autoOn = false, newsOn = false, pausedReason = null, monitoringPaused = false,
} = {}) {
  const cadence = t?.settings?.cadence || 'standard';
  const drift = t?.settings?.drift ?? 5;
  const lines = [TD_HOW_CADENCE(cadence)];
  if (autoVisible) {
    const effective = autoEffectiveState({
      enabled: autoOn, pausedReason, monitoringPaused,
    });
    let autoLine = TD_HOW_AUTO_OFF;
    if (effective.kind === 'paused') {
      autoLine = TD_HOW_AUTO_PAUSED;
    } else if (effective.kind === 'tracking_paused') {
      autoLine = TD_HOW_AUTO_TRACKING_PAUSED;
    } else if (effective.kind === 'on') {
      autoLine = TD_HOW_AUTO_ON(drift);
    }
    lines.push(autoLine);
    lines.push(newsOn ? TD_HOW_NEWS_ON : TD_HOW_NEWS_OFF);
  }
  return lines;
}

export function ideaHowHtml(t, opts = {}) {
  const lines = ideaHowLines(t, opts);
  const esc = opts.esc || (s => String(s ?? ''));
  return `<section class="idea-how"><h3>${esc(TD_IDEA_HOW)}</h3><ul class="idea-how-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul></section>`;
}

export function reglasHref(id) {
  return `${takeHref(id, 'ajustes')}#reglas`;
}

export function holdingRowHtml(t, h, {esc} = {}) {
  const safe = esc || (s => String(s ?? ''));
  const d = t?.invested ? holdingDerived(t, h) : null;
  const actual = d ? pct1(d.actual) : '—';
  const chip = d ? positionChipHtml(d.ruleChip) : '';
  const reason = h.reason ? `<p class="hold-reason">${safe(h.reason)}</p>` : '';
  return `<div class="hold-row" data-ticker="${safe(h.ticker)}">${tickerMarkHtml(h.ticker, h.name)}<div class="hold-main"><div class="hold-id"><b>${safe(h.ticker)}</b> <span class="muted small">${safe(h.name || h.ticker)}</span></div>${chip}</div><div class="hold-w num">${actual}<div class="small muted">${safe(TD_OBJ_LABEL)} ${pctInt(h.weight)}</div></div>${reason}</div>`;
}

export function bucketHoldingsHtml(t, bucket, {esc, cashMeta} = {}) {
  const safe = esc || (s => String(s ?? ''));
  const isCash = bucket.kind === 'cash' || bucket.name === POS_BUCKET_CASH;
  const pctBit = isCash && cashMeta
    ? `${formatThemePct(bucket.pct)} · ${cashMeta}`
    : `${formatThemePct(bucket.pct)} ${TD_PCT_OF_TOTAL}`;
  const rows = isCash
    ? ''
    : (bucket.holdings || []).map(h => holdingRowHtml(t, h, {esc: safe})).join('');
  return `<div class="bucket${isCash ? ' bucket-cash' : ''}"><div class="bucket-h"><span class="bucket-h-name"><span class="bucket-dot" style="background:${bucket.colorVar}"></span>${safe(bucket.name)}</span><span class="num">${pctBit}</span></div>${rows}</div>`;
}

export function positionsRulesLinkHtml(t, {esc} = {}) {
  const safe = esc || (s => String(s ?? ''));
  return `<a class="lnk touch-44" href="${reglasHref(t.id)}">${safe(TD_RULES_LINK)}</a>`;
}

const identityEsc = s => String(s ?? '');

export function isNewTake(t) {
  return t?.phase === 'active' && (t.history?.length || 0) < 2;
}

export function indexShortLabel(id, fallbackLabel = '') {
  if (id === 'MERV') return 'Merval';
  if (id === 'SPY_AR') return 'CEDEAR SPY';
  const label = String(fallbackLabel || '');
  if (/merv/i.test(label)) return 'Merval';
  if (/spy/i.test(label)) return 'CEDEAR SPY';
  return label || 'el índice';
}

export function newNextLabel(iso, now = new Date()) {
  if (!iso) return '';
  const clock = artClock(iso);
  const today = artDayKey(iso) === artDayKey(now.toISOString());
  if (today) return TD_NEW_NEXT(clock);
  return TD_NEW_NEXT_ON(artShortDayMonth(iso), clock);
}

export function indexPointCount(hist = []) {
  return (hist || []).filter(h => h.index != null || h.indexRecorded).length;
}

export function takeLoadingHtml({esc} = {}) {
  const safe = esc || identityEsc;
  return `<div class="take-state-loading"><span class="visually-hidden" role="status">${safe(TD_LOADING)}</span><div class="take-loading" aria-busy="true"><div class="sk sk-eye"></div><div class="sk sk-title"></div><div class="sk sk-line"></div><div class="sk sk-hero"></div><div class="sk sk-pill"></div><div class="sk sk-chart"></div><div class="sk-chips" aria-hidden="true"><div class="sk sk-chip"></div><div class="sk sk-chip"></div><div class="sk sk-chip"></div></div></div></div>`;
}

export function takeLoadErrorHtml({esc} = {}) {
  const safe = esc || identityEsc;
  return `<div class="take-state take-load-error"><span class="eyebrow lab">${safe(TAKE_HEADER_EYEBROW)}</span><div class="callout take-callout" role="alert"><h1 tabindex="-1">${safe(TD_LOAD_ERROR_TITLE)}</h1><p>${safe(TD_LOAD_ERROR_BODY)}</p><div class="take-state-actions"><button type="button" class="btn primary" data-action="retry-state">${safe(TD_RETRY)}</button><a class="btn" href="#/takes">${safe(TD_GO_TAKES)}</a></div></div></div>`;
}

export function takeNotFoundHtml({esc} = {}) {
  const safe = esc || identityEsc;
  return `<div class="take-state take-not-found"><h1 tabindex="-1">${safe(TD_NOT_FOUND_TITLE)}</h1><p>${safe(TD_NOT_FOUND_BODY)}</p><p class="take-state-actions"><a class="btn" href="#/takes">${safe(TD_GO_TAKES)}</a></p></div>`;
}

export function archivedBannerHtml({esc} = {}) {
  const safe = esc || identityEsc;
  return `<div class="callout take-callout take-archived-banner">${safe(TD_ARCHIVED_BANNER)}</div>`;
}

export function compareGroupHtml({short, disabled = true, takeId = '', esc} = {}) {
  const safe = esc || identityEsc;
  const dis = disabled ? ' aria-disabled="true"' : '';
  const idAttr = takeId ? ` data-id="${safe(takeId)}"` : '';
  return `<div class="chart-cmp" role="group" aria-label="${safe(TD_CMP_GROUP)}"><button type="button" aria-pressed="true">${safe(TD_CMP_CAPITAL)}</button><button type="button" aria-pressed="false"${dis} data-action="compare-index"${idAttr}>${safe(TD_CMP_INDEX(short))}</button></div>`;
}

export function takeNewStatsHtml({pct, pending, detail, esc} = {}) {
  const safe = esc || identityEsc;
  const detailBit = detail ? `<div class="small muted">${safe(detail)}</div>` : '';
  return `<div class="take-chart-stats num"><div><div class="lab">${safe(TD_SINCE_START)}</div><div class="stat-big muted">${safe(pct)}</div></div><span class="chip-soft">${safe(pending)}</span>${detailBit}</div>`;
}

export function takeAskDockHtml({
  id, placeholder, cta = TAKE_ASK_CTA, buttonClass = 'btn primary', disabled = false, esc,
} = {}) {
  const safe = esc || identityEsc;
  const dis = disabled ? ' disabled' : '';
  return `<div class="chat-dock chat-dock-take"><form id="take-ask" data-id="${safe(id)}" class="dock-inner"><input name="message" maxlength="4000" placeholder="${safe(placeholder)}" aria-label="${safe(placeholder)}"${dis}><button class="${buttonClass}" type="submit"${dis}>${safe(cta)}</button></form></div>`;
}
