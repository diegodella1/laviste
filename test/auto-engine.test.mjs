import {test} from 'node:test';
import assert from 'node:assert/strict';
import {holdingDerived} from '../lib/portfolio.mjs';
import {viewStatusSnapshot, viewsAgree} from '../lib/thesis-state.mjs';
import {isAiPaused, deriveBudgetState} from '../lib/budget.mjs';
import {dayInBuenosAires} from '../lib/usage.mjs';
import {value} from '../lib/engine.mjs';
import {
  AUTO_DEBOUNCE_MS, AUTO_BROKEN_WAIT_MS, AUTO_QUOTE_MAX_AGE_MS, AUTO_UNDO_WINDOW_HOURS,
  REASONS, H_IN, H_OUT,
  deriveSignals, signalSignature, signalPayload, capEnters, nextSessionClose, autoMarketOpen,
  sizeCapTrade, sizeDriftTrade, sizeBrokenBatch, targetUnitsFor,
  evaluateGuards, dailyUsage, autoDay, isCanaryEligible,
  previewUndo, evaluateUndo, evaluateAuto,
  MAX_TRADES_DAY, MAX_TRADES_DAY_USER, MAX_TURNOVER_PCT,
} from '../lib/auto/engine.mjs';

const OPEN = '2026-10-19T15:00:00.000Z'; // Monday 12:00 ART
const CLOSED = '2026-10-17T15:00:00.000Z'; // Saturday 12:00 ART

function later(iso, ms) {
  return new Date(Date.parse(iso) + ms).toISOString();
}

function quote(ticker, price, asOf = OPEN, extra = {}) {
  return {ticker, price, asOf, provider: 'data912', stale: false, ...extra};
}

function policy(over = {}) {
  return {
    enabled: true,
    simulated: true,
    newsTrigger: false,
    maxTradesDay: MAX_TRADES_DAY,
    maxTurnoverPct: MAX_TURNOVER_PCT,
    maxTradesDayUser: MAX_TRADES_DAY_USER,
    canaryOwnerOnly: false,
    armState: {},
    ...over,
  };
}

function takeAt({
  ticker = 'GGAL', actualPct = 25.6, weight = 20, cap = 25, drift = 5, units = 100, extras = [],
} = {}) {
  const total = 1_000_000;
  const pos = total * actualPct / 100;
  const price = pos / units;
  return {
    id: 'take-1',
    phase: 'active',
    invested: total,
    cash: total - pos,
    attention: 'track',
    monitoringPaused: false,
    scenario: 'normal',
    realPricesAt: OPEN,
    version: 1,
    settings: {cap, drift, cadence: 'standard', mode: 'ask', paused: false},
    holdings: [{ticker, name: ticker, units, price, weight, entryPrice: price}, ...extras],
  };
}

function quotesFor(take, asOf = OPEN) {
  const map = {};
  for (const h of take.holdings) map[h.ticker] = quote(h.ticker, h.price, asOf);
  return map;
}

function brokenReview(over = {}) {
  return {
    id: 'rev-1',
    applied: true,
    previousAttention: 'watch',
    newAttention: 'review',
    events: [{id: 'e1', title: 'corte'}],
    sourceIds: ['src-1'],
    resolved: false,
    ...over,
  };
}

function derive(take, over = {}) {
  return deriveSignals(take, {
    quotes: over.quotes || quotesFor(take, over.asOf || OPEN),
    now: over.now || OPEN,
    policy: over.policy || policy(),
    latestReview: over.latestReview,
    armState: over.armState,
    pendingSignals: over.pendingSignals,
    recentAutoTrades: over.recentAutoTrades,
    holidays: over.holidays,
  });
}

function confirmPrice(take, over = {}) {
  const first = derive(take, over);
  const pending = first.signals.find(s => s.status === 'pending');
  const t2 = later(OPEN, AUTO_DEBOUNCE_MS);
  const second = derive(take, {
    ...over,
    now: t2,
    asOf: t2,
    quotes: quotesFor(take, t2),
    armState: first.nextArmState,
    pendingSignals: first.signals,
  });
  return {first, second, pending, confirmed: second.signals.find(s => s.status === 'confirmed')};
}

