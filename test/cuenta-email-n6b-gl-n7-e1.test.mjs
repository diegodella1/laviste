import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../public/app-theme.css', import.meta.url), 'utf8');
const boot = appJs.slice(appJs.indexOf('async function bootVerifyEmail'), appJs.indexOf('function cuentaPage'));
const verifyPage = appJs.slice(appJs.indexOf('function verifyEmailPage'), appJs.indexOf('async function bootVerifyEmail'));
const cuenta = appJs.slice(appJs.indexOf("if (page === 'cuenta')"), appJs.indexOf("} else if (page !== 'verificar-email')"));
const fn = appJs.slice(appJs.indexOf('const GOOGLE_RETURN_KEY'), appJs.indexOf('function hydrateLoginExtras'));
const unauth = appJs.slice(appJs.indexOf('async function showUnauthenticated'), appJs.indexOf('function adminAgentPage'));
const login = appJs.slice(appJs.indexOf("if (f.id === 'login')"), appJs.indexOf("if (f.id === 'password-form')"));

test('N6(b): retry after network failure POSTs again via the Mails button', () => {
  assert.match(cuenta, /emailVerifyOnce = false/);
  assert.match(verifyPage, /href="#\/cuenta\/email"/);
  assert.match(appJs, /if \(page === 'verificar-email'\) void bootVerifyEmail\(\)/);
});

test('N6(b): retry after network failure POSTs again via the link', () => {
  assert.match(cuenta, /emailVerifyOnce = false/);
  assert.match(boot, /if \(emailVerifyOnce && emailVerifyToken === token\) return/);
  assert.match(boot, /await api\('\/email\/verify', \{token\}\)/);
  assert.match(appJs, /if \(page === 'verificar-email'\) void bootVerifyEmail\(\)/);
  assert.match(verifyPage, /href="#\/cuenta\/email"/);
});

test('N6(b): one POST per token on re-render', () => {
  const guard = boot.slice(0, boot.indexOf('await api'));
  assert.match(guard, /if \(emailVerifyOnce && emailVerifyToken === token\) return/);
  assert.match(guard, /emailVerifyOnce = true[\s\S]*emailVerifyToken = token/);
  assert.match(boot, /emailVerifyView = 'checking'/);
  assert.doesNotMatch(boot, /if \(emailVerifyOnce\) return/);
});

test('N7: bootVerifyEmail renders WORKING when switching to checking', () => {
  assert.match(boot, /emailVerifyView = 'checking';\s*render\(\);\s*try \{\s*await api\('\/email\/verify'/);
  assert.match(verifyPage, /MAILS_VERIFY_WORKING/);
  assert.match(verifyPage, /emailVerifyView === 'ok'/);
  assert.match(verifyPage, /emailVerifyView === 'error'/);
});

test('G-L: google_cancel and google_limit remove lv_google_return without consuming it', () => {
  assert.match(fn, /function discardGoogleReturnHash\(\)/);
  assert.match(fn, /try \{ sessionStorage\.removeItem\(GOOGLE_RETURN_KEY\); \} catch \{ \/\* ignore \*\/ \}/);
  assert.match(unauth, /e === 'google_cancel' \|\| e === 'google_limit'/);
  assert.match(unauth, /discardGoogleReturnHash\(\)/);
  assert.doesNotMatch(unauth, /restoreGoogleReturnHash/);
  assert.doesNotMatch(unauth, /history\.replaceState\(history\.state, '', '\/app' \+ next\)/);
});

test('G-L: password login removes the key and does not consume it afterwards', () => {
  assert.match(login, /discardGoogleReturnHash\(\)/);
  assert.ok(login.indexOf('discardGoogleReturnHash()') < login.indexOf("await api('/login'"));
  assert.doesNotMatch(login, /restoreGoogleReturnHash/);
  assert.doesNotMatch(login, /history\.replaceState\(history\.state, '', '\/app' \+ next\)/);
});

test('E-1: .account-page .callout.error uses border-left 3px like amber', () => {
  const err = theme.slice(theme.indexOf('.account-page .callout.error'), theme.indexOf('.account-page .callout.amber'));
  const amber = theme.slice(theme.indexOf('.account-page .callout.amber'), theme.indexOf('.account-page .mails-section .opt-grid'));
  assert.match(err, /border-left:\s*3px solid var\(--lv-error\)/);
  assert.doesNotMatch(err, /border-color:\s*var\(--lv-error\)/);
  assert.doesNotMatch(err, /#[0-9A-Fa-f]{3,8}/);
  assert.match(amber, /border-left:\s*3px solid var\(--lv-warning\)/);
});
