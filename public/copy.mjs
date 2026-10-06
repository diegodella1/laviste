/** Single practice disclaimer line (SPA + static site). */
export const PRACTICE_FOOTER =
  'Dinero de práctica · precios demorados · no se envían órdenes · el análisis puede equivocarse';

export const VERDICT_NO_ACTION = 'Sin acción necesaria';
const VERDICT_NO_ACTION_LEGACY = 'No necesitás hacer nada';

/** Map stored verdict text for display without rewriting DB rows. */
export function normalizeVerdictText(text) {
  if (text === VERDICT_NO_ACTION_LEGACY) return VERDICT_NO_ACTION;
  return text;
}

export function isNoActionVerdict(text) {
  return normalizeVerdictText(text) === VERDICT_NO_ACTION;
}
