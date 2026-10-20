import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {templates, createTake, activate} from '../lib/engine.mjs';
import {hashPassword} from '../lib/password.mjs';
import {SESSION_COOKIE} from '../lib/auth.mjs';
import {PRACTICE_FOOTER} from '../lib/copy.mjs';
import {
  SESSION_EXPIRED, USER_ROLE_USER, USER_ROLE_SUPERADMIN, USER_LOGOUT, USER_MENU_FAQ, USER_MENU_ACCOUNT,
  LOGIN_PRIVACY, LOGIN_GOOGLE, LOGIN_GOOGLE_ERROR, LOGIN_GOOGLE_LIMIT, LOGIN_GOOGLE_PASSWORD_ONLY,
  LOGIN_GOOGLE_CANCEL, LOGIN_GOOGLE_NOACCESS, LOGIN_FORGOT, LOGIN_FORGOT_BODY, LOGIN_FORGOT_GOOGLE,
  ACCOUNT_TITLE, PW_GOOGLE_ONLY_BODY, DATA_EXPORT, RESET_INVALID_TITLE, RESET_TO_LOGIN, RESET_TITLE,
  PW_HIDE, ADMIN_RESET_CANCEL, ADMIN_RESET_COPY, ADMIN_RESET_BTN,
  PW_ERR_SHORT, PW_ERR_MATCH,
  HOME_EMPTY_TITLE,
  QUOTA_CHAT, AI_PAUSED_LABEL, AI_PAUSED_USER, AI_PRICES_MISSING,
  AUTO_CONSENT_TITLE, AUTO_CONSENT_CONFIRM, AUTO_CONSENT_CANCEL, AUTO_UNDO_LABEL,
  AUTO_UNDO_CANCEL, AUTO_CHIP_ON, AUTO_SWITCH_LABEL, AUTO_NEWS_SWITCH_LABEL,
  AUTO_SWITCH_HINT, AUTO_UNDO_HINT_CLOSED, AUTO_PAUSE_REASONS,
  AUTO_NEWS_CONSENT_TITLE, AUTO_NEWS_CONSENT_CANCEL,
  P1_PREFS, TD_SET_TITLE, TD_SETTINGS_ARIA, TD_ARCHIVE_BTN, TD_ARCHIVE_CANCEL,
  TD_ARCHIVE_CONFIRM, TD_ARCHIVED_TOAST, TD_RULES_SAVE, TD_SEC_INDEX,
  AUTO_CONSENT_ITEMS,
} from '../public/copy.mjs';
import {money} from '../public/format.mjs';
import {
  autoChipHtml, autoSettingsHtml, autoUndoButtonHtml, defaultAutoPolicy,
} from '../public/auto.mjs';
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
  const account = host.locator('a.user-menu-link[href="#/cuenta"]');
  const faq = host.locator('a.user-menu-link[href="/preguntas#preguntas"]');
  const privacy = host.locator('a.user-menu-link[href="/privacidad"]');
  assert.equal(await account.count(), 1, 'Cuenta link in account menu');
  assert.equal(await faq.count(), 1, 'FAQ link in account menu');
  assert.equal(await privacy.count(), 1, 'privacy link in account menu');
  assert.equal((await account.innerText()).trim(), USER_MENU_ACCOUNT);
  assert.equal((await faq.innerText()).trim(), USER_MENU_FAQ);
  assert.equal((await privacy.innerText()).trim(), LOGIN_PRIVACY);
  assert.ok(!/\bbtn\b/.test(await faq.getAttribute('class') || ''), 'FAQ is text, not a button');
  const firstLink = host.locator('a.user-menu-link').first();
  assert.equal(await firstLink.getAttribute('href'), '#/cuenta', 'Cuenta is the first account-menu link');
  if (width >= DESKTOP_CHROME_MIN) {
    const firstItem = host.locator('[role="menuitem"]').first();
    assert.equal(await firstItem.getAttribute('href'), '#/cuenta', 'Cuenta is the first menuitem');
    const summary = page.locator('details.user-menu summary');
    await page.waitForFunction(() =>
      document.querySelector('details.user-menu[open] summary')?.getAttribute('aria-expanded') === 'true'
    );
    assert.equal(await summary.getAttribute('aria-expanded'), 'true');
    await page.waitForFunction(() => document.activeElement?.getAttribute('href') === '#/cuenta');
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
  await page.evaluate(() => { location.hash = '#/cuenta'; });
  await page.locator('#password-form').waitFor();
  assert.equal((await page.locator('h1').first().innerText()).trim(), ACCOUNT_TITLE);
  assert.equal((await page.locator('.account-email').innerText()).trim(), ownerEmail);
  assert.equal(await page.locator('#password-form input[name="email"]').count(), 0, 'email is not an input');
  const username = page.locator('#password-form input[name="username"]');
  assert.equal(await username.count(), 1);
  assert.equal(await username.evaluate(el => el.hidden || el.type === 'hidden' || el.hasAttribute('hidden')), true);
  assert.equal(await username.getAttribute('readonly'), '');
  assert.equal(await page.locator('#pw-current').count(), 1, 'owner has current password field');
  assert.equal(await page.locator('.account-page .btn.primary').count(), 1);
  await page.locator('#pw-current').fill(password);
  await page.locator('#pw-next').fill('eleven-char');
  await page.locator('#pw-confirm').fill('eleven-char');
  await page.locator('#password-form button[type=submit]').click();
  assert.equal(await page.locator('#pw-next').getAttribute('aria-invalid'), 'true');
  assert.equal((await page.locator('#pw-next-error').innerText()).trim(), PW_ERR_SHORT);
  await page.locator('#pw-next').fill('clave-nueva-12');
  await page.locator('#pw-confirm').fill('clave-distinta-12');
  await page.locator('#pw-next').blur();
  await page.locator('#pw-confirm').blur();
  await page.locator('#password-form button[type=submit]').click();
  assert.equal((await page.locator('#pw-confirm-error').innerText()).trim(), PW_ERR_MATCH);
  if (width <= 390) {
    const submitH = await page.locator('#password-form .btn.primary').evaluate(el => el.getBoundingClientRect().height);
    assert.ok(submitH >= 44 - 1, `cuenta submit ${submitH}px`);
    const toggleH = await page.locator('#password-form .pw-toggle').first().evaluate(el => el.getBoundingClientRect().height);
    assert.ok(toggleH >= 44 - 1, `pw-toggle ${toggleH}px`);
  }
  if (width === 1440 || width === 390) {
    const cuentaShot = `cuenta_owner_${width}.png`;
    await page.screenshot({path: join('work', cuentaShot), fullPage: true});
    await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', cuentaShot), fullPage: true});
  }

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
    await pageB.evaluate(() => { location.hash = '#/cuenta'; });
    await pageB.locator('#password-form').waitFor();
    assert.equal((await pageB.locator('.account-email').innerText()).trim(), userBEmail);
    assert.equal(await pageB.locator('#password-form input').count() >= 2, true);
    if (width === 1440 || width === 390) {
      const cuentaUserShot = `cuenta_user_${width}.png`;
      await pageB.screenshot({path: join('work', cuentaUserShot), fullPage: true});
      await pageB.screenshot({path: join('/opt/cursor/artifacts/screenshots', cuentaUserShot), fullPage: true});
    }

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
    const bannedPublic = ['OpenAI requerido', 'clave de OpenAI en Configuración'];
    for (const path of ['/', '/preguntas', '/como-funciona', '/acerca', '/privacidad', '/alcance']) {
      const html = await page.evaluate(async href => (await fetch(href)).text(), path);
      for (const phrase of bannedPublic) {
        assert.equal(html.includes(phrase), false, `${path} must not contain «${phrase}»`);
      }
    }
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
mkdirSync('/opt/cursor/artifacts/screenshots',{recursive:true});

async function assertGoogleLoginButton(browser) {
  async function shot(page, name) {
    await page.screenshot({path: join('work', name), fullPage: true});
    await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', name), fullPage: true});
  }
  async function withLogin(options, fn) {
    const dir = mkdtempSync(join(tmpdir(), 'laviste-google-btn-'));
    const key = join(dir, 'master.key');
    writeFileSync(key, '12'.repeat(32));
    const app = createApp({
      dataDir: dir, password, masterKeyPath: key, apiKey: '', port: 0, host: '127.0.0.1',
      secure: false, origin: '', fetcher, iolFetcher, quotesLive: false, quotesFixture: true,
      ...options,
    });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    page.setDefaultTimeout(20000);
    try {
      await fn(page, base, app);
    } finally {
      await page.close();
      if (app.server.listening) await app.close();
      else app.store.close();
      rmSync(dir, {recursive: true, force: true});
    }
  }
  await withLogin({}, async (page, base) => {
    await page.goto(base + '/app');
    await page.locator('#login').waitFor();
    const forgot = page.locator('[data-action="toggle-forgot"]');
    assert.equal(await forgot.count(), 1);
    assert.equal((await forgot.innerText()).trim(), LOGIN_FORGOT);
    assert.equal(await forgot.getAttribute('type'), 'button');
    assert.equal(await forgot.getAttribute('aria-expanded'), 'false');
    const net = [];
    page.on('request', req => net.push(req.url()));
    await forgot.click();
    assert.equal(await forgot.getAttribute('aria-expanded'), 'true');
    assert.ok(await page.getByText(LOGIN_FORGOT_BODY).count());
    assert.equal(await page.getByText(LOGIN_FORGOT_GOOGLE).count(), 0, 'Google note hidden when Google is off');
    assert.equal(net.filter(u => u.includes('/api/')).length, 0, 'forgot disclosure makes no request');
    assert.equal(await page.locator('#login .btn.primary').count(), 1);
    assert.equal(await page.locator('#login-google').count(), 0, 'Google button hidden when disabled');
    await shot(page, 'login_google_disabled.png');
    await page.goto(base + '/api/auth/google/start');
    await page.locator('#login').waitFor();
    assert.equal(await page.locator('#login-google').count(), 0);
    assert.equal((await page.locator('#login-error').innerText()).trim(), LOGIN_GOOGLE_ERROR);
  });
  await withLogin({
    googleClientId: 'browser-test-google-client.apps.googleusercontent.com',
    googleClientSecret: 'browser-test-google-secret',
  }, async (page, base) => {
    await page.goto(base + '/app#/login?e=google');
    await page.locator('#login-google').waitFor();
    const link = page.locator('#login-google');
    assert.equal(await link.count(), 1, 'Google button visible when enabled');
    assert.equal(await link.getAttribute('href'), '/api/auth/google/start');
    assert.equal((await link.innerText()).trim(), LOGIN_GOOGLE);
    const box = await link.boundingBox();
    assert.ok(box && box.height >= 44, `Google button height ${box?.height}`);
    await page.locator('#login-error').waitFor();
    assert.equal((await page.locator('#login-error').innerText()).trim(), LOGIN_GOOGLE_ERROR);
    assert.equal(new URL(page.url()).hash, '', 'google error hash is cleared after showing');
    const forgotOn = page.locator('[data-action="toggle-forgot"]');
    if ((await forgotOn.getAttribute('aria-expanded')) !== 'true') await forgotOn.click();
    assert.ok(await page.getByText(LOGIN_FORGOT_GOOGLE).count(), 'Google forgot note when Google is on');
    await shot(page, 'login_google_enabled.png');
    for (const [code, copy, focusEmail] of [
      ['google_limit', LOGIN_GOOGLE_LIMIT, false],
      ['google_password', LOGIN_GOOGLE_PASSWORD_ONLY, true],
      ['google_cancel', LOGIN_GOOGLE_CANCEL, false],
      ['google_noaccess', LOGIN_GOOGLE_NOACCESS, true],
      ['google_unknown', LOGIN_GOOGLE_ERROR, false],
    ]) {
      await page.evaluate(next => history.replaceState(history.state, '', '/app#/login?e=' + next), code);
      await page.reload();
      await page.locator('#login-error').waitFor();
      assert.equal((await page.locator('#login-error').innerText()).trim(), copy, code);
      if (focusEmail) {
        assert.equal(
          await page.locator('input[name="email"]').evaluate(el => el === document.activeElement),
          true,
          `${code} focuses email`,
        );
      }
      if (code === 'google_noaccess') await shot(page, 'login_google_noaccess.png');
    }
    await page.goto(base + '/app#/restablecer?t=not-a-real-token');
    await page.getByRole('heading', {name: RESET_INVALID_TITLE}).waitFor();
    assert.equal(await page.locator('#reset-form').count(), 0);
    assert.equal(new URL(page.url()).hash.includes('t='), false, 'reset token is stripped from the hash');
    await shot(page, 'restablecer_1440.png');
    const mobile = await browser.newPage({viewport: {width: 390, height: 844}});
    try {
      await mobile.goto(base + '/app');
      await mobile.locator('#login-google').waitFor();
      const mBox = await mobile.locator('#login-google').boundingBox();
      assert.ok(mBox && mBox.height >= 44, `mobile Google button height ${mBox?.height}`);
      assert.equal((await mobile.locator('#login-google').innerText()).trim(), LOGIN_GOOGLE);
      await mobile.screenshot({path: join('work', 'login_google_enabled_390.png'), fullPage: true});
      await mobile.screenshot({path: join('/opt/cursor/artifacts/screenshots', 'login_google_enabled_390.png'), fullPage: true});
    } finally {
      await mobile.close();
    }
    await page.goto(base + '/app');
    await page.locator('#login').waitFor();
    assert.equal((await page.locator('#login-error').innerText()).trim(), '', 'reload does not revive the google error');
    await page.evaluate(() => history.replaceState(history.state, '', '/app#/login?e=google'));
    await page.reload();
    await page.locator('#login-error').waitFor();
    await submitLogin(page);
    await page.waitForFunction(() => !document.querySelector('#login') && document.querySelector('.main'));
    await page.waitForSelector('.home-empty');
    assert.equal(new URL(page.url()).hash, '#/', 'password login from google error lands on the panel');
    assert.equal(
      await page.locator('a.topnav-link[aria-current="page"]').filter({hasText: 'Inicio'}).count(),
      1,
      'Inicio has aria-current after password login',
    );
  });
}

async function seedAutoApp() {
  const dir = mkdtempSync(join(tmpdir(), 'laviste-auto-ui-'));
  const key = join(dir, 'master.key');
  writeFileSync(key, '12'.repeat(32));
  const app = createApp({
    dataDir: dir, password, masterKeyPath: key, apiKey: '', port: 0, host: '127.0.0.1',
    secure: false, origin: '', fetcher, iolFetcher, quotesLive: false, quotesFixture: true,
    env: {FEATURE_AUTO_SIM: '1'}, autoStartTimer: false,
    quotesMarketOpen: () => true,
  });
  const ownerId = app.store.ownerUserId();
  app.store.setSetting('autoTrading', {enabled: true, allowUserIds: [ownerId]});
  const take = createTake(templates[0]);
  activate(take, 1_024_000);
  take.monitoringPaused = false;
  const ypf = take.holdings.find(h => h.ticker === 'YPF');
  if (ypf) {
    ypf.price = 16000;
    if (ypf.units >= 10) ypf.units -= 10;
  }
  take.cash = Math.max(take.cash || 0, 400000);
  take.realPricesAt = new Date().toISOString();
  const tradeId = 'auto-tr-ui-1';
  take.events.unshift({
    id: 'auto-ev-ui-1',
    at: new Date().toISOString(),
    type: 'auto_trade',
    title: 'Venta de práctica · Automático',
    body: 'Venta 10 u. de YPF. Motivo: se pasó del tope. No se enviaron órdenes a un broker.',
    source: 'Automático (práctica) · motor de reglas',
    verdict: 'none',
    meta: {
      autoTradeId: tradeId, undoable: true, signal: {kind: 'cap', ticker: 'YPF'},
      quote: {provider: 'fixture', asOf: new Date().toISOString()},
    },
  });
  const scoped = app.store.forUser(ownerId);
  scoped.putTake(take);
  scoped.insertAutoTrade({
    id: tradeId,
    takeId: take.id,
    kind: 'cap',
    day: '2026-10-19',
    status: 'executed',
    executedAt: new Date().toISOString(),
    amount: 12000,
    meta: {source: 'auto', simulated: true, ticker: 'YPF', legs: [{side: 'venta', ticker: 'YPF', units: 10, price: 1200}]},
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return {dir, app, take, tradeId, scoped, base: 'http://127.0.0.1:' + app.server.address().port};
}

async function shotAuto(page, name) {
  mkdirSync('work', {recursive: true});
  mkdirSync('/opt/cursor/artifacts/screenshots', {recursive: true});
  await page.screenshot({path: join('work', name), fullPage: true});
  await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', name), fullPage: true});
}

async function shotUxPropuesta(browser) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const onChip = autoChipHtml({enabled: true}, {marketOpen: true}, {esc});
  const pausedChip = autoChipHtml({enabled: true, pausedReason: 'tesis_rota'}, {marketOpen: true}, {esc});
  const settingsOff = autoSettingsHtml({
    visible: true, policy: defaultAutoPolicy('t1'), takeId: 't1', version: 1, esc,
  });
  const settingsOn = autoSettingsHtml({
    visible: true, policy: {enabled: true, newsTrigger: false}, takeId: 't1', version: 1, esc,
    trades: [],
  });
  const undo = autoUndoButtonHtml({
    type: 'auto_trade', meta: {autoTradeId: 'tr1', undoable: true},
  }, [{
    id: 'tr1', status: 'executed', executedAt: '2026-10-19T19:23:00.000Z',
    meta: {legs: [{side: 'venta', ticker: 'YPF', units: 10, price: 1200}]},
  }], {esc, takeId: 't1', version: 1, quotes: {marketOpen: true}});
  const html = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8">
    <style>${readFileSync('public/brand.css', 'utf8')}${readFileSync('public/app-theme.css', 'utf8')}
    body{margin:0;padding:32px;background:var(--lv-paper);color:var(--lv-ink);font:16px var(--lv-sans)}
    .ux-grid{display:grid;gap:28px;max-width:720px}
    .ux-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .ux-card{border:1px solid var(--lv-line);border-radius:var(--lv-r-ctrl);padding:16px 20px;background:var(--lv-paper)}
    </style></head><body>
    <div class="ux-grid">
      <div class="ux-row"><span class="chip-s track">En camino</span>${onChip}</div>
      <div>
        <div class="ux-row"><span class="chip-s watch">Vigilando</span>${pausedChip}</div>
        <p class="small muted auto-reason">${esc(AUTO_PAUSE_REASONS.tesis_rota)}</p>
      </div>
      <div class="ux-card">${settingsOff}</div>
      <div class="ux-card">${settingsOn}</div>
      <article class="news-card auto-trade-card ux-card">
        <div class="news-meta"><b>19:23</b><span>Venta de práctica · Automático</span></div>
        <h4>Venta de práctica · Automático</h4>
        <p>Venta 10 u. de YPF. Motivo: se pasó del tope. No se enviaron órdenes a un broker.</p>
        ${undo}
      </article>
    </div>
    </body></html>`;
  for (const width of [1440, 390]) {
    const page = await browser.newPage({viewport: {width, height: width === 390 ? 1400 : 1100}});
    try {
      await page.setContent(html, {waitUntil: 'domcontentloaded'});
      await shotAuto(page, `ux-propuesta-${width}.png`);
    } finally {
      await page.close();
    }
  }
}

async function assertAutoUi(browser) {
  const {dir, app, take, tradeId, scoped, base} = await seedAutoApp();
  const puts = [];
  try {
    for (const width of [1440, 390]) {
      scoped.upsertAutoPolicy({
        takeId: take.id, enabled: false, newsTrigger: false, consentVersion: null,
        newsConsentVersion: null, armState: {}, pausedReason: null,
      });
      const page = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 1000}});
      page.setDefaultTimeout(20000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.route('**/api/takes/*/auto', async (route, request) => {
          if (request.method() === 'PUT') {
            const response = await route.fetch();
            puts.push({width, body: request.postDataJSON(), status: response.status()});
            await route.fulfill({response});
            return;
          }
          await route.continue();
        });
        const undoPosts = [];
        const previewGets = [];
        await page.route('**/api/auto/trades/*/undo/preview', async route => {
          previewGets.push(route.request().url());
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              line: 'Recomprás 10 u. de YPF a $ 16.000 (vendiste a $ 1.200): −$ 148.000',
              legs: [{side: 'compra', ticker: 'YPF', units: 10, price: 16000}],
              pnl: -148000,
              partial: false,
              fingerprint: 'fp-ui-1',
              reason: null,
            }),
          });
        });
        await page.route('**/api/auto/trades/*/undo', async route => {
          if (route.request().method() === 'POST') {
            undoPosts.push(route.request().postDataJSON());
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({replay: false, trade: {id: 'undo-ui', reversesId: tradeId}}),
            });
            return;
          }
          await route.continue();
        });
        await page.goto(base + '/app');
        await page.locator('#login').waitFor();
        await submitLogin(page);
        await page.waitForFunction(() => document.querySelector('.main') && !document.querySelector('#login'));
        await page.goto(base + '/app#/take/' + take.id + '/settings');
        await page.locator('[data-auto-section]').waitFor();
        const mainSwitch = page.locator('[data-action="auto-toggle"]');
        const newsSwitch = page.locator('[data-action="auto-news-toggle"]');
        assert.equal(await mainSwitch.getAttribute('aria-checked'), 'false');
        assert.equal(await newsSwitch.getAttribute('aria-checked'), 'false');
        assert.ok(await newsSwitch.getAttribute('disabled') !== null, 'news switch disabled while main is off');
        assert.ok(await page.getByText(AUTO_SWITCH_HINT, {exact: false}).count());
        await shotAuto(page, `auto_toggle_${width}.png`);
        const putsBefore = puts.length;
        await mainSwitch.click();
        await page.locator('#auto-consent-form').waitFor();
        assert.ok(await page.getByText(AUTO_CONSENT_TITLE, {exact: false}).count());
        assert.ok(await page.getByText('dinero de práctica', {exact: false}).count());
        assert.ok(await page.getByText('2 operaciones', {exact: false}).count());
        const dialog = page.locator('#modal');
        assert.ok(await dialog.evaluate(el => el.open));
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
        assert.equal(focused, AUTO_CONSENT_CANCEL, 'initial focus is Cancelar');
        assert.equal(await page.locator('#auto-consent-form button[type=submit]').isDisabled(), true);
        await page.locator('#auto-consent-form button[type=submit]').click({force: true}).catch(() => {});
        assert.equal(puts.length, putsBefore, 'consent required: PUT waits for the checkbox');
        await page.locator('#auto-consent-form [name=consent]').check();
        assert.equal(await page.locator('#auto-consent-form button[type=submit]').isDisabled(), false);
        await shotAuto(page, `auto_consent_${width}.png`);
        await page.locator('#auto-consent-form button[type=submit]').click();
        await page.waitForFunction(() => !document.getElementById('modal')?.open);
        await page.waitForFunction(() => document.querySelector('[data-action="auto-toggle"]')?.getAttribute('aria-checked') === 'true');
        const lastPut = puts.at(-1)?.body;
        assert.equal(lastPut?.enabled, true);
        assert.ok(lastPut?.consentVersion);
        assert.equal(lastPut?.newsTrigger, false);
        assert.equal(await newsSwitch.getAttribute('aria-checked'), 'false', 'news stays off after main consent');
        await newsSwitch.click();
        await page.locator('#auto-news-consent-form').waitFor();
        assert.ok(await page.getByText(AUTO_NEWS_CONSENT_TITLE, {exact: false}).count());
        const newsFocused = await page.evaluate(() => document.activeElement?.textContent?.trim());
        assert.equal(newsFocused, AUTO_NEWS_CONSENT_CANCEL, 'news consent initial focus is Cancelar');
        await page.locator('#auto-news-consent-form [name=consent]').check();
        await page.locator('#auto-news-consent-form button[type=submit]').click();
        await page.waitForFunction(() => !document.getElementById('modal')?.open);
        await page.waitForFunction(() => document.querySelector('[data-action="auto-news-toggle"]')?.getAttribute('aria-checked') === 'true');
        const newsOnPut = puts.at(-1);
        assert.equal(newsOnPut?.status, 200, 'news on PUT is not 400');
        assert.equal(newsOnPut?.body?.enabled, true);
        assert.equal(newsOnPut?.body?.newsTrigger, true);
        assert.ok(newsOnPut?.body?.consentVersion, 'news on PUT sends accepted consentVersion');
        assert.ok(newsOnPut?.body?.newsConsentVersion);
        assert.equal(await newsSwitch.getAttribute('aria-checked'), 'true');
        assert.equal(
          await page.evaluate(() => document.activeElement?.getAttribute('data-action')),
          'auto-news-toggle',
          'news toggle keeps focus after consent',
        );
        const savedOn = await page.evaluate(async (id) => {
          const r = await fetch('/api/takes/' + id + '/auto', {credentials: 'same-origin'});
          const body = await r.json();
          return {status: r.status, newsTrigger: body.policy?.newsTrigger, enabled: body.policy?.enabled};
        }, take.id);
        assert.equal(savedOn.status, 200);
        assert.equal(savedOn.enabled, true);
        assert.equal(savedOn.newsTrigger, true, 'news on is persisted');
        await shotAuto(page, `auto_news_on_${width}.png`);
        await newsSwitch.click();
        await page.waitForFunction(() => document.querySelector('[data-action="auto-news-toggle"]')?.getAttribute('aria-checked') === 'false');
        const newsOffPut = puts.at(-1);
        assert.equal(newsOffPut?.status, 200, 'news off PUT is not 400');
        assert.equal(newsOffPut?.body?.enabled, true);
        assert.equal(newsOffPut?.body?.newsTrigger, false);
        assert.ok(newsOffPut?.body?.consentVersion, 'news off PUT sends accepted consentVersion');
        assert.equal(await newsSwitch.getAttribute('aria-checked'), 'false');
        assert.equal(
          await page.evaluate(() => document.activeElement?.getAttribute('data-action')),
          'auto-news-toggle',
          'news toggle keeps focus when turned off',
        );
        const savedOff = await page.evaluate(async (id) => {
          const r = await fetch('/api/takes/' + id + '/auto', {credentials: 'same-origin'});
          const body = await r.json();
          return {status: r.status, newsTrigger: body.policy?.newsTrigger};
        }, take.id);
        assert.equal(savedOff.newsTrigger, false, 'news off is persisted');
        await page.goto(base + '/app#/take/' + take.id);
        await page.locator('.take-header').waitFor();
        await page.locator('.auto-chip').waitFor();
        const chipText = (await page.locator('.auto-chip').innerText()).replace(/\s+/g, ' ').trim();
        assert.match(chipText, /Automático/);
        await shotAuto(page, `auto_chip_${width}.png`);
        await page.goto(base + '/app#/take/' + take.id + '/news');
        await page.locator('#take-panel .auto-trade-card, #take-panel [data-auto-trade]').first().waitFor();
        const undoBtn = page.locator('#take-panel [data-action="auto-undo"]').first();
        await undoBtn.waitFor();
        assert.equal((await undoBtn.innerText()).trim(), AUTO_UNDO_LABEL);
        const undoClass = await undoBtn.getAttribute('class');
        assert.ok(!/\bghost\b/.test(undoClass), 'undo is a bordered secondary button');
        assert.ok(!/\bprimary\b/.test(undoClass), 'undo is not primary');
        const undoBox = await undoBtn.boundingBox();
        assert.ok(undoBox && undoBox.height >= 44, `undo height ${undoBox?.height}`);
        assert.ok(await undoBtn.getAttribute('aria-describedby'));
        const previewBeforeClosed = previewGets.length;
        await undoBtn.evaluate(el => el.setAttribute('aria-disabled', 'true'));
        await undoBtn.click({force: true});
        await page.waitForFunction(() => {
          const t = document.getElementById('toast');
          return t && t.style.display !== 'none' && /mercado abierto/i.test(t.textContent || '');
        });
        assert.equal(previewGets.length, previewBeforeClosed, 'aria-disabled undo does not call preview');
        assert.equal(await page.locator('#modal').evaluate(el => el.open), false);
        await undoBtn.evaluate(el => el.removeAttribute('aria-disabled'));
        await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });
        await undoBtn.click();
        await page.locator('.auto-undo-preview').waitFor();
        const undoFocused = await page.evaluate(() => document.activeElement?.textContent?.trim());
        assert.equal(undoFocused, AUTO_UNDO_CANCEL, 'undo dialog focuses Cancelar');
        const preview = await page.locator('.auto-undo-preview').innerText();
        assert.match(preview, /Recomprás 10 u\. de YPF a /);
        assert.match(preview, /vendiste/);
        assert.match(preview, /16\.000/);
        await shotAuto(page, `auto_undo_${width}.png`);
        await page.locator('[data-action="auto-undo-confirm"]').click();
        await page.waitForFunction(() => !document.getElementById('modal')?.open);
        assert.ok(undoPosts.at(-1)?.fingerprint, 'POST undo sends the server fingerprint');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false, `auto UI overflow at ${width}`);
        assert.equal(errors.length, 0, errors.join('\n'));
      } finally {
        await page.close();
      }
    }
    for (const width of [1280, 360]) {
      const page = await browser.newPage({viewport: {width, height: 900}});
      page.setDefaultTimeout(20000);
      try {
        await page.goto(base + '/app');
        await submitLogin(page);
        await page.waitForFunction(() => document.querySelector('.main') && !document.querySelector('#login'));
        await page.goto(base + '/app#/take/' + take.id + '/settings');
        await page.locator('[data-auto-section]').waitFor();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false, `auto settings overflow at ${width}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    if (app.server.listening) await app.close();
    else app.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
}

async function saveTd1(page, name) {
  mkdirSync('work', {recursive: true});
  mkdirSync('/opt/cursor/artifacts/screenshots', {recursive: true});
  await page.screenshot({path: join('work', name), fullPage: true});
  await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', name), fullPage: true});
}

async function assertTd1Ajustes(browser) {
  const {dir, app, take, base, scoped} = await seedAutoApp();
  const otherEmail = 'td1-b@example.test';
  const otherPassword = 'td1-other-password-12';
  try {
    app.store.createUser({
      email: otherEmail, displayName: 'Bee', role: 'user',
      passwordHash: hashPassword(otherPassword),
    });
    for (const width of [390, 1440]) {
      const page = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 1000}});
      page.setDefaultTimeout(20000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        const posts = [];
        await page.route('**/api/takes/*/settings', async (route, request) => {
          if (request.method() !== 'POST') {
            await route.continue();
            return;
          }
          const body = request.postDataJSON();
          posts.push(body);
          const current = scoped.take(take.id);
          if (current && body) {
            current.settings = {
              ...current.settings,
              cadence: body.cadence,
              cap: body.cap,
              drift: body.drift,
              paused: body.paused,
              mode: 'ask',
            };
            if (typeof body.monitoringPaused === 'boolean') current.monitoringPaused = body.monitoringPaused;
            current.version = (Number(current.version) || 1) + 1;
            scoped.putTake(current);
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(current || {ok: true}),
          });
        });
        await page.goto(base + '/app');
        await page.locator('#login').waitFor();
        await submitLogin(page);
        await page.waitForFunction(() => document.querySelector('.main') && !document.querySelector('#login'));
        await page.goto(base + '/app#/tesis/' + take.id + '/ajustes');
        await page.locator('.ajustes-page h1').waitFor();
        assert.equal((await page.locator('.ajustes-page h1').innerText()).trim(), TD_SET_TITLE);
        assert.equal(await page.locator('.lv-panel').count(), 0, 'Ajustes is a page, not a panel');
        const back = page.locator('.ajustes-page a.back');
        assert.equal(await back.getAttribute('href'), '#/tesis/' + take.id);
        const backBox = await back.boundingBox();
        assert.ok(backBox && backBox.height >= 44 - 1, `back target ${backBox?.height}`);
        assert.equal(await page.evaluate(() => document.title), 'La Viste · Ajustes · ' + take.title);
        const histBefore = await page.evaluate(() => history.length);
        await page.evaluate(id => { location.hash = '#/take/' + id + '/settings'; }, take.id);
        await page.waitForFunction(id => location.hash === '#/tesis/' + id + '/ajustes', take.id);
        await page.evaluate(id => { location.hash = '#/take/' + id + '/preferencias'; }, take.id);
        await page.waitForFunction(id => location.hash === '#/tesis/' + id + '/ajustes', take.id);
        const histAfter = await page.evaluate(() => history.length);
        assert.ok(histAfter - histBefore <= 2, 'settings/preferencias canonicalize without stacking junk history');
        assert.equal((await page.locator('.ajustes-page .btn.primary').allInnerTexts()).join(' ').includes(TD_RULES_SAVE), true);
        assert.equal(await page.locator('.ajustes-page .btn.primary').count(), 1, 'Guardar reglas is the only primary');
        assert.ok(await page.locator('#indice').count(), 'index section');
        assert.equal(await page.locator('#indice select').count(), 0, 'index is read-only');
        assert.ok(await page.getByText(TD_SEC_INDEX, {exact: false}).count());
        assert.ok(AUTO_CONSENT_ITEMS[3].includes('Ajustes'));
        const tight = page.locator('.preset-opt.is-disabled');
        assert.ok(await tight.count(), 'Ajustada disabled when a weight is over 20%');
        assert.equal(await tight.getAttribute('aria-disabled'), null);
        assert.equal(await tight.locator('input').getAttribute('aria-disabled'), 'true');
        const ajustesText = await page.locator('.ajustes-page').innerText();
        assert.ok(!ajustesText.includes('-$'), 'TD-42 no ASCII minus before money');
        assert.ok(!/Desarchivar|Duplicar/.test(ajustesText));
        assert.equal(await page.locator('.practice-footer').count(), 1);
        const h1Focused = await page.evaluate(() => {
          const h1 = document.querySelector('.ajustes-page h1');
          return h1 && (document.activeElement === h1 || h1.getAttribute('tabindex') === '-1');
        });
        assert.equal(h1Focused, true, 'Ajustes h1 is the route heading');
        await page.locator('.ajustes-page a.back').focus();
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => document.activeElement?.name === 'td-cadence');
        const cadenceOutline = await page.evaluate(() => {
          const label = document.activeElement?.closest('label.opt');
          return label ? getComputedStyle(label).outlineStyle : '';
        });
        assert.notEqual(cadenceOutline, 'none', 'cadence card shows keyboard focus');
        await page.locator('input[name="td-preset"]:checked').evaluate(el => el.focus());
        await page.keyboard.press('ArrowRight');
        const presetOutline = await page.evaluate(() => {
          const input = document.activeElement?.name === 'td-preset' ? document.activeElement : document.querySelector('input[name="td-preset"]:focus-visible');
          const label = input?.closest('label.opt');
          return label ? getComputedStyle(label).outlineStyle : '';
        });
        assert.notEqual(presetOutline, 'none', 'preset card shows keyboard focus');
        await page.keyboard.press('ArrowLeft');
        await page.locator('.ajustes-page a.back').focus();
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => document.activeElement?.name === 'td-cadence');
        await saveTd1(page, `td1-ajustes-${width}.png`);
        if (width === 1440) {
          await page.keyboard.press('ArrowRight');
          const untilCad = Date.now() + 8000;
          while (Date.now() < untilCad && !posts.some(p => p.mode === 'ask' && p.cadence && p.cadence !== 'standard')) {
            await new Promise(r => setTimeout(r, 50));
          }
          assert.ok(posts.some(p => p.mode === 'ask'), 'cadence POST sends full ask payload');
          await page.waitForFunction(() => document.activeElement?.name === 'td-cadence' && document.activeElement?.checked);
          await page.locator('#take-settings button[type=submit]').focus();
          await page.keyboard.press('Enter');
          await page.waitForFunction(() => {
            const t = document.getElementById('toast');
            return t && t.style.display !== 'none' && t.textContent.includes('Reglas');
          });
          assert.equal(await page.evaluate(() => document.activeElement?.closest('#take-settings') && document.activeElement.matches('button[type="submit"]')), true, 'Guardar reglas keeps focus');
          const autoSwitch = page.locator('[data-action="auto-toggle"]');
          if (await autoSwitch.count()) {
            await autoSwitch.focus();
            await page.keyboard.press('Space');
            await page.locator('#auto-consent-form [name=consent]').check();
            await page.locator('#auto-consent-form button[type=submit]').click();
            await page.waitForFunction(() => document.querySelector('[data-action="auto-toggle"]')?.getAttribute('aria-checked') === 'true');
            assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-action')), 'auto-toggle', 'Automático keeps focus after consent');
            const newsSwitch = page.locator('[data-action="auto-news-toggle"]');
            await newsSwitch.focus();
            await page.keyboard.press('Space');
            await page.locator('#auto-news-consent-form [name=consent]').check();
            await page.locator('#auto-news-consent-form button[type=submit]').click();
            await page.waitForFunction(() => document.querySelector('[data-action="auto-news-toggle"]')?.getAttribute('aria-checked') === 'true');
            assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-action')), 'auto-news-toggle', 'También por noticias keeps focus after consent');
            await page.keyboard.press('Space');
            await page.waitForFunction(() => document.querySelector('[data-action="auto-news-toggle"]')?.getAttribute('aria-checked') === 'false');
            assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-action')), 'auto-news-toggle', 'También por noticias keeps focus when turned off');
            await autoSwitch.focus();
            await page.keyboard.press('Space');
            await page.waitForFunction(() => document.querySelector('[data-action="auto-toggle"]')?.getAttribute('aria-checked') === 'false');
            assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-action')), 'auto-toggle', 'Automático keeps focus when turned off');
          }
          await page.locator('[data-action="pause-follow"]').focus();
          await page.keyboard.press('Space');
          await page.waitForFunction(() => {
            const t = document.getElementById('toast');
            return t && t.style.display !== 'none' && (t.textContent.includes('pausa') || t.textContent.includes('reanudado'));
          });
          assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-action')), 'pause-follow', 'Pausar keeps focus');
          await page.keyboard.press('Space');
          await page.waitForFunction(() => document.querySelector('[data-action="pause-follow"]')?.getAttribute('aria-checked') === 'false');
          await page.evaluate(() => {
            const t = document.getElementById('toast');
            if (t) t.style.display = 'none';
          });
        }
        const archiveBtn = page.locator('[data-action="archive"]');
        assert.equal((await archiveBtn.innerText()).trim(), TD_ARCHIVE_BTN);
        const archiveBox = await archiveBtn.boundingBox();
        assert.ok(archiveBox && archiveBox.height >= 44 - 1, `archive btn ${archiveBox?.height}`);
        await archiveBtn.click();
        await page.locator('#modal').waitFor();
        assert.ok(await page.locator('#modal').evaluate(el => el.open));
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
        assert.equal(focused, TD_ARCHIVE_CANCEL, 'Archivar dialog focuses Cancelar');
        assert.equal(await page.locator('#modal .btn.primary').count(), 0, 'archive dialog has no primary');
        await saveTd1(page, `td1-archivar-${width}.png`);
        if (width === 1440) {
          await page.route('**/api/takes/*/archive', async (route, request) => {
            if (request.method() === 'POST') {
              await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({error: 'Error de ejemplo'}),
              });
              return;
            }
            await route.continue();
          });
          await page.locator('#modal [data-action="archive-confirm"]').click();
          await page.waitForFunction(() => {
            const err = document.getElementById('archive-error');
            return err && !err.hidden && err.textContent;
          });
          assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-action')), 'archive-confirm', 'archive error returns focus to Archivar');
          await page.unroute('**/api/takes/*/archive');
        }
        const phaseBefore = app.store.take(take.id).phase;
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('modal')?.open);
        assert.equal(app.store.take(take.id).phase, phaseBefore, 'Esc does not archive');
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-action') === 'archive');
        await archiveBtn.click();
        await page.locator('#modal [data-action="close"]').filter({hasText: TD_ARCHIVE_CANCEL}).click();
        await page.waitForFunction(() => !document.getElementById('modal')?.open);
        assert.equal(app.store.take(take.id).phase, phaseBefore, 'Cancelar does not archive');
        await page.goto(base + '/app#/tesis/' + take.id);
        await page.locator('.take-header').waitFor();
        assert.equal(await page.locator('.panel-chip').count(), 3, 'three chips, no Preferencias');
        assert.equal(await page.locator('.panel-chip', {hasText: 'Preferencias'}).count(), 0);
        const ajustesLink = page.locator('a.take-ajustes-btn');
        assert.ok(await ajustesLink.count());
        assert.equal(await ajustesLink.getAttribute('aria-label'), TD_SETTINGS_ARIA);
        const ajustesBox = await ajustesLink.boundingBox();
        assert.ok(ajustesBox && ajustesBox.height >= 44 - 1 && ajustesBox.width >= 44 - 1, `Ajustes control ${JSON.stringify(ajustesBox)}`);
        if (width < 1024) {
          const labelVisible = await ajustesLink.locator('.ajustes-label').evaluate(el => {
            const s = getComputedStyle(el);
            return s.position === 'absolute' && (s.clip !== 'auto' || s.width === '1px');
          });
          assert.equal(labelVisible, true, 'mobile Ajustes is icon-only');
        } else {
          assert.equal((await ajustesLink.innerText()).replace(/\s+/g, ' ').trim().includes(P1_PREFS), true);
        }
        assert.equal(errors.length, 0, errors.join('\n'));
      } finally {
        await page.close();
      }
    }

    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    page.setDefaultTimeout(20000);
    try {
      await page.goto(base + '/app');
      await submitLogin(page);
      await page.waitForFunction(() => document.querySelector('.main') && !document.querySelector('#login'));
      await page.goto(base + '/app#/tesis/' + take.id + '/ajustes');
      await page.locator('[data-action="archive"]').click();
      await page.locator('[data-action="archive-confirm"]').click();
      await page.waitForFunction(() => location.hash === '#/takes');
      await page.waitForFunction(() => {
        const t = document.getElementById('toast');
        return t && t.style.display !== 'none' && t.textContent.includes('Tesis archivada');
      });
      assert.equal(app.store.take(take.id).phase, 'archived');
      assert.equal(await page.locator('.filter.active').innerText(), 'Archivadas');
      await page.goto(base + '/app#/tesis/' + take.id + '/ajustes');
      await page.locator('.ajustes-page').waitFor();
      assert.equal(await page.locator('[data-action="archive"]').count(), 0, 'no unarchive control');
      assert.equal(await page.locator('[data-action="unarchive"]').count(), 0);
      const body = await page.locator('.ajustes-page').innerText();
      assert.ok(!/Desarchivar/.test(body));
      assert.ok(!/Duplicar/.test(body));
    } finally {
      await page.close();
    }

    const pageB = await browser.newPage({viewport: {width: 1280, height: 800}});
    pageB.setDefaultTimeout(20000);
    try {
      await pageB.goto(base + '/app');
      await submitLogin(pageB, otherEmail, otherPassword);
      await pageB.waitForFunction(() => document.querySelector('.main') && !document.querySelector('#login'));
      await pageB.goto(base + '/app#/tesis/' + take.id + '/ajustes');
      await pageB.waitForFunction(() => document.querySelector('.main'));
      const text = await pageB.locator('.main').innerText();
      assert.match(text, /No encontramos esa tesis/);
      assert.equal(await pageB.locator('.ajustes-page').count(), 0);
    } finally {
      await pageB.close();
    }
  } finally {
    if (app.server.listening) await app.close();
    else app.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
}

