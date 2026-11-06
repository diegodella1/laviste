/**
 * Spanish formatting for Clarity emails (es-AR, voseo).
 * Percentages: signed, 1 decimal, comma separator, NNBSP before %, arrows.
 */

const NNBSP = '\u202F';

/**
 * Format percentage for email display (Spanish es-AR).
 * @param {number} value - fraction (e.g., 0.024 → +2,4 %)
 * @param {object} opts - {neutral: true} to show 0,0 % without sign
 * @returns {string} - e.g., "+2,4 %", "−0,5 %", "0,0 %"
 */
export function formatPercentES(value, {neutral = false} = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return neutral ? `0,0${NNBSP}%` : `= 0,0${NNBSP}%`;
  }
  
  const pct = value * 100;
  const abs = Math.abs(pct);
  const formatted = abs.toFixed(1).replace('.', ',');
  
  if (Math.abs(pct) < 0.05) {
    return neutral ? `0,0${NNBSP}%` : `= 0,0${NNBSP}%`;
  }
  
  if (pct >= 0) {
    return `+${formatted}${NNBSP}%`;
  } else {
    return `−${formatted}${NNBSP}%`;
  }
}

/**
 * Format percentage with arrow for HTML display.
 * @param {number} value - fraction
 * @param {object} opts - {neutral: true, arrowOnly: boolean}
 * @returns {string} - e.g., "▲ +2,4 %", "▼ −0,5 %", "0,0 %"
 */
export function formatPercentWithArrow(value, {neutral = false, arrowOnly = false} = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value * 100) < 0.05) {
    return neutral ? formatPercentES(value, {neutral: true}) : formatPercentES(value, {neutral: true});
  }
  
  const formatted = formatPercentES(value, {neutral});
  const arrow = value >= 0 ? '▲' : '▼';
  return arrowOnly ? arrow : `${arrow} ${formatted}`;
}

/**
 * Direction label for gain/loss (Spanish).
 * @param {number} value - fraction
 * @returns {string} - "Ganancia del día", "Pérdida del día", "Sin cambio en el día"
 */
export function directionLabel(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value * 100) < 0.05) {
    return 'Sin cambio en el día';
  }
  return value >= 0 ? 'Ganancia del día' : 'Pérdida del día';
}

/**
 * Format date in Spanish (es-AR).
 * @param {Date|string} date
 * @param {object} opts - {long: boolean, time: boolean}
 * @returns {string} - e.g., "viernes 6 de noviembre de 2026" or "6 nov."
 */
export function formatDateES(date, {long = false, time = false} = {}) {
  const d = date instanceof Date ? date : new Date(date);
  
  if (long && time) {
    const weekday = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()];
    const day = d.getDate();
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${weekday} ${day} de ${month} de ${year}, ${hours}:${minutes} (Argentina)`;
  }
  
  if (long) {
    const weekday = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()];
    const day = d.getDate();
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${weekday} ${day} de ${month} de ${year}`;
  }
  
  const day = d.getDate();
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const month = months[d.getMonth()];
  return `${day} ${month}.`;
}

/**
 * Escape HTML entities for safe display.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format absolute percentage (for thresholds).
 * @param {number} value - fraction (e.g., 0.075 → 7,5 %)
 * @returns {string} - e.g., "7,5 %"
 */
export function formatAbsolutePercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `0,0${NNBSP}%`;
  }
  
  const pct = Math.abs(value * 100);
  const formatted = pct.toFixed(1).replace('.', ',');
  return `${formatted}${NNBSP}%`;
}

/**
 * Truncate text to max length.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function truncate(text, max = 100) {
  if (typeof text !== 'string') return '';
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}
