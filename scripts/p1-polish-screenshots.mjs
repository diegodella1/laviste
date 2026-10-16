import {chromium} from '@playwright/test';
import {mkdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const password = 'screenshot-test-pass';
const outDir = '/opt/cursor/artifacts/screenshots';
mkdirSync(outDir, {recursive: true});
const dir = mkdtempSync(join(tmpdir(), 'laviste-p1-'));
const key = join(dir, 'master.key');
writeFileSync(key, '12'.repeat(32));
const app = createApp({
  dataDir: dir, password, masterKeyPath: key, apiKey: 'sk-test',
  port: 0, host: '127.0.0.1', secure: false, origin: '',
  seed: true, quotesLive: true, quotesFixture: true,
});
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + app.server.address().port;
const take = app.store.takes().find(t => t.phase === 'active') || app.store.takes()[0];

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_USE_BUNDLED ? {} : {executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'}),
  args: ['--no-sandbox', '--disable-gpu'],
});

async function shot(width, height, pathHash, file, wait) {
  const page = await browser.newPage({viewport: {width, height}});
  await page.goto(base + '/app');
  await page.locator('#login input').fill(password);
  await page.locator('#login button').click();
  await page.waitForSelector('.main');
  await page.goto(base + '/app#/' + pathHash);
  await page.waitForSelector(wait);
  await page.waitForTimeout(500);
  await page.screenshot({path: join(outDir, file), fullPage: true});
  await page.close();
}

try {
  await shot(1440, 900, `take/${take.id}`, 'p1-resumen-1440.png', '.take-header');
  await shot(390, 844, `take/${take.id}`, 'p1-resumen-390.png', '.take-header');
  await shot(1440, 900, `take/${take.id}/positions`, 'p1-posiciones-panel-1440.png', '.lv-panel[data-panel="positions"]');
  await shot(390, 844, `take/${take.id}/positions`, 'p1-posiciones-sheet-390.png', '.lv-panel[data-panel="positions"]');
  await shot(1440, 900, `take/${take.id}/news`, 'p1-novedades-panel-1440.png', '.lv-panel[data-panel="news"]');
  await shot(880, 900, `take/${take.id}/positions`, 'p1-posiciones-880.png', '.lv-panel[data-panel="positions"]');
  await shot(880, 900, 'admin/fuentes', 'p1-admin-fuentes-880.png', '.main');
  await shot(1440, 900, '', 'p1-home-1440.png', '.hero-n, .home-empty');
} finally {
  await browser.close();
  await app.close();
  rmSync(dir, {recursive: true, force: true});
}
console.log('P1 screenshots saved to', outDir);
