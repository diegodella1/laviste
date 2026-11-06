# AutoActions/Alerts Population - Implementation Gap Documentation

## Current State (as of commit 5de0f6a+)

### Problem
`buildDigestEnrichedData` returns empty arrays for:
- `autoActions: []`  
- `alertsFired: []`

Comments claim "Populated separately by caller" but no caller actually populates them.

Daily marks job calls `scheduleDailyDigest` with `enrichedData` that has empty arrays, resulting in emails that never show auto trading activity or fired alerts, even when they occurred.

### Why Not Fixed in This Session

**AutoActions Population Complexity:**

1. **Data Source**: `auto_trades` table exists with columns:
   - `id`, `take_id`, `user_id`, `day`, `status`, `kind`, `signal_id`
   - `order_id`, `batch_id`, `executed_at`, `amount`, `meta`, `created_at`

2. **Required Enrichment**:
   - Side (compra/venta): Must extract from `meta` JSON or reconstruct from signal
   - Ticker: Must extract from `meta` or join to signal
   - Thesis name: Must join through take
   - Reason (reasonPlain): Must reconstruct from signal or store separately

3. **Cross-Take Aggregation**: 
   - User may have multiple takes
   - Same ticker may appear in multiple theses
   - Need to aggregate/deduplicate intelligently

4. **Day Boundary**:
   - `day` column is YYYY-MM-DD in UTC or ART?
   - Must match `dayInBuenosAires(now)` used for marks

**AlertsFired Population Complexity:**

1. **Computation Requirements**:
   - Load user preferences (`thresholdAssetPct`, `thresholdPortfolioPct`)
   - Compute day % for each ticker across all holdings
   - Compare against thresholds
   - Build thesis name arrays for each ticker

2. **Ticker-Level Aggregation**:
   - Multiple holdings can have same ticker in different takes
   - Need combined day % weighted by position sizes
   - Or separate alerts per thesis? (Not specified)

3. **Data Availability**:
   - Requires intraday price data or previous close comparison
   - Current `assetDayPct` in trade enrichment is `null` (not implemented)

### Recommended Phased Implementation

**Phase 1: AutoActions Basic Wiring** (1-2 focused sessions)
- Query `auto_trades` for user + day
- Extract ticker, side, thesis from existing columns/joins
- Store `reasonPlain` in `meta` during trade execution
- Populate `autoActions` array in daily marks job

**Phase 2: AlertsFired Computation** (2-3 focused sessions)
- Implement ticker day % computation (requires baseline price logic)
- Load user threshold preferences
- Generate alerts for threshold crossings
- Populate `alertsFired` array

**Phase 3: Template Omission** (1 session)
- When arrays truly empty (no trades, no alerts), omit sections
- When arrays unknown/unavailable, show unavailable copy or omit
- Never claim "Automático no ejecutó operaciones" when data wasn't checked

### Test Coverage Needed
- Auto trades for day are reflected in digest `autoActions`
- Multiple trades same day aggregate correctly
- Ticker crossing threshold appears in `alertsFired`
- Empty arrays (real zero) vs omitted data (unknown) handled distinctly
- Cross-user isolation (user A's trades don't appear in user B's digest)

### Acceptance Criteria
- Digest shows actual trades when they occurred
- No false "no actions today" when trades happened
- Alerts fire for actual threshold crossings
- Unknown data never claims "empty" or "zero"

## Status
**Not implemented**. Arrays remain empty. This document exists so future sessions don't waste time rediscovering the complexity.
