# Asset Day-Change History Blocker

**Date:** 2026-11-07  
**Status:** Documented blocker for asset-level threshold alerts (Spec §2, §5.1, §6 line 180)

## Approved Requirement

From `SPEC-EMAIL-LAVISTE-CLARITY-2026-11-06_280f.md`:

- **§2 Principios**: "Umbrales: Activo ±5 % · cartera ±3 %" (defaults, respect user prefs)
- **§5.1**: "Alertas disparadas — ítems que cruzaron ±5 % (activo) o ±3 % (cartera)"
- **§6 line 180**: `theses[].movers[]` {symbol, `dayPct`, thesisNames[]} — **Gap P0**
- **§6 line 189**: "también enviar si `|portfolio.dayPct| >= thresholdPortfolioPct`" — **Gap P1**
- **§6 line 182**: `alertsFired[]` {symbol, `dayPct`, thesisNames[], threshold} — **Gap P0/P1**

## Current System Limitations

### 1. No Individual Asset Price History

**Evidence:**

```sql
-- quote_cache: ONLY current price (PRIMARY KEY = ticker, single row)
CREATE TABLE IF NOT EXISTS quote_cache(
  ticker TEXT PRIMARY KEY, 
  price REAL NOT NULL, 
  as_of TEXT NOT NULL, 
  provider TEXT NOT NULL, 
  stale INTEGER NOT NULL DEFAULT 0
);

-- take_daily_marks: Aggregate take value, NOT per-asset prices
CREATE TABLE IF NOT EXISTS take_daily_marks(
  take_id TEXT NOT NULL REFERENCES takes(id),
  user_id TEXT REFERENCES users(id),
  day TEXT NOT NULL,
  value REAL NOT NULL,  -- Total take value
  invested REAL NOT NULL,
  bench_id TEXT,
  bench_price REAL,
  eligible INTEGER NOT NULL,
  PRIMARY KEY(take_id, day)
);
```

**Quotes API** (`lib/quotes.mjs:191-195, 323`):
- `getCached(ticker)` returns only current price
- No `getHistoricalPrice()` or `getPreviousClose()` method
- Adapters only fetch current `regularMarketPrice` (Yahoo) or live price (data912)

### 2. Existing Providers DO Expose Day-Change Fields (Currently Discarded)

**CORRECTED FINDING:** Provider adapters already receive day-change data but discard it.

**Yahoo Finance adapter** (`lib/quotes.mjs:74-92`):
```javascript
const data = await fetchJson(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`, fetcher);
const meta = data?.chart?.result?.[0]?.meta;
const price = meta?.regularMarketPrice;  // Captured
// AVAILABLE BUT DISCARDED:
// meta?.chartPreviousClose or meta?.previousClose
// meta?.regularMarketChange (absolute)
// meta?.regularMarketChangePercent (percentage units, not fraction)
```

**data912 adapter** (`lib/quotes.mjs:46-61`):
```javascript
const cedears = await fetchJson('https://data912.com/live/arg_cedears', fetcher);
const row = cedears.find(r => r.symbol === benchmark.data912);
// row.c = current price (captured)
// AVAILABLE BUT DISCARDED:
// row.pct_change (percentage units: 2.5 means +2.5%, not 0.025)
```

**Demo adapter**: Static prices only, no day-change data.

**Conclusion:** No new service integration required. Existing provider responses contain day-change fields; adapters simply don't capture them.

### 3. Take Holdings Are Current State Only

Holdings in `take` object (`lib/engine.mjs:39`) store only current `price`:
```javascript
holding: {ticker, units, price, entryPrice, referencePrice}
```

Holdings are NOT persisted per daily mark; only aggregate value/invested captured.

## Consequence

**Cannot compute asset day returns** required for:
1. `movers[].dayPct` in digest (show which assets moved and by how much)
2. `alertsFired[]` when asset crosses ±5% threshold
3. Asset-level threshold gate in `scheduleDailyDigest`

Portfolio day return works (uses aggregate take values in `take_daily_marks`), but individual asset day % is unavailable.

## Proposed Minimal Extension (Design Only)

**NO NEW SERVICE INTEGRATION REQUIRED:** Existing providers expose day-change fields.

### Option A: Capture Provider Day-Change Fields (Preferred)

Extend `quote_cache` to capture day-change fields from providers:

```sql
ALTER TABLE quote_cache ADD COLUMN day_change_pct REAL;
ALTER TABLE quote_cache ADD COLUMN prev_close REAL;
ALTER TABLE quote_cache ADD COLUMN change_as_of TEXT;
-- day_change_pct: fraction units (0.025 = +2.5%)
-- prev_close: absolute price from previous session
-- change_as_of: which session this change represents (verify same day)
```

**Capture in adapters**:

```javascript
// data912 adapter
const row = cedears.find(r => r.symbol === sym);
if (row?.c && Number.isFinite(row.pct_change)) {
  // UNITS: row.pct_change is percentage (2.5 means +2.5%)
  // Convert to fraction: 2.5 → 0.025
  const dayChangePct = row.pct_change / 100;
  
  // Reject invalid: if pct_change <= -100%, data is wrong
  if (dayChangePct > -1.0) {
    quote.dayChangePct = dayChangePct;
    quote.prevClose = row.c / (1 + dayChangePct);  // Compute from current
  }
}

