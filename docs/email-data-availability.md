# Email Data Availability Assessment

**Date**: 2026-11-08  
**Commit**: Starting from 7d46dfd  
**Canonical Spec**: `SPEC-EMAIL-LAVISTE-CLARITY-2026-11-06_1412.md`

## Executive Summary

Independent investigation of data availability for canonical spec requirements.

**Timestamp Semantics**: Resolved - `changeAsOf` is fetch/market timestamp, not previous-close event timestamp. Both `asOf` and `changeAsOf` are set to the same value by adapters (current price metadata timestamp). Same-ART-day validation is correct for intended use case (digest at 17:30 ART post-market).

**Per-thesis ticker contributions**: BLOCKED - requires holdings-level daily snapshots (not implemented). Can provide approximation assuming no intraday trades, but this is inaccurate when trades occurred.

**Trade impact metrics**: BLOCKED - requires pre/post-trade value snapshots at operation execution time (not implemented). Runner does not capture portfolio value before/after individual operations.

## 1. Timestamp Semantics Investigation

### Current Adapter Behavior

**data912 adapter** (`lib/quotes.mjs` lines 50-62):
```javascript
const asOf = resolveQuoteAsOf({fetchedAt});
const quote = {ticker, price, asOf, provider: 'data912', stale: false, available: true};
if (Number.isFinite(row.pct_change)) {
  const dayChangePct = row.pct_change / 100;
  if (dayChangePct > -1.0) {
    quote.dayChangePct = dayChangePct;
    quote.changeAsOf = asOf;  // SAME as asOf
    quote.prevClose = price / (1 + dayChangePct);
  }
}
```

**Yahoo adapter** (`lib/quotes.mjs` lines 104-125):
```javascript
const asOf = resolveQuoteAsOf({providerMarketTimeSec: meta.regularMarketTime, fetchedAt});
const quote = {ticker, price, asOf, provider: 'yahoo', stale: false, available: true};
const prevClose = meta?.chartPreviousClose ?? meta?.previousClose;
if (Number.isFinite(prevClose) && prevClose > 0) {
  const dayChangePct = (price - prevClose) / prevClose;
  if (dayChangePct > -1.0) {
    quote.dayChangePct = dayChangePct;
    quote.prevClose = prevClose;
    quote.changeAsOf = asOf;  // SAME as asOf
  }
}
```

### Timestamp Resolution Logic

**`resolveQuoteAsOf`** (`lib/quote-time.mjs` lines 47-54):
```javascript
function resolveQuoteAsOf({providerMarketTimeSec, fetchedAt = new Date()}) {
  if (Number.isFinite(providerMarketTimeSec) && providerMarketTimeSec > 0) {
    return new Date(providerMarketTimeSec * 1000).toISOString();  // Provider's market time
  }
  if (isMarketOpen(fetchedAt)) return fetchedAt.toISOString();  // Fetch time if market open
  return lastSessionCloseIso(fetchedAt);  // Last session close (17:00 ART) if market closed
}
```

**Daily marks schedule**: Runs at 17:30 ART (`lib/daily-marks.mjs` line 17), which is 30 minutes after market close (17:00 ART).

### Semantics Clarification

**Field meanings**:
- `asOf`: "When is this price quote from" (provider market time, or fetch time if market open, or last session close)
- `changeAsOf`: "When did we fetch metadata that includes day-change percentage" (always same as `asOf`)
- `dayChangePct`: Provider's calculation of today's movement vs yesterday's close

**Not a contradiction**: Both timestamps represent "when we got this data", not "when the previous close occurred". The day-change percentage DESCRIBES yesterday-to-today movement, but the TIMESTAMP is from today's fetch/market time.

**Validation correctness**: Same-ART-day requirement ensures quote data is from today's trading session, not yesterday's stale data. At 17:30 ART digest time:
- Fetch occurs after market close
- `lastSessionCloseIso(17:30)` returns 17:00 ART today
- Both timestamps from today's ART day
- Validation passes for fresh data, rejects old-day stale data ✅

**Edge case to test**: Fetch at 10:00 ART (before market open) returns yesterday's close (17:00 ART yesterday), which would be rejected by same-day validation. This is CORRECT behavior - we should not use yesterday's data for "today's digest".

## 2. Per-Thesis Ticker Contributions

### Spec Requirement

**Canonical spec** (line 179):
```
theses[].contributions[] {ticker, contribPct, thesisNames[]}
Gap P0. Aporte en % (el mock usa aporte a la tesis). Incluir thesisNames para el chip
```

**Formula** (implementation docs, line 136-140):
```
contrib.contribPct = (holding_value_today - holding_value_yesterday) / thesis_value_yesterday
```

### Available Data

**Schema investigation**:
- `take_daily_marks`: thesis-level value snapshots (value, invested) by day ✅
- **Holdings snapshots**: NOT IMPLEMENTED ❌
- Current `take.holdings[]`: live state only, no history
- Quote cache: day-change percentages by ticker ✅

**Missing inputs**:
1. Holdings units/weights on baseline day (yesterday)
2. Holdings units/weights on current day (today)
3. Intraday trade history to distinguish price movement from trade effects

### Approximation Available (With Limitations)

**Can compute** assuming NO intraday trades occurred:
```
holding_value_today = units × price_today
holding_value_yesterday ≈ units × (price_today / (1 + dayChangePct))
contribution_to_thesis = (holding_value_today - holding_value_yesterday) / thesis_value_yesterday
```

**Severe limitation**: If trades occurred between yesterday and today:
- Units changed
- Cannot separate price effect from trade effect
- Approximation is WRONG

**Correct for**: Digest runs at 17:30 ART, auto-runner operates during market hours (11:00-17:00 ART). If digest checks "did any trade occur today for this user/thesis", could flag contaminated contributions as unavailable.

