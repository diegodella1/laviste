import {test} from 'node:test';
import a from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {templates} from '../lib/engine.mjs';
const chatFetcher=async()=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'Propuesta lista',proposal:templates[0]})}]}],usage:{input_tokens:1,output_tokens:1}})});
test('API protects account data, persists activation, rejects CSRF and does not expose secrets',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'tesis-test-'));let app;
  try{
    app=createApp({dataDir:dir,password:'test-password-only',apiKey:'',port:0,seed:true,fetcher:chatFetcher});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));let base='http://127.0.0.1:'+app.server.address().port;
    a.equal((await fetch(base+'/api/state')).status,401);
    const session=await fetch(base+'/api/session');
    a.equal(session.status,200);
    const sessionBody=await session.json();
    a.equal(sessionBody.authenticated,false);
    a.equal((await fetch(base+'/api/takes')).status,401);
    a.equal((await fetch(base+'/',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,200);
    a.equal((await fetch(base+'/api/state',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test-password-only'})});a.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];a.ok(login.headers.get('set-cookie').includes('HttpOnly'));
    const headers={Cookie:cookie,'Content-Type':'application/json'};
    a.equal((await fetch(base+'/api/takes',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
    const state=await (await fetch(base+'/api/state',{headers})).json();a.equal(state.takes.length,3);a.equal(state.config.apiKey,undefined);a.equal(state.config.password,undefined);
    const blocked=await fetch(base+'/api/takes',{method:'POST',headers,body:JSON.stringify({proposal:state.templates[0]})});a.equal(blocked.status,503);app.config.apiKey='test-key';
    const make=await fetch(base+'/api/takes',{method:'POST',headers,body:JSON.stringify({proposal:state.templates[0]})});const t=await make.json();a.equal(make.status,201);
    const activate=()=>fetch(base+`/api/takes/${t.id}/activate`,{method:'POST',headers,body:'{"amount":1000000}'});
    const first=await activate();a.equal(first.status,200);a.equal((await activate()).status,409);
    const c=await(await fetch(base+'/api/chats',{method:'POST',headers,body:'{}'})).json();
    const msg=await fetch(base+`/api/chats/${c.id}/messages`,{method:'POST',headers,body:JSON.stringify({message:'Armá la propuesta',adjusting:false})});
    a.equal(msg.status,200);const chat=await msg.json();a.ok(chat.proposal);
    const fromChat=await fetch(base+'/api/takes',{method:'POST',headers,body:JSON.stringify({sourceChatId:c.id})});a.equal(fromChat.status,201);a.equal((await fromChat.json()).phase,'draft');
    app.config.apiKey='';a.equal((await fetch(base+`/api/chats/${c.id}/messages`,{method:'POST',headers,body:'{"message":"hola"}'})).status,503);
    a.equal((await fetch(base+'/.env',{headers})).status,404);
    await app.close();app=createApp({dataDir:dir,password:'test-password-only',apiKey:'',port:0,seed:true,fetcher:chatFetcher});a.equal(app.store.take(t.id).phase,'active');a.equal(app.store.takes().length,5);
  }finally{if(app?.server.listening)await app.close();else app?.store.close();rmSync(dir,{recursive:true,force:true});}
});
