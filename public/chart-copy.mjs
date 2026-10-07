import {money} from './format.mjs';

export const CHART_LEGEND_VALOR = 'Valor';
export const CHART_LEGEND_CAPITAL = 'Capital aportado';
export const CHART_PERIOD_EMPTY = 'Todavía no hay registros en este período.';

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
    .filter(t => t.phase === 'active')
    .reduce((s, t) => s + (t.invested || 0), 0);
}

export function chartPeriodEmptyMessage(quoteMeta = '') {
  return quoteMeta ? `${CHART_PERIOD_EMPTY} · ${quoteMeta}` : CHART_PERIOD_EMPTY;
}

/** HTML legend: Valor vs capital aportado (not TWR). */
export function chartLegendHtml() {
  return `<div class="chart-foot"><div class="legend" aria-label="Series del gráfico"><span class="legend-item"><span class="legend-line" aria-hidden="true"></span>${CHART_LEGEND_VALOR}</span><span class="legend-item"><span class="legend-line bench" aria-hidden="true"></span>${CHART_LEGEND_CAPITAL}</span></div></div>`;
}
