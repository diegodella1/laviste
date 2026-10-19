/** Global AI kill switch + spend cap (Fase 2 / PR 2C). Day/month are America/Buenos_Aires. */

import {
  AI_PAUSED_BUDGET_ADMIN, AI_PAUSED_DISABLED_ADMIN, AI_PAUSED_USER,
} from './copy.mjs';
import {TOKEN_RESERVE_UNITS} from './quota.mjs';
import {
  dayInBuenosAires, estimateCostMicro, priceForModel, USAGE_TIMEZONE,
} from './usage.mjs';

export const DEFAULT_MONTHLY_CAP_USD = 20;
export const BUDGET_ALERT_RATIO = 0.8;
export const USD_MICRO = 1_000_000;
export const CAP_USD_MAX = 1_000_000;

const PAUSE_CODES = Object.freeze({
  disabled: 'ai_paused',
  budget_month: 'ai_paused',
  budget_day: 'ai_paused',
});

export function usdToMicro(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * USD_MICRO);
}

export function microToUsd(micro) {
  return (Number(micro) || 0) / USD_MICRO;
}

export function formatUsd(usd) {
  return `USD ${Number(usd || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

export function monthInBuenosAires(now = new Date()) {
  return dayInBuenosAires(now).slice(0, 7);
}

export function monthRange(month) {
  const [year, mon] = String(month).split('-').map(Number);
  const start = `${month}-01`;
  const nextMonth = mon === 12 ? 1 : mon + 1;
  const nextYear = mon === 12 ? year + 1 : year;
  const endExclusive = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
  return {start, endExclusive};
}

export function pricesAreLoaded(prices) {
  for (const row of Object.values(prices?.models || {})) {
    if (positiveRate(row?.promptUsdPerMTok) || positiveRate(row?.completionUsdPerMTok)) return true;
  }
  return false;
}

function positiveRate(value) {
  if (value == null || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function defaultTokenUnits(kind) {
  if (kind === 'news' || kind === 'research' || kind === 'review') return TOKEN_RESERVE_UNITS * 2;
  return TOKEN_RESERVE_UNITS;
}

export function estimateCallCostMicro({kind, model, prices, tokenUnits} = {}) {
  const tokens = Number.isFinite(tokenUnits) ? tokenUnits : defaultTokenUnits(kind);
  return estimateCostMicro(0, tokens, priceForModel(prices, model));
}

function parseCap(value, {optional = false} = {}) {
  if (value == null || value === '') {
    if (optional) return null;
    throw Object.assign(new Error('Tope inválido.'), {status: 400});
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > CAP_USD_MAX) {
    throw Object.assign(new Error('Tope inválido.'), {status: 400});
  }
  return n;
}

export function defaultAiControl() {
  return {
    enabled: true,
    monthlyCapUsd: DEFAULT_MONTHLY_CAP_USD,
    dailyCapUsd: null,
    alertMonth: null,
    alertMonth80: false,
    alertDay: null,
    alertDay80: false,
    updatedAt: null,
    updatedBy: null,
  };
}

export function normalizeAiControl(input = {}, {partial = false} = {}) {
  const base = defaultAiControl();
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const hasEnabled = Object.prototype.hasOwnProperty.call(src, 'enabled');
  const hasMonthly = Object.prototype.hasOwnProperty.call(src, 'monthlyCapUsd')
    || Object.prototype.hasOwnProperty.call(src, 'monthly_cap_usd');
  const hasDaily = Object.prototype.hasOwnProperty.call(src, 'dailyCapUsd')
    || Object.prototype.hasOwnProperty.call(src, 'daily_cap_usd');
  const parsed = {
    enabled: hasEnabled
      ? src.enabled !== false && src.enabled !== 0 && src.enabled !== '0'
      : undefined,
    monthlyCapUsd: hasMonthly ? parseCap(src.monthlyCapUsd ?? src.monthly_cap_usd) : undefined,
    dailyCapUsd: hasDaily ? parseCap(src.dailyCapUsd ?? src.daily_cap_usd, {optional: true}) : undefined,
  };
  if (partial) return parsed;
  return {
    enabled: parsed.enabled ?? base.enabled,
    monthlyCapUsd: parsed.monthlyCapUsd ?? base.monthlyCapUsd,
    dailyCapUsd: hasDaily ? parsed.dailyCapUsd : base.dailyCapUsd,
  };
}

function ratioAtLeast(spentMicro, capMicro, ratio) {
  if (!capMicro) return spentMicro > 0;
  return spentMicro * 1000 >= capMicro * Math.round(ratio * 1000);
}

function overCap(spentMicro, estimateMicro, capMicro) {
  if (capMicro == null) return false;
  const spent = Number(spentMicro) || 0;
  const estimate = Math.max(0, Number(estimateMicro) || 0);
  return spent >= capMicro || spent + estimate > capMicro;
}

export function deriveBudgetState({
  enabled = true,
  monthlyCapUsd = DEFAULT_MONTHLY_CAP_USD,
  dailyCapUsd = null,
  spentMonthMicro = 0,
  spentDayMicro = 0,
  pricesLoaded = false,
  estimateMicro = 0,
  now = new Date(),
} = {}) {
  const day = dayInBuenosAires(now);
  const month = monthInBuenosAires(now);
  const monthCapMicro = usdToMicro(monthlyCapUsd);
  const dayCapMicro = dailyCapUsd == null || dailyCapUsd === '' ? null : usdToMicro(dailyCapUsd);
  const measurable = !!pricesLoaded;
  const estimate = measurable ? Math.max(0, Number(estimateMicro) || 0) : 0;
  const monthRatio = monthCapMicro > 0 ? spentMonthMicro / monthCapMicro : 0;
  const dayRatio = dayCapMicro > 0 ? spentDayMicro / dayCapMicro : 0;
  let pauseReason = null;
  if (!enabled) pauseReason = 'disabled';
  else if (measurable) {
    if (overCap(spentDayMicro, estimate, dayCapMicro)) pauseReason = 'budget_day';
    if (overCap(spentMonthMicro, estimate, monthCapMicro)) pauseReason = 'budget_month';
  }
  const alert80Month = measurable && ratioAtLeast(spentMonthMicro, monthCapMicro, BUDGET_ALERT_RATIO);
  const alert80Day = measurable && dayCapMicro != null && ratioAtLeast(spentDayMicro, dayCapMicro, BUDGET_ALERT_RATIO);
  return {
    timezone: USAGE_TIMEZONE,
    day,
    month,
    enabled: !!enabled,
    paused: !!pauseReason,
    pauseReason,
    code: pauseReason ? PAUSE_CODES[pauseReason] : null,
    pricesLoaded: measurable,
    budgetMeasurable: measurable,
    monthlyCapUsd,
    dailyCapUsd: dailyCapUsd == null ? null : dailyCapUsd,
    monthCapMicro,
    dayCapMicro,
    spentMonthMicro,
    spentDayMicro,
    spentMonthUsd: microToUsd(spentMonthMicro),
    spentDayUsd: microToUsd(spentDayMicro),
    estimateMicro: estimate,
    monthRatio,
    dayRatio,
    alert80Month,
    alert80Day,
    alert80: alert80Month || alert80Day,
  };
}

export function pauseError(state) {
  const reason = state?.pauseReason;
  let message = AI_PAUSED_DISABLED_ADMIN;
  if (reason === 'budget_day') {
    message = `${AI_PAUSED_BUDGET_ADMIN} Tope diario ${formatUsd(state.dailyCapUsd)} · gastado ${formatUsd(state.spentDayUsd)}.`;
  } else if (reason === 'budget_month') {
    message = `${AI_PAUSED_BUDGET_ADMIN} Tope mensual ${formatUsd(state.monthlyCapUsd)} · gastado ${formatUsd(state.spentMonthUsd)}.`;
  }
  return Object.assign(new Error(message), {
    status: 503,
    code: 'ai_paused',
    reason,
  });
}

export function publicAiState(state, {superadmin = false} = {}) {
  const paused = !!state?.paused;
  const base = {paused, code: paused ? 'ai_paused' : null};
  if (!superadmin) return base;
  return {
    ...base,
    enabled: !!state.enabled,
    pauseReason: state.pauseReason || null,
    pricesLoaded: !!state.pricesLoaded,
    warningPrices: !state.pricesLoaded,
    monthlyCapUsd: state.monthlyCapUsd,
    dailyCapUsd: state.dailyCapUsd,
    spentMonthUsd: state.spentMonthUsd,
    spentDayUsd: state.spentDayUsd,
    monthRatio: state.monthRatio,
    dayRatio: state.dayRatio,
    alert80: !!state.alert80,
    timezone: state.timezone,
    month: state.month,
    day: state.day,
  };
}

export function adminBudgetPayload(state) {
  return {
    ...publicAiState(state, {superadmin: true}),
    spentMonthMicro: state.spentMonthMicro,
    spentDayMicro: state.spentDayMicro,
    monthCapMicro: state.monthCapMicro,
    dayCapMicro: state.dayCapMicro,
    userCopy: AI_PAUSED_USER,
  };
}

export async function withAiGate(api, opts, fn) {
  const handle = api.beginAiGate(opts);
  try {
    const result = await fn();
    api.commitAiGate(handle);
    api.syncBudgetAlerts();
    return result;
  } catch (error) {
    api.rollbackAiGate(handle);
    throw error;
  }
}

/** Future Automático mode: pause flag without throwing. */
export function isAiPaused(state) {
  return !!state?.paused;
}
