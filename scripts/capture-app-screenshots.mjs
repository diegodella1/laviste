import {chromium} from 'playwright';
import {mkdirSync} from 'fs';

const url = 'http://127.0.0.1:3080/app';
const outputDir = '/opt/cursor/artifacts/app-screenshots';

mkdirSync(outputDir, {recursive: true});
console.log('Launching Chromium for /app screenshot generation...\n');

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// Desktop light
await page.setViewportSize({width: 1280, height: 1024});
await page.goto(url, {waitUntil: 'domcontentloaded'});
await page.waitForTimeout(2000); // Wait for CSS and fonts
await page.screenshot({path: `${outputDir}/app-desktop-light.png`, fullPage: true});
console.log('✓ app-desktop-light.png');

// Desktop dark
await page.emulateMedia({colorScheme: 'dark'});
await page.waitForTimeout(500);
await page.screenshot({path: `${outputDir}/app-desktop-dark.png`, fullPage: true});
console.log('✓ app-desktop-dark.png');

// Mobile light
await page.setViewportSize({width: 375, height: 812});
await page.emulateMedia({colorScheme: 'light'});
await page.waitForTimeout(500);
await page.screenshot({path: `${outputDir}/app-mobile-light.png`, fullPage: true});
console.log('✓ app-mobile-light.png');

// Mobile dark
await page.emulateMedia({colorScheme: 'dark'});
await page.waitForTimeout(500);
await page.screenshot({path: `${outputDir}/app-mobile-dark.png`, fullPage: true});
console.log('✓ app-mobile-dark.png');

await browser.close();

console.log('\n✨ All /app screenshots captured');
