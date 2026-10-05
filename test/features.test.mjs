import test from 'node:test';
import assert from 'node:assert/strict';
import {iolEnabled} from '../lib/features.mjs';

test('IOL is off by default and can be enabled explicitly', () => {
  assert.equal(iolEnabled({}), false);
  assert.equal(iolEnabled({FEATURE_IOL: '0'}), false);
  assert.equal(iolEnabled({FEATURE_IOL: '1'}), true);
  assert.equal(iolEnabled({FEATURE_IOL: 'true'}), true);
});
