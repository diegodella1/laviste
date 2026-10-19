import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const brandCss = readFileSync('public/brand.css', 'utf8');
const themeCss = readFileSync('public/app-theme.css', 'utf8');
const appJs = readFileSync('public/app.js', 'utf8');

test('desktop sidebar tokens and chrome breakpoints (AL1, AL4, AL16)', () => {
  assert.match(brandCss, /--lv-sidebar:\s*240px/);
  assert.match(brandCss, /--lv-col:\s*880px/);
  assert.match(brandCss, /--lv-col-new:\s*640px/);
  assert.match(brandCss, /--lv-col-take:\s*760px/);
  assert.match(themeCss, /@media \(min-width: 1024px\)/);
  assert.match(themeCss, /@media \(max-width: 1023px\)/);
  assert.equal(themeCss.includes('@media (min-width: 1200px)'), false);
  assert.equal(themeCss.includes('@media (max-width: 1199px)'), false);
  assert.match(themeCss, /\.shell\.shell-col[\s\S]{0,80}max-width:\s*var\(--lv-col, 880px\)/);
  assert.match(themeCss, /\.shell\.shell-new[\s\S]{0,40}max-width:\s*var\(--lv-col-new, 640px\)/);
  assert.match(themeCss, /\.shell\.shell-take[\s\S]{0,40}max-width:\s*var\(--lv-col-take, 760px\)/);
});

test('desktop chrome is a left sidebar and hides the horizontal topbar (AL2, AL5)', () => {
  assert.match(themeCss, /@media \(min-width: 1024px\)[\s\S]*\.topbar \{[\s\S]*width:\s*var\(--lv-sidebar\)/);
  assert.match(themeCss, /@media \(min-width: 1024px\)[\s\S]*\.topbar-inner \{[\s\S]*flex-direction:\s*column/);
  assert.match(themeCss, /@media \(min-width: 1024px\)[\s\S]*\.app-frame \{[\s\S]*margin-left:\s*var\(--lv-sidebar\)/);
  assert.match(appJs, /aria-current="page"/);
  assert.match(appJs, /aria-current="true"/);
  assert.match(appJs, /function isDesktopChrome\(/);
  assert.match(appJs, /matchMedia\('\(min-width: 1024px\)'\)/);
  assert.match(appJs, /function bindChromeBreakpoint\(/);
  assert.ok(!appJs.includes("['#/positions'"), 'Posiciones stay thesis tabs');
  assert.ok(!appJs.includes("['#/novedades'"), 'Novedades stay thesis tabs');
  assert.match(appJs, /PANEL_HOME_HASH, 'Inicio'/);
  assert.ok(!appJs.includes("['/', 'Inicio']"), 'Inicio must stay inside the SPA');
});

test('1E user menu stays at the sidebar foot and opens upward (AL6, AL7)', () => {
  assert.match(themeCss, /@media \(min-width: 1024px\)[\s\S]*\.user-menu-panel \{[\s\S]*bottom:\s*calc\(100% \+ 6px\)/);
  assert.match(themeCss, /@media \(min-width: 1024px\)[\s\S]*\.topbar-right \{[\s\S]*margin-top:\s*auto/);
  assert.match(appJs, /data-user-menu="desktop"/);
  assert.match(appJs, /\[role="menuitem"\]/);
  assert.match(appJs, /setAttribute\('aria-expanded'/);
  assert.ok(!/user-menu-logout[^"]*primary/.test(appJs));
});

test('main fills the frame so the shell can center (AL3)', () => {
  assert.match(themeCss, /\.app-frame > \.main \{\s*flex:\s*1 1 auto;\s*min-width:\s*0;/);
  assert.equal(themeCss.includes('.app-frame.has-rail .main'), false);
  const browser = readFileSync('scripts/browser-test.mjs', 'utf8');
  assert.match(browser, /areaLeft/);
  assert.match(browser, /mainW >= geo\.areaW - 1/);
  assert.ok(!browser.includes('mainMid: (a.left + a.right) / 2'));
});

test('desktop panel, rail and dock stay clear of the sidebar (AL8, AL9, AL15)', () => {
  assert.match(themeCss, /@media \(min-width: 1024px\)[\s\S]*\.lv-scrim \{[\s\S]*left:\s*var\(--lv-sidebar\)/);
  assert.match(themeCss, /@media \(min-width: 1024px\)[\s\S]*\.lv-panel \{ top: 0; \}/);
  assert.match(themeCss, /@media \(min-width: 1024px\)[\s\S]*\.thesis-rail \{[\s\S]*top:\s*0;[\s\S]*height:\s*100dvh/);
  assert.match(themeCss, /@media \(min-width: 1024px\)[\s\S]*\.chat-dock \{[\s\S]*left:\s*var\(--lv-sidebar\)/);
  assert.match(themeCss, /@media \(min-width: 1024px\)[\s\S]*\.app-frame\.has-rail ~ \.chat-dock \{[\s\S]*left:\s*calc\(var\(--lv-sidebar\) \+ 260px\)/);
  assert.match(themeCss, /@media \(min-width: 1024px\)[\s\S]*\.user-menu-panel \{[\s\S]*min-width:\s*0/);
  assert.match(themeCss, /\.topbar \{[\s\S]*z-index:\s*40/);
  assert.equal((themeCss.match(/#FAFAFA/g) || []).length, 0);
});

test('mobile / tablet chrome keeps topbar + drawer under 1024 (AL11, AL14)', () => {
  assert.match(themeCss, /@media \(max-width: 1023px\)[\s\S]*\.topnav \{[\s\S]*inset:\s*var\(--lv-topbar-h, 52px\)/);
  assert.match(themeCss, /@media \(max-width: 1023px\)[\s\S]*\.topnav-toggle \{[\s\S]*display:\s*inline-flex/);
  assert.match(themeCss, /@media \(max-width: 1023px\)[\s\S]*\.user-menu \{ display: none/);
  assert.match(appJs, /if \(!bar \|\| isDesktopChrome\(\)\)/);
});

test('hotfix delta does not import SuperTake marketing copy (AL13)', () => {
  for (const [label, text] of [['brand.css', brandCss], ['app-theme.css', themeCss], ['app.js', appJs]]) {
    assert.ok(!/Autopilot/i.test(text), `${label} Autopilot`);
    assert.ok(!/Make it real/i.test(text), `${label} Make it real`);
    assert.ok(!/broker CTA/i.test(text), `${label} broker CTA`);
  }
});
