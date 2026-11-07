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
 * Finds previous valid mark day (handles weekends/holidays).
 * @param {object} db - SQLite database
 * @param {array} takes - Array of active takes
 * @param {string} today - Day string (YYYY-MM-DD in ART)
 * @returns {number|null} - Day return as fraction, or null if unavailable
 */
function computePortfolioDayReturn(db, takes, today) {
  if (!takes || takes.length === 0) return null;
  
  // Aggregate marks for today
  let todayTotalValue = 0;
  let todayTotalInvested = 0;
  let hasToday = false;
  
  for (const take of takes) {
    if (!take?.id) continue;
    const marks = loadMarks(db, take.id);
    const todayMark = marks.find(m => m.day === today);
    
    if (todayMark && Number.isFinite(todayMark.value) && Number.isFinite(todayMark.invested)) {
      todayTotalValue += todayMark.value;
      todayTotalInvested += todayMark.invested;
      hasToday = true;
    }
  }
  
  if (!hasToday) return null;
  
  // Find previous valid mark day (handles weekends/holidays)
  // Try up to 5 calendar days back
  const MAX_LOOKBACK_DAYS = 5;
  let prevDay = null;
  let prevTotalValue = 0;
  let prevTotalInvested = 0;
  
  for (let daysBack = 1; daysBack <= MAX_LOOKBACK_DAYS; daysBack++) {
    const candidateDay = subtractDays(today, daysBack);
    let hasPrevForAll = true;
    let candidateValue = 0;
    let candidateInvested = 0;
    
    for (const take of takes) {
      if (!take?.id) continue;
      const marks = loadMarks(db, take.id);
      const candidateMark = marks.find(m => m.day === candidateDay);
      
      if (!candidateMark || !Number.isFinite(candidateMark.value) || !Number.isFinite(candidateMark.invested)) {
        hasPrevForAll = false;
        break;
      }
      
      candidateValue += candidateMark.value;
      candidateInvested += candidateMark.invested;
    }
    
    if (hasPrevForAll) {
      prevDay = candidateDay;
      prevTotalValue = candidateValue;
      prevTotalInvested = candidateInvested;
      break;
    }
  }
  
  if (!prevDay) return null; // No valid baseline within lookback window
  
  // Use time-weighted return formula accounting for flows
  const prevMark = {value: prevTotalValue, invested: prevTotalInvested};
  const nextMark = {value: todayTotalValue, invested: todayTotalInvested};
  
  return dailyReturn(prevMark, nextMark);
}

/**
 * Subtract N days from YYYY-MM-DD date string.
 */
function subtractDays(dayStr, n) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - n);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Subtract one day from YYYY-MM-DD date string.
 */
function subtractOneDay(dayStr) {
  return subtractDays(dayStr, 1);
}

/**
 * Load auto trade actions for a user's ART calendar day.
 * Filters by individual event timestamps, not window boundaries,
 * to correctly handle events near ART day boundaries (midnight crossings).
 * 
 * PREFERENCE SEMANTICS (Issue #4 investigation):
 * - Query loads ALL alert groups regardless of status (pending/sent/failed)
 * - tradesEnabled=false blocks immediate email delivery (marks status='failed')
 * - But digest still includes those actions as historical record
 * - Rationale: tradesEnabled controls immediate alerts, not digest inclusion
 * - Failed status doesn't mean trade didn't happen; preserves history
 * - Current behavior preserves user contract: disable immediate emails while
 *   still seeing automatic actions in daily digest summary
 * 
 * @param {object} db - SQLite database
 * @param {string} userId
 * @param {string} dayStr - ART day string (YYYY-MM-DD)
 * @returns {array} - Array of action objects {ticker, side, thesisName, reasonPlain}
 */
