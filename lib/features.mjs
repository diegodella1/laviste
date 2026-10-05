/** Feature flags (env). Off by default unless explicitly enabled. */

export function iolEnabled(env = process.env) {
  const v = env.FEATURE_IOL;
  return v === '1' || v === 'true' || v === 'yes';
}
