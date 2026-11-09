#!/usr/bin/env node
/**
 * Regenerate complete evidence package with cap-target scenario
 */

import {execSync} from 'child_process';

const sha = execSync('git rev-parse HEAD').toString().trim();

console.log(`Regenerating complete evidence from ${sha.slice(0, 7)}...\n`);

// 1. Generate labeled fixtures (9 base scenarios)
console.log('=== 1. Labeled Fixtures (9 base scenarios) ===');
execSync('node scripts/generate-final-fixtures.mjs', {stdio: 'inherit'});

// 2. Generate cap-target scenario
console.log('\n=== 2. Cap-Target Scenario (NEW) ===');
execSync('node scripts/generate-cap-target-fixture.mjs', {stdio: 'inherit'});

// 3. Generate all PNGs
console.log('\n=== 3. PNGs for All Fixtures ===');
execSync('node scripts/generate-final-fixtures-png.mjs', {stdio: 'inherit'});
execSync('node scripts/generate-cap-target-png.mjs', {stdio: 'inherit'});

// 4. Update labeled manifest to include cap-target
console.log('\n=== 4. Update Labeled Manifest ===');
const {readFileSync, writeFileSync} = await import('fs');
const manifest = JSON.parse(readFileSync('final-review-fixtures/manifest.json', 'utf8'));
manifest.fixtures.trade.push('trade-cap-target');
manifest.notes.push('trade-cap-target: demonstrates formatCapMotivo with cap 27% > 25% → target 18%');
manifest.notes.push('Cap-target scenario includes runtime formatter call logs and provenance JSON');
writeFileSync('final-review-fixtures/manifest.json', JSON.stringify(manifest, null, 2));
console.log('✓ Updated final-review-fixtures/manifest.json');

// 5. Generate normal-mode evidence
console.log('\n=== 5. Normal-Mode Evidence ===');
execSync('node scripts/generate-normal-mode-evidence.mjs', {stdio: 'inherit'});
execSync('node scripts/generate-normal-mode-png.mjs', {stdio: 'inherit'});

console.log('\n✨ Complete evidence regeneration finished');
console.log(`\nNext: Create archive with scripts/create-truthful-archive.mjs`);
