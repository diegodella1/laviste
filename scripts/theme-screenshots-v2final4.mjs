/** Recapture home seeded/empty after ART-aligned aggregate + chip styling. */
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const out = '/opt/cursor/artifacts/screenshots';
const tag = '-v2final4';
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

async function waitHomeChartPainted(page) {
  await page.waitForFunction(() => {
    const section = document.querySelector('.home-chart');
    if (!section) return false;
    const host = section.querySelector('.chart-host[data-ready="1"]');
    if (!host?.querySelector('svg polyline')) return false;
    const ticks = (host.dataset.yTicks || '').split('|').filter(Boolean);
    return ticks.length >= 2 && !ticks.every(t => t === '$ 0,0 M');
  }, {timeout: 15000});
}

async function stabilizeForFullPage(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.classList.remove('modal-open');
    const main = document.querySelector('.main');
    if (main) main.style.paddingTop = '0';
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.style.position = 'relative';
  });
}

const browser = await chromium.launch(launchOpts);
const captured = [];
try {
  for (const w of [1440, 390]) {
    const dir = mkdtempSync(join(tmpdir(), 'lav-empty-v2f4-'));
    const app = createApp({
      dataDir: dir,
      password,
      apiKey: 'x',
      port: 0,
      seed: false,
      quotesLive: true,
      quotesFixture: true,
      host: '127.0.0.1',
    });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const page = await browser.newPage({viewport: {width: w, height: 900}});
    try {
      await login(page, base);
      await page.waitForSelector('.home-empty');
      await page.waitForSelector('.demo-thesis-list .demo-thesis');
      await stabilizeForFullPage(page);
      captured.push(`${out}/app-home-empty-${w}${tag}.png`);
      await page.screenshot({path: captured.at(-1), fullPage: true});
    } finally {
      await page.close();
      await app.close();
      rmSync(dir, {recursive: true, force: true});
    }

    const dir2 = mkdtempSync(join(tmpdir(), 'lav-seed-v2f4-'));
    const app2 = createApp({
      dataDir: dir2,
      password,
      apiKey: 'x',
      port: 0,
      seed: true,
      quotesLive: true,
      quotesFixture: true,
      host: '127.0.0.1',
    });
    await new Promise(r => app2.server.listen(0, '127.0.0.1', r));
    const base2 = 'http://127.0.0.1:' + app2.server.address().port;
    const page2 = await browser.newPage({viewport: {width: w, height: 900}});
    try {
      await login(page2, base2);
      await page2.goto(base2 + '/app#/');
      await page2.waitForSelector('.hero-n');
      await waitHomeChartPainted(page2);
      await stabilizeForFullPage(page2);
      captured.push(`${out}/app-home-seeded-${w}${tag}.png`);
      await page2.screenshot({path: captured.at(-1), fullPage: true});
    } finally {
      await page2.close();
      await app2.close();
      rmSync(dir2, {recursive: true, force: true});
    }
  }
  for (const p of captured) console.log(p);
} finally {
  await browser.close();
}