function tradeRow(over = {}) {
  return {
    id: over.id || 'tr-1',
    takeId: over.takeId || 'take-1',
    userId: over.userId || 'owner',
    kind: over.kind || 'cap',
    day: over.day || '2026-10-19',
    status: over.status || 'executed',
    executedAt: over.executedAt || OPEN,
    amount: over.amount ?? 100_000,
    meta: over.meta || {},
    ...over,
  };
}

function guardCtx(over = {}) {
  const take = over.take || takeAt();
  return {
    take,
    policy: over.policy || policy(),
    quotes: over.quotes || quotesFor(take),
    now: over.now || OPEN,
    user: over.user || {id: 'owner', status: 'active'},
    ownerUserId: over.ownerUserId || 'owner',
    autoTrading: over.autoTrading || {enabled: true},
    featureAutoSim: over.featureAutoSim !== undefined ? over.featureAutoSim : true,
    isDemo: over.isDemo || false,
    holidays: over.holidays || [],
    recentAutoTrades: over.recentAutoTrades || [],
    pendingManualOrder: over.pendingManualOrder,
    takeVersionAtDetect: over.takeVersionAtDetect,
    ai: over.ai,
    kind: over.kind || 'cap',
    signal: over.signal || {kind: 'cap', ticker: take.holdings[0].ticker},
    sized: over.sized,
    takeValueAtOpen: over.takeValueAtOpen,
    extraAmount: over.extraAmount,
  };
}

test('cap enters at +0.5 pp and not at +0.4', () => {
  assert.equal(capEnters(25.4, 25), false);
  assert.equal(capEnters(25.5, 25), true);
  const miss = derive(takeAt({actualPct: 25.4}));
  assert.equal(miss.signals.length, 0);
  const hit = derive(takeAt({actualPct: 25.5}));
  assert.equal(hit.signals[0].kind, 'cap');
  assert.equal(hit.signals[0].status, 'pending');
});

test('cap oscillation 25.0–25.6 fires once until actual drops below 24.0', () => {
  const hot = takeAt({actualPct: 25.6});
  const {first, confirmed, second} = confirmPrice(hot);
  assert.ok(confirmed, JSON.stringify(second.signals));
  const sig = confirmed.signature;
  const mid = derive(takeAt({actualPct: 25.0}), {armState: second.nextArmState, pendingSignals: second.signals});
  assert.equal(mid.signals.filter(s => s.status === 'pending' || s.status === 'confirmed').length, 0);
  assert.equal(mid.nextArmState['cap:GGAL'].armed, false);
  const rearm = derive(takeAt({actualPct: 23.9}), {armState: mid.nextArmState});
  assert.equal(rearm.nextArmState['cap:GGAL'].armed, true);
  assert.equal(rearm.nextArmState['cap:GGAL'].epoch, 1);
  const again = derive(takeAt({actualPct: 25.6}), {armState: rearm.nextArmState});
  assert.equal(again.signals[0].status, 'pending');
  assert.notEqual(again.signals[0].signature, sig);
  assert.equal(first.signals[0].signature, sig);
});

test('cap has priority over drift on the same ticker', () => {
  const t = takeAt({actualPct: 26, weight: 18, cap: 25, drift: 5});
  const d = holdingDerived(t, t.holdings[0]);
  assert.ok(d.actual > d.cap);
  assert.ok(Math.abs(d.actual - t.holdings[0].weight) > d.drift);
  const out = derive(t);
  assert.deepEqual(out.signals.map(s => s.kind), ['cap']);
});

test('drift enters at drift+0.5 and not at +0.4', () => {
  const miss = derive(takeAt({actualPct: 15.4, weight: 20, cap: 25, drift: 5}));
  assert.equal(miss.signals.length, 0);
  const hit = derive(takeAt({actualPct: 14.5, weight: 20, cap: 25, drift: 5}));
  assert.equal(hit.signals[0].kind, 'drift');
});

