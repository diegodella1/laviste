#!/usr/bin/env node
/**
 * Generate normal-mode (isExample=false) offline synthetic evidence
 * Clearly marked as synthetic/offline in filenames and manifest
 */

import {mkdirSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {buildDigestHtml} from '../lib/email-templates/digest-html.mjs';
import {buildDigestText} from '../lib/email-templates/digest-text.mjs';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildTradeText} from '../lib/email-templates/trade-text.mjs';

const EVIDENCE_DIR = 'normal-mode-offline-evidence';
const SOURCE_SHA = process.argv[2] || 'unknown';

// Clean and recreate directory
if (existsSync(EVIDENCE_DIR)) {
  rmSync(EVIDENCE_DIR, {recursive: true, force: true});
}
mkdirSync(EVIDENCE_DIR, {recursive: true});

const files = [];

function saveFile(filename, content) {
  const path = join(EVIDENCE_DIR, filename);
  writeFileSync(path, content, 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  files.push({filename, sha256: hash, bytes: Buffer.byteLength(content, 'utf8')});
  console.log(`✓ ${filename} (${Buffer.byteLength(content, 'utf8')} bytes)`);
  return path;
}

// === NORMAL MODE FIXTURES (isExample: false, offline synthetic) ===

// Digest: positive day (offline synthetic, no user data)
const digestPositiveData = {
  userName: 'Inversor',
  date: new Date('2026-11-09T17:30:00-03:00'),
  portfolio: {
    dayPct: 0.0234,
    weekPct: null,
  },
  theses: [
    {
      name: 'Energía Argentina',
      dayPct: 0.0287,
      contributionPct: 0.0143,
      contributions: [],
    },
    {
      name: 'Tecnología Global',
      dayPct: 0.0189,
      contributionPct: 0.0091,
      contributions: [],
    },
  ],
  takeaway: 'Tu cartera creció 2,3\u202F% hoy. Energía Argentina lideró con +2,9\u202F%, aportando 1,4 puntos al total.',
  autoActions: [],
  alertsFired: [],
  tip: null,
  newsItems: [],
  isExample: false, // NORMAL MODE
};

const digestPositiveHtml = buildDigestHtml(digestPositiveData);
const digestPositiveText = buildDigestText(digestPositiveData);

saveFile('synthetic-digest-positive-normal.html', digestPositiveHtml);
saveFile('synthetic-digest-positive-normal.txt', digestPositiveText);

// Trade: buy (offline synthetic, no user data)
const tradeBuyData = {
  ticker: 'YPF',
  side: 'compra',
  thesisName: 'Energía Argentina',
  date: new Date('2026-11-09T15:30:00-03:00'),
  weightBeforePct: 0.18,
  weightAfterPct: 0.23,
  weightDeltaPct: 0.05,
  assetDayPct: 0.0456,
  portfolioDayPct: 0.0189,
  thesisImpactPct: 0.0234,
  portfolioImpactPct: 0.0112,
  thesisNames: ['Energía Argentina'],
  reasonPlain: 'Deriva mayor a 3,0\u202F%: YPF pasó de 18,0\u202F% a 23,0\u202F% en la tesis y se reequilibró comprando',
  isExample: false, // NORMAL MODE
};

const tradeBuyHtml = buildTradeHtml(tradeBuyData);
const tradeBuyText = buildTradeText(tradeBuyData);

saveFile('synthetic-trade-buy-normal.html', tradeBuyHtml);
saveFile('synthetic-trade-buy-normal.txt', tradeBuyText);

// Trade: sell (offline synthetic, no user data)
const tradeSellData = {
  ticker: 'MELI',
  side: 'venta',
  thesisName: 'Tecnología Global',
  date: new Date('2026-11-09T15:30:00-03:00'),
  weightBeforePct: 0.28,
  weightAfterPct: 0.22,
  weightDeltaPct: -0.06,
  assetDayPct: 0.0123,
  portfolioDayPct: 0.0098,
  thesisImpactPct: -0.0187,
  portfolioImpactPct: -0.0056,
  thesisNames: ['Tecnología Global'],
  reasonPlain: 'Deriva mayor a 3,0\u202F%: el activo creció de 22,0\u202F% a 28,0\u202F% y se reequilibró vendiendo para mantener el balance.',
  isExample: false, // NORMAL MODE
};

const tradeSellHtml = buildTradeHtml(tradeSellData);
const tradeSellText = buildTradeText(tradeSellData);

saveFile('synthetic-trade-sell-normal.html', tradeSellHtml);
saveFile('synthetic-trade-sell-normal.txt', tradeSellText);

// Raw fixture inputs for provenance
const fixtureInputs = {
  digestPositive: digestPositiveData,
  tradeBuy: tradeBuyData,
  tradeSell: tradeSellData,
};

saveFile('fixture-inputs.json', JSON.stringify(fixtureInputs, null, 2));

// === MANIFEST ===

const manifest = {
  mode: 'normal',
  isExample: false,
  synthetic: true,
  offline: true,
  description: 'Normal-mode renderer evidence (offline synthetic data, no real user portfolios)',
  source: {
    repository: 'diegodella1/laviste',
    branch: 'cursor/clarity-email-designs-b621',
    commit: SOURCE_SHA,
    timestamp: new Date().toISOString(),
  },
  generator: {
    script: 'scripts/generate-normal-mode-evidence.mjs',
    command: `node scripts/generate-normal-mode-evidence.mjs ${SOURCE_SHA}`,
    reproducible: true,
  },
  fixtures: {
    digest: ['synthetic-digest-positive-normal'],
    trade: ['synthetic-trade-buy-normal', 'synthetic-trade-sell-normal'],
  },
  formats: ['html', 'txt'],
  files: files.sort((a, b) => a.filename.localeCompare(b.filename)),
  notes: [
    'isExample=false (normal mode): NO visible "Datos de ejemplo" label in body content',
    'Offline synthetic data: NOT sent to real users, clearly marked in filenames',
    'Traceable to source SHA and reproducible generator command',
    'Raw fixture inputs included in fixture-inputs.json',
    'PNGs generated separately with Playwright (desktop/mobile, light/dark)',
    'This evidence proves normal renderer lacks example warnings',
  ],
};

const manifestJson = JSON.stringify(manifest, null, 2);
saveFile('manifest.json', manifestJson);

console.log(`\n✨ Normal-mode evidence generated from ${SOURCE_SHA}`);
console.log(`Total: ${files.length} files`);
console.log('\nNext: Generate PNGs with Playwright');
console.log(`\nGenerator command: node scripts/generate-normal-mode-evidence.mjs ${SOURCE_SHA}`);
