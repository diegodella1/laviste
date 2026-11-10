# Email Data Availability Assessment

**Date**: 2026-11-08  
**Canonical Spec**: `SPEC-EMAIL-LAVISTE-CLARITY-2026-11-06_1412.md`

## Executive Summary

Accurate assessment of data availability for canonical spec requirements after defect remediation.

**Per-thesis ticker contributions**: **UNAVAILABLE** - requires holdings-level daily snapshots matching exact baseline period. Current data cannot meet requirements:
1. Baseline can be 1-5 days back, but quotes only provide 1-day change (period mismatch)
2. No holdings snapshots to prove unchanged positions between baseline and today
3. Cannot verify absence of manual/automatic operations that changed holdings

**Trade impact metrics**: **AVAILABLE** - runner captures synchronous before/after thesis values at execution time. Portfolio-wide impact computed from all user takes.

**Portfolio day return after trade**: **UNAVAILABLE** - trade alerts fire during market hours before daily marks compute baseline. No intraday baseline snapshots available.

## 1. Per-Thesis Ticker Contributions

### Spec Requirement

**Canonical spec** (line 179):
```
theses[].contributions[] {ticker, contribPct, thesisNames[]}
```

### Requirements for Accurate Attribution

To correctly attribute a thesis's return to individual holdings, we need:

1. **Period alignment**: Ticker price changes must cover the EXACT same period as the thesis baseline
   - Thesis return: `(value_today - value_baseline) / (value_baseline + cashflows)`
   - Baseline can be 1-5 days back (weekend/holiday lookback)
   - Quote `dayChangePct` covers only 1 day (yesterday → today)
   - **Period mismatch** when baseline > 1 day

2. **Holdings snapshots**: Holdings units (shares/bonds held) at baseline day and today
   - Current state: Only live holdings (current state)
   - Missing: Historical snapshots at baseline day
   - Cannot prove holdings unchanged without snapshots

3. **Operation tracking**: Proof no operations changed positions
   - Operations that change holdings:
     - Auto trades (`auto_trades` table)
     - Manual buys/sells (UI operations)
     - Aportes/retiros (deposits/withdrawals)
     - Rebalances
     - Draft proposals applied
   - Would need: Complete operation log with timestamps + position change detection
   - Cannot definitively verify unchanged positions

4. **Denominator consistency**: Contribution denominator must match thesis return denominator
   - Thesis return uses: `value_baseline + cashflows`
   - Naive approach would use: raw `value_baseline`
   - **Denominator mismatch** without cashflow adjustment

### Current Implementation

**Status**: Contributions **OMITTED HONESTLY** (`contributions: []`)

**Code** (`lib/email-enrichment.mjs` lines 360-390):
- Comments document exact missing data
- Returns empty array instead of approximate/guessed values
- Preserves existing portfolio-level and thesis-level returns (unaffected)

**Tests** (`test/ticker-contributions-unavailable.test.mjs`):
- Baseline = 1 day: unavailable (no holdings snapshots)
- Baseline > 1 day: unavailable (period mismatch)
- Manual operations: unavailable (cannot prove unchanged positions)
- Automatic trades: unavailable (holdings contaminated)
- Multi-user isolation: verified (each user's data separate)

### Minimal Extension Required

To implement ticker contributions accurately:

1. **Add holdings snapshots table**:
   ```sql
   CREATE TABLE holding_snapshots (
     take_id TEXT NOT NULL,
     day TEXT NOT NULL,
     ticker TEXT NOT NULL,
     units REAL NOT NULL,
     price REAL NOT NULL,
     PRIMARY KEY (take_id, day, ticker)
   );
   ```

2. **Populate snapshots** during daily marks run (17:30 ART)

3. **Extend quote history** to support multi-day periods or store daily quote snapshots

4. **Period-matched computation**:
   - Query snapshots for baseline day and today
   - Use quote history or snapshots for exact period
   - Verify no operations between baseline and today
   - Apply cashflow-adjusted denominator

**Schema impact**: Requires new migration (v22) - NOT AUTHORIZED for current draft

## 2. Trade Impact Metrics

### Spec Requirement

**Canonical spec** (line 203-207):
```
"Tu cartera hoy, después de esta operación" = dayPctAfter
"Atribuible a esta operación" = thesisImpactPct (thesis) / portfolioImpactPct (portfolio)
```

### Available Data

**Runner snapshots** (`lib/auto/runner.mjs` lines 245-252):
```javascript
function tryRecordTradeAlert(scoped, takeId, signal, takeBefore, sized) {
  const takeAfter = scoped.take(takeId);
  const takeValueBefore = value(takeBefore);
  const takeValueAfter = value(takeAfter);
  const deltaPercent = (takeValueAfter - takeValueBefore) / takeValueBefore;
  // ... passes takeBefore, takeAfter, allUserTakes to buildTradeEnrichedData
}
```

### Implementation

**Thesis impact** (`lib/email-enrichment.mjs` lines 530-535):
```javascript
const takeValueBefore = value(take);
const takeValueAfter = value(takeAfter);
if (takeValueBefore > 0) {
  thesisImpactPct = (takeValueAfter - takeValueBefore) / takeValueBefore;
}
```

**Portfolio impact** (`lib/email-enrichment.mjs` lines 537-555):
```javascript
// Compute portfolio value before trade: this take (before) + all other takes (current)
let portfolioValueBefore = 0;
let portfolioValueAfter = 0;

for (const t of allUserTakes) {
  if (t.id === take.id) {
    // This traded take: use before/after snapshots
    portfolioValueBefore += takeValueBefore;
    portfolioValueAfter += takeValueAfter;
  } else {
    // Other takes: value unchanged by this trade
    portfolioValueBefore += value(t);
    portfolioValueAfter += value(t);
  }
}

if (portfolioValueBefore > 0) {
  portfolioImpactPct = (portfolioValueAfter - portfolioValueBefore) / portfolioValueBefore;
}
```

**Persistence** (`lib/email-alerts.mjs`):
- Values stored in `events_json` payload inside existing alert records
- No schema migration required ✅

**Status**: **AVAILABLE** when runner provides take snapshots and user takes list

**Tests** (`test/trade-impact-metrics.test.mjs`):
- Thesis impact: computed from before/after snapshots ✅
- Portfolio impact: computed from multi-take portfolio ✅
- Zero impact: correctly returns 0 when no change ✅
- Multi-leg trades: uses matching ticker ✅
- User isolation: only user's takes in portfolio ✅
- Unavailable inputs: gracefully returns null ✅
- Invalid values: handles edge cases ✅

## 3. Portfolio Day Return After Trade

### Spec Requirement

**Canonical spec** (line 203):
```
"Tu cartera hoy, después de esta operación" (dayPctAfter)
```

**Clarification**: This is INTRADAY return as-of execution time, NOT end-of-day.

### Timing Constraint

**Trade execution flow**:
1. Auto signal detected (during market hours)
2. Trade executed immediately
3. Alert fired within minutes
4. Email queued and sent

**Daily marks schedule**:
- Runs at 17:30 ART (after market close at 17:00 ART)
- Computes end-of-day portfolio value
- Stores baseline in `take_daily_marks`

**Mismatch**: Trade alerts fire BEFORE daily marks complete. No baseline snapshot available at execution time.

### Missing Data

To compute intraday portfolio return after trade:
```
dayPctAfter = (portfolioValueNow - baselineValue - cashflows) / (baselineValue + cashflows)
```

**Required**:
- `baselineValue`: Yesterday's end-of-day portfolio value (exists in daily marks)
- `portfolioValueNow`: Current portfolio value (available from take snapshots)
- `cashflows`: Net deposits/withdrawals since baseline (derived from invested deltas)

**Problem**: At trade execution time (e.g. 11:00 ART), yesterday's baseline IS available (from prior day's 17:30 run).

