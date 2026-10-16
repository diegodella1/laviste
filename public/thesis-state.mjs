/** Single source of thesis status for Home, cabecera, Posiciones and Novedades. */

import {holdingDerived, portfolioRuleState, effectiveAttention} from './portfolio.mjs';
import {pct1, pctInt, pp} from './format.mjs';
import {artClock, artDayKey} from './timeline.mjs';
import {VERDICT_NO_ACTION} from './copy.mjs';

export const ATTENTION_LABELS = {track: 'En camino', watch: 'Vigilando', review: 'Revisar'};
export const RULE_CHIP_LABEL = {ok: 'Dentro', cap: 'Sobre tope', drift: 'Revisar', draft: '—'};
export const VERDICT_TITLE = {
  review: 'Hay algo para revisar',
  track: VERDICT_NO_ACTION,
  watch: 'Conviene vigilar',
};
export const VERDICT_OK_DETAIL = 'Dentro del tope y del desvío.';

const ART = 'America/Argentina/Buenos_Aires';
const severity = {track: 0, watch: 1, review: 2};

function monthDay(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-AR', {timeZone: ART, day: 'numeric'});
  const month = d.toLocaleDateString('es-AR', {timeZone: ART, month: 'short'}).replace('.', '');
  return `${day} ${month}`;
}

function clock(iso) {
  return artClock(iso);
}

/** Display rounds to the cap while the unrounded weight is still inside. */
export function roundsToCapDisplay(actual, cap) {
  if (!Number.isFinite(actual) || !Number.isFinite(cap)) return false;
  return actual <= cap && Number(actual.toFixed(1)) >= Number(Number(cap).toFixed(1));
}

export function formatCapMotivo(ticker, actual, cap, {roundedWithin = false} = {}) {
  const shown = pct1(actual);
  if (roundedWithin) {
    return `${ticker} ${shown} (redondeado), dentro del tope de ${pctInt(cap)}`;
  }
  return `${ticker} ${shown} supera el tope de ${pctInt(cap)}.`;
}

export function formatDriftMotivo(ticker, dev, drift) {
  return `Desvío ${ticker} ${pp(dev)} supera el umbral de ${pp(drift)}.`;
}

function liveMotivo(t, live) {
  if (!t?.holdings?.length || !t.invested) return '';
  const capHits = [];
  const driftHits = [];
  const roundedHits = [];
  for (const h of t.holdings) {
    const d = holdingDerived(t, h);
    if (d.ruleChip === 'cap') capHits.push(formatCapMotivo(h.ticker, d.actual, d.cap));
    else if (d.ruleChip === 'drift') driftHits.push(formatDriftMotivo(h.ticker, d.dev, d.drift));
    else if (roundsToCapDisplay(d.actual, d.cap)) {
      roundedHits.push(formatCapMotivo(h.ticker, d.actual, d.cap, {roundedWithin: true}));
    }
  }
  if (live.hasCapBreach) return capHits.join(' · ');
  if (live.hasDriftBreach) return driftHits.join(' · ');
  if (roundedHits.length) return roundedHits.join(' · ');
  return '';
}

/**
 * Attention + motivo from LIVE unrounded weights, then news attention.
 * Stale chequeo cites never override a live «Dentro».
 */
export function attentionFromLive(t) {
  const live = portfolioRuleState(t);
  const fromLive = liveMotivo(t, live);
  const base = effectiveAttention(t);
  let att = base.attention;
  let reason = base.reason;
  if (live.hasCapBreach) {
    att = 'review';
    reason = fromLive;
  } else if (live.hasDriftBreach) {
    if (severity.watch > severity[att] || att === 'track') att = 'watch';
    reason = fromLive;
  } else if (fromLive) {
    reason = fromLive;
  }
  return {attention: att, reason, live};
}

export function formatMetaLine({chequeadoEn, preciosEn} = {}) {
  if (!chequeadoEn) return '';
  const datePart = monthDay(chequeadoEn);
  const timePart = clock(chequeadoEn);
  let line = `Revisado ${datePart} · ${timePart}`;
  if (preciosEn) {
    const checkedMin = `${artDayKey(chequeadoEn)} ${clock(chequeadoEn)}`;
    const priceMin = `${artDayKey(preciosEn)} ${clock(preciosEn)}`;
    if (checkedMin !== priceMin) {
      line += ` · precios de las ${clock(preciosEn)}`;
    }
  }
  return line;
}

