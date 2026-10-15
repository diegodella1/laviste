/** Canonical es-AR display helpers (percent, money, axis). */

export const NBSP = '\u00A0';
export const NNBSP = '\u202F';
export const MINUS = '\u2212';

function finiteOrDash(n, fmt) {
  if (!Number.isFinite(n)) return '—';
  return fmt(n);
}

export function money(n) {
  return finiteOrDash(n, v =>
    new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0}).format(v)
  );
}

/** Canonical ARS display (es-AR currency, whole pesos). */
export function moneyARS(n) {
  return money(n);
}

export function signedMoney(n) {
  if (!Number.isFinite(n)) return '—';
  const formatted = money(Math.abs(n));
  if (n > 0) return '+' + formatted;
  if (n < 0) return MINUS + formatted;
  return formatted;
}

/** One decimal, comma, thin no-break space before %. */
export function pct1(n) {
  return finiteOrDash(n, v => v.toFixed(1).replace('.', ',') + NNBSP + '%');
}

/** Integer percent with thin no-break space before %. */
export function pctInt(n) {
  return finiteOrDash(n, v => String(Math.round(v)) + NNBSP + '%');
}

export function pctSigned(n) {
  if (!Number.isFinite(n)) return '—';
  const body = pct1(Math.abs(n));
  if (n > 0) return '+' + body;
  if (n < 0) return MINUS + body;
  return body;
}

export function pp(n) {
  return finiteOrDash(n, v => v.toFixed(1).replace('.', ',') + NBSP + 'pp');
}

/** Chart Y-axis: «$ 2,2 M» style (Suizo §8). */
export function moneyCompactArsAxis(n) {
  return formatArsAxisTick(n, 1);
}

export function formatArsAxisTick(n, millionDecimals = 1) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) {
    const m = n / 1e6;
    const s = m.toFixed(millionDecimals).replace('.', ',');
    return '$' + NBSP + s + NBSP + 'M';
  }
  if (abs >= 1000) {
    const mil = new Intl.NumberFormat('es-AR', {maximumFractionDigits: 0}).format(Math.round(n / 1000));
    return '$' + NBSP + mil + NBSP + 'mil';
  }
  return money(n);
}

/**
 * Format a set of Y-axis values with the fewest decimals that keeps labels unique.
 * Around 1 M uses «mil» below 1e6 and two decimals of M when one decimal would collide.
 */
export function uniqueArsAxisLabels(values) {
  const vals = values.map(v => Number(v));
  if (!vals.length) return [];
  for (let millionDecimals = 1; millionDecimals <= 2; millionDecimals++) {
    const labels = vals.map(v => formatArsAxisTick(v, millionDecimals));
    if (new Set(labels).size === labels.length) return labels;
  }
  const extra = vals.map(v => formatArsAxisTick(v, 3));
  if (new Set(extra).size === extra.length) return extra;
  return vals.map(v => money(v));
}

/** Index-scale chart ticks (100 = base). */
export function moneyCompactM(n) {
  return n.toFixed(1).replace('.', ',');
}
