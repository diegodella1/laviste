#!/usr/bin/env node
/**
 * Generate PNG screenshots of review fixtures
 * Requires Playwright to be installed
 */

import {chromium} from 'playwright';
import {readFileSync, existsSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const FIXTURES_DIR = join(REPO_ROOT, 'final-review-fixtures');
const HTML_FILES = [
  'digest-rich.html',
  'digest-unavailable.html',
  'digest-loss.html',
  'digest-multi-thesis.html',
  'trade-compra.html',
  'trade-venta.html',
  'trade-null-side.html',
  'trade-zero.html',
  'trade-null-impacts.html',
];

const VIEWPORTS = {
  desktop: {width: 1280, height: 1024},
  mobile: {width: 375, height: 812},
};

const COLOR_SCHEMES = ['light', 'dark'];

async function captureScreenshot(html, filename, viewport, colorScheme) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    colorScheme,
  });
  const page = await context.newPage();
  
  await page.setContent(html);
  await page.waitForLoadState('networkidle');
  
  const screenshotPath = join(FIXTURES_DIR, filename);
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  });
  
  await browser.close();
  console.log(`✓ ${filename}`);
}

async function main() {
  console.log('Generating PNG screenshots...\n');
  
  for (const htmlFile of HTML_FILES) {
    const htmlPath = join(FIXTURES_DIR, htmlFile);
    
    if (!existsSync(htmlPath)) {
      console.error(`✗ ${htmlFile} not found, skipping`);
      continue;
    }
    
    const html = readFileSync(htmlPath, 'utf8');
    const base = htmlFile.replace('.html', '');
    
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      for (const colorScheme of COLOR_SCHEMES) {
        const filename = `${base}-${viewportName}-${colorScheme}.png`;
        try {
          await captureScreenshot(html, filename, viewport, colorScheme);
        } catch (error) {
          console.error(`✗ ${filename}: ${error.message}`);
        }
      }
    }
  }
  
  console.log('\n✨ Screenshot generation complete!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
