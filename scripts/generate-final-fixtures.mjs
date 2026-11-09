#!/usr/bin/env node
/**
 * Generate final review fixtures from exact a2b15ca SHA
 * - Digest: rich and unavailable cases
 * - Trade: compra, venta, null-side (separate)
 * - HTML + plain text with visible "Datos de ejemplo" label
 * - Generate PNGs using installed Playwright
 */

import {mkdirSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {buildDigestHtml} from '../lib/email-templates/digest-html.mjs';
import {buildDigestText} from '../lib/email-templates/digest-text.mjs';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildTradeText} from '../lib/email-templates/trade-text.mjs';

const FIXTURES_DIR = 'final-review-fixtures';
const SOURCE_SHA = '792d30ad1ee0a57ec37dd26fdb64efdee6e430b1';

// Clean and recreate directory
if (existsSync(FIXTURES_DIR)) {
  rmSync(FIXTURES_DIR, {recursive: true, force: true});
}
mkdirSync(FIXTURES_DIR, {recursive: true});

const files = [];

function saveFixture(filename, content) {
  const path = join(FIXTURES_DIR, filename);
  writeFileSync(path, content, 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  files.push({filename, sha256: hash, bytes: Buffer.byteLength(content, 'utf8')});
  console.log(`✓ ${filename} (${Buffer.byteLength(content, 'utf8')} bytes)`);
  return path;
}

// === DIGEST FIXTURES ===

// Rich digest: full portfolio data
const digestRichData = {
  userName: 'Inversor',
  date: new Date('2026-11-09T17:30:00-03:00'),
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
  takeaway: 'Tu cartera creció 5,2\u202F% hoy. Energía Argentina lideró con +6,1\u202F%, aportando 3,9 puntos al total.',
  autoActions: [
    {
      ticker: 'YPF',
      kind: 'drift',
      thesisName: 'Energía Argentina',
      reasonPlain: 'Deriva mayor a 3,0\u202F%: YPF pasó de 18,0\u202F% a 21,0\u202F% en la tesis y se reequilibró comprando',
      executed_at: new Date('2026-11-09T15:30:00-03:00').toISOString(),
    },
  ],
  alertsFired: [],
  tip: null,
  newsItems: [],
  isExample: true,
};

const digestRichHtml = buildDigestHtml(digestRichData);
const digestRichText = buildDigestText(digestRichData);

saveFixture('digest-rich.html', digestRichHtml);
saveFixture('digest-rich.txt', digestRichText);

// Unavailable digest: no baseline
const digestUnavailableData = {
  userName: 'Inversor',
  date: new Date('2026-11-09T17:30:00-03:00'),
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
  isExample: true,
};

const digestUnavailableHtml = buildDigestHtml(digestUnavailableData);
const digestUnavailableText = buildDigestText(digestUnavailableData);

saveFixture('digest-unavailable.html', digestUnavailableHtml);
saveFixture('digest-unavailable.txt', digestUnavailableText);

// === TRADE FIXTURES ===

// Trade: compra (buy)
const tradeCompraData = {
  ticker: 'YPFD',
  side: 'compra',
  thesisName: 'Energía Argentina',
  date: new Date('2026-11-09T15:30:00-03:00'),
  weightBeforePct: 0.18,
  weightAfterPct: 0.23,
  weightDeltaPct: 0.05,
  assetDayPct: null,
  portfolioDayPct: 0.0187,
  thesisImpactPct: 0.0245,
  portfolioImpactPct: 0.0092,
  thesisNames: ['Energía Argentina'],
  reasonPlain: 'Deriva mayor a 3,0\u202F%: el activo pasó de 18,0\u202F% a 23,0\u202F% y se reequilibró comprando para volver al objetivo.',
  isExample: true,
};

const tradeCompraHtml = buildTradeHtml(tradeCompraData);
const tradeCompraText = buildTradeText(tradeCompraData);

saveFixture('trade-compra.html', tradeCompraHtml);
saveFixture('trade-compra.txt', tradeCompraText);

// Trade: venta (sell)
const tradeVentaData = {
  ticker: 'MELI',
  side: 'venta',
  thesisName: 'Tecnología Global',
  date: new Date('2026-11-09T15:30:00-03:00'),
  weightBeforePct: 0.28,
  weightAfterPct: 0.22,
  weightDeltaPct: -0.06,
  assetDayPct: null,
  portfolioDayPct: 0.0134,
  thesisImpactPct: -0.0156,
  portfolioImpactPct: -0.0078,
  thesisNames: ['Tecnología Global'],
  reasonPlain: 'Deriva mayor a 3,0\u202F%: el activo creció de 22,0\u202F% a 28,0\u202F% y se reequilibró vendiendo para mantener el balance.',
  isExample: true,
};

const tradeVentaHtml = buildTradeHtml(tradeVentaData);
const tradeVentaText = buildTradeText(tradeVentaData);

saveFixture('trade-venta.html', tradeVentaHtml);
saveFixture('trade-venta.txt', tradeVentaText);

// Trade: null side (contaminated/unknown)
const tradeNullSideData = {
  ticker: 'ALUA',
  side: null, // Invalid/contaminated side
  thesisName: 'Industrial',
  date: new Date('2026-11-09T15:30:00-03:00'),
  weightBeforePct: 0.15,
  weightAfterPct: 0.18,
  weightDeltaPct: 0.03,
  assetDayPct: null,
  portfolioDayPct: 0.0098,
  thesisImpactPct: 0.0125,
  portfolioImpactPct: 0.0045,
  thesisNames: ['Industrial'],
  reasonPlain: 'Reequilibrio automático por deriva.',
  isExample: true,
};

const tradeNullSideHtml = buildTradeHtml(tradeNullSideData);
const tradeNullSideText = buildTradeText(tradeNullSideData);

saveFixture('trade-null-side.html', tradeNullSideHtml);
saveFixture('trade-null-side.txt', tradeNullSideText);

// Trade: genuine zero day return
const tradeZeroData = {
  ticker: 'GGAL',
  side: 'compra',
  thesisName: 'Financiero Argentino',
  date: new Date('2026-11-09T15:30:00-03:00'),
  weightBeforePct: 0.12,
  weightAfterPct: 0.15,
  weightDeltaPct: 0.03,
  assetDayPct: 0.0,  // Genuine zero
  portfolioDayPct: 0.0,  // Genuine zero
  thesisImpactPct: 0.0082,
  portfolioImpactPct: 0.0031,
  thesisNames: ['Financiero Argentino'],
  reasonPlain: 'Rebalanceo por cambios en otras posiciones.',
  isExample: true,
};

const tradeZeroHtml = buildTradeHtml(tradeZeroData);
const tradeZeroText = buildTradeText(tradeZeroData);

saveFixture('trade-zero.html', tradeZeroHtml);
saveFixture('trade-zero.txt', tradeZeroText);

// Trade: both impacts null
const tradeNullImpactsData = {
  ticker: 'CEPU',
  side: 'venta',
  thesisName: 'Infraestructura',
  date: new Date('2026-11-09T15:30:00-03:00'),
  weightBeforePct: 0.08,
  weightAfterPct: 0.05,
  weightDeltaPct: -0.03,
  assetDayPct: null,
  portfolioDayPct: 0.0067,
  thesisImpactPct: null,  // Unavailable
  portfolioImpactPct: null,  // Unavailable
  thesisNames: ['Infraestructura'],
  reasonPlain: 'Ajuste de cartera.',
  isExample: true,
};

const tradeNullImpactsHtml = buildTradeHtml(tradeNullImpactsData);
const tradeNullImpactsText = buildTradeText(tradeNullImpactsData);

saveFixture('trade-null-impacts.html', tradeNullImpactsHtml);
saveFixture('trade-null-impacts.txt', tradeNullImpactsText);

// Digest: daily loss
const digestLossData = {
  userName: 'Inversor',
  date: new Date('2026-11-09T17:30:00-03:00'),
  portfolio: {
    dayPct: -0.0234,
    weekPct: null,
  },
  theses: [
    {
      name: 'Tech Global',
      dayPct: -0.0312,
      contributions: [],
      movers: [],
    },
  ],
  takeaway: 'La cartera cayó 2,3\u202F% hoy por movimientos del mercado.',
  autoActions: [],
  alertsFired: [],
  tip: null,
  newsItems: [],
  isExample: true,
};

const digestLossHtml = buildDigestHtml(digestLossData);
const digestLossText = buildDigestText(digestLossData);

saveFixture('digest-loss.html', digestLossHtml);
saveFixture('digest-loss.txt', digestLossText);

// Digest: multi-thesis with same ticker
const digestMultiThesisData = {
  userName: 'Inversor',
  date: new Date('2026-11-09T17:30:00-03:00'),
  portfolio: {
    dayPct: 0.0145,
    weekPct: null,
  },
  theses: [
    {
      name: 'Energía',
      dayPct: 0.0198,
      contributions: [],
      movers: [
        {ticker: 'YPF', dayPct: 0.048, thesisNames: ['Energía', 'Industria Nacional']},
      ],
    },
    {
      name: 'Industria Nacional',
      dayPct: 0.0089,
      contributions: [],
      movers: [
        {ticker: 'YPF', dayPct: 0.048, thesisNames: ['Energía', 'Industria Nacional']},
      ],
    },
  ],
  takeaway: 'YPF subió fuerte y está en dos tesis.',
  autoActions: [],
  alertsFired: [
    {ticker: 'YPF', dayPct: 0.048, thesisNames: ['Energía', 'Industria Nacional'], threshold: 4.0},
  ],
  tip: null,
  newsItems: [],
  prefs: {thresholdAssetPct: 4.0, thresholdPortfolioPct: 3.0},
  isExample: true,
};

const digestMultiThesisHtml = buildDigestHtml(digestMultiThesisData);
const digestMultiThesisText = buildDigestText(digestMultiThesisData);

saveFixture('digest-multi-thesis.html', digestMultiThesisHtml);
saveFixture('digest-multi-thesis.txt', digestMultiThesisText);

// === MANIFEST ===

const manifest = {
  source: {
    repository: 'diegodella1/laviste',
    branch: 'cursor/clarity-email-designs-b621',
    commit: SOURCE_SHA,
    message: 'feat(trade-alerts): implement portfolio day return after trade with shared baseline',
    timestamp: new Date().toISOString(),
  },
  fixtures: {
    digest: ['digest-rich', 'digest-unavailable', 'digest-loss', 'digest-multi-thesis'],
    trade: ['trade-compra', 'trade-venta', 'trade-null-side', 'trade-zero', 'trade-null-impacts'],
  },
  formats: ['html', 'txt'],
  files: files.sort((a, b) => a.filename.localeCompare(b.filename)),
  notes: [
    'All fixtures include visible "Datos de ejemplo" label in body content WITHOUT internal instruction',
    'HTML and plain text versions generated for each case',
    'Trade fixtures: compra, venta, null-side, zero (genuine 0.0%), null-impacts (both unavailable)',
    'Digest fixtures: rich, unavailable, loss (negative day), multi-thesis (same ticker in multiple)',
    'Numeric percentages in reasonPlain use es-AR format: 1 decimal, comma, NNBSP before %',
    'reasonPlain weight values match weightBeforePct/weightAfterPct (semantic coherence)',
    'Ticker contributions unavailable (empty arrays) - documented limitation',
    'Portfolio day return after trade implemented (portfolioDayPct)',
    'Trade impact metrics implemented (thesisImpactPct, portfolioImpactPct)',
    'PNGs generated separately with Playwright',
  ],
};

const manifestJson = JSON.stringify(manifest, null, 2);
saveFixture('manifest.json', manifestJson);

console.log(`\n✨ HTML/text fixtures generated from ${SOURCE_SHA}`);
console.log(`Total: ${files.length} files`);
console.log('\nNext: Generate PNGs with Playwright');
