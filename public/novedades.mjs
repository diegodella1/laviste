/** Novedades grouping, collapse and suggested-action dedupe (P0-10..12). */

import {artClock, artDayKey} from './timeline.mjs';

export const NOVEDADES_MAX_DAYS = 7;
export const NOVEDADES_PAGE_SIZE = 20;

const ART = 'America/Argentina/Buenos_Aires';

export function normalizeActionText(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Hide «Acción sugerida» when it repeats the body (normalized) or contains it. */
export function shouldHideSuggestedAction(verdictText, body) {
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
  };
}