**Honest assessment**: Can implement approximation with clear contamination detection, OR block as unavailable until holdings snapshots added.

### Minimal Schema Extension for Accurate Implementation

**Option A (holdings snapshots)**:
```sql
CREATE TABLE holding_daily_snapshots(
  take_id TEXT NOT NULL REFERENCES takes(id),
  ticker TEXT NOT NULL,
  day TEXT NOT NULL,  -- YYYY-MM-DD in ART
  units REAL NOT NULL,
  weight_pct REAL,
  snapshot_value REAL,  -- units × price at snapshot time
  PRIMARY KEY(take_id, ticker, day)
);
```

Write snapshots during daily marks after quote refresh, BEFORE any trades execute next day.

**Option B (trade log flag)**: Simpler short-term:
- Check if any `auto_trades` or manual operations occurred for this user/take on `day`
- If yes: contributions unavailable (cannot separate trade effect from price effect)
- If no: use approximation

**Option B implementation cost**: Query existing tables, no schema change.

## 3. Trade Impact Metrics

### Spec Requirements

**Canonical spec** (lines 202-204):
```
portfolioImpactPct: value de cartera antes/después de *esta* operación
  Delta atribuible al trade (bloque "Impacto de esta operación")

portfolio.dayPctAfter: value de cartera del día, post-trade
  "Tu cartera hoy, después de esta operación" — resultado total del día, not the delta
```

**Distinction**:
- `portfolioImpactPct`: Change in portfolio value CAUSED by this trade (trade effect isolation)
- `portfolio.dayPctAfter`: Total portfolio day return measured AFTER trade executed (includes market movement)

### Available Data

**At trade execution time** (`lib/auto/runner.mjs`):
- `take` object with current state ✅
- `signal` with trade details ✅
- Holdings pre-trade (in `take.holdings`) ✅
- Holdings post-trade (after `applyDraftProposal`) ✅

**Missing snapshots**:
1. Portfolio value IMMEDIATELY before trade execution
2. Portfolio value IMMEDIATELY after trade execution
3. Thesis value before/after trade

**Current implementation**:
```javascript
// lib/email-enrichment.mjs lines 498-503
const portfolioDayPct = null;
// Impact metrics: isolating trade effect from market movement requires
// historical marks and portfolio state tracking (not implemented)
const thesisImpactPct = null;
const portfolioImpactPct = null;
```

Comment accurately describes limitation.

### Why This Is Hard

**Market movement vs trade effect**:
- Trade executes at time T during market hours
- Prices change continuously
- To measure trade impact: need value(portfolio) at T-epsilon and T+epsilon
- To measure day return post-trade: need baseline value (yesterday close) + current value

**Current value snapshots**: Only captured once per day at 17:30 ART in daily marks, not at each trade execution.

### Approximation Available (With Limitations)

**For portfolio day return post-trade** (`portfolio.dayPctAfter`):

Can compute if:
1. Daily marks ran today (have today's value snapshot)
2. Daily marks ran yesterday (have yesterday's value snapshot)
3. Trade alert fires AFTER daily marks (17:30 ART)

Then: `dayPctAfter = (today_value - yesterday_value) / yesterday_value`

**Limitation**: If trade fires before daily marks (during market hours), today's snapshot doesn't exist yet → unavailable.

**For trade impact** (`portfolioImpactPct`, `thesisImpactPct`):

CANNOT approximate accurately because:
- Need value immediately before/after trade
- Prices change between trades
- Cannot separate trade effect from market movement without synchronous snapshots

**Honest assessment**: `portfolio.dayPctAfter` can use existing daily marks IF trade fires post-marks. Trade impact metrics require execution-time snapshots (not implemented).

### Minimal Implementation for Accurate Data

**Execution-time snapshots**:
```javascript
// In runner, before applying trade:
const portfolioValueBefore = sum(allActiveTakes.map(t => value(t, quotes)));
const thesisValueBefore = value(take, quotes);

// Apply trade
applyDraftProposal(take, signal.drift);

// After applying trade:
const portfolioValueAfter = sum(allActiveTakes.map(t => value(t, quotes)));
const thesisValueAfter = value(take, quotes);

const portfolioImpactPct = (portfolioValueAfter - portfolioValueBefore) / portfolioValueBefore;
const thesisImpactPct = (thesisValueAfter - thesisValueBefore) / thesisValueBefore;
```

**Implementation cost**: Changes to runner to capture snapshots at trade execution time. No schema change, quotes already available in runner context.

## 4. Recommendations

### Immediate (No Schema Changes)

1. **Timestamp semantics**: Document resolution in validation comments ✅
2. **Trade day return post-operation**: Implement using existing daily marks (with unavailable case when marks not ready)
3. **Per-thesis contributions**: Implement approximation with contamination detection (skip if trades today)

### Requires Code Changes (No Schema)

4. **Trade impact snapshots**: Add value capture before/after trade in runner
5. **Thesis name resolution**: Already available via `take.title`

### Requires Schema Extension (Out of Scope Without Authorization)

6. **Holdings daily snapshots**: For accurate contributions independent of trades
7. **Intraday value tracking**: For trade impact without approximation

## 5. Implementation Plan

**Phase 1 (This commit)**:
- Document timestamp semantics resolution
- Implement per-thesis contributions with approximation + contamination detection
- Implement portfolio day return post-trade using existing daily marks
- Mark trade impact as unavailable (blocked on execution-time snapshots)
- Add comprehensive producer→outbox tests for available/unavailable cases

**Phase 2 (Requires approval)**:
- Add execution-time value snapshots in runner for trade impact
- Consider holdings snapshots for accurate contributions

**Out of scope**:
- No new schema migrations without separate authorization
- No fabricated metrics where data unavailable
