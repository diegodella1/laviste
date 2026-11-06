/**
 * Generate email artifacts for creative review.
 * Outputs: test payloads, production-render artifacts to /opt/cursor/artifacts/
 */

import {writeFileSync, mkdirSync} from 'fs';
import {buildDigestHtml} from '../lib/email-templates/digest-html.mjs';
import {buildDigestText} from '../lib/email-templates/digest-text.mjs';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildTradeText} from '../lib/email-templates/trade-text.mjs';

const outDir = '/opt/cursor/artifacts';
mkdirSync(outDir, {recursive: true});

const digestPayload = {
  userName: 'Diego',
  date: new Date('2026-11-06T21:00:00-03:00'),
  portfolio: {
    dayPct: 0.024,
    weekPct: 0.067,
  },
  theses: [
    {
      name: 'Energía argentina',
      dayPct: 0.032,
      contributions: [
        {ticker: 'YPFD', dayPct: 0.045, thesisNames: ['Energía argentina']},
        {ticker: 'PAMP', dayPct: 0.028, thesisNames: ['Energía argentina', 'Exportadoras']},
      ],
      movers: [
        {symbol: 'YPFD', dayPct: 0.045, thesisNames: ['Energía argentina']},
      ],
    },
    {
      name: 'Exportadoras',
      dayPct: 0.018,
      contributions: [
        {ticker: 'PAMP', dayPct: 0.028, thesisNames: ['Energía argentina', 'Exportadoras']},
      ],
      movers: [],
    },
  ],
  autoActions: [
    {ticker: 'YPFD', side: 'compra', thesisName: 'Energía argentina', dateTime: '2026-11-06 18:35', reasonShort: 'Rebalanceo'},
  ],
  alertsFired: [
    {ticker: 'PAMP', dayPct: 0.056, thesisNames: ['Energía argentina', 'Exportadoras']},
  ],
  newsItems: [],
  prefs: {
    thresholdAssetPct: 5.0,
    thresholdPortfolioPct: 3.0,
  },
  takeaway: 'La cartera subió por el rally de energía y exportadoras.',
  isExample: false,
};

const tradePayload = {
  ticker: 'YPFD',
  side: 'compra',
  thesisName: 'Energía argentina',
  date: new Date('2026-11-06T18:35:00-03:00'),
  weightBeforePct: 0.20,
  weightAfterPct: 0.25,
  weightDeltaPct: 0.05,
  assetDayPct: 0.045,
  portfolioDayPct: 0.024,
  reasonPlain: 'La tesis rebalanceó: YPFD subió +4,5 % y pasó del 20,0 % al 25,0 % del portafolio.',
  thesisImpactPct: 0.012,
  portfolioImpactPct: 0.004,
  thesisNames: ['Energía argentina'],
  deepLink: 'https://laviste.diegodella.ar/app#/take/abc123',
  isExample: false,
};

const digestHtml = buildDigestHtml(digestPayload);
const digestText = buildDigestText(digestPayload);
const tradeHtml = buildTradeHtml(tradePayload);
const tradeText = buildTradeText(tradePayload);

writeFileSync(`${outDir}/digest-production.html`, digestHtml);
writeFileSync(`${outDir}/digest-production.txt`, digestText);
writeFileSync(`${outDir}/trade-production.html`, tradeHtml);
writeFileSync(`${outDir}/trade-production.txt`, tradeText);

// Generate test payloads as JSON
const digestTestPayload = {
  ...digestPayload,
  isExample: true,
  bodyHtml: buildDigestHtml({...digestPayload, isExample: true}),
  bodyText: buildDigestText({...digestPayload, isExample: true}),
  subject: `Tu cartera hoy +2,4 % · resumen de práctica`,
};

const tradeTestPayload = {
  ...tradePayload,
  isExample: true,
  bodyHtml: buildTradeHtml({...tradePayload, isExample: true}),
  bodyText: buildTradeText({...tradePayload, isExample: true}),
  subject: `Compra simulada de YPFD · Energía argentina`,
};

writeFileSync(`${outDir}/payload-digest-test.json`, JSON.stringify(digestTestPayload, null, 2));
writeFileSync(`${outDir}/payload-trade-test.json`, JSON.stringify(tradeTestPayload, null, 2));

console.log('Generated artifacts in /opt/cursor/artifacts/:');
console.log('- digest-production.html (no example flag)');
console.log('- digest-production.txt');
console.log('- trade-production.html (no example flag)');
console.log('- trade-production.txt');
console.log('- payload-digest-test.json (with isExample: true)');
console.log('- payload-trade-test.json (with isExample: true)');

// Verify production artifacts don't have example markers
const prodMarkers = ['Datos de ejemplo', 'Quitar este renglón', '/ejemplo'];
let cleanProd = true;
for (const marker of prodMarkers) {
  if (digestHtml.includes(marker) || tradeHtml.includes(marker)) {
    console.error(`ERROR: Production HTML contains "${marker}"`);
    cleanProd = false;
  }
}
if (cleanProd) {
  console.log('\n✓ Production artifacts verified clean (no example markers)');
}

