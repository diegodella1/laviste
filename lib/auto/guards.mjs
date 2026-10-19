/**
 * Execution guards: cash/cap/units, market, quotes, limits, kill switch, canary.
 * Pure — callers pass policy, trades, AI/budget state and a clock.
 */

import {isAiPaused, deriveBudgetState} from '../budget.mjs';
import {dayInBuenosAires} from '../usage.mjs';
import {value} from '../engine.mjs';
import {SIMULATED_ONLY} from './sim-only.mjs';
import {
  AUTO_MAX_TRADES_DAY, AUTO_MAX_TURNOVER_PCT, AUTO_MAX_TRADES_DAY_USER,
  AUTO_CANARY_OWNER_ONLY_DEFAULT,
} from './constants.mjs';
import {REASONS, allowed, blocked} from './reasons.mjs';
import {checkTickersQuotes} from './quotes.mjs';
import {autoMarketOpen, isHoliday} from './signals.mjs';

export const MAX_TRADES_DAY = AUTO_MAX_TRADES_DAY;
export const MAX_TURNOVER_PCT = AUTO_MAX_TURNOVER_PCT;
export const MAX_TRADES_DAY_USER = AUTO_MAX_TRADES_DAY_USER;

export function autoDay(now) {
  return dayInBuenosAires(now);
}

export function truthy(value) {
  return value === true || value === 1 || value === '1';
}

export function resolveAiState(ai) {
  if (!ai) return {paused: false, pauseReason: null};
  if (typeof ai.paused === 'boolean') {
    return {paused: ai.paused, pauseReason: ai.pauseReason || null};
  }
  return deriveBudgetState(ai);
}

export function isCanaryEligible({
  userId, ownerUserId, canaryOwnerOnly = AUTO_CANARY_OWNER_ONLY_DEFAULT, allowUserIds,
} = {}) {
  const ownerOnly = canaryOwnerOnly !== false && canaryOwnerOnly !== 0;
  if (!ownerOnly) {
    if (Array.isArray(allowUserIds) && allowUserIds.length) return allowUserIds.includes(userId);
    return true;
  }
  if (userId == null && ownerUserId == null) return true;
  return !!userId && userId === ownerUserId;
}

function isUndo(kind) {
  return kind === 'undo';
}

function countsTowardTradeLimit(kind) {
  return kind === 'cap' || kind === 'drift' || kind === 'broken';
}

