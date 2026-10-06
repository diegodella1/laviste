import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const out = '/opt/cursor/artifacts/screenshots';
mkdirSync(out, {recursive: true});
const password = 'hotfix2-shot-pass';
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
  const dir = mkdtempSync(join(tmpdir(), 'laviste-hotfix2-'));
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

function boostCapBreach(app, take) {
  app.store.transaction(() => {
    const t = app.store.takes().find(x => x.id === take.id);
    const lead = t.holdings[0];
    lead.units = Math.max(lead.units * 4, lead.units + 50);
    app.store.putTake(t);
  });
}

async function measureDock(page) {
  await page.waitForSelector('.chat-dock');
  await page.evaluate(() => {
    const dock = document.querySelector('.chat-dock');
    const gap = 36;
    document.documentElement.style.setProperty('--lv-chat-dock', `${Math.ceil(dock.getBoundingClientRect().height + gap)}px`);
  });
}

async function scrollLastRowClear(page) {
  await page.evaluate(() => {
    const dock = document.querySelector('.chat-dock');
    const row =
      document.querySelector('.positions-table tbody tr:last-child') ||
      document.querySelector('.position-list .position-list-row:last-child');
    if (!dock || !row) return;
    row.scrollIntoView({block: 'nearest'});
    const dr = dock.getBoundingClientRect();
    const tr = row.getBoundingClientRect();
    if (tr.bottom > dr.top - 8) window.scrollBy(0, tr.bottom - dr.top + 32);
  });
  await page.waitForTimeout(200);
}

async function assertLastRowClear(page) {
  const ok = await page.evaluate(() => {
    const dock = document.querySelector('.chat-dock');
    const row =
      document.querySelector('.positions-table tbody tr:last-child') ||
      document.querySelector('.position-list .position-list-row:last-child');
    if (!dock || !row) return false;
    return row.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top - 4;
  });
  if (!ok) throw new Error('last positions row still clipped by dock');
}

async function assertRevisarChrome(page) {
  const status = await page.locator('.take-header-status').innerText();
  if (!/Revisar/.test(status) || /En camino/.test(status)) {
    throw new Error(`expected ● Revisar header, got: ${status}`);
  }
  const okVerdict = await page.locator('.verdict.ok:has-text("Sin acción necesaria")').count();
  if (okVerdict) throw new Error('Sin acción necesaria verdict visible on breach');
}

const browser = await chromium.launch(launchOpts);
try {
  for (const w of [1440, 390]) {
    await withApp(browser, async (page, base, app) => {
      await page.setViewportSize({width: w, height: 900});
      const take = cedearTake(app);
      boostCapBreach(app, take);
      await login(page, base);

      await page.goto(`${base}/app#/take/${take.id}/news`);
      await page.waitForSelector('.chat-dock-take');
      await measureDock(page);
      await assertRevisarChrome(page);
      if (w === 1440) {
        await page.screenshot({path: `${out}/thesis-novedades-1440-status-hotfix2.png`});
      }

      await page.goto(`${base}/app#/take/${take.id}/positions`);
      await page.waitForSelector(w < 700 ? '.position-list' : '.positions-table');
      await measureDock(page);
      await assertRevisarChrome(page);
      await scrollLastRowClear(page);
      await assertLastRowClear(page);
      await page.screenshot({path: `${out}/thesis-posiciones-${w}-bottom-hotfix2.png`});
      if (w === 1440) {
        await page.screenshot({path: `${out}/thesis-posiciones-1440-status-hotfix2.png`});
        await page.locator('.chat-dock-take').screenshot({path: `${out}/thesis-dock-copy-1440-hotfix2.png`});
      }
    });
  }
} finally {
  await browser.close();
}
console.log('hotfix2 screenshots written to', out);
