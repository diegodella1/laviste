import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {hashPassword} from '../lib/password.mjs';
import {
  IMMUTABLE_CACHE, HTML_NO_CACHE, HTML_HOME_CACHE, STATE_CACHE,
  contentEtag, deployRevision, etagMatches, isDeployRevision, notModified,
  parseAssetRequest, rewriteVersionedHtml, stateEtag, staticCacheControl,
} from '../lib/http-cache.mjs';

const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_B_EMAIL = 'b@example.test';
const USER_B_PASSWORD = 'user-b-password-12';
const RELEASE = 'p1cache01deadbeef';
const CSP = "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

function tmp() {
  return mkdtempSync(join(tmpdir(), 'http-cache-'));
}

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

function cookiePair(res) {
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

async function startApp(dir, releaseSha = RELEASE) {
  const app = createApp({
    dataDir: dir,
    password: OWNER_PASSWORD,
    ownerEmail: OWNER_EMAIL,
    apiKey: '',
    port: 0,
    host: '127.0.0.1',
    secure: false,
    origin: '',
    quotesLive: false,
    releaseSha,
  });
  app.store.createUser({
    email: USER_B_EMAIL,
    displayName: 'Bee',
    role: 'user',
    passwordHash: hashPassword(USER_B_PASSWORD),
  });
  return {app, base: await listen(app)};
}

async function login(base, email, password) {
  const res = await fetch(base + '/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password}),
  });
  assert.equal(res.status, 200, await res.text());
  return cookiePair(res);
}

function headerBag(res) {
  return {
    status: res.status,
    cache: res.headers.get('cache-control'),
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
    vary: res.headers.get('vary'),
    csp: res.headers.get('content-security-policy'),
    xcto: res.headers.get('x-content-type-options'),
    xfo: res.headers.get('x-frame-options'),
    referrer: res.headers.get('referrer-policy'),
  };
}

test('helper: ETag, revision, /r/ prefix and cache-control matrix', () => {
  assert.equal(deployRevision({}), 'development');
  assert.equal(deployRevision({RELEASE_SHA: 'abc1234'}), 'abc1234');
  assert.equal(isDeployRevision('abc1234'), true);
  assert.equal(isDeployRevision('development'), false);
  assert.equal(isDeployRevision(''), false);
  const etag = contentEtag('hola');
  assert.match(etag, /^"[0-9a-f]{64}"$/);
  assert.equal(contentEtag('hola'), etag);
  const body = '{"takes":[]}';
  assert.notEqual(stateEtag('user-a', body), stateEtag('user-b', body));

  const req = headers => ({headers});
  assert.equal(etagMatches(req({'if-none-match': etag}), etag), true);
  assert.equal(etagMatches(req({'if-none-match': `W/${etag}`}), etag), true);
  const mtime = Date.parse('Wed, 21 Oct 2026 12:00:00 GMT');
  assert.equal(notModified(req({'if-modified-since': 'Wed, 21 Oct 2026 12:00:00 GMT'}), {mtimeMs: mtime}), true);
  assert.equal(notModified(req({
    'if-none-match': '"nope"',
    'if-modified-since': 'Wed, 21 Oct 2026 12:00:00 GMT',
  }), {etag, mtimeMs: mtime}), false);

  assert.deepEqual(parseAssetRequest('/copy.mjs', RELEASE), {
    path: '/copy.mjs', versioned: false, prefixed: false, pathRev: '',
  });
  assert.equal(parseAssetRequest(`/r/${RELEASE}/copy.mjs`, RELEASE).path, '/copy.mjs');
  assert.equal(parseAssetRequest(`/r/${RELEASE}/copy.mjs`, RELEASE).versioned, true);
  assert.equal(parseAssetRequest('/r/oldsha/app.js', RELEASE).versioned, false);
  assert.equal(parseAssetRequest(`/r/${RELEASE}/copy.mjs`, 'development').versioned, false);

  assert.equal(staticCacheControl({html: true}), HTML_NO_CACHE);
  assert.equal(staticCacheControl({html: true, home: true}), HTML_HOME_CACHE);
  assert.equal(staticCacheControl({html: true, versioned: true, allowImmutable: true}), HTML_NO_CACHE);
  assert.equal(staticCacheControl({versioned: true, allowImmutable: true}), IMMUTABLE_CACHE);
  assert.equal(staticCacheControl({font: true, allowImmutable: true}), IMMUTABLE_CACHE);
  assert.equal(staticCacheControl({font: true, allowImmutable: false}), HTML_NO_CACHE);
  assert.equal(staticCacheControl({versioned: true, allowImmutable: false}), HTML_NO_CACHE);
  assert.equal(staticCacheControl({}), HTML_NO_CACHE);

  const rewritten = rewriteVersionedHtml('<script type="module" src="/app.js"></script><link href="/brand.css">', RELEASE);
  assert.equal(rewritten, `<script type="module" src="/r/${RELEASE}/app.js"></script><link href="/r/${RELEASE}/brand.css">`);
  assert.equal(rewriteVersionedHtml('<script src="/app.js"></script>', 'development'), '<script src="/app.js"></script>');
});

