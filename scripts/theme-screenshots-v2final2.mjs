/** Recapture home-seeded + settings-footer after chart/aggregate fixes. */
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {PRACTICE_FOOTER} from '../lib/copy.mjs';

const out = '/opt/cursor/artifacts/screenshots';
const tag = '-v2final2';
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

async function closeModalIfOpen(page) {
  const modal = page.locator('#modal[open]');
  if (await modal.count()) {
    await page.locator('#modal [data-action=close]').click();
    await page.waitForFunction(() => !document.getElementById('modal')?.open);
  }
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
    const dir = mkdtempSync(join(tmpdir(), 'laviste-v2final2-'));
    const app = createApp({
      dataDir: dir,
      password,
      apiKey: 'x',
      port: 0,
      seed: true,
      quotesLive: true,
      quotesFixture: true,
      host: '127.0.0.1',
    });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const page = await browser.newPage({viewport: {width: w, height: 900}});
    try {
      await login(page, base);
      await page.goto(base + '/app#/');
      await page.waitForSelector('.hero-n');
      await page.getByText('Energía en Vaca Muerta', {exact: false}).first().waitFor();
      await page.getByText('precio demorado', {exact: false}).first().waitFor();
      await waitHomeChartPainted(page);
      await stabilizeForFullPage(page);
      const pHome = `${out}/app-home-seeded-${w}${tag}.png`;
      await page.screenshot({path: pHome, fullPage: true});
      captured.push(pHome);

      await closeModalIfOpen(page);
      await page.goto(base + '/app#/settings');
      await page.waitForSelector('#openai-settings');
      await closeModalIfOpen(page);
      await page.getByText(PRACTICE_FOOTER, {exact: true}).scrollIntoViewIfNeeded();
      await stabilizeForFullPage(page);
      const pSet = `${out}/app-settings-footer-${w}${tag}.png`;
      await page.screenshot({path: pSet, fullPage: true});
      captured.push(pSet);
    } finally {
      await page.close();
      await app.close();
      rmSync(dir, {recursive: true, force: true});
    }
  }
  for (const p of captured) console.log(p);
} finally {
  await browser.close();
}