test('news trigger off never emits broken; watch emits nothing', () => {
  const t = takeAt({actualPct: 20});
  const off = derive(t, {latestReview: brokenReview(), policy: policy({newsTrigger: false})});
  assert.equal(off.signals.filter(s => s.kind === 'broken').length, 0);
  assert.ok(off.blocks.some(b => b.reason === REASONS.NEWS_TRIGGER_APAGADO));
  const watch = derive(t, {
    policy: policy({newsTrigger: true}),
    latestReview: brokenReview({newAttention: 'watch', previousAttention: 'track'}),
  });
  assert.equal(watch.signals.filter(s => s.kind === 'broken').length, 0);
});

test('broken requires applied and previous !== review', () => {
  const t = takeAt({actualPct: 20});
  const pol = policy({newsTrigger: true});
  assert.equal(derive(t, {policy: pol, latestReview: brokenReview({applied: false})}).signals.length, 0);
  assert.equal(derive(t, {policy: pol, latestReview: brokenReview({previousAttention: 'review'})}).signals.length, 0);
  const ok = derive(t, {policy: pol, latestReview: brokenReview()});
  assert.equal(ok.signals[0].kind, 'broken');
  assert.equal(ok.signals[0].status, 'pending');
});

test('resolved review rearms broken', () => {
  const t = takeAt({actualPct: 20});
  const armedOff = {broken: {armed: false, epoch: 0}};
  const out = derive(t, {
    policy: policy({newsTrigger: true}),
    armState: armedOff,
    latestReview: {id: 'r2', applied: true, resolved: true, newAttention: 'track', previousAttention: 'review', events: [], sourceIds: []},
  });
  assert.equal(out.nextArmState.broken.armed, true);
  assert.equal(out.nextArmState.broken.epoch, 1);
});

test('paused tesis_rota emits no second broken', () => {
  const out = derive(takeAt(), {
    policy: policy({newsTrigger: true, pausedReason: 'tesis_rota'}),
    latestReview: brokenReview(),
  });
  assert.equal(out.signals.length, 0);
  assert.equal(out.blocks[0].reason, REASONS.TESIS_ROTA);
});

test('price debounce: 1 snapshot pending; same asOf does not confirm; ≥15 min new asOf confirms; gone expires', () => {
  const t = takeAt({actualPct: 25.6});
  const first = derive(t);
  assert.equal(first.signals[0].status, 'pending');
  const same = derive(t, {now: later(OPEN, 60_000), pendingSignals: first.signals, armState: first.nextArmState});
  assert.equal(same.signals[0].status, 'pending');
  const t2 = later(OPEN, AUTO_DEBOUNCE_MS);
  const confirmed = derive(t, {
    now: t2, quotes: quotesFor(t, t2), pendingSignals: first.signals, armState: first.nextArmState,
  });
  assert.equal(confirmed.signals[0].status, 'confirmed');
  const gone = derive(takeAt({actualPct: 20}), {pendingSignals: first.signals, armState: first.nextArmState});
  assert.equal(gone.signals[0].status, 'expired');
  assert.equal(gone.signals[0].reason, REASONS.CONDICION_AUSENTE);
});

test('broken waits 30 min, expires if a newer review reverts, else confirms when open', () => {
  const t = takeAt({actualPct: 20});
  const pol = policy({newsTrigger: true});
  const first = derive(t, {policy: pol, latestReview: brokenReview()});
  assert.equal(first.signals[0].status, 'pending');
  assert.equal(first.signals[0].expiresAt, nextSessionClose(OPEN));
  const early = derive(t, {
    policy: pol, latestReview: brokenReview(), pendingSignals: first.signals,
    now: later(OPEN, AUTO_BROKEN_WAIT_MS - 1),
  });
  assert.equal(early.signals[0].status, 'pending');
  const reverted = derive(t, {
    policy: pol,
    pendingSignals: first.signals,
    now: later(OPEN, AUTO_BROKEN_WAIT_MS),
    latestReview: brokenReview({id: 'rev-2', newAttention: 'track', previousAttention: 'review', resolved: true}),
  });
  assert.equal(reverted.signals[0].status, 'expired');
  const ok = derive(t, {
    policy: pol, latestReview: brokenReview(), pendingSignals: first.signals,
    now: later(OPEN, AUTO_BROKEN_WAIT_MS),
  });
  assert.equal(ok.signals[0].status, 'confirmed');
});

