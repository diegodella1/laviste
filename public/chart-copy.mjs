import {money, pctSigned, signedMoney, artShortDayMonth} from './format.mjs';
import {P1_RESULT_LABEL, P1_CHART_NO_HISTORY} from './copy.mjs';

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

export function chartNoHistoryMessage() {
  return P1_CHART_NO_HISTORY;
}

/** Accessible figure summary. No invented benchmark. */
export function chartAriaSummary(history) {
  if (!history?.length) return '';
  const first = history[0];
  const last = history[history.length - 1];
  const from = artShortDayMonth(first.at);
  const to = artShortDayMonth(last.at);
  if (!from || !to) return `Valor de la cartera: ${money(last.value)}`;
  return `Valor de la cartera entre el ${from} y el ${to}: de ${money(first.value)} a ${money(last.value)}`;
}

/**
 * Result phrase under the thesis chart.
 * Green / red / ink — a tie is not an alert pill.
 */
export function resultPhrase({invested, value, activatedAt} = {}) {
  const cap = Number(invested);
  const val = Number(value);
  const ok = Number.isFinite(cap) && cap > 0 && Number.isFinite(val);
  const delta = ok ? val - cap : 0;
  const pct = ok ? (delta / cap) * 100 : 0;
  const when = artShortDayMonth(activatedAt);
  const detail = ok
    ? (when
      ? `Aportaste ${money(cap)} el ${when} · ${signedMoney(delta)} desde entonces`
      : `Aportaste ${money(cap)} · ${signedMoney(delta)} desde entonces`)
    : '';
  return {
    label: P1_RESULT_LABEL,
    pct: ok ? pctSigned(pct) : '—',
    detail,
    tone: !ok || Math.round(delta) === 0 ? 'ink' : (delta > 0 ? 'gain' : 'loss'),
  };
}

/** HTML legend: Valor vs capital aportado (not TWR). */
export function chartLegendHtml() {
  return `<div class="chart-foot"><div class="legend" aria-label="Series del gráfico"><span class="legend-item"><span class="legend-line" aria-hidden="true"></span>${CHART_LEGEND_VALOR}</span><span class="legend-item"><span class="legend-line bench" aria-hidden="true"></span>${CHART_LEGEND_CAPITAL}</span></div></div>`;
}
