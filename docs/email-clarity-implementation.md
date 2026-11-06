# Email Clarity Implementation Summary

**Date:** November 6, 2026  
**Status:** Draft PR ready for review  
**Design Approved:** Diego via DesignBot, Nov 6 18:25 ART

## Implementation Complete

### ✅ Core Templates
- **HTML templates** with approved Clarity design
  - `lib/email-templates/digest-html.mjs` - Daily digest
  - `lib/email-templates/trade-html.mjs` - Trade alerts
- **Plain text mirrors** for email client fallback
  - `lib/email-templates/digest-text.mjs`
  - `lib/email-templates/trade-text.mjs`
- **Spanish formatting** (es-AR, voseo)
  - `lib/email-templates/format.mjs`
  - Percentage: signed, 1 decimal, comma separator, NNBSP before %
  - Arrows (▲▼) for direction
  - Gain/loss labels in Spanish

### ✅ Design Features
- **Dark mode** via `@media (prefers-color-scheme: dark)` + `.force-dark` classes
- **Mobile responsive** at 390px and 1280px+ viewports
- **Email-client compatible** table layouts
- **Accessibility** with proper labels and alt text
- **XSS safety** with HTML escaping throughout
- **Link safety** including unsubscribe in body + List-Unsubscribe header

### ✅ Data Enrichment
Updated `email-alerts.mjs`:
- **Trade alerts** now capture:
  - `ticker`, `side`, `thesisName`, `reasonPlain`
  - `weightBeforePct`, `weightAfterPct`, `weightDeltaPct`
  - `assetDayPct`, `portfolioDayPct`
  - `thesisImpactPct`, `portfolioImpactPct`
  - `thesisNames[]` for multi-thesis tickers
- **Digest** accepts enriched structure:
  - `portfolio.dayPct`, `portfolio.weekPct`
  - `theses[]` with name, dayPct, contributions, movers
  - `takeaway`, `autoActions[]`, `alertsFired[]`, `tip`

### ✅ Testing
- **Comprehensive test suite** (`test/email-templates.test.mjs`)
  - 19 tests covering formatting, HTML/text parity, XSS safety, edge cases
  - All tests passing
- **Generated fixtures** with fictional data
  - Positive, negative, and zero/neutral cases
  - HTML and text versions for all variants
- **Screenshots** at 390px and 1280px, light and dark modes
  - `test/fixtures/email/screenshots/`

### ✅ Preserved Existing Behavior
- **Consent, dedupe, quiet hours** (22:00-08:00 ART)
- **Batching** (15-minute windows for trade alerts)
- **Scheduling** (digest at 18:00 ART same-day fix from PR74)
- **Thresholds** (asset 5%, portfolio 3% defaults)
- **List-Unsubscribe headers**

## Data Gaps & Remaining Work

### 🟡 P0: Missing Data Sources
These fields are passed through but need upstream data collection:

1. **Portfolio day/week returns**
   - `portfolio.dayPct` - Total portfolio day return (fraction)
   - `portfolio.weekPct` - Total portfolio week return (fraction)
   - **Source needed:** Portfolio valuation history or daily marks
   - **Denominator:** Previous close value for day, 7-day-ago close for week

2. **Thesis day returns**
   - `theses[].dayPct` - Each thesis's day return (fraction)
   - **Source needed:** Thesis value history or `value(take)` snapshots
   - **Denominator:** Previous close value for that thesis

3. **Contributions per ticker**
   - `contributions[].contribPct` - Aporte to thesis in % terms (fraction)
   - **Formula:** `(holdings[ticker].value_today - holdings[ticker].value_yesterday) / thesis.value_yesterday`
   - **Source needed:** Holdings-level daily marks or intraday recalc

4. **Movers with thesis names**
   - `movers[].thesisNames[]` - All theses containing this ticker
   - **Source needed:** Reverse lookup from ticker to takes where it's held
   - **Current:** `portfolioMovements[]` is flat with no thesis attribution

5. **Auto actions enrichment**
   - `autoActions[].ticker`, `.side`, `.reasonPlain`
   - **Source:** Already available in `runner.mjs` via `motivoFor()` and `signal.ticker`
   - **Gap:** Not persisted to `events_json` in trade alert groups
   - **Fix:** Pass enriched data from `recordTradeAlert` call site in runner

6. **Trade impacts (portfolio and thesis)**
   - `portfolioImpactPct` - Change in portfolio value attributable to this trade
   - `thesisImpactPct` - Change in thesis value attributable to this trade
   - **Formula:** `(value_after_trade - value_before_trade) / value_before_trade`
   - **Source needed:** Value snapshots before/after trade execution
   - **Note:** Distinct from `deltaPercent` (which was thesis value change)

7. **Weight changes for trades**
   - `weightBeforePct`, `weightAfterPct`, `weightDeltaPct`
   - **Source:** Holdings weight calculations before/after trade
   - **Current:** Not captured in trade metadata

### 🟢 P1: Optional Enhancements
- **Takeaway generation** - Pedagogical insight about day's movement
  - Can be rule-based (largest contributor + thesis name)
  - Or omitted if complex
- **Tips rotation** - Currently hardcoded, could rotate from a tips array
- **Deep links** - Trade alert link to specific operation or thesis detail page
- **Week return calculation** - Can be omitted if no defensible source yet

### 🔵 P2: Future Nice-to-Have
- **News items** - Already supported if `prefs.newsEnabled` and source available
- **Multiple auto actions in digest** - Template supports array, needs enrichment
- **Grouping N trades in single email** - Currently only 1 trade per alert email

