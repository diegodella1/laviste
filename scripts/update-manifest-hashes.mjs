#!/usr/bin/env node
/**
 * Update manifest.json with SHA256 hashes and byte sizes for all files
 */

import {readdirSync, readFileSync, writeFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const FIXTURES_DIR = 'final-review-fixtures';
const files = [];

// Read all files in the directory except manifest, README, and REPORT
const allFiles = readdirSync(FIXTURES_DIR).filter(f => !f.match(/manifest\.json|README|REPORT/));

for (const filename of allFiles) {
  const path = join(FIXTURES_DIR, filename);
  const content = readFileSync(path);
  const hash = createHash('sha256').update(content).digest('hex');
  const bytes = statSync(path).size;
  files.push({filename, sha256: hash, bytes});
}

// Sort by filename
files.sort((a, b) => a.filename.localeCompare(b.filename));

// Read current manifest and update files array
const manifestPath = join(FIXTURES_DIR, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.files = files;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`✓ Updated manifest with ${files.length} files`);
console.log(`✓ Total bytes: ${files.reduce((sum, f) => sum + f.bytes, 0).toLocaleString()}`);
