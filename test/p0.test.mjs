import {test} from 'node:test';
import a from 'node:assert/strict';
import {createTake, activate, review, templates} from '../lib/engine.mjs';
import {buildTimeline, movementsToday} from '../lib/timeline.mjs';

test('activation event uses ARS wording and timeline picks it up',()=>{
  const t=createTake(templates[0]);
  activate(t,1000000);
  a.ok(t.events[0].body.includes('ARS'));
  a.equal(t.events[0].type,'activation');
  const {items}=buildTimeline(t,[],[]);
  a.ok(items.some(i=>i.type==='activation'));
});

test('chequeo cites numeric cap/drift rules',()=>{
  const t=createTake(templates[0]);
  activate(t,1000000);
  t.holdings[0].price=t.holdings[0].price*1.4;
  review(t,'check');
  const evt=t.events[0];
  a.equal(evt.type,'chequeo');
  a.ok(evt.ruleCite);
  a.ok(evt.verdictText);
});

test('movementsToday only includes ART today',()=>{
  const t=createTake(templates[0]);
  activate(t,500000);
  const rows=movementsToday([t],[],[]);
  a.ok(rows.length>=1);
});
