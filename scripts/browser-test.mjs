import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {templates} from '../lib/engine.mjs';

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
    const app=createApp({dataDir:dir,password,masterKeyPath:key,apiKey:'',port:0,host:'127.0.0.1',secure:false,origin:'',fetcher,iolFetcher});
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+app.server.address().port;
    const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    async function route(path){await page.goto(base+'/app#/'+path);await page.waitForFunction(()=>document.querySelector('.main'));}
    try{
      await page.goto(base+'/app');await page.locator('#login input').fill(password);await page.locator('#login button').click();await page.waitForSelector('.main');
      await route('settings');await page.locator('#openai-settings [name=apiKey]').fill(fakeKey);await page.locator('#openai-settings button').click();
      await page.waitForSelector('[data-action="test-openai"]:not([disabled])');
      await page.locator('[data-action=test-openai][data-value=chat]').click();await page.getByText('Conversación: Verificado',{exact:false}).waitFor();
      await page.locator('[data-action=test-openai][data-value=news]').click();await page.getByText('Búsqueda: Verificado',{exact:false}).waitFor();
      await page.screenshot({path:`work/settings-${width}.png`,fullPage:true});
      await route('new');await page.locator('#new-prompt').fill('Quiero una cartera de práctica sobre IA local, horizonte cinco años, tolero caídas y no necesito liquidez.');await page.locator('#new-chat button[type=submit]').click();
      await page.locator('[data-action=save-proposal]').waitFor();await page.locator('[data-action=save-proposal]').click();await page.locator('[data-action=activate]').waitFor();
      await page.locator('[data-action=activate]').click();await page.locator('#activate-form button').click();await page.locator('[data-action=review]').waitFor();
      await app.scheduler.tick();await page.reload();await page.getByText('Hay evidencia para revisar la demanda.',{exact:true}).waitFor();
      assert.equal(await page.locator('a.source-link').first().getAttribute('href'),source.url);
      const take=app.store.takes()[0],before=JSON.stringify(take);
      await page.locator('[data-action=scenario]').click();await page.locator('[data-action=apply-scenario][data-value=broken]').click();await page.getByText('Vista aislada · no guardada').waitFor();assert.equal(JSON.stringify(app.store.take(take.id)),before);await page.locator('[data-action=close]').click();
      await page.locator('[data-action=tab][data-value=idea]').click();await page.locator('[data-action=edit-idea]').click();await page.locator('#idea-form [name=thesis]').fill('Nueva hipótesis: la demanda local crece más lentamente y requiere evidencia adicional.');await page.locator('#idea-form button').click();
      await page.locator('[data-action=versions]').click();await page.getByText('Versión 2',{exact:false}).waitFor();await page.locator('[data-action=close]').click();
      await page.locator('[data-action=tab][data-value=settings]').click();await page.locator('[name=monitoringPaused]').check();await page.locator('#take-settings button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('[name=monitoringPaused]')?.checked);
      await route('take/'+take.id+'/news');await page.screenshot({path:`work/thesis-${width}.png`,fullPage:true});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`horizontal overflow at ${width}`);
      await route('settings');await page.locator('#iol-settings [name=username]').fill('test-user');await page.locator('#iol-settings [name=password]').fill('test-iol-password');await page.locator('#iol-settings button').click();
      await page.locator('[data-action=iol-snapshot]:not([disabled])').waitFor();await page.locator('[data-action=iol-snapshot]').click();await page.getByText('test-account',{exact:true}).waitFor();
      await page.locator('[data-action=iol-quote]').click();await page.getByText('Último precio: 100',{exact:false}).waitFor();await page.locator('[data-action=close]').click();
      const exported=await page.evaluate(async()=>await (await fetch('/api/export')).text());assert.ok(!exported.includes(fakeKey));assert.ok(!exported.includes('test-refresh'));
      await page.locator('[data-action=remove-openai]').click();await page.getByText('Configuración pendiente',{exact:true}).waitFor();
      assert.equal(errors.length,0,errors.join('\n'));console.log(`Browser OK: ${width}px, chat, sources, practice, versions, IOL, secrets`);
    }catch(error){await page.screenshot({path:`work/failure-${width}.png`,fullPage:true}).catch(()=>{});console.error('BROWSER FAILURE',width,page.url(),error.message);throw error;}finally{await page.close();await app.close();rmSync(dir,{recursive:true,force:true});}
  }
}finally{await browser.close();}
