import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const dir = mkdtempSync(join(tmpdir(), 'laviste-site-'));
const app = createApp({dataDir:dir, password:'site-test-password', apiKey:'', host:'127.0.0.1', port:0, origin:'', secure:false, quotesLive:false, quotesFixture:true});
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
    await page.setContent(`<html><head><link rel="stylesheet" href="${base}/brand.css"><style>*{box-sizing:border-box}body{margin:0;background:#080f12;color:#e5eeea;padding:55px 65px;font-family:'DM Sans';background-image:linear-gradient(#152429 1px,transparent 1px),linear-gradient(90deg,#152429 1px,transparent 1px);background-size:40px 40px}header{display:flex;justify-content:space-between;align-items:center;font:14px 'IBM Plex Mono';color:#9db1ad}b{font:700 34px 'Space Grotesk';color:#e5eeea}h1{font:700 80px/1.06 'Space Grotesk';letter-spacing:-4px;margin:65px 0 35px}em{font-style:normal;color:#bcf77b}p{font:15px 'IBM Plex Mono';color:#9db1ad}.symbol{position:absolute;right:85px;top:210px;width:240px;height:240px;border:1px solid #2a3d40;border-radius:50%;display:grid;place-items:center;box-shadow:0 0 0 30px #101c20}img{width:100px;height:100px}</style></head><body><header><b>la viste.</b><span>OBSERVATORIO DE IDEAS / LV</span></header><h1>La intuición<br>es el principio.<br><em>No la prueba._</em></h1><p>Explorá · Simulá · Seguí la evidencia</p><div class="symbol"><img src="${base}/favicon.svg" alt=""></div></body></html>`);
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
      if (path === '/acerca') {
        assert.equal(await page.locator('.sim-compare').count(), 1);
        assert.equal(await page.locator('.about-steps .step').count(), 3);
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
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(base);
  assert.equal(await page.locator('.orbit-sweep').evaluate(el => getComputedStyle(el).animationName), 'none');
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
  const bannedPublic = ['OpenAI requerido', 'clave de OpenAI en Configuración'];
  for (const path of ['/', '/preguntas', '/como-funciona', '/acerca', '/privacidad', '/alcance']) {
    const html = await (await fetch(base + path)).text();
    for (const phrase of bannedPublic) {
      assert.ok(!html.includes(phrase), `${path} must not contain «${phrase}»`);
    }
  }
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
