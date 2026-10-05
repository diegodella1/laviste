/** Derived portfolio values (server tests + mirrored in public/portfolio.mjs). */

export function money(n) {
  return new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0}).format(n);
}

export function moneyARS(n) {
  return `ARS ${money(n)}`;
}

export function pct1(n) {
  return n.toFixed(1).replace('.', ',') + '%';
}

export function pp(n) {
  return n.toFixed(1).replace('.', ',') + ' pp';
}

export function takeTotal(t) {
  return t.cash + t.holdings.reduce((s, h) => s + h.units * h.price, 0);
}

export function holdingDerived(t, h) {
  const total = takeTotal(t);
  const actual = t.invested > 0 ? (h.units * h.price / total) * 100 : 0;
  const cap = t.settings?.cap ?? 25;
  const drift = t.settings?.drift ?? 5;
  const lo = Math.max(0, h.weight - drift);
  const hi = Math.min(cap, h.weight + drift);
  const dev = Math.abs(actual - h.weight);
  const margin = cap - actual;
  const pnl = h.entryPrice ? (h.price / h.entryPrice - 1) * 100 : 0;
  let ruleChip = 'ok';
  if (actual > cap) ruleChip = 'cap';
  else if (dev > drift) ruleChip = 'drift';
  return {actual, dev, lo, hi, margin, pnl, ruleChip, cap, drift, value: h.units * h.price};
}

const severity = {track: 0, watch: 1, review: 2};

export function effectiveAttention(t, timelineItems = []) {
  let att = t.attention || 'track';
  let reason = t.attentionReason || '';
  const chequeo = timelineItems.find(i => i.type === 'chequeo' && i.verdict === 'action');
  if (chequeo?.ruleCite && /(> tope|Desvío)/.test(chequeo.ruleCite)) {
    if (severity.watch > severity[att]) {
      att = 'watch';
      reason = chequeo.ruleCite;
    }
  }
  return {attention: att, reason};
}

export function targetDiff(t) {
  const total = takeTotal(t);
  const lines = [];
  for (const h of t.holdings) {
    const targetUnits = Math.floor((total * h.weight) / 100 / h.price);
    const delta = targetUnits - h.units;
    if (!delta) continue;
    const amount = Math.abs(delta) * h.price;
    const label = delta > 0 ? 'Compra' : 'Venta';
    lines.push({ticker: h.ticker, delta, targetUnits, amount, label, line: `${label} ${Math.abs(delta)} · ${h.ticker} · ${moneyARS(amount)}`});
  }
  return {lines, total};
}

export function proposalDiff(prev, next) {
  if (!prev?.holdings || !next?.holdings) return {added: [], removed: [], changed: []};
  const pmap = new Map(prev.holdings.map(h => [h.ticker, h]));
  const nmap = new Map(next.holdings.map(h => [h.ticker, h]));
  const added = next.holdings.filter(h => !pmap.has(h.ticker));
  const removed = prev.holdings.filter(h => !nmap.has(h.ticker));
  const changed = next.holdings.filter(h => pmap.has(h.ticker) && pmap.get(h.ticker).weight !== h.weight)
    .map(h => ({ticker: h.ticker, from: pmap.get(h.ticker).weight, to: h.weight}));
  return {added, removed, changed};
}

export function relatedNews(reviews, takeId, h) {
  const ticker = h.ticker;
  const name = h.name || '';
  const re = new RegExp(`\\b${ticker}\\b`, 'i');
  const events = [];
  for (const r of reviews.filter(rv => rv.takeId === takeId)) {
    for (const e of r.events || []) {
      const hay = `${e.affected || ''} ${e.title || ''} ${e.fact || ''} ${name}`;
      if (re.test(hay)) events.push({...e, review: r});
    }
  }
  return events.slice(0, 2);
}
