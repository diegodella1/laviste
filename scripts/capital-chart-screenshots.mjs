/** Home aggregate chart: seeded multi + single-thesis capital line at 1440. */
import {chromium} from '@playwright/test';
import {mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';

const out = '/opt/cursor/artifacts/screenshots';
const tag = '-capital-fix';
mkdirSync(out, {recursive: true});
const password = 'capital-chart-screenshot';
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

async function waitHomeChart(page) {
  await page.waitForFunction(() => {
    const host = document.querySelector('.home-chart .chart-host[data-ready="1"]');
    return !!host?.querySelector('svg polyline');
  }, {timeout: 15000});
}

async function stabilize(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.classList.remove('modal-open');
  });
}

function seedSingleThesisStore(store) {
  const t = createTake(templates[0]);
  t.title = 'Energía que mueve Argentina';
  const activatedAt = '2026-10-06T13:40:00.000Z';
  activate(t, 1_000_000, activatedAt);
  t.history.push({
    at: '2026-10-05T15:00:00.000Z',
    value: 500_000,
    benchmark: 500_000,
  });
  t.history.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  t.history.push({at: '2026-10-06T14:00:00.000Z', value: 1_008_790, benchmark: 1_000_000});
  store.putTake(t);
}

const browser = await chromium.launch(launchOpts);
const paths = [];
try {
  const w = 1440;
  const dirSeed = mkdtempSync(join(tmpdir(), 'lav-cap-seed-'));
  const appSeed = createApp({
    dataDir: dirSeed,
    password,
    apiKey: 'x',
    port: 0,
    seed: true,
    quotesLive: true,
    quotesFixture: true,
    host: '127.0.0.1',
  });
  await new Promise(r => appSeed.server.listen(0, '127.0.0.1', r));
  const baseSeed = 'http://127.0.0.1:' + appSeed.server.address().port;
  const pageSeed = await browser.newPage({viewport: {width: w, height: 900}});
  try {
    await login(pageSeed, baseSeed);
    await waitHomeChart(pageSeed);
    await stabilize(pageSeed);
    const p = `${out}/app-home-seeded-${w}${tag}.png`;
    await pageSeed.screenshot({path: p, fullPage: true});
    paths.push(p);
  } finally {
    await pageSeed.close();
    await appSeed.close();
    rmSync(dirSeed, {recursive: true, force: true});
  }

  const dirSingle = mkdtempSync(join(tmpdir(), 'lav-cap-single-'));
  const appSingle = createApp({
    dataDir: dirSingle,
    password,
    apiKey: 'x',
    port: 0,
    seed: false,
    quotesLive: true,
    quotesFixture: true,
    host: '127.0.0.1',
  });
  await new Promise(r => appSingle.server.listen(0, '127.0.0.1', r));
  appSingle.store.transaction(() => seedSingleThesisStore(appSingle.store));
  const baseSingle = 'http://127.0.0.1:' + appSingle.server.address().port;
  const pageSingle = await browser.newPage({viewport: {width: w, height: 900}});
  try {
    await login(pageSingle, baseSingle);
    await waitHomeChart(pageSingle);
    await stabilize(pageSingle);
    const p = `${out}/app-home-single-thesis-${w}${tag}.png`;
    await pageSingle.screenshot({path: p, fullPage: true});
    paths.push(p);
  } finally {
    await pageSingle.close();
    await appSingle.close();
    rmSync(dirSingle, {recursive: true, force: true});
  }
} finally {
  await browser.close();
}
console.log(paths.join('\n'));
