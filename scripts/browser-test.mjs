import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {templates} from '../lib/engine.mjs';
import {PRACTICE_FOOTER} from '../lib/copy.mjs';
import {money} from '../public/format.mjs';
import {inflateSync} from 'node:zlib';

const PAPER_RGB = {r: 0xFF, g: 0xFF, b: 0xFF};

/** Read RGBA from an 8-bit PNG buffer (color types 2 or 6). */
function pngPixelRgb(buf, x, y) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    pos += 4;
    const type = buf.toString('ascii', pos, pos + 4);
    pos += 4;
    const data = buf.subarray(pos, pos + len);
    pos += len + 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  assert.equal(bitDepth, 8, 'PNG bit depth');
  assert.ok(colorType === 2 || colorType === 6, 'PNG color type');
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  let offset = 0;
  const row = new Uint8Array(stride);
  for (let rowY = 0; rowY < height; rowY++) {
    const filter = raw[offset++];
    const scan = raw.subarray(offset, offset + stride);
    offset += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = rowY > 0 ? row[i] : 0;
      const upLeft = rowY > 0 && i >= bpp ? row[i - bpp] : 0;
      let v = scan[i];
      if (filter === 1) v = (v + left) & 0xff;
      else if (filter === 2) v = (v + up) & 0xff;
      else if (filter === 3) v = (v + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) v = (v + paeth(left, up, upLeft)) & 0xff;
      row[i] = v;
    }
    if (rowY === y) {
      const px = x * bpp;
      return {r: row[px], g: row[px + 1], b: row[px + 2]};
    }
  }
  throw new Error('PNG row out of range');
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function rgbDist(a, b) {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

const fakeKey='sk-test-browser-only-never-real';
const password='browser-test-password';
const source={id:1,url:'https://example.com/company-report',title:'Informe corporativo de prueba'};
const fetcher=async(url,options)=>{
  const body=JSON.parse(options.body);
  let output;
  if(body.tools)output=[{type:'web_search_call',action:{sources:[source]}},{type:'message',content:[{type:'output_text',text:'Informe de prueba: cambió la demanda.',annotations:[source]}]}];
  else if(body.text?.format?.name==='thesis_review')output=[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'Hay evidencia para revisar la demanda.',attention:'watch',reason:'Se necesita confirmar adopción.',resolved:false,sourceIds:[1],events:[{title:'Demanda bajo observación',fact:'Un informe de prueba indica menor demanda.',interpretation:'Conviene revisar el supuesto de adopción.',uncertainty:'Es un fixture del test.',affected:'Demanda de hardware',publishedAt:null,sourceIds:[1]}]})}]}];
  else output=[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'Podemos explorar esa idea. Esta cartera usa precios simulados.',proposal:templates[0]})}]}];
  return {ok:true,json:async()=>({status:'completed',output,usage:{input_tokens:25,output_tokens:50}})};
};
const iolFetcher=async url=>({ok:true,json:async()=>url.endsWith('/token')?{access_token:'test-access',refresh_token:'test-refresh',expires_in:900}:url.endsWith('estadocuenta')?{cuentas:[{numero:'test-account',moneda:'peso_Argentino',disponible:1000,saldo:1000},{numero:'test-usd',moneda:'dolar_Estadounidense',disponible:10,saldo:10}]}:url.includes('/Cotizacion')?{ultimoPrecio:100,fechaHora:new Date().toISOString(),moneda:'peso_Argentino'}:{activos:[{titulo:{simbolo:'YPFD',mercado:'bCBA',descripcion:'YPF',moneda:'peso_Argentino'},cantidad:2,ultimoPrecio:100}]}});

