/** Client alias checks. Server remains the source of truth. */

import {
  ALIAS_ERR_AT, ALIAS_ERR_CHARS, ALIAS_ERR_EMAIL, ALIAS_ERR_EMPTY, ALIAS_ERR_LENGTH,
} from './copy.mjs';

export const ALIAS_MIN = 3;
export const ALIAS_MAX = 24;

const CHARSET_RE = /^[\p{L}\p{N} ._-]+$/u;

export function normalizePublicAlias(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

export function aliasCodePoints(value) {
  return [...String(value)].length;
}

export function clientValidateAlias(raw, {email} = {}) {
  const alias = normalizePublicAlias(raw);
  if (!alias) return {ok: false, code: 'empty', message: ALIAS_ERR_EMPTY};
  const n = aliasCodePoints(alias);
  if (n < ALIAS_MIN || n > ALIAS_MAX) return {ok: false, code: 'length', message: ALIAS_ERR_LENGTH};
  if (alias.includes('@')) return {ok: false, code: 'at', message: ALIAS_ERR_AT};
  if (!CHARSET_RE.test(alias)) return {ok: false, code: 'chars', message: ALIAS_ERR_CHARS};
  const local = String(email || '').split('@')[0] || '';
  if (local && alias.toLocaleLowerCase('es-AR') === local.toLocaleLowerCase('es-AR')) {
    return {ok: false, code: 'email', message: ALIAS_ERR_EMAIL};
  }
  return {ok: true, alias};
}
