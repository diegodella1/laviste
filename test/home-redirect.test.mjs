import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {hashPassword} from '../lib/password.mjs';
import {PANEL_HOME, PANEL_HOME_HASH, publicHomeRedirectLocation, safePanelNext} from '../public/home-route.mjs';

const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_B_EMAIL = 'b@example.test';
const USER_B_PASSWORD = 'user-b-password-12';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'home-redirect-'));
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
  });
  app.store.createUser({
    email: USER_B_EMAIL,
    displayName: 'Bee',
    role: 'user',
    passwordHash: hashPassword(USER_B_PASSWORD),
  });
  const base = await listen(app);
  return {app, base};
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

test('public home redirects to the panel only when a session exists', () => {
  assert.equal(PANEL_HOME, '/app');
  assert.equal(PANEL_HOME_HASH, '#/');
  assert.equal(publicHomeRedirectLocation('/', true), '/app');
  assert.equal(publicHomeRedirectLocation('/', false), null);
  assert.equal(publicHomeRedirectLocation('/', null), null);
  assert.equal(publicHomeRedirectLocation('/app', true), null);
  assert.equal(publicHomeRedirectLocation('/app/', true), null);
  assert.equal(publicHomeRedirectLocation('/como-funciona', true), null);
  assert.equal(publicHomeRedirectLocation('/acerca', true), null);
  assert.equal(publicHomeRedirectLocation('/privacidad', true), null);
  assert.equal(publicHomeRedirectLocation('/preguntas', true), null);
});

test('safePanelNext only accepts same-origin panel targets', () => {
  assert.equal(safePanelNext('#/'), '#/');
  assert.equal(safePanelNext('#/takes'), '#/takes');
  assert.equal(safePanelNext('#/publicas'), '#/publicas');
  assert.equal(safePanelNext('#/publicas/abc'), '#/publicas/abc');
  assert.equal(safePanelNext('/app#/publicas'), '#/publicas');
  assert.equal(safePanelNext('/app'), '#/');
  assert.equal(safePanelNext('/app/'), '#/');
  assert.equal(safePanelNext('/app#/takes'), '#/takes');
  assert.equal(safePanelNext(null), null);
  assert.equal(safePanelNext(''), null);
  assert.equal(safePanelNext('/'), null);
  assert.equal(safePanelNext('/como-funciona'), null);
  assert.equal(safePanelNext('https://evil.example/'), null);
  assert.equal(safePanelNext('//evil.example/app'), null);
  assert.equal(safePanelNext('https://evil.example/app'), null);
  assert.equal(safePanelNext('/app@evil.example'), null);
  assert.equal(safePanelNext('\\/\\/evil.example'), null);
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'http:evil.example', 'http://evil.example/app',
                     '/\\evil.example', '\\\\evil.example', '%2F%2Fevil.example', '/%2F%2Fevil.example',
                     '/app/../evil', 'data:text/html,x', ' //evil.example', '/application#/x'])
    assert.equal(safePanelNext(bad), null, bad);
  assert.equal(safePanelNext('  #/takes  '), '#/takes');
  assert.equal(safePanelNext('/app#/take/abc/news'), '#/take/abc/news');
});

test('SPA Inicio and logged-in brand target the panel hash, login brand stays public', () => {
  const appJs = readFileSync('public/app.js', 'utf8');
  assert.match(appJs, /PANEL_HOME_HASH, 'Inicio'/);
  assert.ok(!appJs.includes("['/', 'Inicio']"), 'Inicio must not point at the public home');
  assert.match(appJs, /<a class="brand" href="#\/" aria-label="La Viste, inicio">/);
  assert.match(appJs, /login-story"><a href="\/" class="brand"/);
  assert.match(appJs, /safePanelNext\(/);
  assert.match(appJs, /if \(location\.hash === '#preguntas'\) \{\s*location\.replace\('\/preguntas#preguntas'\);/);
  assert.match(appJs, /history\.replaceState\(history\.state, '', '\/app' \+/);
  const home = readFileSync('public/home.html', 'utf8');
  assert.match(home, /href="\/preguntas#preguntas"/);
  assert.ok(!home.includes('href="/#preguntas"'), 'public FAQ must not use /#preguntas');
});

test('GET / is public without a session and 302 /app with a valid session', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const {base} = started;

    const anon = await fetch(base + '/', {redirect: 'manual'});
    assert.equal(anon.status, 200);
    assert.equal(anon.headers.get('cache-control'), 'private, no-cache');
    assert.equal(anon.headers.get('vary'), 'Cookie');
    const anonBody = await anon.text();
    assert.match(anonBody, /De una idea a una cartera de práctica/);
    assert.match(anonBody, /site-header/);

    const anonApp = await fetch(base + '/app', {redirect: 'manual'});
    assert.equal(anonApp.status, 200);
    assert.match(await anonApp.text(), /id="app"/);

    const cookie = await login(base, USER_B_EMAIL, USER_B_PASSWORD);
    const headers = {Cookie: cookie};

    const authed = await fetch(base + '/', {headers, redirect: 'manual'});
    assert.equal(authed.status, 302);
    assert.equal(authed.headers.get('location'), '/app');
    assert.equal(authed.headers.get('cache-control'), 'private, no-cache');
    assert.equal(authed.headers.get('vary'), 'Cookie');
    assert.equal(await authed.text(), '');

    const faq = await fetch(base + '/preguntas', {headers, redirect: 'manual'});
    assert.equal(faq.status, 200);
    const faqBody = await faq.text();
    assert.match(faqBody, /id="preguntas"/);
    assert.match(faqBody, /site-header/);

    const followed = await fetch(base + '/', {headers});
    assert.equal(followed.status, 200);
    assert.equal(new URL(followed.url).pathname, '/app');
    const panel = await followed.text();
    assert.match(panel, /id="app"/);
    assert.ok(!panel.includes('site-header'), 'must not flash public chrome');

    const head = await fetch(base + '/', {method: 'HEAD', headers, redirect: 'manual'});
    assert.equal(head.status, 302);
    assert.equal(head.headers.get('location'), '/app');

    const loginPage = await fetch(base + '/app', {headers, redirect: 'manual'});
    assert.equal(loginPage.status, 200);
    const how = await fetch(base + '/como-funciona', {headers, redirect: 'manual'});
    assert.equal(how.status, 200);
    assert.match(await how.text(), /Cómo funciona/);

    const stale = await fetch(base + '/', {headers: {Cookie: 'laviste_session=not-a-real-session'}, redirect: 'manual'});
    assert.equal(stale.status, 200);
    assert.match(await stale.text(), /site-header/);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('owner session also redirects public home and logout restores it', async () => {
  const dir = tmp();
  let app;
  try {
    const started = await startApp(dir);
    app = started.app;
    const cookie = await login(started.base, OWNER_EMAIL, OWNER_PASSWORD);
    const headers = {Cookie: cookie, 'Content-Type': 'application/json'};
    const authed = await fetch(started.base + '/', {headers, redirect: 'manual'});
    assert.equal(authed.status, 302);
    assert.equal(authed.headers.get('location'), '/app');

    const out = await fetch(started.base + '/api/logout', {method: 'POST', headers, body: '{}'});
    assert.equal(out.status, 200);
    const after = await fetch(started.base + '/', {headers: {Cookie: cookie}, redirect: 'manual'});
    assert.equal(after.status, 200);
    assert.match(await after.text(), /site-header/);
  } finally {
    if (app?.server.listening) await app.close();
    else app?.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
