/**
 * Compute enriched email data from available sources.
 * Returns only defensible, evidence-backed metrics.
 * Day boundaries: America/Buenos_Aires timezone.
 * Daily returns account for flows using time-weighted return formula.
 */

import {value} from './engine.mjs';
import {dailyReturn} from './leaderboard-stats.mjs';
import {dayInBuenosAires} from './usage.mjs';

/**
 * Load marks for a take from the database.
 * @param {object} db - SQLite database
 * @param {string} takeId
 * @returns {array} - Array of mark objects {day, value, invested}
 */
function loadMarks(db, takeId) {
  return db.prepare(`
    SELECT day, value, invested
    FROM take_daily_marks
    WHERE take_id = ?
    ORDER BY day ASC
  `).all(takeId).map(row => ({
    day: row.day,
    value: row.value,
    invested: row.invested,
  }));
}

/**
 * Compute portfolio-level daily return from all active takes.
 * Uses actual historical marks with proper flow-adjusted return calculation.
 * @param {object} db - SQLite database
 * @param {array} takes - Array of active takes
 * @param {string} today - Day string (YYYY-MM-DD in ART)
 * @returns {number|null} - Day return as fraction, or null if unavailable
 */
function computePortfolioDayReturn(db, takes, today) {
  if (!takes || takes.length === 0) return null;
  
  // Aggregate all marks across all takes for today and yesterday
  let todayTotalValue = 0;
  let todayTotalInvested = 0;
  let yesterdayTotalValue = 0;
  let yesterdayTotalInvested = 0;
  let hasYesterday = false;
  let hasToday = false;
  
  const yesterday = subtractOneDay(today);
  
  for (const take of takes) {
    if (!take?.id) continue;
    const marks = loadMarks(db, take.id);
    
    const todayMark = marks.find(m => m.day === today);
    const yesterdayMark = marks.find(m => m.day === yesterday);
    
    if (todayMark && Number.isFinite(todayMark.value) && Number.isFinite(todayMark.invested)) {
      todayTotalValue += todayMark.value;
      todayTotalInvested += todayMark.invested;
      hasToday = true;
    }
    
    if (yesterdayMark && Number.isFinite(yesterdayMark.value) && Number.isFinite(yesterdayMark.invested)) {
      yesterdayTotalValue += yesterdayMark.value;
      yesterdayTotalInvested += yesterdayMark.invested;
      hasYesterday = true;
    }
  }
  
  if (!hasYesterday || !hasToday) return null;
  
  // Use time-weighted return formula accounting for flows
  const prevMark = {value: yesterdayTotalValue, invested: yesterdayTotalInvested};
  const nextMark = {value: todayTotalValue, invested: todayTotalInvested};
  
  return dailyReturn(prevMark, nextMark);
}

/**
 * Subtract one day from YYYY-MM-DD date string.
 */