function holdingRow(t, h) {
  const d = t?.invested ? holdingDerived(t, h) : null;
  const cap = d?.cap ?? t?.settings?.cap ?? 25;
  const actual = d?.actual ?? null;
  const ruleChip = d?.ruleChip ?? 'draft';
  return {
    ticker: h.ticker,
    name: h.name,
    weight: h.weight,
    actual,
    actualDisplay: d ? pct1(d.actual) : '—',
    cap,
    drift: d?.drift ?? t?.settings?.drift ?? 5,
    ruleChip,
    statusLabel: RULE_CHIP_LABEL[ruleChip] || '—',
    roundedWithin: d ? roundsToCapDisplay(d.actual, d.cap) : false,
    value: d?.value ?? null,
  };
}

function verdictFor(attention, motivo) {
  if (attention === 'review') {
    return {
      kind: 'action',
      attention,
      title: VERDICT_TITLE.review,
      text: motivo || 'Hay una posición fuera de regla.',
    };
  }
  if (attention === 'watch') {
    return {
      kind: 'action',
      attention,
      title: VERDICT_TITLE.watch,
      text: motivo || 'Conviene mirar concentración o desvío.',
    };
  }
  return {
    kind: 'none',
    attention: 'track',
    title: VERDICT_TITLE.track,
    text: VERDICT_OK_DETAIL,
  };
}

/**
 * ONE calculation consumed by Home (chip + fila), cabecera, Posiciones and Novedades.
 * Comparison vs cap uses the unrounded weight; display uses 1 decimal.
 */
export function computeThesisState(t, {timelineItems = [], quotesAsOf = null} = {}) {
  const {attention, reason, live} = attentionFromLive(t);
  const holdings = (t?.holdings || []).map(h => holdingRow(t, h));
  const motivo = reason || (t?.phase === 'active' ? VERDICT_OK_DETAIL : '');
  const chequeadoEn = t?.checkedAt || null;
  const preciosEn = quotesAsOf || t?.quotesAsOf || t?.realPricesAt || null;
  const metaLine = formatMetaLine({chequeadoEn, preciosEn});
  const verdict = verdictFor(attention, motivo);
  return {
    attention,
    statusLabel: ATTENTION_LABELS[attention] || attention,
    motivo,
    chequeadoEn,
    preciosEn,
    metaLine,
    holdings,
    live,
    verdict,
    cap: t?.settings?.cap ?? 25,
    drift: t?.settings?.drift ?? 5,
    nextCheckAt: t?.nextCheckAt || null,
    timelineItems,
  };
}

/** Compact snapshot so tests fail if Home / Posiciones / Novedades would disagree. */
export function viewStatusSnapshot(t, opts) {
  const s = computeThesisState(t, opts);
  return {
    home: {attention: s.attention, statusLabel: s.statusLabel, motivo: s.motivo},
    header: {attention: s.attention, statusLabel: s.statusLabel, motivo: s.motivo, metaLine: s.metaLine},
    posiciones: s.holdings.map(h => ({
      ticker: h.ticker,
      actual: h.actual,
      actualDisplay: h.actualDisplay,
      statusLabel: h.statusLabel,
      ruleChip: h.ruleChip,
    })),
    novedades: {attention: s.attention, title: s.verdict.title, text: s.verdict.text},
  };
}

/** Home pills and Mis tesis filter — same attention as computeThesisState. */
export function countByAttention(takes, optsFor) {
  const counts = {track: 0, watch: 0, review: 0, draft: 0};
  for (const t of takes || []) {
    if (t.phase === 'draft') counts.draft++;
    else if (t.phase === 'active') {
      const st = computeThesisState(t, typeof optsFor === 'function' ? optsFor(t) : (optsFor || {}));
      counts[st.attention]++;
    }
  }
  return counts;
}

export function takeMatchesAttention(t, attention, opts) {
  if (t?.phase !== 'active') return false;
  return computeThesisState(t, opts).attention === attention;
}

export function viewsAgree(snapshot) {
  const {home, header, novedades, posiciones} = snapshot;
  if (home.attention !== header.attention) return false;
  if (home.motivo !== header.motivo) return false;
  if (home.attention !== novedades.attention) return false;
  if (home.statusLabel !== header.statusLabel) return false;
  const cap = posiciones.filter(p => p.ruleChip === 'cap');
  if (cap.length && home.attention !== 'review') return false;
  if (!cap.length && !posiciones.some(p => p.ruleChip === 'drift')) {
    if (home.motivo.includes('supera el tope') || home.motivo.includes('> tope')) return false;
    if (home.attention === 'review' && /tope|Desvío/.test(home.motivo)) return false;
  }
  return true;
}
