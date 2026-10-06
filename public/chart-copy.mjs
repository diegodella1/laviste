import {money} from './format.mjs';

/**
 * Empty-state copy when a chart has a single history point (index line not drawn yet).
 * @param {number} capital Practice capital in ARS (not chart index base).
 * @param {{scope?: 'practice' | 'thesis', quoteMeta?: string}} [opts]
 */
export function chartSinglePointMessage(capital, {scope = 'practice', quoteMeta = ''} = {}) {
  const prefix = scope === 'thesis' ? 'Tu tesis arranca con' : 'Tu práctica arranca con';
  const core = capital > 0
    ? `${prefix} ${money(capital)} · el gráfico aparece con el primer chequeo`
    : 'El gráfico aparece con el primer chequeo';
  return quoteMeta ? `${core} · ${quoteMeta}` : core;
}

/** Sum of contributed practice capital for aggregate charts. */
export function aggregatePracticeCapital(takes) {
  return takes
    .filter(t => t.phase === 'active' || t.phase === 'archived')
    .reduce((s, t) => s + (t.invested || 0), 0);
}