function loadAutoActionsForDay(db, userId, dayStr) {
  if (!db || !userId || !dayStr) return [];
  
  // Calculate ART day boundaries
  const [year, month, day] = dayStr.split('-').map(Number);
  const dayStart = new Date(Date.UTC(year, month - 1, day, 3, 0, 0)); // Start of ART day in UTC
  const dayEnd = new Date(Date.UTC(year, month - 1, day + 1, 3, 0, 0)); // End of ART day in UTC
  
  // Query alert groups that might contain events for this day
  // Include windows that started up to 2 hours before day boundary to catch midnight events
  const searchStart = new Date(dayStart.getTime() - 2 * 3600 * 1000);
  
  const rows = db.prepare(`
    SELECT events_json FROM email_alert_groups
    WHERE user_id = ? AND alert_type = 'trades'
      AND window_start >= ? AND window_start < ?
  `).all(userId, searchStart.toISOString(), dayEnd.toISOString());
  
  const actions = [];
  for (const row of rows) {
    try {
      const events = JSON.parse(row.events_json || '[]');
      for (const evt of events) {
        // Only include truthful available fields
        if (!evt.ticker) continue;
        
        // Filter by actual event timestamp, not window_start
        // Events must fall within the ART day boundaries
        if (evt.at) {
          const eventTime = new Date(evt.at);
          if (eventTime < dayStart || eventTime >= dayEnd) {
            continue; // Event outside this ART day
          }
        }
        
        actions.push({
          ticker: evt.ticker,
          side: evt.side || null, // Preserve missing as null, template will handle neutral rendering
          thesisName: evt.thesisName || 'Tesis',
          reasonPlain: evt.reasonPlain || 'Operación automática de práctica',
        });
      }
    } catch (e) {
      // Skip malformed JSON
    }
  }
  
  return actions;
}

/**
 * Build digest enriched data from user takes.
 * @param {object} opts
 * @param {object} opts.db - SQLite database
 * @param {string} opts.userId - User ID
 * @param {array} opts.takes - Array of user takes
 * @param {Date} opts.now - Current timestamp
 * @returns {object|null} - Enriched data or null if insufficient data
 */
