/** Novedades grouping, collapse and suggested-action dedupe (P0-10..12). */

import {artClock, artDayKey} from './timeline.mjs';

export const NOVEDADES_MAX_DAYS = 7;
export const NOVEDADES_PAGE_SIZE = 20;

const ART = 'America/Argentina/Buenos_Aires';

export function normalizeActionText(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Hide «Acción sugerida» when it repeats the body, or when the live estado is sin acción. */
export function shouldHideSuggestedAction(verdictText, body, {pageNoAction = false} = {}) {
  if (pageNoAction) return true;
  const raw = normalizeActionText(verdictText);
  const b = normalizeActionText(body);
  if (!raw) return true;
  const core = raw.replace(/^acción sugerida:\s*/, '');
  if (!core) return true;
  if (!b) return false;
  return core === b || b.includes(core) || core.includes(b);
}

export function isUnchangedChequeo(item) {
  return item?.type === 'chequeo' && item.verdict !== 'action';
}

export function formatDayHeading(iso, now = new Date()) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-AR', {timeZone: ART, day: 'numeric'});
  const month = d.toLocaleDateString('es-AR', {timeZone: ART, month: 'short'}).replace('.', '');
  const label = `${day} ${month}`.toUpperCase();
  if (artDayKey(iso) === artDayKey(now.toISOString())) return `Hoy · ${label}`;
  return label;
}

export function emptyNovedadesCopy(t) {
  if (t?.settings?.cadence === 'manual' || t?.monitoringPaused) {
    return 'Todavía no hay novedades. El primer chequeo corre cuando lo pidas.';
  }
  const at = t?.nextCheckAt;
  const hhmm = at
    ? artClock(at)
    : '17:30';
  return `Todavía no hay novedades. El primer chequeo corre hoy a las ${hhmm}.`;
}

/**
 * Last 7 days, collapse unchanged rule checks per day, cap at 20 cards.
 * Remaining count feeds «Mostrar anteriores · N».
 */
export function groupNovedades(items, {
  now = Date.now(),
  showAll = false,
  pageSize = NOVEDADES_PAGE_SIZE,
  maxDays = NOVEDADES_MAX_DAYS,
} = {}) {
  const list = Array.isArray(items) ? items : [];
  const cutoff = now - maxDays * 86400000;
  const inWindow = [];
  let olderCount = 0;
  for (const item of list) {
    const ts = Date.parse(item.at);
    if (Number.isFinite(ts) && ts >= cutoff) inWindow.push(item);
    else olderCount++;
  }
  const byDay = new Map();
  for (const item of inWindow) {
    const key = artDayKey(item.at);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(item);
  }
  const dayRows = [];
  for (const [key, dayItems] of byDay) {
    const unchanged = dayItems.filter(isUnchangedChequeo);
    const rest = dayItems.filter(i => !isUnchangedChequeo(i));
    const cards = rest.map(item => ({kind: 'card', item, at: item.at}));
    if (unchanged.length) {
      cards.push({
        kind: 'collapsed-chequeos',
        count: unchanged.length,
        items: unchanged,
        at: unchanged[0].at,
      });
    }
    dayRows.push({key, at: dayItems[0].at, cards});
  }
  const flat = [];
  for (const day of dayRows) {
    for (const card of day.cards) flat.push({...card, dayKey: day.key, dayAt: day.at});
  }
  const overflowInWindow = showAll ? 0 : Math.max(0, flat.length - pageSize);
  const visibleFlat = showAll ? flat : flat.slice(0, pageSize);
  const visibleDays = [];
  const dayMap = new Map();
  for (const card of visibleFlat) {
    if (!dayMap.has(card.dayKey)) {
      const row = {key: card.dayKey, at: card.dayAt, cards: []};
      dayMap.set(card.dayKey, row);
      visibleDays.push(row);
    }
    dayMap.get(card.dayKey).cards.push(card);
  }
  return {
    days: visibleDays,
    hiddenCount: overflowInWindow + olderCount,
    olderCount,
    shownCount: visibleFlat.length,
    totalInWindow: flat.length,
    totalCount: list.length,
  };
}

