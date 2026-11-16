/**
 * Fixtures DE EJEMPLO para el digest «Cierre del día» (mismos números que los mocks de
 * DesignBot 2026-11-16). Solo para tests y renders de revisión; nunca en producción.
 */

const s = arr => arr.slice();

export const FIXTURE_DOWN = Object.freeze({
  date: '2026-11-16',
  isTradingDay: true,
  portfolio: {dayPct: -0.018, weekPct: -0.0021, weekSeries: s([0, 0.40, 1.02, 1.27, 1.48, -0.21])},
  theses: [
    {id: 'energia-local', name: 'Energía local', weightPct: 0.35, dayPct: -0.041, contributionPct: -0.01435, weekPct: -0.032,
      weekSeries: s([0, 0.6, 1.1, 0.2, 0.9, -3.2]), status: 'watch', statusPrev: 'ok', reasonCode: 'noise',
      topMover: {ticker: 'YPF', dayPct: -0.053}},
    {id: 'cripto-reserva', name: 'Cripto de reserva', weightPct: 0.20, dayPct: -0.018, contributionPct: -0.0036, weekPct: 0,
      weekSeries: s([0, 1.4, 0.9, 2.6, 1.8, 0.0]), status: 'risk', statusPrev: 'risk', reasonCode: null,
      topMover: {ticker: 'BTC', dayPct: -0.024}},
    {id: 'comercio-digital', name: 'Comercio digital', weightPct: 0.20, dayPct: 0.012, contributionPct: 0.0024, weekPct: 0.028,
      weekSeries: s([0, -0.9, 0.4, 1.1, 1.6, 2.8]), status: 'ok', statusPrev: 'watch', reasonCode: 'recovery',
      topMover: {ticker: 'MELI', dayPct: 0.012}},
    {id: 'bancos-argentinos', name: 'Bancos argentinos', weightPct: 0.25, dayPct: -0.009, contributionPct: -0.00225, weekPct: 0.014,
      weekSeries: s([0, 0.8, 1.5, 1.9, 2.3, 1.4]), status: 'ok', statusPrev: 'ok', reasonCode: null,
      topMover: {ticker: 'GGAL', dayPct: -0.016}},
  ],
  autoActions: [],
  pausaActions: [],
});

export const FIXTURE_UP = Object.freeze({
  date: '2026-11-17',
  isTradingDay: true,
  portfolio: {dayPct: 0.006, weekPct: 0.0011, weekSeries: s([0, 0.32, 0.26, 0.80, -0.53, 0.11])},
  theses: [
    {id: 'bancos-argentinos', name: 'Bancos argentinos', weightPct: 0.25, dayPct: 0.016, contributionPct: 0.004, weekPct: 0.022,
      weekSeries: s([0, 0.7, 1.1, 1.5, 0.6, 2.2]), status: 'ok', statusPrev: 'ok', topMover: {ticker: 'BMA', dayPct: 0.027}},
    {id: 'energia-local', name: 'Energía local', weightPct: 0.35, dayPct: 0.004, contributionPct: 0.0014, weekPct: -0.028,
      weekSeries: s([0, 0.5, -0.4, 0.3, -3.2, -2.8]), status: 'watch', statusPrev: 'watch', topMover: {ticker: 'YPF', dayPct: 0.009}},
    {id: 'cripto-reserva', name: 'Cripto de reserva', weightPct: 0.20, dayPct: 0.005, contributionPct: 0.001, weekPct: -0.010,
      weekSeries: s([0, -0.5, 1.2, 0.4, -1.5, -1.0]), status: 'risk', statusPrev: 'risk', topMover: {ticker: 'ETH', dayPct: 0.011}},
    {id: 'comercio-digital', name: 'Comercio digital', weightPct: 0.20, dayPct: 0, contributionPct: 0, weekPct: 0.037,
      weekSeries: s([0, 1.3, 2.0, 2.5, 3.7, 3.7]), status: 'ok', statusPrev: 'ok', topMover: {ticker: 'MELI', dayPct: 0}},
  ],
  autoActions: [],
  pausaActions: [],
});

export function cloneFixture(f) {
  return JSON.parse(JSON.stringify(f));
}
