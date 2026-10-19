import {createHash, randomBytes} from 'node:crypto';
import {hashPassword, verifyPassword} from './password.mjs';
import {normalizeEmail} from './migrations/multiuser.mjs';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_PER_USER = 10;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 10;
export const SESSION_COOKIE = 'laviste_session';

export const LOGIN_GENERIC_ERROR = 'Correo o contraseña incorrectos.';
export const LOGIN_LEGACY_ERROR = 'Contraseña incorrecta.';
export const LOGIN_LOCKOUT_ERROR = 'Demasiados intentos. Esperá diez minutos.';

const EMAIL_MAX = 320;
const PASSWORD_MAX = 1024;
const UA_MAX = 240;
const DUMMY_HASH = hashPassword('laviste-dummy-verify-not-a-secret');

function fail(message, status) {
  throw Object.assign(new Error(message), {status});
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
 * Password-only is a temporary owner fallback until PR 1D.
 */
export function createAuth(store, {now = Date.now} = {}) {
  const db = store.db;
  const attempts = new Map();

  function userByEmail(email) {
    return db.prepare(
      'SELECT id,email,display_name,role,status,password_hash FROM users WHERE email=?',
    ).get(normalizeEmail(email)) || null;
  }

  function userById(id) {
    return db.prepare(
      'SELECT id,email,display_name,role,status,password_hash FROM users WHERE id=?',
    ).get(id) || null;
  }

  function owner() {
    const id = store.ownerUserId();
    return id ? userById(id) : null;
  }

  function publicOwner() {
    return publicUser(owner());
  }

  function checkRateLimit(email, ip) {
    const key = rateKey(email, ip);
    const t = now();
    const attempt = attempts.get(key) || {count: 0, at: t};
    if (t - attempt.at > LOGIN_WINDOW_MS) {
      attempt.count = 0;
      attempt.at = t;
    }
    if (attempt.count >= LOGIN_MAX_ATTEMPTS) fail(LOGIN_LOCKOUT_ERROR, 429);
    attempt.count += 1;
    attempts.set(key, attempt);
    return key;
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

  function purgeExpired() {
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(iso(now()));
  }

  function authenticate(email, password, allowLegacy) {
    const hasEmail = typeof email === 'string' && email.trim();
    if (typeof password !== 'string' || !password || password.length > PASSWORD_MAX) {
      verifyPassword('x', DUMMY_HASH);
      fail(hasEmail ? LOGIN_GENERIC_ERROR : LOGIN_LEGACY_ERROR, 401);
    }
    if (hasEmail && email.length > EMAIL_MAX) fail(LOGIN_GENERIC_ERROR, 401);

    let user = null;
    if (hasEmail) user = userByEmail(email);
    else if (allowLegacy) user = owner();
    else fail(LOGIN_GENERIC_ERROR, 401);

    const ok = verifyPassword(password, user?.password_hash || DUMMY_HASH);
    if (!ok || !user || user.status !== 'active') {
      fail(hasEmail ? LOGIN_GENERIC_ERROR : LOGIN_LEGACY_ERROR, 401);
    }
    return user;
  }

  function login({email, password, ip, ua, allowLegacy = true} = {}) {
    const hasEmail = typeof email === 'string' && email.trim();
    const key = checkRateLimit(hasEmail ? email : 'legacy-owner', ip);
    const user = authenticate(email, password, allowLegacy);
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
    revoke,
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