test('stale quote and closed market reject price triggers', () => {
  const t = takeAt({actualPct: 25.6});
  const stale = derive(t, {quotes: {GGAL: quote('GGAL', t.holdings[0].price, OPEN, {stale: true})}});
  assert.equal(stale.signals.length, 0);
  assert.ok(stale.blocks.some(b => b.reason === REASONS.COTIZACION_VIEJA));
  const old = derive(t, {
    now: later(OPEN, AUTO_QUOTE_MAX_AGE_MS + 1),
    quotes: {GGAL: quote('GGAL', t.holdings[0].price, OPEN)},
  });
  assert.ok(old.blocks.some(b => b.reason === REASONS.COTIZACION_VIEJA));
  const closed = derive(t, {now: CLOSED, quotes: quotesFor(t, CLOSED)});
  assert.equal(closed.signals.filter(s => s.kind === 'cap').length, 0);
  assert.ok(closed.blocks.some(b => b.reason === REASONS.MERCADO_CERRADO));
  assert.equal(autoMarketOpen(CLOSED), false);
});

test('signature is stable and changes with epoch (UNIQUE take_id+signature)', () => {
  const a = {kind: 'cap', ticker: 'GGAL', armEpoch: 0};
  assert.equal(signalPayload(a), 'cap|GGAL|0');
  assert.equal(signalSignature(a), signalSignature({...a}));
  assert.notEqual(signalSignature(a), signalSignature({...a, armEpoch: 1}));
  assert.equal(signalPayload({kind: 'broken', armEpoch: 0, sourceReviewId: 'rev-1'}), 'broken||0|rev-1');
  const t = takeAt({actualPct: 25.6});
  const once = derive(t).signals[0].signature;
  const twice = derive(t).signals[0].signature;
  assert.equal(once, twice);
});

test('auto cap fire agrees with the live chip / viewsAgree', () => {
  const t = takeAt({actualPct: 25.6});
  const out = derive(t);
  assert.equal(out.signals[0].kind, 'cap');
  assert.equal(holdingDerived(t, t.holdings[0]).ruleChip, 'cap');
  assert.ok(viewsAgree(viewStatusSnapshot(t)));
});

test('cap sizes a sell down to target weight; 1-unit still sells if over cap', () => {
  const t = takeAt({actualPct: 26, units: 100});
  const sized = sizeCapTrade(t, 'GGAL');
  assert.equal(sized.ok, true);
  assert.equal(sized.legs[0].side, 'venta');
  assert.equal(sized.legs[0].units, t.holdings[0].units - targetUnitsFor(t, 'GGAL'));
  const tight = takeAt({actualPct: 30, units: 1, weight: 20});
  const one = sizeCapTrade(tight, 'GGAL');
  assert.equal(one.ok, true);
  assert.equal(one.legs[0].units, 1);
});

test('drift buy is clipped by cash and by post-weight ≤ min(cap, weight)', () => {
  const price = 1_000;
  const cheap = {
    id: 'take-1',
    phase: 'active',
    invested: 1_000_000,
    cash: price * 2,
    settings: {cap: 25, drift: 5, cadence: 'standard', mode: 'ask', paused: false},
    holdings: [
      {ticker: 'GGAL', name: 'GGAL', units: 10, price, weight: 20},
      {ticker: 'KO', name: 'KO', units: 80, price: 10_000, weight: 20},
    ],
  };
  const sized = sizeDriftTrade(cheap, 'GGAL');
  assert.equal(sized.ok, true, sized.reason);
  assert.equal(sized.legs[0].side, 'compra');
  assert.ok(sized.legs[0].units <= 2);
  const noCash = {
    ...cheap,
    cash: 0,
    holdings: cheap.holdings.map(h => ({...h})),
  };
  assert.equal(sizeDriftTrade(noCash, 'GGAL').reason, REASONS.SIN_EFECTIVO);
});

