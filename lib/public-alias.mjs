/** Public alias rules (LB1). Server is the source of truth; UI repeats the same checks. */

export const ALIAS_MIN = 3;
export const ALIAS_MAX = 24;

export const ALIAS_RESERVED = Object.freeze([
  'laviste',
  'la viste',
  'admin',
  'superadmin',
  'soporte',
  'autor anónimo',
]);

export const ALIAS_ERR = Object.freeze({
  required: 'Escribí un alias.',
  length: 'Tiene que tener entre 3 y 24 caracteres.',
  at: 'El alias no puede tener @.',
  email: 'Elegí un alias que no se parezca a tu email.',
  chars: 'Usá solo letras, números, espacios, punto, guion o guion bajo.',
  reserved: 'Ese alias no está disponible. Elegí otro.',
  taken: 'Ese alias ya está en uso.',
});

const CHARSET_RE = /^[\p{L}\p{N} ._-]+$/u;

export function normalizePublicAlias(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

export function aliasCodePoints(value) {
  return [...String(value)].length;
}

function fail(message, status, code) {
  throw Object.assign(new Error(message), {status, code});
}

export function aliasTakenError() {
  return Object.assign(new Error(ALIAS_ERR.taken), {status: 409, code: 'alias_en_uso'});
}

export function isAliasUniqueConstraint(error) {
  return /UNIQUE constraint failed|users_public_alias/i.test(String(error?.message || error));
}

/** Trim, collapse spaces, then validate. Returns the stored form. */
export function validatePublicAlias(raw, {email} = {}) {
  const alias = normalizePublicAlias(raw);
  if (!alias) fail(ALIAS_ERR.required, 400, 'alias_requerido');
  const n = aliasCodePoints(alias);
  if (n < ALIAS_MIN || n > ALIAS_MAX) fail(ALIAS_ERR.length, 400, 'alias_invalido');
  if (alias.includes('@')) fail(ALIAS_ERR.at, 400, 'alias_invalido');
  if (!CHARSET_RE.test(alias)) fail(ALIAS_ERR.chars, 400, 'alias_invalido');
  const local = String(email || '').split('@')[0] || '';
  if (local && alias.toLocaleLowerCase('es-AR') === local.toLocaleLowerCase('es-AR')) {
    fail(ALIAS_ERR.email, 400, 'alias_invalido');
  }
  const folded = alias.toLocaleLowerCase('es-AR');
  if (ALIAS_RESERVED.includes(folded)) fail(ALIAS_ERR.reserved, 400, 'alias_reservado');
  return alias;
}
