/**
 * Fresh Copy v2 FINAL screenshots (-v2final suffix). Run after npm run build:site.
 */
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {createTake, templates} from '../lib/engine.mjs';
import {PRACTICE_FOOTER} from '../lib/copy.mjs';

const out = '/opt/cursor/artifacts/screenshots';
const tag = '-v2final';
mkdirSync(out, {recursive: true});
const password = 'theme-screenshot-pass';
const launchOpts = {
  headless: true,
  ...(process.env.PLAYWRIGHT_USE_BUNDLED ? {} : {executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'}),
  args: ['--no-sandbox', '--disable-gpu'],
};

const fixtureAppOpts = {
  seed: true,
  quotesLive: true,
  quotesFixture: true,
  host: '127.0.0.1',
};

function shot(name, w) {
  return `${out}/${name}-${w}${tag}.png`;
}

function activeTake(store, match) {
  return store.takes().find(t => t.phase === 'active' && match(t));
}

async function login(page, base) {
  await page.goto(base + '/app');
  await page.locator('#login input').fill(password);
  await page.locator('#login button').click();
  await page.waitForSelector('.main');
}

async function waitModalSettled(page) {
  await page.locator('#modal[open]').waitFor();
  await page.waitForFunction(() => {
    const d = document.getElementById('modal');
    if (!d?.open) return false;
    return Number(getComputedStyle(d).opacity) >= 0.99;
  });
  await page.waitForTimeout(350);
}

async function waitHeroVisible(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.hero-copy h1, .hero h1');
    if (!el) return true;
    return Number(getComputedStyle(el).opacity) > 0.95;
  }, {timeout: 5000});
}

async function waitHomeChartPainted(page) {
  await page.waitForFunction(() => {
    const section = document.querySelector('.home-chart');
    if (!section) return false;
    if (section.querySelector('.empty.small')) return true;
    const host = section.querySelector('.chart-host[data-ready="1"]');
    if (!host?.querySelector('svg polyline')) return false;
    const ticks = (host.dataset.yTicks || '').split('|').filter(Boolean);
    return ticks.length >= 2 && !ticks.every(t => t === '$ 0,0 M');
  }, {timeout: 15000});
}

async function withApp(browser, opts, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'laviste-v2final-'));
  const app = createApp({dataDir: dir, password, apiKey: 'x', port: 0, ...opts});
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

async function stabilizeForFullPage(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const main = document.querySelector('.main');
    if (main) main.style.paddingTop = '0';
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      topbar.style.position = 'relative';
      topbar.style.top = 'auto';
    }
    const dock = document.querySelector('.chat-dock');
    if (dock) {
      dock.style.position = 'relative';
      dock.style.bottom = 'auto';
      dock.style.marginTop = '24px';
    }
  });
}

async function fullPageShot(page, path) {
  await stabilizeForFullPage(page);
  await page.screenshot({path, fullPage: true});
}

