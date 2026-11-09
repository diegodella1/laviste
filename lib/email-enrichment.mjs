/**
 * Compute enriched email data from available sources.
 * Returns only defensible, evidence-backed metrics.
 * Day boundaries: America/Buenos_Aires timezone.
 * Daily returns account for flows using time-weighted return formula.
 */

import {value} from './engine.mjs';
import {dailyReturn} from './leaderboard-stats.mjs';
import {dayInBuenosAires} from './usage.mjs';
import {AUTO_PAUSE_REASONS} from '../public/copy.mjs';

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
 * Find shared baseline day for portfolio-wide metrics
 * Returns {baselineDay, allTakesMarks} or {baselineDay: null, allTakesMarks: []} if unavailable
 * 
 * Requirements:
 * - ALL takes must have valid marks for today
 * - Find most recent prior day (within MAX_LOOKBACK_DAYS) where ALL takes have valid marks
 * - This ensures consistent baseline across entire portfolio (no mixed-date comparisons)
 * 
 * @param {object} db - SQLite database
 * @param {array} takes - Array of take objects
 * @param {string} today - Today's ART calendar day (YYYY-MM-DD)
 * @returns {object} - {baselineDay, allTakesMarks} or {baselineDay: null, allTakesMarks: []}
 */
function findSharedBaseline(db, takes, today) {
  const MAX_LOOKBACK_DAYS = 5;
  const allTakesMarks = [];
  
  // First verify all takes have today's marks
  for (const take of takes) {
    if (!take?.id) continue;
    const marks = loadMarks(db, take.id);
    const todayMark = marks.find(m => m.day === today);
    if (!todayMark || !Number.isFinite(todayMark.value) || !Number.isFinite(todayMark.invested)) {
      return {baselineDay: null, allTakesMarks: []};
    }
    allTakesMarks.push({takeId: take.id, takeTitle: take.title, marks});
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
      return {baselineDay: candidateDay, allTakesMarks};
    }
  }
  
  return {baselineDay: null, allTakesMarks: []};
}

/**
 * Validate that a quote's timestamps are from the expected ART trading day.
 * Fail closed: reject old-day, future, missing, invalid, or mismatched timestamps.
 * @param {object} quote - Quote with asOf, dayChangePct, changeAsOf
 * @param {string} expectedDay - Expected ART calendar day (YYYY-MM-DD)
 * @param {Date} now - Current timestamp for future validation
 * @returns {boolean} - True if quote is valid for the expected day
 */
