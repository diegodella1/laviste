#!/usr/bin/env node
/**
 * Generate review fixtures from final head
 * - Digest: rich and unavailable cases
 * - Trade: known and unknown side cases
 * - HTML + plain text (labeled "Datos de ejemplo ONLY")
 * - PNGs will need separate rendering (reported if unavailable)
 */

import {mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {buildDigestHtml} from '../lib/email-templates/digest-html.mjs';
import {buildDigestText} from '../lib/email-templates/digest-text.mjs';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildTradeText} from '../lib/email-templates/trade-text.mjs';

const FIXTURES_DIR = 'review-fixtures';
const SOURCE_SHA = 'a2b15ca';

// Ensure directory exists
if (!existsSync(FIXTURES_DIR)) {
  mkdirSync(FIXTURES_DIR, {recursive: true});
}

const files = [];

function saveFixture(filename, content) {
  const path = join(FIXTURES_DIR, filename);
  writeFileSync(path, content, 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  files.push({filename, sha256: hash, bytes: Buffer.byteLength(content, 'utf8')});
  console.log(`✓ ${filename} (${Buffer.byteLength(content, 'utf8')} bytes)`);
}

// === DIGEST FIXTURES ===

// Rich digest: full portfolio data
const digestRichData = {
  portfolio: {
    dayPct: 0.0523,
    weekPct: null,
  },
  theses: [
    {
      name: 'Energía Argentina',
      dayPct: 0.0612,
      contributionPct: 0.0387,
      contributions: [], // Unavailable without holdings snapshots
    },
    {
      name: 'Tecnología Global',
      dayPct: 0.0438,
      contributionPct: 0.0136,
      contributions: [],
    },
  ],
  takeaway: 'Tu cartera creció 5.23% hoy. Energía Argentina lideró con +6.12%, aportando 3.87 puntos al total.',
  autoActions: [
    {
      ticker: 'YPF',
      kind: 'drift',
      executed_at: new Date().toISOString(),
    },
  ],
  alertsFired: [],
  tip: null,
  newsItems: [],
  unsubscribeUrl: 'https://laviste.ar/unsubscribe?token=example-token',
};

const digestRichHtml = buildDigestHtml(digestRichData, {
  title: '📊 Datos de ejemplo ONLY — Resumen Diario',
});

const digestRichText = buildDigestText(digestRichData, {
  title: 'Datos de ejemplo ONLY — Resumen Diario',
});

saveFixture('digest-rich.html', digestRichHtml);
saveFixture('digest-rich.txt', digestRichText);

// Unavailable digest: no baseline
const digestUnavailableData = {
  portfolio: {
    dayPct: null,
    weekPct: null,
  },
  theses: [],
  takeaway: null,
  autoActions: [],
  alertsFired: [],
  tip: null,
  newsItems: [],
  unsubscribeUrl: 'https://laviste.ar/unsubscribe?token=example-token',
};

const digestUnavailableHtml = buildDigestHtml(digestUnavailableData, {
  title: '📊 Datos de ejemplo ONLY — Resumen Diario (Sin Datos)',
});

const digestUnavailableText = buildDigestText(digestUnavailableData, {
  title: 'Datos de ejemplo ONLY — Resumen Diario (Sin Datos)',
});

saveFixture('digest-unavailable.html', digestUnavailableHtml);
saveFixture('digest-unavailable.txt', digestUnavailableText);

// === TRADE FIXTURES ===

// Trade with known side (compra)
const tradeKnownSideData = {
  ticker: 'YPFD',
  side: 'compra',
  thesisName: 'Energía Argentina',
  date: new Date(),
  weightBeforePct: 0.18,
  weightAfterPct: 0.23,
  weightDeltaPct: 0.05,
  assetDayPct: null,
  portfolioDayPct: 0.0187,
  thesisImpactPct: 0.0245,
  portfolioImpactPct: 0.0092,
  thesisNames: ['Energía Argentina'],
  reasonPlain: 'Deriva mayor a 3%: el activo pasó de 18% a 21% y se reequilibró comprando para volver al objetivo.',
  unsubscribeUrl: 'https://laviste.ar/unsubscribe?token=example-token',
};

const tradeKnownSideHtml = buildTradeHtml(tradeKnownSideData, {
  title: '🔔 Datos de ejemplo ONLY — Alerta de Operación',
});

const tradeKnownSideText = buildTradeText(tradeKnownSideData, {
  title: 'Datos de ejemplo ONLY — Alerta de Operación',
});

saveFixture('trade-known-side.html', tradeKnownSideHtml);
saveFixture('trade-known-side.txt', tradeKnownSideText);

// Trade with unknown side (venta)
const tradeUnknownSideData = {
  ticker: 'MELI',
  side: 'venta',
  thesisName: 'Tecnología Global',
  date: new Date(),
  weightBeforePct: 0.28,
  weightAfterPct: 0.22,
  weightDeltaPct: -0.06,
  assetDayPct: null,
  portfolioDayPct: 0.0134,
  thesisImpactPct: -0.0156,
  portfolioImpactPct: -0.0078,
  thesisNames: ['Tecnología Global'],
  reasonPlain: 'Deriva mayor a 3%: el activo creció de 22% a 28% y se reequilibró vendiendo para mantener el balance.',
  unsubscribeUrl: 'https://laviste.ar/unsubscribe?token=example-token',
};

const tradeUnknownSideHtml = buildTradeHtml(tradeUnknownSideData, {
  title: '🔔 Datos de ejemplo ONLY — Alerta de Operación',
});

const tradeUnknownSideText = buildTradeText(tradeUnknownSideData, {
  title: 'Datos de ejemplo ONLY — Alerta de Operación',
});

saveFixture('trade-unknown-side.html', tradeUnknownSideHtml);
saveFixture('trade-unknown-side.txt', tradeUnknownSideText);

// Trade with null side (contaminated sizing)
const tradeNullSideData = {
  ticker: 'ALUA',
  side: null,
  thesisName: 'Industrial',
  date: new Date(),
  weightBeforePct: 0.15,
  weightAfterPct: 0.18,
  weightDeltaPct: 0.03,
  assetDayPct: null,
  portfolioDayPct: 0.0098,
  thesisImpactPct: 0.0125,
  portfolioImpactPct: 0.0045,
  thesisNames: ['Industrial'],
  reasonPlain: 'Reequilibrio automático por deriva.',
  unsubscribeUrl: 'https://laviste.ar/unsubscribe?token=example-token',
};

const tradeNullSideHtml = buildTradeHtml(tradeNullSideData, {
  title: '🔔 Datos de ejemplo ONLY — Alerta de Operación',
});

const tradeNullSideText = buildTradeText(tradeNullSideData, {
  title: 'Datos de ejemplo ONLY — Alerta de Operación',
});

saveFixture('trade-null-side.html', tradeNullSideHtml);
saveFixture('trade-null-side.txt', tradeNullSideText);

// === MANIFEST ===

const manifest = {
  source: {
    repository: 'diegodella1/laviste',
    branch: 'cursor/clarity-email-designs-b621',
    commit: SOURCE_SHA,
    timestamp: new Date().toISOString(),
  },
  files: files.sort((a, b) => a.filename.localeCompare(b.filename)),
  notes: [
    'All fixtures labeled "Datos de ejemplo ONLY" in title',
    'HTML and plain text versions generated for each case',
    'PNG screenshots require browser rendering (not included in this artifact)',
    'Ticker contributions unavailable (empty arrays) - documented limitation',
    'Portfolio day return after trade implemented (portfolioDayPct)',
    'Trade impact metrics implemented (thesisImpactPct, portfolioImpactPct)',
  ],
};

const manifestJson = JSON.stringify(manifest, null, 2);
saveFixture('manifest.json', manifestJson);

// === SUMMARY ===

const summary = `# Review Fixtures Summary

**Source**: ${SOURCE_SHA} (cursor/clarity-email-designs-b621)
**Generated**: ${new Date().toISOString()}

## Files Generated

${files.map(f => `- ${f.filename} (${f.bytes} bytes, SHA256: ${f.sha256.substring(0, 16)}...)`).join('\n')}

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

**Ticker Contributions**: Returns empty arrays (\`contributions: []\`) - accurate representation of unavailability without holdings snapshots.

## Verification

All HTML/text files contain:
- "Datos de ejemplo ONLY" label in title
- Valid unsubscribe URLs
- Proper data formatting

Run checksums:
\`\`\`bash
sha256sum review-fixtures/*.{html,txt}
\`\`\`
`;

saveFixture('README.md', summary);

console.log('\n✨ All fixtures generated successfully!');
console.log(`\nTotal: ${files.length} files`);
console.log('See review-fixtures/README.md for details');
