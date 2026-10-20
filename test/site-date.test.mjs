import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PRIVACY_UPDATED_AT, PRIVACY_COPY_HASH,
  formatPrivacyUpdatedAt, privacyCopyFingerprint,
} from '../lib/site-date.mjs';

test('privacy updated-at is a pinned YYYY-MM-DD literal', () => {
  assert.match(PRIVACY_UPDATED_AT, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(formatPrivacyUpdatedAt(PRIVACY_UPDATED_AT), '20 de octubre de 2026');
  assert.equal(formatPrivacyUpdatedAt('2026-03-05'), '5 de marzo de 2026');
});

test('privacy copy hash must be bumped with the /privacidad template', () => {
  const source = readFileSync('scripts/build-site.mjs', 'utf8');
  assert.equal(
    privacyCopyFingerprint(source),
    PRIVACY_COPY_HASH,
    'scripts/build-site.mjs privacy copy changed; bump PRIVACY_UPDATED_AT and PRIVACY_COPY_HASH',
  );
  const privacy = readFileSync('public/privacy.html', 'utf8');
  assert.ok(privacy.includes(`Actualizada el ${formatPrivacyUpdatedAt(PRIVACY_UPDATED_AT)}`));
});
