/**
 * Compute enriched email data from available sources.
 * Returns only defensible, evidence-backed metrics.
 */

import {value} from './engine.mjs';
import {holdingDerived} from './portfolio.mjs';

/**
 * Compute portfolio day return from current and invested values.
 * @param {number} currentValue - Current portfolio value
 * @param {number} invested - Total invested capital
 * @returns {number|null} - Day return as fraction, or null if unavailable
 */
export function computePortfolioDayReturn(currentValue, invested) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(invested) || invested === 0) {
    return null;
  }
  return (currentValue - invested) / invested;
}

/**
 * Build digest enriched data from user takes.
 * @param {object} opts
 * @param {array} opts.takes - Array of user takes
 * @param {object} opts.quotes - Quotes API
 * @returns {object|null} - Enriched data or null if insufficient data
 */
export function buildDigestEnrichedData({takes = [], quotes = null} = {}) {
  const activeTakes = takes.filter(t => t?.phase === 'active');
  if (activeTakes.length === 0) {
    return null;
  }
  
  // Compute aggregate portfolio day return
  let totalCurrentValue = 0;
  let totalInvested = 0;
  
  for (const take of activeTakes) {
    const val = value(take);
    if (Number.isFinite(val) && Number.isFinite(take.invested)) {
      totalCurrentValue += val;
      totalInvested += take.invested;
    }
  }
  
  const portfolioDayPct = computePortfolioDayReturn(totalCurrentValue, totalInvested);
  
  // Extract thesis names and compute thesis-level returns
  // Note: Thesis-level returns require thesis-scoped value aggregation
  // Currently, each take represents one thesis, so we can approximate
  const theses = [];
  for (const take of activeTakes) {
    if (!take.title) continue;
    
    const takeValue = value(take);
    const takeInvested = take.invested;
    
    if (!Number.isFinite(takeValue) || !Number.isFinite(takeInvested) || takeInvested === 0) {
      continue;
    }
    
    const thesisDayPct = (takeValue - takeInvested) / takeInvested;
    
    // Contribution to portfolio = (thesis value change) / (total portfolio invested)
    const contributionPct = totalInvested > 0
      ? ((takeValue - takeInvested) / totalInvested)
      : 0;
    
    theses.push({
      name: take.title,
      dayPct: thesisDayPct,
      contributionPct,
    });
  }
  
  // No auto actions or alerts fired data available at this level
  // Those come from separate systems and should be passed in
  
  return {
    portfolio: {
      dayPct: portfolioDayPct,
      weekPct: null, // Week return requires historical marks (not yet implemented)
    },
    theses,
    takeaway: null, // Takeaway requires AI/analysis (not implemented)
    autoActions: [], // Populated separately by auto runner
    alertsFired: [], // Populated separately by threshold checks
    tip: 'Un activo puede subir mucho y mover poco la cartera si su peso es chico. Por eso mostramos el % del día y cuánto aportó cada tesis.',
    newsItems: [],
  };
}

/**
 * Build trade alert enriched data from trade execution context.
 * @param {object} opts
 * @param {object} opts.take - Take object
 * @param {object} opts.signal - Auto signal
 * @param {object} opts.sized - Sized trade (with legs)
 * @param {number} opts.takeValueBefore - Portfolio value before trade
 * @param {number} opts.takeValueAfter - Portfolio value after trade
 * @param {object} opts.quotes - Quotes API
 * @returns {object} - Enriched trade data
 */
export function buildTradeEnrichedData({
  take,
  signal,
  sized,
  takeValueBefore,
  takeValueAfter,
  quotes = null,
} = {}) {
  const ticker = signal?.ticker || null;
  const legs = sized?.legs || [];
  const side = legs[0]?.side || null;
  const thesisName = take?.title || 'Tesis';
  
  // Compute weight before/after if holding exists
  let weightBeforePct = null;
  let weightAfterPct = null;
  let weightDeltaPct = null;
  
  if (ticker && take?.holdings) {
    const holdingBefore = take.holdings.find(h => h.ticker === ticker);
    if (holdingBefore && Number.isFinite(takeValueBefore) && takeValueBefore > 0) {
      const derived = holdingDerived(take, holdingBefore);
      weightBeforePct = derived.actual;
    }
    
    // Weight after requires post-trade take state (not available here)
    // We can approximate from legs if available
    if (legs.length > 0 && weightBeforePct !== null) {
      const leg = legs[0];
      if (leg.side === 'compra') {
        const deltaValue = leg.units * leg.price;
        weightAfterPct = (holdingBefore.units * holdingBefore.price + deltaValue) / takeValueAfter;
      } else {
        const deltaValue = leg.units * leg.price;
        weightAfterPct = (holdingBefore.units * holdingBefore.price - deltaValue) / takeValueAfter;
      }
      weightDeltaPct = weightAfterPct - weightBeforePct;
    }
  }
  
  // Get asset day % from quote
  let assetDayPct = null;
  if (ticker && quotes?.getCached) {
    const quote = quotes.getCached(ticker);
    // Day % requires intraday price tracking (not available in current quotes)
    // For now, omit this metric
  }
  
  // Portfolio day return from value change
  let portfolioDayPct = null;
  if (Number.isFinite(takeValueBefore) && takeValueBefore > 0 && Number.isFinite(take?.invested)) {
    portfolioDayPct = (takeValueAfter - take.invested) / take.invested;
  }
  
  // Attributable impacts require isolation of trade effect vs. market movement
  // This is not currently defensible without historical marks
  const thesisImpactPct = null;
  const portfolioImpactPct = null;
  
  return {
    ticker,
    side,
    thesisName,
    weightBeforePct,
    weightAfterPct,
    weightDeltaPct,
    assetDayPct,
    portfolioDayPct,
    thesisImpactPct,
    portfolioImpactPct,
    thesisNames: thesisName ? [thesisName] : [],
  };
}
