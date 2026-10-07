import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertHostCanBuild, assertRevision, liveLavisteTagsFromInspect, parseMeminfoKb, promote, unusedLavisteTags,
} from '../scripts/release.mjs';

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

test('meminfo parser reads SwapFree and MemAvailable in kB', () => {
  assert.deepEqual(parseMeminfoKb([
    'MemTotal:        3881996 kB',
    'MemAvailable:     200000 kB',
    'SwapTotal:       2097148 kB',
    'SwapFree:            100 kB',
  ].join('\n')), {memAvailableKb: 200000, swapFreeKb: 100});
  assert.equal(parseMeminfoKb('MemAvailable: 524288 kB\n').swapFreeKb, 0);
});

test('docker build fails fast only when swap and RAM are both below the Pi thresholds', () => {
  const minSwap = 64 * 1024;
  const minMem = 512 * 1024;
  assert.throws(
    () => assertHostCanBuild({memAvailableKb: minMem - 1, swapFreeKb: minSwap - 1}),
    /Host cannot docker build: SwapFree .* below 64Mi and MemAvailable .* below 512Mi/,
  );
  assert.doesNotThrow(() => assertHostCanBuild({memAvailableKb: minMem - 1, swapFreeKb: minSwap}));
  assert.doesNotThrow(() => assertHostCanBuild({memAvailableKb: minMem, swapFreeKb: minSwap - 1}));
  assert.doesNotThrow(() => assertHostCanBuild({memAvailableKb: minMem, swapFreeKb: minSwap}));
});

test('unused laviste tags spare the live image and the SHA about to be built', () => {
  const live = 'laviste:' + 'a'.repeat(40);
  const next = 'laviste:' + 'b'.repeat(40);
  const listed = [live, next, 'laviste:previous', 'laviste:local', 'laviste:<none>'];
  assert.deepEqual(unusedLavisteTags(listed, [live, next]), ['laviste:previous', 'laviste:local']);
  assert.deepEqual(
    liveLavisteTagsFromInspect(
      [{Config: {Image: live}, Image: 'sha256:live'}],
      {'sha256:live': {RepoTags: [live, 'laviste:previous']}},
    ).sort(),
    ['laviste:previous', live].sort(),
  );
});

test('release is recorded only after verification; unsuccessful recovery remains visible', async () => {
  const calls = [];
  await promote(Object.fromEntries(['apply','verify','restore','record'].map(name => [name, async () => calls.push(name)])));
  assert.deepEqual(calls, ['apply','verify','record']);
  await assert.rejects(promote({apply:async()=>{}, verify:async()=>{throw new Error('smoke');},
    restore:async()=>{throw new Error('recovery');}, record:async()=>assert.fail('must not record')}),
  error => error instanceof AggregateError && error.errors.length === 2);
});
