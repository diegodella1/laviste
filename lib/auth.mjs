import {createHash, randomBytes} from 'node:crypto';
import {hashPassword, verifyPassword} from './password.mjs';
import {normalizeEmail} from './migrations/multiuser.mjs';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_PER_USER = 10;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 10;
export const SESSION_COOKIE = 'laviste_session';

export const LOGIN_GENERIC_ERROR = 'Correo o contraseña incorrectos.';
export const LOGIN_LOCKOUT_ERROR = 'Demasiados intentos. Esperá diez minutos.';

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 1024;
export const RESET_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export {AUDIT_RETENTION_MS} from './store-access.mjs';
export const RESET_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const RESET_CHECK_MAX = 20;
export const ADMIN_RESET_WINDOW_MS = 60 * 60 * 1000;
export const ADMIN_RESET_MAX = 10;

export const PW_ERR_CURRENT_EMPTY = 'Escribí tu contraseña actual.';
export const PW_ERR_CURRENT = 'La contraseña actual no es correcta.';
export const PW_ERR_NEW_EMPTY = 'Escribí una contraseña nueva.';
export const PW_ERR_SHORT = 'Usá al menos 12 caracteres.';
export const PW_ERR_LONG = 'Es demasiado larga. Usá menos de 1024 caracteres.';
export const PW_ERR_MATCH = 'Las contraseñas no coinciden.';
export const PW_ERR_SAME = 'Elegí una contraseña distinta de la actual.';
export const PW_ERR_EMAIL = 'No uses tu correo como contraseña.';
export const PW_ERR_RATE = LOGIN_LOCKOUT_ERROR;
export const PW_ERR_NOT_SET =
  'Tu cuenta no tiene contraseña. Pedile a quien administra La Viste un enlace para crearla.';
export const RESET_INVALID = 'Este enlace venció o ya se usó';
export const RESET_INVALID_TITLE = 'Este enlace venció o ya se usó';
export const RESET_INVALID_BODY =
  'Los enlaces duran 24 horas y sirven una sola vez. Pedile uno nuevo a quien administra La Viste.';
export const RESET_RATE = 'Demasiados intentos desde esta conexión. Esperá diez minutos.';
export const ADMIN_RESET_SELF = 'Para tu propia cuenta usá Cuenta → Cambiar contraseña.';
export const ADMIN_RESET_SUSPENDED =
  'La cuenta está suspendida. Reactivala antes de restablecer el acceso.';
export const ADMIN_RESET_ERR_NOT_FOUND = 'Esa cuenta ya no existe. Recargá la página.';
export const ADMIN_RESET_RATE = 'Generaste muchos enlaces en la última hora. Esperá un rato.';

const EMAIL_MAX = 320;
const UA_MAX = 240;
const DUMMY_HASH = hashPassword('laviste-dummy-verify-not-a-secret');

function fail(message, status, code) {
  throw Object.assign(new Error(message), {status, ...(code ? {code} : {})});
}

