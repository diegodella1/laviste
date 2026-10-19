/**
 * AU2 facade: pure Automático decisions. No store, no fetch, no broker.
 */

export {SIMULATED_ONLY, simulatedBit} from './sim-only.mjs';
export {
  AUTO_NEWS_TRIGGER_DEFAULT, AUTO_MAX_TRADES_DAY, AUTO_MAX_TURNOVER_PCT,
  AUTO_MAX_TRADES_DAY_USER, AUTO_BROKEN_ACTION, AUTO_UNDO_AT,
  AUTO_UNDO_WINDOW_HOURS, AUTO_CANARY_OWNER_ONLY_DEFAULT,
  AUTO_H_IN_PP, AUTO_H_OUT_PP, AUTO_DEBOUNCE_MS, AUTO_BROKEN_WAIT_MS,
  AUTO_COOLDOWN_MS, AUTO_QUOTE_MAX_AGE_MS,
} from './constants.mjs';
export {REASONS, blocked, allowed} from './reasons.mjs';
export {
  quoteOf, applyQuotesToTake, quoteFreshness, checkHoldingQuote, checkTickersQuotes, toMs, toIso,
} from './quotes.mjs';
export {
  deriveSignals, signalSignature, signalPayload, armKey, readArm,
  capEnters, capRearms, driftEnters, driftRearms,
  nextSessionClose, autoMarketOpen, isHoliday, H_IN, H_OUT,
} from './signals.mjs';
export {
  sizeSignal, sizeCapTrade, sizeDriftTrade, sizeBrokenBatch,
  tryPreviewTrade, targetUnitsFor, actualAfterUnits,
} from './sizing.mjs';
export {
  evaluateGuards, dailyUsage, autoDay, isCanaryEligible, resolveAiState,
  MAX_TRADES_DAY, MAX_TURNOVER_PCT, MAX_TRADES_DAY_USER,
} from './guards.mjs';
export {previewUndo, evaluateUndo, undoWindowOpen, undoWindowMs} from './undo.mjs';

import {deriveSignals} from './signals.mjs';
import {sizeSignal} from './sizing.mjs';
import {evaluateGuards} from './guards.mjs';
import {evaluateUndo} from './undo.mjs';

/**
 * One decision for AU3: derive signals, size+gate an execution, or preview an undo.
 * Inputs are plain objects. Every block carries an explicit reason code.
 */
export function evaluateAuto({intent = 'derive', signal, trade, ...input} = {}) {
  if (intent === 'undo') return evaluateUndo({...input, trade});
  if (intent === 'derive') return deriveSignals(input.take, input);

  const sized = sizeSignal(input.take, signal);
  const guards = evaluateGuards({
    ...input,
    kind: signal?.kind || sized.kind,
    signal,
    sized: sized.ok ? sized : sized,
  });
  if (!guards.ok) {
    return {
      ok: false,
      reason: guards.reason,
      reasons: guards.reasons,
      sized,
      consumesLimit: sized.consumesLimit !== false,
      pauseAfter: sized.pauseAfter || null,
    };
  }
  if (!sized.ok) {
    return {
      ok: false,
      reason: sized.reason,
      reasons: sized.reasons || [sized.reason],
      sized,
      consumesLimit: false,
      pauseAfter: sized.pauseAfter || null,
    };
  }
  return {
    ok: true,
    reason: null,
    reasons: [],
    sized,
    consumesLimit: sized.consumesLimit !== false,
    pauseAfter: sized.pauseAfter || null,
    day: guards.day,
    usage: guards.usage,
  };
}

export const INTENTS = Object.freeze({
  derive: 'derive',
  execute: 'execute',
  undo: 'undo',
});
