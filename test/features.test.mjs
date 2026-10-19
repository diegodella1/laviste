import test from 'node:test';
import assert from 'node:assert/strict';
import {iolEnabled, autoSimEnabled} from '../lib/features.mjs';

test('IOL is off by default and can be enabled explicitly', () => {
  assert.equal(iolEnabled({}), false);
  assert.equal(iolEnabled({FEATURE_IOL: '0'}), false);
  assert.equal(iolEnabled({FEATURE_IOL: '1'}), true);
  assert.equal(iolEnabled({FEATURE_IOL: 'true'}), true);
});

test('FEATURE_AUTO_SIM is off by default and can be enabled explicitly', () => {
  assert.equal(autoSimEnabled({}), false);
  assert.equal(autoSimEnabled({FEATURE_AUTO_SIM: '0'}), false);
  assert.equal(autoSimEnabled({FEATURE_AUTO_SIM: '1'}), true);
  assert.equal(autoSimEnabled({FEATURE_AUTO_SIM: 'true'}), true);
});
