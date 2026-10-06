/** Recapture home seeded/empty after aggregate capital + empty-home UI fixes. */
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const out = '/opt/cursor/artifacts/screenshots';
const tag = '-v2final3';
mkdirSync(out, {recursive: true});
const password = 'theme-screenshot-pass';
const launchOpts = {
  headless: true,
  ...(process.env.PLAYWRIGHT_USE_BUNDLED ? {} : {executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'}),
  args: ['--no-sandbox', '--disable-gpu'],
};

function activeTake(store, match) {
  return store.takes().find(t => t.phase === 'active' && match(t));
}

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
    const dir = mkdtempSync(join(tmpdir(), 'laviste-v2final3-'));
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
      await page.waitForSelector('#ejemplo-practica');
      await page.waitForSelector('.demo-thesis-list .demo-thesis');
      await stabilizeForFullPage(page);
      const pEmpty = `${out}/app-home-empty-${w}${tag}.png`;
      await page.screenshot({path: pEmpty, fullPage: true});
      captured.push(pEmpty);
    } finally {
      await page.close();
      await app.close();
      rmSync(dir, {recursive: true, force: true});
    }

    const dir2 = mkdtempSync(join(tmpdir(), 'laviste-v2final3-seed-'));
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
      await page2.getByText('Bancos y crédito', {exact: false}).first().waitFor();
      await waitHomeChartPainted(page2);
      await stabilizeForFullPage(page2);
      const pHome = `${out}/app-home-seeded-${w}${tag}.png`;
      await page2.screenshot({path: pHome, fullPage: true});
      captured.push(pHome);

      const okTake = activeTake(app2.store, t => t.title.includes('cobertura') || t.title.includes('CEDEAR'));
      await page2.goto(base2 + `/app#/take/${okTake.id}/positions`);
      await page2.waitForSelector(w < 700 ? '.position-list' : '.positions-table');
      await page2.waitForFunction(() => {
        const chart = document.querySelector('.take-positions-chart .chart-host[data-ready="1"]');
        return chart?.querySelector('svg polyline') || document.querySelector('.take-positions-chart .empty');
      }, {timeout: 8000});
      await stabilizeForFullPage(page2);
      const pPos = `${out}/app-thesis-posiciones-${w}${tag}.png`;
      await page2.screenshot({path: pPos, fullPage: true});
      captured.push(pPos);
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
