/** UX re-pass v3: home, rebalance modal, per-thesis chart (no vs Índice). */
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdirSync, readFileSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const out = '/opt/cursor/artifacts/screenshots';
const tag = '-v3';
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

async function assertShot(path) {
  const buf = readFileSync(path);
  assert.ok(buf.length > 8000, `${path} looks blank (${buf.length} bytes)`);
  const md5 = createHash('md5').update(buf).digest('hex');
  return md5;
}

const browser = await chromium.launch(launchOpts);
const captured = [];
const md5s = new Map();
try {
  for (const w of [1440, 390]) {
    const dir = mkdtempSync(join(tmpdir(), 'lav-empty-v3-'));
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
      const pEmpty = `${out}/app-home-empty-${w}${tag}.png`;
      await page.screenshot({path: pEmpty, fullPage: true});
      const h = await assertShot(pEmpty);
      if (md5s.has(h)) throw new Error(`duplicate md5 ${h} for ${pEmpty}`);
      md5s.set(h, pEmpty);
      captured.push(pEmpty);
    } finally {
      await page.close();
      await app.close();
      rmSync(dir, {recursive: true, force: true});
    }

    const dir2 = mkdtempSync(join(tmpdir(), 'lav-seed-v3-'));
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
      await page2.waitForSelector('.ahora-pills .status-mark.watch');
      await page2.waitForFunction(() => {
        const watch = document.querySelector('.ahora-pills .status-mark.watch');
        return watch && /Vigilando · [1-9]/.test(watch.textContent || '');
      }, {timeout: 10000});
      await waitHomeChartPainted(page2);
      await stabilizeForFullPage(page2);
      const pHome = `${out}/app-home-seeded-${w}${tag}.png`;
      await page2.screenshot({path: pHome, fullPage: true});
      const hHome = await assertShot(pHome);
      if (md5s.has(hHome)) throw new Error(`duplicate md5 ${hHome} for ${pHome}`);
      md5s.set(hHome, pHome);

      const bodyText = await page2.locator('#app').innerText();
      if (/vs\.?\s*Índice/i.test(bodyText)) throw new Error('vs Índice still visible on home');

      captured.push(pHome);

      if (w === 390) {
        const okTake = activeTake(app2.store, t => t.title.includes('cobertura') || t.title.includes('CEDEAR'));
        const actionTake = activeTake(app2.store, t => t.title.includes('Banco') || t.title.includes('crédito'));

        await page2.goto(base2 + `/app#/take/${okTake.id}/positions`);
        await page2.waitForSelector('.take-positions-chart', {timeout: 8000});
        await page2.waitForFunction(() => {
          const chart = document.querySelector('.take-positions-chart .chart-host[data-ready="1"]');
          return chart?.querySelector('svg polyline') || document.querySelector('.take-positions-chart .empty');
        }, {timeout: 8000});
        await stabilizeForFullPage(page2);
        const pChart = `${out}/app-thesis-chart-390${tag}.png`;
        await page2.screenshot({path: pChart, fullPage: true});
        const hChart = await assertShot(pChart);
        if (md5s.has(hChart)) throw new Error(`duplicate md5 ${hChart} for ${pChart}`);
        md5s.set(hChart, pChart);
        const chartText = await page2.locator('#app').innerText();
        if (/vs\.?\s*Índice/i.test(chartText)) throw new Error('vs Índice on thesis chart');
        captured.push(pChart);

        await page2.goto(base2 + `/app#/take/${actionTake.id}/news`);
        await page2.locator('[data-action=apply-rebalance]').click({timeout: 10000});
        await page2.locator('#modal .rebalance-stack').first().waitFor({timeout: 8000});
        await page2.waitForTimeout(200);
        const pReb = `${out}/app-rebalance-modal-390${tag}.png`;
        await page2.screenshot({path: pReb, fullPage: false});
        const hReb = await assertShot(pReb);
        if (md5s.has(hReb)) throw new Error(`duplicate md5 ${hReb} for ${pReb}`);
        md5s.set(hReb, pReb);
        captured.push(pReb);
      }
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