const browser = await chromium.launch(launchOpts);
const captured = [];
try {
  for (const w of [1440, 390]) {
    await withApp(browser, {seed: false, quotesLive: true, quotesFixture: true}, async (page, base) => {
      await page.setViewportSize({width: w, height: 900});
      await login(page, base);
      await page.waitForFunction(() => document.querySelector('.home-empty') || document.querySelector('.hero-n'), {timeout: 15000});
      if (await page.locator('.home-loading').count()) {
        await page.waitForFunction(() => !document.querySelector('.home-loading'), {timeout: 15000});
      }
      await page.waitForSelector('.home-empty');
      const p = shot('app-home-empty', w);
      await fullPageShot(page, p);
      captured.push(p);
    });

    await withApp(browser, fixtureAppOpts, async (page, base, app) => {
      await page.setViewportSize({width: w, height: 900});
      await login(page, base);
      await page.goto(base + '/app#/');
      await page.waitForSelector('.hero-n');
      await page.getByText('Energía en Vaca Muerta', {exact: false}).first().waitFor({timeout: 8000});
      await page.getByText('Bancos y crédito', {exact: false}).first().waitFor({timeout: 8000});
      await page.getByText('precio demorado', {exact: false}).first().waitFor();
      await waitHomeChartPainted(page);
      const pSeed = shot('app-home-seeded', w);
      await fullPageShot(page, pSeed);
      captured.push(pSeed);

      const okTake = activeTake(app.store, t => t.title.includes('cobertura') || t.title.includes('CEDEAR'));
      const actionTake = activeTake(app.store, t => t.title.includes('Banco') || t.title.includes('crédito'));

      app.store.transaction(() => app.store.putTake(createTake(templates[1])));
      const draft = app.store.takes().find(t => t.phase === 'draft' && t.title.includes('Bancos'));
      await page.goto(base + `/app#/take/${draft.id}`);
      await page.locator('[data-action=activate]').click();
      await waitModalSettled(page);
      const pModal = shot('app-home-modal-activar', w);
      await page.screenshot({path: pModal, fullPage: false});
      captured.push(pModal);
      await page.locator('#modal .modal-title [data-action=close]').click();

      await page.goto(base + `/app#/take/${okTake.id}/news`);
      await page.waitForSelector('.take-body .verdict.ok');
      const pNews = shot('app-thesis-novedades-ok', w);
      await fullPageShot(page, pNews);
      captured.push(pNews);

      await page.goto(base + `/app#/take/${actionTake.id}/news`);
      await page.locator('.suggested-action [data-action=apply-rebalance]').waitFor({timeout: 10000});
      const pVerdict = shot('app-thesis-verdict-action', w);
      await fullPageShot(page, pVerdict);
      captured.push(pVerdict);

      await page.goto(base + `/app#/take/${okTake.id}/positions`);
      await page.waitForSelector(w < 700 ? '.position-list' : '.positions-table');
      await page.waitForFunction(() => {
        const chart = document.querySelector('.take-positions-chart .chart-host[data-ready="1"]');
        return chart?.querySelector('svg polyline') || document.querySelector('.take-positions-chart .empty');
      }, {timeout: 8000});
      const pPos = shot('app-thesis-posiciones', w);
      await fullPageShot(page, pPos);
      captured.push(pPos);

      await page.goto(base + `/app#/take/${actionTake.id}/news`);
      await page.locator('[data-action=apply-rebalance]').click();
      await page.locator(w < 700 ? '#modal .rebalance-stack' : '#modal .rebalance-table').first().waitFor({timeout: 8000});
      await waitModalSettled(page);
      const pReb = shot('app-rebalance-modal', w);
      await page.screenshot({path: pReb, fullPage: false});
      captured.push(pReb);
      await page.locator('#modal [data-action=close]').click();
      await page.waitForFunction(() => !document.getElementById('modal')?.open);

      await page.goto(base + '/app#/settings');
      await page.waitForSelector('#openai-settings');
      await page.getByText(PRACTICE_FOOTER, {exact: true}).scrollIntoViewIfNeeded();
      const pSet = shot('app-settings-footer', w);
      await fullPageShot(page, pSet);
      captured.push(pSet);
    });
  }

  for (const w of [1440, 390]) {
    const dir = mkdtempSync(join(tmpdir(), 'laviste-v2final-site-'));
    const app = createApp({dataDir: dir, password, apiKey: 'x', port: 0, seed: true, host: '127.0.0.1', quotesLive: true, quotesFixture: true});
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const page = await browser.newPage();
    try {
      await page.setViewportSize({width: w, height: 900});
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.goto(base + '/');
      await page.evaluate(() => document.fonts.ready);
      await waitHeroVisible(page);
      await page.waitForSelector('.terminal-preview');
      const pHome = shot('marketing-home', w);
      await page.screenshot({path: pHome, fullPage: true});
      captured.push(pHome);
      if (w === 1440) {
        await page.goto(base + '/acerca');
        await page.waitForSelector('.sim-compare');
        await waitHeroVisible(page);
        await login(page, base);
        await page.goto(base + '/acerca');
        await page.waitForSelector('.sim-compare');
        const pAbout = shot('marketing-acerca-session-1', w);
        await page.screenshot({path: pAbout, fullPage: true});
        captured.push(pAbout);
      }
    } finally {
      await page.close();
      await app.close();
      rmSync(dir, {recursive: true, force: true});
    }
  }

  console.log('v2final screenshots:');
  for (const p of captured) console.log(p);
} finally {
  await browser.close();
}
