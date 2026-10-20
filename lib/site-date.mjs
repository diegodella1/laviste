/**
 * Public-site “Actualizada el …” date. Derived at build time from the
 * commit that last changed `scripts/build-site.mjs` (the privacy source),
 * so a later PR that does not touch privacy keeps the same date and
 * `git diff --exit-code -- public` stays green.
 *
 * Overrides: SITE_UPDATED_AT (ISO timestamp). Used by release/CI when the
 * deployed revision’s date should win.
 */
import {execFileSync} from 'node:child_process';

export const MONTHS_ES_AR = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const PRIVACY_SOURCE = 'scripts/build-site.mjs';

export function formatPrivacyUpdatedAt(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Buenos_Aires',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(new Date(date));
  const num = type => Number(parts.find(p => p.type === type)?.value);
  return `${num('day')} de ${MONTHS_ES_AR[num('month') - 1]} de ${num('year')}`;
}

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

export function privacySourceDate({
  env = process.env,
  now = () => new Date(),
  runGit = git,
} = {}) {
  if (env.SITE_UPDATED_AT) return new Date(env.SITE_UPDATED_AT);
  try {
    const dirty = runGit(['status', '--porcelain', '--', PRIVACY_SOURCE]);
    if (dirty) return now();
    const iso = runGit(['log', '-1', '--format=%cI', '--', PRIVACY_SOURCE]);
    if (iso) return new Date(iso);
  } catch {
    /* no git, or not a repo */
  }
  return now();
}
