#!/usr/bin/env node
/**
 * Generate email fixtures for design review.
 * Creates HTML, plaintext, and screenshots for all email templates.
 */

import {writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildDigestHtml} from '../lib/email-templates/digest-html.mjs';
import {buildDigestText} from '../lib/email-templates/digest-text.mjs';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildTradeText} from '../lib/email-templates/trade-text.mjs';

const FIXTURES_DIR = 'fixtures/email-review';
const SOURCE_COMMIT = '7aba3ad1874577e97086dc4d7a32249834caa9dd';

function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

// Fixture 1: Rich multi-thesis digest with returns and autoActions
const richDigest = {
  userName: 'diego',
  date: new Date('2026-11-06T20:30:00-03:00'),
  portfolio: {dayPct: 0.028, weekPct: 0.045},
  theses: [
    {
      name: 'Energía local',
      dayPct: 0.035,
      contributionPct: 0.018,
      contributions: [
        {ticker: 'YPFD', contribPct: 0.012, thesisNames: ['Energía local']},
        {ticker: 'GGAL', contribPct: 0.006, thesisNames: ['Energía local', 'Bancos argentinos']},
      ],
      movers: [
        {symbol: 'YPFD', dayPct: 0.062, thesisNames: ['Energía local']},
        {symbol: 'GGAL', dayPct: 0.038, thesisNames: ['Energía local', 'Bancos argentinos']},
      ],
    },
    {
      name: 'Bancos argentinos',
      dayPct: 0.018,
      contributionPct: 0.008,
      contributions: [
        {ticker: 'GGAL', contribPct: 0.006, thesisNames: ['Energía local', 'Bancos argentinos']},
        {ticker: 'BMA', contribPct: 0.002, thesisNames: ['Bancos argentinos']},
      ],
      movers: [
        {symbol: 'GGAL', dayPct: 0.038, thesisNames: ['Energía local', 'Bancos argentinos']},
        {symbol: 'BMA', dayPct: 0.024, thesisNames: ['Bancos argentinos']},
      ],
    },
  ],
  takeaway: 'La tesis «Energía local» explicó casi todo el día (+1,8\u202F%). YPFD subió 6,2\u202F% y aportó +1,2\u202F% a la cartera.',
  autoActions: [
    {ticker: 'VIST', side: 'venta', thesisName: 'Tecnología argentina', reasonPlain: 'VIST 26,4\u202F% supera el tope de 25\u202F%'},
    {ticker: 'PAMP', side: 'compra', thesisName: 'Cobertura en pesos', reasonPlain: 'Desvío PAMP −2,1\u202Fpp supera el umbral de 2,0\u202Fpp'},
  ],
  alertsFired: [],
  tip: 'Un activo puede subir mucho y mover poco la cartera si su peso es chico.',
  newsItems: [],
  prefs: {thresholdAssetPct: 5.0, thresholdPortfolioPct: 3.0},
  isExample: true,
};

// Fixture 2: Known-zero digest (flat day, no movements)
const zeroDigest = {
  userName: 'diego',
  date: new Date('2026-11-06T20:30:00-03:00'),
  portfolio: {dayPct: 0, weekPct: 0.012},
  theses: [
    {
      name: 'Energía local',
      dayPct: 0,
      contributionPct: 0,
      contributions: [],
      movers: [],
    },
  ],
  takeaway: null,
  autoActions: [],
  alertsFired: [],
  tip: null,
  newsItems: [],
  prefs: {thresholdAssetPct: 5.0, thresholdPortfolioPct: 3.0},
  isExample: true,
};

// Fixture 3: Unavailable-data digest (no metrics, honest message)
const unavailableDigest = {
  userName: 'diego',
  date: new Date('2026-11-06T20:30:00-03:00'),
  portfolio: {dayPct: null, weekPct: null},
  theses: [],
  takeaway: null,
  autoActions: [],
  alertsFired: [],
  tip: null,
  newsItems: [],
  prefs: {thresholdAssetPct: 5.0, thresholdPortfolioPct: 3.0},
  isExample: true,
};

