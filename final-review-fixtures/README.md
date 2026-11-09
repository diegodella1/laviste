# Final Review Fixtures – 792d30a

Generated from commit **792d30ad1ee0a57ec37dd26fdb64efdee6e430b1**

Branch: `cursor/clarity-email-designs-b621`

## Contents

### Digest Templates
- **digest-rich**: Full portfolio data with asset movements
- **digest-unavailable**: Fallback when baseline marks unavailable
- **digest-loss**: Negative portfolio day (daily loss scenario)
- **digest-multi-thesis**: Same ticker (YPF) appears in multiple theses

### Trade Alert Templates
- **trade-compra**: Buy trade (side: 'compra')
- **trade-venta**: Sell trade (side: 'venta')  
- **trade-null-side**: Trade with null side (unknown/unavailable enum)
- **trade-zero**: Trade with genuine zero day return (0.0%, not null)
- **trade-null-impacts**: Trade with both impacts unavailable (null)

## Formats

Each template includes:
- **HTML** (`.html`) – Rich formatted email
- **Plain Text** (`.txt`) – Plain text fallback with visible "⚠️ DATOS DE EJEMPLO" label
- **PNG Screenshots** – Full-page captures:
  - Desktop: 1280×1024 (light & dark)
  - Mobile: 375×812 (light & dark)

Total: **54 fixture files** (9 HTML + 9 TXT + 36 PNG)

## Key Features

✅ **P1 FIXED**: Removed internal instruction "Quitar este renglón en producción"  
✅ **P1 VERIFIED**: Visible "Datos de ejemplo" label preserved in all fixtures  
✅ **P1 TESTED**: 6 automated tests prove normal mode lacks ANY warning  
✅ **P2 FIXED**: Numeric percentages in reasonPlain use es-AR format (1 decimal, comma, NNBSP)  
✅ **Semantic Coherence**: reasonPlain weight values match card data (18→23%, not 18→21%)  
✅ **Coverage Complete**: Zero, null impacts, loss, multi-thesis, unavailable variants  
✅ **Full-Page PNGs**: Desktop (1280×1024) and mobile (375×812), no 720px truncation  

## Validation

All fixture content validated against:
- Creative P1/P2 defects resolved
- Temporal constraints (ART day match, no future timestamps, no stale quotes)
- Preserve genuine zero, reject missing/unverified data
- Producer → event → outbox pipeline tested (751 tests passing)

## Manifest

See `manifest.json` for complete file inventory with SHA256 checksums and byte lengths.
