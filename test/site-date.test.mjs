import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatPrivacyUpdatedAt, privacySourceDate} from '../lib/site-date.mjs';

test('privacy updated-at uses Buenos Aires calendar and SITE_UPDATED_AT override', () => {
  assert.equal(
    formatPrivacyUpdatedAt(new Date('2026-10-20T15:00:00.000Z')),
    '20 de octubre de 2026',
  );
  const fromEnv = privacySourceDate({
    env: {SITE_UPDATED_AT: '2026-03-05T12:00:00.000Z'},
    now: () => new Date('2026-10-20T15:00:00.000Z'),
    runGit: () => { throw new Error('git should not run'); },
  });
  assert.equal(formatPrivacyUpdatedAt(fromEnv), '5 de marzo de 2026');
  const dirty = privacySourceDate({
    env: {},
    now: () => new Date('2026-10-20T15:00:00.000Z'),
    runGit: args => (args[0] === 'status' ? ' M scripts/build-site.mjs' : ''),
  });
  assert.equal(dirty.toISOString(), '2026-10-20T15:00:00.000Z');
  const committed = privacySourceDate({
    env: {},
    now: () => new Date('2026-12-01T00:00:00.000Z'),
    runGit: args => (args[0] === 'status' ? '' : '2026-10-20T18:04:00-03:00'),
  });
  assert.equal(formatPrivacyUpdatedAt(committed), '20 de octubre de 2026');
});
