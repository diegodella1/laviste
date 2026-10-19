import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  SESSION_EXPIRED, USER_MENU_LABEL, USER_MENU_FAQ, USER_LOGOUT, LOGIN_PRIVACY, USER_ROLE_SUPERADMIN, USER_ROLE_USER,
  HOME_EMPTY_EYEBROW, HOME_EMPTY_TITLE, HOME_EMPTY_BODY, CHATS_EMPTY, AI_UNAVAILABLE,
  AI_UNAVAILABLE_USER, friendlyApiError,
  QUOTA_CHAT, QUOTA_TOKENS, QUOTA_TOKENS_USER,
  AI_PAUSED_LABEL, AI_PAUSED_USER, AI_PAUSED_DISABLED_ADMIN, AI_PRICES_MISSING,
} from '../public/copy.mjs';
import {settingsView} from '../public/integrations.js';

const appJs = readFileSync('public/app.js', 'utf8');
const themeCss = readFileSync('public/app-theme.css', 'utf8');
const copy = readFileSync('public/copy.mjs', 'utf8');

test('1E copy is es-AR and names the user-menu surfaces', () => {
  assert.equal(SESSION_EXPIRED, 'La sesión venció. Iniciá de nuevo.');
  assert.match(SESSION_EXPIRED, /Iniciá/);
  assert.equal(USER_MENU_LABEL, 'Tu cuenta');
  assert.equal(USER_MENU_FAQ, 'Preguntas frecuentes ↗');
  assert.equal(USER_LOGOUT, 'Cerrar sesión');
  assert.equal(LOGIN_PRIVACY, 'Privacidad y datos ↗');
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
  assert.match(appJs, /PANEL_HOME_HASH, 'Inicio'/);
  assert.ok(!appJs.includes("['/', 'Inicio']"), 'Inicio is the panel, not the public site');
  assert.match(appJs, /href="\/preguntas#preguntas"/);
  assert.match(appJs, /href="\/privacidad"/);
  assert.match(appJs, /USER_MENU_FAQ/);
  assert.ok(!/user-menu-link[^"]*btn/.test(appJs));
  assert.ok(!appJs.includes("['#/settings', 'Configuración']];"));
  assert.match(appJs, /login\(\{expired: true\}\)/);
  assert.match(appJs, /SESSION_EXPIRED/);
  assert.match(appJs, /data-empty="tesis"/);
  assert.ok(!/invitac/i.test(appJs), 'no invitations UI in 1E');
  assert.ok(!appJs.includes('quotes-refresh'));
  assert.ok(!appJs.includes('/quotes/refresh'));
  assert.match(appJs, /friendlyApiError\(/);
  assert.match(appJs, /function aiStatusBanners\(/);
  assert.match(appJs, /ai-paused-banner/);
  assert.match(appJs, /data-banner="prices"/);
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
  assert.match(themeCss, /\.user-menu-link[\s\S]{0,200}min-height:\s*44px/);
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

test('friendlyApiError maps ai_paused to IA en pausa for role user', () => {
  const err = Object.assign(new Error(AI_PAUSED_DISABLED_ADMIN), {status: 503, code: 'ai_paused'});
  assert.equal(friendlyApiError(err, {superadmin: false}), AI_PAUSED_USER);
  assert.equal(friendlyApiError(err, {superadmin: true}), AI_PAUSED_DISABLED_ADMIN);
  assert.equal(AI_PAUSED_LABEL, 'IA en pausa');
  assert.match(AI_PRICES_MISSING, /Precios sin cargar/);
  assert.ok(!/user_usage|sqlite|stack/i.test(friendlyApiError(err, {superadmin: false})));
});

test('friendlyApiError maps quota codes per role without internals', () => {
  const chat = Object.assign(new Error(QUOTA_CHAT), {status: 429, code: 'quota_chat'});
  assert.equal(friendlyApiError(chat, {superadmin: false}), QUOTA_CHAT);
  assert.equal(friendlyApiError(chat, {superadmin: true}), QUOTA_CHAT);
  const tokens = Object.assign(new Error(QUOTA_TOKENS), {status: 429, code: 'quota_tokens'});
  assert.equal(friendlyApiError(tokens, {superadmin: false}), QUOTA_TOKENS_USER);
  assert.equal(friendlyApiError(tokens, {superadmin: true}), QUOTA_TOKENS);
  assert.ok(!/user_quota|sqlite|stack/i.test(friendlyApiError(tokens, {superadmin: false})));
});
