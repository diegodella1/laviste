/** Feature flags (env). Off by default unless explicitly enabled. */

function truthyFlag(value) {
  return value === '1' || value === 'true' || value === 'yes';
}

export function iolEnabled(env = process.env) {
  return truthyFlag(env.FEATURE_IOL);
}

/** Simulated Automático runner + /auto routes. Default 0 / unset → off. */
export function autoSimEnabled(env = process.env) {
  return truthyFlag(env.FEATURE_AUTO_SIM);
}