export function buildDigestEnrichedData({db, userId, takes = [], now = new Date()} = {}) {
  const activeTakes = takes.filter(t => t?.phase === 'active');
  if (activeTakes.length === 0 || !db || !userId) {
    return null;
  }
  
  const today = dayInBuenosAires(now);
  
  // UNIFIED BASELINE COMPUTATION for both portfolio and thesis-level metrics
  // Find one shared validated baseline day for the entire portfolio:
  // - Maximum 5 calendar days lookback (handles weekends/holidays)
  // - ALL active takes must have valid marks for both today and the baseline day
  // - If unavailable, all affected comparative figures (portfolio day %, thesis day %, contributions) are unavailable
  // This prevents mixed-date comparisons and ensures contributions reconcile to portfolio return
  
  const MAX_LOOKBACK_DAYS = 5;
  let baselineDay = null;
  let allTakesMarks = [];
  
  // First verify all takes have today's marks
  let hasAllToday = true;
  for (const take of activeTakes) {
    if (!take?.id) continue;
    const marks = loadMarks(db, take.id);
    const todayMark = marks.find(m => m.day === today);
    if (!todayMark || !Number.isFinite(todayMark.value) || !Number.isFinite(todayMark.invested)) {
      hasAllToday = false;
      break;
    }
    allTakesMarks.push({takeId: take.id, takeTitle: take.title, marks});
  }
  
  if (!hasAllToday) {
    // Cannot compute any day-over-day metrics without complete today data
    return {
      portfolio: {dayPct: null, weekPct: null},
      theses: [],
      takeaway: null,
      autoActions: loadAutoActionsForDay(db, userId, today),
      alertsFired: [],
      tip: null,
      newsItems: [],
    };
  }
  
  // Find most recent prior day where ALL takes have valid marks
  for (let daysBack = 1; daysBack <= MAX_LOOKBACK_DAYS; daysBack++) {
    const candidateDay = subtractDays(today, daysBack);
    let hasAllPrior = true;
    
    for (const {marks} of allTakesMarks) {
      const candidateMark = marks.find(m => m.day === candidateDay);
      if (!candidateMark || !Number.isFinite(candidateMark.value) || !Number.isFinite(candidateMark.invested)) {
        hasAllPrior = false;
        break;
      }
    }
    
    if (hasAllPrior) {
      baselineDay = candidateDay;
      break;
    }
  }
  
  if (!baselineDay) {
    // No valid shared baseline within lookback window: all comparative metrics unavailable
    return {
      portfolio: {dayPct: null, weekPct: null},
      theses: [],
      takeaway: null,
      autoActions: loadAutoActionsForDay(db, userId, today),
      alertsFired: [],
      tip: null,
      newsItems: [],
    };
  }
  
  // Compute portfolio-level aggregates using the unified baseline
  let portfolioPriorValue = 0;
  let portfolioPriorInvested = 0;
  let portfolioTodayValue = 0;
  let portfolioTodayInvested = 0;
  
  const thesisData = [];
  
  for (const {takeId, takeTitle, marks} of allTakesMarks) {
    const todayMark = marks.find(m => m.day === today);
    const priorMark = marks.find(m => m.day === baselineDay);
    
    // We already validated these exist and are finite
    portfolioPriorValue += priorMark.value;
    portfolioPriorInvested += priorMark.invested;
    portfolioTodayValue += todayMark.value;
    portfolioTodayInvested += todayMark.invested;
    
    const thesisDayPct = dailyReturn(priorMark, todayMark);
    if (thesisDayPct !== null && takeTitle) {
      thesisData.push({
        name: takeTitle,
        dayPct: thesisDayPct,
        priorMark,
        todayMark,
      });
    }
  }
  
  // Portfolio day return
  const portfolioPrevMark = {value: portfolioPriorValue, invested: portfolioPriorInvested};
  const portfolioNextMark = {value: portfolioTodayValue, invested: portfolioTodayInvested};
  const portfolioDayPct = dailyReturn(portfolioPrevMark, portfolioNextMark);
  
  // Compute thesis contributions using consistent denominator
  const theses = [];
  const portfolioCashflow = portfolioTodayInvested - portfolioPriorInvested;
  const portfolioDenominator = portfolioPriorValue + portfolioCashflow;
  
  for (const td of thesisData) {
    const thesisCashflow = td.todayMark.invested - td.priorMark.invested;
    const thesisPnL = td.dayPct * (td.priorMark.value + thesisCashflow);
    const contributionPct = portfolioDenominator > 0
      ? thesisPnL / portfolioDenominator
      : null;
    
    theses.push({
      name: td.name,
      dayPct: td.dayPct,
      contributionPct,
    });
  }
  
  // Populate autoActions from persisted trade alerts for this user's ART day
  const autoActions = loadAutoActionsForDay(db, userId, today);
  
  // Week return requires at least 7 days of marks - not implemented here
  const portfolioWeekPct = null;
  
  return {
    portfolio: {
      dayPct: portfolioDayPct,
      weekPct: portfolioWeekPct,
    },
    theses,
    takeaway: null, // Requires AI/analysis
    autoActions,
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
  // Use actual executed side from sizing legs (source of truth)
  // Match the leg for this specific ticker to get correct ticker-side pair
  // If unavailable or invalid enum, side remains null - NEVER infer from signal.kind
  let side = null;
  if (ticker && sized?.legs?.length) {
    const matchingLeg = sized.legs.find(leg => leg.ticker === ticker);
    if (matchingLeg?.side) {
      // Only accept valid enum values; anything else stays null
      if (matchingLeg.side === 'compra') {
        side = 'compra';
      } else if (matchingLeg.side === 'venta') {
        side = 'venta';
      }
      // Any other truthy value (invalid enum) remains null, never map to venta
    }
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
  
  // Portfolio day return for trade alerts: ALWAYS NULL
  // Daily marks are computed once per day at 17:30 ART and reflect previous close.
  // They CANNOT represent post-trade state. Real-time post-trade computation infrastructure
  // is not available. Therefore, trade alerts must OMIT "Tu cartera hoy, después de esta operación"
  // entirely, as it would be misleading to claim post-trade state from pre-trade marks.
  const portfolioDayPct = null;
  
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