// Yahoo adapter
const meta = data?.chart?.result?.[0]?.meta;
if (meta?.regularMarketPrice && Number.isFinite(meta.regularMarketChangePercent)) {
  // UNITS: regularMarketChangePercent is percentage (2.5 means +2.5%)
  const dayChangePct = meta.regularMarketChangePercent / 100;
  
  // Reject invalid
  if (dayChangePct > -1.0) {
    quote.dayChangePct = dayChangePct;
  }
  // Use chartPreviousClose or previousClose if available
  if (Number.isFinite(meta.chartPreviousClose)) {
    quote.prevClose = meta.chartPreviousClose;
  } else if (Number.isFinite(meta.previousClose)) {
    quote.prevClose = meta.previousClose;
  }
}
```

**Validation Requirements (Critical)**:
1. **Units normalization**: Provider percentages → fractions at adapter boundary
2. **Preserve zero**: `dayChangePct === 0` is meaningful (flat day), do NOT drop with `if (q?.dayChangePct)`
3. **Reject invalid data**: `dayChangePct <= -1.0` (≤-100%) is wrong, omit
4. **Session verification**: Ensure `change_as_of` matches expected ART session (don't use Friday's change on Monday)
5. **Stale handling**: If quote is stale, day-change may be from wrong session → omit
6. **Scope by user**: Asset day % only for tickers in user's takes
7. **All thesis names**: When reporting asset movement, include ALL theses containing that ticker

**Usage in digest**:
```javascript
// Get current quote with day-change
const q = quotes.getCached(ticker);

// CORRECT: preserve meaningful zero
if (q && Number.isFinite(q.dayChangePct)) {
  const assetDayPct = q.dayChangePct;  // Already fraction
  // Check threshold
  if (Math.abs(assetDayPct) >= prefs.thresholdAssetPct / 100) {
    // Asset crossed threshold
  }
}

// INCORRECT: drops zero
if (q?.dayChangePct) {  // WRONG: excludes 0
  // ...
}
```

**Pros:**
- No new service integration (providers already expose this)
- Smaller storage footprint than holdings JSON
- Available immediately after refresh (no multi-day accumulation)
- Can backfill if provider response includes previous close

**Cons:**
- Provider-dependent (may not have for all tickers, especially benchmarks)
- Mixed sessions/timezones (Yahoo regular market vs BYMA close)
- Stale handling complexity (day-change from wrong session must be rejected)
- Cannot compute asset day % for arbitrary baseline (only yesterday)

### Option B: Holdings Snapshot in Daily Marks

Extend `take_daily_marks` to capture full holdings state:

```sql
ALTER TABLE take_daily_marks ADD COLUMN holdings_json TEXT;
-- JSON array: [{ticker, units, price}] at mark time
```

**Capture during daily marks** (`lib/daily-marks.mjs:82-90`):
```javascript
scoped.upsertDailyMark({
  takeId: take.id,
  day,
  value: val,
  invested: take.invested,
  holdingsJson: JSON.stringify(
    take.holdings.map(h => ({ticker: h.ticker, units: h.units, price: h.price}))
  ),
  benchId: take.benchmarkId || null,
  benchPrice: Number.isFinite(bench?.price) ? bench.price : null,
  eligible: markEligible(take, val),
});
```

**Compute asset day return**:
```javascript
// Get baseline and today holdings from marks
const priorMark = loadMark(takeId, baselineDay);
const todayMark = loadMark(takeId, today);
const priorHoldings = JSON.parse(priorMark.holdings_json || '[]');
const todayHoldings = JSON.parse(todayMark.holdings_json || '[]');

