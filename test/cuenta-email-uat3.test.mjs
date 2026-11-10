import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as copy from '../public/copy.mjs';

test('N4: #email-save-error is a persistent alert, hidden when empty', () => {
  const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const fn = appJs.slice(appJs.indexOf('function mailsErrorHtml'), appJs.indexOf('function showMailsControlError'));
  assert.doesNotMatch(fn, /if \(!mailsSaveError[^)]*\) return ''/);
  assert.match(fn, /holdId \? ' id="email-save-error"'/);
  assert.match(fn, /holdId \? ' role="alert"'/);
  assert.match(fn, /\$\{show \? '' : ' hidden'\}/);
  assert.match(appJs, /mailsErrorHtml\('top'\)/);
  assert.match(appJs, /mailsErrorHtml\('trades'\)/);
  assert.match(appJs, /mailsErrorHtml\('pausa'\)/);
  assert.match(appJs, /mailsErrorHtml\('digest'\)/);
});

test('N5: network and 5xx stay on the fieldset that failed, including pausas', () => {
  const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const save = appJs.slice(appJs.indexOf('async function saveMailsPrefs'), appJs.indexOf('function queueMailsSave'));
  assert.match(save, /err\.network \|\| err\.code === 'timeout' \|\| err\.code === 'network'[\s\S]*MAILS_ERR_NETWORK/);
  assert.doesNotMatch(save, /MAILS_ERR_NETWORK;\s*mailsSaveErrorAt = 'top'/);
  assert.match(save, /else mailsSaveError = MAILS_ERR_GENERIC/);
  assert.doesNotMatch(save, /MAILS_ERR_GENERIC;\s*mailsSaveErrorAt = 'top'/);
  assert.match(appJs, /box\.name === 'mails-pausa'[\s\S]*mailsSaveErrorAt = 'pausa'/);
  assert.match(save, /if \(mailsSaveError\) \{\s*const err = document\.getElementById\('email-save-error'\);\s*if \(err\) err\.scrollIntoView\(\{block: 'nearest'\}\)/);
});

test('§3.9 MAILS_VERIFY_WORKING and MAILS_VERIFY_BAD match the spec', () => {
  assert.equal(copy.MAILS_VERIFY_WORKING, 'Verificando tu correo…');
  assert.equal(copy.MAILS_VERIFY_WORKING.codePointAt(copy.MAILS_VERIFY_WORKING.length - 1), 0x2026);
  assert.equal(
    copy.MAILS_VERIFY_BAD,
    'No pudimos verificar tu correo con este enlace: puede haber vencido o ya estar usado. Si en Mails sigue sin verificar, pedí uno nuevo ahí.',
  );
  const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const page = appJs.slice(appJs.indexOf('function verifyEmailPage'), appJs.indexOf('async function bootVerifyEmail'));
  assert.match(page, /MAILS_VERIFY_WORKING/);
  assert.match(page, /MAILS_VERIFY_BAD/);
});
