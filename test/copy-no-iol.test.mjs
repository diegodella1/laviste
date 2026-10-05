import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {settingsView} from '../public/integrations.js';

test('settings HTML has no IOL when feature is off', () => {
  const html = settingsView({config: {iolEnabled: false, aiConfigured: false, vaultReady: true, model: 'gpt-5-mini', dailyLimit: 30, newsLimit: 10, openaiStatus: {}}, consumption: []});
  assert.ok(!/IOL/i.test(html));
});

test('built public site has no IOL when FEATURE_IOL=0', () => {
  execFileSync('node', ['scripts/build-site.mjs'], {env: {...process.env, FEATURE_IOL: '0'}});
  const scope = readFileSync('public/scope.html', 'utf8');
  const privacy = readFileSync('public/privacy.html', 'utf8');
  const how = readFileSync('public/how.html', 'utf8');
  assert.ok(!/IOL/i.test(scope));
  assert.ok(!/IOL/i.test(how));
  assert.ok(!/ficticios/i.test(scope));
  assert.ok(/demorad/i.test(scope));
});
