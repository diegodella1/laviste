import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {createTake, templates} from '../lib/engine.mjs';

const out = '/opt/cursor/artifacts/screenshots';
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
    const opacity = getComputedStyle(d).opacity;
    return Number(opacity) >= 0.99;
  });
  await page.waitForTimeout(350);
}

async function withApp(browser, opts, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'laviste-theme-shot-'));
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
      topbar.style.left = 'auto';
      topbar.style.right = 'auto';
    }
    const dock = document.querySelector('.chat-dock');
    if (dock) {
      dock.style.position = 'relative';
      dock.style.left = 'auto';
      dock.style.right = 'auto';
      dock.style.bottom = 'auto';
      dock.style.marginTop = '24px';
    }
    document.querySelectorAll('.toast, .chat-status').forEach(el => {
      el.style.display = 'none';
    });
  });
}

async function waitHomeChartPainted(page) {
  await page.waitForFunction(() => {
    const section = document.querySelector('.home-chart');
    if (!section) return false;
    if (section.querySelector('.empty.small')) return true;
    const host = section.querySelector('.chart-host[data-ready="1"]');
    return !!host?.querySelector('svg polyline');
  }, {timeout: 12000});
}

async function fullPageShot(page, path) {
  await stabilizeForFullPage(page);
  await page.screenshot({path, fullPage: true});
}

