import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const out = '/opt/cursor/artifacts/screenshots';
mkdirSync(out, {recursive: true});
const password = 'hotfix-shot-pass';
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

async function withApp(browser, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'laviste-hotfix-shot-'));
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
  const page = await browser.newPage();
  try {
    await fn(page, base, app);
  } finally {
    await page.close();
    await app.close();
    rmSync(dir, {recursive: true, force: true});
  }
}

function cedearTake(app) {
  return app.store.takes().find(t => t.phase === 'active' && /cobertura|CEDEAR/i.test(t.title));
}

async function waitDockMeasured(page) {
  await page.waitForSelector('.chat-dock');
  await page.evaluate(() => {
    const dock = document.querySelector('.chat-dock');
    const gap = 28;
    document.documentElement.style.setProperty('--lv-chat-dock', `${Math.ceil(dock.getBoundingClientRect().height + gap)}px`);
  });
}

async function assertClearance(page, mode = 'news') {
  const ok = await page.evaluate(mode => {
    const dock = document.querySelector('.chat-dock');
    if (!dock) return false;
    const dr = dock.getBoundingClientRect();
    if (mode === 'positions') {
      const row = document.querySelector('.cash-row') || document.querySelector('.position-list-cash');
      return !!row && row.getBoundingClientRect().bottom <= dr.top - 4;
    }
    const spacer = document.querySelector('.take-dock-spacer');
    const last = document.querySelector('.timeline .disclosure-row:last-child');
    if (!spacer || !last) return false;
    return (
      last.getBoundingClientRect().bottom <= dr.top - 4 &&
      spacer.getBoundingClientRect().bottom <= dr.top - 2
    );
  }, mode);
  if (!ok) throw new Error('content still clipped by chat dock');
}

const browser = await chromium.launch(launchOpts);
try {
  for (const w of [1440, 390]) {
    await withApp(browser, async (page, base, app) => {
      await page.setViewportSize({width: w, height: 900});
      await login(page, base);
      const take = cedearTake(app);
      if (!take) throw new Error('missing CEDEAR seed take');

      app.store.transaction(() => {
        const t = app.store.takes().find(x => x.id === take.id);
        const lead = t.holdings[0];
        lead.units = Math.max(lead.units * 4, lead.units + 50);
        app.store.putTake(t);
      });

      await page.goto(`${base}/app#/take/${take.id}/news`);
      await page.waitForSelector('.chat-dock-take');
      await page.waitForSelector('#take-ask input[placeholder*="Consulta"]');
      await waitDockMeasured(page);
      await page.screenshot({path: `${out}/thesis-novedades-${w}-mid-hotfix.png`});

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(200);
      await assertClearance(page);
      await page.screenshot({path: `${out}/thesis-novedades-${w}-bottom-hotfix.png`});

      await page.goto(`${base}/app#/take/${take.id}/positions`);
      await page.waitForSelector(w < 700 ? '.position-list-cash' : '.cash-row');
      await waitDockMeasured(page);
      await page.evaluate(() => {
        const dock = document.querySelector('.chat-dock');
        const row =
          document.querySelector('.cash-row') ||
          document.querySelector('.position-list-cash');
        if (!dock || !row) return;
        row.scrollIntoView({block: 'nearest'});
        const dr = dock.getBoundingClientRect();
        const tr = row.getBoundingClientRect();
        if (tr.bottom > dr.top - 8) window.scrollBy(0, tr.bottom - dr.top + 28);
      });
      await page.waitForTimeout(200);
      await assertClearance(page, 'positions');
      if (w >= 700) {
        await page.screenshot({path: `${out}/thesis-posiciones-1440-efectivo-hotfix.png`});
      }

      await page.locator('.chat-dock-take').screenshot({path: `${out}/thesis-dock-copy-${w}-hotfix.png`});

      const status = await page.locator('.take-header-status').innerText();
      const sobre = await page.locator('.estado.review', {hasText: 'Sobre tope'}).count();
      if (!/Vigilando|Revisar/.test(status)) {
        throw new Error(`expected Vigilando/Revisar status with cap breach, got: ${status}`);
      }
      if (!sobre) throw new Error('expected Sobre tope chip on positions');
      if (w >= 700) {
        await page.screenshot({path: `${out}/thesis-posiciones-1440-status-hotfix.png`, fullPage: false});
      }
    });
  }
} finally {
  await browser.close();
}
console.log('hotfix screenshots written to', out);