test('tesis rota sells floor(units/2); 1-unit is not sold; policy still pauses', () => {
  const t = takeAt({actualPct: 20, units: 5, extras: [
    {ticker: 'YPF', name: 'YPF', units: 1, price: 10_000, weight: 10, entryPrice: 10_000},
  ]});
  t.cash = 1_000_000 - 5 * t.holdings[0].price - 10_000;
  const sized = sizeBrokenBatch(t);
  assert.equal(sized.ok, true);
  assert.equal(sized.pauseAfter, 'tesis_rota');
  const ggal = sized.legs.find(l => l.ticker === 'GGAL');
  assert.equal(ggal.units, 2);
  assert.equal(sized.legs.find(l => l.ticker === 'YPF'), undefined);
  const onlyOne = takeAt({actualPct: 20, units: 1});
  const empty = sizeBrokenBatch(onlyOne);
  assert.equal(empty.ok, true);
  assert.equal(empty.legs.length, 0);
  assert.equal(empty.pauseAfter, 'tesis_rota');
});

test('guards: 2/6/50% boundaries; undo does not consume 2/6 and does count turnover', () => {
  const t = takeAt();
  const day = autoDay(OPEN);
  const two = [tradeRow({id: 'a', day}), tradeRow({id: 'b', day})];
  const third = evaluateGuards(guardCtx({take: t, recentAutoTrades: two, kind: 'cap', extraAmount: 1}));
  assert.equal(third.reason, REASONS.LIMITE_TESIS);
  const secondOk = evaluateGuards(guardCtx({take: t, recentAutoTrades: [tradeRow({day})], kind: 'cap'}));
  assert.equal(secondOk.ok, true);

  const six = Array.from({length: 6}, (_, i) => tradeRow({id: `u${i}`, takeId: `t${i}`, day}));
  const seventh = evaluateGuards(guardCtx({take: t, recentAutoTrades: six, kind: 'drift'}));
  assert.equal(seventh.reason, REASONS.LIMITE_USUARIO);
  const sixthOk = evaluateGuards(guardCtx({
    take: t, recentAutoTrades: six.slice(0, 5), kind: 'drift',
  }));
  assert.equal(sixthOk.ok, true);

  const heavy = [tradeRow({id: 'r1', day, amount: 400_000})];
  const over = evaluateGuards(guardCtx({
    take: t, recentAutoTrades: heavy, extraAmount: 150_000, takeValueAtOpen: 1_000_000, kind: 'cap',
  }));
  assert.equal(over.reason, REASONS.ROTACION_DIARIA);
  const edge = evaluateGuards(guardCtx({
    take: t, recentAutoTrades: heavy, extraAmount: 100_000, takeValueAtOpen: 1_000_000, kind: 'cap',
  }));
  assert.equal(edge.ok, true);

  const undoAtLimit = evaluateGuards(guardCtx({
    take: t, recentAutoTrades: two, kind: 'undo', extraAmount: 1, takeValueAtOpen: 1_000_000,
  }));
  assert.equal(undoAtLimit.ok, true, undoAtLimit.reason);
  const undoTurnover = evaluateGuards(guardCtx({
    take: t, recentAutoTrades: heavy, kind: 'undo', extraAmount: 150_000, takeValueAtOpen: 1_000_000,
  }));
  assert.equal(undoTurnover.reason, REASONS.ROTACION_DIARIA);
});

test('timezone day boundary is America/Argentina/Buenos_Aires', () => {
  const before = new Date('2026-10-19T02:59:00.000Z');
  const after = new Date('2026-10-19T03:00:00.000Z');
  assert.equal(dayInBuenosAires(before), '2026-10-18');
  assert.equal(dayInBuenosAires(after), '2026-10-19');
  assert.equal(autoDay(before), '2026-10-18');
  const usage = dailyUsage({
    recentAutoTrades: [tradeRow({day: '2026-10-18', kind: 'cap'})],
    takeId: 'take-1', userId: 'owner', day: '2026-10-19', takeValueAtOpen: 1_000_000,
  });
  assert.equal(usage.takeExecs, 0);
});