const browser = await chromium.launch(launchOpts);
try {
  for (const w of [1440, 390]) {
    await withApp(browser, {seed: false, quotesLive: true, quotesFixture: true}, async (page, base) => {
      await page.setViewportSize({width: w, height: 900});
      await page.addInitScript(() => {
        const orig = window.fetch.bind(window);
        let delayed = false;
        window.fetch = async (input, init) => {
          const url = typeof input === 'string' ? input : input.url;
          if (!delayed && url.includes('/api/state') && (!init || init.method === 'GET' || !init.method)) {
            delayed = true;
            await new Promise(r => setTimeout(r, 1200));
          }
          return orig(input, init);
        };
      });
      await login(page, base);
      await page.waitForSelector('.home-loading');
      await page.screenshot({path: `${out}/app-home-loading-${w}.png`, fullPage: true});
      await page.waitForFunction(() => !document.querySelector('.home-loading'));
      await page.waitForSelector('.home-empty');
      await page.screenshot({path: `${out}/app-home-empty-${w}.png`, fullPage: true});
    });

    await withApp(browser, fixtureAppOpts, async (page, base, app) => {
      await page.setViewportSize({width: w, height: 900});
      await login(page, base);
      await page.goto(base + '/app#/');
      await page.waitForSelector('.hero-n');
      await page.getByText('precio demorado', {exact: false}).first().waitFor();
      await waitHomeChartPainted(page);
      await fullPageShot(page, `${out}/app-home-seeded-${w}.png`);

      const okTake = activeTake(app.store, t => t.title.includes('economía') || t.title.includes('conectada'));
      const actionTake = activeTake(app.store, t => t.title.includes('Energía'));
      const newsTake = activeTake(app.store, t => t.title.includes('IA'));

      app.store.transaction(() => {
        const t = createTake(templates[1]);
        app.store.putTake(t);
      });
      const draft = app.store.takes().find(t => t.phase === 'draft' && t.title.includes('Energía'));
      await page.goto(base + `/app#/take/${draft.id}`);
      await page.locator('[data-action=activate]').waitFor();
      await page.locator('[data-action=activate]').click();
      await waitModalSettled(page);
      await page.screenshot({path: `${out}/app-home-modal-activar-${w}.png`, fullPage: false});
      await page.locator('#modal .modal-title [data-action=close]').click();

      await page.goto(base + `/app#/take/${okTake.id}/news`);
      await page.waitForSelector('.take-body .verdict.ok');
      await page.waitForFunction(() => !document.querySelector('[data-action=apply-rebalance]'));
      await fullPageShot(page, `${out}/app-thesis-novedades-ok-${w}.png`);

      await page.goto(base + `/app#/take/${actionTake.id}/news`);
      await page.locator('.suggested-action [data-action=apply-rebalance]').waitFor({timeout: 10000});
      await page.locator('.suggested-action').scrollIntoViewIfNeeded();
      await page.waitForSelector('.take-body .verdict.action');
      await fullPageShot(page, `${out}/app-thesis-verdict-action-${w}.png`);

      if (newsTake) {
        await page.goto(base + `/app#/take/${newsTake.id}/news`);
        await page.waitForSelector('.timeline');
        await fullPageShot(page, `${out}/app-thesis-novedades-${w}.png`);
      }

      await page.goto(base + `/app#/take/${okTake.id}/positions`);
      await page.waitForSelector('.positions-table');
      await page.locator('[data-action=disclose]').first().click().catch(() => {});
      await page.waitForTimeout(200);
      await page.waitForFunction(() => {
        const chart = document.querySelector('.take-positions-chart');
        if (!chart) return true;
        if (chart.querySelector('.empty.small')) return true;
        return !!chart.querySelector('svg polyline');
      }, {timeout: 8000});
      await fullPageShot(page, `${out}/app-thesis-posiciones-${w}.png`);

      await page.goto(base + `/app#/take/${actionTake.id}/positions`);
      await page.waitForSelector('.verdict.action');
      await fullPageShot(page, `${out}/app-thesis-posiciones-action-${w}.png`);

      await page.goto(base + `/app#/take/${actionTake.id}/idea`);
      await page.waitForSelector('.idea-section');
      await fullPageShot(page, `${out}/app-thesis-idea-${w}.png`);

      await page.goto(base + `/app#/take/${actionTake.id}/positions`);
      await page.waitForSelector('.take-toolbar .review-control[data-review-state="idle"] [data-action=review]:not([disabled])');
      await page.locator('.take-toolbar').screenshot({path: `${out}/app-thesis-revisar-default-${w}.png`});
      await page.locator('.take-toolbar [data-action=review]').click();
      await page.waitForSelector('.take-toolbar .review-control[data-review-state="countdown"], .take-toolbar .review-control[data-review-state="waiting"]', {timeout: 15000});
      await page.locator('.take-toolbar').screenshot({path: `${out}/app-thesis-revisar-states-${w}.png`});

      await page.goto(base + `/app#/take/${actionTake.id}/news`);
      await page.locator('[data-action=apply-rebalance]').waitFor({timeout: 10000});
      await page.locator('[data-action=apply-rebalance]').click();
      await page.locator(w < 700 ? '#modal .rebalance-stack' : '#modal .rebalance-table').first().waitFor({timeout: 8000});
      await waitModalSettled(page);
      await page.getByText('precio demorado', {exact: false}).first().waitFor();
      await page.screenshot({path: `${out}/app-rebalance-modal-${w}.png`, fullPage: false});

      await page.goto(base + '/app#/settings');
      await page.waitForSelector('#openai-settings');
      await page.screenshot({path: `${out}/app-settings-${w}.png`, fullPage: true});
    });

    const dir = mkdtempSync(join(tmpdir(), 'laviste-site-shot-'));
    const app = createApp({dataDir: dir, password, apiKey: 'x', port: 0, seed: true, host: '127.0.0.1', quotesLive: true, quotesFixture: true});
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const page = await browser.newPage({viewport: {width: w, height: 900}});
    try {
      await page.goto(base + '/');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path: `${out}/marketing-home-${w}.png`, fullPage: true});
      await page.goto(base + '/acerca');
      await page.waitForSelector('.sim-compare');
      await page.screenshot({path: `${out}/marketing-acerca-session-0-${w}.png`, fullPage: true});
      await login(page, base);
      await page.goto(base + '/acerca');
      await page.waitForSelector('.sim-compare');
      await page.screenshot({path: `${out}/marketing-acerca-session-1-${w}.png`, fullPage: true});
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
