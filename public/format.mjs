export function money(n) {
  return new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0}).format(n);
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