// Asset day %: (todayPrice - priorPrice) / priorPrice
const priorH = priorHoldings.find(h => h.ticker === ticker);
const todayH = todayHoldings.find(h => h.ticker === ticker);
if (priorH && todayH && priorH.price > 0) {
  const assetDayPct = (todayH.price - priorH.price) / priorH.price;
  // Preserve zero, reject invalid
  if (assetDayPct > -1.0) {
    // Valid day return
  }
}
```

**Pros:**
- Respects unified baseline exactly (same ART day for all assets)
- Captures actual prices at mark session (~17:30 ART)
- No provider dependency (works even if provider day-change unavailable)
- Extensible (can compute arbitrary baseline day returns)
- No timezone/session mismatch

**Cons:**
- Increases row size (holdings JSON ~several KB per take)
- Backfill impossible (historical holdings not preserved)
- Requires multi-day accumulation (can't use on first day)

## Rollout and Limitations

### Capture Date/Session/Timezone
- **ART session baseline**: Marks written after 17:30 ART on weekdays (`DAILY_MARKS_HOUR`, `DAILY_MARKS_MINUTE`)
- **Calendar day**: `dayInBuenosAires(now)` determines which ART day the mark belongs to
- Holdings snapshot captures prices as of take refresh (quotes `asOf` can lag market close)

### Stale Handling
- If mark day has `eligible=0`, asset day % should be unavailable (not computed from ineligible data)
- If baseline day mark missing or ineligible, all asset day % unavailable for that comparison

### Rollout
- Migration adds column (Option A: `holdings_json`; Option B: `prev_close`)
- Forward-only: no backfill possible (historical holdings not preserved)
- First digest after migration: may have no valid baseline (need 1-5 days to accumulate)

### Retention
- `take_daily_marks` has no explicit retention policy currently
- Holdings JSON increases storage; consider retention (e.g., keep 90 days for digests, older for aggregate stats only)

### Tests
- Seeded marks with known holdings at baseline and today
- Compute asset day % and verify against expected
- Missing baseline day => asset day % unavailable
- Asset added/removed between baseline and today => handle gracefully (omit if not in both)
- Zero units => omit (no longer held)
- Zero price change => 0.0%, neutral rendering

## Recommendation

**Option A (Provider Day-Change)** for immediate implementation:
1. Providers already expose day-change fields (no new integration)
2. Smaller storage footprint (3 columns vs large JSON)
3. Available immediately after refresh
4. Sufficient for yesterday-vs-today digest use case

**Limitations of Option A:**
- Cannot compute arbitrary baseline day returns (only yesterday)
- Unified baseline requires all assets from same session
- Provider-dependent (may not cover all tickers)

**Option B (Holdings Snapshot)** for future consideration if:
- Multi-day baseline window needed (2-5 days back)
- Provider day-change unreliable or unavailable
- Need arbitrary historical comparisons

## Implementation Validation Checklist

When implementing Option A (Provider Day-Change):

1. **Units**: Normalize percentage → fraction at adapter boundary
2. **Zero preservation**: `dayChangePct === 0` is valid, do NOT drop
3. **Invalid data**: Reject `dayChangePct <= -1.0` (≤-100%)
4. **Session verification**: Verify `as_of` matches expected session
5. **Stale handling**: Omit day-change if quote is stale
6. **User scoping**: Only compute for tickers in user's takes
7. **Thesis names**: Include ALL theses containing the ticker
8. **Threshold gate**: Both asset AND portfolio thresholds trigger digest
9. **Tests**: Seeded quote_cache with known day-change → verify movements, alertsFired, threshold gates

## Next Steps

1. **Diego approval**: Waiting on quote_cache schema extension approval
2. **Do NOT implement migration yet** until approved
3. **When approved**:
   - Write migration `applyVNN` to add columns to `quote_cache`
   - Update adapters to capture day-change fields with validation
   - Update `quote_cache` put/get to handle new columns
   - Implement asset movements in `email-enrichment.mjs`
   - Wire asset threshold in `scheduleDailyDigest`
   - Add producer->outbox tests with seeded quotes

**Current status:** Design documented, awaiting approval. No implementation yet.
