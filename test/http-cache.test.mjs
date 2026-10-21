import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {hashPassword} from '../lib/password.mjs';
import {
  IMMUTABLE_CACHE, SHORT_REVALIDATE_CACHE, HTML_NO_CACHE, HTML_HOME_CACHE, STATE_CACHE,
  contentEtag, deployRevision, etagMatches, notModified, parseAssetRequest,
  stateEtag, staticCacheControl,
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

async function startApp(dir) {
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
    releaseSha: RELEASE,
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

test('helper: ETag, revision, versioned paths and cache-control matrix', () => {
  assert.equal(deployRevision({}), 'development');
  assert.equal(deployRevision({RELEASE_SHA: 'abc1234'}), 'abc1234');
  assert.equal(deployRevision({RELEASE_SHA: 'abc1234'}, 'override'), 'override');
  const etag = contentEtag('hola');
  assert.match(etag, /^"[0-9a-f]{64}"$/);
  assert.equal(contentEtag('hola'), etag);
  assert.notEqual(contentEtag('hola'), contentEtag('chau'));
  const body = '{"takes":[]}';
  assert.notEqual(stateEtag('user-a', body), stateEtag('user-b', body));
  assert.equal(stateEtag('user-a', body), stateEtag('user-a', body));

  const req = headers => ({headers});
  assert.equal(etagMatches(req({'if-none-match': etag}), etag), true);
  assert.equal(etagMatches(req({'if-none-match': `W/${etag}`}), etag), true);
  assert.equal(etagMatches(req({'if-none-match': `"nope", ${etag}`}), etag), true);
  assert.equal(etagMatches(req({'if-none-match': '"nope"'}), etag), false);
  const mtime = Date.parse('Wed, 21 Oct 2026 12:00:00 GMT');
  assert.equal(notModified(req({'if-modified-since': 'Wed, 21 Oct 2026 12:00:00 GMT'}), {mtimeMs: mtime}), true);
  assert.equal(notModified(req({'if-modified-since': 'Wed, 21 Oct 2026 11:00:00 GMT'}), {mtimeMs: mtime}), false);
  assert.equal(notModified(req({
    'if-none-match': '"nope"',
    'if-modified-since': 'Wed, 21 Oct 2026 12:00:00 GMT',
  }), {etag, mtimeMs: mtime}), false);

  const q = v => new URLSearchParams(v ? {v} : undefined);
  assert.deepEqual(parseAssetRequest('/copy.mjs', q(), RELEASE), {
    path: '/copy.mjs', versioned: false, queryRev: '', pathRev: '',
  });
  assert.equal(parseAssetRequest('/copy.mjs', q(RELEASE), RELEASE).versioned, true);
  assert.equal(parseAssetRequest(`/r/${RELEASE}/copy.mjs`, q(), RELEASE).path, '/copy.mjs');
  assert.equal(parseAssetRequest(`/r/${RELEASE}/copy.mjs`, q(), RELEASE).versioned, true);
  assert.equal(parseAssetRequest('/r/oldsha/app.js', q(), RELEASE).path, '/app.js');
  assert.equal(parseAssetRequest('/r/oldsha/app.js', q(), RELEASE).versioned, false);

  assert.equal(staticCacheControl({html: true}), HTML_NO_CACHE);
  assert.equal(staticCacheControl({html: true, home: true}), HTML_HOME_CACHE);
  assert.equal(staticCacheControl({html: true, versioned: true}), HTML_NO_CACHE);
  assert.equal(staticCacheControl({versioned: true}), IMMUTABLE_CACHE);
  assert.equal(staticCacheControl({woff2: true}), IMMUTABLE_CACHE);
  assert.equal(staticCacheControl({}), SHORT_REVALIDATE_CACHE);
});

test('P1 cache headers, 304 validators, immutable versioned URLs and private /api/state', async () => {
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

    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).revision, RELEASE);
    assert.equal(health.headers.get('cache-control'), 'no-store');

    const home = headerBag(await fetch(base + '/', {redirect: 'manual'}));
    assert.equal(home.status, 200);
    assert.equal(home.cache, HTML_HOME_CACHE);
    assert.equal(home.vary, 'Cookie');
    assert.match(home.etag, /^"[0-9a-f]{64}"$/);
    assert.ok(home.lastModified);
    assert.equal(home.csp, CSP);
    assert.equal(home.xcto, 'nosniff');
    assert.equal(home.xfo, 'DENY');
    assert.equal(home.referrer, 'same-origin');

    const homeAgain = await fetch(base + '/', {
      redirect: 'manual',
      headers: {'If-None-Match': home.etag},
    });
    assert.equal(homeAgain.status, 304);
    assert.equal(await homeAgain.text(), '');
    assert.equal(homeAgain.headers.get('etag'), home.etag);
    assert.equal(homeAgain.headers.get('cache-control'), HTML_HOME_CACHE);
    assert.equal(homeAgain.headers.get('content-security-policy'), CSP);

    const appPage = headerBag(await fetch(base + '/app'));
    assert.equal(appPage.status, 200);
    assert.equal(appPage.cache, HTML_NO_CACHE);
    assert.equal(appPage.referrer, 'no-referrer');
    const app304 = await fetch(base + '/app', {headers: {'If-None-Match': appPage.etag}});
    assert.equal(app304.status, 304);
    assert.equal(await app304.text(), '');

    const mjs = headerBag(await fetch(base + '/copy.mjs'));
    assert.equal(mjs.status, 200);
    assert.equal(mjs.cache, SHORT_REVALIDATE_CACHE);
    assert.match(mjs.etag, /^"[0-9a-f]{64}"$/);
    assert.ok(mjs.lastModified);
    const mjs304 = await fetch(base + '/copy.mjs', {headers: {'If-None-Match': mjs.etag}});
    assert.equal(mjs304.status, 304);
    assert.equal(await mjs304.text(), '');
    const mjsIms = await fetch(base + '/copy.mjs', {headers: {'If-Modified-Since': mjs.lastModified}});
    assert.equal(mjsIms.status, 304);
    const mjsMiss = await fetch(base + '/copy.mjs', {headers: {'If-None-Match': '"deadbeef"'}});
    assert.equal(mjsMiss.status, 200);
    assert.equal(mjsMiss.headers.get('etag'), mjs.etag);

    const versionedQuery = headerBag(await fetch(base + `/copy.mjs?v=${RELEASE}`));
    assert.equal(versionedQuery.status, 200);
    assert.equal(versionedQuery.cache, IMMUTABLE_CACHE);
    assert.equal(versionedQuery.etag, mjs.etag);
    const versionedPrefix = headerBag(await fetch(base + `/r/${RELEASE}/copy.mjs`));
    assert.equal(versionedPrefix.status, 200);
    assert.equal(versionedPrefix.cache, IMMUTABLE_CACHE);
    const stalePrefix = headerBag(await fetch(base + '/r/oldrevision/copy.mjs'));
    assert.equal(stalePrefix.status, 200);
    assert.equal(stalePrefix.cache, SHORT_REVALIDATE_CACHE);
    const versionedHtml = headerBag(await fetch(base + `/app?v=${RELEASE}`));
    assert.equal(versionedHtml.cache, HTML_NO_CACHE);

    const font = headerBag(await fetch(base + '/fonts/instrument-sans-600.woff2'));
    assert.equal(font.status, 200);
    assert.equal(font.cache, IMMUTABLE_CACHE);
    const js = headerBag(await fetch(base + '/app.js'));
    assert.equal(js.cache, SHORT_REVALIDATE_CACHE);
    const versionedJs = headerBag(await fetch(base + `/r/${RELEASE}/app.js`));
    assert.equal(versionedJs.cache, IMMUTABLE_CACHE);

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
    assert.match(etagA, /^"[0-9a-f]{64}"$/);
    assert.match(etagB, /^"[0-9a-f]{64}"$/);
    assert.notEqual(etagA, etagB);
    const stateA304 = await fetch(base + '/api/state', {
      headers: {Cookie: cookieA, 'If-None-Match': etagA},
    });
    assert.equal(stateA304.status, 304);
    assert.equal(await stateA304.text(), '');
    assert.equal(stateA304.headers.get('etag'), etagA);
    assert.equal(stateA304.headers.get('cache-control'), STATE_CACHE);
    const crossed = await fetch(base + '/api/state', {
      headers: {Cookie: cookieB, 'If-None-Match': etagA},
    });
    assert.equal(crossed.status, 200);
    assert.equal(crossed.headers.get('etag'), etagB);
    const bodyB = await crossed.json();
    assert.ok(Array.isArray(bodyB.takes));
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
