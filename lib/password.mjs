import {randomBytes, scryptSync, timingSafeEqual} from 'node:crypto';

/** Light enough for a one-shot owner backfill on the 768 MB Pi. */
export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function scryptKey(password, salt, keylen, n, r, p) {
  return scryptSync(password, salt, keylen, {N: n, r, p, maxmem: SCRYPT_MAXMEM});
}

/**
 * Hash a password with scrypt. Empty input yields '' (no KDF) so test stores
 * without APP_PASSWORD stay cheap. Never log the password or the returned hash.
 */
export function hashPassword(password) {
  if (!password) return '';
  const salt = randomBytes(16);
  const key = scryptKey(password, salt, SCRYPT_KEYLEN, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  if (!salt.length || !expected.length || !Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  const actual = scryptKey(password, salt, expected.length, n, r, p);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
