import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const boot = appJs.slice(appJs.indexOf('async function bootVerifyEmail'), appJs.indexOf('function cuentaPage'));
const render = appJs.slice(appJs.indexOf('} else if (page !== \'verificar-email\')'), appJs.indexOf('if (page === \'verificar-email\') void bootVerifyEmail()') + 60);

test('N6: a second valid link in the same tab POSTs again (token-keyed guard)', () => {
  assert.match(boot, /const token = hashQuery\(\)\.get\('token'\) \|\| hashQuery\(\)\.get\('t'\) \|\| ''/);
  assert.match(boot, /if \(emailVerifyOnce && emailVerifyToken === token\) return/);
  assert.match(boot, /emailVerifyOnce = true/);
  assert.match(boot, /emailVerifyToken = token/);
  assert.match(boot, /await api\('\/email\/verify', \{token\}\)/);
  assert.doesNotMatch(boot, /if \(emailVerifyOnce\) return/);
  assert.match(appJs, /let emailVerifyToken = ''/);
});

test('N6: retry after a network failure POSTs again when re-entering #/verificar-email', () => {
  assert.match(render, /page !== 'verificar-email'\) \{\s*resetAccountState\(\);\s*emailVerifyOnce = false;/);
  assert.match(appJs, /if \(page === 'verificar-email'\) void bootVerifyEmail\(\)/);
});

test('N6: the same token does not POST twice on re-render', () => {
  const guard = boot.slice(0, boot.indexOf('await api'));
  assert.match(guard, /if \(emailVerifyOnce && emailVerifyToken === token\) return/);
  assert.match(guard, /emailVerifyOnce = true[\s\S]*emailVerifyToken = token/);
  assert.match(boot, /emailVerifyView = 'error'/);
});
