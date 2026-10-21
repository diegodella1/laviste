import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const CSP = "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const UNCHANGED_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
};

const UNCHANGED_DIRECTIVES = {
  'default-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

function parseCsp(header) {
  return Object.fromEntries(header.split('; ').map(part => {
    const [name, ...values] = part.split(' ');
    return [name, values];
  }));
}

test('security headers allow Cloudflare Web Analytics and leave the rest unchanged', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'laviste-csp-'));
  const app = createApp({
    dataDir: dir, password: 'csp-test-password', apiKey: '',
    port: 0, host: '127.0.0.1', secure: false, origin: '',
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    for (const path of ['/', '/privacidad', '/api/health']) {
      const res = await fetch(base + path);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers.get('content-security-policy'), CSP, path);
      for (const [name, value] of Object.entries(UNCHANGED_HEADERS)) {
        assert.equal(res.headers.get(name), value, `${path} ${name}`);
      }
      const directives = parseCsp(res.headers.get('content-security-policy'));
      assert.deepEqual(directives['script-src'], ["'self'", 'https://static.cloudflareinsights.com']);
      assert.deepEqual(directives['connect-src'], ["'self'", 'https://cloudflareinsights.com']);
      assert.ok(directives['connect-src'].includes("'self'"), 'connect-src self covers same-origin /cdn-cgi/rum');
      assert.equal(res.headers.get('content-security-policy').includes('/cdn-cgi/rum'), false);
      for (const [name, values] of Object.entries(UNCHANGED_DIRECTIVES)) {
        assert.deepEqual(directives[name], values, name);
      }
      assert.deepEqual(Object.keys(directives), [
        'default-src', 'script-src', 'style-src', 'img-src', 'connect-src',
        'font-src', 'object-src', 'frame-ancestors', 'base-uri', 'form-action',
      ]);
    }
  } finally {
    await app.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
