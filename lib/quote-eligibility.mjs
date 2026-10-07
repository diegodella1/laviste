/** Quote class and eligibility for accounting ops. Never invent a delayed price. */

import {money} from './engine.mjs';

export const DELAYED_QUOTE_PROVIDERS = new Set(['data912', 'yahoo', 'fixture']);

export const QUOTE_CLASSES = Object.freeze({
  delayed: 'delayed',
  catalog: 'catalog',
  demo: 'demo',
  missing: 'missing',
  unknown: 'unknown',
});

function baseMissing() {
  return {quoteClass: QUOTE_CLASSES.missing, eligible: false, price: null, asOf: null, provider: null, stale: false};
}

/** Classify a cached quote. Missing/demo/catalog are never eligible for "real delayed" accounting. */
export function classifyQuote(q) {
  if (!q || !(q.price > 0)) return baseMissing();
  if (q.provider === 'demo' || q.sample === true) {
    return {quoteClass: QUOTE_CLASSES.demo, eligible: false, price: q.price, asOf: q.asOf || null, provider: 'demo', stale: !!q.stale};
  }
  if (q.provider === 'catalog') {
    return {quoteClass: QUOTE_CLASSES.catalog, eligible: false, price: q.price, asOf: q.asOf || null, provider: 'catalog', stale: false};
  }
  if (DELAYED_QUOTE_PROVIDERS.has(q.provider)) {
    return {
      quoteClass: QUOTE_CLASSES.delayed,
      eligible: true,
      price: q.price,
      asOf: q.asOf || null,
      provider: q.provider,
      stale: !!q.stale,
    };
  }
  return {
    quoteClass: QUOTE_CLASSES.unknown,
    eligible: false,
    price: q.price,
    asOf: q.asOf || null,
    provider: q.provider || null,
    stale: !!q.stale,
  };
}

/**
 * Snapshot the quote that was actually used for an op price.
 * A delayed cache row is attached only when its price matches the used price.
 * Otherwise the used price is recorded as catalog — never relabeled as delayed.
 */
export function snapshotUsedPrice(quotes, ticker, usedPrice) {
  const used = money(usedPrice);
  if (!(used > 0)) return baseMissing();
  const classified = classifyQuote(quotes?.getCached?.(ticker) || null);
  if (classified.quoteClass === QUOTE_CLASSES.missing) {
    return {quoteClass: QUOTE_CLASSES.catalog, eligible: false, price: used, asOf: null, provider: 'catalog', stale: false};
  }
  if (money(classified.price) === used) return {...classified, price: used};
  return {quoteClass: QUOTE_CLASSES.catalog, eligible: false, price: used, asOf: null, provider: 'catalog', stale: false};
}

export function withEligibility(quote) {
  if (!quote) return {available: false, ...baseMissing()};
  const classified = classifyQuote(quote);
  return {...quote, ...classified, available: classified.quoteClass !== QUOTE_CLASSES.missing};
}