test('closed market, holiday, stale, demo, scenario, pause, pending order, version', () => {
  const t = takeAt();
  assert.equal(evaluateGuards(guardCtx({take: t, now: CLOSED})).reason, REASONS.MERCADO_CERRADO);
  assert.equal(evaluateGuards(guardCtx({take: t, holidays: ['2026-10-19']})).reason, REASONS.FERIADO);
  const staleQ = quotesFor(t);
  staleQ.GGAL = {...staleQ.GGAL, stale: true};
  assert.equal(evaluateGuards(guardCtx({take: t, quotes: staleQ})).reason, REASONS.COTIZACION_VIEJA);
  assert.equal(evaluateGuards(guardCtx({take: t, isDemo: true})).reason, REASONS.DEMO);
  assert.equal(evaluateGuards(guardCtx({take: {...t, scenario: 'drop'}})).reason, REASONS.ESCENARIO_NO_NORMAL);
  assert.equal(evaluateGuards(guardCtx({take: {...t, monitoringPaused: true}})).reason, REASONS.MONITOREO_PAUSADO);
  assert.equal(evaluateGuards(guardCtx({take: t, pendingManualOrder: {id: 'ord'}})).reason, REASONS.ORDEN_MANUAL_PENDIENTE);
  assert.equal(evaluateGuards(guardCtx({take: t, takeVersionAtDetect: 1})).ok, true);
  assert.equal(evaluateGuards(guardCtx({take: {...t, version: 2}, takeVersionAtDetect: 1})).reason, REASONS.VERSION_CAMBIADA);
});

test('kill-switch matrix: AI pause blocks only news; auto off / suspend block all', () => {
  const t = takeAt({actualPct: 25.6});
  const sized = sizeCapTrade(t, 'GGAL');
  for (const pauseReason of ['disabled', 'budget_day', 'budget_month']) {
    const ai = {paused: true, pauseReason};
    assert.equal(isAiPaused(ai), true);
    const cap = evaluateAuto({intent: 'execute', signal: {kind: 'cap', ticker: 'GGAL'}, ...guardCtx({take: t, ai, sized})});
    assert.equal(cap.ok, true, pauseReason);
    const broken = evaluateGuards(guardCtx({take: t, ai, kind: 'broken', signal: {kind: 'broken'}}));
    assert.equal(broken.reason, REASONS.IA_EN_PAUSA, pauseReason);
  }
  const budget = deriveBudgetState({
    enabled: true, pricesLoaded: true, monthlyCapUsd: 20, spentMonthMicro: 20_000_000,
  });
  assert.equal(budget.pauseReason, 'budget_month');
  assert.equal(evaluateGuards(guardCtx({take: t, ai: budget, kind: 'broken', signal: {kind: 'broken'}})).reason, REASONS.IA_EN_PAUSA);
  assert.equal(evaluateGuards(guardCtx({take: t, ai: budget, kind: 'cap'})).ok, true);

  const off = evaluateGuards(guardCtx({take: t, autoTrading: {enabled: false}, kind: 'cap'}));
  assert.equal(off.reason, REASONS.AUTO_GLOBAL_APAGADO);
  const tesOff = evaluateGuards(guardCtx({take: t, policy: policy({enabled: false}), kind: 'drift'}));
  assert.equal(tesOff.reason, REASONS.AUTO_TESIS_APAGADO);
  const sus = evaluateGuards(guardCtx({take: t, user: {id: 'owner', status: 'suspended'}, kind: 'cap'}));
  assert.equal(sus.reason, REASONS.USUARIO_SUSPENDIDO);
  const susUndo = evaluateUndo({
    ...guardCtx({take: t, user: {id: 'owner', status: 'suspended'}}),
    trade: {
      executedAt: OPEN, status: 'executed',
      meta: {legs: [{side: 'venta', ticker: 'GGAL', units: 2, price: t.holdings[0].price}]},
    },
  });
  assert.equal(susUndo.reason, REASONS.USUARIO_SUSPENDIDO);
});

