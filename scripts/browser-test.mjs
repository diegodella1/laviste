import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {templates, createTake, activate} from '../lib/engine.mjs';
import {hashPassword} from '../lib/password.mjs';
import {PRACTICE_FOOTER} from '../lib/copy.mjs';
import {
  SESSION_EXPIRED, USER_ROLE_USER, USER_ROLE_SUPERADMIN, USER_LOGOUT, USER_MENU_FAQ, LOGIN_PRIVACY, HOME_EMPTY_TITLE,
  QUOTA_CHAT, AI_PAUSED_LABEL, AI_PAUSED_USER, AI_PRICES_MISSING,
} from '../public/copy.mjs';
import {money} from '../public/format.mjs';
import {takeTotal} from '../public/portfolio.mjs';
import {inflateSync} from 'node:zlib';

const PAPER_RGB = {r: 0xFF, g: 0xFF, b: 0xFF};

/** Read RGBA from an 8-bit PNG buffer (color types 2 or 6). */
function pngPixelRgb(buf, x, y) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    pos += 4;
    const type = buf.toString('ascii', pos, pos + 4);
    pos += 4;
    const data = buf.subarray(pos, pos + len);
    pos += len + 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  assert.equal(bitDepth, 8, 'PNG bit depth');
  assert.ok(colorType === 2 || colorType === 6, 'PNG color type');
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  let offset = 0;
  const row = new Uint8Array(stride);
  for (let rowY = 0; rowY < height; rowY++) {
    const filter = raw[offset++];
    const scan = raw.subarray(offset, offset + stride);
    offset += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = rowY > 0 ? row[i] : 0;
      const upLeft = rowY > 0 && i >= bpp ? row[i - bpp] : 0;
      let v = scan[i];
      if (filter === 1) v = (v + left) & 0xff;
      else if (filter === 2) v = (v + up) & 0xff;
      else if (filter === 3) v = (v + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) v = (v + paeth(left, up, upLeft)) & 0xff;
      row[i] = v;
    }
    if (rowY === y) {
      const px = x * bpp;
      return {r: row[px], g: row[px + 1], b: row[px + 2]};
    }
  }
  throw new Error('PNG row out of range');
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function rgbDist(a, b) {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

const fakeKey='sk-test-browser-only-never-real';
const password='browser-test-password';
const ownerEmail='diego@diegodella.ar';
const userBEmail='b@example.test';
const userBPassword='user-b-password-12';
const MARKER_B='TESIS-PRIVADA-DE-B-NO-CRUZAR';
async function submitLogin(page, email=ownerEmail, pw=password){
  await page.locator('#login [name="email"]').fill(email);
  await page.locator('#login [name="password"]').fill(pw);
  await page.locator('#login button[type="submit"]').click();
}

const DESKTOP_CHROME_MIN = 1024;
const SIDEBAR_W = 240;

async function assertShellCentered(page) {
  const geo = await page.evaluate(() => {
    const frame = document.querySelector('.app-frame');
    const main = document.querySelector('main.main');
    const shell = document.querySelector('.shell');
    const rail = document.querySelector('.app-frame > .thesis-rail');
    if (!frame || !main || !shell) return null;
    const frameBox = frame.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    const shellBox = shell.getBoundingClientRect();
    const railBox = rail && getComputedStyle(rail).display !== 'none' ? rail.getBoundingClientRect() : null;
    const areaLeft = railBox ? railBox.right : frameBox.left;
    const areaRight = frameBox.right;
    return {
      areaLeft,
      areaRight,
      areaMid: (areaLeft + areaRight) / 2,
      shellMid: (shellBox.left + shellBox.right) / 2,
      mainW: mainBox.width,
      areaW: areaRight - areaLeft,
      maxWidth: getComputedStyle(shell).maxWidth,
      classes: shell.className,
    };
  });
  assert.ok(geo, 'main and shell are present');
  assert.ok(Math.abs(geo.shellMid - geo.areaMid) <= 1, `shell axis ${geo.shellMid} vs available area ${geo.areaMid} (${geo.classes})`);
  assert.ok(geo.mainW >= geo.areaW - 1, `main ${geo.mainW} must fill available area ${geo.areaW}`);
  return geo;
}

async function assertDesktopChrome(page, width) {
  const geo = await page.evaluate(() => {
    const bar = document.querySelector('.topbar');
    const toggle = document.querySelector('.topnav-toggle');
    const a = bar?.getBoundingClientRect();
    return {
      barW: a?.width || 0,
      barH: a?.height || 0,
      barTop: a?.top || 0,
      barLeft: a?.left || 0,
      barRight: a?.right || 0,
      innerW: window.innerWidth,
      toggleVisible: !!(toggle && toggle.offsetParent && getComputedStyle(toggle).display !== 'none'),
      drawerOpen: !!document.querySelector('.topnav.open'),
      desktopMenu: !!document.querySelector('details.user-menu'),
      drawerMenu: getComputedStyle(document.querySelector('.user-menu-drawer') || document.body).display,
    };
  });
  assert.ok(Math.abs(geo.barW - SIDEBAR_W) <= 1, `sidebar width ${geo.barW} at ${width}`);
  assert.ok(geo.barH >= 200, `sidebar is vertical at ${width}: h=${geo.barH}`);
  assert.ok(geo.barTop <= 1 && geo.barLeft <= 1, 'sidebar is pinned top-left');
  assert.ok(geo.barRight <= SIDEBAR_W + 1, 'no full-bleed topbar on desktop');
  assert.equal(geo.toggleVisible, false, 'Menú toggle hidden on desktop');
  assert.equal(geo.drawerOpen, false, 'drawer closed on desktop');
  const home = await page.locator('a.topnav-link', {hasText: 'Inicio'}).count();
  const takes = await page.locator('a.topnav-link', {hasText: 'Mis tesis'}).count();
  const neu = await page.locator('a.topnav-link', {hasText: 'Nueva tesis'}).count();
  assert.ok(home >= 1 && takes >= 1 && neu >= 1, 'global nav items');
  const current = await page.locator('a.topnav-link[aria-current="page"].active').count();
  assert.ok(current >= 1, 'active nav has aria-current');
  await assertShellCentered(page);
  const focusOrder = await page.evaluate(() => {
    return [...document.querySelectorAll('.topbar a, .topbar button, .topbar summary')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      })
      .map(el => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim());
  });
  assert.match(focusOrder[0] || '', /la viste|La Viste/i);
  assert.ok(focusOrder.some(t => t.includes('Inicio')));
  assert.ok(focusOrder.some(t => t.includes('Tu cuenta')));
  assert.ok(!focusOrder.some(t => t === 'Menú'), 'toggle is not in desktop focus order');
}

async function assertMobileChrome(page, width) {
  const geo = await page.evaluate(() => {
    const bar = document.querySelector('.topbar');
    const toggle = document.querySelector('.topnav-toggle');
    const a = bar?.getBoundingClientRect();
    const t = toggle?.getBoundingClientRect();
    return {
      barW: a?.width || 0,
      barH: a?.height || 0,
      barLeft: a?.left || 0,
      innerW: window.innerWidth,
      clientW: document.documentElement.clientWidth,
      toggleH: t?.height || 0,
      toggleW: t?.width || 0,
      toggleVisible: !!(toggle && getComputedStyle(toggle).display !== 'none'),
      desktopMenuDisplay: getComputedStyle(document.querySelector('details.user-menu') || document.body).display,
    };
  });
  assert.ok(geo.barLeft <= 1, `topbar starts at the left edge at ${width}`);
  assert.ok(geo.barW > SIDEBAR_W + 40, `topbar is horizontal, not a ${SIDEBAR_W}px sidebar at ${width}: ${geo.barW}`);
  assert.ok(geo.barW >= geo.clientW - 24, `topbar is full-bleed at ${width}: ${geo.barW} vs client ${geo.clientW}`);
  assert.ok(geo.barH <= 72, `topbar stays a row at ${width}: ${geo.barH}`);
  assert.equal(geo.toggleVisible, true, `Menú toggle visible at ${width}`);
  assert.ok(geo.toggleH >= 44 - 1 && geo.toggleW >= 44 - 1, `toggle target ${geo.toggleW}x${geo.toggleH}`);
}

