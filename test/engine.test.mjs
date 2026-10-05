import {test} from 'node:test';
import a from 'node:assert/strict';
import {createTake,activate,review,value,templates,updateSettings} from '../lib/engine.mjs';
import {portfolioSeries} from '../public/math.js';
test('activation conserves capital, uses whole units and cannot be applied twice',()=>{
  const t=createTake(templates[0]);activate(t,1000000);
  a.equal(value(t),1000000);a.ok(t.cash>=100000);a.ok(t.holdings.every(h=>Number.isInteger(h.units)&&h.units>0));
  a.throws(()=>activate(t,1000000),/ya está activa/);
});
test('reject unknown tickers, duplicate positions, invalid weights and underfunded portfolios',()=>{
  const p=structuredClone(templates[0]);p.holdings[0].ticker='FAKE';a.throws(()=>createTake(p),/catálogo/);
  p.holdings[0].ticker='AMD';a.throws(()=>createTake(p),/repetidos/);
  p.holdings[0].ticker='NVDA';p.holdings[0].weight=Infinity;a.throws(()=>createTake(p),/peso/);
  const t=createTake({...templates[0],holdings:templates[0].holdings.map((h,i)=>({...h,weight:i===0?.1:20}))});a.throws(()=>activate(t,100000),/no alcanza/);
});
test('proposal cannot override database id or state',()=>{const t=createTake({...templates[0],id:'attacker',phase:'active',cash:999});a.notEqual(t.id,'attacker');a.equal(t.phase,'draft');a.equal(t.cash,0);});
test('scenario changes attention and value without altering holdings or cash',()=>{
  const t=createTake(templates[0]);activate(t,1000000);const units=t.holdings.map(h=>h.units),cash=t.cash;
  review(t,'drop');a.equal(t.status,'watch');a.ok(value(t)<1000000);a.deepEqual(t.holdings.map(h=>h.units),units);a.equal(t.cash,cash);
  const after=value(t);review(t,'drop');a.equal(value(t),after);review(t,'broken');a.equal(t.status,'review');review(t,'check');a.equal(t.status,'review');review(t,'recovery');a.equal(t.status,'track');
});
test('daily review does not invent prices, and updates are validated',()=>{const t=createTake(templates[0]);activate(t,1000000);const v=value(t);review(t);a.equal(value(t),v);a.throws(()=>updateSettings(t,{cadence:'fake'}));a.throws(()=>updateSettings(t,{...t.settings,mode:'autopilot'}));});
test('adding capital is not counted as investment return',()=>{
  const make=(capital,history)=>({phase:'active',invested:capital,history});
  const ts=[make(100,[{at:'2026-01-01',value:100,benchmark:100},{at:'2026-01-02',value:110,benchmark:105}]),make(900,[{at:'2026-01-03',value:900,benchmark:900}])];
  const h=portfolioSeries(ts);a.equal(h[0].value,100);a.ok(Math.abs(h.at(-1).value-101)<1e-9);a.ok(h.every(p=>p.value<111));
});
