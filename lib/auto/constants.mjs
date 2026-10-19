/** Simulated-only Automático v1 policy defaults (Diego, 2026-10-19). Changing them needs a migration. */

export const AUTO_NEWS_TRIGGER_DEFAULT = 0;
export const AUTO_MAX_TRADES_DAY = 2;
export const AUTO_MAX_TURNOVER_PCT = 50;
export const AUTO_MAX_TRADES_DAY_USER = 6;
export const AUTO_BROKEN_ACTION = 'reduce_half_then_pause';
export const AUTO_UNDO_AT = 'current_price';
export const AUTO_UNDO_WINDOW_HOURS = 72;
export const AUTO_CANARY_OWNER_ONLY_DEFAULT = 1;

/** Hysteresis (percentage points) and timing. Price entry is cap/drift + H_IN. */
export const AUTO_H_IN_PP = 0.5;
export const AUTO_H_OUT_PP = 1.0;
export const AUTO_DEBOUNCE_MS = 15 * 60 * 1000;
export const AUTO_BROKEN_WAIT_MS = 30 * 60 * 1000;
export const AUTO_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const AUTO_QUOTE_MAX_AGE_MS = 30 * 60 * 1000;
