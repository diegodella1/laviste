/** Quote lookup and freshness for Automático. No I/O — quotes are passed in. */

import {classifyQuote} from '../quote-eligibility.mjs';
import {money} from '../engine.mjs';
import {AUTO_QUOTE_MAX_AGE_MS} from './constants.mjs';
import {REASONS} from './reasons.mjs';

export function toMs(now) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === 'number' && Number.isFinite(now)) return now;
  const parsed = Date.parse(now);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function toIso(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string' && Number.isFinite(Date.parse(now))) return new Date(now).toISOString();
  return new Date(toMs(now)).toISOString();
}

/** Accept a Map, `{getCached}`, a ticker-keyed object, or an array of quotes. */
export function quoteOf(quotes, ticker) {
  if (!quotes || !ticker) return null;
  if (typeof quotes.getCached === 'function') return quotes.getCached(ticker) || null;
  if (typeof quotes.get === 'function') return quotes.get(ticker) || null;
  if (Array.isArray(quotes)) return quotes.find(q => q && q.ticker === ticker) || null;
  return quotes[ticker] || null;
}

export function applyQuotesToTake(take, quotes) {
  return {
    ...take,
    holdings: (take?.holdings || []).map(h => {
      const q = quoteOf(quotes, h.ticker);
      if (q && q.price > 0) return {...h, price: q.price};
      return {...h};
    }),
  };
}

export function quoteFreshness(q, now, {maxAgeMs = AUTO_QUOTE_MAX_AGE_MS} = {}) {
  if (!q) return {ok: false, reason: REASONS.COTIZACION_FALTANTE};
  const classified = classifyQuote(q);
  if (!classified.eligible) return {ok: false, reason: REASONS.COTIZACION_NO_ELEGIBLE};
  if (q.stale || classified.stale) return {ok: false, reason: REASONS.COTIZACION_VIEJA};
  if (!q.asOf) return {ok: false, reason: REASONS.COTIZACION_VIEJA};
  const age = toMs(now) - Date.parse(q.asOf);
  if (!Number.isFinite(age) || age > maxAgeMs) return {ok: false, reason: REASONS.COTIZACION_VIEJA};
  return {ok: true, reason: null, quote: q, classified};
}

export function quoteSynced(holding, quote) {
  if (!holding || !quote || !(quote.price > 0)) return false;
  return money(holding.price) === money(quote.price);
}

export function checkHoldingQuote(holding, quotes, now, {requireSync = false} = {}) {
  const q = quoteOf(quotes, holding?.ticker);
  const fresh = quoteFreshness(q, now);
  if (!fresh.ok) return fresh;
  if (requireSync && !quoteSynced(holding, q)) {
    return {ok: false, reason: REASONS.PRECIO_NO_SINCRONIZADO};
  }
  return fresh;
}

export function checkTickersQuotes(tickers, quotes, now, {holdings = [], requireSync = false} = {}) {
  const reasons = [];
  for (const ticker of tickers) {
    const holding = holdings.find(h => h.ticker === ticker) || {ticker};
    const checked = checkHoldingQuote(holding, quotes, now, {requireSync});
    if (!checked.ok && !reasons.includes(checked.reason)) reasons.push(checked.reason);
  }
  return {ok: reasons.length === 0, reason: reasons[0] || null, reasons};
}
