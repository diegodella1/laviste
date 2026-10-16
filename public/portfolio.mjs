/** Derived portfolio values. Single copy; lib/portfolio.mjs re-exports this file. */

import {VERDICT_ACTION_RULES, VERDICT_NO_ACTION, isNoActionVerdict, POS_BUCKET_UNGROUPED, POS_BUCKET_CASH} from './copy.mjs';
import {money, moneyARS, pct1, pctInt, pp} from './format.mjs';

export {money, moneyARS, pct1, pp};

const roundMoney = n => Math.round(n * 100) / 100;

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
    if (d.ruleChip === 'cap') ruleCites.push(`${h.ticker} ${pct1(d.actual)} > tope ${pctInt(d.cap)}`);
    else if (d.ruleChip === 'drift') ruleCites.push(`Desvío ${h.ticker} ${pp(d.dev)} > umbral ${pp(d.drift)}`);
  }
  return {
    hasCapBreach: ruleCites.some(c => c.includes('> tope')),
    hasDriftBreach: ruleCites.some(c => c.startsWith('Desvío')),
    ruleCites,
  };
}

/**
 * Live weights vs cap/drift. Stale chequeo cites are ignored so Home cannot
 * say «Revisar» from an old 25,0 % while Posiciones shows 22,5 % Dentro.
 * `timelineItems` is accepted for call-site compatibility (P0-1).
 */
const RULE_REASON = /(> tope|supera el tope|Desvío)/;

export function effectiveAttention(t, timelineItems = []) {
  void timelineItems;
  let att = t.attention || 'track';
  if (!['track', 'watch', 'review'].includes(att)) att = 'track';
  let reason = t.attentionReason || '';
  const live = portfolioRuleState(t);
  if (live.hasCapBreach || live.hasDriftBreach) {
    const target = live.hasCapBreach ? 'review' : 'watch';
    if (severity[target] > severity[att] || att === 'track') att = target;
    reason = live.ruleCites.join(' · ');
  } else if (RULE_REASON.test(reason)) {
    att = 'track';
    reason = '';
  }
  if (live.hasCapBreach && severity.review > severity[att]) att = 'review';
  return {attention: att, reason};
}

/** Align timeline verdict with live weights in both directions. */
export function effectiveVerdict(t, timelineVerdict) {
  if (t?.phase !== 'active' || !t.invested) return timelineVerdict;
  const live = portfolioRuleState(t);
  if (live.hasCapBreach || live.hasDriftBreach) {
    if (timelineVerdict?.kind === 'action' && !isNoActionVerdict(timelineVerdict.text)) {
      return {...timelineVerdict, ruleCite: live.ruleCites.join(' · ') || timelineVerdict.ruleCite};
    }
    const cite = live.ruleCites.length ? live.ruleCites.join(' · ') : null;
    return {text: VERDICT_ACTION_RULES, kind: 'action', ruleCite: cite};
  }
  if (timelineVerdict?.kind === 'action') {
    const cite = timelineVerdict.ruleCite || '';
    const fromRules = /(> tope|Desvío|supera el tope)/.test(cite)
      || /concentración o desvíos/.test(timelineVerdict.text || '');
    if (fromRules) return {text: VERDICT_NO_ACTION, kind: 'none', ruleCite: null};
  }
  return timelineVerdict;
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

export function bucketKey(h, ungrouped = POS_BUCKET_UNGROUPED) {
  const b = (h?.bucket || '').trim();
  return b || ungrouped;
}

export function formatThemePct(n) {
  if (!Number.isFinite(n)) return pctInt(0);
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return pctInt(rounded);
  return pct1(rounded);
}

export function bucketsFor(t, {ungrouped = POS_BUCKET_UNGROUPED, cashName = POS_BUCKET_CASH} = {}) {
  const holdings = t?.holdings || [];
  const invested = (t?.invested || 0) > 0;
  const total = invested ? takeTotal(t) : 0;
  const map = new Map();
  for (const h of holdings) {
    const k = bucketKey(h, ungrouped);
    const val = invested ? (h.units || 0) * (h.price || 0) : 0;
    const rec = map.get(k) || {name: k, holdings: [], value: 0, objWeight: 0, kind: 'theme'};
    rec.holdings.push(h);
    rec.value += val;
    rec.objWeight += Number(h.weight) || 0;
    map.set(k, rec);
  }
  const themes = [...map.values()]
    .map(b => ({...b, pct: invested ? (total ? b.value / total * 100 : 0) : b.objWeight}))
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name, 'es'));
  const objCash = Math.max(0, 100 - holdings.reduce((s, h) => s + (Number(h.weight) || 0), 0));
  const cashValue = t?.cash || 0;
  const cashPct = invested ? (total ? cashValue / total * 100 : 0) : objCash;
  const cash = {name: cashName, pct: cashPct, value: cashValue, kind: 'cash', holdings: []};
  return {themes, cash, total, invested};
}

export function hasOpenWeightAction(t) {
  const live = portfolioRuleState(t);
  return Boolean(live.hasCapBreach || live.hasDriftBreach);
}

export function libroPrimary(t) {
  return hasOpenWeightAction(t) ? 'trade' : 'deposit';
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
