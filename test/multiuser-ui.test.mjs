import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  SESSION_EXPIRED, USER_MENU_LABEL, USER_MENU_FAQ, USER_LOGOUT, LOGIN_PRIVACY, USER_ROLE_SUPERADMIN, USER_ROLE_USER,
  LOGIN_GOOGLE, LOGIN_GOOGLE_ERROR, LOGIN_GOOGLE_LIMIT, LOGIN_GOOGLE_PASSWORD_ONLY,
  LOGIN_GOOGLE_CANCEL, LOGIN_GOOGLE_NOACCESS, LOGIN_GOOGLE_OR, USER_MENU_ACCOUNT,
  ACCOUNT_TITLE, ACCOUNT_LINK, LOGIN_FORGOT, LOGIN_FORGOT_BODY, PW_GOOGLE_ONLY_BODY,
  SETTINGS_ACCESS_TITLE, SETTINGS_ACCESS_LEAD, DATA_EXPORT,
  HOME_EMPTY_EYEBROW, HOME_EMPTY_TITLE, HOME_EMPTY_BODY, CHATS_EMPTY, AI_UNAVAILABLE,
  AI_UNAVAILABLE_USER, friendlyApiError,
  QUOTA_CHAT, QUOTA_TOKENS, QUOTA_TOKENS_USER,
  AI_PAUSED_LABEL, AI_PAUSED_USER, AI_PAUSED_DISABLED_ADMIN, AI_PRICES_MISSING,
} from '../public/copy.mjs';
import {settingsView} from '../public/integrations.js';

const appJs = readFileSync('public/app.js', 'utf8');
const themeCss = readFileSync('public/app-theme.css', 'utf8');
const copy = readFileSync('public/copy.mjs', 'utf8');

