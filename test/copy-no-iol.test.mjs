import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {settingsView} from '../public/integrations.js';
import {PRACTICE_FOOTER} from '../lib/copy.mjs';

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

test('practice footer line is present on static pages and app shell source', () => {
  execFileSync('node', ['scripts/build-site.mjs'], {env: {...process.env, FEATURE_IOL: '0'}});
  for (const file of ['home.html', 'how.html', 'about.html', 'privacy.html', 'scope.html']) {
    const html = readFileSync('public/' + file, 'utf8');
    assert.ok(html.includes(PRACTICE_FOOTER), `${file} missing practice footer`);
    assert.ok(!/ficticios/i.test(html), `${file} must not mention precios ficticios`);
  }
  const app = readFileSync('public/app.js', 'utf8');
  assert.ok(app.includes("from './copy.mjs'"), 'app.js must import practice footer');
  assert.ok(readFileSync('public/copy.mjs', 'utf8').includes(PRACTICE_FOOTER));
  assert.ok(!/precios ficticios/i.test(app), 'app.js must not mention precios ficticios');
});

test('generated static HTML files never contain precios ficticios', () => {
  execFileSync('node', ['scripts/build-site.mjs'], {env: {...process.env, FEATURE_IOL: '0'}});
  for (const file of readdirSync('public').filter(f => f.endsWith('.html'))) {
    const html = readFileSync('public/' + file, 'utf8');
    assert.ok(!/ficticios/i.test(html), `${file} contains ficticios`);
  }
});
