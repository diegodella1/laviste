import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const out = '/opt/cursor/artifacts/screenshots';
mkdirSync(out, {recursive: true});
const password = 'p1-screenshot-pass';
const dir = mkdtempSync(join(tmpdir(), 'laviste-p1-shot-'));
const app = createApp({dataDir: dir, password, apiKey: 'x', port: 0, seed: true, host: '127.0.0.1'});
await new Promise(r => app.server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + app.server.address().port;
const browser = await chromium.launch({headless: true, args: ['--no-sandbox']});
try {
  for (const [w, tag] of [[1440, 'desktop'], [390, 'mobile']]) {
    const page = await browser.newPage({viewport: {width: w, height: 1200}});
    await page.goto(base + '/app');
    await page.locator('#login input').fill(password);
    await page.locator('#login button').click();
    await page.waitForSelector('.main');
    await page.goto(base + '/app#/');
    await page.screenshot({path: `${out}/home-seeded-${tag}-${w}.png`, fullPage: true});
    const take = app.store.takes().find(t => t.phase === 'active');
    await page.goto(base + `/app#/take/${take.id}/positions`);
    await page.locator('[data-action=disclose]').first().click();
    await page.screenshot({path: `${out}/pos-porque-${tag}-${w}.png`, fullPage: true});
    await page.goto(base + `/app#/take/${take.id}/news`);
    await page.screenshot({path: `${out}/novedades-${tag}-${w}.png`, fullPage: true});
    await page.locator('[data-action=apply-rebalance]').click({timeout: 3000}).catch(() => {});
    if (await page.locator('#modal').isVisible()) {
      await page.screenshot({path: `${out}/rebalance-modal-${tag}-${w}.png`, fullPage: true});
      await page.locator('[data-action=close]').click();
    }
  }
  const page = await browser.newPage({viewport: {width: 1440, height: 1200}});
  await page.goto(base + '/acerca');
  await page.screenshot({path: `${out}/about-desktop-1440.png`, fullPage: true});
  console.log('P1 screenshots saved to', out);
} finally {
  await browser.close();
  await app.close();
  rmSync(dir, {recursive: true, force: true});
}
