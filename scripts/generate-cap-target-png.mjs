#!/usr/bin/env node
import {chromium} from 'playwright';
import {readFileSync} from 'fs';
import {join} from 'path';

const FIXTURES_DIR = 'final-review-fixtures';
const html = readFileSync(join(FIXTURES_DIR, 'trade-cap-target.html'), 'utf8');

console.log('Launching Chromium for cap-target screenshot generation...\n');

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// Desktop light
await page.setViewportSize({width: 1280, height: 1024});
await page.setContent(html, {waitUntil: 'load'});
await page.screenshot({path: join(FIXTURES_DIR, 'trade-cap-target-desktop-light.png'), fullPage: true});
console.log('✓ trade-cap-target-desktop-light.png');

// Desktop dark
await page.emulateMedia({colorScheme: 'dark'});
await page.screenshot({path: join(FIXTURES_DIR, 'trade-cap-target-desktop-dark.png'), fullPage: true});
console.log('✓ trade-cap-target-desktop-dark.png');

// Mobile light
await page.setViewportSize({width: 375, height: 812});
await page.emulateMedia({colorScheme: 'light'});
await page.screenshot({path: join(FIXTURES_DIR, 'trade-cap-target-mobile-light.png'), fullPage: true});
console.log('✓ trade-cap-target-mobile-light.png');

// Mobile dark
await page.emulateMedia({colorScheme: 'dark'});
await page.screenshot({path: join(FIXTURES_DIR, 'trade-cap-target-mobile-dark.png'), fullPage: true});
console.log('✓ trade-cap-target-mobile-dark.png');

await browser.close();

console.log('\n✨ Cap-target PNGs generated');
