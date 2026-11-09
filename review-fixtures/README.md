# Review Fixtures Summary

**Source**: a2b15ca (cursor/clarity-email-designs-b621)
**Generated**: 2026-11-09T00:29:44.018Z

## Files Generated

- digest-rich.html (19812 bytes, SHA256: 8c7610194f9880f5...)
- digest-rich.txt (1412 bytes, SHA256: 500238055ed95948...)
- digest-unavailable.html (10356 bytes, SHA256: 1cab0b25c419edb2...)
- digest-unavailable.txt (903 bytes, SHA256: 667d46b252805908...)
- trade-known-side.html (17432 bytes, SHA256: a738ee972cb90e87...)
- trade-known-side.txt (1447 bytes, SHA256: c1134e72dd0d67c7...)
- trade-null-side.html (17329 bytes, SHA256: 9ac89256fde64107...)
- trade-null-side.txt (1358 bytes, SHA256: 5ed46afe0105d594...)
- trade-unknown-side.html (17439 bytes, SHA256: f15c5347d05e6906...)
- trade-unknown-side.txt (1454 bytes, SHA256: 94a76b874ccbaa35...)
- manifest.json (2242 bytes, SHA256: 16d9a9ae49ef1034...)

## Coverage

### Digest Email
- ✅ **digest-rich.html**: Full portfolio data with theses and auto actions
- ✅ **digest-rich.txt**: Plain text version
- ✅ **digest-unavailable.html**: No baseline available case
- ✅ **digest-unavailable.txt**: Plain text version

### Trade Alert Email
- ✅ **trade-known-side.html**: Compra (buy) operation with full metrics
- ✅ **trade-known-side.txt**: Plain text version
- ✅ **trade-unknown-side.html**: Venta (sell) operation
- ✅ **trade-unknown-side.txt**: Plain text version
- ✅ **trade-null-side.html**: Null side (invalid enum) case
- ✅ **trade-null-side.txt**: Plain text version

## Features Demonstrated

### ✅ Implemented
- Portfolio day return with unified baseline
- Per-thesis day return with cashflow adjustment
- Thesis contribution to portfolio (PnL %)
- **Trade portfolio day return** (portfolioDayPct) ← **NEW**
- **Trade impact metrics** (thesisImpactPct, portfolioImpactPct) ← **NEW**
- Auto actions list
- Unsubscribe links (HTML + body)

### ❌ Unavailable (Documented)
- Per-thesis ticker contributions (requires holdings snapshots schema v22)
- Asset intraday % (requires intraday price data)

## Limitations

**PNG Screenshots**: Require browser rendering environment. Not included in this artifact.
To generate PNGs:
1. Serve HTML files locally
2. Use Playwright/Puppeteer to capture screenshots at:
   - Desktop (1280x720) light/dark
   - Mobile (375x667) light/dark

**Ticker Contributions**: Returns empty arrays (`contributions: []`) - accurate representation of unavailability without holdings snapshots.

## Verification

All HTML/text files contain:
- "Datos de ejemplo ONLY" label in title
- Valid unsubscribe URLs
- Proper data formatting

Run checksums:
```bash
sha256sum review-fixtures/*.{html,txt}
```
