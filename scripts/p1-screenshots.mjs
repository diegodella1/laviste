import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const out = '/opt/cursor/artifacts/screenshots';
mkdirSync(out, {recursive: true});
const password = 'p1-screenshot-pass';

async function captureApp(browser, {seed, tag, w}) {
  const dir = mkdtempSync(join(tmpdir(), 'laviste-p1-shot-'));
  const app = createApp({dataDir: dir, password, apiKey: 'x', port: 0, seed, host: '127.0.0.1'});
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const page = await browser.newPage({viewport: {width: w, height: 1400}});
  try {
    await page.goto(base + '/app');
    await page.locator('#login input').fill(password);
    await page.locator('#login button').click();
    await page.waitForSelector('.main');
    const prefix = seed ? 'home-seeded' : 'home-empty';
    await page.goto(base + '/app#/');
    await page.waitForSelector(seed ? '.hero-n' : '.home-empty');
    await page.screenshot({path: `${out}/${prefix}-${tag}-${w}.png`, fullPage: true});
    if (!seed) return;
    const rebalanceTake = app.store.takes().find(t => t.title.includes('Energía'));
    const newsTake = app.store.takes().find(t => t.title.includes('IA'));
    await page.goto(base + `/app#/take/${rebalanceTake.id}/positions`);
    await page.locator('[data-action=disclose]').first().click();
    await page.screenshot({path: `${out}/pos-porque-${tag}-${w}.png`, fullPage: true});
    await page.goto(base + `/app#/take/${newsTake.id}/news`);
    await page.waitForSelector('.timeline');
    await page.screenshot({path: `${out}/novedades-${tag}-${w}.png`, fullPage: true});
    await page.goto(base + `/app#/take/${rebalanceTake.id}/news`);
    await page.locator('[data-action=apply-rebalance]').click({timeout: 8000});
    await page.locator(w < 700 ? '#modal .rebalance-stack' : '#modal .rebalance-table').first().waitFor({timeout: 8000});
    await page.screenshot({path: `${out}/rebalance-modal-${tag}-${w}.png`, fullPage: true});
    await page.locator('[data-action=close]').click();
    await page.locator('[data-action=review]').click();
    await page.waitForSelector('[data-review-state="countdown"],[data-review-state="waiting"]', {timeout: 5000});
    await page.screenshot({path: `${out}/revisar-states-${tag}-${w}.png`, fullPage: true});
  } finally {
    await page.close();
    await app.close();
    rmSync(dir, {recursive: true, force: true});
  }
}

const browser = await chromium.launch({headless: true, args: ['--no-sandbox']});
try {
  for (const [w, tag] of [[1440, 'desktop'], [390, 'mobile']]) {
    await captureApp(browser, {seed: true, tag, w});
    await captureApp(browser, {seed: false, tag, w});
  }
  for (const [w, tag] of [[1440, 'desktop'], [390, 'mobile']]) {
    const dir = mkdtempSync(join(tmpdir(), 'laviste-about-'));
    const app = createApp({dataDir: dir, password, apiKey: 'x', port: 0, seed: true, host: '127.0.0.1'});
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const page = await browser.newPage({viewport: {width: w, height: 1600}});
    try {
      await page.goto(base + '/app');
      await page.locator('#login input').fill(password);
      await page.locator('#login button').click();
      await page.waitForSelector('.main');
      await page.goto(base + '/acerca');
      await page.waitForSelector('.cmp');
      await page.screenshot({path: `${out}/about-${tag}-${w}.png`, fullPage: true});
    } finally {
      await page.close();
      await app.close();
      rmSync(dir, {recursive: true, force: true});
    }
  }
  console.log('P1 screenshots saved to', out);
} finally {
  await browser.close();
}
