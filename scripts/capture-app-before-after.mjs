#!/usr/bin/env node
/**
 * Capture /app screenshots before (2a86003) and after (fca9b1d) optimization
 * App is light-mode only (color-scheme: light), no dark mode support
 */

import {chromium} from 'playwright';
import {execSync} from 'child_process';
import {mkdirSync} from 'fs';

const BEFORE_SHA = '2a860031a8439caa5686524106c2725ed9d8b67e';
const AFTER_SHA = 'fca9b1dbd1f5d2cd1c4601fa3ca3830de0cf62fc';
const OUTPUT_DIR = '/opt/cursor/artifacts/app-screenshots-before-after';
const URL = 'http://127.0.0.1:3080/app';

mkdirSync(OUTPUT_DIR, {recursive: true});

console.log('Capturing /app screenshots before/after LCP optimization...\n');
console.log('Note: App is light-mode only (no dark mode support)\n');

async function captureScreenshots(label, sha) {
  console.log(`\n=== ${label} (${sha.slice(0, 7)}) ===`);
  
  // Checkout commit
  execSync(`git checkout ${sha}`, {stdio: 'ignore'});
  
  // Stop any existing server in tmux
  try {
    execSync('tmux -f /exec-daemon/tmux.portal.conf send-keys -t "app-capture:0.0" C-c', {stdio: 'ignore'});
    execSync('sleep 1');
  } catch {}
  
  // Start server in tmux
  execSync('SESSION_NAME="app-capture"; tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_NAME" 2>/dev/null || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c "$PWD" -- "${SHELL:-zsh}" -l', {stdio: 'ignore'});
  execSync('tmux -f /exec-daemon/tmux.portal.conf send-keys -t "app-capture:0.0" "cd /agent/repos/laviste && npm start" C-m', {stdio: 'ignore'});
  execSync('sleep 5');
  
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Desktop
  await page.setViewportSize({width: 1280, height: 1024});
  await page.goto(URL, {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(2000); // Wait for CSS/fonts
  await page.screenshot({path: `${OUTPUT_DIR}/app-${label}-desktop.png`, fullPage: true});
  console.log(`✓ app-${label}-desktop.png`);
  
  // Mobile
  await page.setViewportSize({width: 375, height: 812});
  await page.goto(URL, {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(1000);
  await page.screenshot({path: `${OUTPUT_DIR}/app-${label}-mobile.png`, fullPage: true});
  console.log(`✓ app-${label}-mobile.png`);
  
  await browser.close();
  
  // Stop server
  try {
    execSync('tmux -f /exec-daemon/tmux.portal.conf send-keys -t "app-capture:0.0" C-c', {stdio: 'ignore'});
  } catch {}
}

// Capture before
await captureScreenshots('before', BEFORE_SHA);

// Capture after
await captureScreenshots('after', AFTER_SHA);

// Return to current commit
execSync(`git checkout ${AFTER_SHA}`, {stdio: 'ignore'});

console.log('\n✨ Before/after screenshots captured');
console.log(`\nLocation: ${OUTPUT_DIR}/`);
console.log('Files:');
console.log('  - app-before-desktop.png');
console.log('  - app-before-mobile.png');
console.log('  - app-after-desktop.png');
console.log('  - app-after-mobile.png');
