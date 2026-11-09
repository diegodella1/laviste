# Email Template Review Fixtures — Post Creative Re-pass

## Overview

This package contains email template fixtures generated from commit `73fa49b47f261bde146d76f1f68128f0f049aaf5` after fixing P1 and P2 creative defects identified in the DesignBot re-review of `792d30ad`.

## Fixes Applied

### P1 Defects Fixed

1. **AlertsFired Schema Consistency**: Fixed runtime producer to use `dayPct` instead of `value`, and templates to use `ticker` instead of `symbol`. Both HTML and TXT now consistently render ticker, day variation, threshold, and all user thesis names.

2. **Null-Side Neutral Text**: Trade alerts with `side === null` now use neutral "Operación simulada" throughout both HTML and TXT, eliminating contradictory "Venta"/"Compra" phrasing.

3. **Zero Portfolio Day Neutral Styling**: Genuine `portfolioDayPct === 0` now uses neutral ink/background styling (slate/white) in both light and dark modes, clearly distinguished from positive (green) and negative (red) results.

4. **Daily Asset Thesis Attribution**: (Note: Already present in movers, no additional change needed for GGAL row thesis chips)

### P2 Defects Fixed

1. **Dark Mode Contextual Contrast**: Added `.bg-accent .c-muted` to contextual override rules in both dark mode and force-dark, ensuring "Por qué" overline text achieves WCAG AA contrast (≥4.5:1) with `#CBD5E1` on `#1E3A5F`.

2. **Runtime Reason Formatting**: Auditor confirmed `formatCapMotivo` and `formatDriftMotivo` already use NNBSP; no additional broad percent rewriting needed.

## Contents

- **9 HTML templates**: digest-rich, digest-unavailable, digest-loss, digest-multi-thesis, trade-compra, trade-venta, trade-null-side, trade-zero, trade-null-impacts
- **9 TXT templates**: Plain text versions of all HTML templates
- **36 PNGs**: Full-page screenshots (desktop 1280×1024, mobile 375×812, light and dark modes) for all 9 cases
- **manifest.json**: Full 40-char SHA, SHA256 checksums, and byte counts for all 54 files

## Test Results

All 751 tests pass, including:
- Schema consistency tests (alertsFired uses `ticker`, movers use `ticker`)
- XSS safety tests with escaped HTML entities
- Template parity tests (HTML and TXT)
- Creative regression tests

## Notes

- All fixtures include visible "Datos de ejemplo" label (`isExample: true`)
- Numeric percentages use es-AR format: 1 decimal, comma, NNBSP before %
- Ticker contributions remain unavailable (empty arrays) - documented limitation
- Generated: 2026-11-09 (UTC)
