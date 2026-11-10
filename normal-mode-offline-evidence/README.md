# Normal-Mode Offline Evidence — Synthetic Preview

## Overview

This package contains **normal-mode renderer evidence** (`isExample: false`) generated as **offline synthetic preview** from commit **91df55be67cae0584a6eb9c627a7587c35259046**.

**IMPORTANT**: This is **offline synthetic data**, NOT sent to real users. All filenames and manifest clearly mark this as synthetic/offline evidence.

## Purpose

Demonstrates that the normal-mode renderer (isExample: false) produces clean output **without any visible example warnings** in the email body, as required by P1 specifications.

## Mode

**Normal Mode** (`isExample: false`)
- NO visible "⚠️ DATOS DE EJEMPLO" label in email body content
- NO internal instruction text
- Clean production-ready rendering
- Offline synthetic data, clearly marked in filenames

## Contents

- **3 HTML templates**: synthetic-digest-positive-normal, synthetic-trade-buy-normal, synthetic-trade-sell-normal
- **3 TXT templates**: Plain text versions
- **12 PNGs**: Full-page screenshots (desktop 1280×1024, mobile 375×812, light and dark modes)
- **fixture-inputs.json**: Raw input data used to generate templates
- **manifest.json**: Full 40-char SHA, SHA256 checksums, byte counts, generator provenance

Total: 19 files, 1,471,826 bytes

## Separation from Labeled Fixtures

This package is **separate** from the labeled example-mode fixtures in `final-review-fixtures/`:
- Different directory: `normal-mode-offline-evidence/`
- Different filenames: Prefixed with `synthetic-` and suffixed with `-normal`
- Different manifest: Clearly states `"mode": "normal", "isExample": false, "synthetic": true, "offline": true`
- Different purpose: Proves normal renderer lacks warnings

## Generation

Generated with traceable reproducible command:
```bash
node scripts/generate-normal-mode-evidence.mjs 91df55be67cae0584a6eb9c627a7587c35259046
node scripts/generate-normal-mode-png.mjs
```

All inputs recorded in `fixture-inputs.json` for reproducibility.

## Verification

Inspect any HTML/TXT file in this package:
- ✅ NO "⚠️ DATOS DE EJEMPLO" warning visible in body
- ✅ NO internal instruction text
- ✅ Clean production-style rendering
- ✅ Filenames clearly marked as synthetic/offline

Source commit: **91df55be67cae0584a6eb9c627a7587c35259046**  
Generated: 2026-11-09 (UTC)