test('canary owner-only: only the owner is eligible', () => {
  assert.equal(isCanaryEligible({userId: 'owner', ownerUserId: 'owner', canaryOwnerOnly: 1}), true);
  assert.equal(isCanaryEligible({userId: 'other', ownerUserId: 'owner', canaryOwnerOnly: 1}), false);
  const t = takeAt();
  const other = evaluateGuards(guardCtx({
    take: t, policy: policy({canaryOwnerOnly: true}),
    user: {id: 'other', status: 'active'}, ownerUserId: 'owner',
  }));
  assert.equal(other.reason, REASONS.CANARY_NO_OWNER);
  const owner = evaluateGuards(guardCtx({
    take: t, policy: policy({canaryOwnerOnly: true}),
    user: {id: 'owner', status: 'active'}, ownerUserId: 'owner',
  }));
  assert.equal(owner.ok, true);
});

test('undo is a current-price compensating trade, 72h inclusive, partial + P&L', () => {
  const origPrice = 1_200;
  const live = 1_250;
  const t = {
    id: 'take-1',
    phase: 'active',
    invested: 1_000_000,
    cash: 6 * live,
    realPricesAt: OPEN,
    scenario: 'normal',
    monitoringPaused: false,
    version: 1,
    settings: {cap: 25, drift: 5, cadence: 'standard', mode: 'ask', paused: false},
    holdings: [
      {ticker: 'GGAL', name: 'GGAL', units: 20, price: live, weight: 15, entryPrice: origPrice},
      {ticker: 'KO', name: 'KO', units: 80, price: 7_000, weight: 20, entryPrice: 7_000},
    ],
  };
  const quotes = {GGAL: quote('GGAL', live, OPEN), KO: quote('KO', 7_000, OPEN)};
  const trade = {
    id: 'tr-cap', kind: 'cap', status: 'executed', executedAt: OPEN,
    meta: {legs: [{side: 'venta', ticker: 'GGAL', units: 10, price: origPrice, amount: 12_000}]},
  };
  const preview = previewUndo({trade, take: t, quotes, now: OPEN, policy: policy()});
  assert.equal(preview.ok, true);
  assert.equal(preview.consumesLimit, false);
  assert.equal(preview.partial, true);
  assert.equal(preview.filled[0].units, 6);
  assert.equal(preview.filled[0].price, live);
  assert.equal(preview.pnl, (origPrice - live) * 6);
  assert.match(preview.line, /Recomprás 6 u\. de GGAL a /);

  const exact = later(OPEN, AUTO_UNDO_WINDOW_HOURS * 3600 * 1000);
  assert.equal(previewUndo({
    trade, take: t, quotes: quotesFor(t), now: exact, policy: policy(),
  }).ok, true);
  const late = later(OPEN, AUTO_UNDO_WINDOW_HOURS * 3600 * 1000 + 1);
  assert.equal(previewUndo({
    trade, take: t, quotes: quotesFor(t), now: late, policy: policy(),
  }).reason, REASONS.VENTANA_DESHACER_VENCIDA);

  assert.equal(previewUndo({
    trade: {...trade, status: 'reversed'}, take: t, quotes: quotesFor(t), now: OPEN, policy: policy(),
  }).reason, REASONS.YA_DESHECHO);

  t.cash = 0;
  const none = previewUndo({
    trade, take: t, quotes: {GGAL: quote('GGAL', live, OPEN)}, now: OPEN, policy: policy(),
  });
  assert.equal(none.ok, false);
  assert.equal(none.reason, REASONS.SIN_EFECTIVO);
});

