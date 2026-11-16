/**
 * Copy deck del digest «Cierre del día» (SoT 2026-11-16, §3, §6, §9.3).
 * Español es-AR con voseo. Solo porcentajes.
 */

import {escapeHtml} from './format.mjs';

export const NNBSP = '\u202F';
export const NBSP = '\u00A0';
export const MINUS = '\u2212';

export const STATUS_COPY = Object.freeze({
  ok: {label: 'En camino', pillClass: 'pill-ok', bg: '#ECFDF5', fg: '#047857', border: '#059669'},
  watch: {label: 'Para vigilar', pillClass: 'pill-watch', bg: '#FFFBEB', fg: '#B45309', border: '#D97706'},
  risk: {label: 'En riesgo', pillClass: 'pill-risk', bg: '#FEF2F2', fg: '#B91C1C', border: '#EF4444'},
});

export const TONE = Object.freeze({
  gain: {cls: 'c-gain', color: '#047857'},
  loss: {cls: 'c-loss', color: '#B91C1C'},
  neutral: {cls: 'c-muted', color: '#475569'},
});

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** % points rounded to 1 decimal (input: fraction). */
export function round1Pct(fraction) {
  if (!Number.isFinite(fraction)) return null;
  const r = Math.round(fraction * 1000) / 10;
  return Object.is(r, -0) ? 0 : r;
}

export function toneOf(fraction) {
  const v = round1Pct(fraction);
  if (v === null || v === 0) return 'neutral';
  return v > 0 ? 'gain' : 'loss';
}

/**
 * §6: signo siempre, coma decimal, 1 decimal, NNBSP antes de %, U+2212, glifo ▲/▼ o «=» en cero.
 * @param {number} fraction
 * @param {{html?: boolean, glyph?: boolean}} opts
 */
export function formatPct(fraction, {html = false, glyph = true} = {}) {
  const v = round1Pct(fraction) ?? 0;
  const nn = html ? '&#8239;' : NNBSP;
  const sp = html ? '&nbsp;' : NBSP;
  const s = Math.abs(v).toFixed(1).replace('.', ',');
  if (v === 0) return glyph ? `=${sp}0,0${nn}%` : `0,0${nn}%`;
  if (v > 0) return glyph ? `▲${sp}+${s}${nn}%` : `+${s}${nn}%`;
  return glyph ? `▼${sp}${MINUS}${s}${nn}%` : `${MINUS}${s}${nn}%`;
}

/** «Peso 35 %»: entero; por debajo de 1 % se muestra con 1 decimal. */
export function formatWeight(fraction, {html = false} = {}) {
  if (!Number.isFinite(fraction)) return null;
  const nn = html ? '&#8239;' : NNBSP;
  const pct = Math.abs(fraction) * 100;
  const s = pct >= 1 ? String(Math.round(pct)) : pct.toFixed(1).replace('.', ',');
  return `${s}${nn}%`;
}

