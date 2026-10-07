import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';

const outDir='/opt/cursor/artifacts/screenshots';
mkdirSync(outDir,{recursive:true});
const fakeKey='sk-test-screenshots-only';
const password='screenshot-test-password';
let chatTurn=0;
const fetcher=async(url,options)=>{
  if(!options.body) return {ok:true,json:async()=>({status:'completed',output:[],usage:{}})};
  const body=JSON.parse(options.body);
  chatTurn++;
  const proposal=chatTurn>=2?templates[1]:null;
  const message=proposal?'Con lo que dijiste armo esta cartera de práctica.':'¿Preferís local o mezcla con CEDEAR, atado a inflación/energía?';
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message,proposal})}]}],usage:{input_tokens:10,output_tokens:20}})};
};

async function login(page,base){
  await page.goto(base+'/app');
  await page.locator('#login input').fill(password);
  await page.locator('#login button').click();
  await page.waitForSelector('.main');
  await page.goto(base+'/app#/settings');
  await page.locator('#openai-settings [name=apiKey]').fill(fakeKey);
  await page.locator('#openai-settings button').click();
  await page.waitForSelector('[data-action="test-openai"]:not([disabled])');
}

async function cookies(page){return (await page.context().cookies()).map(c=>`${c.name}=${c.value}`).join('; ');}

const dir=mkdtempSync(join(tmpdir(),'laviste-shots-'));
writeFileSync(join(dir,'master.key'),'12'.repeat(32));
const app=createApp({dataDir:join(dir,'data'),password,masterKeyPath:join(dir,'master.key'),apiKey:fakeKey,port:0,host:'127.0.0.1',secure:false,origin:'',fetcher,quotesLive:false,quotesFixture:true});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_USE_BUNDLED?{}:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}),args:['--no-sandbox']});
try{
  for(const [name,width] of [['home-empty',1440],['home-empty',390],['chat-portfolio',1440],['chat-portfolio',390],['action-timeline',1440],['action-timeline',390],['home',1440],['home',390]]){
    chatTurn=0;
    const page=await browser.newPage({viewport:{width,height:900}});
    await login(page,base);
    if(name.startsWith('home-empty')){
      await page.goto(base+'/app#/');
      await page.waitForSelector('.home-empty');
    }else if(name.startsWith('chat')){
      await page.goto(base+'/app#/new/proponer');
      await page.locator('#new-prompt').fill('Inflación + energía como cobertura. Quiero practicar.');
      await page.locator('#new-chat button').click();
      await page.waitForSelector('#chat-send');
      await page.locator('#chat-send textarea').fill('Mezclá local y CEDEAR. 6–12 meses.');
      await page.locator('#chat-send button').click();
      await page.waitForSelector('#portfolio-card');
    }else if(name.startsWith('action-timeline')){
      const t=createTake(templates[1]);activate(t,1250000);app.store.putTake(t);
      await page.goto(base+`/app#/take/${t.id}/news`);
      await page.reload();
      await page.waitForSelector('.timeline-item');
    }else{
      const t=createTake(templates[0]);activate(t,1250000);app.store.putTake(t);
      await page.goto(base+'/app#/');
      await page.reload();
      await page.waitForSelector('.summary');
    }
    const suffix=width===390?'mobile-390':'desktop-1440';
    await page.screenshot({path:join(outDir,`${name}-${suffix}.png`),fullPage:true});
    await page.close();
  }
}finally{await browser.close();await app.close();rmSync(dir,{recursive:true,force:true});}
console.log('Screenshots saved to',outDir);
