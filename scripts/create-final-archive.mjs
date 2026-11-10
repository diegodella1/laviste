#!/usr/bin/env node
import {execSync} from 'child_process';
import {readFileSync, writeFileSync, readdirSync, statSync} from 'fs';
import {join} from 'path';

const sha = execSync('git rev-parse HEAD').toString().trim();
const shortSha = sha.slice(0, 7);
const archiveName = `email-templates-complete-evidence-${shortSha}.tar.gz`;
const artifactsDir = '/opt/cursor/artifacts';

console.log(`Creating complete evidence archive for commit ${sha}...\n`);

// Create archive with labeled fixtures, normal-mode evidence, and app screenshots
const files = [];

// Labeled fixtures
const labeledDir = 'final-review-fixtures';
const labeledFiles = readdirSync(labeledDir);
for (const file of labeledFiles) {
  const stat = statSync(join(labeledDir, file));
  files.push({path: `${labeledDir}/${file}`, size: stat.size});
}

// Normal-mode evidence
const normalDir = 'normal-mode-offline-evidence';
const normalFiles = readdirSync(normalDir);
for (const file of normalFiles) {
  const stat = statSync(join(normalDir, file));
  files.push({path: `${normalDir}/${file}`, size: stat.size});
}

// App screenshots
const screenshotsDir = `${artifactsDir}/app-screenshots`;
const screenshotFiles = readdirSync(screenshotsDir);
for (const file of screenshotFiles) {
  const stat = statSync(join(screenshotsDir, file));
  files.push({path: `app-screenshots/${file}`, size: stat.size});
}

// Create master manifest
const manifest = {
  sourceCommit: sha,
  sourceCommitShort: shortSha,
  generatedAt: new Date().toISOString(),
  contents: {
    labeledFixtures: {
      directory: labeledDir,
      count: labeledFiles.length,
      files: labeledFiles.filter(f => !f.endsWith('.json')).map(f => f),
    },
    normalModeEvidence: {
      directory: normalDir,
      count: normalFiles.length,
      files: normalFiles.filter(f => !f.endsWith('.json')).map(f => f),
    },
    appScreenshots: {
      directory: 'app-screenshots',
      count: screenshotFiles.length,
      files: screenshotFiles,
    },
  },
  totalFiles: files.length,
  totalBytes: files.reduce((sum, f) => sum + f.size, 0),
};

writeFileSync('ARCHIVE_MANIFEST.json', JSON.stringify(manifest, null, 2));
console.log('✓ ARCHIVE_MANIFEST.json');

// Copy app-screenshots locally for tar
execSync(`cp -r ${screenshotsDir} .`);

// Create tar.gz
execSync(`tar -czf ${artifactsDir}/${archiveName} ${labeledDir} ${normalDir} app-screenshots ARCHIVE_MANIFEST.json`);
console.log(`✓ ${archiveName}`);

// Clean up local copy
execSync(`rm -rf app-screenshots`);

// Compute SHA256
const sha256 = execSync(`sha256sum ${artifactsDir}/${archiveName}`).toString().split(' ')[0];
console.log(`\n✨ Archive created successfully`);
console.log(`\nLocation: ${artifactsDir}/${archiveName}`);
console.log(`SHA256: ${sha256}`);
console.log(`\nContents:`);
console.log(`  - ${labeledFiles.length} labeled fixtures (isExample=true)`);
console.log(`  - ${normalFiles.length} normal-mode evidence (isExample=false)`);
console.log(`  - ${screenshotFiles.length} app screenshots`);
console.log(`  - Total: ${files.length} files, ${(manifest.totalBytes / 1024 / 1024).toFixed(2)} MB`);

// Write checksum file
writeFileSync(`${artifactsDir}/${archiveName}.sha256`, `${sha256}  ${archiveName}\n`);
console.log(`\n✓ ${archiveName}.sha256`);
