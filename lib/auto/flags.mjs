/**
 * Dark-launch gates for simulated Automático.
 * Off unless FEATURE_AUTO_SIM is on AND settings.autoTrading.enabled is true.
 * Canary: allowUserIds must include the user (empty list → nobody).
 */

import {autoSimEnabled} from '../features.mjs';
import {adminOf} from '../store-access.mjs';

export function defaultAutoTrading() {
  return {enabled: false, allowUserIds: [], marketHolidays: []};
}

function settingsHost(store) {
  if (typeof store?.setting === 'function') return store;
  return adminOf(store);
}

export function readAutoTrading(store) {
  const raw = settingsHost(store).setting?.('autoTrading');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultAutoTrading();
  const allow = Array.isArray(raw.allowUserIds) ? raw.allowUserIds.filter(Boolean) : [];
  const holidays = Array.isArray(raw.marketHolidays) ? raw.marketHolidays.map(String) : [];
  return {
    enabled: raw.enabled === true,
    allowUserIds: allow,
    marketHolidays: holidays,
  };
}

/** Runner + HTTP: both flags and the canary allowlist. */
export function autoAllowedForUser(store, userId, env = process.env) {
  if (!autoSimEnabled(env)) return false;
  if (!userId) return false;
  const settings = readAutoTrading(store);
  if (!settings.enabled) return false;
  return settings.allowUserIds.includes(userId);
}

export function autoFeatureOn(store, env = process.env) {
  return autoSimEnabled(env) && readAutoTrading(store).enabled === true;
}
