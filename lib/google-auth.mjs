import {readFileSync} from 'node:fs';
import {
  createCipheriv, createDecipheriv, createHash, createPublicKey,
  randomBytes, verify,
} from 'node:crypto';
import {
  LOGIN_LOCKOUT_ERROR, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS, SESSION_TTL_MS,
  clientIp, hashIp, hashToken, sessionCookieHeader,
} from './auth.mjs';
import {normalizeEmail} from './migrations/multiuser.mjs';

export const GOOGLE_AUTH_START = '/api/auth/google/start';
export const GOOGLE_AUTH_CALLBACK = '/api/auth/google/callback';
export const GOOGLE_OAUTH_COOKIE = 'laviste_oauth';
export const GOOGLE_ERROR_PATH = '/app#/login?e=google';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISS = Object.freeze(['https://accounts.google.com', 'accounts.google.com']);
export const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
export const GOOGLE_TOKEN_TIMEOUT_MS = 10_000;
export const GOOGLE_CLOCK_SKEW_S = 60;

export const GOOGLE_REJECT = Object.freeze({
  no_user: 'no_user',
  suspended: 'suspended',
  sub_mismatch: 'sub_mismatch',
  email_unverified: 'email_unverified',
  superadmin_blocked: 'superadmin_blocked',
  token_invalid: 'token_invalid',
  state_invalid: 'state_invalid',
});

const CALLBACK_HTML = '<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/app"><title>La Viste</title></head><body></body></html>';
const NOT_FOUND = 'No encontrado.';

function fail(message, status, reason) {
  throw Object.assign(new Error(message), {status, reason});
}

function readOptionalFile(path) {
  if (!path) return '';
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}

/** File-backed secrets. Missing or unreadable files leave Google disabled. Never logs values. */
export function readGoogleSecrets({
  clientId = '', clientSecret = '', clientIdFile = '', clientSecretFile = '',
} = {}) {
  const id = String(clientId || '').trim() || readOptionalFile(clientIdFile);
  const secret = String(clientSecret || '').trim() || readOptionalFile(clientSecretFile);
  return {clientId: id, clientSecret: secret, enabled: !!(id && secret)};
}

export function allowGoogleSuperadmin(value) {
  if (value === true) return true;
  if (value === false) return false;
  const env = process.env.GOOGLE_ALLOW_SUPERADMIN;
  return env === '1' || env === 'true' || env === 'yes';
}

export function b64url(value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return buf.toString('base64url');
}

export function sha256Raw(value) {
  return createHash('sha256').update(value).digest();
}

export function pkceChallenge(verifier) {
  return b64url(sha256Raw(String(verifier)));
}

export function generatePkce() {
  const verifier = b64url(randomBytes(32));
  return {verifier, challenge: pkceChallenge(verifier)};
}

