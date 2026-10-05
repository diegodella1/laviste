import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createVault} from '../lib/vault.mjs';
import {createScheduler} from '../lib/scheduler.mjs';
import {createTake,activate,templates,updateSettings} from '../lib/engine.mjs';

test('credentials are authenticated encrypted, persistent, and names cannot be swapped',()=>{
  const dir=mkdtempSync(join(tmpdir(),'laviste-vault-'));let store;
  try{
    const key=join(dir,'master');writeFileSync(key,'ab'.repeat(32));store=createStore(dir);let vault=createVault(store,key);
    vault.set('openai',{apiKey:'secret-never-public'});
    assert.ok(!JSON.stringify(store.setting('secret:openai')).includes('secret-never-public'));
    store.close();store=createStore(dir);vault=createVault(store,key);assert.equal(vault.get('openai').apiKey,'secret-never-public');
    store.setSetting('secret:iol',store.setting('secret:openai'));assert.throws(()=>vault.get('iol'));
    vault.remove('openai');assert.equal(vault.get('openai'),null);
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('invalid concentration policy is rejected before activation or save',()=>{
  const take=createTake(templates[0]);assert.throws(()=>updateSettings(take,{...take.settings,cap:10}),/pesos objetivo/);
  take.settings.cap=10;assert.throws(()=>activate(take,1000000),/pesos objetivo/);
});
test('scheduler persists jobs, enforces quota and rejects stale-version application',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'laviste-jobs-'));const store=createStore(dir);let scheduler;
  try{
    const take=createTake(templates[0]);activate(take,1000000);store.putTake(take);
    let release;const gate=new Promise(resolve=>release=resolve);
    scheduler=createScheduler(store,()=>({apiKey:'test',newsLimit:1}),{researcher:async original=>{
      await gate;return {id:'review-1',takeId:take.id,version:original.version,at:new Date().toISOString(),sources:[],events:[],attention:'track',summary:'Sin fuentes nuevas',reason:'Sin evidencia',resolved:false};
    }});
    const job=scheduler.enqueue(take);assert.equal(scheduler.enqueue(take).id,job.id);
    const pending=scheduler.tick();take.version++;store.putTake(take);release();await pending;
    assert.equal(store.job(job.id).status,'completed');assert.equal(store.reviews(take.id)[0].applied,false);
    scheduler.enqueue(take);await scheduler.tick();assert.equal(store.take(take.id).coverage,'stale');
    assert.equal(store.usage().find(row=>row.kind==='news').calls,1);
  }finally{await scheduler?.close();store.close();rmSync(dir,{recursive:true,force:true});}
});