test('P1 cache headers, HTML /r rewrite, 304 and private /api/state', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const {base} = started;

    const src = readFileSync('server.mjs', 'utf8');
    assert.match(src, /static\.cloudflareinsights\.com/);
    assert.match(src, /cloudflareinsights\.com/);
    assert.ok(!src.includes('readFileSync(resolve(root,\'public\''), 'static path must not readFileSync per request');
    const cacheSrc = readFileSync('lib/http-cache.mjs', 'utf8');
    assert.match(cacheSrc, /new filename/);
    assert.match(cacheSrc, /missing at startup/);

    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).revision, RELEASE);
    assert.equal(health.headers.get('cache-control'), 'no-store');

    const home = headerBag(await fetch(base + '/', {redirect: 'manual'}));
    assert.equal(home.status, 200);
    assert.equal(home.cache, HTML_HOME_CACHE);
    assert.equal(home.vary, 'Cookie');
    assert.match(home.etag, /^"[0-9a-f]{64}"$/);
    assert.equal(home.csp, CSP);
    assert.equal(home.xcto, 'nosniff');
    assert.equal(home.xfo, 'DENY');
    assert.equal(home.referrer, 'same-origin');
    const homeHtml = await (await fetch(base + '/', {redirect: 'manual'})).text();
    assert.match(homeHtml, new RegExp(`/r/${RELEASE}/pulse\\.js`));
    assert.match(homeHtml, new RegExp(`/r/${RELEASE}/brand\\.css`));
    assert.match(homeHtml, new RegExp(`/r/${RELEASE}/site\\.css`));
    assert.ok(homeHtml.includes('href="/fonts/instrument-sans-600.woff2"'));
    const pulseSrc = await (await fetch(base + `/r/${RELEASE}/pulse.js`)).text();
    assert.match(pulseSrc, /from '\.\/timeline\.mjs'/);
    assert.match(pulseSrc, /from '\.\/format\.mjs'/);
    assert.match(pulseSrc, /from '\.\/copy\.mjs'/);
    assert.equal((await fetch(new URL('./copy.mjs', base + `/r/${RELEASE}/pulse.js`))).status, 200);
    assert.match(readFileSync('public/site.css', 'utf8'), /@import url\('\.\/brand\.css'\)/);

    const homeAgain = await fetch(base + '/', {
      redirect: 'manual',
      headers: {'If-None-Match': home.etag},
    });
    assert.equal(homeAgain.status, 304);
    assert.equal(await homeAgain.text(), '');
    assert.equal(homeAgain.headers.get('content-security-policy'), CSP);

    const appPage = await fetch(base + '/app');
    assert.equal(appPage.status, 200);
    assert.equal(appPage.headers.get('cache-control'), HTML_NO_CACHE);
    assert.equal(appPage.headers.get('referrer-policy'), 'no-referrer');
    const appHtml = await appPage.text();
    assert.match(appHtml, new RegExp(`/r/${RELEASE}/app\\.js`));
    assert.match(appHtml, new RegExp(`/r/${RELEASE}/brand\\.css`));
    assert.match(appHtml, new RegExp(`/r/${RELEASE}/styles\\.css`));
    assert.match(appHtml, new RegExp(`/r/${RELEASE}/app-theme\\.css`));
    assert.ok(!appHtml.includes('src="/app.js"'));
    const app304 = await fetch(base + '/app', {headers: {'If-None-Match': appPage.headers.get('etag')}});
    assert.equal(app304.status, 304);

    const how = await (await fetch(base + '/como-funciona')).text();
    assert.ok(how.includes('href="/brand.css"'), 'non-home HTML stays on normal paths');
    assert.ok(!how.includes(`/r/${RELEASE}/`));

    const mjs = headerBag(await fetch(base + '/copy.mjs'));
    assert.equal(mjs.status, 200);
    assert.equal(mjs.cache, HTML_NO_CACHE);
    assert.match(mjs.etag, /^"[0-9a-f]{64}"$/);
    const mjs304 = await fetch(base + '/copy.mjs', {headers: {'If-None-Match': mjs.etag}});
    assert.equal(mjs304.status, 304);
    assert.equal(await mjs304.text(), '');
    const mjsIms = await fetch(base + '/copy.mjs', {headers: {'If-Modified-Since': mjs.lastModified}});
    assert.equal(mjsIms.status, 304);
    assert.equal((await fetch(base + `/copy.mjs?v=${RELEASE}`)).headers.get('cache-control'), HTML_NO_CACHE);
    assert.equal((await fetch(base + '/app.js')).headers.get('cache-control'), HTML_NO_CACHE);
    assert.equal((await fetch(base + '/styles.css')).headers.get('cache-control'), HTML_NO_CACHE);

    const versionedJs = headerBag(await fetch(base + `/r/${RELEASE}/app.js`));
    assert.equal(versionedJs.status, 200);
    assert.equal(versionedJs.cache, IMMUTABLE_CACHE);
    const appJsBody = await (await fetch(base + `/r/${RELEASE}/app.js`)).text();
    assert.match(appJsBody, /from '\.\/copy\.mjs'/);
    const relative = new URL('./copy.mjs', base + `/r/${RELEASE}/app.js`);
    assert.equal(relative.pathname, `/r/${RELEASE}/copy.mjs`);
    const relativeCopy = headerBag(await fetch(relative));
    assert.equal(relativeCopy.status, 200);
    assert.equal(relativeCopy.cache, IMMUTABLE_CACHE);

    assert.equal((await fetch(base + `/r/${RELEASE}/`)).status, 404);
    assert.equal((await fetch(base + `/r/${RELEASE}/app`)).status, 404);
    assert.equal((await fetch(base + `/r/${RELEASE}/preguntas`)).status, 404);
    assert.equal((await fetch(base + '/r/oldrevision/copy.mjs')).status, 404);
    assert.equal((await fetch(base + '/app')).status, 200);
    assert.equal((await fetch(base + '/', {redirect: 'manual'})).status, 200);

    const font = headerBag(await fetch(base + '/fonts/instrument-sans-600.woff2'));
    assert.equal(font.status, 200);
    assert.equal(font.cache, IMMUTABLE_CACHE);

    const cookieA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const cookieB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const stateA = await fetch(base + '/api/state', {headers: {Cookie: cookieA}});
    const stateB = await fetch(base + '/api/state', {headers: {Cookie: cookieB}});
    assert.equal(stateA.status, 200);
    assert.equal(stateB.status, 200);
    assert.equal(stateA.headers.get('cache-control'), STATE_CACHE);
    assert.equal(stateA.headers.get('vary'), 'Cookie');
    const etagA = stateA.headers.get('etag');
    const etagB = stateB.headers.get('etag');
    assert.notEqual(etagA, etagB);
    const stateA304 = await fetch(base + '/api/state', {
      headers: {Cookie: cookieA, 'If-None-Match': etagA},
    });
    assert.equal(stateA304.status, 304);
    assert.equal(await stateA304.text(), '');
    const crossed = await fetch(base + '/api/state', {
      headers: {Cookie: cookieB, 'If-None-Match': etagA},
    });
    assert.equal(crossed.status, 200);
    assert.equal(crossed.headers.get('etag'), etagB);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('development revision never uses immutable and does not rewrite HTML', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir, 'development');
    app = started.app;
    const html = await (await fetch(started.base + '/app')).text();
    assert.ok(html.includes('src="/app.js"'));
    assert.ok(!html.includes('/r/development/'));
    assert.equal((await fetch(started.base + '/r/development/app.js')).status, 404);
    assert.equal((await fetch(started.base + '/copy.mjs')).headers.get('cache-control'), HTML_NO_CACHE);
    assert.equal((await fetch(started.base + '/fonts/instrument-sans-600.woff2')).headers.get('cache-control'), HTML_NO_CACHE);
    assert.equal((await fetch(started.base + '/api/health').then(r => r.json())).revision, 'development');
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
