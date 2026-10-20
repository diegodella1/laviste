/** TD2 · Cabecera helpers and Posiciones / La idea panel HTML (frontend only). */

import {holdingDerived, formatThemePct} from './portfolio.mjs';
import {pct1, pctInt} from './format.mjs';
import {tickerMarkHtml} from './ticker-logo.mjs';
import {takeHref} from './take-route.mjs';
import {
  TD_CHIP_IN, TD_CHIP_DRIFT, TD_CHIP_OVER,
  TD_HOW_CADENCE, TD_HOW_AUTO_ON, TD_HOW_AUTO_OFF, TD_HOW_NEWS_ON, TD_HOW_NEWS_OFF,
  TD_IDEA_HOW, TD_RULES_LINK, TD_PCT_OF_TOTAL, TD_OBJ_LABEL,
  POS_BUCKET_CASH,
} from './copy.mjs';

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

export function ideaHowLines(t, {autoVisible = false, autoOn = false, newsOn = false} = {}) {
  const cadence = t?.settings?.cadence || 'standard';
  const drift = t?.settings?.drift ?? 5;
  const lines = [TD_HOW_CADENCE(cadence)];
  if (autoVisible) {
    lines.push(autoOn ? TD_HOW_AUTO_ON(drift) : TD_HOW_AUTO_OFF);
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
