import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  extractSources, validateAnalysis, applyResearch, research,
  condenseFeedDigest, enoughCitedEvidence, sourcesFromDigest, loadEnabledFeedDigest,
  MIN_FEED_EVIDENCE,
} from '../lib/news.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {createStore} from '../lib/store.mjs';
import {createScheduler} from '../lib/scheduler.mjs';
import {probeFeed} from '../lib/feeds.mjs';

const sources=[{id:1,url:'https://example.com/report',title:'Informe'}];
const analysis=()=>({summary:'Cambió la evidencia',attention:'review',reason:'La evidencia contradice la demanda esperada.',resolved:false,sourceIds:[1],events:[{title:'Informe',fact:'Hecho de prueba',interpretation:'Contradice el supuesto',uncertainty:'Impacto pendiente',affected:'Demanda',publishedAt:null,sourceIds:[1]}]});
const rssXml = readFileSync(new URL('./fixtures/rss-sample.xml', import.meta.url), 'utf8');
const publicLookup = async () => [{address: '93.184.216.34', family: 4}];

function xmlResponse(xml) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({'content-type': 'application/rss+xml'}),
    arrayBuffer: async () => new TextEncoder().encode(xml),
  };
}

function digestWith(count, extra = {}) {
  const items = Array.from({length: count}, (_, i) => ({
    title: `Titular ${i + 1}`,
    url: extra.badUrl && i === 0 ? extra.badUrl : `https://ejemplo.com/n${i + 1}`,
    snippet: `Snippet ${i + 1}.`,
    publishedAt: new Date().toISOString(),
  }));
  return condenseFeedDigest([{feed: {label: extra.label || 'Demo', url: 'https://ejemplo.com/rss'}, items}]);
}

function openaiThenClassify(calls, classifySources = sources) {
  return async (url, options) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    calls.push(body);
    const isSearch = Array.isArray(body.tools);
    const payload = isSearch
      ? {status:'completed', output:[{type:'web_search_call', action:{sources: classifySources}}, {content:[{type:'output_text', text:'Informe de prueba con fuente.'}]}]}
      : {status:'completed', output:[{content:[{type:'output_text', text:JSON.stringify(analysis())}]}]};
    return {ok:true, json: async () => payload};
  };
}

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
  const result=await research(createTake(templates[0]),{apiKey:'test',model:'gpt-5-mini',fetcher:openaiThenClassify(calls)});
  assert.equal(calls.length,2);assert.equal(calls[0].tools[0].type,'web_search');assert.equal(calls[0].max_tool_calls,2);assert.equal(calls[1].text.format.strict,true);assert.equal(result.attention,'review');
  const input=JSON.parse(calls[0].input);
  assert.equal(input.feedDigest.citedCount,0);
  assert.equal(input.feedDigest.feeds.length,0);
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

test('condenseFeedDigest keeps titles, links and snippets and drops executable URLs',()=>{
  const digest=condenseFeedDigest([{
    feed:{label:'Demo',url:'https://ejemplo.com/rss'},
    items:[
      {title:'OK',url:'https://ejemplo.com/ok?utm_source=x',snippet:'Corto',publishedAt:new Date().toISOString()},
      {title:'Mal',url:'javascript:alert(1)',snippet:'No',publishedAt:new Date().toISOString()},
    ],
  }]);
  assert.equal(digest.citedCount,1);
  assert.equal(digest.items[0].url,'https://ejemplo.com/ok');
  assert.equal(digest.items[1].url,null);
  assert.equal(digest.items[0].snippet,'Corto');
  assert.equal('xml' in digest.items[0], false);
  assert.ok(enoughCitedEvidence(digestWith(MIN_FEED_EVIDENCE)));
  assert.equal(enoughCitedEvidence(digestWith(MIN_FEED_EVIDENCE - 1)), false);
});

test('loadEnabledFeedDigest fetches enabled feeds only and never calls OpenAI',async()=>{
  const fetched=[];
  const digest=await loadEnabledFeedDigest({
    feeds:[
      {id:'1',label:'On',url:'https://on.example/rss',enabled:true},
      {id:'2',label:'Off',url:'https://off.example/rss',enabled:false},
    ],
    feedLookup: publicLookup,
    feedFetcher: async url => {
      const href=String(url);
      assert.equal(href.includes('openai.com'), false);
      fetched.push(href);
      return xmlResponse(rssXml);
    },
  }, {now: '2026-10-07T18:00:00.000Z'});
  assert.deepEqual(fetched,['https://on.example/rss']);
  assert.ok(digest.citedCount >= MIN_FEED_EVIDENCE);
  assert.equal(digest.feeds.length,1);
  assert.equal(digest.feeds[0].label,'On');
  assert.equal(digest.items[0].title,'BCRA mantiene la tasa de política');
  assert.match(digest.items[0].snippet,/tasa de referencia/);
});

