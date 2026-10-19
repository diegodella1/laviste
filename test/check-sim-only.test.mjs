import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkSimOnly} from '../scripts/check-sim-only.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'sim-only-'));
}

function seedTree(dir, extraAuto = '') {
  mkdirSync(join(dir, 'lib', 'auto'), {recursive: true});
  mkdirSync(join(dir, 'lib'), {recursive: true});
  writeFileSync(join(dir, 'server.mjs'), 'export {}\n');
  writeFileSync(join(dir, 'lib', 'iol.mjs'), `
    export function createIOL(){ return {snapshot(){ return {simulated:false}; }}; }
    export async function tokens(){ return fetch('https://api.invertironline.com/token', {method:'POST'}); }
  `);
  writeFileSync(join(dir, 'lib', 'roxom.mjs'), `
    export async function readRoxom({fetcher=fetch}={}){ return fetcher('https://api.roxom.io/v1/market', {method:'GET'}); }
  `);
  writeFileSync(join(dir, 'lib', 'auto', 'sim-only.mjs'), extraAuto || 'export const SIMULATED_ONLY = Object.freeze({value:true});\n');
}

test('check-sim-only accepts the current tree', () => {
  const report = checkSimOnly(process.cwd());
  assert.equal(report.ok, true, report.errors.join('\n'));
});

test('check-sim-only CLI exits 0 on this repo', () => {
  const check = spawnSync(process.execPath, [resolve('scripts/check-sim-only.mjs')], {encoding: 'utf8'});
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /Sim-only OK/);
});

test('check-sim-only catches a planted auto import of iol', () => {
  const dir = tmp();
  try {
    seedTree(dir, "import {createIOL} from '../iol.mjs';\nexport const SIMULATED_ONLY = {value:true};\n");
    const report = checkSimOnly(dir);
    assert.equal(report.ok, false);
    assert.ok(report.errors.some(line => line.includes('iol.mjs')), report.errors.join('\n'));
    const cli = spawnSync(process.execPath, [resolve('scripts/check-sim-only.mjs')], {cwd: dir, encoding: 'utf8'});
    assert.notEqual(cli.status, 0);
    assert.match(cli.stderr, /iol\.mjs/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('check-sim-only catches a planted simulated=0 ledger write', () => {
  const dir = tmp();
  try {
    seedTree(dir);
    writeFileSync(join(dir, 'lib', 'ops.mjs'), `
      export function recordReal(store){
        store.db.prepare('INSERT INTO ops(id,simulated) VALUES (?,?)').run('x', 0);
      }
    `);
    const report = checkSimOnly(dir);
    assert.equal(report.ok, false);
    assert.ok(report.errors.some(line => /simulated=0/.test(line) || /simulated=0\/false/.test(line) || /writes simulated=0/.test(line)), report.errors.join('\n'));
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
