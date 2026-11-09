# Email Template Review Fixtures — Labeled Example Mode

## Overview

This package contains **labeled example mode** (`isExample: true`) email template fixtures generated from commit **91df55be67cae0584a6eb9c627a7587c35259046** after fixing all P1 and P2 creative defects.

## Fixes Applied

### P1 Defects Fixed (All Critical)

1. **AlertsFired Schema Consistency** (`lib/email-alerts.mjs`, `lib/email-templates/digest-{html,text}.mjs`)
   - Runtime producer uses `dayPct` instead of `value`
   - Templates use `ticker` instead of `symbol`
   - Both HTML and TXT consistently render: ticker + day variation + threshold + thesis names

2. **Null-Side Neutral Text** (`lib/email-templates/trade-text.mjs`)
   - Trade alerts with `side === null` use neutral "Operación simulada"
   - No contradictory "Venta"/"Compra" phrasing
   - Consistent "esta operación simulada" throughout

3. **Zero Portfolio Neutral Styling** (`lib/email-templates/trade-html.mjs`)
   - Genuine `portfolioDayPct === 0` uses neutral `bg-surface`/`c-ink` styling
   - Clearly distinguished from gain (green) and loss (red) in both light and dark modes

4. **Daily Asset Thesis Attribution** (`lib/email-templates/trade-{html,text}.mjs`)
   - Trade template "Activo · día" section now includes thesis chips/names in HTML
   - TXT version includes thesis names inline (e.g., "GGAL en el día: 0,0 % (Financiero Argentino)")
   - Fixes observed defect in trade-zero.html lines 130-134 and trade-zero.txt line 11

### P2 Defects Fixed (Important)

1. **Dark Mode Contextual Contrast** (both `digest-html.mjs` and `trade-html.mjs`)
   - Added `.bg-accent .c-muted` to contextual override rules
   - "Por qué" overline achieves 7.75:1 contrast (WCAG AA compliant ≥4.5:1)

2. **Runtime Reason Formatting**
   - Auditor confirmed `formatCapMotivo`/`formatDriftMotivo` already use NNBSP
   - No additional changes needed

## Contents

- **9 HTML templates**: digest-rich, digest-unavailable, digest-loss, digest-multi-thesis, trade-compra, trade-venta, trade-null-side, trade-zero, trade-null-impacts
- **9 TXT templates**: Plain text versions of all HTML templates
- **36 PNGs**: Full-page screenshots (desktop 1280×1024, mobile 375×812, light and dark modes)
- **manifest.json**: Full 40-char SHA, SHA256 checksums, and byte counts for all 54 files

## Mode

**Labeled Example Mode** (`isExample: true`)
- Visible "⚠️ DATOS DE EJEMPLO · No es la cartera de un usuario real." label in all fixtures
- Clearly marked as synthetic data for review purposes
- Intended for design/creative review, NOT for testing normal mode rendering

For **normal-mode evidence** (isExample: false), see separate package: `normal-mode-offline-evidence/`

## Test Results

All 751 tests pass, including:
- Schema consistency tests (alertsFired/movers use `ticker`)
- XSS safety tests with escaped HTML entities
- Template parity tests (HTML and TXT)
- Creative regression tests
- Thesis attribution tests

## Verification

To verify the P1-4 fix:
- Check `trade-zero.html` lines 130-137: "Activo · día" section now includes "Tesis: Financiero Argentino" chip
- Check `trade-zero.txt` line 11: Now reads "GGAL en el día: 0,0 % (Financiero Argentino)"

## Generation

Generated with reproducible command:
```bash
node scripts/generate-final-fixtures.mjs
node scripts/generate-final-fixtures-png.mjs
node scripts/update-manifest-hashes.mjs
```

Source commit: **91df55be67cae0584a6eb9c627a7587c35259046**  
Generated: 2026-11-09 (UTC)