test('undo of a broken batch does not reactivate; market/stale block', () => {
  const t = takeAt({actualPct: 20, units: 10});
  t.cash = 1_000_000;
  const trade = {
    kind: 'broken', status: 'executed', executedAt: OPEN,
    meta: {legs: [{side: 'venta', ticker: 'GGAL', units: 5, price: t.holdings[0].price}]},
  };
  const preview = previewUndo({trade, take: t, quotes: quotesFor(t), now: OPEN, policy: policy()});
  assert.equal(preview.reactivate, false);
  const closed = evaluateUndo({
    ...guardCtx({take: t, now: CLOSED, quotes: quotesFor(t, CLOSED)}), trade,
  });
  assert.equal(closed.reason, REASONS.MERCADO_CERRADO);
  const staleQ = quotesFor(t);
  staleQ.GGAL = {...staleQ.GGAL, stale: true};
  const stale = evaluateUndo({...guardCtx({take: t, quotes: staleQ}), trade});
  assert.equal(stale.reason, REASONS.COTIZACION_VIEJA);
});

test('undo line names every ticker on a multi-leg news trade', () => {
  const t = takeAt({
    ticker: 'YPF', actualPct: 18, units: 10, extras: [
      {ticker: 'GGAL', name: 'GGAL', units: 20, price: 6500, weight: 15, entryPrice: 6500},
    ],
  });
  t.cash = 500_000;
  const quotes = {
    YPF: quote('YPF', t.holdings[0].price, OPEN),
    GGAL: quote('GGAL', 6500, OPEN),
  };
  const trade = {
    kind: 'broken', status: 'executed', executedAt: OPEN,
    meta: {
      legs: [
        {side: 'venta', ticker: 'YPF', units: 5, price: t.holdings[0].price},
        {side: 'venta', ticker: 'GGAL', units: 8, price: 6500},
      ],
    },
  };
  const preview = previewUndo({trade, take: t, quotes, now: OPEN, policy: policy()});
  assert.equal(preview.ok, true, preview.reason);
  assert.match(preview.line, /u\. de YPF a /);
  assert.match(preview.line, /u\. de GGAL a /);
  assert.equal(preview.filled.length, 2);
});

test('evaluateAuto execute sizes + gates a cap sell', () => {
  const t = takeAt({actualPct: 26});
  const out = evaluateAuto({
    intent: 'execute',
    signal: {kind: 'cap', ticker: 'GGAL'},
    ...guardCtx({take: t}),
  });
  assert.equal(out.ok, true);
  assert.equal(out.sized.legs[0].side, 'venta');
  assert.equal(out.consumesLimit, true);
  assert.ok(out.sized.amount > 0);
});

test('H_IN / H_OUT constants match the plan', () => {
  assert.equal(H_IN, 0.5);
  assert.equal(H_OUT, 1.0);
  assert.equal(value(takeAt({actualPct: 20})), 1_000_000);
});

test('4h cooldown after an execution of the same tesis/tipo/ticker', () => {
  const t = takeAt({actualPct: 25.6});
  const blocked = derive(t, {
    recentAutoTrades: [tradeRow({kind: 'cap', ticker: 'GGAL', executedAt: later(OPEN, -60_000), meta: {ticker: 'GGAL'}})],
  });
  assert.equal(blocked.signals.length, 0);
  assert.ok(blocked.blocks.some(b => b.reason === REASONS.COOLDOWN));
  const cooled = derive(t, {
    now: later(OPEN, 4 * 60 * 60 * 1000),
    quotes: quotesFor(t, later(OPEN, 4 * 60 * 60 * 1000)),
    recentAutoTrades: [tradeRow({kind: 'cap', executedAt: OPEN, meta: {ticker: 'GGAL'}})],
  });
  assert.equal(cooled.signals[0].status, 'pending');
});

test('FEATURE_AUTO_SIM off and missing simulated block execution', () => {
  const t = takeAt({actualPct: 26});
  assert.equal(evaluateGuards(guardCtx({take: t, featureAutoSim: false})).reason, REASONS.AUTO_FEATURE_APAGADO);
  assert.equal(evaluateGuards(guardCtx({take: t, policy: policy({simulated: 'no'})})).reason, REASONS.SIMULACION_REQUERIDA);
});
