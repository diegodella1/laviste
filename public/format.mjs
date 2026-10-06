export function money(n) {
  return new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0}).format(n);
}

/** Chart Y-axis: «0,9 M» style (Suizo §8). */
export function moneyCompactM(n) {
  const m = n / 1e6;
  return m.toFixed(1).replace('.', ',') + ' M';
}

export function moneyARS(n) {
  return money(n);
}

export function pct1(n) {
  return n.toFixed(1).replace('.', ',') + '%';
}

export function pp(n) {
  return n.toFixed(1).replace('.', ',') + ' pp';
}