function subtractOneDay(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Build digest enriched data from user takes.
 * @param {object} opts
 * @param {object} opts.db - SQLite database
 * @param {array} opts.takes - Array of user takes
 * @param {Date} opts.now - Current timestamp
 * @returns {object|null} - Enriched data or null if insufficient data
 */
export function buildDigestEnrichedData({db, takes = [], now = new Date()} = {}) {
  const activeTakes = takes.filter(t => t?.phase === 'active');
  if (activeTakes.length === 0 || !db) {
    return null;
  }
  
  const today = dayInBuenosAires(now);
  
  // Compute portfolio day return using historical marks
  const portfolioDayPct = computePortfolioDayReturn(db, activeTakes, today);
  
  // Week return requires at least 7 days of marks - not implemented here
  const portfolioWeekPct = null;
  
  // Extract thesis-level data
  // NOTE: Each take represents one thesis in current model
  const theses = [];
  const yesterday = subtractOneDay(today);
  
  for (const take of activeTakes) {
    if (!take.title || !take.id) continue;
    
    const marks = loadMarks(db, take.id);
    const todayMark = marks.find(m => m.day === today);
    const yesterdayMark = marks.find(m => m.day === yesterday);
    
    if (!todayMark || !yesterdayMark) continue;
    
    // Thesis day return using time-weighted formula
    const thesisDayPct = dailyReturn(yesterdayMark, todayMark);
    if (thesisDayPct === null) continue;
    
    // Contribution: thesis value change as fraction of total portfolio value
    // Get total portfolio value from all takes today
    let totalPortfolioValue = 0;
    for (const t of activeTakes) {
      const tMarks = loadMarks(db, t.id);
      const tToday = tMarks.find(m => m.day === today);
      if (tToday && Number.isFinite(tToday.value)) {
        totalPortfolioValue += tToday.value;
      }
    }
    
    const thesisValueChange = todayMark.value - yesterdayMark.value;
    const contributionPct = totalPortfolioValue > 0
      ? thesisValueChange / totalPortfolioValue
      : null;
    
    theses.push({
      name: take.title,
      dayPct: thesisDayPct,
      contributionPct,
    });
  }
  
  return {
    portfolio: {
      dayPct: portfolioDayPct,
      weekPct: portfolioWeekPct,
    },
    theses,
    takeaway: null, // Requires AI/analysis
    autoActions: [], // Populated separately by caller
    alertsFired: [], // Populated separately by caller
    newsItems: [], // Populated separately by caller
  };
}

/**
 * Build trade alert enriched data from trade execution context.
 * Uses actual post-trade holdings evidence, not approximation.
 * @param {object} opts
 * @param {object} opts.db - SQLite database
 * @param {object} opts.take - Take object BEFORE trade
 * @param {object} opts.takeAfter - Take object AFTER trade
 * @param {array} opts.allUserTakes - All active takes for this user (for portfolio-wide day return)
 * @param {object} opts.signal - Auto signal
 * @param {Date} opts.now - Current timestamp
 * @returns {object} - Enriched trade data
 */
export function buildTradeEnrichedData({
  db,
  take,
  takeAfter,
  allUserTakes = [],
  signal,
  sized,
  now = new Date(),
} = {}) {
  const ticker = signal?.ticker || null;
  // Use actual executed side from sizing legs when available (source of truth)
  // Fallback to signal.kind inference only when sized unavailable (drift can be sell!)
  let side = null;
  if (sized?.legs?.[0]?.side) {
    side = sized.legs[0].side === 'compra' ? 'compra' : 'venta';
  } else if (signal?.kind) {
    // Fallback: cap usually sell, drift usually buy, but NOT guaranteed
    side = signal.kind === 'cap' ? 'venta' : (signal.kind === 'drift' ? 'compra' : null);
  }
  const thesisName = take?.title || 'Tesis';
  
  // Weight before: from actual holding before trade
  let weightBeforePct = null;
  let weightAfterPct = null;
  let weightDeltaPct = null;
  
  if (ticker && take?.holdings && takeAfter?.holdings) {
    const holdingBefore = take.holdings.find(h => h.ticker === ticker);
    const holdingAfter = takeAfter.holdings.find(h => h.ticker === ticker);
    const takeValueBefore = value(take);
    const takeValueAfter = value(takeAfter);
    
    if (holdingBefore && Number.isFinite(takeValueBefore) && takeValueBefore > 0) {
      weightBeforePct = (holdingBefore.units * holdingBefore.price) / takeValueBefore;
    }
    
    if (holdingAfter && Number.isFinite(takeValueAfter) && takeValueAfter > 0) {
      weightAfterPct = (holdingAfter.units * holdingAfter.price) / takeValueAfter;
    }
    
    if (weightBeforePct !== null && weightAfterPct !== null) {
      weightDeltaPct = weightAfterPct - weightBeforePct;
    }
  }
  
  // Asset day %: requires intraday price data (not available in current system)
  const assetDayPct = null;
  
  // Portfolio day return: compute from ALL user takes for portfolio-wide scope
  // MUST NOT substitute thesis-only return when portfolio data unavailable
  // NOTE: Daily marks are computed once per day at 17:30 ART, so this reflects
  // the daily return up to the most recent mark, not necessarily post-trade.
  // For trades after 17:30, this uses previous close. Before marks computed, returns null.
  const today = dayInBuenosAires(now);
  let portfolioDayPct = null;
  
  if (db && allUserTakes.length > 0) {
    // Compute portfolio-wide daily return from all user's active takes
    portfolioDayPct = computePortfolioDayReturn(db, allUserTakes, today);
  }
  // If allUserTakes not provided or empty, portfolioDayPct remains null (omit metric)
  
  // Impact metrics: isolating trade effect from market movement requires
  // historical marks and portfolio state tracking (not implemented)
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
