import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {templates} from '../lib/engine.mjs';

const BANNED = [
  'No necesitás hacer nada',
  'OpenAI puede equivocarse',
  'Activar simulación',
  'precios ficticios',
  'La IA sale de la nube',
  'vs Índice',
  'vs. índice',
];

const VERDICT_NO_ACTION_LEGACY = 'No necesitás hacer nada';

const USER_FACING = [
  'public/app.js',
  'public/pulse.js',
  'public/copy.mjs',
  'public/integrations.js',
  'public/por-que.mjs',
  ...readdirSync('public').filter(f => f.startsWith('chart-') && f.endsWith('.mjs')).map(f => `public/${f}`),
  'scripts/build-site.mjs',
  'lib/engine.mjs',
  'lib/timeline.mjs',
  'public/timeline.mjs',
  'server.mjs',
];

function scanText(label, text, {allowLegacyVerdict = false} = {}) {
  let haystack = text;
  if (allowLegacyVerdict && haystack.includes(VERDICT_NO_ACTION_LEGACY)) {
    haystack = haystack.replaceAll(VERDICT_NO_ACTION_LEGACY, '');
  }
  for (const phrase of BANNED) {
    if (phrase === VERDICT_NO_ACTION_LEGACY && allowLegacyVerdict) continue;
    assert.ok(!haystack.includes(phrase), `${label} must not contain «${phrase}»`);
  }
}

test('user-facing sources exclude banned legacy copy', () => {
  for (const file of USER_FACING) {
    scanText(file, readFileSync(file, 'utf8'), {allowLegacyVerdict: file === 'public/copy.mjs'});
  }
});

test('generated public HTML excludes banned legacy copy', () => {
  execFileSync('node', ['scripts/build-site.mjs'], {env: {...process.env, FEATURE_IOL: '0'}});
  for (const file of readdirSync('public').filter(f => f.endsWith('.html'))) {
    scanText(`public/${file}`, readFileSync('public/' + file, 'utf8'));
  }
});

test('templates and home demo sample omit legacy cloud / NVDA thesis', () => {
  const appJs = readFileSync('public/app.js', 'utf8');
  assert.ok(!appJs.includes('La IA sale de la nube'));
  assert.ok(!appJs.includes("'NVDA'"));
  assert.ok(appJs.includes('homeDemoSample'));
  assert.ok(appJs.includes('Energía en Vaca Muerta'));
  for (const t of templates) {
    assert.notEqual(t.title, 'La IA sale de la nube', 'engine template title');
    assert.ok(!t.title.toLowerCase().includes('nube'), `template «${t.title}» must not reference nube`);
    for (const h of t.holdings) {
      assert.notEqual(h.ticker, 'NVDA', `template «${t.title}» must not hold NVDA`);
    }
  }
});
