import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {pragmaUserVersion} from '../lib/migrations/multiuser.mjs';

test('v21 migration adds day_change_pct, prev_close, change_as_of columns to quote_cache', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quote-day-change-'));
  const store = createStore(dir);
  
  assert.equal(pragmaUserVersion(store.db), 21);
  
  const cols = store.db.prepare('PRAGMA table_info(quote_cache)').all().map(c => c.name);
  assert.ok(cols.includes('day_change_pct'), 'day_change_pct column exists');
  assert.ok(cols.includes('prev_close'), 'prev_close column exists');
  assert.ok(cols.includes('change_as_of'), 'change_as_of column exists');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('v21 migration is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quote-day-change-'));
  const store = createStore(dir);
  
  store.db.prepare('INSERT INTO quote_cache(ticker,price,as_of,provider,stale) VALUES (?,?,?,?,?)')
    .run('TEST', 100, '2026-11-07T14:00:00.000Z', 'demo', 0);
  
  const before = pragmaUserVersion(store.db);
  store.close();
  
  const store2 = createStore(dir);
  const after = pragmaUserVersion(store2.db);
  assert.equal(before, after);
  
  const row = store2.db.prepare('SELECT * FROM quote_cache WHERE ticker=?').get('TEST');
  assert.equal(row.ticker, 'TEST');
  assert.equal(row.price, 100);
  assert.equal(row.day_change_pct, null);
  assert.equal(row.prev_close, null);
  assert.equal(row.change_as_of, null);
  
  store2.close();
  rmSync(dir, {recursive: true, force: true});
});

test('quote_cache stores and retrieves day_change_pct and prev_close', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quote-day-change-'));
  const store = createStore(dir);
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('VIST', 1050, '2026-11-07T17:30:00.000Z', 'data912', 0, 0.05, 1000, '2026-11-07T17:30:00.000Z');
  
  const row = store.db.prepare('SELECT * FROM quote_cache WHERE ticker=?').get('VIST');
  assert.equal(row.ticker, 'VIST');
  assert.equal(row.price, 1050);
  assert.equal(row.day_change_pct, 0.05);
  assert.equal(row.prev_close, 1000);
  assert.equal(row.change_as_of, '2026-11-07T17:30:00.000Z');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('quote_cache accepts NULL for optional day-change columns', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quote-day-change-'));
  const store = createStore(dir);
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('OLD', 500, '2026-11-07T17:30:00.000Z', 'yahoo', 0, null, null, null);
  
  const row = store.db.prepare('SELECT * FROM quote_cache WHERE ticker=?').get('OLD');
  assert.equal(row.ticker, 'OLD');
  assert.equal(row.price, 500);
  assert.equal(row.day_change_pct, null);
  assert.equal(row.prev_close, null);
  assert.equal(row.change_as_of, null);
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});

test('quote_cache preserves meaningful zero for day_change_pct', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quote-day-change-'));
  const store = createStore(dir);
  
  store.db.prepare(`INSERT INTO quote_cache(ticker,price,as_of,provider,stale,day_change_pct,prev_close,change_as_of)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run('FLAT', 1000, '2026-11-07T17:30:00.000Z', 'data912', 0, 0.0, 1000, '2026-11-07T17:30:00.000Z');
  
  const row = store.db.prepare('SELECT * FROM quote_cache WHERE ticker=?').get('FLAT');
  assert.equal(row.day_change_pct, 0.0);
  assert.ok(Number.isFinite(row.day_change_pct), 'Zero is finite');
  
  store.close();
  rmSync(dir, {recursive: true, force: true});
});
