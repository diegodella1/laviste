import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const dir = mkdtempSync(join(tmpdir(), 'laviste-site-'));
const app = createApp({dataDir:dir, password:'site-test-password', apiKey:'', host:'127.0.0.1', port:0, origin:'', secure:false});
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + app.server.address().port;
const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_USE_BUNDLED ? {} : {executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium'}), args:['--no-sandbox', '--disable-gpu']});
mkdirSync('work', {recursive:true});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  const failures = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {if(response.status() >= 400) failures.push(response.url());});
  if (process.env.GENERATE_SOCIAL) {
    await page.setViewportSize({width:1200, height:630});
    await page.goto(base);
    await page.setContent(`<html><head><link rel="stylesheet" href="${base}/brand.css"><style>*{box-sizing:border-box}body{margin:0;background:#f3f0e8;color:#24251f;padding:60px 70px;font-family:'DM Sans'}header{display:flex;justify-content:space-between;align-items:center;font-size:20px}b{font:800 38px Syne}h1{font:800 85px/1.03 Syne;letter-spacing:-5px;margin:55px 0 35px}em{font-style:normal;color:#c64225}p{font-size:23px}svg{position:absolute;right:65px;bottom:70px;width:180px}</style></head><body><header><b>la viste.</b><span>Ideas de inversión, bajo observación</span></header><h1>La intuición<br>es el principio.<br><em>No la prueba.</em></h1><p>Tu criterio. Tu espacio. Dinero de práctica.</p><svg viewBox="0 0 64 40"><path d="M2 20C16-3 48-3 62 20 48 43 16 43 2 20Z" fill="none" stroke="#c64225" stroke-width="3"/><circle cx="32" cy="20" r="9" fill="#c64225"/></svg></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path:'public/social-card.png', fullPage:true});
  }
  for (const width of (process.env.SITE_WIDTHS ? process.env.SITE_WIDTHS.split(',').map(Number) : [1440, 390, 360])) {
    await page.setViewportSize({width, height:1000});
    for (const [path, name] of [['/', 'home'], ['/como-funciona', 'how'], ['/acerca', 'about'], ['/privacidad', 'privacy'], ['/alcance', 'scope']]) {
      const response = await page.goto(base + path);
      assert.equal(response.status(), 200);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('h1').count(), 1);
      const overflowing = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => el.className || el.tagName));
      if (overflowing.length) await page.screenshot({path:`work/site-overflow-${width}.png`, fullPage:true});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${path} overflow at ${width}: ${overflowing.join(', ')}`);
      if (path === '/') {
        await page.locator('summary').first().click();
        await page.locator('details[open]').waitFor();
        await page.locator('summary').first().click();
        if (width < 760) {
          await page.locator('.menu-toggle').click();
          assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
        }
      }
      if (path === '/como-funciona') {
        await page.locator('[data-example=evidence]').click();
        assert.equal(await page.locator('#example-title').textContent(), 'Una pregunta concreta.');
        await page.locator('[data-example=change]').click();
        assert.equal(await page.locator('#example-title').textContent(), 'Cambiar de opinión también cuenta.');
      }
      await page.screenshot({path:`work/site-${name}-${width}.png`, fullPage:true});
    }
    await page.goto(base + '/app');
    await page.locator('#login').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `login overflow at ${width}`);
    await page.screenshot({path:`work/site-login-${width}.png`, fullPage:true});
    console.log(`Public site OK: ${width}px, five pages, navigation, FAQ, interactive example, private login`);
  }
  await page.goto(base + '/#/settings');
  await page.waitForURL(base + '/app#/settings');
  await page.locator('#login').waitFor();
  // Every public internal link must resolve without an account.
  const destinations = new Set();
  for(const path of ['/', '/como-funciona', '/acerca', '/privacidad', '/alcance']) {
    await page.goto(base + path);
    for(const href of await page.locator('a[href^="/"]').evaluateAll(items => items.map(item => item.getAttribute('href').split('#')[0]))) destinations.add(href);
  }
  for(const path of destinations) assert.equal((await fetch(base + path)).status, 200, path);
  assert.equal((await fetch(base + '/api/state')).status, 401);
  assert.equal((await fetch(base + '/social-card.png')).status, 200);
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  await page.close();
} finally {
  await browser.close();
  await app.close();
  rmSync(dir, {recursive:true, force:true});
}
