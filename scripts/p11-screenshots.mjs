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
  for (const width of [1440, 390]) {
    const page = await browser.newPage({viewport: {width, height: 1200}});
    await page.goto(base + '/app');
    await page.locator('#login input').fill(password);
    await page.locator('#login button').click();
    await page.waitForSelector('.main');
    await page.goto(base + `/app#/take/${take.id}/positions`);
    await page.waitForSelector('.position-list');
    await page.getByText('precio demorado', {exact: false}).first().waitFor();
    await page.screenshot({path: join(outDir, `p11-take-positions-${width}.png`), fullPage: true});
    await page.locator('[data-action=benchmark]').click();
    await page.locator('[data-action=benchmark]').click();
    await page.screenshot({path: join(outDir, `p11-take-index-chart-${width}.png`), fullPage: true});
    await page.goto(base + '/app#/settings');
    await page.waitForSelector('#openai-settings');
    await page.screenshot({path: join(outDir, `p11-settings-no-iol-${width}.png`), fullPage: true});
    await page.close();
  }
} finally {
  await browser.close();
  await app.close();
  rmSync(dir, {recursive: true, force: true});
}
console.log('P11 screenshots saved to', outDir);
