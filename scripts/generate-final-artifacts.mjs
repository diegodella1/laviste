/**
 * Generate final email artifacts for audit completion.
 * Exports: positive/negative/zero digest, buy/sell trade HTML+text,
 * two clearly labeled test payloads with PRUEBA subjects.
 */

import {writeFileSync, mkdirSync, readFileSync} from 'fs';
import {createHash} from 'crypto';
import {buildDigestHtml} from '../lib/email-templates/digest-html.mjs';
import {buildDigestText} from '../lib/email-templates/digest-text.mjs';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildTradeText} from '../lib/email-templates/trade-text.mjs';

const outDir = '/opt/cursor/artifacts';
mkdirSync(outDir, {recursive: true});

const now = new Date('2026-11-06T21:00:00-03:00');

// Positive digest
const digestPositive = {
  userName: 'Diego',
  date: now,
  portfolio: {dayPct: 0.024, weekPct: null},
  theses: [
    {name: 'Energía argentina', dayPct: 0.032, contributionPct: 0.015},
    {name: 'Exportadoras', dayPct: 0.018, contributionPct: 0.009},
  ],
  autoActions: [],
  alertsFired: [],
  newsItems: [],
  prefs: {thresholdAssetPct: 5.0, thresholdPortfolioPct: 3.0},
  takeaway: null,
  isExample: false,
};

// Negative digest
const digestNegative = {
  ...digestPositive,
  portfolio: {dayPct: -0.018, weekPct: null},
  theses: [
    {name: 'Energía argentina', dayPct: -0.022, contributionPct: -0.011},
    {name: 'Exportadoras', dayPct: -0.014, contributionPct: -0.007},
  ],
};

// Zero digest (no data)
const digestZero = {
  userName: 'Diego',
  date: now,
  portfolio: {dayPct: null, weekPct: null},
  theses: [],
  autoActions: [],
  alertsFired: [],
  newsItems: [],
  prefs: {thresholdAssetPct: 5.0, thresholdPortfolioPct: 3.0},
  takeaway: null,
  isExample: false,
};

// Buy trade
const tradeBuy = {
  ticker: 'YPFD',
  side: 'compra',
  thesisName: 'Energía argentina',
  date: now,
  weightBeforePct: 0.20,
  weightAfterPct: 0.25,
  weightDeltaPct: 0.05,
  assetDayPct: null,
  portfolioDayPct: 0.024,
  reasonPlain: 'La tesis rebalanceó: YPFD subió y el peso aumentó del 20,0 % al 25,0 %.',
  thesisImpactPct: null,
  portfolioImpactPct: null,
  thesisNames: ['Energía argentina'],
  deepLink: 'https://laviste.diegodella.ar/app#/take/abc123',
  isExample: false,
};

// Sell trade
const tradeSell = {
  ticker: 'YPFD',
  side: 'venta',
  thesisName: 'Energía argentina',
  date: now,
  weightBeforePct: 0.30,
  weightAfterPct: 0.25,
  weightDeltaPct: -0.05,
  assetDayPct: null,
  portfolioDayPct: -0.012,
  reasonPlain: 'La tesis tocó el tope: YPFD alcanzó el límite y el peso bajó del 30,0 % al 25,0 %.',
  thesisImpactPct: null,
  portfolioImpactPct: null,
  thesisNames: ['Energía argentina'],
  deepLink: 'https://laviste.diegodella.ar/app#/take/abc123',
  isExample: false,
};

// Generate production renders
writeFileSync(`${outDir}/digest-positive.html`, buildDigestHtml(digestPositive));
writeFileSync(`${outDir}/digest-positive.txt`, buildDigestText(digestPositive));
writeFileSync(`${outDir}/digest-negative.html`, buildDigestHtml(digestNegative));
writeFileSync(`${outDir}/digest-negative.txt`, buildDigestText(digestNegative));
writeFileSync(`${outDir}/digest-zero.html`, buildDigestHtml(digestZero));
writeFileSync(`${outDir}/digest-zero.txt`, buildDigestText(digestZero));
writeFileSync(`${outDir}/trade-buy.html`, buildTradeHtml(tradeBuy));
writeFileSync(`${outDir}/trade-buy.txt`, buildTradeText(tradeBuy));
writeFileSync(`${outDir}/trade-sell.html`, buildTradeHtml(tradeSell));
writeFileSync(`${outDir}/trade-sell.txt`, buildTradeText(tradeSell));

// Generate TEST payloads with PRUEBA subjects and metadata
const digestTestPayload = {
  ...digestPositive,
  isExample: true,
};

const digestTestHtml = buildDigestHtml(digestTestPayload);
const digestTestText = buildDigestText(digestTestPayload);

const tradeTestPayload = {
  ...tradeBuy,
  isExample: true,
};

const tradeTestHtml = buildTradeHtml(tradeTestPayload);
const tradeTestText = buildTradeText(tradeTestPayload);

const digestPayload = {
  subject: 'PRUEBA · Tu cartera hoy +2,4 % · resumen de práctica · Datos de ejemplo',
  bodyHtml: digestTestHtml,
  bodyText: digestTestText,
  metadata: {
    template: 'daily_digest',
    example: true,
    generated: new Date().toISOString(),
  },
};

const tradePayload = {
  subject: 'PRUEBA · Compra simulada de YPFD · Energía argentina · Datos de ejemplo',
  bodyHtml: tradeTestHtml,
  bodyText: tradeTestText,
  metadata: {
    template: 'trade_alert',
    example: true,
    generated: new Date().toISOString(),
  },
};

writeFileSync(`${outDir}/payload-digest-PRUEBA.json`, JSON.stringify(digestPayload, null, 2));
writeFileSync(`${outDir}/payload-trade-PRUEBA.json`, JSON.stringify(tradePayload, null, 2));

// Generate manifest with SHA and hashes
const manifest = {
  sourceCommit: 'fb947fad15de13ebfc23d3c0f385644d60c7166c',
  generated: new Date().toISOString(),
  files: {},
};

function hashFile(path) {
  try {
    const content = readFileSync(path);
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

const files = [
  'digest-positive.html', 'digest-positive.txt',
  'digest-negative.html', 'digest-negative.txt',
  'digest-zero.html', 'digest-zero.txt',
  'trade-buy.html', 'trade-buy.txt',
  'trade-sell.html', 'trade-sell.txt',
  'payload-digest-PRUEBA.json',
  'payload-trade-PRUEBA.json',
];

for (const file of files) {
  const content = readFileSync(`${outDir}/${file}`, 'utf8');
  manifest.files[file] = {
    sha256: createHash('sha256').update(content).digest('hex'),
    size: content.length,
  };
}

writeFileSync(`${outDir}/MANIFEST.json`, JSON.stringify(manifest, null, 2));

console.log('✓ Generated production renders (positive/negative/zero digest, buy/sell trade)');
console.log('✓ Generated test payloads with PRUEBA subjects');
console.log('✓ Generated MANIFEST.json with SHA and file hashes');
console.log('\nProduction artifacts verified clean (no example markers):');
for (const file of files.filter(f => !f.includes('PRUEBA'))) {
  const content = readFileSync(`${outDir}/${file}`, 'utf8');
  const hasMarker = content.includes('Datos de ejemplo') || content.includes('Quitar este renglón');
  console.log(`  ${file}: ${hasMarker ? '❌ HAS MARKERS' : '✓ clean'}`);
}