async function saveP0a(page, name) {
  mkdirSync('work', {recursive: true});
  mkdirSync('/opt/cursor/artifacts/screenshots', {recursive: true});
  await page.screenshot({path: join('work', name), fullPage: true});
  await page.screenshot({path: join('/opt/cursor/artifacts/screenshots', name), fullPage: true});
}

async function runP0aShots(browser) {
  const dir = mkdtempSync(join(tmpdir(), 'laviste-p0a-'));
  const key = join(dir, 'master.key');
  writeFileSync(key, '12'.repeat(32));
  const adminKey = 'k'.repeat(32);
  const anaEmail = 'ana@ejemplo.com';
  const anaPassword = 'una-frase-larga';
  const app = createApp({
    dataDir: dir, password, masterKeyPath: key, apiKey: '', adminKey,
    port: 0, host: '127.0.0.1', secure: false, origin: '',
    fetcher, iolFetcher, quotesLive: false, quotesFixture: true,
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const anaId = app.store.createUser({
    email: anaEmail, displayName: 'Ana', role: 'user',
    passwordHash: hashPassword(anaPassword),
  });
  const googleId = app.store.createUser({
    email: 'google@ejemplo.com', displayName: 'G', role: 'user',
  });
  app.store.db.prepare('UPDATE users SET password_hash=?, google_sub=? WHERE id=?')
    .run('', 'google-sub-p0a', googleId);
  let resetLink = '';
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 1000}});
      page.setDefaultTimeout(20000);
      try {
        await page.goto(base + '/app');
        await submitLogin(page, anaEmail, anaPassword);
        await page.waitForFunction(() => document.querySelector('.main') && !document.querySelector('#login'));
        await page.evaluate(() => { location.hash = '#/cuenta'; });
        await page.locator('#password-form').waitFor();
        assert.equal(await page.locator('.account-page .btn.primary').count(), 1);
        assert.equal(await page.locator('.account-page > .page-heading > div > h1').innerText(), ACCOUNT_TITLE);
        if (width === 1440) await saveP0a(page, 'p0a-cuenta-header-1440.png');
        await page.locator('#pw-current').fill(anaPassword);
        await page.locator('#pw-next').fill('corta');
        await page.locator('#pw-confirm').fill('corta');
        await page.locator('.pw-wrap:has(#pw-next) .pw-toggle').click();
        await page.locator('#password-form button[type=submit]').click();
        assert.equal((await page.locator('#pw-next-error').innerText()).trim(), PW_ERR_SHORT);
        assert.equal(await page.locator('#pw-next').getAttribute('type'), 'password');
        await openAccountChrome(page, width);
        await saveP0a(page, `p0a-cuenta-${width}.png`);
        await closeAccountChrome(page, width);
      } finally {
        await page.close();
      }
    }

    {
      const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
      page.setDefaultTimeout(20000);
      try {
        await page.goto(base + '/app');
        await submitLogin(page, anaEmail, anaPassword);
        await page.waitForFunction(() => document.querySelector('.main') && !document.querySelector('#login'));
        await page.evaluate(() => { location.hash = '#/cuenta'; });
        await page.locator('#password-form').waitFor();
        assert.equal(await page.locator('#password-form [name=username]').inputValue(), anaEmail);
        await page.locator('.account-page [data-action=logout]').click();
        await page.locator('#login').waitFor();
        await submitLogin(page);
        await page.waitForFunction(() => document.querySelector('.main') && !document.querySelector('#login'));
        await page.evaluate(() => { location.hash = '#/cuenta'; });
        await page.locator('#password-form').waitFor();
        const accountText = await page.locator('.account-page').innerText();
        assert.ok(accountText.includes(ownerEmail), 'cuenta shows diego after relogin');
        assert.equal(accountText.includes(anaEmail), false, 'cuenta does not keep ana after relogin');
        assert.equal(await page.locator('#password-form [name=username]').inputValue(), ownerEmail);
        assert.ok(accountText.includes('Superadmin'));
      } finally {
        await page.close();
      }
    }

    {
      const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
      page.setDefaultTimeout(20000);
      try {
        await page.goto(base + '/app');
        await submitLogin(page, anaEmail, anaPassword);
        await page.waitForFunction(() => document.querySelector('.main') && !document.querySelector('#login'));
        await page.evaluate(() => { location.hash = '#/cuenta'; });
        await page.locator('#password-form').waitFor();
        await page.locator('#pw-current').fill(anaPassword);
        await page.locator('#pw-next').fill('clave-nueva-12');
        await page.locator('#pw-confirm').fill('clave-nueva-12');
        await page.locator('#password-form button[type=submit]').click();
        await page.locator('.form-success').waitFor();
        await saveP0a(page, 'p0a-ok-1440.png');
      } finally {
        await page.close();
      }
    }

    {
      const ctx = await browser.newContext({viewport: {width: 1440, height: 1000}});
      const page = await ctx.newPage();
      page.setDefaultTimeout(20000);
      try {
        const token = app.auth.createSession(app.auth.userById(googleId), {ip: '127.0.0.1'});
        await ctx.addCookies([{
          name: SESSION_COOKIE, value: token, url: base, httpOnly: true, sameSite: 'Strict',
        }]);
        await page.goto(base + '/app#/cuenta');
        await page.getByText(PW_GOOGLE_ONLY_BODY).waitFor();
        assert.equal(await page.locator('#password-form').count(), 0);
        assert.equal(await page.locator('.account-page .btn.primary').count(), 0);
        assert.ok(await page.getByText(DATA_EXPORT).count());
        await saveP0a(page, 'p0a-google-1440.png');
      } finally {
        await page.close();
        await ctx.close();
      }
    }

    {
      const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
      page.setDefaultTimeout(20000);
      try {
        await page.goto(base + '/app');
        await submitLogin(page);
        await page.waitForFunction(() => document.querySelector('.main') && !document.querySelector('#login'));
        await page.evaluate(() => { location.hash = '#/admin/agente'; });
        await page.locator('#admin-unlock').waitFor();
        await page.locator('#admin-unlock [name=key]').fill(adminKey);
        await page.locator('#admin-unlock button[type=submit]').click();
        await page.locator('.admin-limits').waitFor();
        await page.locator('#admin-limits-user').selectOption(anaId);
        const resetBtn = page.locator('[data-admin-action="admin-reset-access"]');
        assert.equal((await resetBtn.innerText()).trim(), ADMIN_RESET_BTN);
        assert.ok(!/\bprimary\b/.test(await resetBtn.getAttribute('class') || ''));
        await resetBtn.click();
        await page.waitForFunction(() => document.getElementById('modal')?.open);
        await page.waitForFunction(
          label => (document.activeElement?.textContent || '').includes(label),
          ADMIN_RESET_CANCEL,
        );
        await saveP0a(page, 'p0a-confirm-1440.png');
        await page.locator('[data-admin-action="reset-access-confirm"]').click();
        await page.locator('#admin-reset-link').waitFor();
        await page.waitForFunction(() => (document.getElementById('admin-reset-link')?.value || '').includes('/restablecer?t='));
        assert.equal((await page.locator('[data-admin-action="reset-access-copy"]').innerText()).trim(), ADMIN_RESET_COPY);
        resetLink = await page.locator('#admin-reset-link').inputValue();
        assert.match(resetLink, /\/app#\/restablecer\?t=/);
        assert.equal(await page.locator('#admin-reset-link').getAttribute('value'), null);
        const token = resetLink.split('t=')[1];
        assert.ok(token && token.length >= 20);
        await page.evaluate(() => {
          const input = document.getElementById('admin-reset-link');
          if (input) input.value = input.value.replace(/([?&]t=)[A-Za-z0-9_-]+/, '$1•••••••••••••••••••••••••••••••');
        });
        await saveP0a(page, 'p0a-admin-1440.png');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('modal')?.open);
        const html = await page.evaluate(() => document.documentElement.outerHTML);
        assert.equal(html.includes(token), false, 'token must not remain in the DOM after close');
      } finally {
        await page.close();
      }
    }

    {
      const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
      page.setDefaultTimeout(20000);
      try {
        if (!resetLink) {
          const minted = app.auth.createResetLink(anaId, {origin: base, source: 'admin'});
          resetLink = minted.link;
        }
        await page.goto(resetLink.replace(/^https?:\/\/[^/]+/, base));
        await page.locator('#reset-form').waitFor();
        assert.equal((await page.locator('.login h1').innerText()).trim(), RESET_TITLE);
        assert.equal(new URL(page.url()).hash, '#/restablecer');
        const toggle = page.locator('#reset-form .pw-toggle').first();
        await toggle.click();
        assert.equal(await page.locator('#reset-next').getAttribute('type'), 'text');
        assert.equal((await toggle.innerText()).trim(), PW_HIDE);
        await page.locator('#reset-next').fill('una frase larga de ejemplo');
        await page.locator('#reset-confirm').fill('no-coincide-12');
        await page.locator('#reset-form button[type=submit]').click();
        assert.equal((await page.locator('#reset-confirm-error').innerText()).trim(), PW_ERR_MATCH);
        assert.equal(await page.locator('#reset-next').getAttribute('type'), 'password');
        await saveP0a(page, 'p0a-reset-1440.png');
      } finally {
        await page.close();
      }
    }

    {
      const page = await browser.newPage({viewport: {width: 390, height: 844}});
      page.setDefaultTimeout(20000);
      try {
        await page.goto(base + '/app#/restablecer?t=token-usado-o-vencido-xxxxx');
        await page.getByRole('heading', {name: RESET_INVALID_TITLE}).waitFor();
        assert.equal(await page.locator('#reset-form').count(), 0);
        assert.ok(await page.getByRole('link', {name: RESET_TO_LOGIN}).count());
        assert.equal(
          (await page.evaluate(() => document.activeElement?.closest('.login h1, h1')?.textContent.trim())),
          RESET_INVALID_TITLE,
        );
        await saveP0a(page, 'p0a-invalid-390.png');
      } finally {
        await page.close();
      }
    }
  } finally {
    if (app.server.listening) await app.close();
    else app.store.close();
    rmSync(dir, {recursive: true, force: true});
  }
}