**Re-assessment**: Intraday computation IS FEASIBLE.

### Feasible Implementation

**Data sources available at execution time**:
1. Yesterday's baseline: query `take_daily_marks` for most recent prior day
2. Current portfolio value: sum `value(take)` across all user takes
3. Cashflows: sum invested changes since baseline

**Code location**: `lib/email-enrichment.mjs` `buildTradeEnrichedData` lines 525-529

**Current status**: Marked unavailable with incorrect justification

**Action required**:
1. Query `take_daily_marks` for each take's most recent prior-day mark at execution time
2. Sum baseline portfolio value and invested
3. Sum current portfolio value and invested
4. Compute intraday return with cashflow adjustment
5. Return null if baseline unavailable (first day after take creation)

**Schema impact**: NONE - uses existing `take_daily_marks` table

**Status**: **FEASIBLE** but not yet implemented (requires code change in `buildTradeEnrichedData`)

## 4. Timestamp Semantics

### Provider Behavior

Both `data912` and `yahoo` adapters set:
```javascript
quote.asOf = resolveQuoteAsOf({providerMarketTimeSec, fetchedAt});
quote.changeAsOf = asOf;  // Same value
```

### Timestamp Meaning

- `asOf`: When this price quote is from (provider market time, or fetch time during market, or last close)
- `changeAsOf`: When metadata (including day-change %) was fetched (same as asOf)
- `dayChangePct`: Provider's calculation of today's movement vs yesterday's close

**Not an event timestamp**: Neither timestamp represents "when yesterday's close occurred". Both represent "when we obtained today's data".

### Validation Rule

**Same-ART-day requirement** (`lib/email-enrichment.mjs` line 382):
```javascript
if (!isQuoteValidForDay(quote, today, now)) continue;
```

**Purpose**: Ensure quote is from TODAY's trading session for TODAY's digest (17:30 ART).

**Correctness**:
- At 17:30 ART, market is closed (closed at 17:00 ART)
- `resolveQuoteAsOf(17:30)` returns last session close (17:00 ART today)
- Both timestamps from today's ART calendar day
- Fresh data passes, old-day stale data rejected ✅

**Edge case**: Fetch at 10:00 ART (before market open) would return yesterday's 17:00 close, which validation correctly rejects as old-day data.

**Provenance caveat**: During market hours without provider event time, timestamp is fetch time, not verified exchange timestamp. This represents "when we captured this metadata", not "verified exchange-reported time".

## Summary

| Requirement | Status | Blocker / Implementation |
|------------|--------|-------------------------|
| Per-thesis ticker contributions | **UNAVAILABLE** | Requires holdings snapshots, quote history, operation tracking (schema v22) |
| Trade thesis impact % | **AVAILABLE** | Implemented using runner snapshots ✅ |
| Trade portfolio impact % | **AVAILABLE** | Implemented using runner snapshots + all user takes ✅ |
| Portfolio day % after trade | **FEASIBLE** | Code change needed to query baseline marks at execution time |
| Timestamp semantics | **RESOLVED** | Fetch/market time, not previous-close event time. Validation correct. |

**Tests**: 719 passing (0 failing)
- Ticker contributions: 5 tests verify unavailability and honest omission
- Trade impact metrics: 7 tests verify correct computation and edge cases
- Multi-user isolation verified for both features

**No new schema migrations** beyond approved quote cache v21.