export const NEWS_FILTER_ALL = 'all';
export const NEWS_FILTER_NEWS = 'news';
export const NEWS_FILTER_RULES = 'rules';

/** News / reviews vs rule checks. No relevance field is required. */
export function isNewsItem(item) {
  return item?.type === 'news' || item?.type === 'attention';
}

export function isAutoTradeItem(item) {
  return item?.type === 'auto_trade' || item?.type === 'auto_trade_reversed';
}

export function isRuleItem(item) {
  return item?.type === 'chequeo' || item?.type === 'rebalance_applied' || item?.type === 'scenario' || isAutoTradeItem(item);
}

export function itemMatchesNewsFilter(item, filter) {
  if (!filter || filter === NEWS_FILTER_ALL) return true;
  if (filter === NEWS_FILTER_NEWS) return isNewsItem(item);
  if (filter === NEWS_FILTER_RULES) return isRuleItem(item);
  return true;
}

function firstPresentString(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * P1 Open Q: novedades do NOT carry a dedicated relevance / bucket / implication field.
 * Review evidence may include free-text `affected`. Show a line only when that (or an
 * explicit implication/relevance/bucket) is present. Never invent weight impact.
 */
export function implicationLine(item) {
  if (!item) return '';
  const explicit = firstPresentString(
    item.implication,
    item.implicancia,
    item.relevance,
    item.relevancia,
  );
  if (explicit) return explicit;
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const affected = firstPresentString(
    item.affected,
    item.bucket,
    ...evidence.map(e => e?.affected),
    ...evidence.map(e => e?.bucket),
  );
  if (!affected) return '';
  const weights = firstPresentString(item.weightImpact, item.pesos, item.weightsNote);
  return weights ? `Afecta a: ${affected} · ${weights}` : `Afecta a: ${affected}`;
}

export function countNewSince(items, lastSeenIso) {
  if (!lastSeenIso) return 0;
  const t = Date.parse(lastSeenIso);
  if (!Number.isFinite(t)) return 0;
  return (items || []).filter(i => Date.parse(i.at) > t).length;
}

export function newsChipLabel(total, newCount) {
  if (newCount > 0) return `Novedades · ${newCount} nuevas`;
  return `Novedades · ${total}`;
}

function regroupCards(cards) {
  const days = [];
  const dayMap = new Map();
  for (const card of cards) {
    const key = card.dayKey;
    if (!dayMap.has(key)) {
      const row = {key, at: card.dayAt, cards: []};
      dayMap.set(key, row);
      days.push(row);
    }
    dayMap.get(key).cards.push(card);
  }
  return days;
}

/** Preview: at most `limit` curated cards, rest collapsed as «Anteriores». */
export function previewNovedades(items, {limit = 3, now = Date.now(), filter = NEWS_FILTER_ALL} = {}) {
  const filtered = (items || []).filter(i => itemMatchesNewsFilter(i, filter));
  const grouped = groupNovedades(filtered, {now, showAll: true});
  const flat = grouped.days.flatMap(d => d.cards.map(c => ({...c, dayKey: d.key, dayAt: d.at})));
  const shown = flat.slice(0, limit);
  return {
    days: regroupCards(shown),
    hiddenCount: Math.max(0, flat.length - shown.length),
    shownCount: shown.length,
    totalInWindow: flat.length,
    totalCount: filtered.length,
    filter,
  };
}

export function curatedNovedades(items, {
  filter = NEWS_FILTER_ALL,
  showAll = false,
  preview = false,
  previewLimit = 3,
  now = Date.now(),
} = {}) {
  const filtered = (items || []).filter(i => itemMatchesNewsFilter(i, filter));
  if (preview) return previewNovedades(filtered, {limit: previewLimit, now, filter: NEWS_FILTER_ALL});
  const grouped = groupNovedades(filtered, {now, showAll});
  return {...grouped, totalCount: filtered.length, filter};
}