function isQuoteValidForDay(quote, expectedDay, now) {
  if (!quote?.asOf) return false;
  
  // Validate price timestamp (as_of) is from expected ART day
  const quoteDay = dayInBuenosAires(new Date(quote.asOf));
  if (quoteDay !== expectedDay) return false;
  
  // Reject future timestamps relative to now
  const asOfTime = new Date(quote.asOf).getTime();
  const nowTime = now.getTime();
  if (asOfTime > nowTime) return false;
  
  // If day-change data present, validate change timestamp matches
  if (Number.isFinite(quote.dayChangePct)) {
    if (!quote.changeAsOf) {
      // changeAsOf required when dayChangePct present
      return false;
    }
    
    const changeDay = dayInBuenosAires(new Date(quote.changeAsOf));
    if (changeDay !== expectedDay) return false;
    
    // Reject future changeAsOf relative to now
    const changeAsOfTime = new Date(quote.changeAsOf).getTime();
    if (changeAsOfTime > nowTime) return false;
  }
  
  return true;
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
 * PREFERENCE SEMANTICS:
 * - Query loads ALL alert groups regardless of status (pending/sent/failed)
 * - An explicit trades_freq='off' row filters trades out of the digest too (Diego E)
 * - No prefs row keeps the previous include-all behaviour (existing tests pin that)
 * 
 * @param {object} db - SQLite database
 * @param {string} userId
 * @param {string} dayStr - ART day string (YYYY-MM-DD)
 * @returns {array} - Array of action objects {ticker, side, thesisName, reasonPlain}
 */
function loadAutoActionsForDay(db, userId, dayStr) {
  if (!db || !userId || !dayStr) return [];
  const prefsRow = db.prepare('SELECT trades_freq FROM email_prefs WHERE user_id = ?').get(userId);
  if (prefsRow && prefsRow.trades_freq === 'off') return [];
  
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

function takeTitleFromDb(db, takeId) {
  if (!takeId) return 'Tesis';
  const row = db.prepare('SELECT data FROM takes WHERE id = ?').get(takeId);
  if (!row?.data) return 'Tesis';
  try {
    return JSON.parse(row.data).title || 'Tesis';
  } catch {
    return 'Tesis';
  }
}

function artDayBounds(dayStr) {
  const [year, month, day] = dayStr.split('-').map(Number);
  const dayStart = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
  const dayEnd = new Date(Date.UTC(year, month - 1, day + 1, 3, 0, 0));
  const searchStart = new Date(dayStart.getTime() - 2 * 3600 * 1000);
  return {dayStart, dayEnd, searchStart};
}

function loadPausaActionsForDay(db, userId, dayStr) {
  if (!db || !userId || !dayStr) return [];
  const prefsRow = db.prepare('SELECT pausa_freq FROM email_prefs WHERE user_id = ?').get(userId);
  if (prefsRow && prefsRow.pausa_freq === 'off') return [];

  const {dayStart, dayEnd, searchStart} = artDayBounds(dayStr);
  const rows = db.prepare(`
    SELECT events_json FROM email_alert_groups
    WHERE user_id = ? AND alert_type = 'pausa'
      AND window_start >= ? AND window_start < ?
  `).all(userId, searchStart.toISOString(), dayEnd.toISOString());

  const actions = [];
  for (const row of rows) {
    try {
      const events = JSON.parse(row.events_json || '[]');
      for (const evt of events) {
        if (evt.at) {
          const eventTime = new Date(evt.at);
          if (eventTime < dayStart || eventTime >= dayEnd) continue;
        }
        const reason = evt.reason || '';
        actions.push({
          takeId: evt.takeId || null,
          thesisName: takeTitleFromDb(db, evt.takeId),
          reasonPlain: AUTO_PAUSE_REASONS[reason] || reason || 'Automático se pausó.',
        });
      }
    } catch {
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
export function buildDigestEnrichedData({db, userId, takes = [], quotes, now = new Date()} = {}) {
  const activeTakes = takes.filter(t => t?.phase === 'active');
  if (activeTakes.length === 0 || !db || !userId) {
    return null;
  }
  
  const today = dayInBuenosAires(now);
  
  // UNIFIED BASELINE COMPUTATION for both portfolio and thesis-level metrics
  const {baselineDay, allTakesMarks} = findSharedBaseline(db, activeTakes, today);
  
  if (!baselineDay) {
    // No valid shared baseline within lookback window: all comparative metrics unavailable
    return {
      portfolio: {dayPct: null, weekPct: null},
      theses: [],
      takeaway: null,
      autoActions: loadAutoActionsForDay(db, userId, today),
      pausaActions: loadPausaActionsForDay(db, userId, today),
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
    
    // Per-ticker contributions UNAVAILABLE without holdings snapshots
    // Requirements for accurate attribution:
    // 1. Holdings snapshot at baselineDay (not just current state)
    // 2. Holdings snapshot at today (before any operations)
    // 3. Proof no manual/automatic operations changed units between baseline and today
    // 4. Quote price history matching exact baseline period (not just 1-day change)
    //
    // Current data cannot meet these requirements:
    // - Baseline can be 1-5 days back, but quotes only give 1-day change
    // - No holdings snapshots; only current state
    // - Cannot definitively prove unchanged positions (would need to check audit_log, 
    //   auto_trades, and track all take mutations, but take object has no operation timestamp)
    //
    // Approximation rejected: period mismatch (1-day quote vs N-day baseline),
    // incomplete contamination detection, denominator inconsistency.
    // 
    // OMIT contributions honestly as unavailable rather than guess.
    const contributions = [];
    
    theses.push({
      name: td.name,
      dayPct: td.dayPct,
      contributionPct,
      contributions,  // Always empty: unavailable without holdings snapshots
    });
  }
  
  // Populate autoActions / pausaActions from persisted alert groups for this user's ART day
  const autoActions = loadAutoActionsForDay(db, userId, today);
  const pausaActions = loadPausaActionsForDay(db, userId, today);
  
  // Week return requires at least 7 days of marks - not implemented here
  const portfolioWeekPct = null;
  
  // Compute asset day movements from quote cache
  const portfolioMovements = [];
  if (quotes?.getCached) {
    const userTickers = new Set();
    const tickerToTheses = new Map();
    
    for (const take of activeTakes) {
      for (const holding of take.holdings || []) {
        if (!holding?.ticker) continue;
        userTickers.add(holding.ticker);
        if (!tickerToTheses.has(holding.ticker)) {
          tickerToTheses.set(holding.ticker, []);
        }
        if (take.title && !tickerToTheses.get(holding.ticker).includes(take.title)) {
          tickerToTheses.get(holding.ticker).push(take.title);
        }
      }
    }
    
    for (const ticker of userTickers) {
      const quote = quotes.getCached(ticker);
      if (quote && Number.isFinite(quote.dayChangePct) && !quote.stale) {
        // Validate temporal consistency: quote timestamps must be from today's ART trading day
        if (!isQuoteValidForDay(quote, today, now)) {
          continue; // Fail closed: exclude quotes with mismatched/invalid/old timestamps
        }
        const thesisNames = tickerToTheses.get(ticker) || [];
        portfolioMovements.push({
          ticker,
          dayPct: quote.dayChangePct,
          thesisNames,
        });
      }
    }
  }
  
  return {
    portfolio: {
      dayPct: portfolioDayPct,
      weekPct: portfolioWeekPct,
    },
    theses,
    takeaway: null, // Requires AI/analysis
    autoActions,
    pausaActions,
    alertsFired: [], // Populated separately by caller
    newsItems: [], // Populated separately by caller
    portfolioMovements,
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
  quotes,
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
  
  // Asset day %: extract from quote_cache day_change_pct with temporal validation
  let assetDayPct = null;
  
  if (ticker && quotes && now) {
    const quote = typeof quotes.getCached === 'function' ? quotes.getCached(ticker) : null;
    
    if (quote && !quote.stale) {
      const today = dayInBuenosAires(now);
      
      // Apply same temporal validation as digest
      if (isQuoteValidForDay(quote, today, now)) {
        // Extract day_change_pct if present and finite
        if (Number.isFinite(quote.dayChangePct)) {
          assetDayPct = quote.dayChangePct;
          // Preserve genuine zero (don't convert 0 to null)
        }
        // If dayChangePct is null/undefined/NaN, assetDayPct remains null
      }
      // If validation fails (old day, future timestamp, mismatch), assetDayPct remains null
    }
    // If quote missing or stale, assetDayPct remains null
  }
  
  // Portfolio day return "after operation": intraday as-of execution, NOT end-of-day
  // Use SAME shared baseline logic as digest (all takes must have marks within 5 days)
  // Computation: (portfolioValueAfterTrade - baselineValue - netCashflows) / (baselineValue + netCashflows)
  let portfolioDayPct = null;
  
  if (db && allUserTakes?.length > 0 && now) {
    const today = dayInBuenosAires(now);
    const {baselineDay, allTakesMarks} = findSharedBaseline(db, allUserTakes, today);
    
    if (baselineDay && allTakesMarks.length > 0) {
      // Compute baseline portfolio value and invested
      let baselineValue = 0;
      let baselineInvested = 0;
      
      for (const {marks} of allTakesMarks) {
        const baselineMark = marks.find(m => m.day === baselineDay);
        if (baselineMark && Number.isFinite(baselineMark.value) && Number.isFinite(baselineMark.invested)) {
          baselineValue += baselineMark.value;
          baselineInvested += baselineMark.invested;
        }
      }
      
      // Compute current portfolio value and invested (AFTER trade)
      // Use takeAfter for the traded take, current state for all others
      let currentValue = 0;
      let currentInvested = 0;
      
      for (const t of allUserTakes) {
        if (!t?.id) continue;
        
        // Use takeAfter snapshot for the traded take
        const takeToUse = (t.id === takeAfter?.id) ? takeAfter : t;
        const tValue = value(takeToUse);
        const tInvested = takeToUse?.invested;
        
        if (Number.isFinite(tValue) && Number.isFinite(tInvested)) {
          currentValue += tValue;
          currentInvested += tInvested;
        }
      }
      
      // Apply cashflow adjustment
      const netCashflows = currentInvested - baselineInvested;
      const denominator = baselineValue + netCashflows;
      
      if (Number.isFinite(denominator) && denominator !== 0) {
        const numerator = currentValue - baselineValue - netCashflows;
        portfolioDayPct = numerator / denominator;
        
        // Preserve genuine zero, reject non-finite
        if (!Number.isFinite(portfolioDayPct)) {
          portfolioDayPct = null;
        }
      }
    }
  }
  
  // Impact metrics: measure change attributable to THIS trade execution
  // Computed from synchronous before/after value snapshots at execution time
  let thesisImpactPct = null;
  let portfolioImpactPct = null;
  
  if (take && takeAfter && allUserTakes?.length > 0) {
    const takeValueBefore = value(take);
    const takeValueAfter = value(takeAfter);
    
    if (Number.isFinite(takeValueBefore) && takeValueBefore > 0) {
      // Thesis impact: change in this thesis's value from this trade
      thesisImpactPct = (takeValueAfter - takeValueBefore) / takeValueBefore;
      
      // Portfolio impact: this take's value change as fraction of total portfolio
      // Compute portfolio value before trade: this take (before) + all other takes (current)
      // Note: allUserTakes is post-trade state, includes takeAfter
      let portfolioValueBefore = 0;
      let portfolioValueAfter = 0;
      
      for (const t of allUserTakes) {
        if (!t?.id) continue;
        const tValue = value(t);
        if (!Number.isFinite(tValue)) continue;
        
        if (t.id === take.id) {
          // This is the take that was traded: use before/after snapshots
          portfolioValueBefore += takeValueBefore;
          portfolioValueAfter += takeValueAfter;
        } else {
          // Other takes: value unchanged by this trade
          portfolioValueBefore += tValue;
          portfolioValueAfter += tValue;
        }
      }
      
      if (portfolioValueBefore > 0) {
        portfolioImpactPct = (portfolioValueAfter - portfolioValueBefore) / portfolioValueBefore;
      }
    }
  }
  
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
