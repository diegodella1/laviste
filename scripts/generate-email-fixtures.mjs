/**
 * Generate email fixtures with clearly fictional test data for design review.
 * NO real user data, NO real email sending.
 */

import {writeFileSync, mkdirSync} from 'node:fs';
import {buildDigestHtml} from '../lib/email-templates/digest-html.mjs';
import {buildDigestText} from '../lib/email-templates/digest-text.mjs';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildTradeText} from '../lib/email-templates/trade-text.mjs';

const FIXTURES_DIR = './test/fixtures/email';

mkdirSync(FIXTURES_DIR, {recursive: true});

// Fictional test data matching approved design mocks
const digestData = {
  userName: 'ejemplo',
  date: new Date('2026-11-06T18:00:00-03:00'),
  portfolio: {
    dayPct: 0.018,
    weekPct: 0.032,
  },
  theses: [
    {
      name: 'Energía local',
      dayPct: 0.024,
      contributions: [
        {ticker: 'YPFD', contribPct: 0.019, thesisNames: ['Energía local']},
        {ticker: 'VIST', contribPct: 0.006, thesisNames: ['Energía local']},
        {ticker: 'PAMP', contribPct: -0.001, thesisNames: ['Energía local', 'Cobertura en pesos']},
      ],
      movers: [
        {symbol: 'YPFD', dayPct: 0.062, thesisNames: ['Energía local']},
        {symbol: 'VIST', dayPct: 0.014, thesisNames: ['Energía local']},
        {symbol: 'PAMP', dayPct: -0.008, thesisNames: ['Energía local', 'Cobertura en pesos']},
      ],
    },
    {
      name: 'Cobertura en pesos',
      dayPct: -0.004,
      contributions: [
        {ticker: 'PAMP', contribPct: -0.004, thesisNames: ['Energía local', 'Cobertura en pesos']},
      ],
      movers: [
        {symbol: 'PAMP', dayPct: -0.008, thesisNames: ['Energía local', 'Cobertura en pesos']},
      ],
    },
  ],
  takeaway: 'La tesis «Energía local» explicó casi todo el día: YPFD subió más de +5 % y, como pesa bastante en esa idea, empujó la cartera. VIST acompañó; PAMP restó un poco.',
  autoActions: [
    {
      ticker: 'YPFD',
      side: 'venta',
      thesisName: 'Energía local',
      reasonPlain: 'El peso de YPFD en «Energía local» superó el tope que definiste en esa tesis. Automático vendió (simulado) para volver al rango',
    },
  ],
  alertsFired: [
    {symbol: 'YPFD', dayPct: 0.062, thesisNames: ['Energía local'], threshold: 5.0},
  ],
  tip: 'Un activo puede subir mucho y mover poco la cartera si su peso es chico. Por eso mostramos el % del día y cuánto aportó cada tesis.',
  newsItems: [],
  prefs: {thresholdAssetPct: 5.0, thresholdPortfolioPct: 3.0},
};

const tradeData = {
  ticker: 'YPFD',
  side: 'venta',
  thesisName: 'Energía local',
  date: new Date('2026-11-06T15:12:00-03:00'),
  weightBeforePct: 0.264,
  weightAfterPct: 0.220,
  weightDeltaPct: -0.044,
  assetDayPct: 0.062,
  portfolioDayPct: 0.016,
  reasonPlain: 'El peso de YPFD superó el tope que definiste en «Energía local»',
  thesisImpactPct: 0.004,
  portfolioImpactPct: 0.002,
  thesisNames: ['Energía local'],
  deepLink: 'https://laviste.diegodella.ar/app#/tesis/ejemplo-abc123',
};

// Negative case
const digestNegativeData = {
  ...digestData,
  portfolio: {dayPct: -0.006, weekPct: -0.012},
  theses: [
    {
      name: 'Cobertura en pesos',
      dayPct: -0.008,
      contributions: [{ticker: 'PAMP', contribPct: -0.008, thesisNames: ['Cobertura en pesos']}],
      movers: [{symbol: 'PAMP', dayPct: -0.015, thesisNames: ['Cobertura en pesos']}],
    },
  ],
  takeaway: 'PAMP bajó y arrastró la cartera. El resto de las posiciones se mantuvieron estables.',
  autoActions: [],
  alertsFired: [],
};

// Zero case
const digestZeroData = {
  ...digestData,
  portfolio: {dayPct: 0.0001, weekPct: 0.005},
  theses: [
    {
      name: 'Energía local',
      dayPct: 0.0002,
      contributions: [],
      movers: [],
    },
  ],
  takeaway: null,
  autoActions: [],
  alertsFired: [],
};

// Generate all variants
console.log('Generating email fixtures...\n');

// Digest positive
const digestHtml = buildDigestHtml({...digestData, isExample: true});
const digestText = buildDigestText(digestData);
writeFileSync(`${FIXTURES_DIR}/digest-positive.html`, digestHtml);
writeFileSync(`${FIXTURES_DIR}/digest-positive.txt`, digestText);
console.log('✓ digest-positive.html');
console.log('✓ digest-positive.txt');

// Digest negative
const digestNegativeHtml = buildDigestHtml({...digestNegativeData, isExample: true});
const digestNegativeText = buildDigestText(digestNegativeData);
writeFileSync(`${FIXTURES_DIR}/digest-negative.html`, digestNegativeHtml);
writeFileSync(`${FIXTURES_DIR}/digest-negative.txt`, digestNegativeText);
console.log('✓ digest-negative.html');
console.log('✓ digest-negative.txt');

// Digest zero/neutral
const digestZeroHtml = buildDigestHtml({...digestZeroData, isExample: true});
const digestZeroText = buildDigestText(digestZeroData);
writeFileSync(`${FIXTURES_DIR}/digest-zero.html`, digestZeroHtml);
writeFileSync(`${FIXTURES_DIR}/digest-zero.txt`, digestZeroText);
console.log('✓ digest-zero.html');
console.log('✓ digest-zero.txt');

// Trade alert
const tradeHtml = buildTradeHtml({...tradeData, isExample: true});
const tradeText = buildTradeText(tradeData);
writeFileSync(`${FIXTURES_DIR}/trade-alert.html`, tradeHtml);
writeFileSync(`${FIXTURES_DIR}/trade-alert.txt`, tradeText);
console.log('✓ trade-alert.html');
console.log('✓ trade-alert.txt');

console.log(`\nAll fixtures generated in ${FIXTURES_DIR}/`);
console.log('\nFictional test data - NOT real user data.');
console.log('Safe for design review and quality assurance.\n');
