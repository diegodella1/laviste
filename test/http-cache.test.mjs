import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {request as httpRequest} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createApp} from '../server.mjs';
import {hashPassword} from '../lib/password.mjs';
import {
  IMMUTABLE_CACHE, HTML_NO_CACHE, HTML_HOME_CACHE, STATE_CACHE,
  applyHtmlRevision, contentEtag, deployRevision, etagMatches, htmlRevisionEtag,
  hasSessionCookieHeader, isDeployRevision, notModified, parseAssetRequest, rewriteVersionedHtml,
  sessionBootHtml, staleRevisionLocation, stateEtag, staticCacheControl, CRITICAL_CSS_FILE,
  inlineCriticalCss, CRITICAL_STYLE_MARK, SESSION_HTML_FILE, APP_HTML_POST_MAX, htmlAttr,
  acceptsGzip, withGzip, staticRepresentation,
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
  assert.equal(staticCacheControl({html: true, privateHtml: true}), HTML_HOME_CACHE);
  assert.equal(staticCacheControl({html: true, versioned: true, allowImmutable: true}), HTML_NO_CACHE);
  assert.equal(staticCacheControl({versioned: true, allowImmutable: true}), IMMUTABLE_CACHE);
  assert.equal(staticCacheControl({font: true, allowImmutable: true}), IMMUTABLE_CACHE);
  assert.equal(staticCacheControl({font: true, allowImmutable: false}), HTML_NO_CACHE);
  assert.equal(staticCacheControl({versioned: true, allowImmutable: false}), HTML_NO_CACHE);
  assert.equal(staticCacheControl({}), HTML_NO_CACHE);

  const rewritten = rewriteVersionedHtml('<script type="module" src="/app.js"></script><link href="/brand.css">', RELEASE);
  assert.equal(rewritten, `<script type="module" src="/r/${RELEASE}/app.js"></script><link href="/r/${RELEASE}/brand.css">`);
  assert.equal(rewriteVersionedHtml('<script src="/app.js"></script>', 'development'), '<script src="/app.js"></script>');

  assert.notEqual(htmlRevisionEtag('revA', 'same-html'), htmlRevisionEtag('revB', 'same-html'));
  assert.equal(htmlRevisionEtag('revA', 'same-html'), htmlRevisionEtag('revA', 'same-html'));
  assert.equal(
    inlineCriticalCss(`head${CRITICAL_STYLE_MARK}body`, '.login-layout{display:grid}'),
    'head<style id="lv-critical">.login-layout{display:grid}</style>body',
  );
  const stamped = applyHtmlRevision(new Map([
    ['index.html', {body: Buffer.from(`<html lang="es-AR"><script src="/app.js"></script>${CRITICAL_STYLE_MARK}`), lastModified: 'Wed, 21 Oct 2026 12:00:00 GMT', mtimeMs: Date.parse('Wed, 21 Oct 2026 12:00:00 GMT')}],
    ['home.html', {body: Buffer.from('<script src="/pulse.js"></script>'), lastModified: 'Wed, 21 Oct 2026 12:00:00 GMT', mtimeMs: Date.parse('Wed, 21 Oct 2026 12:00:00 GMT')}],
    [CRITICAL_CSS_FILE, {body: Buffer.from('.login-layout{display:grid}')}],
  ]), RELEASE);
  assert.match(stamped.get('index.html').body.toString('utf8'), /<style id="lv-critical">\.login-layout\{display:grid\}<\/style>/);
  assert.equal(stamped.get('index.html').lastModified, undefined);
  assert.equal(stamped.get('index.html').mtimeMs, undefined);
  assert.equal(stamped.get('index.html').etag, htmlRevisionEtag(RELEASE, stamped.get('index.html').body));
  assert.match(stamped.get(SESSION_HTML_FILE).body.toString('utf8'), /data-boot="session"/);
  assert.notEqual(stamped.get(SESSION_HTML_FILE).etag, stamped.get('index.html').etag);
  assert.doesNotMatch(stamped.get('index.html').body.toString('utf8'), /data-google/);
  const stampedGoogle = applyHtmlRevision(new Map([
    ['index.html', {body: Buffer.from(`<html lang="es-AR"><script src="/app.js"></script>${CRITICAL_STYLE_MARK}`)}],
    ['home.html', {body: Buffer.from('<script src="/pulse.js"></script>')}],
    [CRITICAL_CSS_FILE, {body: Buffer.from('.login-layout{display:grid}')}],
  ]), RELEASE, {google: true});
  assert.match(stampedGoogle.get('index.html').body.toString('utf8'), /data-google="1"/);
  assert.match(stampedGoogle.get(SESSION_HTML_FILE).body.toString('utf8'), /data-google="1"/);
  assert.equal(hasSessionCookieHeader('laviste_session=abc'), true);
  assert.equal(hasSessionCookieHeader('other=1'), false);
  assert.match(sessionBootHtml('<html lang="es-AR"><!--lv-boot-->LOGIN<!--/lv-boot-->'), /data-boot="session"/);
  assert.match(sessionBootHtml('<html><!--lv-boot-->LOGIN<!--/lv-boot-->'), /role="status"/);
  assert.match(sessionBootHtml('<html><!--lv-boot-->LOGIN<!--/lv-boot-->'), /visually-hidden">Cargando tu espacio/);
  assert.doesNotMatch(sessionBootHtml('<html><!--lv-boot-->LOGIN<!--/lv-boot-->'), /LOGIN/);
  assert.match(htmlAttr('<html lang="es-AR">', 'data-google', '1'), /data-google="1"/);
  assert.equal(staleRevisionLocation({prefixed: true, versioned: false, ext: '.js', revision: RELEASE, assetPath: '/app.js'}), `/r/${RELEASE}/app.js`);
  assert.equal(staleRevisionLocation({prefixed: true, versioned: false, ext: '.mjs', revision: RELEASE, assetPath: '/copy.mjs'}), `/r/${RELEASE}/copy.mjs`);
  assert.equal(staleRevisionLocation({prefixed: true, versioned: false, ext: '.css', revision: RELEASE, assetPath: '/brand.css'}), `/r/${RELEASE}/brand.css`);
  assert.equal(staleRevisionLocation({prefixed: true, versioned: false, ext: '.html', revision: RELEASE, assetPath: '/app'}), '');
  assert.equal(staleRevisionLocation({prefixed: true, versioned: false, ext: '.js', revision: 'development', assetPath: '/app.js'}), '');
  assert.equal(notModified({headers: {'if-modified-since': 'Wed, 21 Oct 2026 12:00:00 GMT'}}, {etag: '"abc"'}), false);
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
    assert.equal(home.lastModified, null);
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
    assert.match(pulseSrc, /from '\.\/def-short\.mjs'/);
    assert.match(pulseSrc, /importOrReload\('\.\/timeline\.mjs'\)/);
    assert.match(pulseSrc, /importOrReload\('\.\/format\.mjs'\)/);
    assert.match(pulseSrc, /Promise\.all\(\[healthP, sessionP\]\)/);
    assert.doesNotMatch(pulseSrc, /from '\.\/copy\.mjs'/);
    assert.doesNotMatch(pulseSrc, /from '\.\/timeline\.mjs'/);
    assert.equal((await fetch(new URL('./def-short.mjs', base + `/r/${RELEASE}/pulse.js`))).status, 200);
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
    assert.equal(appPage.headers.get('cache-control'), HTML_HOME_CACHE);
    assert.match(appPage.headers.get('vary') || '', /Cookie/);
    assert.equal(appPage.headers.get('last-modified'), null);
    assert.equal(appPage.headers.get('referrer-policy'), 'no-referrer');
    const appHtml = await appPage.text();
    assert.match(appHtml, new RegExp(`/r/${RELEASE}/app\\.js`));
    assert.match(appHtml, new RegExp(`/r/${RELEASE}/brand\\.css`));
    assert.match(appHtml, new RegExp(`rel="modulepreload" href="/r/${RELEASE}/app\\.js"`));
    assert.match(appHtml, /<style id="lv-critical">/);
    assert.match(appHtml, /class="login-layout"/);
    assert.match(appHtml, /id="login"/);
    assert.match(appHtml, /method="post"/);
    assert.match(appHtml, /action="\/app"/);
    assert.doesNotMatch(appHtml, /data-boot="session"/);
    assert.doesNotMatch(appHtml, /<html[^>]*data-google/);
    const appHint = await fetch(base + '/app', {headers: {Cookie: 'laviste_session=not-a-real-session'}});
    assert.equal(appHint.status, 200);
    assert.equal(appHint.headers.get('cache-control'), HTML_HOME_CACHE);
    assert.match(appHint.headers.get('vary') || '', /Cookie/);
    const hintHtml = await appHint.text();
    assert.match(hintHtml, /data-boot="session"/);
    assert.doesNotMatch(hintHtml, /id="login"/);
    assert.match(hintHtml, /boot-session/);
    assert.doesNotMatch(hintHtml, /class="login-layout"/);
    assert.notEqual(appHint.headers.get('etag'), appPage.headers.get('etag'));
    const appPost = await fetch(base + '/app', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'email=leak%40example.test&password=super-secret-pass',
    });
    assert.equal(appPost.status, 200);
    assert.match(await appPost.text(), /id="login"/);
    const appPostHuge = await fetch(base + '/app', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'x'.repeat(APP_HTML_POST_MAX + 1),
    });
    assert.equal(appPostHuge.status, 413);
    assert.ok(!appHtml.includes('href="/styles.css"'));
    assert.ok(!appHtml.includes(`href="/r/${RELEASE}/styles.css"`));
    assert.ok(!appHtml.includes(`href="/r/${RELEASE}/app-theme.css"`));
    assert.ok(!appHtml.includes('src="/app.js"'));
    assert.match(appHtml, /\.login-layout\s*\{/);
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
    const staleMjs = await fetch(base + '/r/oldrevision/copy.mjs', {redirect: 'manual'});
    assert.equal(staleMjs.status, 302);
    assert.equal(staleMjs.headers.get('location'), `/r/${RELEASE}/copy.mjs`);
    assert.equal(staleMjs.headers.get('cache-control'), 'no-store');
    const staleCss = await fetch(base + '/r/oldrevision/brand.css', {redirect: 'manual'});
    assert.equal(staleCss.status, 302);
    assert.equal(staleCss.headers.get('location'), `/r/${RELEASE}/brand.css`);
    assert.equal(staleCss.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(base + '/r/oldrevision/app', {redirect: 'manual'})).status, 404);
    assert.equal((await fetch(base + '/r/oldrevision/nope.js', {redirect: 'manual'})).status, 404);
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
    assert.match(html, /<style id="lv-critical">/);
    assert.ok(!html.includes(CRITICAL_STYLE_MARK));
    assert.equal((await fetch(started.base + '/r/development/app.js', {redirect: 'manual'})).status, 404);
    assert.equal((await fetch(started.base + '/r/otherrev/app.js', {redirect: 'manual'})).status, 404);
    assert.equal((await fetch(started.base + '/copy.mjs')).headers.get('cache-control'), HTML_NO_CACHE);
    assert.equal((await fetch(started.base + '/fonts/instrument-sans-600.woff2')).headers.get('cache-control'), HTML_NO_CACHE);
    assert.equal((await fetch(started.base + '/api/health').then(r => r.json())).revision, 'development');
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('versioned HTML ignores If-Modified-Since; ETag is bound to RELEASE_SHA', async () => {
  const dirA = tmp();
  const dirB = tmp();
  const REV_A = 'revAaaaaaaaaaaaa';
  const REV_B = 'revBbbbbbbbbbbbb';
  let appA;
  let appB;
  try {
    const startedA = await startApp(dirA, REV_A);
    appA = startedA.app;
    const homeA = await fetch(startedA.base + '/', {redirect: 'manual'});
    const appPageA = await fetch(startedA.base + '/app');
    assert.equal(homeA.status, 200);
    assert.equal(homeA.headers.get('last-modified'), null);
    assert.equal(appPageA.headers.get('last-modified'), null);
    const etagHomeA = homeA.headers.get('etag');
    const etagAppA = appPageA.headers.get('etag');
    assert.match(await homeA.text(), new RegExp(`/r/${REV_A}/`));
    await appA.close();
    appA = null;

    const startedB = await startApp(dirB, REV_B);
    appB = startedB.app;
    const {base} = startedB;
    const ims = new Date().toUTCString();

    const homeIms = await fetch(base + '/', {redirect: 'manual', headers: {'If-Modified-Since': ims}});
    assert.equal(homeIms.status, 200);
    assert.equal(homeIms.headers.get('last-modified'), null);
    const homeImsHtml = await homeIms.text();
    assert.match(homeImsHtml, new RegExp(`/r/${REV_B}/pulse\\.js`));
    assert.match(homeImsHtml, new RegExp(`/r/${REV_B}/brand\\.css`));
    assert.ok(!homeImsHtml.includes(`/r/${REV_A}/`));

    const appIms = await fetch(base + '/app', {headers: {'If-Modified-Since': ims}});
    assert.equal(appIms.status, 200);
    const appImsHtml = await appIms.text();
    assert.match(appImsHtml, new RegExp(`/r/${REV_B}/app\\.js`));
    assert.ok(!appImsHtml.includes(`/r/${REV_A}/`));

    const homeOldEtag = await fetch(base + '/', {redirect: 'manual', headers: {'If-None-Match': etagHomeA}});
    assert.equal(homeOldEtag.status, 200);
    assert.match(await homeOldEtag.text(), new RegExp(`/r/${REV_B}/`));
    const appOldEtag = await fetch(base + '/app', {headers: {'If-None-Match': etagAppA}});
    assert.equal(appOldEtag.status, 200);

    const homeB = await fetch(base + '/', {redirect: 'manual'});
    const appPageB = await fetch(base + '/app');
    assert.notEqual(homeB.headers.get('etag'), etagHomeA);
    const homeSame = await fetch(base + '/', {
      redirect: 'manual',
      headers: {'If-None-Match': homeB.headers.get('etag')},
    });
    assert.equal(homeSame.status, 304);
    const appSame = await fetch(base + '/app', {headers: {'If-None-Match': appPageB.headers.get('etag')}});
    assert.equal(appSame.status, 304);
  } finally {
    if (appA?.server.listening) await appA.close();
    else appA?.store.close();
    if (appB?.server.listening) await appB.close();
    else appB?.store.close();
    rmSync(dirA, {recursive: true, force: true});
    rmSync(dirB, {recursive: true, force: true});
  }
});

