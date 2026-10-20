import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {templates, createTake, activate} from '../lib/engine.mjs';
import {
  TD_LOADING, TD_LOAD_ERROR_TITLE, TD_RETRY, TD_GO_TAKES,
  TD_NOT_FOUND_TITLE, TD_NEW_WHY, TD_ARCHIVED_BANNER, TD_ARCHIVED_ASK,
  TD_INDEX_NOT_YET, TD_INDEX_PENDING, P1_CHART_NO_HISTORY,
  TD_SEC_INDEX, TD_SEC_MANAGE,
} from '../public/copy.mjs';

const password = 'browser-test-password';
const ownerEmail = 'diego@diegodella.ar';
const out = '/opt/cursor/artifacts/screenshots';
mkdirSync(out, {recursive: true});
mkdirSync('work', {recursive: true});

async function submitLogin(page) {
  await page.locator('#login [name="email"]').fill(ownerEmail);
  await page.locator('#login [name="password"]').fill(password);
  await page.locator('#login button[type="submit"]').click();
}

function seedApp() {
  const dir = mkdtempSync(join(tmpdir(), 'laviste-td3-'));
  const key = join(dir, 'master.key');
  writeFileSync(key, '12'.repeat(32));
  const app = createApp({
    dataDir: dir, password, masterKeyPath: key, apiKey: '', port: 0, host: '127.0.0.1',
    secure: false, origin: '', quotesLive: false, quotesFixture: true,
    env: {FEATURE_AUTO_SIM: '1'}, autoStartTimer: false,
  });
  const ownerId = app.store.ownerUserId();
  app.store.setSetting('autoTrading', {enabled: true, allowUserIds: [ownerId]});
  const take = createTake(templates[0]);
  activate(take, 1_024_000);
  take.monitoringPaused = false;
  take.nextCheckAt = new Date(Date.now() + 3600_000).toISOString();
  const scoped = app.store.forUser(ownerId);
  scoped.putTake(take);
  return {dir, app, take, scoped};
}