test('empty feeds still fall back to web_search as today',async()=>{
  const calls=[];
  const fetched=[];
  const result=await research(createTake(templates[0]),{
    apiKey:'test', model:'gpt-5-mini', feeds:[],
    feedFetcher: async url => { fetched.push(String(url)); return xmlResponse(rssXml); },
    fetcher: openaiThenClassify(calls),
  });
  assert.equal(fetched.length,0);
  assert.equal(calls.length,2);
  assert.equal(calls[0].tools[0].type,'web_search');
  assert.equal(calls[0].max_tool_calls,2);
  assert.equal(result.sources[0].url, sources[0].url);
});

test('thin digest still allows at most two web_search calls',async()=>{
  const calls=[];
  await research(createTake(templates[0]),{
    apiKey:'test', model:'gpt-5-mini',
    digest: digestWith(1),
    fetcher: openaiThenClassify(calls),
  });
  assert.equal(calls.length,2);
  assert.equal(calls[0].tools[0].type,'web_search');
  assert.equal(calls[0].max_tool_calls,2);
  const input=JSON.parse(calls[0].input);
  assert.equal(input.feedDigest.citedCount,1);
  assert.equal(input.feedDigest.feeds[0].items[0].title,'Titular 1');
});

test('enough feed evidence classifies without web_search',async()=>{
  const calls=[];
  const usages=[];
  const digest=digestWith(MIN_FEED_EVIDENCE);
  const feedSources=sourcesFromDigest(digest);
  const result=await research(createTake(templates[0]),{
    apiKey:'test', model:'gpt-5-mini', digest,
    onUsage: (usage, searches) => usages.push(searches),
    fetcher: async (url, options) => {
      assert.equal(String(url),'https://api.openai.com/v1/responses');
      const body=JSON.parse(options.body);
      calls.push(body);
      assert.equal(body.tools, undefined);
      const review={...analysis(), sourceIds:[1], events:[{...analysis().events[0], sourceIds:[1]}]};
      return {ok:true, json: async () => ({status:'completed', output:[{content:[{type:'output_text', text:JSON.stringify(review)}]}]})};
    },
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].text.format.strict, true);
  assert.equal(JSON.stringify(calls[0]).includes('web_search'), false);
  assert.deepEqual(result.sources.map(s=>s.url), feedSources.map(s=>s.url));
  assert.equal(usages.length,1);
  assert.equal(usages[0],0);
});

test('listNewsFeeds is requested enabled-only; disabled URLs are not fetched',async()=>{
  const calls=[];
  const fetched=[];
  let listed=null;
  await research(createTake(templates[0]),{
    apiKey:'test', model:'gpt-5-mini',
    listNewsFeeds: opts => {
      listed=opts;
      return [
        {id:'1',label:'On',url:'https://on.example/rss',enabled:true},
        {id:'2',label:'Off',url:'https://off.example/rss',enabled:false},
      ];
    },
    feedLookup: publicLookup,
    feedFetcher: async url => {
      fetched.push(String(url));
      assert.equal(String(url).includes('openai.com'), false);
      return xmlResponse(rssXml);
    },
    fetcher: async (url, options) => {
      const body=JSON.parse(options.body);
      calls.push(body);
      const review={...analysis(), sourceIds:[1], events:[{...analysis().events[0], sourceIds:[1]}]};
      return {ok:true, json: async () => ({status:'completed', output:[{content:[{type:'output_text', text:JSON.stringify(review)}]}]})};
    },
  });
  assert.deepEqual(listed,{enabled:true});
  assert.deepEqual(fetched,['https://on.example/rss']);
  assert.equal(calls.length,1);
  assert.equal(calls[0].tools, undefined);
});

test('probe still does not call OpenAI when research path is unused',async()=>{
  let hitOpenAi=false;
  const result=await probeFeed('https://ejemplo.com/rss',{
    lookupFn: publicLookup,
    fetcher: async url => {
      if (String(url).includes('openai.com')) hitOpenAi=true;
      return xmlResponse(rssXml);
    },
  });
  assert.equal(result.ok,true);
  assert.equal(hitOpenAi,false);
  assert.equal(result.items.length,5);
});

test('scheduler passes store feeds into research without extra quota',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'laviste-news-feeds-'));
  const store=createStore(dir);
  let scheduler;
  try {
    store.insertNewsFeed({label:'On',url:'https://on.example/rss',enabled:true});
    store.insertNewsFeed({label:'Off',url:'https://off.example/rss',enabled:false});
    const take=createTake(templates[0]);activate(take,1000000);store.putTake(take);
    let seen;
    scheduler=createScheduler(store,()=>({apiKey:'test',newsLimit:10}),{researcher:async (_take, config)=>{
      seen=config.listNewsFeeds({enabled:true});
      return {id:'review-feeds',takeId:take.id,version:_take.version,at:new Date().toISOString(),sources,events:[],attention:'track',summary:'Sin novedad',reason:'Sin evidencia nueva',resolved:false};
    }});
    scheduler.enqueue(take);
    await scheduler.tick();
    assert.equal(seen.length,1);
    assert.equal(seen[0].label,'On');
    assert.equal(store.usage().find(row=>row.kind==='news').calls,1);
  } finally {
    await scheduler?.close();
    store.close();
    rmSync(dir,{recursive:true,force:true});
  }
});