export function oauthCookieHeader(token, {maxAge = 600, secure = false} = {}) {
  const parts = [
    `${GOOGLE_OAUTH_COOKIE}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/api/auth/google',
    `Max-Age=${Math.floor(maxAge)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearOauthCookieHeader({secure = false} = {}) {
  return oauthCookieHeader('', {maxAge: 0, secure});
}

export function cookieValue(req, name) {
  const raw = req?.headers?.cookie;
  if (!raw) return '';
  for (const part of String(raw).split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return '';
}

export function googleRedirectUri(req, origin = '', secure = false) {
  if (origin) return `${String(origin).replace(/\/$/, '')}${GOOGLE_AUTH_CALLBACK}`;
  const host = req?.headers?.host || 'localhost';
  return `${secure ? 'https' : 'http'}://${host}${GOOGLE_AUTH_CALLBACK}`;
}

function parseMaxAge(header) {
  const match = String(header || '').match(/max-age\s*=\s*(\d+)/i);
  return match ? Number(match[1]) * 1000 : 60_000;
}

function wrapSecret(plain, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

function unwrapSecret(packed, key) {
  const buf = Buffer.from(String(packed), 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function decodeJsonPart(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  }
}

export function createJwksCache({fetcher, now = Date.now} = {}) {
  let keys = [];
  let exp = 0;

  async function refresh() {
    const res = await fetcher(GOOGLE_JWKS_URL);
    if (!res?.ok) fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
    const body = await res.json();
    keys = Array.isArray(body?.keys) ? body.keys : [];
    const header = res.headers?.get?.('cache-control') || res.headers?.get?.('Cache-Control') || '';
    exp = now() + parseMaxAge(header);
  }

  async function keysForKid(kid) {
    const hit = keys.some(key => key.kid === kid);
    if (hit && now() < exp) return keys;
    await refresh();
    if (keys.some(key => key.kid === kid)) return keys;
    await refresh();
    return keys;
  }

  return {keysForKid, refresh, snapshot: () => ({keys, exp})};
}

export async function verifyGoogleIdToken(idToken, {
  clientId, nonce, jwks, now = Date.now,
} = {}) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  const header = decodeJsonPart(parts[0]);
  const payload = decodeJsonPart(parts[1]);
  if (header?.alg !== 'RS256' || !header.kid) {
    fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  }
  const keys = await jwks.keysForKid(header.kid);
  const jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  let pub;
  try {
    pub = createPublicKey({key: jwk, format: 'jwk'});
  } catch {
    fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  }
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  let sig;
  try {
    sig = Buffer.from(parts[2], 'base64url');
  } catch {
    fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  }
  if (!verify('RSA-SHA256', signed, pub, sig)) {
    fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  }
  const t = Math.floor(now() / 1000);
  if (!GOOGLE_ISS.includes(payload.iss) || payload.aud !== clientId) {
    fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  }
  if (payload.azp != null && payload.azp !== clientId) {
    fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  }
  if (!(Number(payload.exp) > t - GOOGLE_CLOCK_SKEW_S)) {
    fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  }
  if (!(Number(payload.iat) <= t + GOOGLE_CLOCK_SKEW_S)) {
    fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  }
  if (!payload.sub || payload.nonce !== nonce) {
    fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
  }
  return payload;
}

export function emailVerified(claim) {
  return claim === true || claim === 'true';
}

export function emailDomain(email) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  return at >= 0 ? normalized.slice(at + 1) : '';
}

function json(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

function redirectError(res, {secure = false} = {}) {
  res.writeHead(302, {
    Location: GOOGLE_ERROR_PATH,
    'Set-Cookie': clearOauthCookieHeader({secure}),
    'Cache-Control': 'no-store',
  });
  res.end();
}

export function createGoogleAuth(store, auth, options = {}) {
  const secrets = readGoogleSecrets(options);
  const enabled = secrets.enabled === true && options.enabled !== false;
  const allowSuperadmin = allowGoogleSuperadmin(options.allowSuperadmin);
  const fetcher = options.fetcher || globalThis.fetch;
  const now = options.now || Date.now;
  const secure = options.secure === true;
  const origin = options.origin || '';
  const tokenTimeoutMs = Number.isFinite(options.tokenTimeoutMs)
    ? options.tokenTimeoutMs
    : GOOGLE_TOKEN_TIMEOUT_MS;
  const wrapKey = randomBytes(32);
  const pending = new Map();
  const attempts = new Map();
  const jwks = createJwksCache({fetcher, now});
  const db = store.db;

  function prunePending() {
    const t = now();
    for (const [key, rec] of pending) {
      if (rec.exp <= t) pending.delete(key);
    }
  }

  function checkIpLimit(ip) {
    const key = hashIp(ip);
    const t = now();
    const attempt = attempts.get(key) || {count: 0, at: t};
    if (t - attempt.at > LOGIN_WINDOW_MS) {
      attempt.count = 0;
      attempt.at = t;
    }
    if (attempt.count >= LOGIN_MAX_ATTEMPTS) fail(LOGIN_LOCKOUT_ERROR, 429);
    attempt.count += 1;
    attempts.set(key, attempt);
  }

  function consumeState(state) {
    const key = hashToken(state);
    const rec = pending.get(key);
    if (!rec) return null;
    pending.delete(key);
    if (rec.exp <= now()) return null;
    return rec;
  }

  function rejectAudit(reason, req) {
    try {
      store.writeAudit({
        actorUserId: null,
        action: 'auth.google.reject',
        target: 'google',
        meta: {reason},
        ipHash: hashIp(clientIp(req)),
      });
    } catch {
      /* audit must not hide the reject */
    }
  }

  async function fetchWithTimeout(url, init) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), tokenTimeoutMs);
    try {
      return await fetcher(url, {...init, signal: ac.signal});
    } finally {
      clearTimeout(timer);
    }
  }

  async function exchangeCode(code, rec, req) {
    const verifier = unwrapSecret(rec.verifierEnc, wrapKey);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: googleRedirectUri(req, origin, secure),
      client_id: secrets.clientId,
      client_secret: secrets.clientSecret,
      code_verifier: verifier,
    });
    const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: body.toString(),
    });
    if (!res?.ok) fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
    const data = await res.json();
    if (!data?.id_token) fail('token_invalid', 401, GOOGLE_REJECT.token_invalid);
    return data;
  }

  function userBySub(sub) {
    return db.prepare(
      'SELECT id,email,display_name,role,status,google_sub FROM users WHERE google_sub=?',
    ).get(sub) || null;
  }

  function userByEmail(email) {
    return db.prepare(
      'SELECT id,email,display_name,role,status,google_sub FROM users WHERE email=?',
    ).get(normalizeEmail(email)) || null;
  }

  function linkSub(user, sub) {
    const at = new Date(now()).toISOString();
    const result = db.prepare(
      'UPDATE users SET google_sub=?, google_linked_at=? WHERE id=? AND google_sub IS NULL',
    ).run(sub, at, user.id);
    return result.changes === 1;
  }

  function resolveUser(claims) {
    const sub = String(claims.sub || '');
    const bySub = userBySub(sub);
    if (bySub) {
      if (bySub.status !== 'active') return {reject: GOOGLE_REJECT.suspended};
      if (bySub.role === 'superadmin' && !allowSuperadmin) {
        return {reject: GOOGLE_REJECT.superadmin_blocked};
      }
      return {user: bySub, linked: false};
    }
    const byEmail = claims.email ? userByEmail(claims.email) : null;
    if (!byEmail) return {reject: GOOGLE_REJECT.no_user};
    if (byEmail.google_sub && byEmail.google_sub !== sub) {
      return {reject: GOOGLE_REJECT.sub_mismatch};
    }
    if (byEmail.status !== 'active') return {reject: GOOGLE_REJECT.suspended};
    if (byEmail.role === 'superadmin' && !allowSuperadmin) {
      return {reject: GOOGLE_REJECT.superadmin_blocked};
    }
    if (!byEmail.google_sub) {
      if (!linkSub(byEmail, sub)) return {reject: GOOGLE_REJECT.sub_mismatch};
      byEmail.google_sub = sub;
      return {user: byEmail, linked: true};
    }
    return {user: byEmail, linked: false};
  }

  function handleStart(req, res) {
    if (!enabled) return json(res, 404, {error: NOT_FOUND});
    try {
      checkIpLimit(clientIp(req));
    } catch (error) {
      return json(res, error.status || 429, {error: error.message});
    }
    prunePending();
    const state = b64url(randomBytes(32));
    const nonce = b64url(randomBytes(32));
    const {verifier, challenge} = generatePkce();
    const browser = b64url(randomBytes(32));
    pending.set(hashToken(state), {
      verifierEnc: wrapSecret(verifier, wrapKey),
      nonce,
      browserHash: hashToken(browser),
      exp: now() + GOOGLE_STATE_TTL_MS,
    });
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', secrets.clientId);
    authUrl.searchParams.set('redirect_uri', googleRedirectUri(req, origin, secure));
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('prompt', 'select_account');
    authUrl.searchParams.set('access_type', 'online');
    res.writeHead(302, {
      Location: authUrl.toString(),
      'Set-Cookie': oauthCookieHeader(browser, {maxAge: 600, secure}),
      'Cache-Control': 'no-store',
    });
    res.end();
  }

  async function handleCallback(req, res) {
    if (!enabled) return json(res, 404, {error: NOT_FOUND});
    try {
      checkIpLimit(clientIp(req));
    } catch (error) {
      return json(res, error.status || 429, {error: error.message});
    }
    const url = new URL(req.url, 'http://localhost');
    const reject = reason => {
      rejectAudit(reason, req);
      redirectError(res, {secure});
    };
    if (url.searchParams.get('error')) return reject(GOOGLE_REJECT.token_invalid);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!state || !code) return reject(GOOGLE_REJECT.state_invalid);
    const rec = consumeState(state);
    if (!rec) return reject(GOOGLE_REJECT.state_invalid);
    const browser = cookieValue(req, GOOGLE_OAUTH_COOKIE);
    if (!browser || hashToken(browser) !== rec.browserHash) {
      return reject(GOOGLE_REJECT.state_invalid);
    }
    let claims;
    try {
      const tokens = await exchangeCode(code, rec, req);
      claims = await verifyGoogleIdToken(tokens.id_token, {
        clientId: secrets.clientId, nonce: rec.nonce, jwks, now,
      });
    } catch (error) {
      return reject(error.reason || GOOGLE_REJECT.token_invalid);
    }
    if (!emailVerified(claims.email_verified)) {
      return reject(GOOGLE_REJECT.email_unverified);
    }
    const resolved = resolveUser(claims);
    if (resolved.reject) return reject(resolved.reject);
    const ip = clientIp(req);
    const sessionToken = auth.createSession(resolved.user, {ip, ua: req.headers['user-agent']});
    const ipHash = hashIp(ip);
    if (resolved.linked) {
      store.writeAudit({
        actorUserId: resolved.user.id,
        action: 'auth.google.link',
        target: resolved.user.id,
        meta: {emailDomain: emailDomain(resolved.user.email)},
        ipHash,
      });
    }
    store.writeAudit({
      actorUserId: resolved.user.id,
      action: 'auth.google.login',
      target: resolved.user.id,
      meta: {},
      ipHash,
    });
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': [
        sessionCookieHeader(sessionToken, {maxAge: SESSION_TTL_MS / 1000, secure}),
        clearOauthCookieHeader({secure}),
      ],
    });
    res.end(CALLBACK_HTML);
  }

  return {
    enabled,
    handleStart,
    handleCallback,
    sessionFlag: () => ({enabled}),
    pending,
  };
}
