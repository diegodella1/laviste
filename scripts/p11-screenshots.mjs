import {chromium} from '@playwright/test';
import {mkdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const password = 'screenshot-test-pass';
const outDir = '/opt/cursor/artifacts/screenshots';
mkdirSync(outDir, {recursive: true});

const dir = mkdtempSync(join(tmpdir(), 'laviste-p11-'));
const key = join(dir, 'master.key');
writeFileSync(key, '12'.repeat(32));
const app = createApp({dataDir: dir, password, masterKeyPath: key, apiKey: 'sk-test', port: 0, host: '127.0.0.1', secure: false, origin: '', seed: true, quotesLive: false});
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + app.server.address().port;
const take = app.store.takes().find(t => t.phase === 'active') || app.store.takes()[0];

const browser = await chromium.launch({headless: true, args: ['--no-sandbox', '--disable-gpu']});
try {
  const page1440 = await browser.newPage({viewport: {width: 1440, height: 1200}});
  const page390 = await browser.newPage({viewport: {width: 390, height: 1200}});
  for (const page of [page1440, page390]) {
    await page.goto(base + '/app');
    await page.locator('#login input').fill(password);
    await page.locator('#login button').click();
    await page.waitForSelector('.main');
  }
  await page1440.goto(base + `/app#/take/${take.id}/positions`);
  await page390.goto(base + `/app#/take/${take.id}/positions`);
  await page1440.waitForSelector('.position-list');
  await page390.waitForSelector('.position-list');
  await page1440.locator('.take-metrics').getByText('ejemplo', {exact: false}).waitFor();
  await page1440.screenshot({path: join(outDir, 'p11-take-positions-1440.png'), fullPage: true});
  await page390.screenshot({path: join(outDir, 'p11-take-positions-390.png'), fullPage: true});
  await page1440.goto(base + `/app#/take/${take.id}`);
  await page1440.locator('[data-action=benchmark][data-mode=index]').click({timeout: 2000}).catch(() => {});
  await page1440.screenshot({path: join(outDir, 'p11-take-index-chart-1440.png'), fullPage: true});
  await page1440.goto(base + '/app#/settings');
  await page1440.waitForSelector('#openai-settings');
  await page1440.screenshot({path: join(outDir, 'p11-settings-no-iol-1440.png'), fullPage: true});
  await page1440.close();
  await page390.close();
} finally {
  await browser.close();
  await app.close();
  rmSync(dir, {recursive: true, force: true});
}
console.log('P11 screenshots saved to', outDir);