## Metric Definitions & Denominators

### Portfolio Day Return
```
portfolio.dayPct = (portfolio_value_now - portfolio_value_yesterday_close) / portfolio_value_yesterday_close
```
- **Numerator:** Today's value minus yesterday's close
- **Denominator:** Yesterday's close value (all theses combined)
- **Unit:** Fraction (0.018 = 1.8%)

### Thesis Day Return
```
thesis.dayPct = (thesis_value_now - thesis_value_yesterday_close) / thesis_value_yesterday_close
```
- **Numerator:** This thesis's value change since yesterday close
- **Denominator:** This thesis's value at yesterday close
- **Unit:** Fraction

### Contribution to Thesis
```
contrib.contribPct = (holding_value_today - holding_value_yesterday) / thesis_value_yesterday
```
- **Numerator:** This holding's value change (units × price change)
- **Denominator:** Thesis value at yesterday close (NOT portfolio value)
- **Unit:** Fraction relative to thesis
- **Note:** Contributions sum to thesis.dayPct (approximately, accounting for cash/weights)

### Trade Impact (Portfolio)
```
portfolioImpactPct = (portfolio_value_after_trade - portfolio_value_before_trade) / portfolio_value_before_trade
```
- **Numerator:** Portfolio value change from executing this specific trade
- **Denominator:** Portfolio value immediately before this trade
- **Unit:** Fraction
- **Note:** Distinct from portfolio.dayPct (which is cumulative day result)

### Trade Impact (Thesis)
```
thesisImpactPct = (thesis_value_after_trade - thesis_value_before_trade) / thesis_value_before_trade
```
- **Numerator:** This thesis's value change from executing this specific trade
- **Denominator:** This thesis's value immediately before this trade
- **Unit:** Fraction

## Integration Points

### Runner → Email Alerts
In `lib/auto/runner.mjs`, `tryRecordTradeAlert()` needs to pass:
- `ticker` - from `signal.ticker`
- `side` - from `legs[0].side` or trade metadata
- `thesisName` - from `take.title`
- `reasonPlain` - from `motivoFor(signal, take)` (already exists)
- `thesisNames` - array of all thesis titles where ticker is held
- `weightBeforePct`, `weightAfterPct` - from holdings before/after
- `assetDayPct` - ticker's day return from quote cache
- `portfolioDayPct` - from portfolio day return calculation
- `thesisImpactPct`, `portfolioImpactPct` - from value snapshots

### Daily Marks → Digest
In daily marks or digest scheduler:
- Calculate `portfolio.dayPct` and `portfolio.weekPct`
- For each thesis with significant movement, calculate `dayPct`
- For top movers in each thesis, calculate contributions
- Resolve ticker → thesis names mapping
- Collect auto actions from events log with enriched data
- Check thresholds against both asset and portfolio levels

## Testing Strategy

### Unit Tests (Passing)
- Formatting functions (Spanish percentages, dates, arrows)
- HTML generation with various data combinations
- XSS safety and escaping
- Dark mode class application
- Text/HTML content parity

### Integration Tests (To Add)
- End-to-end email generation from enriched store data
- Threshold triggering with portfolio-level checks
- Multi-thesis ticker handling
- Auto action enrichment from runner events

### Manual QA
- Screenshots at 390px and 1280px verified
- Dark mode rendering checked
- Email client compatibility (Gmail, Apple Mail, Outlook)
- Link functionality (unsubscribe, deep links)

## Files Changed

### New Files
- `lib/email-templates/format.mjs` - Formatting utilities
- `lib/email-templates/digest-html.mjs` - Digest HTML template
- `lib/email-templates/digest-text.mjs` - Digest text template
- `lib/email-templates/trade-html.mjs` - Trade HTML template
- `lib/email-templates/trade-text.mjs` - Trade text template
- `test/email-templates.test.mjs` - Test suite
- `scripts/generate-email-fixtures.mjs` - Fixture generator
- `scripts/screenshot-email-fixtures.mjs` - Screenshot generator
- `test/fixtures/email/*.html` - HTML fixtures (6 files)
- `test/fixtures/email/*.txt` - Text fixtures (6 files)
- `test/fixtures/email/screenshots/*.png` - Screenshots (12 files)
- `docs/email-clarity-implementation.md` - This document

### Modified Files
- `lib/email-alerts.mjs` - Enriched data structure, new template builders

### Unchanged (Preserved)
- `lib/email.mjs` - Email transport and outbox
- `lib/email-worker.mjs` - Email processing worker
- `lib/auto/runner.mjs` - Auto trading runner (needs integration)
- `lib/auto/reasons.mjs` - Reason code mappings

## Next Steps

1. **Review draft PR** - Verify templates match approved design
2. **Integrate runner enrichment** - Pass complete data from `tryRecordTradeAlert`
3. **Implement portfolio/thesis metrics** - Daily marks or value history
4. **Add contribution calculations** - Holdings-level impact to thesis
5. **Wire digest enrichment** - Connect scheduler to enriched data
6. **Test with real (simulated) data** - Verify calculations and formatting
7. **Deploy to staging** - Verify email rendering in actual clients
8. **Monitor and iterate** - Collect feedback, refine as needed

## Compliance Notes

- **NO real email sending** during development (test fixtures only)
- **NO production DB changes** (draft PR, not merged)
- **NO secrets/env modifications**
- **NO compose.yaml edits**
- **Simulated/practice disclaimers** preserved throughout
- **Fictional test data** clearly labeled ("Datos de ejemplo")
- **User consent and dedupe** logic unchanged
