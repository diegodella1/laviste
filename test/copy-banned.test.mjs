import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
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
  'aplicado automáticamente',
];

const CONFIRMAR_MARK = '[' + 'CONFIRMAR';
const PUBLIC_BANNED = [
  'OpenAI requerido', 'clave de OpenAI en Configuración', 'clave OpenAI en Configuración',
  'clave OpenAI propia', 'credenciales propias', 'contraseña de este espacio',
  'contraseña del espacio', 'único espacio privado', 'no ofrece cuentas individuales',
  'Ir a Configuración', CONFIRMAR_MARK,
];

const VERDICT_NO_ACTION_LEGACY = 'No necesitás hacer nada';

const USER_FACING = [
  'README.md',
  'public/app.js',
  'public/pulse.js',
  'public/copy.mjs',
  'public/auto.mjs',
  'public/ajustes.mjs',
  'public/tesis-detalle.mjs',
  'public/take-route.mjs',
  'public/novedades.mjs',
  'public/integrations.js',
  'public/admin-fuentes.mjs',
  'public/admin-agent.mjs',
  'public/por-que.mjs',
  ...readdirSync('public').filter(f => f.startsWith('chart-') && f.endsWith('.mjs')).map(f => `public/${f}`),
  'scripts/build-site.mjs',
  'lib/engine.mjs',
  'lib/auth.mjs',
  'lib/route-scope.mjs',
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

test('public pages exclude P0A banned product copy', () => {
  const files = ['scripts/build-site.mjs', ...readdirSync('public').filter(f => f.endsWith('.html')).map(f => `public/${f}`)];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const phrase of PUBLIC_BANNED) {
      assert.ok(!text.includes(phrase), `${file} must not contain «${phrase}»`);
    }
  }
});

const SKIP_DIRS = new Set(['node_modules', '.git', 'work', 'data', '.npm-cache']);

function walkSources(dir, acc = []) {
  for (const name of readdirSync(dir, {withFileTypes: true})) {
    if (SKIP_DIRS.has(name.name)) continue;
    const path = join(dir, name.name);
    if (name.isDirectory()) walkSources(path, acc);
    else if (/\.(mjs|js|md|html|css|json|yml|yaml|txt)$/.test(name.name)) acc.push(path);
  }
  return acc;
}

test('no unresolved CONFIRMAR markers remain in the repo', () => {
  for (const file of walkSources('.')) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!text.includes(CONFIRMAR_MARK), `${file} still has an unresolved marker`);
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
