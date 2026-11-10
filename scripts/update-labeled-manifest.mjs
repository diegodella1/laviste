#!/usr/bin/env node
/**
 * Update final-review-fixtures/manifest.json to include all files with hashes
 */

import {readFileSync, writeFileSync, readdirSync, statSync} from 'fs';
import {join} from 'path';
import {createHash} from 'crypto';
import {execSync} from 'child_process';

const FIXTURES_DIR = 'final-review-fixtures';
const SOURCE_SHA = execSync('git rev-parse HEAD').toString().trim();
const GENERATOR_SCRIPT = 'scripts/generate-final-fixtures.mjs';
const GENERATOR_SHA256 = createHash('sha256').update(readFileSync(GENERATOR_SCRIPT)).digest('hex');

console.log('Updating labeled fixtures manifest with all files...\n');

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// Scan all files in fixtures directory
const allFiles = readdirSync(FIXTURES_DIR)
  .filter(f => f !== 'manifest.json')
  .map(filename => {
    const path = join(FIXTURES_DIR, filename);
    const stat = statSync(path);
    return {
      filename,
      sha256: hashFile(path),
      bytes: stat.size,
    };
  })
  .sort((a, b) => a.filename.localeCompare(b.filename));

// Build manifest
const manifest = {
  source: {
    repository: 'diegodella1/laviste',
    branch: 'cursor/clarity-email-designs-b621',
    commit: SOURCE_SHA,
    message: 'Optimize /app LCP by inlining CSS variables in critical CSS',
    timestamp: new Date().toISOString(),
  },
  generator: {
    script: GENERATOR_SCRIPT,
    sha256: GENERATOR_SHA256,
  },
  fixtures: {
    digest: ['digest-rich', 'digest-unavailable', 'digest-loss', 'digest-multi-thesis'],
    trade: ['trade-compra', 'trade-venta', 'trade-null-side', 'trade-zero', 'trade-null-impacts', 'trade-cap-target'],
  },
  formats: ['html', 'txt', 'png'],
  files: allFiles,
  notes: [
    'All fixtures include visible "Datos de ejemplo" label in body content',
    'HTML and plain text versions generated for each case',
    'PNGs: desktop (1280×1024) and mobile (375×812) × light/dark mode',
    'Trade fixtures: compra, venta, null-side, zero (genuine 0.0%), null-impacts (both unavailable)',
    'Digest fixtures: rich, unavailable, loss (negative day), multi-thesis (same ticker in multiple)',
    'trade-cap-target: demonstrates formatCapMotivo with ticker YPFD, cap 27% > 25% → target 18%',
    'Cap-target scenario includes runtime formatter call logs (see generator output) and provenance JSON',
    'Numeric percentages in reasonPlain use es-AR format: 1 decimal, comma, NNBSP before %',
    'reasonPlain weight values match weightBeforePct/weightAfterPct (semantic coherence)',
    'Ticker contributions unavailable (empty arrays) - documented limitation',
    'Portfolio day return after trade implemented (portfolioDayPct)',
    'Trade impact metrics implemented (thesisImpactPct, portfolioImpactPct)',
  ],
};

const manifestJson = JSON.stringify(manifest, null, 2);
writeFileSync(join(FIXTURES_DIR, 'manifest.json'), manifestJson);

console.log(`✓ Updated ${FIXTURES_DIR}/manifest.json`);
console.log(`  Total files listed: ${allFiles.length}`);
console.log(`  HTML: ${allFiles.filter(f => f.filename.endsWith('.html')).length}`);
console.log(`  TXT: ${allFiles.filter(f => f.filename.endsWith('.txt')).length}`);
console.log(`  PNG: ${allFiles.filter(f => f.filename.endsWith('.png')).length}`);
console.log(`  JSON: ${allFiles.filter(f => f.filename.endsWith('.json')).length}`);
console.log(`\n  Generator: ${GENERATOR_SCRIPT}`);
console.log(`  Generator SHA256: ${GENERATOR_SHA256.slice(0, 16)}...`);