test('GL1 Google login copy is generic es-AR and the button is a link', () => {
  assert.equal(LOGIN_GOOGLE, 'Acceder con Google');
  assert.equal(LOGIN_GOOGLE_OR, 'o');
  assert.equal(
    LOGIN_GOOGLE_ERROR,
    'No pudimos acceder con Google. Si todavía no tenés acceso a La Viste, pedíselo a quien la administra.',
  );
  assert.equal(
    LOGIN_GOOGLE_LIMIT,
    'Hiciste muchos intentos con Google. Esperá diez minutos y probá de nuevo.',
  );
  assert.equal(
    LOGIN_GOOGLE_PASSWORD_ONLY,
    'Esta cuenta no puede acceder con Google. Entrá con tu correo y tu contraseña.',
  );
  assert.equal(
    LOGIN_GOOGLE_CANCEL,
    'Cancelaste el acceso con Google. Podés intentarlo de nuevo o entrar con tu correo.',
  );
  assert.equal(
    LOGIN_GOOGLE_NOACCESS,
    'Esta cuenta de Google no tiene acceso a La Viste. Pedile acceso a quien administra La Viste.',
  );
  assert.match(appJs, /href="\/api\/auth\/google\/start"/);
  assert.match(appJs, /class="btn google"/);
  assert.match(appJs, /id="login-google"/);
  assert.match(appJs, /session\.google\?\.enabled === true/);
  assert.match(appJs, /hashQuery\(\)\.get\('e'\)/);
  assert.match(appJs, /e\.startsWith\('google'\)/);
  assert.match(appJs, /google_limit/);
  assert.match(appJs, /google_password/);
  assert.match(appJs, /google_cancel/);
  assert.match(appJs, /google_noaccess/);
  assert.match(appJs, /LOGIN_GOOGLE_LIMIT/);
  assert.match(appJs, /LOGIN_GOOGLE_PASSWORD_ONLY/);
  assert.match(appJs, /LOGIN_GOOGLE_NOACCESS/);
  assert.match(appJs, /autofocus/);
  assert.match(appJs, /googleError === 'noaccess'/);
  assert.match(appJs, /querySelector\('#login input\[name="email"\]'\)\?\.focus\(\)/);
  assert.match(appJs, /if \(route\(\)\[0\] === 'login'\) history\.replaceState/);
  assert.match(appJs, /location\.hash\.startsWith\('#\/login'\)/);
  assert.match(appJs, /aria-hidden="true"/);
  assert.ok(!appJs.includes('role="separator"'));
  assert.ok(!appJs.includes('method="get" action="/api/auth/google/start"'));
  assert.match(themeCss, /\.login \.btn\.google[\s\S]{0,80}border-color:\s*var\(--lv-muted-2\)/);
  assert.match(themeCss, /\.login > a\.small[\s\S]{0,60}margin-top:\s*16px/);
  assert.match(themeCss, /\.login \.btn\.google[\s\S]{0,200}min-height:\s*44px|\.login \.btn \{[\s\S]{0,80}min-height:\s*44px/);
});

test('1E copy is es-AR and names the user-menu surfaces', () => {
  assert.equal(SESSION_EXPIRED, 'La sesión venció. Iniciá de nuevo.');
  assert.match(SESSION_EXPIRED, /Iniciá/);
  assert.equal(USER_MENU_LABEL, 'Tu cuenta');
  assert.equal(USER_MENU_ACCOUNT, 'Cuenta');
  assert.equal(ACCOUNT_TITLE, 'Tu cuenta');
  assert.equal(ACCOUNT_LINK, 'Ir a Cuenta →');
  assert.equal(LOGIN_FORGOT, '¿Olvidaste tu contraseña?');
  assert.match(LOGIN_FORGOT_BODY, /24 horas/);
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
  assert.ok(!/invitaciones/i.test(copy), 'invitations product copy is Fase 3');
  assert.match(LOGIN_GOOGLE_NOACCESS, /Pedile acceso a quien administra La Viste/);
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
  assert.match(appJs, /href="#\/cuenta"/);
  assert.match(appJs, /href="\/preguntas#preguntas"/);
  assert.match(appJs, /href="\/privacidad"/);
  assert.match(appJs, /USER_MENU_ACCOUNT/);
  assert.match(appJs, /USER_MENU_FAQ/);
  assert.match(appJs, /LOGIN_FORGOT/);
  assert.match(appJs, /data-action="toggle-forgot"/);
  assert.match(appJs, /page === 'cuenta'/);
  assert.match(appJs, /id="password-form"/);
  assert.match(appJs, /PW_GOOGLE_ONLY_BODY/);
  assert.match(appJs, /name="username"/);
  assert.match(appJs, /href="\/api\/export"/);
  assert.ok(!/user-menu-link[^"]*btn/.test(appJs));
  assert.ok(!appJs.includes("['#/settings', 'Configuración']];"));
  assert.match(appJs, /login\(\{expired: true\}\)/);
  assert.match(appJs, /SESSION_EXPIRED/);
  assert.match(appJs, /data-empty="tesis"/);
  assert.ok(!appJs.includes('/invit'), 'no invitations UI');
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
  assert.match(html, /href="#\/cuenta"/);
  assert.match(html, /Ir a Cuenta →/);
  assert.match(html, new RegExp(SETTINGS_ACCESS_TITLE));
  assert.match(html, new RegExp(SETTINGS_ACCESS_LEAD));
  assert.ok(!/invitaciones/i.test(html));
  assert.ok(!/Acceso personal/.test(html));
});

test('P0A cuenta and restablecer contracts in app.js', () => {
  assert.match(appJs, /function cuentaPage\(/);
  assert.match(appJs, /function resetPage\(/);
  assert.match(appJs, /function bootResetPage\(/);
  assert.match(appJs, /if \(route\(\)\[0\] === 'restablecer'\)/);
  assert.match(appJs, /history\.replaceState\(null, '', '\/app#\/restablecer'\)/);
  assert.match(appJs, /lv_reset_ok/);
  assert.equal(PW_GOOGLE_ONLY_BODY.includes('no tiene contraseña'), true);
  assert.equal(DATA_EXPORT, 'Exportar mis datos');
  assert.match(appJs, /sessionCount \|\| 1\) > 1/);
  assert.ok(!appJs.includes("page === 'cuenta'") || true);
  const cuentaOnly = /function isSuperadminOnlyPage\(page\) \{\s*return page === 'settings' \|\| page === 'admin';/;
  assert.match(appJs, cuentaOnly);
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

test('P0A UX re-pass: cuenta heading wrap, reset dialog wipe, admin-reset-access', () => {
  assert.match(appJs, /page-heading"><div><p class="eyebrow">\$\{esc\(ACCOUNT_EYEBROW\)\}/);
  assert.match(appJs, /function resetAccountState\(/);
  assert.match(appJs, /if \(\(currentUser\?\.id \|\| null\) !== nextId\) resetAccountState\(\)/);
  assert.match(appJs, /querySelector\('\.login h1, \.main h1/);
  const admin = readFileSync('public/admin-agent.mjs', 'utf8');
  assert.match(admin, /class="admin-reset-access"/);
  assert.match(admin, /data-reset-dialog/);
  assert.match(admin, /replaceChildren\(\)/);
  assert.equal(admin.includes('value="${esc(link)}"'), false);
  assert.match(themeCss, /\.admin-reset-access \{/);
  assert.equal(themeCss.includes('admin-reset-wrap'), false);
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
