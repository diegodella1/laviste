import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  SESSION_EXPIRED, USER_MENU_LABEL, USER_LOGOUT, USER_ROLE_SUPERADMIN, USER_ROLE_USER,
  HOME_EMPTY_EYEBROW, HOME_EMPTY_TITLE, HOME_EMPTY_BODY, CHATS_EMPTY, AI_UNAVAILABLE,
  AI_UNAVAILABLE_USER, friendlyApiError,
} from '../public/copy.mjs';
import {settingsView} from '../public/integrations.js';

const appJs = readFileSync('public/app.js', 'utf8');
const themeCss = readFileSync('public/app-theme.css', 'utf8');
const copy = readFileSync('public/copy.mjs', 'utf8');

test('1E copy is es-AR and names the user-menu surfaces', () => {
  assert.equal(SESSION_EXPIRED, 'La sesión venció. Iniciá de nuevo.');
  assert.match(SESSION_EXPIRED, /Iniciá/);
  assert.equal(USER_MENU_LABEL, 'Tu cuenta');
  assert.equal(USER_LOGOUT, 'Cerrar sesión');
  assert.equal(USER_ROLE_SUPERADMIN, 'Superadmin');
  assert.equal(USER_ROLE_USER, 'Usuario');
  assert.equal(HOME_EMPTY_EYEBROW, 'Sin tesis todavía');
  assert.equal(HOME_EMPTY_TITLE, 'Nueva tesis');
  assert.match(HOME_EMPTY_BODY, /propuesta/);
  assert.match(CHATS_EMPTY, /conversaciones/);
  assert.equal(AI_UNAVAILABLE, 'La revisión de noticias no está disponible.');
  assert.equal(AI_UNAVAILABLE_USER, 'El análisis no está disponible en este momento. Probá más tarde.');
  assert.ok(!/Configuraci/i.test(AI_UNAVAILABLE_USER));
  assert.ok(!/invitac/i.test(copy), 'invitations copy is Fase 3');
});

test('app chrome gates Configuración, OpenAI, admin and forced refresh to superadmin', () => {
  assert.match(appJs, /function isSuperadmin\(/);
  assert.match(appJs, /function userMenuDesktop\(/);
  assert.match(appJs, /function userMenuDrawer\(/);
  assert.match(appJs, /data-user-menu="desktop"/);
  assert.match(appJs, /data-user-menu="drawer"/);
  assert.match(appJs, /openaiPendingBanner\(/);
  assert.match(appJs, /isSuperadmin\(\) && adminSession\.enabled/);
  assert.match(appJs, /coreNav\.push\(\['#\/settings', 'Configuración'\]\)/);
  assert.match(appJs, /if \(isSuperadmin\(\)\) coreNav\.push/);
  assert.ok(!appJs.includes("['#/settings', 'Configuración']];"));
  assert.match(appJs, /login\(\{expired: true\}\)/);
  assert.match(appJs, /SESSION_EXPIRED/);
  assert.match(appJs, /data-empty="tesis"/);
  assert.ok(!/invitac/i.test(appJs), 'no invitations UI in 1E');
  assert.ok(!appJs.includes('quotes-refresh'));
  assert.ok(!appJs.includes('/quotes/refresh'));
  assert.match(appJs, /friendlyApiError\(/);
  assert.ok(!appJs.includes('toast(err.message)'));
  assert.ok(!appJs.includes('toast(e.message)'));
  assert.match(appJs, /aria-expanded="false"/);
  assert.match(appJs, /closeUserMenu\(/);
  assert.match(appJs, /setAttribute\('aria-expanded'/);
  assert.match(appJs, /\[role="menuitem"\]/);
});

test('settings view remains the owner integrations surface', () => {
  const html = settingsView({
    config: {iolEnabled: false, aiConfigured: false, vaultReady: true, model: 'gpt-5-mini', dailyLimit: 30, newsLimit: 10, openaiStatus: {}},
    consumption: [],
  });
  assert.match(html, /id="openai-settings"/);
  assert.match(html, /data-action="logout"/);
  assert.match(html, /Precios de modelo y uso por usuario/);
  assert.ok(!/invitac/i.test(html));
});

test('user menu CSS keeps 44px mobile targets and one chrome dropdown', () => {
  assert.match(themeCss, /\.user-menu-toggle[\s\S]{0,400}min-height:\s*44px/);
  assert.match(themeCss, /\.user-menu-logout[\s\S]{0,200}min-height:\s*44px/);
  assert.match(themeCss, /@media \(max-width: 1023px\)[\s\S]*\.user-menu \{ display: none/);
  assert.match(themeCss, /\.user-menu-drawer/);
  assert.match(themeCss, /\.topnav \{[\s\S]{0,180}inset:\s*var\(--lv-topbar-h, 52px\)/);
});

const OWNER_AI_REQUIRED = 'Cargá tu clave OpenAI en Configuración para continuar.';

test('friendlyApiError maps aiRequired to AI_UNAVAILABLE_USER for role user', () => {
  const byMessage = Object.assign(new Error(OWNER_AI_REQUIRED), {status: 503});
  assert.equal(friendlyApiError(byMessage, {superadmin: false}), AI_UNAVAILABLE_USER);
  const byCode = Object.assign(new Error('Cargá tu clave OpenAI en Configuración para continuar.'), {
    status: 503,
    code: 'ai_required',
  });
  assert.equal(friendlyApiError(byCode, {superadmin: false}), AI_UNAVAILABLE_USER);
  assert.ok(!/Configuraci/i.test(friendlyApiError(byMessage, {superadmin: false})));
  assert.equal(friendlyApiError(new Error('No se pudo completar.'), {superadmin: false}), 'No se pudo completar.');
});

test('friendlyApiError keeps backend Configuración copy for owner/superadmin', () => {
  const err = Object.assign(new Error(OWNER_AI_REQUIRED), {status: 503, code: 'ai_required'});
  assert.equal(friendlyApiError(err, {superadmin: true}), OWNER_AI_REQUIRED);
  assert.match(friendlyApiError(err, {superadmin: true}), /Configuración/);
});
