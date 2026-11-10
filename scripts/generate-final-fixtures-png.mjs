#!/usr/bin/env node
/**
 * Generate PNG screenshots for final-review-fixtures
 * Desktop 1280x1024, Mobile 375x812, Light and Dark modes
 */

import {chromium} from 'playwright';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

const FIXTURES_DIR = 'final-review-fixtures';
const fixtures = [
  'digest-rich',
  'digest-unavailable',
  'digest-loss',
  'digest-multi-thesis',
  'trade-compra',
  'trade-venta',
  'trade-null-side',
  'trade-zero',
  'trade-null-impacts',
];

const viewports = [
  {name: 'desktop', width: 1280, height: 1024},
  {name: 'mobile', width: 375, height: 812},
];

const colorSchemes = [
  {name: 'light', scheme: 'light'},
  {name: 'dark', scheme: 'dark'},
];

console.log('Launching Chromium for screenshot generation...\n');

const browser = await chromium.launch();

for (const fixture of fixtures) {
  const htmlPath = join(FIXTURES_DIR, `${fixture}.html`);
  const html = readFileSync(htmlPath, 'utf8');
  
  for (const viewport of viewports) {
    for (const colorScheme of colorSchemes) {
      const context = await browser.newContext({
        viewport: {width: viewport.width, height: viewport.height},
        colorScheme: colorScheme.scheme,
      });
      
      const page = await context.newPage();
      await page.setContent(html, {waitUntil: 'networkidle'});
      
      const screenshotName = `${fixture}-${viewport.name}-${colorScheme.name}.png`;
      const screenshotPath = join(FIXTURES_DIR, screenshotName);
      
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });
      
      console.log(`✓ ${screenshotName}`);
      
      await context.close();
    }
  }
}

await browser.close();
console.log('\n✨ All PNGs generated');