async function assertTabletDrawer(page, width) {
  await page.setViewportSize({width, height: 900});
  await page.waitForFunction(min => {
    const bar = document.querySelector('.topbar');
    return bar && bar.getBoundingClientRect().width > min;
  }, SIDEBAR_W + 40);
  await assertMobileChrome(page, width);
  const toggle = page.locator('.topnav-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.locator('.topnav.open').waitFor();
  const nav = await page.evaluate(() => {
    const el = document.querySelector('.topnav.open');
    const r = el.getBoundingClientRect();
    const item = el.querySelector('a.topnav-link');
    return {
      top: r.top,
      height: r.height,
      itemH: item ? item.getBoundingClientRect().height : 0,
      token: getComputedStyle(document.documentElement).getPropertyValue('--lv-topbar-h').trim(),
    };
  });
  assert.ok(nav.itemH >= 44, `drawer link ${nav.itemH} at ${width}`);
  assert.ok(nav.height >= 900 - 80, `drawer fills under topbar at ${width}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.topnav.open'), {timeout: 2000});
}

async function openAccountChrome(page, width) {
  if (width < DESKTOP_CHROME_MIN) {
    const toggle = page.locator('.topnav-toggle');
    if (await toggle.isVisible()) {
      const expanded = await toggle.getAttribute('aria-expanded');
      if (expanded !== 'true') await toggle.click();
      await page.locator('.topnav.open').waitFor();
    }
    await page.locator('.user-menu-drawer').waitFor();
    return page.locator('.user-menu-drawer');
  }
  const menu = page.locator('details.user-menu');
  await menu.locator('summary').click();
  await page.locator('details.user-menu[open]').waitFor();
  return menu;
}

async function closeAccountChrome(page, width) {
  await page.keyboard.press('Escape');
  if (width < DESKTOP_CHROME_MIN) {
    await page.waitForFunction(() => !document.querySelector('.topnav.open'), {timeout: 2000}).catch(() => {});
  } else {
    await page.waitForFunction(() => !document.querySelector('details.user-menu[open]'), {timeout: 2000}).catch(() => {});
  }
}

async function assertRoleChrome(page, {email, role, superadmin, width}) {
  const host = await openAccountChrome(page, width);
  assert.ok(await host.getByText(email, {exact: true}).count(), `account shows ${email}`);
  assert.ok(await host.getByText(role, {exact: true}).count(), `account shows ${role}`);
  const logout = host.locator('[data-action=logout]');
  assert.equal(await logout.count(), 1, 'logout in account menu');
  assert.match(await logout.innerText(), new RegExp(USER_LOGOUT));
  assert.ok(!/\bprimary\b/.test(await logout.getAttribute('class') || ''), 'logout is not the cobalt primary');
  const faq = host.locator('a.user-menu-link[href="/preguntas#preguntas"]');
  const privacy = host.locator('a.user-menu-link[href="/privacidad"]');
  assert.equal(await faq.count(), 1, 'FAQ link in account menu');
  assert.equal(await privacy.count(), 1, 'privacy link in account menu');
  assert.equal((await faq.innerText()).trim(), USER_MENU_FAQ);
  assert.equal((await privacy.innerText()).trim(), LOGIN_PRIVACY);
  assert.ok(!/\bbtn\b/.test(await faq.getAttribute('class') || ''), 'FAQ is text, not a button');
  if (width >= DESKTOP_CHROME_MIN) {
    const summary = page.locator('details.user-menu summary');
    await page.waitForFunction(() =>
      document.querySelector('details.user-menu[open] summary')?.getAttribute('aria-expanded') === 'true'
    );
    assert.equal(await summary.getAttribute('aria-expanded'), 'true');
    await page.waitForFunction(() => document.activeElement?.getAttribute('href') === '/preguntas#preguntas');
  }
  const settingsLinks = await page.locator('#app-topnav a.topnav-link', {hasText: 'Configuración'}).count();
  assert.equal(settingsLinks, superadmin ? 1 : 0, 'Configuración is superadmin-only');
  assert.equal(await page.locator('#openai-settings').count(), 0);
  assert.equal(await page.locator('a.topnav-link', {hasText: 'Admin ·'}).count(), 0);
  assert.equal(await page.locator('[data-action="quotes-refresh"]').count(), 0);
  if (width <= 390) {
    const logoutH = await host.locator('[data-action=logout]').evaluate(el => el.getBoundingClientRect().height);
    assert.ok(logoutH >= 44 - 1, `logout target ${logoutH}px`);
    const faqH = await faq.evaluate(el => el.getBoundingClientRect().height);
    assert.ok(faqH >= 44 - 1, `FAQ target ${faqH}px`);
    mkdirSync('/opt/cursor/artifacts/screenshots', {recursive: true});
    const shot = 'user_menu_faq_390.png';
    await page.screenshot({path: join('work', shot), fullPage: false});
    await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', shot), fullPage: false});
    await page.screenshot({path: join('/opt/cursor/artifacts', shot), fullPage: false});
  }
  return host;
}

async function runAbIsolation({browser, app, base, page, width, ownerTitle}) {
  const userId = app.store.createUser({
    email: userBEmail,
    displayName: 'Bee',
    role: 'user',
    passwordHash: hashPassword(userBPassword),
  });
  mkdirSync('/opt/cursor/artifacts/screenshots', {recursive: true});
  await page.evaluate(() => {
    const toast = document.getElementById('toast');
    if (toast) toast.style.display = 'none';
    location.hash = '#/';
  });
  await page.waitForSelector('.hero-n, .home-empty');
  await page.waitForFunction(() => !document.querySelector('.lv-panel'));
  await assertRoleChrome(page, {email: ownerEmail, role: USER_ROLE_SUPERADMIN, superadmin: true, width});
  if (width === 1440 || width === 390) {
    const ownerShot = `owner_menu_${width}.png`;
    await page.screenshot({path: join('work', ownerShot), fullPage: false});
    await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', ownerShot), fullPage: false});
  }
  await closeAccountChrome(page, width);

  const ctxB = await browser.newContext({viewport: {width, height: 1000}});
  const pageB = await ctxB.newPage();
  pageB.setDefaultTimeout(20000);
  try {
    await pageB.goto(base + '/app');
    await submitLogin(pageB, userBEmail, userBPassword);
    await pageB.waitForSelector('.home-empty');
    assert.equal(await pageB.locator('.home-empty[data-empty="tesis"]').count(), 1, 'new user empty state');
    assert.ok(await pageB.getByRole('heading', {name: HOME_EMPTY_TITLE}).count());
    assert.equal(await pageB.getByText(ownerTitle, {exact: false}).count(), 0, 'user B must not see owner thesis');
    assert.equal(await pageB.locator('#app-topnav a.topnav-link', {hasText: 'Configuración'}).count(), 0);
    assert.equal(await pageB.locator('.pending-banner').count(), 0, 'OpenAI banner is superadmin-only');
    assert.equal(await pageB.evaluate(() => document.documentElement.dataset.lvRole), 'user');
    if (width === 1440 || width === 390) {
      const emptyShot = `new_user_empty_${width}.png`;
      await pageB.screenshot({path: join('work', emptyShot), fullPage: true});
      await pageB.screenshot({path: join('/opt/cursor/artifacts/screenshots', emptyShot), fullPage: true});
    }
    await pageB.evaluate(() => { location.hash = '#/settings'; });
    await pageB.waitForFunction(() => !location.hash.includes('settings'));
    assert.equal(await pageB.locator('#openai-settings').count(), 0, 'user cannot open OpenAI settings');
    await assertRoleChrome(pageB, {email: userBEmail, role: USER_ROLE_USER, superadmin: false, width});
    if (width === 1440 || width === 390) {
      const roleShot = `user_role_${width}.png`;
      await pageB.screenshot({path: join('work', roleShot), fullPage: false});
      await pageB.screenshot({path: join('/opt/cursor/artifacts/screenshots', roleShot), fullPage: false});
    }
    await closeAccountChrome(pageB, width);

    const takeB = createTake(templates[0]);
    takeB.title = MARKER_B;
    takeB.thesis = MARKER_B;
    activate(takeB, 512_000);
    const scopedB = app.store.forUser(userId);
    scopedB.putTake(takeB);
    scopedB.version(takeB);
    await pageB.evaluate(() => { location.hash = '#/takes'; });
    await pageB.waitForFunction(title => document.body.innerText.includes(title), MARKER_B);
    assert.equal(await pageB.getByText(ownerTitle, {exact: false}).count(), 0, 'B list must not include owner thesis');

    await page.evaluate(() => { location.hash = '#/takes'; });
    await page.waitForSelector('.thesis-list');
    await page.waitForFunction(title => document.body.innerText.includes(title), ownerTitle);
    assert.equal(await page.getByText(MARKER_B).count(), 0, 'owner must not see user B thesis');

    await ctxB.clearCookies();
    await pageB.evaluate(() => { location.hash = '#/new'; });
    await pageB.locator('#login').waitFor();
    assert.equal((await pageB.locator('#login-error').innerText()).trim(), SESSION_EXPIRED);
  } finally {
    await pageB.close();
    await ctxB.close();
  }
}

async function assertOnLoggedInPanel(page) {
  const loc = new URL(page.url());
  assert.equal(loc.pathname, '/app', `must stay on /app, got ${loc.pathname}${loc.hash}`);
  assert.ok(!loc.hash || loc.hash === '#' || loc.hash === '#/' || loc.hash.startsWith('#/?'), `panel hash ${loc.hash}`);
  assert.equal(await page.locator('.site-header').count(), 0, 'public site chrome must not appear');
  assert.equal(await page.locator('#login').count(), 0, 'must remain logged in');
  await page.waitForSelector('.home-empty, .hero-n');
  const h1 = (await page.locator('h1').first().innerText()).trim();
  assert.notEqual(h1, 'De una idea a una cartera de práctica.', 'Inicio must not open the public home');
}

async function runInicioStaysOnPanel({browser, app, base, width}) {
  if (width !== 1440 && width !== 390) return;
  const email = `inicio-${width}@example.test`;
  const pw = 'inicio-user-password-12';
  app.store.createUser({
    email, displayName: 'Inicio', role: 'user', passwordHash: hashPassword(pw),
  });
  const ctx = await browser.newContext({viewport: {width, height: 1000}});
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(base + '/app');
    await submitLogin(page, email, pw);
    await page.waitForSelector('.home-empty, .hero-n');
    const href = await page.locator('a.topnav-link', {hasText: 'Inicio'}).getAttribute('href');
    assert.equal(href, '#/', 'Inicio href is the SPA panel');
    assert.equal(await page.locator('a.brand').getAttribute('href'), '#/');
    await page.evaluate(() => { location.hash = '#/new'; });
    await page.waitForSelector('.entry-paths, .new-view');
    if (width < DESKTOP_CHROME_MIN) {
      const toggle = page.locator('.topnav-toggle');
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
      await page.locator('.topnav.open').waitFor();
    }
    await page.locator('a.topnav-link', {hasText: 'Inicio'}).click();
    await page.waitForFunction(() => location.pathname === '/app' && (!location.hash || location.hash === '#' || location.hash === '#/'));
    await assertOnLoggedInPanel(page);
    mkdirSync('/opt/cursor/artifacts/screenshots', {recursive: true});
    const shot = `inicio_stays_on_panel_${width}.png`;
    await page.screenshot({path: join('work', shot), fullPage: false});
    await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', shot), fullPage: false});

    await page.goto(base + '/');
    await page.waitForURL(url => new URL(url).pathname === '/app');
    await assertOnLoggedInPanel(page);

    await page.goto(base + '/privacidad');
    await page.goto(base + '/app#preguntas');
    await page.waitForURL(url => {
      const u = new URL(url);
      return u.pathname === '/preguntas' && u.hash === '#preguntas';
    });
    assert.equal(await page.locator('#preguntas').count(), 1, 'FAQ landmark after boot redirect');
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function runQuotaToast({browser, app, base, width}) {
  if (width !== 1440) return;
  const email = 'toast@example.test';
  const pw = 'toast-password-12';
  const userId = app.store.createUser({
    email, displayName: 'Toast', role: 'user', passwordHash: hashPassword(pw),
  });
  app.store.setUserLimits(userId, {chatPerDay: 1, rpm: 20}, {updatedBy: app.store.ownerUserId()});
  const ctx = await browser.newContext({viewport: {width, height: 1000}});
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(base + '/app');
    await submitLogin(page, email, pw);
    await page.waitForSelector('.home-empty');
    await page.evaluate(() => { location.hash = '#/new'; });
    await page.getByRole('link', {name: 'Proponer cartera'}).click();
    await page.locator('#new-prompt').fill('Creo que Vaca Muerta puede sostener la producción argentina en los próximos años.');
    await page.locator('#new-chat button[type=submit]').click();
    await page.locator('#chat-send, [data-action=activate-practice]').first().waitFor({timeout: 15000});
    await page.locator('#chat-send textarea[name=message]').fill('Otro mensaje para pasar la cuota diaria.');
    await page.locator('#chat-send button[type=submit]').click();
    await page.waitForFunction(() => {
      const toast = document.getElementById('toast');
      return toast && toast.style.display !== 'none' && (toast.textContent || '').length > 8;
    }, {timeout: 10000});
    const text = (await page.locator('#toast').innerText()).trim();
    assert.equal(text, QUOTA_CHAT);
    mkdirSync('/opt/cursor/artifacts/screenshots', {recursive: true});
    await page.screenshot({path: join('work', 'quota_toast_user.png'), fullPage: false});
    await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', 'quota_toast_user.png'), fullPage: false});
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function runAiPauseBrowser({browser, app, base, width}) {
  if (width !== 1440) return;
  mkdirSync('/opt/cursor/artifacts/screenshots', {recursive: true});
  const email = 'paused@example.test';
  const pw = 'paused-password-12';
  app.store.createUser({
    email, displayName: 'Pausa', role: 'user', passwordHash: hashPassword(pw),
  });
  app.store.setAiControl({enabled: false}, {updatedBy: app.store.ownerUserId()});
  const ctx = await browser.newContext({viewport: {width, height: 1000}});
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(base + '/app');
    await submitLogin(page, email, pw);
    await page.waitForSelector('.ai-paused-banner, .home-empty');
    const banner = page.locator('.ai-paused-banner');
    assert.equal(await banner.count(), 1, 'user sees IA en pausa banner');
    assert.match((await banner.innerText()).trim(), new RegExp(AI_PAUSED_LABEL));
    assert.match((await banner.innerText()).trim(), new RegExp(AI_PAUSED_USER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await page.screenshot({path: join('work', 'ai_paused_user.png'), fullPage: false});
    await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', 'ai_paused_user.png'), fullPage: false});
  } finally {
    await page.close();
    await ctx.close();
    app.store.setAiControl({enabled: true}, {updatedBy: app.store.ownerUserId()});
  }
}
const source={id:1,url:'https://example.com/company-report',title:'Informe corporativo de prueba'};
const fetcher=async(url,options)=>{
  const body=JSON.parse(options.body);
  let output;
  if(body.tools)output=[{type:'web_search_call',action:{sources:[source]}},{type:'message',content:[{type:'output_text',text:'Informe de prueba: cambió la demanda.',annotations:[source]}]}];
  else if(body.text?.format?.name==='thesis_review')output=[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'Hay evidencia para revisar la demanda.',attention:'watch',reason:'Se necesita confirmar adopción.',resolved:false,sourceIds:[1],events:[{title:'Demanda bajo observación',fact:'Un informe de prueba indica menor demanda.',interpretation:'Conviene revisar el supuesto de adopción.',uncertainty:'Es un fixture del test.',affected:'Demanda de hardware',publishedAt:null,sourceIds:[1]}]})}]}];
  else output=[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'Podemos explorar esa idea. Esta cartera usa precios simulados.',proposal:templates[0]})}]}];
  return {ok:true,json:async()=>({status:'completed',output,usage:{input_tokens:25,output_tokens:50}})};
};
const iolFetcher=async url=>({ok:true,json:async()=>url.endsWith('/token')?{access_token:'test-access',refresh_token:'test-refresh',expires_in:900}:url.endsWith('estadocuenta')?{cuentas:[{numero:'test-account',moneda:'peso_Argentino',disponible:1000,saldo:1000},{numero:'test-usd',moneda:'dolar_Estadounidense',disponible:10,saldo:10}]}:url.includes('/Cotizacion')?{ultimoPrecio:100,fechaHora:new Date().toISOString(),moneda:'peso_Argentino'}:{activos:[{titulo:{simbolo:'YPFD',mercado:'bCBA',descripcion:'YPF',moneda:'peso_Argentino'},cantidad:2,ultimoPrecio:100}]}});

mkdirSync('work',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_USE_BUNDLED?{}:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}),args:['--no-sandbox','--disable-gpu']});
try{
  for(const width of [1440,1280,390,360]){
    const dir=mkdtempSync(join(tmpdir(),'laviste-browser-'));const key=join(dir,'master.key');writeFileSync(key,'12'.repeat(32));
    const app=createApp({dataDir:dir,password,masterKeyPath:key,apiKey:'',port:0,host:'127.0.0.1',secure:false,origin:'',fetcher,iolFetcher,quotesLive:false,quotesFixture:true});
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+app.server.address().port;
    const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    async function route(path){await page.goto(base+'/app#/'+path);await page.waitForFunction(()=>document.querySelector('.main'));}
    try{
      await page.route('**/api/state', async (route, request) => {
        if (request.method() === 'GET') await new Promise(r => setTimeout(r, 700));
        await route.continue();
      });
      await page.goto(base+'/app');
      const sessionPre = await page.evaluate(async () => {
        const r = await fetch('/api/session', {credentials: 'same-origin'});
        return {status: r.status, body: await r.json()};
      });
      assert.equal(sessionPre.status, 200, 'GET /api/session is 200 pre-login');
      assert.equal(sessionPre.body.authenticated, false);
      const statePre = await page.evaluate(async () => (await fetch('/api/state', {credentials: 'same-origin'})).status);
      assert.equal(statePre, 401, 'protected /api/state stays 401 pre-login');
      await page.locator('#login').waitFor();
      assert.equal(await page.locator('#login [name="email"]').count(), 1, 'login asks for email');
      assert.equal(await page.locator('#login [name="password"]').count(), 1, 'login asks for password');
      if (width === 1440 || width === 390) {
        await page.screenshot({path: `work/login-${width}.png`, fullPage: true});
      }
      await submitLogin(page);
      await page.waitForSelector('.home-loading');
      assert.equal(await page.locator('.home-empty').count(), 0, 'empty state must not show while loading');
      await page.waitForFunction(() => !document.querySelector('.home-loading'));
      assert.equal(await page.locator('.home-loading').count(), 0);
      await page.waitForSelector('.home-empty');
      const sessionPost = await page.evaluate(async () => {
        const r = await fetch('/api/session', {credentials: 'same-origin'});
        return {status: r.status, body: await r.json()};
      });
      assert.equal(sessionPost.status, 200);
      assert.equal(sessionPost.body.authenticated, true);
      assert.equal(sessionPost.body.role, 'superadmin');
      assert.equal(sessionPost.body.user?.email, ownerEmail);
      await page.getByRole('link', {name: 'Proponer cartera'}).waitFor();
      await page.getByRole('link', {name: 'Armar a mano'}).waitFor();
      assert.ok(await page.getByText('No hay modo automático', {exact: false}).count());
      await page.unroute('**/api/state');
      await page.getByText(PRACTICE_FOOTER, {exact: true}).waitFor();
      await route('settings');await page.locator('#openai-settings').waitFor();
      await page.locator('#openai-settings [name=apiKey]').fill(fakeKey);
      await page.locator('#openai-settings button[type=submit]').click();
      await page.waitForSelector('[data-action="test-openai"]:not([disabled])', {timeout: 10000});
      await page.locator('[data-action=test-openai][data-value=chat]').click();await page.getByText('Conversación: Verificado',{exact:false}).waitFor();
      await page.locator('[data-action=test-openai][data-value=news]').click();await page.getByText('Búsqueda: Verificado',{exact:false}).waitFor();
      await page.screenshot({path:`work/settings-${width}.png`,fullPage:true});
      if (width === 1440) {
        mkdirSync('/opt/cursor/artifacts/screenshots', {recursive: true});
        assert.ok(await page.getByText(AI_PRICES_MISSING).count(), 'superadmin sees null-price budget warning');
        await page.screenshot({path: join('work', 'ai_prices_missing.png'), fullPage: false});
        await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', 'ai_prices_missing.png'), fullPage: false});
      }
      await runQuotaToast({browser, app, base, width});
      await runAiPauseBrowser({browser, app, base, width});
      await runInicioStaysOnPanel({browser, app, base, width});
      await route('new');
      await page.locator('.entry-paths').waitFor();
      await page.getByRole('link', {name: 'Armar a mano'}).click();
      await page.locator('.template-pick').first().waitFor();
      await page.locator('[data-action=template][data-index="0"]').click();
      await page.locator('[data-action=draft-weights]').waitFor();
      await page.locator('[data-action=activate]').waitFor();
      const draftPrimaries = await page.evaluate(() => {
        const modal = document.getElementById('modal');
        return [...document.querySelectorAll('.btn.primary')].filter(el => !modal?.contains(el)).length;
      });
      assert.equal(draftPrimaries, 1, 'draft: one cobalt primary (Activar práctica)');
      const draftId = await page.evaluate(() => location.hash.match(/take\/([^/]+)/)?.[1]);
      await page.locator('[data-action=draft-weights]').click();
      await page.locator('#draft-weights-form [name=weight-YPF]').fill('20');
      await page.locator('#draft-weights-form button[type=submit]').click();
      await page.waitForFunction(() => !document.getElementById('modal')?.open);
      assert.equal(app.store.take(draftId).holdings.find(h => h.ticker === 'YPF').weight, 20);
      assert.equal(app.store.take(draftId).phase, 'draft');
      await route('new');
      await page.getByRole('link', {name: 'Proponer cartera'}).click();
      await page.locator('#new-prompt').fill('Creo que Vaca Muerta puede sostener la producción argentina en los próximos años.');await page.locator('#new-chat button[type=submit]').click();
      await page.locator('[data-action=activate-practice]').waitFor();await page.getByText(PRACTICE_FOOTER, {exact: true}).waitFor();
      await page.locator('[data-action=adjust-manual]').waitFor();
      await page.getByRole('button', {name: 'Pedile un ajuste'}).waitFor();
      assert.ok(await page.locator('.portfolio-card .ticker-mark').count() >= 2, 'proposal cards show ticker marks');
      assert.ok(await page.locator('.portfolio-card .ticker-fallback').count() >= 2, 'proposal marks keep initials fallback');
      await page.locator('[data-action=adjust-proposal]').click();
      await page.waitForFunction(() => {
        const el = document.querySelector('.chat-dock textarea, .dock-inner textarea');
        return el && document.activeElement === el;
      });
      await page.locator('[data-action=activate-practice]').click();await page.locator('#activate-form button[type=submit]').click();await page.locator('[data-action=review]').waitFor();
      await app.scheduler.tick();
      const take=app.store.takes().find(t => t.phase === 'active');
      assert.ok(take, 'Proponer path should activate a practice take');
      async function hashNav(path, label) {
        await page.evaluate(p => { location.hash = '#/' + String(p).replace(/^\//, ''); }, path);
        await page.waitForFunction(() => document.querySelector('.main'));
        await page.waitForTimeout(150);
      }
      // HN1: fresh state after scheduler without full reload
      await hashNav('', 'HN1a');
      await hashNav('take/' + take.id + '/news', 'HN1b');
      await page.locator('.news-card, .verdict, .timeline .disclosure-btn, .timeline-item').first().waitFor({timeout: 5000});
      // HN2: title-only putTake (no version bump) must show after hash nav + revalidate
      app.store.transaction(() => {
        const latest = app.store.take(take.id);
        latest.title = 'HN2 título actualizado';
        app.store.putTake(latest);
      });
      await hashNav('');
      await hashNav('take/' + take.id + '/news', 'HN2');
      await page.locator('.take-header h1').filter({hasText: 'HN2 título actualizado'}).waitFor();
      const takeNow = app.store.take(take.id);
      const headerMoney = (await page.locator('.take-hero-val').innerText()).replace(/\s+/g, ' ').trim();
      assert.equal(headerMoney, money(takeTotal(takeNow)).replace(/\s+/g, ' ').trim(), 'thesis header money is this take only');
      assert.ok(await page.locator('.take-header .eyebrow, .take-header .lab').filter({hasText: /Cartera de práctica/i}).count());
      assert.ok(await page.locator('.take-header .chip-s, .take-header-status .chip-s').count(), 'thesis header keeps attention chip');
      // HN3–HN5: deep links open the matching panel over Resumen
      for (const tab of ['positions', 'idea', 'settings']) {
        await hashNav('take/' + take.id + '/' + tab, 'HN3-5-' + tab);
        await page.waitForSelector(`.lv-panel[data-panel="${tab}"]`);
        assert.equal(await page.locator(`.panel-chip[data-value="${tab}"]`).getAttribute('aria-expanded'), 'true');
      }
      await hashNav('take/' + take.id + '/positions');
      await page.locator('.lv-panel[data-panel="positions"]').waitFor();
      await page.locator('.lv-panel .comp-bar').waitFor();
      await page.locator('.positions-chip').waitFor();
      assert.equal(await page.locator('.positions-chip').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('.libro-actions .btn.primary').count(), 1);
      const posPrimaries = await page.evaluate(() => {
        const modal = document.getElementById('modal');
        return [...document.querySelectorAll('.btn.primary')].filter(el => !modal?.contains(el)).length;
      });
      assert.equal(posPrimaries, 1, 'Posiciones activa: one cobalt primary (Libro)');
      async function clickLibro(action) {
        const primary = page.locator(`.libro-actions > .btn.primary[data-action="${action}"]`);
        if (await primary.count()) {
          await primary.scrollIntoViewIfNeeded();
          await primary.click();
          return;
        }
        if (action === 'practice-weights') {
          const edit = page.locator('.bucket-edit').first();
          if (await edit.count()) {
            await edit.scrollIntoViewIfNeeded();
            await edit.click();
            return;
          }
        }
        const details = page.locator('.libro-more');
        if (!(await details.evaluate(el => el.open))) await details.locator('summary').click();
        await page.locator(`.more-menu [data-action="${action}"]`).click();
      }
      const investedBefore = app.store.take(take.id).invested;
      await clickLibro('practice-aporte');
      await page.locator('#practice-cash-form [name=amount]').fill('25000');
      await page.locator('#practice-cash-form button[type=submit]').click();
      await page.locator('#modal[open] [data-action=confirm-order]').waitFor();
      assert.equal(app.store.take(take.id).invested, investedBefore, 'preview must not move capital');
      await page.locator('#modal[open] [data-action=confirm-order]').click();
      await page.waitForFunction(() => !document.getElementById('modal')?.open && document.querySelector('[data-action=practice-aporte]'));
      assert.equal(app.store.take(take.id).invested, investedBefore + 25000);
      const unitsBefore = app.store.take(take.id).holdings.map(h => h.units);
      await clickLibro('practice-weights');
      await page.locator('#practice-weights-form [name=weight-YPF]').fill('22');
      await page.locator('#practice-weights-form button[type=submit]').click();
      await page.locator('#modal[open] [data-action=confirm-order]').waitFor();
      assert.deepEqual(app.store.take(take.id).holdings.map(h => h.units), unitsBefore);
      await page.locator('#modal[open] [data-action=confirm-order]').click();
      await page.waitForFunction(() => !document.getElementById('modal')?.open && document.querySelector('[data-action=practice-weights]'));
      assert.deepEqual(app.store.take(take.id).holdings.map(h => h.units), unitsBefore);
      assert.equal(app.store.take(take.id).holdings.find(h => h.ticker === 'YPF').weight, 22);
      await clickLibro('practice-trade');
      await page.locator('#practice-trade-form [name=side]').selectOption('compra');
      await page.locator('#practice-trade-form [name=ticker]').selectOption('GGAL');
      await page.locator('#practice-trade-form [name=by]').selectOption('units');
      await page.locator('#practice-trade-form [name=units]').fill('1');
      await page.locator('#practice-trade-form button[type=submit]').click();
      await page.locator('#modal[open] [data-action=confirm-order]').waitFor();
      const ggalBefore = app.store.take(take.id).holdings.find(h => h.ticker === 'GGAL').units;
      await page.locator('#modal[open] [data-action=confirm-order]').click();
      await page.waitForFunction(() => !document.getElementById('modal')?.open && document.querySelector('[data-action=practice-trade]'));
      assert.equal(app.store.take(take.id).holdings.find(h => h.ticker === 'GGAL').units, ggalBefore + 1);
      await hashNav('');
      await page.waitForSelector('.home-chart');
      assert.equal(await page.locator('.app-frame > .thesis-rail').count(), 0, 'rail must not appear on Home');
      const homePrimaries = await page.evaluate(() => {
        const modal = document.getElementById('modal');
        return [...document.querySelectorAll('.btn.primary')].filter(el => !modal?.contains(el)).length;
      });
      assert.equal(homePrimaries, 1, 'home: one cobalt primary');
      await page.locator('.thesis-list-delta').first().waitFor();
      await page.waitForFunction(() => document.querySelector('.home-chart .chart-host svg'));
      const homeLegend = await page.locator('.home-chart .legend').count();
      assert.equal(homeLegend, 0, 'home chart bottom legend removed');
      mkdirSync('/opt/cursor/artifacts/screenshots', {recursive: true});
      await page.evaluate(() => {
        const toast = document.getElementById('toast');
        if (toast) toast.style.display = 'none';
      });
      if (width >= DESKTOP_CHROME_MIN) {
        await assertDesktopChrome(page, width);
        const homeCol = await page.evaluate(() => getComputedStyle(document.querySelector('.shell')).maxWidth);
        assert.equal(homeCol, '880px', `home shell max-width at ${width}`);
        const homeShot = `sidebar_home_${width}.png`;
        await page.screenshot({path: join('work', homeShot), fullPage: false});
        await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', homeShot), fullPage: false});
      } else {
        await assertMobileChrome(page, width);
        if (width === 390) {
          await page.screenshot({path: join('work', 'sidebar_home_390.png'), fullPage: false});
          await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', 'sidebar_home_390.png'), fullPage: false});
        }
      }
      if (width === 1440) {
        for (const tablet of [800, 900, 1023]) await assertTabletDrawer(page, tablet);
        await page.setViewportSize({width: 900, height: 900});
        await page.waitForTimeout(80);
        await assertShellCentered(page);
        await page.setViewportSize({width: 1024, height: 900});
        await page.waitForFunction(w => {
          const bar = document.querySelector('.topbar');
          return bar && Math.abs(bar.getBoundingClientRect().width - w) <= 2;
        }, SIDEBAR_W);
        await assertDesktopChrome(page, 1024);
        await page.setViewportSize({width: 1440, height: 1000});
        await page.waitForFunction(w => {
          const bar = document.querySelector('.topbar');
          return bar && Math.abs(bar.getBoundingClientRect().width - w) <= 2;
        }, SIDEBAR_W);
        await assertDesktopChrome(page, 1440);
      }
      if (width <= 390) {
        await page.waitForFunction(() => document.querySelector('.home-chart .chart-host svg'));
        const layout = await page.evaluate(() => {
          const host = document.querySelector('.home-chart .chart-host');
          const svg = host?.querySelector('svg');
          return {
            hostW: host?.clientWidth || 0,
            svgW: svg ? Math.ceil(svg.getBoundingClientRect().width) : 0,
            endLabels: host?.dataset.endLabels || '',
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert.equal(layout.endLabels, '0', `end labels must hide at ${width}`);
        assert.ok(layout.svgW <= layout.hostW + 2, `chart svg must fit host at ${width}: ${layout.svgW} > ${layout.hostW}`);
        assert.equal(layout.overflow, false, `home chart must not overflow at ${width}`);
      }
      await hashNav('take/' + take.id + '/positions');
      await page.locator('.lv-panel[data-panel="positions"]').waitFor();
      await page.locator('.positions-chip').click();
      await page.waitForSelector('.positions-disclosure:not([hidden])');
      await page.waitForFunction(() => document.querySelectorAll('.ticker-mark').length >= 4);
      assert.ok(await page.locator('.ticker-mark').count() >= 4, 'positions show ticker marks');
      await hashNav('take/' + take.id);
      await page.locator('.take-positions-chart').waitFor();
      const takeQuote = await page.locator('.take-positions-chart .small.muted').first().innerText();
      assert.ok(/precio|cotización|ejemplo/i.test(takeQuote), 'take chart shows delayed-quote note');
      await hashNav('take/' + take.id + '/positions');
      await page.locator('.lv-panel[data-panel="positions"]').waitFor();
      await page.goBack();
      await page.waitForFunction(() => !document.querySelector('.lv-panel'));
      if (width >= DESKTOP_CHROME_MIN) {
        mkdirSync('/opt/cursor/artifacts/screenshots', {recursive: true});
        await hashNav('take/' + take.id);
        await page.waitForFunction(() => !document.querySelector('.lv-panel'));
        assert.equal(await page.locator('.app-frame > .thesis-rail').count(), 1, 'rail on thesis desktop');
        assert.equal(await page.locator('a.topnav-link[aria-current="true"]').filter({hasText: 'Mis tesis'}).count(), 1, 'tesis pages mark Mis tesis');
        const takeCol = await assertShellCentered(page);
        assert.equal(takeCol.maxWidth, '760px', `take shell max-width at ${width}`);
        const railGeo = await page.evaluate(() => {
          const rail = document.querySelector('.app-frame > .thesis-rail');
          const bar = document.querySelector('.topbar');
          const dock = document.querySelector('.chat-dock');
          const r = rail.getBoundingClientRect();
          const b = bar.getBoundingClientRect();
          return {
            railTop: r.top,
            railH: r.height,
            railLeft: r.left,
            sidebarRight: b.right,
            dockLeft: dock ? dock.getBoundingClientRect().left : null,
            viewH: window.innerHeight,
          };
        });
        assert.ok(Math.abs(railGeo.railTop) <= 1, `rail sticky top 0 at ${width}`);
        assert.ok(Math.abs(railGeo.railH - railGeo.viewH) <= 2, `rail height 100dvh at ${width}: ${railGeo.railH}`);
        assert.ok(railGeo.railLeft >= railGeo.sidebarRight - 1, `rail does not overlap sidebar at ${width}`);
        if (railGeo.dockLeft != null) {
          assert.ok(Math.abs(railGeo.dockLeft - (SIDEBAR_W + 260)) <= 1, `chat dock starts after rail at ${width}: ${railGeo.dockLeft}`);
        }
        if (width === 1280) {
          await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });
          await page.screenshot({path: join('work', 'sidebar_take_1280.png'), fullPage: false});
          await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', 'sidebar_take_1280.png'), fullPage: false});
        }
        assert.equal(await page.locator('.panel-chip[data-value="positions"]').getAttribute('aria-controls'), null, 'aria-controls omitted while panel is closed');
        const histBefore = await page.evaluate(() => history.length);
        await page.locator('.panel-chip[data-value="positions"]').click();
        await page.locator('.lv-panel[data-panel="positions"]').waitFor();
        assert.equal(await page.locator('.panel-chip[data-value="positions"]').getAttribute('aria-controls'), 'take-panel');
        const geo = await page.evaluate(() => {
          const bar = document.querySelector('.topbar');
          const scrim = document.querySelector('.lv-scrim');
          const panel = document.querySelector('.lv-panel');
          const close = document.querySelector('.panel-close');
          const a = bar.getBoundingClientRect();
          const s = scrim.getBoundingClientRect();
          const p = panel.getBoundingClientRect();
          const c = close.getBoundingClientRect();
          return {
            sidebarW: a.width,
            sidebarRight: a.right,
            sidebarZ: Number(getComputedStyle(bar).zIndex),
            scrimZ: Number(getComputedStyle(scrim).zIndex),
            scrimLeft: s.left,
            scrimTop: s.top,
            panelTop: p.top,
            closeVisible: c.width > 0 && c.top >= -1 && c.bottom <= innerHeight,
            sidebarCovered: s.left < a.right - 1,
            inert: document.querySelector('.app-frame')?.hasAttribute('inert') === true,
          };
        });
        assert.ok(Math.abs(geo.sidebarW - SIDEBAR_W) <= 1, `sidebar 240 while panel open: ${geo.sidebarW}`);
        assert.ok(Math.abs(geo.scrimLeft - SIDEBAR_W) <= 1, `scrim left ${geo.scrimLeft}`);
        assert.ok(Math.abs(geo.scrimTop) <= 1, `scrim top ${geo.scrimTop}`);
        assert.ok(Math.abs(geo.panelTop) <= 1, `panel top ${geo.panelTop}`);
        assert.equal(geo.sidebarCovered, false, 'sidebar stays clear of the panel scrim');
        assert.ok(geo.sidebarZ > geo.scrimZ, `sidebar z ${geo.sidebarZ} above scrim ${geo.scrimZ}`);
        assert.ok(geo.closeVisible, 'panel Cerrar is on screen');
        assert.equal(geo.inert, true, 'background is inert while the panel is open');
        if (width === 1440) {
          await page.screenshot({path: '/opt/cursor/artifacts/screenshots/p1-panel-header-1440.png'});
        }
        const histOpen = await page.evaluate(() => history.length);
        await page.locator('.lv-panel .panel-close').click();
        await page.waitForFunction(() => !document.querySelector('.lv-panel'));
        const histClosed = await page.evaluate(() => history.length);
        assert.equal(histClosed, histOpen, 'Cerrar must pop (history.back), not push resumen');
        assert.ok(histOpen >= histBefore, 'opening a panel adds a history entry');
        const closedHash = await page.evaluate(() => location.hash);
        assert.match(closedHash, /#\/take\/[^/]+$/, 'Cerrar returns to Resumen');
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-value') === 'positions');
      }
      // HN6: mis tesis
      await hashNav('takes', 'HN6');
      await page.waitForSelector('.thesis-list');
      // HN7: nueva tesis
      await hashNav('new', 'HN7');
      await page.locator('.entry-paths').waitFor();
      await page.getByRole('link', {name: 'Proponer cartera'}).waitFor();
      await page.getByRole('link', {name: 'Armar a mano'}).waitFor();
      assert.ok(await page.locator('.topnav-link.active[aria-current="page"]').filter({hasText: 'Nueva tesis'}).count(), 'Nueva tesis nav highlight');
      const newCol = await page.evaluate(() => getComputedStyle(document.querySelector('.shell')).maxWidth);
      assert.equal(newCol, '640px', `new shell max-width at ${width}`);
      if (width >= DESKTOP_CHROME_MIN) {
        await assertShellCentered(page);
        if (width === 1440) {
          await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });
          await page.screenshot({path: join('work', 'sidebar_new_1440.png'), fullPage: false});
          await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', 'sidebar_new_1440.png'), fullPage: false});
          await page.setViewportSize({width: 1024, height: 900});
          await page.waitForTimeout(80);
          await assertShellCentered(page);
          await page.setViewportSize({width: 900, height: 900});
          await page.waitForTimeout(80);
          await assertShellCentered(page);
          await page.setViewportSize({width: 1440, height: 1000});
          await page.waitForTimeout(80);
        }
      } else if (width === 390) {
        await assertShellCentered(page);
      }
      const newLead = await page.locator('.new-view p').allInnerTexts();
      const leadHits = newLead.filter(t => t.includes('No hay modo automático')).length;
      assert.ok(leadHits <= 1, 'Nueva tesis must not duplicate the lead paragraph');
      assert.equal(await page.getByText('Revisá noticias y reglas.', {exact: false}).count(), 0);
      // HN8: configuración
      await hashNav('settings', 'HN8');
      await page.locator('#openai-settings').waitFor();
      // HN9: conversaciones + back to take news
      await hashNav('chats', 'HN9a');
      await page.waitForSelector('.page-heading h1');
      await hashNav('take/' + take.id + '/news', 'HN9b');
      await page.locator('.news-card, .verdict, .timeline .disclosure-btn, .timeline-item').first().waitFor({timeout: 5000});
      assert.equal(await page.locator('a.source-link').first().getAttribute('href'),source.url);
      if (width <= 390) {
        const filterH = await page.locator('.lv-panel .news-filter').first().evaluate(el => el.getBoundingClientRect().height).catch(() => 0);
        if (filterH) assert.ok(filterH >= 44 - 1, `novedades filter target ${filterH}px`);
        const newsLayout = await page.evaluate(() => {
          const meta = document.querySelector('.news-meta');
          return {
            height: document.documentElement.scrollHeight,
            metaFs: meta ? parseFloat(getComputedStyle(meta).fontSize) : 0,
          };
        });
        assert.ok(newsLayout.height < 4000, `novedades mobile height ${newsLayout.height}`);
        assert.ok(newsLayout.metaFs >= 12 - 0.05, `news-meta ${newsLayout.metaFs}px`);
      }
      const before=JSON.stringify(app.store.take(take.id));
      await hashNav('take/' + take.id);
      await page.waitForFunction(() => !document.querySelector('.lv-panel'));
      await page.locator('[data-action=scenario]').click();await page.locator('[data-action=apply-scenario][data-value=broken]').click();await page.getByText('Valor simulado:',{exact:false}).waitFor();assert.equal(JSON.stringify(app.store.take(take.id)),before);await page.locator('[data-action=close]').click();await page.waitForFunction(() => !document.getElementById('modal')?.open);
      await hashNav('take/' + take.id + '/idea');
      await page.locator('.lv-panel[data-panel="idea"]').waitFor();
      await page.locator('[data-action=edit-idea]').click();await page.locator('#idea-form [name=thesis]').fill('Nueva hipótesis: la demanda local crece más lentamente y requiere evidencia adicional.');await page.locator('#idea-form button').click();
      await page.locator('[data-action=versions]').click();await page.getByText('Versión 2',{exact:false}).waitFor();await page.locator('[data-action=close]').click();
      await hashNav('take/' + take.id + '/settings');
      await page.locator('.lv-panel[data-panel="settings"]').waitFor();
      await page.locator('[name=monitoringPaused]').check();await page.locator('#take-settings button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('[name=monitoringPaused]')?.checked);
      await route('take/'+take.id+'/news');await page.screenshot({path:`work/thesis-${width}.png`,fullPage:true});
      if (width <= 390) {
        await hashNav('take/' + take.id + '/positions');
        await page.locator('.lv-panel .comp-bar').waitFor();
        const chip = page.locator('.positions-chip');
        if (await chip.getAttribute('aria-expanded') !== 'true') await chip.click();
        await page.waitForSelector('.positions-mobile .position-list');
        const topH = await page.locator('.topbar-inner, .topbar').first().evaluate(el => el.getBoundingClientRect().height);
        assert.ok(topH <= 56, `thesis topbar should stay one row at ${width}px, got ${topH}`);
        const boxes = await page.evaluate(() => {
          const pick = sel => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {w: r.width, h: r.height, sel};
          };
          const dock = document.querySelector('.chat-dock');
          const table = document.querySelector('.positions-mobile .position-list');
          const overlap = (() => {
            if (!dock || !table) return false;
            const a = dock.getBoundingClientRect();
            const b = table.getBoundingClientRect();
            return !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);
          })();
          return {
            period: pick('.period'),
            more: pick('.news-more, .bucket-edit'),
            dockH: dock ? dock.getBoundingClientRect().height : 0,
            overlap,
          };
        });
        if (boxes.period) assert.ok(boxes.period.h >= 44 - 1 && boxes.period.w >= 40, `period target ${JSON.stringify(boxes.period)}`);
        assert.ok(boxes.dockH <= 72, `dock height ${boxes.dockH}`);
        assert.equal(boxes.overlap, false, 'dock must not overlap positions');
        await hashNav('take/' + take.id);
        await page.waitForFunction(() => !document.querySelector('.lv-panel'));
        await page.locator('.topnav-toggle').click();
        await page.waitForSelector('.topnav.open');
        const menu = await page.evaluate(() => {
          const nav = document.querySelector('.topnav.open');
          if (!nav) return {ok: false};
          const item = nav.querySelector('a, .rail-item');
          const r = nav.getBoundingClientRect();
          return {
            itemH: item ? item.getBoundingClientRect().height : 0,
            top: r.top,
            full: r.height >= innerHeight - 60,
          };
        });
        assert.ok(menu.itemH >= 44, `menu item ${menu.itemH}`);
        assert.ok(menu.full, 'Menú is a full-screen rail drawer under 1024px');
        if (width === 390) {
          await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });
          await page.screenshot({path: join('work', 'sidebar_drawer_390.png'), fullPage: false});
          await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', 'sidebar_drawer_390.png'), fullPage: false});
        }
        await page.keyboard.press('Escape');
      }
      if (width === 1440) {
        const rebDir = mkdtempSync(join(tmpdir(), 'laviste-modal-scroll-'));
        const rebApp = createApp({dataDir: rebDir, password, masterKeyPath: key, apiKey: '', port: 0, host: '127.0.0.1', secure: false, origin: '', fetcher, iolFetcher, seed: true, quotesLive: true, quotesFixture: true});
        await new Promise(resolve => rebApp.server.listen(0, '127.0.0.1', resolve));
        const rebBase = 'http://127.0.0.1:' + rebApp.server.address().port;
        try {
          await page.goto(rebBase + '/app');
          await submitLogin(page);
          await page.waitForSelector('.main');
          const rebTake = rebApp.store.takes().find(t => t.title.includes('Banco') || t.title.includes('crédito'));
          assert.ok(rebTake, 'seeded Bancos take');
          await page.goto(rebBase + `/app#/take/${rebTake.id}/news`);
          await page.locator('[data-action=apply-rebalance]').waitFor({timeout: 10000});
          const applyClass = await page.locator('[data-action=apply-rebalance]').getAttribute('class');
          assert.ok(/\bprimary\b/.test(applyClass || ''), 'Aplicar en práctica stays primary in Revisar');
          const dockClass = await page.locator('.chat-dock-take button[type=submit]').getAttribute('class');
          assert.ok(!/\bprimary\b/.test(dockClass || ''), 'dock Enviar is secondary while Aplicar is on screen');
          const pagePrimaries = await page.evaluate(() => {
            const modal = document.getElementById('modal');
            return [...document.querySelectorAll('.btn.primary')].filter(el => !modal?.contains(el)).length;
          });
          assert.equal(pagePrimaries, 1, `one cobalt primary on thesis Revisar, got ${pagePrimaries}`);
          await page.evaluate(() => window.scrollTo(0, Math.max(document.body.scrollHeight - innerHeight, 400)));
          const scrollBefore = await page.evaluate(() => window.scrollY);
          assert.ok(scrollBefore > 0, 'page should be scrolled before opening modal');
          await page.locator('[data-action=apply-rebalance]').click();
          await page.waitForSelector('#modal[open]');
          const scrollOpen = await page.evaluate(() => window.scrollY);
          assert.equal(scrollOpen, scrollBefore, 'opening modal must not change scroll position');
          await page.waitForFunction(() => {
            const d = document.getElementById('modal');
            return d?.open && Number(getComputedStyle(d).opacity) >= 0.99;
          });
          await page.waitForTimeout(350);
          assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
          const shot = await page.screenshot({type: 'png'});
          const imgW = shot.readUInt32BE(16);
          const imgH = shot.readUInt32BE(20);
          const layout = await page.evaluate(() => {
            const modal = document.getElementById('modal');
            const r = modal.getBoundingClientRect();
            return {innerWidth: window.innerWidth, dimX: Math.max(280, Math.floor(r.left - 48))};
          });
          const scale = imgW / layout.innerWidth;
          const midY = Math.floor(imgH / 2);
          const edgePx = pngPixelRgb(shot, imgW - 4, midY);
          const dimPx = pngPixelRgb(shot, Math.floor(layout.dimX * scale), midY);
          assert.ok(rgbDist(edgePx, PAPER_RGB) > 12, `gutter strip must be dimmed, got rgb(${edgePx.r},${edgePx.g},${edgePx.b})`);
          assert.ok(rgbDist(dimPx, PAPER_RGB) > 12, `page under scrim must be dimmed, got rgb(${dimPx.r},${dimPx.g},${dimPx.b})`);
          assert.ok(rgbDist(edgePx, dimPx) <= 28, `gutter and scrim tones should match, edge=${JSON.stringify(edgePx)} dim=${JSON.stringify(dimPx)}`);
          await page.locator('[data-action=close]').click();
          await page.waitForFunction(() => !document.getElementById('modal')?.open);
          const scrollAfter = await page.evaluate(() => window.scrollY);
          assert.equal(scrollAfter, scrollBefore, 'closing modal must restore scroll position');
          const chartDir = mkdtempSync(join(tmpdir(), 'laviste-chart-single-'));
          const chartApp = createApp({dataDir: chartDir, password, masterKeyPath: key, apiKey: '', port: 0, host: '127.0.0.1', secure: false, origin: '', fetcher, iolFetcher, seed: true, quotesLive: true, quotesFixture: true});
          await new Promise(resolve => chartApp.server.listen(0, '127.0.0.1', resolve));
          const chartBase = 'http://127.0.0.1:' + chartApp.server.address().port;
          try {
            let activeId;
            let activeInvested;
            chartApp.store.transaction(() => {
              const all = chartApp.store.takes();
              const keep = all.find(t => t.title.includes('Banco') || t.title.includes('crédito')) || all[0];
              keep.history = [keep.history[0]];
              activeId = keep.id;
              activeInvested = keep.invested;
              chartApp.store.putTake(keep);
              for (const t of all) {
                if (t.id === keep.id) continue;
                t.phase = 'draft';
                t.invested = 0;
                t.history = [];
                chartApp.store.putTake(t);
              }
            });
            await page.goto(chartBase + '/app');
            await submitLogin(page);
            await page.waitForSelector('.home-chart');
            await page.waitForFunction(() => {
              const host = document.querySelector('.home-chart .chart-host[data-ready="1"]');
              return host?.querySelector('svg polyline');
            }, {timeout: 10000});
            const homeChartJson = await page.locator('.home-chart .chart-host').getAttribute('data-chart');
            const homeChart = JSON.parse(homeChartJson);
            assert.equal(homeChart.capital, activeInvested, 'single-thesis aggregate chart uses practice capital');
            assert.ok(homeChart.history.length >= 2, 'single-point aggregate history is widened for drawing');
            assert.ok(homeChart.history.every(p => p.benchmark === activeInvested), 'capital series matches contributed capital');
            const homeLines = await page.locator('.home-chart .chart-host svg polyline').count();
            assert.ok(homeLines >= 2, 'aggregate chart draws valor and capital series');
            await page.goto(chartBase + `/app#/take/${activeId}`);
            await page.waitForSelector('.take-positions-chart .empty.small, .take-chart .empty');
            const thesisCopy = await page.locator('.take-positions-chart .empty, .take-chart .empty').first().innerText();
            assert.ok(/historia para graficar|Vuelve a verse/i.test(thesisCopy), 'thesis without enough history uses P1 empty copy');
            assert.ok(!thesisCopy.includes(money(100)), 'thesis empty copy must not show index base');
          } finally {
            await chartApp.close();
            rmSync(chartDir, {recursive: true, force: true});
          }
          const homeSeedDir = mkdtempSync(join(tmpdir(), 'laviste-home-chart-'));
          const homeApp = createApp({dataDir: homeSeedDir, password, masterKeyPath: key, apiKey: 'x', port: 0, host: '127.0.0.1', secure: false, origin: '', fetcher, iolFetcher, seed: true, quotesLive: true, quotesFixture: true});
          await new Promise(resolve => homeApp.server.listen(0, '127.0.0.1', resolve));
          const homeBase = 'http://127.0.0.1:' + homeApp.server.address().port;
          try {
            await page.goto(homeBase + '/app');
            await submitLogin(page);
            await page.waitForSelector('.hero-n');
            await page.waitForFunction(() => {
              const host = document.querySelector('.home-chart .chart-host[data-ready="1"]');
              return host?.dataset.lastValue && host.querySelector('svg polyline');
            }, {timeout: 10000});
            const lines = await page.locator('.home-chart .chart-host svg polyline').count();
            assert.ok(lines >= 1, 'seeded home chart must draw at least one series line');
            const lastVal = await page.locator('.home-chart .chart-host').getAttribute('data-last-value');
            const heroText = await page.locator('.hero-n .big-number').innerText();
            const heroNum = Number(heroText.replace(/[^\d]/g, ''));
            assert.ok(lastVal && heroNum, 'hero and chart host should expose values');
            assert.equal(Number(lastVal), heroNum, 'last chart point must match hero total');
            const yTicks = await page.locator('.home-chart .chart-host').getAttribute('data-y-ticks');
            const uniqTicks = new Set((yTicks || '').split('|').filter(Boolean));
            assert.ok(uniqTicks.size >= 3, 'home chart y-axis labels must differ');
            assert.equal(await page.locator('.home-chart .chart-host').getAttribute('data-end-labels'), '1');
            const endText = await page.locator('.home-chart .chart-host').evaluate(el => el.textContent || '');
            assert.ok(endText.includes('Valor'), 'end label Valor');
            assert.ok(endText.includes('Aportado'), 'end label Aportado');
            assert.equal(uniqTicks.size, (yTicks || '').split('|').filter(Boolean).length, 'Y ticks must all be unique');
            assert.equal(await page.locator('.home-chart .legend').count(), 0);
            const logo = await page.evaluate(async () => {
              const r = await fetch('/logos/GGAL.svg');
              return {ok: r.ok, type: r.headers.get('content-type'), text: await r.text()};
            });
            assert.ok(logo.ok, 'self-hosted ticker logo');
            assert.match(logo.type || '', /svg/);
            assert.ok(logo.text.includes('GGAL'));
            await page.goto(homeBase + `/app#/take/${homeApp.store.takes().find(t => t.phase === 'active').id}/positions`);
            await page.locator('.lv-panel .comp-bar').waitFor();
            const seedChip = page.locator('.positions-chip');
            await seedChip.waitFor();
            if (await seedChip.getAttribute('aria-expanded') !== 'true') await seedChip.click();
            await page.waitForSelector('.lv-panel .positions-mobile .ticker-mark');
            assert.ok(await page.locator('.lv-panel .ticker-mark').count() >= 3, 'seeded positions show logos');
          } finally {
            await homeApp.close();
            rmSync(homeSeedDir, {recursive: true, force: true});
          }
          await page.goto(base + '/app');
          await submitLogin(page);
          await page.waitForSelector('.main');
          await route('take/' + take.id + '/news');
        } finally {
          await rebApp.close();
          rmSync(rebDir, {recursive: true, force: true});
        }
      }
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`horizontal overflow at ${width}`);
      if (width <= 390) {
        await hashNav('take/' + take.id + '/positions');
        await page.locator('.lv-panel .comp-bar').waitFor();
        const chipPos = page.locator('.positions-chip');
        if (await chipPos.getAttribute('aria-expanded') !== 'true') await chipPos.click();
        await page.waitForSelector('.positions-mobile .position-list');
        const overflowPos = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflowPos, false, `positions must not overflow at ${width}`);
      }
      const ownerTitle = app.store.forUser(app.store.ownerUserId()).takes().find(t => t.phase === 'active')?.title
        || 'HN2 título actualizado';
      await runAbIsolation({browser, app, base, page, width, ownerTitle});
      await route('settings');await page.getByText('precios demorados de mercado',{exact:false}).waitFor();
      await page.locator('#iol-settings').count().then(n=>assert.equal(n,0));
      const exported=await page.evaluate(async()=>await (await fetch('/api/export')).text());assert.ok(!exported.includes(fakeKey));assert.ok(!exported.includes('test-refresh'));
      await page.locator('[data-action=remove-openai]').click();await page.getByText('Configuración pendiente',{exact:true}).waitFor();
      assert.equal(errors.length,0,errors.join('\n'));console.log(`Browser OK: ${width}px, chat, sources, practice, versions, quotes, secrets`);
    }catch(error){await page.screenshot({path:`work/failure-${width}.png`,fullPage:true}).catch(()=>{});console.error('BROWSER FAILURE',width,page.url(),error.message);throw error;}finally{await page.close();await app.close();rmSync(dir,{recursive:true,force:true});}
  }
}finally{await browser.close();}
