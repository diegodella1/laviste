/** Derived portfolio values (server tests + mirrored in public/portfolio.mjs). */

import {VERDICT_ACTION_RULES, isNoActionVerdict} from './copy.mjs';

export function money(n) {
  return new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0}).format(n);
}

/** Canonical ARS display (es-AR currency, whole pesos). */
export function moneyARS(n) {
  return money(n);
}

const roundMoney = n => Math.round(n * 100) / 100;

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

/** Live weights vs cap/drift (same rules as engine review). */
export function portfolioRuleState(t) {
  if (!t?.holdings?.length || !t.invested) {
    return {hasCapBreach: false, hasDriftBreach: false, ruleCites: []};
  }
  const ruleCites = [];
  for (const h of t.holdings) {
    const d = holdingDerived(t, h);
    if (d.ruleChip === 'cap') ruleCites.push(`${h.ticker} ${d.actual.toFixed(1)}% > tope ${d.cap}%`);
    else if (d.ruleChip === 'drift') ruleCites.push(`Desvío ${h.ticker} ${d.dev.toFixed(1)} pp > umbral ${d.drift} pp`);
  }
  return {
    hasCapBreach: ruleCites.some(c => c.includes('> tope')),
    hasDriftBreach: ruleCites.some(c => c.startsWith('Desvío')),
    ruleCites,
  };
}

export function effectiveAttention(t, timelineItems = []) {
  let att = t.attention || 'track';
  let reason = t.attentionReason || '';
  const live = portfolioRuleState(t);
  if (live.hasCapBreach || live.hasDriftBreach) {
    const target = live.hasCapBreach ? 'review' : 'watch';
    if (severity[target] > severity[att]) att = target;
    else if (att === 'track') att = target;
    reason = live.ruleCites.join(' · ');
  }
  const chequeo = timelineItems.find(i => i.type === 'chequeo' && i.verdict === 'action');
  if (chequeo?.ruleCite && /(> tope|Desvío)/.test(chequeo.ruleCite)) {
    const target = /> tope/.test(chequeo.ruleCite) ? 'review' : 'watch';
    if (severity[target] > severity[att]) {
      att = target;
      reason = chequeo.ruleCite;
    } else if (att === 'track') {
      att = target;
      reason = chequeo.ruleCite;
    }
  }
  if (live.hasCapBreach && severity.review > severity[att]) {
    att = 'review';
  }
  return {attention: att, reason};
}

/** Align timeline verdict with live weights (stale chequeo must not claim «dentro del tope»). */
export function effectiveVerdict(t, timelineVerdict) {
  if (!timelineVerdict || t.phase !== 'active' || !t.invested) return timelineVerdict;
  const live = portfolioRuleState(t);
  if (!live.hasCapBreach && !live.hasDriftBreach) return timelineVerdict;
  if (timelineVerdict.kind === 'action' && !isNoActionVerdict(timelineVerdict.text)) return timelineVerdict;
  const cite = live.ruleCites.length ? live.ruleCites.join(' · ') : null;
  return {text: VERDICT_ACTION_RULES, kind: 'action', ruleCite: cite};
}

/** Preview rebalance trades and post-trade cash (sell-first, same as rebalanceToTarget). */
export function simulateRebalance(t) {
  const totalVal = takeTotal(t);
  const plan = t.holdings.map(h => {
    const targetUnits = Math.floor((totalVal * h.weight) / 100 / h.price);
    return {ticker: h.ticker, price: h.price, weight: h.weight, units: h.units, targetUnits, delta: targetUnits - h.units};
  });
  const holdingsAfter = t.holdings.map(h => ({...h}));
  let afterCash = roundMoney(t.cash);
  const lines = [];
  for (const p of plan.filter(x => x.delta < 0)) {
    const n = -p.delta;
    const h = holdingsAfter.find(x => x.ticker === p.ticker);
    h.units -= n;
    const amount = roundMoney(n * p.price);
    afterCash = roundMoney(afterCash + amount);
    lines.push({ticker: p.ticker, delta: -n, label: 'Venta', amount, line: `Venta ${n} · ${p.ticker} · ${moneyARS(amount)}`});
  }
  for (const p of plan.filter(x => x.delta > 0)) {
    const h = holdingsAfter.find(x => x.ticker === p.ticker);
    const cost = roundMoney(p.delta * p.price);
    h.units += p.delta;
    afterCash = roundMoney(afterCash - cost);
    lines.push({ticker: p.ticker, delta: p.delta, label: 'Compra', amount: cost, line: `Compra ${p.delta} · ${p.ticker} · ${moneyARS(cost)}`});
  }
  const afterTotal = roundMoney(afterCash + holdingsAfter.reduce((s, h) => s + h.units * h.price, 0));
  return {lines, total: totalVal, afterCash, afterTotal, holdingsAfter, tradeSummary: lines.map(l => l.line).join(' · ')};
}

export function targetDiff(t) {
  const sim = simulateRebalance(t);
  return {lines: sim.lines, total: sim.total, afterCash: sim.afterCash, afterTotal: sim.afterTotal};
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
