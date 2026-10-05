import {sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {assert} from './engine.mjs';
export function roxomConfig(env=process.env){
  const environment=env.ROXOM_ENV||'sandbox';
  assert(['sandbox','production'].includes(environment),'ROXOM_ENV debe ser sandbox o production.');
  return {environment,baseUrl:environment==='production'?'https://api.roxom.com':'https://api.roxom.io',apiKey:env.ROXOM_API_KEY||'',privateKeyPath:env.ROXOM_PRIVATE_KEY_PATH||''};
}
export function signedHeaders(path,apiKey,privateKey){return {'X-API-Key':apiKey,'X-API-Signature':sign('RSA-SHA256',Buffer.from('GET:'+path),privateKey).toString('base64'),'Accept':'application/json'};}
export async function readRoxom(config,{fetcher=fetch,privateKey}={}){
  assert(config.apiKey&&config.privateKeyPath,'Configurá las credenciales de Roxom en el servidor.',503);
  let key;try{key=privateKey||readFileSync(config.privateKeyPath,'utf8');}catch{throw Object.assign(new Error('No se pudo leer el archivo de clave privada de Roxom.'),{status:503});}
  const get=async path=>{
    let headers;try{headers=signedHeaders(path,config.apiKey,key);}catch{throw Object.assign(new Error('La clave privada de Roxom no tiene un formato RSA válido.'),{status:503});}
    const r=await fetcher(config.baseUrl+path,{method:'GET',headers,signal:AbortSignal.timeout(20000),redirect:'error'});
    assert(r.ok,`Roxom respondió ${r.status}. Revisá las credenciales y el entorno ${config.environment}.`,502);
    const data=await r.json();assert(data.error===false&&data.data,'Roxom no devolvió datos válidos.',502);return data.data;
  };
  const [market,account]=await Promise.all([get('/v1/market/instruments?unit=btc'),get('/v1/accounts/balance?unit=btc')]);
  assert(Array.isArray(market.instruments)&&Array.isArray(account.balances),'La respuesta de Roxom cambió de formato. No se mezclaron los datos.',502);
  // Preserve decimal strings and original asset classes; never add them to ARS simulation values.
  return {at:new Date().toISOString(),environment:config.environment,unit:'btc',readOnly:true,instruments:market.instruments.map(i=>({symbol:i.symbol,instrumentType:i.instrumentType,btcUnit:i.btcUnit,status:i.status})),balances:account.balances.map(b=>({asset:b.asset,assetClass:b.assetClass,available:b.available,current:b.current}))};
}
