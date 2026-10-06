export function money(n) {
  return new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0}).format(n);
}

/** Chart Y-axis: «$ 2,2 M» style (Suizo §8). */
export function moneyCompactArsAxis(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) {
    const m = n / 1e6;
    const dec = abs >= 10e6 ? 1 : 2;
    const s = m.toFixed(dec).replace('.', ',');
    return '$ ' + s + ' M';
  }
  if (abs >= 1000) {
    return '$ ' + new Intl.NumberFormat('es-AR', {maximumFractionDigits: 0}).format(Math.round(n / 1000)) + ' mil';
  }
  return money(n);
}

/** Index-scale chart ticks (100 = base). */
export function moneyCompactM(n) {
  return n.toFixed(1).replace('.', ',');
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
