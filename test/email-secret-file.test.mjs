import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readSecretEnv, unsubscribeSecret} from '../lib/email.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 're_test_secret_file_value_never_log';
const PLAIN = 'plain-env-should-lose';

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'email-secret-file-'));
}

function captureConsole(fn) {
  const chunks = [];
  const push = (...args) => {
    chunks.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
  };
  const orig = {log: console.log, error: console.error, warn: console.warn, info: console.info};
  console.log = push;
  console.error = push;
  console.warn = push;
  console.info = push;
  try {
    return {result: fn(), output: chunks.join('\n')};
  } catch (err) {
    return {error: err, output: chunks.join('\n')};
  } finally {
    console.log = orig.log;
    console.error = orig.error;
    console.warn = orig.warn;
    console.info = orig.info;
  }
}

function assertSecretAbsent(text, values = [SECRET, PLAIN]) {
  const raw = String(text || '');
  for (const value of values) {
    assert.equal(raw.includes(value), false);
  }
}

test('readSecretEnv reads *_FILE and trims a trailing newline', () => {
  const dir = tmpDir();
  try {
    const file = join(dir, 'resend_api_key');
    writeFileSync(file, `${SECRET}\n`);
    const {result, error, output} = captureConsole(() =>
      readSecretEnv({RESEND_API_KEY_FILE: file}, 'RESEND_API_KEY'));
    assert.equal(error, undefined);
    assert.equal(result, SECRET);
    assertSecretAbsent(output);
    assertSecretAbsent(error?.message);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('readSecretEnv: *_FILE wins over env', () => {
  const dir = tmpDir();
  try {
    const file = join(dir, 'email_unsubscribe_secret');
    writeFileSync(file, `${SECRET}\n`);
    const {result, error, output} = captureConsole(() => unsubscribeSecret({
      EMAIL_UNSUBSCRIBE_SECRET: PLAIN,
      EMAIL_UNSUBSCRIBE_SECRET_FILE: file,
    }));
    assert.equal(error, undefined);
    assert.equal(result, SECRET);
    assertSecretAbsent(output);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('readSecretEnv falls back to env when *_FILE is unset', () => {
  const {result, error, output} = captureConsole(() =>
    readSecretEnv({RESEND_API_KEY: ` ${SECRET} `}, 'RESEND_API_KEY'));
  assert.equal(error, undefined);
  assert.equal(result, SECRET);
  assertSecretAbsent(output);
  assert.equal(unsubscribeSecret({EMAIL_UNSUBSCRIBE_SECRET: SECRET}), SECRET);
  assert.equal(unsubscribeSecret({}), '');
});

test('readSecretEnv: missing or unreadable *_FILE is absent and does not throw', () => {
  const dir = tmpDir();
  try {
    const missing = join(dir, 'no-such-secret');
    const blocked = join(dir, 'blocked-dir');
    mkdirSync(blocked);
    const missingRun = captureConsole(() =>
      readSecretEnv({RESEND_API_KEY_FILE: missing, RESEND_API_KEY: PLAIN}, 'RESEND_API_KEY'));
    assert.equal(missingRun.error, undefined);
    assert.equal(missingRun.result, '');
    assertSecretAbsent(missingRun.output, [SECRET, PLAIN]);

    const dirRun = captureConsole(() =>
      unsubscribeSecret({EMAIL_UNSUBSCRIBE_SECRET_FILE: blocked, EMAIL_UNSUBSCRIBE_SECRET: PLAIN}));
    assert.equal(dirRun.error, undefined);
    assert.equal(dirRun.result, '');
    assertSecretAbsent(dirRun.output, [SECRET, PLAIN]);

    const modeFile = join(dir, 'no-read');
    writeFileSync(modeFile, SECRET);
    chmodSync(modeFile, 0);
    const modeRun = captureConsole(() =>
      readSecretEnv({RESEND_API_KEY_FILE: modeFile, RESEND_API_KEY: PLAIN}, 'RESEND_API_KEY'));
    assert.equal(modeRun.error, undefined);
    if (modeRun.result === '') {
      assertSecretAbsent(modeRun.output);
    } else {
      assert.equal(modeRun.result, SECRET);
    }
    chmodSync(modeFile, 0o600);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('secret value never appears in captured console output or error messages', () => {
  const dir = tmpDir();
  try {
    const file = join(dir, 'key');
    writeFileSync(file, `${SECRET}\n`);
    const ok = captureConsole(() => readSecretEnv({RESEND_API_KEY_FILE: file}, 'RESEND_API_KEY'));
    assert.equal(ok.result, SECRET);
    assertSecretAbsent(ok.output);
    const bad = captureConsole(() =>
      readSecretEnv({RESEND_API_KEY_FILE: join(dir, 'missing')}, 'RESEND_API_KEY'));
    assert.equal(bad.result, '');
    assert.equal(bad.error, undefined);
    assertSecretAbsent(bad.output);
    const worker = readFileSync(new URL('../lib/email-worker.mjs', import.meta.url), 'utf8');
    assert.match(worker, /readSecretEnv\(env, 'RESEND_API_KEY'\)/);
    assert.doesNotMatch(worker, /console\.\w+\([^)]*apiKey/);
    assert.doesNotMatch(worker, /error\.message.*apiKey|apiKey.*error\.message/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('compose.yaml: FEATURE_EMAIL default 0, *_FILE under /run/secrets, no plain keys', () => {
  const compose = readFileSync(join(root, 'compose.yaml'), 'utf8');
  const start = compose.indexOf('\n    environment:\n');
  const end = compose.indexOf('\n    volumes:\n', start);
  const appEnv = compose.slice(start, end);
  const backup = compose.slice(compose.indexOf('\n  backup:'));
  assert.match(appEnv, /FEATURE_EMAIL:\s*\$\{FEATURE_EMAIL:-0\}/);
  assert.match(appEnv, /RESEND_API_KEY_FILE:\s*\/run\/secrets\/resend_api_key/);
  assert.match(appEnv, /EMAIL_UNSUBSCRIBE_SECRET_FILE:\s*\/run\/secrets\/email_unsubscribe_secret/);
  assert.match(appEnv, /EMAIL_ALLOWLIST:\s*\$\{EMAIL_ALLOWLIST:-\}/);
  assert.doesNotMatch(appEnv, /^\s+RESEND_API_KEY:/m);
  assert.doesNotMatch(appEnv, /^\s+EMAIL_UNSUBSCRIBE_SECRET:/m);
  assert.doesNotMatch(backup, /RESEND_API_KEY|EMAIL_UNSUBSCRIBE_SECRET|FEATURE_EMAIL/);
});
