import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRevision, promote} from '../scripts/release.mjs';

test('release requires the exact checked-out commit, never a branch or other SHA', () => {
  const sha = 'a'.repeat(40);
  assert.doesNotThrow(() => assertRevision(sha, sha));
  assert.throws(() => assertRevision('main', sha));
  assert.throws(() => assertRevision('b'.repeat(40), sha));
});

test('failed promotion or public smoke restores the previous release and fails the job', async () => {
  for (const failureAt of ['apply', 'verify']) {
    const calls = [];
    const step = name => async () => {calls.push(name); if (name === failureAt) throw new Error(name);};
    await assert.rejects(promote({apply:step('apply'), verify:step('verify'), restore:step('restore'), record:step('record')}));
    assert.deepEqual(calls, failureAt === 'apply' ? ['apply','restore'] : ['apply','verify','restore']);
  }
});

test('release is recorded only after verification; unsuccessful recovery remains visible', async () => {
  const calls = [];
  await promote(Object.fromEntries(['apply','verify','restore','record'].map(name => [name, async () => calls.push(name)])));
  assert.deepEqual(calls, ['apply','verify','record']);
  await assert.rejects(promote({apply:async()=>{}, verify:async()=>{throw new Error('smoke');},
    restore:async()=>{throw new Error('recovery');}, record:async()=>assert.fail('must not record')}),
  error => error instanceof AggregateError && error.errors.length === 2);
});