/** New-password rule: ≥12, ≤PASSWORD_MAX, not the email. */
export function validateNewPassword(next, {email} = {}) {
  if (typeof next !== 'string' || !next) fail(PW_ERR_NEW_EMPTY, 400, 'password_too_short');
  if (next.length < PASSWORD_MIN) fail(PW_ERR_SHORT, 400, 'password_too_short');
  if (next.length > PASSWORD_MAX) fail(PW_ERR_LONG, 400, 'password_too_long');
  const emailNorm = normalizeEmail(email);
  if (emailNorm && next.trim().toLowerCase() === emailNorm) fail(PW_ERR_EMAIL, 400, 'password_is_email');
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function hashIp(ip) {
  return createHash('sha256').update(String(ip || 'unknown')).digest('hex');
}

export function clientIp(req) {
  return req?.socket?.remoteAddress || 'unknown';
}

export function sessionCookieHeader(token, {maxAge = SESSION_TTL_MS / 1000, secure = false} = {}) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${Math.floor(maxAge)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookieHeader({secure = false} = {}) {
  return sessionCookieHeader('', {maxAge: 0, secure});
}

export function mintResetToken() {
  return randomBytes(32).toString('base64url');
}

export function resetLinkOrigin(req, config = {}) {
  const configured = String(config.origin || '').replace(/\/$/, '');
  if (configured) return configured;
  const host = req?.headers?.host || '127.0.0.1';
  return `${config.secure ? 'https' : 'http'}://${host}`;
}

export function formatResetExpiry(isoString) {
  const d = new Date(isoString);
  const fecha = d.toLocaleDateString('es-AR', {
    timeZone: 'America/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const hora = d.toLocaleTimeString('es-AR', {
    timeZone: 'America/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return {fecha, hora};
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? row.displayName,
    role: row.role,
  };
}

function rateKey(email, ip) {
  return hashToken(`${normalizeEmail(email) || 'legacy-owner'}|${hashIp(ip)}`);
}

function iso(ms) {
  return new Date(ms).toISOString();
}

/**
 * Persistent sessions + email/password login against `users`.
 * Password-only owner fallback was removed in PR 1D.
 */
export function createAuth(store, {now = Date.now} = {}) {
  const db = store.db;
  const attempts = new Map();
  let lastAuditPurgeAt = 0;

  function writeAudit(entry) {
    store.writeAudit(entry);
  }

  function userByEmail(email) {
    return db.prepare(
      'SELECT id,email,display_name,role,status,password_hash,google_sub FROM users WHERE email=?',
    ).get(normalizeEmail(email)) || null;
  }

  function userById(id) {
    return db.prepare(
      'SELECT id,email,display_name,role,status,password_hash,google_sub FROM users WHERE id=?',
    ).get(id) || null;
  }

  function owner() {
    const id = store.ownerUserId();
    return id ? userById(id) : null;
  }

  function publicOwner() {
    return publicUser(owner());
  }

  function checkLimit(key, {windowMs, max, message, code, onLimited} = {}) {
    const t = now();
    const attempt = attempts.get(key) || {count: 0, at: t, audited: false};
    if (t - attempt.at > windowMs) {
      attempt.count = 0;
      attempt.at = t;
      attempt.audited = false;
    }
    if (attempt.count >= max) {
      if (!attempt.audited) {
        attempt.audited = true;
        attempts.set(key, attempt);
        onLimited?.();
      }
      fail(message, 429, code);
    }
    attempt.count += 1;
    attempts.set(key, attempt);
    return key;
  }

  function checkRateLimit(email, ip) {
    return checkLimit(rateKey(email, ip), {
      windowMs: LOGIN_WINDOW_MS,
      max: LOGIN_MAX_ATTEMPTS,
      message: LOGIN_LOCKOUT_ERROR,
    });
  }

  function checkPasswordLimit(userId) {
    return checkLimit(`pw|${userId}`, {
      windowMs: LOGIN_WINDOW_MS,
      max: LOGIN_MAX_ATTEMPTS,
      message: PW_ERR_RATE,
      code: 'password_rate_limited',
      onLimited: () => writeAudit({
        actorUserId: userId, action: 'auth.password_rate_limited', target: userId, meta: {},
      }),
    });
  }

  function checkResetIpLimit(ip) {
    return checkLimit(`reset|${hashIp(ip)}`, {
      windowMs: LOGIN_WINDOW_MS,
      max: RESET_CHECK_MAX,
      message: RESET_RATE,
      code: 'reset_rate_limited',
    });
  }

  function checkAdminResetLimit(adminId) {
    return checkLimit(`adminreset|${adminId}`, {
      windowMs: ADMIN_RESET_WINDOW_MS,
      max: ADMIN_RESET_MAX,
      message: ADMIN_RESET_RATE,
      code: 'reset_admin_rate_limited',
    });
  }

  function pruneSessions(userId) {
    const t = iso(now());
    db.prepare('DELETE FROM sessions WHERE user_id=? AND expires_at<?').run(userId, t);
    const rows = db.prepare(
      'SELECT token_hash FROM sessions WHERE user_id=? ORDER BY created_at DESC',
    ).all(userId);
    if (rows.length <= SESSION_MAX_PER_USER) return;
    const extra = rows.slice(SESSION_MAX_PER_USER).map(row => row.token_hash);
    db.prepare(`DELETE FROM sessions WHERE token_hash IN (${extra.map(() => '?').join(',')})`)
      .run(...extra);
  }

  function createSession(user, {ip, ua} = {}) {
    const token = randomBytes(32).toString('hex');
    const created = iso(now());
    db.prepare(`INSERT INTO sessions(token_hash,user_id,expires_at,created_at,ip_hash,ua)
      VALUES (?,?,?,?,?,?)`).run(
      hashToken(token), user.id, iso(now() + SESSION_TTL_MS), created, hashIp(ip),
      String(ua || '').slice(0, UA_MAX),
    );
    db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(created, user.id);
    pruneSessions(user.id);
    return token;
  }

  function slideExpiry(tokenHash, expiresAt) {
    const remaining = Date.parse(expiresAt) - now();
    if (!Number.isFinite(remaining) || remaining >= SESSION_TTL_MS / 2) return expiresAt;
    const next = iso(now() + SESSION_TTL_MS);
    db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(next, tokenHash);
    return next;
  }

  function sessionFromToken(token) {
    if (!token) return null;
    const row = db.prepare(`
      SELECT s.token_hash, s.user_id, s.expires_at, u.email, u.display_name, u.role, u.status
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `).get(hashToken(token));
    if (!row) return null;
    if (Date.parse(row.expires_at) <= now()) {
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(row.token_hash);
      return null;
    }
    if (row.status !== 'active') return null;
    const expiresAt = slideExpiry(row.token_hash, row.expires_at);
    const user = publicUser({
      id: row.user_id,
      email: row.email,
      display_name: row.display_name,
      role: row.role,
    });
    return {tokenHash: row.token_hash, user, role: user.role, expiresAt};
  }

  function revoke(token) {
    if (!token) return;
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
  }

  function revokeOthers(userId, keepTokenHash) {
    if (!userId) return 0;
    if (keepTokenHash) {
      return db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(userId, keepTokenHash).changes;
    }
    return db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId).changes;
  }

  function revokeAll(userId) {
    return revokeOthers(userId, null);
  }

  function clearUnusedResets(userId) {
    if (!userId) return 0;
    return db.prepare('DELETE FROM password_resets WHERE user_id=? AND used_at IS NULL').run(userId).changes;
  }

  function sessionCount(userId) {
    if (!userId) return 0;
    const t = iso(now());
    db.prepare('DELETE FROM sessions WHERE user_id=? AND expires_at<?').run(userId, t);
    return db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(userId).n;
  }

  function accountInfo(userId) {
    const row = userById(userId);
    if (!row) return null;
    return {
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      hasPassword: row.password_hash !== '',
      googleLinked: !!row.google_sub,
      sessionCount: sessionCount(userId),
    };
  }

  function rejectReset(reason, ip) {
    writeAudit({
      actorUserId: null, action: 'auth.reset_link_rejected', target: null,
      meta: {reason}, ipHash: hashIp(ip),
    });
    fail(RESET_INVALID_TITLE, 400, 'reset_invalid');
  }

  function assertResetTokenFormat(token) {
    if (typeof token !== 'string' || !RESET_TOKEN_RE.test(token)) {
      fail(RESET_INVALID_TITLE, 400, 'reset_invalid');
    }
  }

  function changePassword(userId, {current, next, ip, ua} = {}) {
    const user = userById(userId);
    if (!user || user.status !== 'active') fail('Iniciá sesión para continuar.', 401);
    const limitKey = checkPasswordLimit(user.id);
    if (user.password_hash === '') fail(PW_ERR_NOT_SET, 409, 'password_not_set');
    if (typeof current !== 'string' || !current) {
      verifyPassword('x', DUMMY_HASH);
      fail(PW_ERR_CURRENT_EMPTY, 400, 'password_current_required');
    }
    validateNewPassword(next, {email: user.email});
    const ok = verifyPassword(current, user.password_hash);
    if (!ok) fail(PW_ERR_CURRENT, 400, 'password_current_invalid');
    if (next === current) fail(PW_ERR_SAME, 400, 'password_same');
    attempts.delete(limitKey);
    return store.transaction(() => {
      const prior = sessionCount(user.id);
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next), user.id);
      revokeAll(user.id);
      clearUnusedResets(user.id);
      const token = createSession(user, {ip, ua});
      const revokedSessions = Math.max(0, prior - 1);
      writeAudit({
        actorUserId: user.id, action: 'auth.password_changed', target: user.id,
        meta: {revokedSessions}, ipHash: hashIp(ip),
      });
      return {ok: true, revokedSessions, token, user: publicUser(user)};
    });
  }

  function setPassword(userId, next) {
    const user = userById(userId);
    if (!user) fail(ADMIN_RESET_ERR_NOT_FOUND, 404, 'user_not_found');
    validateNewPassword(next, {email: user.email});
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next), user.id);
    return publicUser(user);
  }

  function resetPasswordCli(userId, next) {
    const user = userById(userId);
    if (!user) fail(ADMIN_RESET_ERR_NOT_FOUND, 404, 'user_not_found');
    if (user.status === 'suspended') fail(ADMIN_RESET_SUSPENDED, 409, 'reset_target_suspended');
    validateNewPassword(next, {email: user.email});
    return store.transaction(() => {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next), user.id);
      const revoked = revokeAll(user.id);
      clearUnusedResets(user.id);
      writeAudit({
        actorUserId: null, action: 'auth.reset_cli', target: user.id, meta: {mode: 'password'},
      });
      return {email: user.email, revoked};
    });
  }

  function createResetLink(userId, {
    origin, createdBy = null, source = 'admin', ip, actorUserId = createdBy,
  } = {}) {
    const user = userById(userId);
    if (!user) fail(ADMIN_RESET_ERR_NOT_FOUND, 404, 'user_not_found');
    if (user.status === 'suspended') fail(ADMIN_RESET_SUSPENDED, 409, 'reset_target_suspended');
    const token = mintResetToken();
    const createdAt = iso(now());
    const expiresAt = iso(now() + RESET_TTL_MS);
    store.transaction(() => {
      // A reset never leaves password_hash '' (D5): bootstrapOwnerPassword would refill the owner.
      db.prepare('UPDATE users SET password_hash=? WHERE id=?')
        .run(hashPassword(randomBytes(32).toString('hex')), user.id);
      revokeAll(user.id);
      clearUnusedResets(user.id);
      db.prepare(`INSERT INTO password_resets(
        token_hash, user_id, created_by, source, created_at, expires_at, used_at
      ) VALUES (?,?,?,?,?,?,NULL)`).run(
        hashToken(token), user.id, createdBy, source, createdAt, expiresAt,
      );
      if (source === 'cli') {
        writeAudit({
          actorUserId: null, action: 'auth.reset_cli', target: user.id, meta: {mode: 'link'},
        });
      } else {
        writeAudit({
          actorUserId: actorUserId, action: 'auth.reset_link_created', target: user.id,
          meta: {expiresAt, source: 'admin'}, ipHash: hashIp(ip),
        });
      }
    });
    const base = String(origin || '').replace(/\/$/, '');
    return {link: `${base}/app#/restablecer?t=${token}`, email: user.email, expiresAt, token};
  }

  function lookupReset(token) {
    return db.prepare(`
      SELECT r.token_hash, r.user_id, r.expires_at, r.used_at, r.source,
             u.email, u.display_name, u.role, u.status
      FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = ?
    `).get(hashToken(token)) || null;
  }

  function checkResetToken(token, {ip} = {}) {
    checkResetIpLimit(ip);
    assertResetTokenFormat(token);
    const row = lookupReset(token);
    if (!row) rejectReset('unknown', ip);
    if (row.used_at) rejectReset('used', ip);
    if (Date.parse(row.expires_at) <= now()) rejectReset('expired', ip);
    if (row.status !== 'active') rejectReset('suspended', ip);
    return {email: row.email, expiresAt: row.expires_at};
  }

  function consumeResetToken(token, {ip, next, ua} = {}) {
    checkResetIpLimit(ip);
    assertResetTokenFormat(token);
    return store.transaction(() => {
      const t = iso(now());
      const upd = db.prepare(
        'UPDATE password_resets SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?',
      ).run(t, hashToken(token), t);
      if (upd.changes !== 1) {
        const row = lookupReset(token);
        const reason = !row ? 'unknown' : row.used_at ? 'used' : 'expired';
        rejectReset(reason, ip);
      }
      const row = lookupReset(token);
      if (!row || row.status !== 'active') rejectReset('suspended', ip);
      validateNewPassword(next, {email: row.email});
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next), row.user_id);
      revokeAll(row.user_id);
      clearUnusedResets(row.user_id);
      const user = userById(row.user_id);
      const sessionToken = createSession(user, {ip, ua});
      writeAudit({
        actorUserId: user.id, action: 'auth.password_reset', target: user.id,
        meta: {source: row.source}, ipHash: hashIp(ip),
      });
      return {
        ok: true,
        user: publicUser(user),
        role: user.role,
        token: sessionToken,
      };
    });
  }

  function purgeExpired() {
    const t = iso(now());
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(t);
    const cutoff = iso(now() - RESET_PURGE_AFTER_MS);
    db.prepare(`
      DELETE FROM password_resets
      WHERE (used_at IS NOT NULL AND used_at < ?)
         OR (used_at IS NULL AND expires_at < ?)
    `).run(cutoff, cutoff);
    const tMs = now();
    if (tMs - lastAuditPurgeAt >= 24 * 60 * 60 * 1000) {
      lastAuditPurgeAt = tMs;
      store.purgeAuditLog({now});
    }
  }

  function authenticate(email, password) {
    const hasEmail = typeof email === 'string' && email.trim();
    if (typeof password !== 'string' || !password || password.length > PASSWORD_MAX) {
      verifyPassword('x', DUMMY_HASH);
      fail(LOGIN_GENERIC_ERROR, 401);
    }
    if (!hasEmail || email.length > EMAIL_MAX) {
      verifyPassword('x', DUMMY_HASH);
      fail(LOGIN_GENERIC_ERROR, 401);
    }

    const user = userByEmail(email);
    const ok = verifyPassword(password, user?.password_hash || DUMMY_HASH);
    if (!ok || !user || user.status !== 'active') fail(LOGIN_GENERIC_ERROR, 401);
    return user;
  }

  function login({email, password, ip, ua} = {}) {
    const hasEmail = typeof email === 'string' && email.trim();
    const key = checkRateLimit(hasEmail ? email : 'missing-email', ip);
    const user = authenticate(email, password);
    attempts.delete(key);
    const token = createSession(user, {ip, ua});
    return {token, user: publicUser(user), role: user.role};
  }

  /** Fill an empty owner hash from APP_PASSWORD. Never rotates an existing hash. */
  function bootstrapOwnerPassword(password) {
    if (!password) return false;
    const row = owner();
    if (!row || row.password_hash) return false;
    db.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=\'\'')
      .run(hashPassword(password), row.id);
    return true;
  }

  return {
    login,
    sessionFromToken,
    createSession,
    revoke,
    revokeOthers,
    revokeAll,
    changePassword,
    setPassword,
    resetPasswordCli,
    createResetLink,
    checkResetToken,
    consumeResetToken,
    me: accountInfo,
    accountInfo,
    sessionCount,
    checkRateLimit,
    checkPasswordLimit,
    checkResetIpLimit,
    checkAdminResetLimit,
    clearUnusedResets,
    purgeExpired,
    userByEmail,
    userById,
    owner,
    publicOwner,
    publicUser,
    bootstrapOwnerPassword,
    attempts,
  };
}
