import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractSources,validateAnalysis,applyResearch,research} from '../lib/news.mjs';
import {createTake,activate,templates} from '../lib/engine.mjs';

const sources=[{id:1,url:'https://example.com/report',title:'Informe'}];
const analysis=()=>({summary:'Cambió la evidencia',attention:'review',reason:'La evidencia contradice la demanda esperada.',resolved:false,sourceIds:[1],events:[{title:'Informe',fact:'Hecho de prueba',interpretation:'Contradice el supuesto',uncertainty:'Impacto pendiente',affected:'Demanda',publishedAt:null,sourceIds:[1]}]});
test('source extraction rejects executable links and canonicalizes tracked URLs',()=>{
  const result=extractSources({output:[{type:'web_search_call',action:{sources:[{url:'javascript:alert(1)'},{url:'https://example.com/report?utm_source=test#here'}]}},{content:[{annotations:[{url:'https://example.com/report',title:'Informe'}]}]}]});
  assert.equal(result.length,1);assert.equal(result[0].url,sources[0].url);
});
test('unknown citations and unsupported attention changes are rejected',()=>{
  const value=analysis();assert.doesNotThrow(()=>validateAnalysis(value,sources));
  value.events[0].sourceIds=[2];assert.throws(()=>validateAnalysis(value,sources),/fuente/);
  value.events=[];value.sourceIds=[];assert.throws(()=>validateAnalysis(value,sources),/evidencia/);
});
test('research uses search then schema classification and never requests trading',async()=>{
  const calls=[];
  const result=await research(createTake(templates[0]),{apiKey:'test',model:'gpt-5-mini',fetcher:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    return {ok:true,json:async()=>calls.length===1?{status:'completed',output:[{type:'web_search_call',action:{sources}},{content:[{type:'output_text',text:'Informe de prueba con fuente.'}]}]}:{status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(analysis())}]}]}};
  }});
  assert.equal(calls.length,2);assert.equal(calls[0].tools[0].type,'web_search');assert.equal(calls[0].max_tool_calls,2);assert.equal(calls[1].text.format.strict,true);assert.equal(result.attention,'review');
});
test('stale versions cannot change attention; missing evidence does not clear an open issue',()=>{
  const take=createTake(templates[0]);activate(take,1000000);
  const first={...analysis(),sources,at:new Date().toISOString(),version:1};applyResearch(take,first,[]);assert.equal(take.attention,'review');
  const empty={...analysis(),sources,events:[],sourceIds:[],attention:'track',at:first.at,version:1};applyResearch(take,empty,[first]);assert.equal(take.attention,'review');
  take.version=2;const old={...analysis(),sources,attention:'track',resolved:true,version:1,at:first.at};applyResearch(take,old,[first]);assert.equal(old.applied,false);assert.equal(take.attention,'review');
});
test('repeat sources are deduplicated without inventing a new event',()=>{
  const take=createTake(templates[0]);activate(take,1000000);
  const first={...analysis(),sources,at:new Date().toISOString(),version:1};applyResearch(take,first,[]);
  const repeat={...analysis(),sources,at:first.at,version:1};applyResearch(take,repeat,[first]);assert.equal(repeat.events.length,0);
});
