#!/usr/bin/env node
/**
 * Generate cap-target scenario fixture demonstrating actual formatter
 * Cap trigger: 27% > 25% cap → rebalance to configured target 18%
 * Invokes real formatCapMotivo helper from runtime code
 */

import {mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {execSync} from 'node:child_process';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildTradeText} from '../lib/email-templates/trade-text.mjs';
import {formatCapMotivo} from '../lib/thesis-state.mjs';

const FIXTURES_DIR = 'final-review-fixtures';
const SOURCE_SHA = execSync('git rev-parse HEAD').toString().trim();

if (!existsSync(FIXTURES_DIR)) {
  mkdirSync(FIXTURES_DIR, {recursive: true});
}

const files = [];

function saveFixture(filename, content) {
  const path = join(FIXTURES_DIR, filename);
  writeFileSync(path, content, 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  const bytes = Buffer.byteLength(content, 'utf8');
  files.push({filename, sha256: hash, bytes});
  console.log(`✓ ${filename} (${bytes} bytes, SHA256: ${hash.slice(0, 16)}...)`);
  return path;
}

// Cap scenario: YPFD 27% actual > 25% cap → rebalance to 18% target
// This fixture demonstrates the formatter distinguishing trigger from destination
// Use YPFD consistently (symbol ticker convention used in trade cards)

console.log('Invoking formatter: formatCapMotivo("YPFD", 27.0, 25, {weight: 18})');
const reasonFormatted = formatCapMotivo('YPFD', 27.0, 25, {weight: 18}); // Invoke actual formatter
console.log(`Formatter output: "${reasonFormatted}"`);

const capTargetData = {
  ticker: 'YPFD',
  side: 'venta',
  thesisName: 'Energía Argentina',
  date: new Date('2026-11-09T15:30:00-03:00'),
  weightBeforePct: 0.27, // Cap trigger: 27%
  weightAfterPct: 0.18,  // Target weight: 18%
  weightDeltaPct: -0.09, // Delta: -9pp
  assetDayPct: null,
  portfolioDayPct: 0.0052, // Synthetic portfolio day return
  thesisImpactPct: -0.0145, // Synthetic thesis impact (negative, selling)
  portfolioImpactPct: -0.0067, // Synthetic portfolio impact
  thesisNames: ['Energía Argentina'],
  reasonPlain: reasonFormatted, // Output from actual formatter
  isExample: true,
};

// Generate HTML and TXT
const htmlCap = buildTradeHtml(capTargetData);
const txtCap = buildTradeText(capTargetData);

saveFixture('trade-cap-target.html', htmlCap);
saveFixture('trade-cap-target.txt', txtCap);

// Save input data and runtime provenance
const inputData = {
  scenario: 'cap-target-rebalance',
  ticker: 'YPFD',
  actualPct: 27.0,
  capPct: 25.0,
  targetWeightPct: 18.0,
  formatterCall: `formatCapMotivo('YPFD', 27.0, 25, {weight: 18})`,
  formatterOutput: formatCapMotivo('YPFD', 27.0, 25, {weight: 18}),
  sourceModule: 'lib/thesis-state.mjs',
  sourceCommit: SOURCE_SHA,
};

const inputJson = JSON.stringify(inputData, null, 2);
saveFixture('trade-cap-target-input.json', inputJson);

// Manifest
const manifest = {
  sourceCommit: SOURCE_SHA,
  generatedAt: new Date().toISOString(),
  scenario: 'cap-target-rebalance',
  description: 'Demonstrates formatCapMotivo distinguishing cap trigger (25%) from target weight (18%) when actual exceeds cap (27%)',
  runtimeFormatter: 'formatCapMotivo from lib/thesis-state.mjs',
  files: files,
};

const manifestJson = JSON.stringify(manifest, null, 2);
writeFileSync(join(FIXTURES_DIR, 'trade-cap-target-manifest.json'), manifestJson, 'utf8');
console.log(`✓ trade-cap-target-manifest.json`);

console.log(`\n✨ Cap-target fixture generated from ${SOURCE_SHA.slice(0, 7)}`);
console.log(`Total: ${files.length} files\n`);
console.log('Runtime formatter output:');
console.log(`  "${inputData.formatterOutput}"`);
console.log('\nNext: Generate PNGs with Playwright');
