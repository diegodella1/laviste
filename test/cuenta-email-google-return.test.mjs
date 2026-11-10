import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const googleAuth = readFileSync(new URL('../lib/google-auth.mjs', import.meta.url), 'utf8');
const fn = appJs.slice(appJs.indexOf('const GOOGLE_RETURN_KEY'), appJs.indexOf('function hydrateLoginExtras'));
const boot = appJs.slice(appJs.indexOf('async function boot()'), appJs.indexOf('\nboot();'));

test('Google return: the allowlisted verify hash is saved and restored', () => {
  assert.match(fn, /const GOOGLE_RETURN_KEY = 'lv_google_return'/);
  assert.match(fn, /function googleReturnHash\(raw\)/);
  assert.ok(fn.includes('/^#\\/verificar-email\\?token=[A-Za-z0-9_-]+$/'));
  assert.match(fn, /sessionStorage\.setItem\(GOOGLE_RETURN_KEY, next\)/);
  assert.match(fn, /history\.replaceState\(history\.state, '', '\/app' \+ next\)/);
  assert.match(appJs, /id="login-google"/);
  assert.match(appJs, /href="\/api\/auth\/google\/start"/);
  assert.match(appJs, /e\.target\.closest\('#login-google'\)[\s\S]*rememberGoogleReturnHash\(\)/);
});

test('Google return: a non-allowlisted hash is ignored on save and on restore', () => {
  assert.ok(fn.includes('if (!/^#\\/verificar-email\\?token=[A-Za-z0-9_-]+$/.test(value)) return null'));
  assert.match(fn, /const next = googleReturnHash\(location\.hash\);\s*if \(next\) sessionStorage\.setItem/);
  assert.match(fn, /const next = googleReturnHash\(raw\);\s*if \(next\) history\.replaceState/);
  assert.doesNotMatch(fn, /safePanelNext/);
  assert.doesNotMatch(fn, /#\/takes|#\/cuenta|#\/login/);
});

test('Google return: the sessionStorage key is removed after use', () => {
  assert.match(fn, /sessionStorage\.getItem\(GOOGLE_RETURN_KEY\);\s*sessionStorage\.removeItem\(GOOGLE_RETURN_KEY\);/);
  assert.match(boot, /restoreGoogleReturnHash\(\)/);
});

test('Google return: verification runs after a Google login', () => {
  const auth = boot.slice(boot.indexOf('if (!session.authenticated)'), boot.indexOf('await loadAppState({quiet: false})') + 40);
  assert.ok(auth.indexOf('restoreGoogleReturnHash()') < auth.indexOf('await loadLoggedInModules()'));
  assert.ok(auth.indexOf('restoreGoogleReturnHash()') < auth.indexOf('await loadAppState({quiet: false})'));
  assert.match(appJs, /if \(page === 'verificar-email'\) void bootVerifyEmail\(\)/);
  assert.match(googleAuth, /http-equiv="refresh" content="0;url=\/app"/);
  assert.equal(googleAuth.includes('verificar-email'), false);
});
