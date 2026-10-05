import {test} from 'node:test';
import a from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {askOpenAI,parseResponse,requestBody} from '../lib/ai.mjs';
import {templates} from '../lib/engine.mjs';
import {signedHeaders,readRoxom,roxomConfig} from '../lib/roxom.mjs';
test('OpenAI contract requests structured output with no persistent remote response',async()=>{
  let request;const result=await askOpenAI([{role:'user',content:'Armá la propuesta'}],null,{apiKey:'test-only',model:'gpt-5-mini',fetcher:async(url,options)=>{request=JSON.parse(options.body);a.equal(url,'https://api.openai.com/v1/responses');return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'Propuesta de práctica',proposal:templates[0]})}]}],usage:{input_tokens:12,output_tokens:20}})};}});
  a.equal(request.store,false);a.equal(request.text.format.type,'json_schema');a.equal(request.text.format.strict,true);a.equal(result.proposal.title,templates[0].title);
});
test('OpenAI incomplete and refusal are explicit errors, not saved fake answers',()=>{a.throws(()=>parseResponse({status:'incomplete'}),/incompleta/);a.throws(()=>parseResponse({status:'completed',output:[{content:[{type:'refusal'}]}]}),/no pudo/);});
test('provider authentication errors never expose credentials',async()=>{await a.rejects(()=>askOpenAI([],null,{apiKey:'secret',model:'gpt-5-mini',fetcher:async()=>({ok:false,status:401})}),/rechazó la clave/);});
test('Roxom signs the exact GET query with RSA and preserves decimal strings',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const path='/v1/market/instruments?unit=btc',h=signedHeaders(path,'fake-key',privateKey);
  a.ok(verify('RSA-SHA256',Buffer.from('GET:'+path),publicKey,Buffer.from(h['X-API-Signature'],'base64')));
  const calls=[];const data=await readRoxom({...roxomConfig({}),apiKey:'fake-key',privateKeyPath:'test.pem'},{privateKey,fetcher:async(url,options)=>{calls.push(url);a.equal(options.method,'GET');return {ok:true,json:async()=>({error:false,data:url.includes('/market/')?{instruments:[{symbol:'GOLD-BTC',instrumentType:'perpetual',btcUnit:'btc'}]}:{balances:[{asset:'BTC',available:'0.00000001',current:'0.00000001'}]}})};}});
  a.equal(data.balances[0].available,'0.00000001');a.equal(data.instruments[0].instrumentType,'perpetual');a.ok(calls.every(u=>u.startsWith('https://api.roxom.io/')));
});
test('Roxom cannot use an arbitrary host or an unknown environment',()=>{a.throws(()=>roxomConfig({ROXOM_ENV:'evil'}));a.equal(roxomConfig({ROXOM_ENV:'production'}).baseUrl,'https://api.roxom.com');});
