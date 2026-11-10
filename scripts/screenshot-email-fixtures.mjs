/**
 * Generate screenshots of email fixtures for design review.
 * Captures at 390px (mobile) and 1280px (desktop) in light and dark modes.
 */

import {chromium} from '@playwright/test';
import {readFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../test/fixtures/email');
const SCREENSHOTS_DIR = join(__dirname, '../test/fixtures/email/screenshots');

mkdirSync(SCREENSHOTS_DIR, {recursive: true});

const fixtures = [
  {name: 'digest-positive', file: 'digest-positive.html'},
  {name: 'digest-negative', file: 'digest-negative.html'},
  {name: 'trade-alert', file: 'trade-alert.html'},
];

const viewports = [
  {name: 'mobile', width: 390, height: 844},
  {name: 'desktop', width: 1280, height: 1024},
];

const colorSchemes = [
  {name: 'light', scheme: 'light'},
  {name: 'dark', scheme: 'dark'},
];

console.log('Launching browser for email screenshot generation...\n');

const browser = await chromium.launch();

for (const fixture of fixtures) {
  const html = readFileSync(join(FIXTURES_DIR, fixture.file), 'utf8');
  
  for (const viewport of viewports) {
    for (const colorScheme of colorSchemes) {
      const context = await browser.newContext({
        viewport: {width: viewport.width, height: viewport.height},
        colorScheme: colorScheme.scheme,
      });
      
      const page = await context.newPage();
      await page.setContent(html);
      
      const screenshotName = `${fixture.name}-${viewport.name}-${colorScheme.name}.png`;
      const screenshotPath = join(SCREENSHOTS_DIR, screenshotName);
      
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

console.log(`\nAll screenshots saved to ${SCREENSHOTS_DIR}/`);
console.log('Ready for design review.\n');