const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_USE_BUNDLED?{}:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}),args:['--no-sandbox','--disable-gpu']});
try{
  await assertGoogleLoginButton(browser);
  await runP0aShots(browser);
  await assertAutoUi(browser);
  await assertTd1Ajustes(browser);
  await shotUxPropuesta(browser);
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
      assert.equal(await page.locator('#login-google').count(), 0, 'Google button hidden without secrets');
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
      const draftId = await page.evaluate(() => location.hash.match(/(?:take|tesis)\/([^/]+)/)?.[1]);
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
      for (const tab of ['positions', 'idea']) {
        await hashNav('take/' + take.id + '/' + tab, 'HN3-5-' + tab);
        await page.waitForSelector(`.lv-panel[data-panel="${tab}"]`);
        assert.equal(await page.locator(`.panel-chip[data-value="${tab}"]`).getAttribute('aria-expanded'), 'true');
      }
      await hashNav('take/' + take.id + '/settings', 'HN-ajustes');
      await page.locator('.ajustes-page h1').waitFor();
      assert.equal(await page.locator('.lv-panel').count(), 0, 'settings is now the Ajustes page');
      assert.equal(await page.locator('[data-auto-section]').count(), 0, 'AU4 hidden on 404 / feature off');
      assert.equal(await page.evaluate(() => location.hash), '#/tesis/' + take.id + '/ajustes');
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
        assert.match(closedHash, /#\/tesis\/[^/]+$/, 'Cerrar returns to Resumen');
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
      await page.locator('.ajustes-page').waitFor();
      await page.locator('[data-action="pause-follow"]').click();
      await page.waitForFunction(() => document.querySelector('[data-action="pause-follow"]')?.getAttribute('aria-checked') === 'true');
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
