#!/usr/bin/env node
/**
 * Generate PNG screenshots for normal-mode-offline-evidence
 * Desktop 1280x1024, Mobile 375x812, Light and Dark modes
 */

import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const EVIDENCE_DIR = 'normal-mode-offline-evidence';
const fixtures = [
  'synthetic-digest-positive-normal',
  'synthetic-trade-buy-normal',
  'synthetic-trade-sell-normal',
];

const viewports = [
  {name: 'desktop', width: 1280, height: 1024},
  {name: 'mobile', width: 375, height: 812},
];

const colorSchemes = [
  {name: 'light', scheme: 'light'},
  {name: 'dark', scheme: 'dark'},
];

console.log('Launching Chromium for normal-mode screenshot generation...\n');

const browser = await chromium.launch();

for (const fixture of fixtures) {
  const htmlPath = join(EVIDENCE_DIR, `${fixture}.html`);
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
      const screenshotPath = join(EVIDENCE_DIR, screenshotName);
      
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
console.log('\n✨ All normal-mode PNGs generated');