function rawGet(url, headers = {}) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    httpRequest(u, {headers}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    }).on('error', reject).end();
  });
}

test('GZIP_STATIC gzips JS/CSS/HTML and stays under the LHCI script budget', async () => {
  assert.equal(acceptsGzip({headers: {'accept-encoding': 'gzip, deflate, br'}}), true);
  assert.equal(acceptsGzip({headers: {'accept-encoding': 'identity'}}), false);
  assert.equal(acceptsGzip({headers: {'accept-encoding': 'gzip;q=0'}}), false);
  assert.equal(acceptsGzip({headers: {'accept-encoding': 'gzip;q=0.0, identity'}}), false);
  assert.equal(acceptsGzip({headers: {'accept-encoding': 'gzip;q=0.1'}}), true);
  const plain = withGzip(new Map([['app.js', {body: Buffer.from('a'.repeat(2000)), etag: '"x"'}]]), true).get('app.js');
  assert.ok(plain.gzip.length < 2000);
  assert.equal(staticRepresentation(plain, {headers: {'accept-encoding': 'gzip'}}).gzip, true);
  assert.equal(staticRepresentation(plain, {headers: {'accept-encoding': 'gzip;q=0'}}).gzip, false);

  const dir = tmp();
  let app;
  try {
    app = createApp({
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
      gzipStatic: true,
    });
    const base = await listen(app);
    const js = await rawGet(base + `/r/${RELEASE}/app.js`, {'accept-encoding': 'gzip'});
    assert.equal(js.status, 200);
    assert.equal(js.headers['content-encoding'], 'gzip');
    assert.match(js.headers.vary || '', /Accept-Encoding/i);
    assert.match(gunzipSync(js.body).toString('utf8'), /from '\.\/copy\.mjs'/);
    const identity = await rawGet(base + `/r/${RELEASE}/app.js`, {'accept-encoding': 'identity'});
    assert.notEqual(identity.headers['content-encoding'], 'gzip');
    assert.match(identity.headers.vary || '', /Accept-Encoding/i);
    assert.ok(js.body.length < identity.body.length);
    const q0 = await rawGet(base + `/r/${RELEASE}/app.js`, {'accept-encoding': 'gzip;q=0'});
    assert.notEqual(q0.headers['content-encoding'], 'gzip');
    assert.match(q0.headers.vary || '', /Accept-Encoding/i);
    assert.ok(js.body.length < 80000, `gzip app.js is ${js.body.length}`);

    let script = 0;
    for (const path of ['/app.js', '/copy.mjs', '/rev.mjs', '/icons.js', '/format.mjs', '/auto.mjs']) {
      const hit = await rawGet(base + `/r/${RELEASE}${path}`, {'accept-encoding': 'gzip'});
      assert.equal(hit.headers['content-encoding'], 'gzip', path);
      script += hit.body.length;
    }
    assert.ok(script < 160000, `gzip login scripts ${script} must fit the LHCI budget`);

    const html = await rawGet(base + '/app', {'accept-encoding': 'gzip'});
    assert.equal(html.headers['content-encoding'], 'gzip');
    assert.equal(html.headers['referrer-policy'], 'no-referrer');
    assert.match(html.headers.vary || '', /Cookie/);
    assert.match(html.headers.vary || '', /Accept-Encoding/i);
    const html304 = await rawGet(base + '/app', {
      'accept-encoding': 'gzip',
      'if-none-match': html.headers.etag,
    });
    assert.equal(html304.status, 304);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('Google-on /app HTML marks data-google without identity', async () => {
  const dir = tmp();
  let app;
  try {
    app = createApp({
      dataDir: dir,
      password: OWNER_PASSWORD,
      ownerEmail: OWNER_EMAIL,
      apiKey: '',
      port: 0,
      host: '127.0.0.1',
      secure: false,
      origin: '',
      quotesLive: false,
      googleClientId: 'gate-google-client.apps.googleusercontent.com',
      googleClientSecret: 'gate-google-secret',
    });
    const base = await listen(app);
    const res = await fetch(base + '/app');
    const html = await res.text();
    assert.match(html, /data-google="1"/);
    assert.doesNotMatch(html, /id="login-google"/);
    assert.doesNotMatch(html, new RegExp(OWNER_EMAIL.replace('.', '\\.')));
    assert.match(html, /html\[data-google\]\s+\.login-google-slot/);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
