import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const HOME = 'public/home.html';
const HOW = 'public/how.html';
const ABOUT = 'public/about.html';
const CSS = ['public/brand.css', 'public/site.css', 'public/terminal.css', 'public/prelogin.css'];

function html(file) {
  return readFileSync(file, 'utf8');
}

test('pre-login pages are vanilla Clarity, not Tailwind CDN', () => {
  execFileSync(process.execPath, ['scripts/build-site.mjs'], {env: {...process.env, FEATURE_IOL: '0'}});
  for (const file of [HOME, HOW, ABOUT, 'public/privacy.html', 'public/scope.html']) {
    const page = html(file);
    assert.equal(/cdn\.tailwindcss|tailwindcss\.com/i.test(page), false, file);
    assert.match(page, /href="\/brand\.css"/);
    assert.match(page, /href="\/prelogin\.css"/);
    assert.match(page, /PRÁCTICA · ARS/);
    assert.match(page, /class="button btn primary" href="\/app"/);
    assert.match(page, /class="button inverse btn inverse" href="\/app"/);
  }
  assert.match(html(HOME), /class="landing"/);
});

test('shared chrome uses live nav and rejects Codex labels', () => {
  const page = html(HOME);
  const nav = page.slice(page.indexOf('id="site-navigation"'), page.indexOf('</nav>'));
  assert.match(nav, />Inicio</);
  assert.match(nav, />Cómo funciona</);
  assert.match(nav, />Acerca</);
  assert.equal(nav.includes('>Acerca de<'), false);
  assert.match(nav, />Mi espacio /);
  assert.match(nav, /href="\/app"/);
  assert.equal(nav.includes('Metodología'), false);
  assert.equal(nav.includes('Tesis destacadas'), false);
  assert.equal(nav.includes('Espacio Privado'), false);
});

test('home keeps pedagogical IA, ethics, and no fake metrics', () => {
  const page = html(HOME);
  assert.match(page, /De una idea a una cartera de práctica/);
  assert.match(page, /Empezar con una tesis/);
  assert.match(page, /Cuatro cosas\. Claras\./);
  assert.match(page, /class="button btn primary" href="\/app"/);
  assert.match(page, /data-pulse="full"/);
  assert.match(page, /id="preguntas"/);
  assert.match(page, /¿Qué hago si olvido mi contraseña\?/);
  assert.match(page, /dinero de práctica/i);
  assert.match(page, /precios demorados/i);
  assert.match(page, /sin órdenes reales/i);
  assert.match(page, /no es asesoramiento/i);
  assert.equal(/ficticios/i.test(page), false);
  for (const banned of ['+18,4%', '+18.4%', '5.000.000', '1.184.200', '+11,2%', '+24,8%', '+22,8%']) {
    assert.equal(page.includes(banned), false, banned);
  }
});

test('cómo funciona and acerca follow the Clarity pack mocks', () => {
  const how = html(HOW);
  assert.match(how, /Una idea\. Una cartera\. Un seguimiento\./);
  assert.match(how, /class="rail"/);
  assert.match(how, /id="idea"/);
  assert.match(how, /id="propuesta"/);
  assert.match(how, /id="practica"/);
  assert.match(how, /id="seguimiento"/);
  assert.match(how, /id="escenarios"/);
  assert.match(how, /class="edu"/);
  assert.match(how, /desvío en pp/);
  assert.match(how, /Tu cuenta, tu espacio\./);
  assert.equal(how.includes('data-example'), false);

  const about = html(ABOUT);
  assert.match(about, /Análisis a partir de tu tesis/);
  assert.match(about, /Entrenar el criterio antes de tocar dinero real/);
  assert.match(about, /class="grid g3 cmp"/);
  assert.match(about, /Diego Dell&apos;Agostino/);
  assert.equal(about.includes('sim-compare'), false);
  assert.equal(about.includes('about-steps'), false);
});

test('shared marketing buttons stay slate primary, 8px controls', () => {
  const css = CSS.map(file => readFileSync(file, 'utf8')).join('\n');
  assert.match(css, /--lv-ink:#0F172A/);
  assert.match(css, /--lv-primary:#0F172A/);
  assert.match(css, /--lv-accent:#3B82F6/);
  assert.match(css, /--lv-accent-text:#2563EB/);
  assert.match(css, /--lv-r-ctrl:8px/);
  assert.match(css, /--lv-r:16px/);
  assert.match(css, /\.button\{[^}]*background:var\(--lv-ink\)/);
  assert.match(css, /\.btn\.primary,\.button\{[^}]*background:var\(--lv-primary\)/);
  assert.match(css, /\.button\{[^}]*border-radius:var\(--lv-r-ctrl\)/);
  assert.equal(/cdn\.tailwindcss|tailwindcss\.com/i.test(css), false);
  assert.equal(/#2563EB[^;]*cta|#2563EB.*background:\s*#2563EB/i.test(css), false);
});

test('creative re-PASS P0/P1: glow stacking, ink wordmark, centered eyebrows, stacked head-split', () => {
  const css = readFileSync('public/prelogin.css', 'utf8');
  assert.match(css, /\.page-hero>\.wrap\{position:relative;z-index:1\}/);
  assert.match(css, /\.wordmark>span:not\(\.mark\)\{color:var\(--lv-ink\)\}/);
  assert.match(css, /\.head-c \.eyebrow,\.closing \.eyebrow/);
  assert.match(css, /\.head-split\{flex-direction:column;align-items:flex-start\}/);
  const appJs = readFileSync('public/app.js', 'utf8');
  const index = readFileSync('public/index.html', 'utf8');
  assert.equal(appJs.includes('brand-dot period'), false);
  assert.equal(index.includes('brand-dot period'), false);
  assert.match(appJs, /class="brand-dot"/);
});

test('UX blockers: es-AR percent, inert demos, single acerca lead, 44px header CTA', () => {
  const home = html(HOME);
  const how = html(HOW);
  const about = html(ABOUT);
  const css = readFileSync('public/prelogin.css', 'utf8');
  assert.equal((home.match(/\u202F%/g) || []).length, 11);
  assert.equal((how.match(/\u202F%/g) || []).length, 5);
  assert.doesNotMatch(home, /\d%/);
  assert.doesNotMatch(how, /\d%/);
  assert.doesNotMatch(how, /<button[^>]*>Activar en práctica/);
  assert.doesNotMatch(how, /<button[^>]*>Revisar ahora/);
  assert.match(how, /aria-hidden="true">Activar en práctica/);
  assert.match(how, /aria-hidden="true">Revisar ahora/);
  assert.equal(about.split('class="lead').length - 1, 2);
  assert.doesNotMatch(about, /Un espacio privado para practicar inversiones con criterio\. A partir de tu tesis/);
  assert.match(css, /\.site-nav \.button,\.site-nav \.btn\.primary\{[^}]*min-height:44px/);
  const critical = readFileSync('public/app-critical.css', 'utf8');
  assert.match(critical, /\.pw-wrap/);
  assert.match(critical, /\.pw-toggle/);
  assert.match(readFileSync('public/index.html', 'utf8'), /aria-label="Mostrar Contraseña"/);
});