/** «lunes 16 nov 2026» en hora de Buenos Aires a partir de YYYY-MM-DD. */
export function formatEyebrowDate(dayStr) {
  const [y, m, d] = String(dayStr).split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]} ${y}`;
}

export function heroLabel(fraction) {
  const t = toneOf(fraction);
  return t === 'gain' ? 'Ganancia del día' : (t === 'loss' ? 'Pérdida del día' : 'Día sin cambios');
}

export function changesPhrase(k) {
  if (k === 0) return 'sin cambios de estado';
  return k === 1 ? '1 cambio de estado' : `${k} cambios de estado`;
}

export function buildSupertakeSubject(view) {
  const pct = formatPct(view.portfolio.dayPct);
  const k = view.changesCount;
  if (!k) return `Cierre del día: resumen de tu cartera ${pct} · sin cambios de estado`;
  return `Cierre del día: resumen de tu cartera ${pct} · ${k === 1 ? '1 tesis cambió de estado' : `${k} tesis cambiaron de estado`}`;
}

function movedTo(t) {
  const verb = t.status === 'ok' ? 'volvió a' : 'pasó a';
  return `${t.name} ${verb} ${STATUS_COPY[t.status].label}`;
}

export function buildSupertakePreheader(view) {
  const k = view.changesCount;
  if (k === 0) {
    return view.topContributor
      ? `El mercado cerró. ${view.topContributor} lideró el día y tus tesis siguen como ayer.`
      : 'El mercado cerró. Tus tesis siguen como ayer.';
  }
  if (k === 1) return `El mercado cerró. ${movedTo(view.changes[0])}.`;
  if (k === 2) return `El mercado cerró. ${movedTo(view.changes[0])} y ${movedTo(view.changes[1])}.`;
  return `El mercado cerró. ${k} tesis cambiaron de estado.`;
}

const CLOSERS = Object.freeze({
  noise: 'No cambió nada de la idea de la tesis: por ahora lo leemos como ruido de mercado.',
  recovery: 'Recuperó lo que había perdido, así que vuelve a «En camino».',
  risk: 'Esta vez puede romper la tesis: conviene revisarla.',
  risk_easing: 'Bajó la presión, pero todavía la seguimos de cerca.',
});

/**
 * Plantilla mínima §9.3 (P0, determinista). Siempre cierra con «rompe la tesis» (solo En riesgo)
 * o «ruido de mercado». Nunca inventa causas.
 * @param {object} t thesis view row
 * @returns {string} texto plano (sin HTML)
 */
export function templateExplanation(t) {
  const parts = [];
  const top = t.topMover && Number.isFinite(t.topMover.dayPct) ? t.topMover : null;
  if (top) {
    const verb = toneOf(top.dayPct) === 'gain' ? 'subió' : (toneOf(top.dayPct) === 'loss' ? 'cayó' : 'quedó en');
    parts.push(`${top.ticker} ${verb} ${formatPct(top.dayPct)} y llevó a la tesis a ${formatPct(t.dayPct)} hoy.`);
  } else {
    parts.push(`La tesis cerró ${formatPct(t.dayPct)} hoy.`);
  }
  const label = STATUS_COPY[t.status].label;
  const reason = t.reasonCode || 'noise';
  if (reason === 'recovery') {
    parts.push(Number.isFinite(t.weekPct)
      ? `Con la semana en ${formatPct(t.weekPct)}, ${CLOSERS.recovery.charAt(0).toLowerCase()}${CLOSERS.recovery.slice(1)}`
      : CLOSERS.recovery);
    return parts.join(' ');
  }
  parts.push(Number.isFinite(t.weekPct)
    ? `Con la semana en ${formatPct(t.weekPct)}, la pasamos a «${label}».`
    : `Con este día, la pasamos a «${label}».`);
  parts.push(CLOSERS[reason] || CLOSERS.noise);
  return parts.join(' ');
}

/** Frase corta de «Todas tus tesis» (determinista, sin causas inventadas). */
export function templateRowLine(t, {changed = false} = {}) {
  if (changed) return 'El detalle está arriba, en Cambios de estado.';
  const tone = toneOf(t.dayPct);
  const day = tone === 'gain' ? 'Día en alza.' : (tone === 'loss' ? 'Día en baja.' : 'Día quieto.');
  const parts = [];
  if (t.status === 'watch' || t.status === 'risk') parts.push(`Sigue «${STATUS_COPY[t.status].label}».`);
  parts.push(day);
  if (Number.isFinite(t.weekPct)) {
    parts.push(toneOf(t.weekPct) === 'neutral' ? 'La semana quedó plana.' : `En la semana va ${formatPct(t.weekPct)}.`);
  }
  return parts.join(' ');
}

/** «YPF ▼ −5,3 % lideró» / «MELI = 0,0 % · sin movimiento hoy» / null si no hay líder. */
export function leaderParts(t) {
  if (!t.topMover || !Number.isFinite(t.topMover.dayPct)) return null;
  return {ticker: t.topMover.ticker, dayPct: t.topMover.dayPct, still: toneOf(t.topMover.dayPct) === 'neutral'};
}

/** Métrica del renglón según la propuesta (b). */
export function rowMetricText(t, mode, {html = false} = {}) {
  if (mode === 'contribution') {
    return Number.isFinite(t.contributionPct) ? `Aportó ${formatPct(t.contributionPct, {html})} a la cartera` : null;
  }
  const w = formatWeight(t.weightPct, {html});
  return w ? `Peso ${w}` : null;
}

/** Alt de la sparkline (§5.5), sin glifos. */
export function sparkAlt(name, weekPct, dayPct) {
  const w = round1Pct(weekPct) ?? 0;
  const trend = w === 0 ? 'quedó plana' : `${w > 0 ? 'sube' : 'baja'} ${Math.abs(w).toFixed(1).replace('.', ',')} %`;
  const d = toneOf(dayPct);
  const last = d === 'gain' ? 'con el último día en alza' : (d === 'loss' ? 'con el último día en baja' : 'con el último día sin cambios');
  return `Gráfico de la última semana de ${name}: ${trend} en 5 ruedas, ${last}.`;
}

export function autoActionLines(action) {
  const side = action.side === 'compra' ? 'Compra' : (action.side === 'venta' ? 'Venta' : 'Operación');
  return {
    title: `${side} simulada · ${action.ticker}`,
    thesis: `Tesis: ${action.thesisName || 'Tesis'}`,
    reason: `${action.reasonPlain || 'Operación automática de práctica'}. No se envió ninguna orden a un broker.`,
  };
}

export const FOOTER = Object.freeze({
  linesHtmlLead: 'Las líneas muestran la última semana.',
  linesTxtLead: 'Los porcentajes de «semana» muestran la última semana (en el HTML, como líneas).',
  cadence: 'Recibís este resumen los días hábiles de mercado. Podés apagarlo cuando quieras en',
  disclaimer: 'Este mensaje es educativo y simulado. No constituye asesoramiento financiero. La Viste es un simulador con dinero de práctica (simulado), no real. Los precios pueden ir demorados. No se envían órdenes a un broker.',
  unsubscribe: 'Darse de baja o cambiar alertas',
  copyright: '© 2026 La Viste · simulador de práctica',
});

export {escapeHtml};