function tradeAmount(trade) {
  const n = Number(trade?.amount);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function sameDay(trade, day) {
  return trade?.day === day;
}

export function dailyUsage({
  recentAutoTrades = [], takeId, userId, day, takeValueAtOpen, extraAmount = 0,
} = {}) {
  const dayTrades = (recentAutoTrades || []).filter(t => sameDay(t, day));
  const takeTrades = dayTrades.filter(t => !takeId || t.takeId === takeId);
  const userTrades = dayTrades.filter(t => !userId || t.userId === userId);
  const takeExecs = takeTrades.filter(t => countsTowardTradeLimit(t.kind)).length;
  const userExecs = userTrades.filter(t => countsTowardTradeLimit(t.kind)).length;
  const turnoverAbs = takeTrades.reduce((s, t) => s + tradeAmount(t), 0) + Math.abs(extraAmount || 0);
  const open = takeValueAtOpen
    || takeTrades[0]?.meta?.takeValueAtOpen
    || takeTrades[0]?.takeValueAtOpen
    || 0;
  const turnoverPct = open > 0 ? (turnoverAbs / open) * 100 : 0;
  return {
    day,
    takeExecs,
    userExecs,
    turnoverAbs,
    turnoverPct,
    openValue: open,
  };
}

function policyEnabled(policy) {
  return policy?.enabled !== false && policy?.enabled !== 0;
}

function simulatedOk(policy) {
  if (SIMULATED_ONLY.value !== true) return false;
  if (policy && policy.simulated !== true && policy.simulated !== 1 && policy.simulated != null) {
    return false;
  }
  return true;
}

function tickersFor(signal, sized, take) {
  if (sized?.legs?.length) return [...new Set(sized.legs.map(l => l.ticker))];
  if (signal?.ticker) return [signal.ticker];
  if (signal?.kind === 'broken') return (take?.holdings || []).map(h => h.ticker);
  return [];
}

/**
 * Evaluate every execution guard. Returns explicit reason codes (first + all).
 * `kind` is the signal/trade kind (`cap`|`drift`|`broken`|`undo`).
 */
export function evaluateGuards({
  take, policy, quotes, recentAutoTrades = [], now = new Date(),
  ai, user, ownerUserId, autoTrading, featureAutoSim,
  pendingManualOrder, takeVersionAtDetect, holidays, isDemo, kind = 'cap',
  sized, signal, extraAmount = 0, takeValueAtOpen,
} = {}) {
  const reasons = [];
  const push = reason => {
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  };

  if (!simulatedOk(policy)) push(REASONS.SIMULACION_REQUERIDA);
  if (featureAutoSim === false || featureAutoSim === 0 || featureAutoSim === '0') {
    push(REASONS.AUTO_FEATURE_APAGADO);
  }
  if (user?.status && user.status !== 'active') push(REASONS.USUARIO_SUSPENDIDO);
  if (!isCanaryEligible({
    userId: user?.id || policy?.userId,
    ownerUserId,
    canaryOwnerOnly: policy?.canaryOwnerOnly,
    allowUserIds: autoTrading?.allowUserIds,
  })) {
    push(REASONS.CANARY_NO_OWNER);
  }
  if (autoTrading && autoTrading.enabled === false) push(REASONS.AUTO_GLOBAL_APAGADO);
  if (policy && !policyEnabled(policy)) push(REASONS.AUTO_TESIS_APAGADO);
  if (policy?.pausedReason === 'tesis_rota' && !isUndo(kind)) push(REASONS.TESIS_ROTA);

  if (take) {
    if (take.phase && take.phase !== 'active') push(REASONS.FASE_INACTIVA);
    if (take.monitoringPaused) push(REASONS.MONITOREO_PAUSADO);
    if (take.scenario && take.scenario !== 'normal') push(REASONS.ESCENARIO_NO_NORMAL);
    if (!take.realPricesAt) push(REASONS.SIN_PRECIOS_REALES);
  }
  const demo = isDemo === true || quotes?.isDemo === true || (typeof quotes?.isDemo === 'function' && quotes.isDemo());
  if (demo) push(REASONS.DEMO);

  if (isHoliday(now, holidays)) push(REASONS.FERIADO);
  else if (!autoMarketOpen(now, {holidays})) push(REASONS.MERCADO_CERRADO);

  const tickers = tickersFor(signal, sized, take);
  if (tickers.length) {
    const q = checkTickersQuotes(tickers, quotes, now, {
      holdings: take?.holdings || [],
      requireSync: true,
    });
    for (const reason of q.reasons) push(reason);
  }

  const aiState = resolveAiState(ai);
  if (isAiPaused(aiState) && kind === 'broken') push(REASONS.IA_EN_PAUSA);

  if (pendingManualOrder) push(REASONS.ORDEN_MANUAL_PENDIENTE);
  if (takeVersionAtDetect != null && take?.version != null && take.version !== takeVersionAtDetect) {
    push(REASONS.VERSION_CAMBIADA);
  }

  const day = autoDay(now);
  const extraIsUndo = isUndo(kind);
  const proposed = extraAmount || sized?.amount || 0;
  const usage = dailyUsage({
    recentAutoTrades, takeId: take?.id || policy?.takeId, userId: user?.id || policy?.userId,
    day, takeValueAtOpen: takeValueAtOpen || value(take || {cash: 0, holdings: []}),
    extraAmount: proposed,
  });
  const takeLimit = policy?.maxTradesDay ?? MAX_TRADES_DAY;
  const userLimit = policy?.maxTradesDayUser ?? MAX_TRADES_DAY_USER;
  const turnoverLimit = policy?.maxTurnoverPct ?? MAX_TURNOVER_PCT;
  const takeExecs = usage.takeExecs + (extraIsUndo || !countsTowardTradeLimit(kind) ? 0 : 1);
  const userExecs = usage.userExecs + (extraIsUndo || !countsTowardTradeLimit(kind) ? 0 : 1);
  if (countsTowardTradeLimit(kind) && takeExecs > takeLimit) push(REASONS.LIMITE_TESIS);
  if (countsTowardTradeLimit(kind) && userExecs > userLimit) push(REASONS.LIMITE_USUARIO);
  if (usage.openValue > 0 && usage.turnoverPct > turnoverLimit) push(REASONS.ROTACION_DIARIA);

  if (sized && sized.ok === false && sized.reason) push(sized.reason);

  if (!reasons.length) {
    return allowed({day, usage, ai: aiState});
  }
  return blocked(reasons[0], {reasons, day, usage, ai: aiState});
}
