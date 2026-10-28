import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const HOME = 'public/home.html';
const CSS = ['public/brand.css', 'public/site.css', 'public/terminal.css'];

function homeHtml() {
  return readFileSync(HOME, 'utf8');
}

test('landing home is vanilla Clarity, not Tailwind CDN', () => {
  execFileSync(process.execPath, ['scripts/build-site.mjs'], {env: {...process.env, FEATURE_IOL: '0'}});
  const html = homeHtml();
  assert.equal(/cdn\.tailwindcss|tailwindcss\.com/i.test(html), false);
  assert.match(html, /href="\/brand\.css"/);
  assert.match(html, /href="\/site\.css"/);
  assert.match(html, /href="\/terminal\.css"/);
  assert.match(html, /class="landing"/);
});

test('landing keeps live nav and rejects Codex labels', () => {
  const html = homeHtml();
  const nav = html.slice(html.indexOf('id="site-navigation"'), html.indexOf('</nav>'));
  assert.match(nav, />Inicio</);
  assert.match(nav, />Cómo funciona</);
  assert.match(nav, />Acerca de</);
  assert.match(nav, />Mi espacio /);
  assert.match(nav, /href="\/app"/);
  assert.equal(nav.includes('Metodología'), false);
  assert.equal(nav.includes('Tesis destacadas'), false);
  assert.equal(nav.includes('Espacio Privado'), false);
});

test('landing keeps pedagogical IA, ethics, and no fake metrics', () => {
  const html = homeHtml();
  assert.match(html, /De una idea a una cartera de práctica/);
  assert.match(html, /Empezar con una tesis/);
  assert.match(html, /class="button" href="\/app"/);
  assert.match(html, /data-pulse="full"/);
  assert.match(html, /id="preguntas"/);
  assert.match(html, /¿Qué hago si olvido mi contraseña\?/);
  assert.match(html, /dinero de práctica/i);
  assert.match(html, /precios demorados/i);
  assert.match(html, /sin órdenes reales/i);
  assert.match(html, /no es asesoramiento/i);
  assert.equal(/ficticios/i.test(html), false);
  for (const banned of ['+18,4%', '+18.4%', '5.000.000', '1.184.200', '+11,2%', '+24,8%', '+22,8%']) {
    assert.equal(html.includes(banned), false, banned);
  }
});

test('shared marketing buttons stay slate primary, 8px controls', () => {
  const css = CSS.map(file => readFileSync(file, 'utf8')).join('\n');
  assert.match(css, /--lv-ink:#0F172A/);
  assert.match(css, /--lv-accent:#3B82F6/);
  assert.match(css, /--lv-accent-text:#2563EB/);
  assert.match(css, /--lv-r-ctrl:8px/);
  assert.match(css, /--lv-r:16px/);
  assert.match(css, /\.button\{[^}]*background:var\(--lv-ink\)/);
  assert.match(css, /\.button\{[^}]*border-radius:var\(--lv-r-ctrl\)/);
  assert.equal(/cdn\.tailwindcss|tailwindcss\.com/i.test(css), false);
});