// Fixture 4: Trade buy
const tradeBuy = {
  ticker: 'YPFD',
  side: 'compra',
  thesisName: 'Energía local',
  date: new Date('2026-11-06T14:30:00-03:00'),
  weightBeforePct: 0.210,
  weightAfterPct: 0.248,
  weightDeltaPct: 0.038,
  assetDayPct: 0.062,
  portfolioDayPct: null,
  reasonPlain: 'Desvío YPFD −2,4\u202Fpp supera el umbral de 2,0\u202Fpp',
  thesisImpactPct: 0.005,
  portfolioImpactPct: 0.002,
  thesisNames: ['Energía local'],
  deepLink: 'https://laviste.diegodella.ar/app#/tesis/ejemplo',
  isExample: true,
};

// Fixture 5: Trade sell with known-zero asset day return (P1-3 verification)
const tradeSell = {
  ticker: 'VIST',
  side: 'venta',
  thesisName: 'Tecnología argentina',
  date: new Date('2026-11-06T11:15:00-03:00'),
  weightBeforePct: 0.264,
  weightAfterPct: 0.225,
  weightDeltaPct: -0.039,
  assetDayPct: 0, // Known-zero: verify neutral color, no "La baja disparó"
  portfolioDayPct: null,
  reasonPlain: 'VIST 26,4\u202F% supera el tope de 25\u202F%',
  thesisImpactPct: -0.002,
  portfolioImpactPct: -0.001,
  thesisNames: ['Tecnología argentina', 'Tech LATAM'],
  deepLink: 'https://laviste.diegodella.ar/app#/tesis/ejemplo',
  isExample: true,
};

// Fixture 6: Trade unknown side with no impact data (verify block omitted)
const tradeUnknownSide = {
  ticker: 'PAMP',
  side: null,
  thesisName: 'Cobertura en pesos',
  date: new Date('2026-11-06T15:45:00-03:00'),
  weightBeforePct: 0.180,
  weightAfterPct: 0.200,
  weightDeltaPct: 0.020,
  assetDayPct: 0.015,
  portfolioDayPct: null,
  reasonPlain: 'Rebalanceo automático de práctica',
  thesisImpactPct: null, // No impact data: verify block omitted
  portfolioImpactPct: null,
  thesisNames: ['Cobertura en pesos'],
  deepLink: 'https://laviste.diegodella.ar/app#/tesis/ejemplo',
  isExample: true,
};

const fixtures = [
  {name: 'rich-digest', data: richDigest, type: 'digest'},
  {name: 'zero-digest', data: zeroDigest, type: 'digest'},
  {name: 'unavailable-digest', data: unavailableDigest, type: 'digest'},
  {name: 'trade-buy', data: tradeBuy, type: 'trade'},
  {name: 'trade-sell', data: tradeSell, type: 'trade'},
  {name: 'trade-unknown-side', data: tradeUnknownSide, type: 'trade'},
];

const manifest = {
  generated: new Date().toISOString(),
  sourceCommit: SOURCE_COMMIT,
  note: 'Artifacts generated from code at sourceCommit. These artifacts committed in subsequent commit (no self-reference).',
  remainingGaps: [
    'alertsFired: array always empty (not yet populated from persisted alerts)',
    'newsItems: array always empty (news system not integrated)',
    'takeaway: manually specified or null (AI analysis not integrated)',
    'tip: manually specified or null (tips system not integrated)',
  ],
  fixtures: {},
};

console.log('Generating email fixtures...');

mkdirSync(FIXTURES_DIR, {recursive: true});

for (const fixture of fixtures) {
  console.log(`Generating ${fixture.name}...`);
  
  const html = fixture.type === 'digest'
    ? buildDigestHtml(fixture.data)
    : buildTradeHtml(fixture.data);
  
  const text = fixture.type === 'digest'
    ? buildDigestText(fixture.data)
    : buildTradeText(fixture.data);
  
  const htmlPath = join(FIXTURES_DIR, `${fixture.name}.html`);
  const textPath = join(FIXTURES_DIR, `${fixture.name}.txt`);
  
  writeFileSync(htmlPath, html, 'utf8');
  writeFileSync(textPath, text, 'utf8');
  
  manifest.fixtures[fixture.name] = {
    type: fixture.type,
    htmlFile: `${fixture.name}.html`,
    htmlSha256: sha256(html),
    textFile: `${fixture.name}.txt`,
    textSha256: sha256(text),
    input: fixture.data,
  };
}

const manifestPath = join(FIXTURES_DIR, 'MANIFEST.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log(`\nGenerated ${fixtures.length} fixtures in ${FIXTURES_DIR}/`);
console.log(`Manifest: ${manifestPath}`);
console.log(`Source commit: ${SOURCE_COMMIT}`);