async function shot(page, name) {
  await page.screenshot({path: join('work', name), fullPage: false});
  await page.screenshot({path: join(out, name), fullPage: false});
}

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + app.server.address().port;
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_USE_BUNDLED ? {} : {executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'}),
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  const {dir, app, take, scoped} = seedApp();
  const base = await listen(app);
  const short = take.benchmarkId === 'MERV' ? 'Merval' : 'CEDEAR SPY';
  try {
    for (const width of [1280, 390]) {
      const live = scoped.take(take.id);
      live.phase = 'active';
      live.monitoringPaused = false;
      live.history = [live.history[0] || {at: live.activatedAt, value: live.invested, benchmark: live.invested}];
      live.nextCheckAt = new Date(Date.now() + 3600_000).toISOString();
      live.version = (Number(live.version) || 1) + 1;
      scoped.putTake(live);
      const page = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 1000}});
      page.setDefaultTimeout(20000);
      try {
        await page.route('**/api/state', async (route, request) => {
          if (request.method() === 'GET') await new Promise(r => setTimeout(r, 2000));
          await route.continue();
        });
        await page.goto(base + '/app#/tesis/' + take.id);
        await page.locator('#login').waitFor();
        await submitLogin(page);
        await page.locator('.take-loading[aria-busy="true"]').waitFor();
        const loadingText = await page.locator('.main').innerText();
        assert.ok(!loadingText.includes(TD_NOT_FOUND_TITLE), 'TD-23 never not-found while loading');
        assert.equal(await page.locator('.chat-dock').count(), 0);
        assert.equal((await page.locator('.take-loading [role="status"]').innerText()).trim(), TD_LOADING);
        await shot(page, `td3-loading-${width}.png`);
        await page.locator('.take-header h1').waitFor();
        await page.unroute('**/api/state');
        const headerHtml = await page.locator('.take-header').innerHTML().catch(() => 'NO HEADER');
        if (!await page.locator('.why').count()) {
          throw new Error('missing .why after load. header=' + headerHtml.slice(0, 1200));
        }

        assert.ok((await page.locator('.why').innerText()).includes(TD_NEW_WHY));
        const emptyChart = await page.locator('.take-chart .empty, .take-positions-chart .empty').first().innerText();
        assert.ok(emptyChart.includes(P1_CHART_NO_HISTORY));
        const zero = await page.locator('.take-chart-stats .stat-big.muted').innerText();
        assert.match(zero.replace(/\s/g, ''), /0,0%/);
        const idxBtn = page.locator('.chart-cmp [data-action="compare-index"]');
        assert.equal(await idxBtn.getAttribute('aria-disabled'), 'true');
        await idxBtn.click({force: true});
        await page.waitForFunction(expected => {
          const t = document.getElementById('toast');
          return t && t.style.display !== 'none' && (t.textContent || '').includes(expected);
        }, TD_INDEX_NOT_YET(short).slice(0, 20));
        assert.ok((await page.locator('.chip-soft').innerText()).includes(TD_INDEX_PENDING(short).slice(0, 10)));
        await shot(page, `td3-nueva-${width}.png`);
        await page.evaluate(() => {
          const t = document.getElementById('toast');
          if (t) t.style.display = 'none';
        });

        await page.evaluate(() => { location.hash = '#/tesis/no-existe-td3'; });
        await page.locator('.take-not-found h1').waitFor();
        const nf = await page.locator('.take-not-found').innerText();
        assert.ok(nf.includes(TD_NOT_FOUND_TITLE));
        assert.ok(nf.includes(TD_GO_TAKES));
        await shot(page, `td3-not-found-${width}.png`);

        const archived = scoped.take(take.id);
        archived.phase = 'archived';
        archived.monitoringPaused = true;
        archived.version = (Number(archived.version) || 1) + 1;
        scoped.putTake(archived);
        await page.evaluate(id => { location.hash = '#/tesis/' + id; }, take.id);
        await page.waitForFunction(() => document.querySelector('.take-archived-banner'));
        assert.ok((await page.locator('.take-archived-banner').innerText()).includes(TD_ARCHIVED_BANNER));
        assert.equal(await page.locator('.take-header-status').count(), 0);
        assert.equal(await page.locator('[data-action="review"]').count(), 0);
        assert.equal(await page.locator('#take-ask input').getAttribute('placeholder'), TD_ARCHIVED_ASK);
        assert.equal(await page.locator('#take-ask input').isDisabled(), true);
        await shot(page, `td3-archivada-${width}.png`);

        await page.evaluate(id => { location.hash = '#/tesis/' + id + '/ajustes'; }, take.id);
        await page.locator('.ajustes-page').waitFor();
        const aj = await page.locator('.ajustes-page').innerText();
        assert.ok(aj.includes(TD_SEC_INDEX));
        assert.ok(aj.includes(TD_SEC_MANAGE));
        assert.equal(await page.locator('#seguimiento').count(), 0);
        assert.equal(await page.locator('#reglas').count(), 0);
        await shot(page, `td3-archivada-ajustes-${width}.png`);
      } finally {
        await page.close();
      }
    }

    for (const width of [1280, 390]) {
      const page = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 1000}});
      page.setDefaultTimeout(20000);
      try {
        await page.route('**/api/state', route => route.abort());
        await page.goto(base + '/app#/tesis/' + take.id);
        await page.locator('#login').waitFor();
        await submitLogin(page);
        await page.locator('.take-load-error [role="alert"]').waitFor();
        const err = await page.locator('.take-load-error').innerText();
        assert.ok(err.includes(TD_LOAD_ERROR_TITLE));
        assert.ok(err.includes(TD_RETRY));
        assert.ok(err.includes(TD_GO_TAKES));
        const primaries = await page.evaluate(() =>
          [...document.querySelectorAll('.main .btn.primary')].map(el => el.textContent.trim())
        );
        assert.deepEqual(primaries, [TD_RETRY]);
        await shot(page, `td3-error-${width}.png`);
      } finally {
        await page.close();
      }
    }
    console.log('TD3 screenshots saved to', out);
  } finally {
    if (app.server.listening) await app.close();
    else app.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
} finally {
  await browser.close();
}