mkdirSync('work',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_USE_BUNDLED?{}:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}),args:['--no-sandbox','--disable-gpu']});
try{
  for(const width of [1440,390,360]){
    const dir=mkdtempSync(join(tmpdir(),'laviste-browser-'));const key=join(dir,'master.key');writeFileSync(key,'12'.repeat(32));
    const app=createApp({dataDir:dir,password,masterKeyPath:key,apiKey:'',port:0,host:'127.0.0.1',secure:false,origin:'',fetcher,iolFetcher,quotesLive:false,quotesFixture:true});
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+app.server.address().port;
    const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    async function route(path){await page.goto(base+'/app#/'+path);await page.waitForFunction(()=>document.querySelector('.main'));}
    try{
      await page.route('**/api/state', async (route, request) => {
        if (request.method() === 'GET') await new Promise(r => setTimeout(r, 700));
        await route.continue();
      });
      await page.goto(base+'/app');await page.locator('#login input').fill(password);await page.locator('#login button').click();
      await page.waitForSelector('.home-loading');
      assert.equal(await page.locator('.home-empty').count(), 0, 'empty state must not show while loading');
      await page.waitForFunction(() => !document.querySelector('.home-loading'));
      assert.equal(await page.locator('.home-loading').count(), 0);
      await page.waitForSelector('.home-empty');
      await page.getByRole('link', {name: 'Nueva tesis'}).waitFor();
      await page.unroute('**/api/state');
      await page.getByText(PRACTICE_FOOTER, {exact: true}).waitFor();
      await route('settings');await page.locator('#openai-settings').waitFor();
      await page.locator('#openai-settings [name=apiKey]').fill(fakeKey);
      await page.locator('#openai-settings button[type=submit]').click();
      await page.waitForSelector('[data-action="test-openai"]:not([disabled])', {timeout: 10000});
      await page.locator('[data-action=test-openai][data-value=chat]').click();await page.getByText('Conversación: Verificado',{exact:false}).waitFor();
      await page.locator('[data-action=test-openai][data-value=news]').click();await page.getByText('Búsqueda: Verificado',{exact:false}).waitFor();
      await page.screenshot({path:`work/settings-${width}.png`,fullPage:true});
      await route('new');await page.locator('#new-prompt').fill('Creo que Vaca Muerta puede sostener la producción argentina en los próximos años.');await page.locator('#new-chat button[type=submit]').click();
      await page.locator('[data-action=activate-practice]').waitFor();await page.getByText(PRACTICE_FOOTER, {exact: true}).waitFor();
      await page.locator('[data-action=activate-practice]').click();await page.locator('#activate-form button[type=submit]').click();await page.locator('[data-action=review]').waitFor();
      await app.scheduler.tick();
      const take=app.store.takes()[0];
      async function hashNav(path, label) {
        await page.evaluate(p => { location.hash = '#/' + String(p).replace(/^\//, ''); }, path);
        await page.waitForFunction(() => document.querySelector('.main'));
        await page.waitForTimeout(150);
      }
      // HN1: fresh state after scheduler without full reload
      await hashNav('', 'HN1a');
      await hashNav('take/' + take.id + '/news', 'HN1b');
      await page.locator('.timeline .disclosure-btn, .timeline-item').first().waitFor({timeout: 5000});
      // HN2: server mutation visible after hash navigation
      app.store.transaction(() => {
        const latest = app.store.take(take.id);
        latest.title = 'HN2 título actualizado';
        app.store.putTake(latest);
      });
      await hashNav('');
      await hashNav('take/' + take.id + '/news', 'HN2');
      await page.getByRole('heading', {name: 'HN2 título actualizado'}).waitFor();
      // HN3–HN5: tab deep links
      for (const tab of ['positions', 'idea', 'settings']) {
        await hashNav('take/' + take.id + '/' + tab, 'HN3-5-' + tab);
        await page.waitForSelector(`[role=tab][aria-selected=true][data-value="${tab}"]`);
      }
      // HN6: mis tesis
      await hashNav('takes', 'HN6');
      await page.waitForSelector('.thesis-list');
      // HN7: nueva tesis
      await hashNav('new', 'HN7');
      await page.locator('#new-prompt').waitFor();
      // HN8: configuración
      await hashNav('settings', 'HN8');
      await page.locator('#openai-settings').waitFor();
      // HN9: conversaciones + back to take news
      await hashNav('chats', 'HN9a');
      await page.waitForSelector('.page-heading h1');
      await hashNav('take/' + take.id + '/news', 'HN9b');
      await page.locator('.timeline .disclosure-btn, .timeline-item').first().waitFor({timeout: 5000});
      assert.equal(await page.locator('a.source-link').first().getAttribute('href'),source.url);
      const before=JSON.stringify(app.store.take(take.id));
      await page.locator('[data-action=scenario]').click();await page.locator('[data-action=apply-scenario][data-value=broken]').click();await page.getByText('Vista aislada · no guardada').waitFor();assert.equal(JSON.stringify(app.store.take(take.id)),before);await page.locator('[data-action=close]').click();
      await page.locator('[data-action=tab][data-value=idea]').click();await page.locator('[data-action=edit-idea]').click();await page.locator('#idea-form [name=thesis]').fill('Nueva hipótesis: la demanda local crece más lentamente y requiere evidencia adicional.');await page.locator('#idea-form button').click();
      await page.locator('[data-action=versions]').click();await page.getByText('Versión 2',{exact:false}).waitFor();await page.locator('[data-action=close]').click();
      await page.locator('[data-action=tab][data-value=settings]').click();await page.locator('[name=monitoringPaused]').check();await page.locator('#take-settings button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('[name=monitoringPaused]')?.checked);
      await route('take/'+take.id+'/news');await page.screenshot({path:`work/thesis-${width}.png`,fullPage:true});
      if (width <= 390) {
        await hashNav('take/' + take.id + '/positions');
        await page.waitForSelector('.positions-mobile .position-list');
        const topH = await page.locator('.topbar').evaluate(el => el.getBoundingClientRect().height);
        assert.ok(topH <= 56, `thesis topbar should stay one row at ${width}px, got ${topH}`);
      }
      if (width === 1440) {
        const rebDir = mkdtempSync(join(tmpdir(), 'laviste-modal-scroll-'));
        const rebApp = createApp({dataDir: rebDir, password, masterKeyPath: key, apiKey: '', port: 0, host: '127.0.0.1', secure: false, origin: '', fetcher, iolFetcher, seed: true, quotesLive: true, quotesFixture: true});
        await new Promise(resolve => rebApp.server.listen(0, '127.0.0.1', resolve));
        const rebBase = 'http://127.0.0.1:' + rebApp.server.address().port;
        try {
          await page.goto(rebBase + '/app');
          await page.locator('#login input').fill(password);
          await page.locator('#login button').click();
          await page.waitForSelector('.main');
          const rebTake = rebApp.store.takes().find(t => t.title.includes('Banco') || t.title.includes('crédito'));
          assert.ok(rebTake, 'seeded Bancos take');
          await page.goto(rebBase + `/app#/take/${rebTake.id}/news`);
          await page.locator('[data-action=apply-rebalance]').waitFor({timeout: 10000});
          await page.evaluate(() => window.scrollTo(0, Math.max(document.body.scrollHeight - innerHeight, 400)));
          const scrollBefore = await page.evaluate(() => window.scrollY);
          assert.ok(scrollBefore > 0, 'page should be scrolled before opening modal');
          await page.locator('[data-action=apply-rebalance]').click();
          await page.waitForSelector('#modal[open]');
          const scrollOpen = await page.evaluate(() => window.scrollY);
          assert.equal(scrollOpen, scrollBefore, 'opening modal must not change scroll position');
          await page.waitForFunction(() => {
            const d = document.getElementById('modal');
            return d?.open && Number(getComputedStyle(d).opacity) >= 0.99;
          });
          await page.waitForTimeout(350);
          assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
          const shot = await page.screenshot({type: 'png'});
          const imgW = shot.readUInt32BE(16);
          const imgH = shot.readUInt32BE(20);
          const layout = await page.evaluate(() => {
            const modal = document.getElementById('modal');
            const r = modal.getBoundingClientRect();
            return {innerWidth: window.innerWidth, dimX: Math.max(280, Math.floor(r.left - 48))};
          });
          const scale = imgW / layout.innerWidth;
          const midY = Math.floor(imgH / 2);
          const edgePx = pngPixelRgb(shot, imgW - 4, midY);
          const dimPx = pngPixelRgb(shot, Math.floor(layout.dimX * scale), midY);
          assert.ok(rgbDist(edgePx, PAPER_RGB) > 12, `gutter strip must be dimmed, got rgb(${edgePx.r},${edgePx.g},${edgePx.b})`);
          assert.ok(rgbDist(dimPx, PAPER_RGB) > 12, `page under scrim must be dimmed, got rgb(${dimPx.r},${dimPx.g},${dimPx.b})`);
          assert.ok(rgbDist(edgePx, dimPx) <= 28, `gutter and scrim tones should match, edge=${JSON.stringify(edgePx)} dim=${JSON.stringify(dimPx)}`);
          await page.locator('[data-action=close]').click();
          await page.waitForFunction(() => !document.getElementById('modal')?.open);
          const scrollAfter = await page.evaluate(() => window.scrollY);
          assert.equal(scrollAfter, scrollBefore, 'closing modal must restore scroll position');
          const chartDir = mkdtempSync(join(tmpdir(), 'laviste-chart-single-'));
          const chartApp = createApp({dataDir: chartDir, password, masterKeyPath: key, apiKey: '', port: 0, host: '127.0.0.1', secure: false, origin: '', fetcher, iolFetcher, seed: true, quotesLive: true, quotesFixture: true});
          await new Promise(resolve => chartApp.server.listen(0, '127.0.0.1', resolve));
          const chartBase = 'http://127.0.0.1:' + chartApp.server.address().port;
          try {
            let activeId;
            let activeInvested;
            chartApp.store.transaction(() => {
              const all = chartApp.store.takes();
              const keep = all.find(t => t.title.includes('Banco') || t.title.includes('crédito')) || all[0];
              keep.history = [keep.history[0]];
              activeId = keep.id;
              activeInvested = keep.invested;
              chartApp.store.putTake(keep);
              for (const t of all) {
                if (t.id === keep.id) continue;
                t.phase = 'draft';
                t.invested = 0;
                t.history = [];
                chartApp.store.putTake(t);
              }
            });
            await page.goto(chartBase + '/app');
            await page.locator('#login input').fill(password);
            await page.locator('#login button').click();
            await page.waitForSelector('.home-chart');
            const homeCopy = await page.locator('.home-chart .empty.small').innerText();
            assert.ok(homeCopy.includes(money(activeInvested)), 'home single-point copy uses aggregate practice capital');
            assert.ok(!homeCopy.includes(money(100)), 'home single-point copy must not show index base');
            assert.ok(homeCopy.includes(' · precio demorado'), 'quote meta joins with middle dots');
            assert.ok(!homeCopy.includes('. precio'), 'no lowercase sentence break before meta');
            await page.goto(chartBase + `/app#/take/${activeId}/positions`);
            await page.waitForSelector('.take-positions-chart .empty.small');
            const thesisCopy = await page.locator('.take-positions-chart .empty.small').innerText();
            assert.ok(thesisCopy.includes(money(activeInvested)), 'thesis single-point copy uses thesis capital');
            assert.ok(!thesisCopy.includes(money(100)), 'thesis single-point copy must not show index base');
          } finally {
            await chartApp.close();
            rmSync(chartDir, {recursive: true, force: true});
          }
          const homeSeedDir = mkdtempSync(join(tmpdir(), 'laviste-home-chart-'));
          const homeApp = createApp({dataDir: homeSeedDir, password, masterKeyPath: key, apiKey: 'x', port: 0, host: '127.0.0.1', secure: false, origin: '', fetcher, iolFetcher, seed: true, quotesLive: true, quotesFixture: true});
          await new Promise(resolve => homeApp.server.listen(0, '127.0.0.1', resolve));
          const homeBase = 'http://127.0.0.1:' + homeApp.server.address().port;
          try {
            await page.goto(homeBase + '/app');
            await page.locator('#login input').fill(password);
            await page.locator('#login button').click();
            await page.waitForSelector('.hero-n');
            await page.waitForFunction(() => {
              const host = document.querySelector('.home-chart .chart-host[data-ready="1"]');
              return host?.dataset.lastValue && host.querySelector('svg polyline');
            }, {timeout: 10000});
            const lines = await page.locator('.home-chart .chart-host svg polyline').count();
            assert.ok(lines >= 1, 'seeded home chart must draw at least one series line');
            const lastVal = await page.locator('.home-chart .chart-host').getAttribute('data-last-value');
            const heroText = await page.locator('.hero-n .big-number').innerText();
            const heroNum = Number(heroText.replace(/[^\d]/g, ''));
            assert.ok(lastVal && heroNum, 'hero and chart host should expose values');
            assert.equal(Number(lastVal), heroNum, 'last chart point must match hero total');
            const yTicks = await page.locator('.home-chart .chart-host').getAttribute('data-y-ticks');
            const uniqTicks = new Set((yTicks || '').split('|').filter(Boolean));
            assert.ok(uniqTicks.size >= 3, 'home chart y-axis labels must differ');
          } finally {
            await homeApp.close();
            rmSync(homeSeedDir, {recursive: true, force: true});
          }
          await page.goto(base + '/app');
          await page.locator('#login input').fill(password);
          await page.locator('#login button').click();
          await page.waitForSelector('.main');
          await route('take/' + take.id + '/news');
        } finally {
          await rebApp.close();
          rmSync(rebDir, {recursive: true, force: true});
        }
      }
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`horizontal overflow at ${width}`);
      if (width <= 390) {
        await hashNav('take/' + take.id + '/positions');
        await page.waitForSelector('.positions-mobile .position-list');
        const overflowPos = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflowPos, false, `positions must not overflow at ${width}`);
      }
      await route('settings');await page.getByText('precios demorados de mercado',{exact:false}).waitFor();
      await page.locator('#iol-settings').count().then(n=>assert.equal(n,0));
      const exported=await page.evaluate(async()=>await (await fetch('/api/export')).text());assert.ok(!exported.includes(fakeKey));assert.ok(!exported.includes('test-refresh'));
      await page.locator('[data-action=remove-openai]').click();await page.getByText('Configuración pendiente',{exact:true}).waitFor();
      assert.equal(errors.length,0,errors.join('\n'));console.log(`Browser OK: ${width}px, chat, sources, practice, versions, quotes, secrets`);
    }catch(error){await page.screenshot({path:`work/failure-${width}.png`,fullPage:true}).catch(()=>{});console.error('BROWSER FAILURE',width,page.url(),error.message);throw error;}finally{await page.close();await app.close();rmSync(dir,{recursive:true,force:true});}
  }
}finally{await browser.close();}
