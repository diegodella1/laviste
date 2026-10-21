import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEF_SHORT as fromTiny} from '../public/def-short.mjs';
import {DEF_SHORT as fromCopy} from '../public/copy.mjs';
import {DEF_SHORT as fromLib} from '../lib/copy.mjs';

const appJs = readFileSync('public/app.js', 'utf8');
const pulseJs = readFileSync('public/pulse.js', 'utf8');
const indexHtml = readFileSync('public/index.html', 'utf8');
const criticalCss = readFileSync('public/app-critical.css', 'utf8');
const checkYml = readFileSync('.github/workflows/check.yml', 'utf8');
const perfYml = readFileSync('.github/workflows/perf.yml', 'utf8');

test('DEF_SHORT lives in a tiny module and is re-exported', () => {
  assert.equal(fromTiny, fromCopy);
  assert.equal(fromTiny, fromLib);
  assert.match(fromTiny, /cartera de práctica en ARS/);
  const tiny = readFileSync('public/def-short.mjs', 'utf8');
  assert.ok(tiny.length < 800, 'def-short.mjs must stay tiny');
});

test('app.js lazy-imports route modules with relative specifiers', () => {
  for (const spec of [
    './admin-agent.mjs', './admin-fuentes.mjs', './ajustes.mjs',
    './tesis-detalle.mjs', './chart-suizo.mjs', './integrations.js',
  ]) {
    assert.match(appJs, new RegExp(`loadLazy\\('${spec.replace('.', '\\.')}'`));
    assert.doesNotMatch(appJs, new RegExp(`from '${spec.replace('.', '\\.')}'`));
  }
  assert.match(appJs, /importOrReload/);
  assert.match(appJs, /syncRevisionFromHealth/);
  assert.match(appJs, /new URL\('\.\/styles\.css', import\.meta\.url\)/);
  assert.match(appJs, /new URL\('\.\/app-theme\.css', import\.meta\.url\)/);
  assert.match(appJs, /method="post" action="\/app"/);
  assert.match(appJs, /hydrateLoginExtras/);
  assert.match(appJs, /armLoginSubmit/);
  assert.match(appJs, /data-boot/);
  assert.match(appJs, /AbortController/);
  assert.match(appJs, /timeoutMs:\s*SESSION_BOOT_MS/);
  assert.match(appJs, /retry-boot/);
});

test('index.html paints login without blocking app-theme or session', () => {
  assert.match(indexHtml, /class="login-layout"/);
  assert.match(indexHtml, /id="login"/);
  assert.match(indexHtml, /method="post"/);
  assert.match(indexHtml, /action="\/app"/);
  assert.match(indexHtml, /type="submit" disabled/);
  assert.match(indexHtml, /login-google-slot/);
  assert.match(indexHtml, /<!--lv-boot-->/);
  assert.match(indexHtml, /<!--\/lv-boot-->/);
  assert.match(indexHtml, /Tu espacio de práctica\./);
  assert.match(indexHtml, /A partir de tu tesis, La Viste analiza mercado/);
  assert.match(indexHtml, /¿Olvidaste tu contraseña\?/);
  assert.match(indexHtml, /<!--lv-critical-css-->/);
  assert.match(indexHtml, /rel="modulepreload" href="\/app\.js"/);
  assert.match(indexHtml, /rel="modulepreload" href="\/rev\.mjs"/);
  assert.doesNotMatch(indexHtml, /rel="modulepreload" href="\/copy\.mjs"/);
  assert.doesNotMatch(indexHtml, /rel="modulepreload" href="\/auto\.mjs"/);
  assert.doesNotMatch(indexHtml, /href="\/app-theme\.css"/);
  assert.doesNotMatch(indexHtml, /href="\/styles\.css"/);
  assert.doesNotMatch(indexHtml, /onload=/);
  assert.doesNotMatch(indexHtml, /data-boot=/);
});

test('critical CSS covers login and not admin/chart surfaces', () => {
  assert.match(criticalCss, /\.login-layout/);
  assert.match(criticalCss, /\.login-story/);
  assert.match(criticalCss, /\.practice-footer/);
  assert.match(criticalCss, /\[data-google\]\s+\.login-google-slot/);
  assert.match(criticalCss, /min-height:\s*92px/);
  assert.match(criticalCss, /\.boot-session/);
  assert.doesNotMatch(criticalCss, /\.admin-agent/);
  assert.doesNotMatch(criticalCss, /\.chart-host/);
  assert.doesNotMatch(criticalCss, /\.lv-panel/);
});

test('pulse fetches health and session in parallel and defers timeline', () => {
  assert.match(pulseJs, /from '\.\/def-short\.mjs'/);
  assert.match(pulseJs, /Promise\.all\(\[healthP, sessionP\]\)/);
  assert.match(pulseJs, /importOrReload\('\.\/timeline\.mjs'\)/);
  assert.match(pulseJs, /importOrReload\('\.\/format\.mjs'\)/);
  assert.doesNotMatch(pulseJs, /from '\.\/copy\.mjs'/);
  assert.doesNotMatch(pulseJs, /from '\.\/timeline\.mjs'/);
});

test('Lighthouse CI is ubuntu-latest and does not attach to the Pi deploy job', () => {
  assert.match(perfYml, /runs-on:\s*ubuntu-latest/);
  assert.match(perfYml, /npx --yes @lhci\/cli@0\.14 autorun/);
  assert.match(perfYml, /GZIP_STATIC:\s*'1'/);
  assert.doesNotMatch(perfYml, /runs-on:\s*\[self-hosted/);
  assert.doesNotMatch(perfYml, /laviste-production/);
  assert.doesNotMatch(checkYml, /lhci/);
  assert.doesNotMatch(checkYml, /lighthouse/i);
  const lhci = readFileSync('lighthouserc.json', 'utf8');
  assert.match(lhci, /largest-contentful-paint/);
  assert.match(lhci, /2500/);
  assert.match(lhci, /categories:performance/);
});
