import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const theme = readFileSync(new URL('../public/app-theme.css', import.meta.url), 'utf8');
const brand = readFileSync(new URL('../public/brand.css', import.meta.url), 'utf8');
const critical = readFileSync(new URL('../public/app-critical.css', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('D-1: .form-alert is 14px and --lv-error-text is #B91C1C, without an icon', () => {
  const alert = theme.slice(theme.indexOf('.form-alert:not(:empty)'), theme.indexOf('.form-alert:not(:empty)') + 160);
  assert.match(alert, /font-size:\s*14px/);
  assert.doesNotMatch(alert, /font-size:\s*13px/);
  assert.match(brand, /--lv-error-text:#B91C1C;/);
  assert.match(critical, /--lv-error-text:#B91C1C;/);
  assert.doesNotMatch(brand, /--lv-error-text:#DC2626;/);
  assert.doesNotMatch(critical, /--lv-error-text:#DC2626;/);
  assert.doesNotMatch(alert, /::before|::after|content:\s*['"]/);
});

test('D-2: verify-bad wraps MAILS_VERIFY_BAD in .callout.error and keeps the Mails button', () => {
  const page = appJs.slice(appJs.indexOf('function verifyEmailPage'), appJs.indexOf('async function bootVerifyEmail'));
  assert.match(page, /emailVerifyView === 'error'\s*\? `<div class="callout error" role="alert">\$\{esc\(MAILS_VERIFY_BAD\)\}<\/div><a class="btn" href="#\/cuenta\/email">\$\{esc\(MAILS_TITLE\)\}<\/a>`/);
  assert.doesNotMatch(page, /emailVerifyView === 'error'[\s\S]*form-alert/);
});

test('D-3: #account-mails is width:fit-content; focus ring logic stays 2px --lv-focus', () => {
  const block = theme.slice(theme.indexOf('.account-page #cuenta-mails'), theme.indexOf('.account-page .mails-section fieldset .form-alert'));
  assert.match(block, /\.account-page #account-mails \{\s*width:\s*fit-content;/);
  assert.match(block, /#account-mails \{\s*scroll-margin-top:/);
  assert.match(block, /#account-mails:focus,/);
  assert.match(block, /#account-mails:focus-visible \{/);
  assert.match(block, /outline:\s*2px solid var\(--lv-focus\)/);
  assert.match(block, /outline-offset:\s*4px/);
  assert.doesNotMatch(block, /:focus-visible only|:focus:not\(/);
});
