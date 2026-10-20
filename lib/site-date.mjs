/**
 * Public-site “Actualizada el …” date. A literal YYYY-MM-DD, not git.
 * Bump PRIVACY_UPDATED_AT in the same commit that changes the /privacidad copy.
 * PRIVACY_COPY_HASH is the first 16 hex chars of sha256 of the `const privacy =`
 * block in scripts/build-site.mjs, with `${privacyUpdated}` stripped.
 */
import {createHash} from 'node:crypto';

export const MONTHS_ES_AR = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const PRIVACY_UPDATED_AT = '2026-10-20';
export const PRIVACY_COPY_HASH = '88d736d3ae63efb8';

export function formatPrivacyUpdatedAt(isoDay = PRIVACY_UPDATED_AT) {
  const m = String(isoDay).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error('PRIVACY_UPDATED_AT must be YYYY-MM-DD');
  return `${Number(m[3])} de ${MONTHS_ES_AR[Number(m[2]) - 1]} de ${Number(m[1])}`;
}

export function privacyCopyFingerprint(source) {
  const start = source.indexOf('const privacy =');
  const end = source.indexOf('const scope =');
  if (start < 0 || end < start) throw new Error('privacy template not found');
  const block = source.slice(start, end).replaceAll('$' + '{privacyUpdated}', '');
  return createHash('sha256').update(block).digest('hex').slice(0, 16);
}
