import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const boot = appJs.slice(appJs.indexOf('async function bootVerifyEmail'), appJs.indexOf('function cuentaPage'));
const verifyPage = appJs.slice(appJs.indexOf('function verifyEmailPage'), appJs.indexOf('async function bootVerifyEmail'));
const cuenta = appJs.slice(appJs.indexOf("if (page === 'cuenta')"), appJs.indexOf("} else if (page !== 'verificar-email')"));
const unauth = appJs.slice(appJs.indexOf('async function showUnauthenticated'), appJs.indexOf('function adminAgentPage'));
const guard = boot.slice(0, boot.indexOf('await api'));

test('R-1/N6(b): retry after a network error via the Mails button and the link', () => {
  assert.match(cuenta, /if \(emailVerifyView === 'error'\) emailVerifyOnce = false/);
  assert.doesNotMatch(cuenta, /if \(page === 'cuenta'\) \{\s*emailVerifyOnce = false/);
  assert.match(verifyPage, /href="#\/cuenta\/email"/);
  assert.match(appJs, /if \(page === 'verificar-email'\) void bootVerifyEmail\(\)/);
  assert.match(boot, /await api\('\/email\/verify', \{token\}\)/);
});

test('same-hash: retry after a network error by re-entering the same hash', () => {
  const hashBlock = appJs.slice(appJs.indexOf("window.addEventListener('hashchange'"));
  assert.match(hashBlock, /if \(emailVerifyView === 'error'\) emailVerifyOnce = false/);
  assert.ok(
    hashBlock.indexOf("if (emailVerifyView === 'error') emailVerifyOnce = false")
      < hashBlock.indexOf('} else render();'),
  );
  assert.match(boot, /if \(emailVerifyOnce && emailVerifyToken === token\) return/);
  assert.match(boot, /if \(emailVerifyInflight\) return/);
});

test('R-1/N6(c): one POST per token across re-renders', () => {
  assert.match(appJs, /let emailVerifyInflight = false/);
  assert.match(guard, /if \(emailVerifyInflight\) return/);
  assert.match(guard, /if \(emailVerifyOnce && emailVerifyToken === token\) return/);
  assert.match(guard, /emailVerifyOnce = true[\s\S]*emailVerifyToken = token/);
  assert.match(boot, /emailVerifyView = 'checking'/);
  assert.doesNotMatch(boot, /if \(emailVerifyOnce\) return/);
});

test('R-1: no second POST while in flight and no BAD after OK', () => {
  assert.match(cuenta, /if \(emailVerifyView === 'error'\) emailVerifyOnce = false/);
  assert.doesNotMatch(cuenta, /emailVerifyView === 'checking'[\s\S]*emailVerifyOnce = false/);
  assert.doesNotMatch(cuenta, /emailVerifyView === 'ok'[\s\S]*emailVerifyOnce = false/);
  assert.match(boot, /emailVerifyInflight = true[\s\S]*emailVerifyView = 'checking'/);
  assert.match(boot, /emailVerifyView = 'ok'[\s\S]*finally \{\s*emailVerifyInflight = false/);
  assert.match(verifyPage, /emailVerifyView === 'ok'\s*\? `<p class="form-success"/);
  assert.match(guard, /if \(emailVerifyInflight\) return/);
});

test('GL-1: discard lv_google_return for every e=google* code', () => {
  assert.match(unauth, /e === 'google_cancel' \|\| e === 'google_limit' \|\| \(e && e\.startsWith\('google'\)\)/);
  assert.match(unauth, /discardGoogleReturnHash\(\)/);
  assert.match(unauth, /e === 'google_noaccess'/);
  assert.match(unauth, /e === 'google_password'/);
  assert.match(unauth, /e === 'google_limit'/);
  assert.match(unauth, /e === 'google_cancel'/);
  assert.match(unauth, /e && e\.startsWith\('google'\)/);
  assert.doesNotMatch(unauth, /restoreGoogleReturnHash/);
});
