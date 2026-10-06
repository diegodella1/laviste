import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const out = '/opt/cursor/artifacts/screenshots';
mkdirSync(out, {recursive: true});
const password = 'theme-screenshot-pass';
const launchOpts = {
  headless: true,
  ...(process.env.PLAYWRIGHT_USE_BUNDLED ? {} : {executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'}),
  args: ['--no-sandbox', '--disable-gpu'],
};

async function login(page, base) {
  await page.goto(base + '/app');
  await page.locator('#login input').fill(password);
  await page.locator('#login button').click();
  await page.waitForSelector('.main');
}

async function withApp(browser, {seed = false}, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'laviste-theme-shot-'));
  const app = createApp({dataDir: dir, password, apiKey: 'x', port: 0, seed, host: '127.0.0.1', quotesLive: false, quotesFixture: true});
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const page = await browser.newPage();
  try {
    await fn(page, base, app);
  } finally {
    await page.close();
    await app.close();
    rmSync(dir, {recursive: true, force: true});
  }
}

const browser = await chromium.launch(launchOpts);
try {
  for (const w of [1440, 390]) {
    await withApp(browser, {seed: false}, async (page, base) => {
      await page.setViewportSize({width: w, height: 1400});
      await page.route('**/api/state', async (route, request) => {
        if (request.method() === 'GET') await new Promise(r => setTimeout(r, 1200));
        await route.continue();
      });
      await login(page, base);
      await page.waitForSelector('.home-loading');
      await page.screenshot({path: `${out}/app-home-loading-${w}.png`, fullPage: true});
      await page.unroute('**/api/state');
      await page.waitForSelector('.home-empty');
      await page.screenshot({path: `${out}/app-home-empty-${w}.png`, fullPage: true});
    });

    await withApp(browser, {seed: true}, async (page, base, app) => {
      await page.setViewportSize({width: w, height: 1400});
      await login(page, base);
      await page.goto(base + '/app#/');
      await page.waitForSelector('.ahora-strip');
      await page.screenshot({path: `${out}/app-home-seeded-${w}.png`, fullPage: true});
      const newsTake = app.store.takes().find(t => t.title.includes('IA')) || app.store.takes()[0];
      const rebTake = app.store.takes().find(t => t.title.includes('Energía')) || app.store.takes()[0];
      await page.goto(base + `/app#/take/${newsTake.id}/news`);
      await page.waitForSelector('.timeline');
      await page.screenshot({path: `${out}/app-thesis-novedades-${w}.png`, fullPage: true});
      await page.goto(base + `/app#/take/${rebTake.id}/positions`);
      await page.locator('[data-action=disclose]').first().click();
      await page.waitForSelector('.disclosure-row.expanded .porque-panel');
      await page.screenshot({path: `${out}/app-thesis-posiciones-${w}.png`, fullPage: true});
      await page.goto(base + `/app#/take/${rebTake.id}/news`);
      await page.locator('[data-action=apply-rebalance]').click({timeout: 8000});
      await page.locator(w < 700 ? '#modal .rebalance-stack' : '#modal .rebalance-table').first().waitFor({timeout: 8000});
      await page.screenshot({path: `${out}/app-rebalance-modal-${w}.png`, fullPage: true});
      await page.goto(base + '/app#/settings');
      await page.waitForSelector('#openai-settings');
      await page.screenshot({path: `${out}/app-settings-${w}.png`, fullPage: true});
    });

    const dir = mkdtempSync(join(tmpdir(), 'laviste-site-shot-'));
    const app = createApp({dataDir: dir, password, apiKey: 'x', port: 0, seed: true, host: '127.0.0.1'});
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const page = await browser.newPage({viewport: {width: w, height: 1600}});
    try {
      await page.goto(base + '/');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path: `${out}/marketing-home-${w}.png`, fullPage: true});
      await login(page, base);
      await page.goto(base + '/acerca');
      await page.waitForSelector('.sim-compare');
      await page.screenshot({path: `${out}/marketing-acerca-${w}.png`, fullPage: true});
    } finally {
      await page.close();
      await app.close();
      rmSync(dir, {recursive: true, force: true});
    }
  }
  console.log('Theme screenshots saved to', out);
} finally {
  await browser.close();
}
