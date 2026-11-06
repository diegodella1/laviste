# Email Template Review Artifacts

**Generated:** 2026-11-06  
**Source Commit:** `c56c5a0f4676df317ad2f5ab4416a3d98cc2e0a6`

Design review artifacts for approved Clarity email templates. All fixtures labeled **"Datos de ejemplo"** – NOT production payloads.

## Fixtures

### Daily Digest Templates

1. **rich-digest** – Multi-thesis digest with real-shaped data
   - Portfolio: +2,8% day, +4,5% week
   - 2 theses with contributions and movers
   - 2 autoActions (buy PAMP, sell VIST)
   - Takeaway message present
   - Tip present

2. **zero-digest** – Known-zero day (flat portfolio)
   - Portfolio: 0,0% day, +1,2% week
   - 1 thesis with 0% return
   - No contributions, no movers
   - Demonstrates neutral "Sin cambio en el día" rendering

3. **unavailable-digest** – Unavailable data (honest unknown state)
   - Portfolio: null day, null week
   - No theses data
   - Demonstrates honest "no está disponible todavía" message
   - Does NOT falsely claim "no hubo movimientos"

### Trade Alert Templates

4. **trade-buy** – Compra simulada
   - Ticker: YPFD
   - Weight: 21,0% → 24,8% (+3,8 pp)
   - Asset day: +6,2%
   - Portfolio day: omitted (null)
   - Impact: thesis +0,5%, portfolio +0,2%
   - Reason: Drift rebalance

5. **trade-sell** – Venta simulada
   - Ticker: VIST
   - Weight: 26,4% → 22,5% (−3,9 pp)
   - Asset day: −0,8%
   - Portfolio day: omitted (null)
   - Impact: thesis −0,2%, portfolio −0,1%
   - Reason: Cap breach
   - Multiple thesis chips (2)

6. **trade-unknown-side** – Operación simulada (neutral, no inference)
   - Ticker: PAMP
   - Side: null
   - Label: "Operación simulada" (not Compra/Venta)
   - Weight: 18,0% → 20,0% (+2,0 pp)
   - Asset day: +1,5%
   - Demonstrates neutral rendering when side unavailable

## Format Details

Each fixture includes:
- `.html` – Full HTML email with inline CSS, dark mode support
- `.txt` – Plaintext equivalent

All use:
- Spanish `es-AR` locale
- NNBSP (`\u202F`) before percentage signs
- Comma as decimal separator
- Proper signed percentages with arrows
- ±X,X% unsigned thresholds
- >= 14px for informative/body text

## Remaining Gaps (Documented Honestly)

### Not Yet Populated

1. **alertsFired** – Array always empty
   - Schema exists but query not implemented
   - Would show asset movement alerts crossing threshold
   - Template ready, data source pending

2. **newsItems** – Array always empty
   - News system not integrated with email
   - Template ready, integration pending

3. **takeaway** – Manually specified or null
   - AI-generated summary not integrated
   - Currently requires manual input or omitted

4. **tip** – Manually specified or null
   - Tips system not wired to digest
   - Currently requires manual input or omitted

### Production Readiness

These artifacts demonstrate:
- ✅ Core template rendering (digest, trade)
- ✅ autoActions from persisted trades
- ✅ Portfolio/thesis metrics from marks
- ✅ User isolation
- ✅ ART day boundaries
- ✅ Neutral rendering for unknown data
- ✅ Honest unavailable vs empty distinction

**NOT production-ready until:**
- alertsFired population implemented
- News integration (if required)
- Takeaway/tip integration (if required)
- DesignBot creative review PASS

## Files

```
fixtures/email-review/
├── README.md                    # This file
├── MANIFEST.json               # SHA256 hashes and metadata
├── rich-digest.html            # 33 KB
├── rich-digest.txt             # 2.3 KB
├── zero-digest.html            # 15 KB
├── zero-digest.txt             # 1.1 KB
├── unavailable-digest.html     # 11 KB
├── unavailable-digest.txt      # 911 B
├── trade-buy.html              # 18 KB
├── trade-buy.txt               # 1.5 KB
├── trade-sell.html             # 19 KB
├── trade-sell.txt              # 1.5 KB
├── trade-unknown-side.html     # 18 KB
└── trade-unknown-side.txt      # 1.4 KB
```

## Verification

Check integrity:
```bash
cd fixtures/email-review
shasum -a 256 *.html *.txt
```

Compare against `MANIFEST.json` SHA256 values.

## Notes

- Fixtures use `isExample: true` → shows "Datos de ejemplo" chip
- Production payloads must use `isExample: false` (default)
- Source commit is the code state used to render these artifacts
- Artifacts committed in subsequent commit (no self-reference)
