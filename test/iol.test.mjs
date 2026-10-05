import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIOL,normalizeSnapshot} from '../lib/iol.mjs';

test('IOL authenticates, reads only, preserves currencies and disconnects',async()=>{
  const secrets=new Map(),settings=new Map(),requests=[];
  const vault={get:key=>secrets.get(key),set:(key,value)=>secrets.set(key,value),remove:key=>secrets.delete(key)};
  const store={setting:key=>settings.get(key),setSetting:(key,value)=>settings.set(key,value),deleteSetting:key=>settings.delete(key)};
  const iol=createIOL(vault,store,{fetcher:async(url,options)=>{
    requests.push({url,options});
    return {ok:true,json:async()=>url.endsWith('/token')?{access_token:'access',refresh_token:'refresh',expires_in:900}:url.endsWith('estadocuenta')?{cuentas:[{moneda:'peso_Argentino',disponible:100},{moneda:'dolar_Estadounidense',disponible:2}]}:{activos:[]}};
  }});
  await iol.connect('user','password');assert.ok(!JSON.stringify([...secrets]).includes('password'));
  const snapshot=await iol.snapshot();assert.equal(snapshot.account.cuentas.length,2);assert.equal(snapshot.simulated,false);
  assert.ok(requests.every(request=>request.url.endsWith('/token')||request.options.method==='GET'));
  assert.ok(requests.every(request=>!request.url.includes('/operar/')));
  iol.disconnect();await assert.rejects(()=>iol.snapshot(),/Conectá IOL/);
});
test('missing provider fields are errors rather than zero balances',()=>{
  assert.throws(()=>normalizeSnapshot({},{}),/incompleto/);
  assert.throws(()=>normalizeSnapshot({cuentas:[]},{}),/incompletas/);
});
