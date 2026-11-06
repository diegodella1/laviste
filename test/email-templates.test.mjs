/**
 * Tests for Clarity email templates.
 * Validates HTML/text parity, formatting, XSS safety, dark mode, and edge cases.
 */

import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {formatPercentES, formatPercentWithArrow, directionLabel, formatDateES, escapeHtml} from '../lib/email-templates/format.mjs';
import {buildDigestHtml} from '../lib/email-templates/digest-html.mjs';
import {buildDigestText} from '../lib/email-templates/digest-text.mjs';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildTradeText} from '../lib/email-templates/trade-text.mjs';

test('formatPercentES: positive, negative, zero', () => {
  assert.equal(formatPercentES(0.024), '+2,4\u202F%');
  assert.equal(formatPercentES(-0.005), '−0,5\u202F%');
  assert.equal(formatPercentES(0), '= 0,0\u202F%');
  assert.equal(formatPercentES(0, {neutral: true}), '0,0\u202F%');
  assert.equal(formatPercentES(0.0004), '= 0,0\u202F%');
  assert.equal(formatPercentES(1.234), '+123,4\u202F%');
});

test('formatPercentWithArrow: arrows and signs', () => {
  assert.equal(formatPercentWithArrow(0.062), '▲ +6,2\u202F%');
  assert.equal(formatPercentWithArrow(-0.008), '▼ −0,8\u202F%');
  assert.equal(formatPercentWithArrow(0), '0,0\u202F%');
  assert.ok(formatPercentWithArrow(0.1).includes('▲'));
  assert.ok(formatPercentWithArrow(-0.1).includes('▼'));
});

test('directionLabel: Spanish labels', () => {
  assert.equal(directionLabel(0.02), 'Ganancia del día');
  assert.equal(directionLabel(-0.02), 'Pérdida del día');
  assert.equal(directionLabel(0), 'Sin cambio en el día');
  assert.equal(directionLabel(0.0001), 'Sin cambio en el día');
});

test('formatDateES: Spanish dates', () => {
  const d = new Date('2026-11-06T15:12:00Z');
  assert.ok(formatDateES(d, {long: true}).includes('noviembre'));
  assert.ok(formatDateES(d, {long: true}).includes('2026'));
  assert.ok(formatDateES(d).includes('nov'));
});

test('escapeHtml: XSS prevention', () => {
  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml('Tesis & Co.'), 'Tesis &amp; Co.');
  assert.equal(escapeHtml("O'Reilly"), 'O&#039;Reilly');
});

test('buildDigestHtml: positive portfolio day', () => {
  const html = buildDigestHtml({
    userName: 'diego',
    date: new Date('2026-11-06'),
    portfolio: {dayPct: 0.018, weekPct: 0.032},
    theses: [
      {
        name: 'Energía local',
        dayPct: 0.024,
        contributions: [
          {ticker: 'YPFD', contribPct: 0.019, thesisNames: ['Energía local']},
        ],
        movers: [
          {symbol: 'YPFD', dayPct: 0.062, thesisNames: ['Energía local']},
        ],
      },
    ],
    takeaway: 'La tesis «Energía local» explicó casi todo el día.',
    autoActions: [
      {ticker: 'YPFD', side: 'venta', thesisName: 'Energía local', reasonPlain: 'El peso de YPFD superó el tope'},
    ],
    alertsFired: [
      {symbol: 'YPFD', dayPct: 0.062, thesisNames: ['Energía local'], threshold: 5.0},
    ],
    tip: 'Un activo puede subir mucho y mover poco la cartera si su peso es chico.',
    prefs: {thresholdAssetPct: 5.0, thresholdPortfolioPct: 3.0},
  });
  
  assert.ok(html.includes('Ganancia del día'));
  assert.ok(html.includes('▲ +1,8'));
  assert.ok(html.includes('Energía local'));
  assert.ok(html.includes('YPFD'));
  assert.ok(html.includes('Tesis: Energía local'));
  assert.ok(html.includes('<!DOCTYPE html'));
  assert.ok(html.includes('prefers-color-scheme: dark'));
  assert.ok(html.includes('El peso de YPFD superó el tope'));
  assert.ok(html.includes('Darse de baja o cambiar alertas'));
});

test('buildDigestHtml: negative portfolio day', () => {
  const html = buildDigestHtml({
    date: new Date('2026-11-06'),
    portfolio: {dayPct: -0.006},
    theses: [],
    prefs: {},
  });
  
  assert.ok(html.includes('Pérdida del día'));
  assert.ok(html.includes('▼ −0,6'));
  assert.ok(html.includes('c-loss'));
});

test('buildDigestHtml: empty state', () => {
  const html = buildDigestHtml({
    date: new Date('2026-11-06'),
    portfolio: {dayPct: null},
    theses: [],
    prefs: {},
  });
  
  assert.ok(html.includes('Hoy no hubo movimientos'));
  assert.ok(html.includes('Abrir La Viste'));
});

test('buildDigestHtml: XSS safety', () => {
  const html = buildDigestHtml({
    date: new Date('2026-11-06'),
    portfolio: {dayPct: 0.01},
    theses: [
      {
        name: '<script>alert("xss")</script>',
        dayPct: 0.01,
        movers: [{symbol: '<img src=x onerror=alert(1)>', dayPct: 0.01, thesisNames: []}],
      },
    ],
    takeaway: '<a href="javascript:alert(1)">Click</a>',
    prefs: {},
  });
  
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<img src=x onerror='));
  assert.ok(html.includes('&lt;img src=x onerror='));
  assert.ok(!html.includes('href="javascript:'));
});

test('buildDigestText: parity with HTML', () => {
  const data = {
    userName: 'diego',
    date: new Date('2026-11-06'),
    portfolio: {dayPct: 0.018, weekPct: 0.032},
    theses: [
      {
        name: 'Energía local',
        dayPct: 0.024,
        contributions: [{ticker: 'YPFD', contribPct: 0.019, thesisNames: ['Energía local']}],
        movers: [{symbol: 'YPFD', dayPct: 0.062, thesisNames: ['Energía local']}],
      },
    ],
    takeaway: 'La tesis «Energía local» explicó casi todo el día.',
    autoActions: [
      {ticker: 'YPFD', side: 'venta', thesisName: 'Energía local', reasonPlain: 'El peso de YPFD superó el tope'},
    ],
    alertsFired: [
      {symbol: 'YPFD', dayPct: 0.062, thesisNames: ['Energía local'], threshold: 5.0},
    ],
    tip: 'Un activo puede subir mucho y mover poco la cartera si su peso es chico.',
    prefs: {thresholdAssetPct: 5.0, thresholdPortfolioPct: 3.0},
  };
  
  const text = buildDigestText(data);
  
  assert.ok(text.includes('Hola diego'));
  assert.ok(text.includes('Ganancia del día'));
  assert.ok(text.includes('▲ +1,8'));
  assert.ok(text.includes('Energía local'));
  assert.ok(text.includes('YPFD'));
  assert.ok(text.includes('El peso de YPFD superó el tope'));
  assert.ok(text.includes('Darse de baja o cambiar alertas'));
  assert.ok(text.includes('https://laviste.diegodella.ar/app'));
  assert.ok(text.includes('dinero de práctica'));
});

test('buildTradeHtml: compra with impacts', () => {
  const html = buildTradeHtml({
    ticker: 'YPFD',
    side: 'compra',
    thesisName: 'Energía local',
    date: new Date('2026-11-06T15:12:00Z'),
    weightBeforePct: 0.20,
    weightAfterPct: 0.24,
    weightDeltaPct: 0.04,
    assetDayPct: 0.062,
    portfolioDayPct: 0.016,
    reasonPlain: 'YPFD se desvió del peso objetivo de la tesis. Automático rebalanceó (simulado) para acercarlo',
    thesisImpactPct: 0.004,
    portfolioImpactPct: 0.002,
    thesisNames: ['Energía local'],
    deepLink: 'https://laviste.diegodella.ar/app#/tesis/abc123',
  });
  
  assert.ok(html.includes('Compra simulada de YPFD'));
  assert.ok(html.includes('Tesis: Energía local'));
  assert.ok(html.includes('20,0'));
  assert.ok(html.includes('24,0'));
  assert.ok(html.includes('+4,0'));
  assert.ok(html.includes('YPFD ▲ +6,2'));
  assert.ok(html.includes('Ganancia del día'));
  assert.ok(html.includes('▲ +1,6'));
  assert.ok(html.includes('rebalanceó'));
  assert.ok(html.includes('▲ +0,2'));
  assert.ok(html.includes('▲ +0,4'));
  assert.ok(html.includes('<!DOCTYPE html'));
  assert.ok(html.includes('AUTOMÁTICO'));
});

test('buildTradeHtml: venta with negative impacts', () => {
  const html = buildTradeHtml({
    ticker: 'PAMP',
    side: 'venta',
    thesisName: 'Cobertura en pesos',
    date: new Date('2026-11-06'),
    weightBeforePct: 0.264,
    weightAfterPct: 0.220,
    weightDeltaPct: -0.044,
    assetDayPct: -0.008,
    portfolioDayPct: -0.004,
    reasonPlain: 'El peso de PAMP superó el tope que definiste en la tesis',
    thesisImpactPct: -0.001,
    portfolioImpactPct: -0.0005,
    thesisNames: ['Cobertura en pesos', 'Energía local'],
  });
  
  assert.ok(html.includes('Venta simulada de PAMP'));
  assert.ok(html.includes('26,4'));
  assert.ok(html.includes('22,0'));
  assert.ok(html.includes('−4,4'));
  assert.ok(html.includes('PAMP ▼ −0,8'));
  assert.ok(html.includes('Pérdida del día'));
  assert.ok(html.includes('▼ −0,4'));
  assert.ok(html.includes('tope'));
  assert.ok(html.includes('Tesis: Cobertura en pesos'));
  assert.ok(html.includes('Tesis: Energía local'));
});

test('buildTradeHtml: XSS safety', () => {
  const html = buildTradeHtml({
    ticker: '<script>alert(1)</script>',
    side: 'compra',
    thesisName: '<img src=x onerror=alert(1)>',
    date: new Date('2026-11-06'),
    weightBeforePct: 0.2,
    weightAfterPct: 0.24,
    weightDeltaPct: 0.04,
    assetDayPct: 0.06,
    portfolioDayPct: 0.01,
    reasonPlain: '<a href="javascript:void(0)">Click</a>',
    thesisImpactPct: 0.001,
    portfolioImpactPct: 0.0005,
    thesisNames: ['<b>Bold</b>'],
  });
  
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<img src=x onerror='));
  assert.ok(html.includes('&lt;img src=x onerror='));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('&lt;b&gt;'));
});

test('buildTradeText: parity with HTML', () => {
  const data = {
    ticker: 'YPFD',
    side: 'venta',
    thesisName: 'Energía local',
    date: new Date('2026-11-06T15:12:00Z'),
    weightBeforePct: 0.264,
    weightAfterPct: 0.220,
    weightDeltaPct: -0.044,
    assetDayPct: 0.062,
    portfolioDayPct: 0.016,
    reasonPlain: 'El peso de YPFD superó el tope que definiste en «Energía local»',
    thesisImpactPct: 0.004,
    portfolioImpactPct: 0.002,
    thesisNames: ['Energía local'],
  };
  
  const text = buildTradeText(data);
  
  assert.ok(text.includes('Venta simulada de YPFD'));
  assert.ok(text.includes('Tesis: Energía local'));
  assert.ok(text.includes('26,4'));
  assert.ok(text.includes('22,0'));
  assert.ok(text.includes('−4,4'));
  assert.ok(text.includes('▲ +6,2'));
  assert.ok(text.includes('Ganancia del día'));
  assert.ok(text.includes('▲ +1,6'));
  assert.ok(text.includes('El peso de YPFD superó el tope'));
  assert.ok(text.includes('▲ +0,2'));
  assert.ok(text.includes('▲ +0,4'));
  assert.ok(text.includes('Darse de baja o cambiar alertas'));
  assert.ok(text.includes('https://laviste.diegodella.ar/app'));
});

test('formatPercentES: edge cases', () => {
  assert.equal(formatPercentES(Infinity), '= 0,0\u202F%');
  assert.equal(formatPercentES(NaN), '= 0,0\u202F%');
  assert.equal(formatPercentES(null), '= 0,0\u202F%');
  assert.equal(formatPercentES(undefined), '= 0,0\u202F%');
  assert.equal(formatPercentES('not a number'), '= 0,0\u202F%');
});

test('buildDigestHtml: multiple theses with same ticker', () => {
  const html = buildDigestHtml({
    date: new Date('2026-11-06'),
    portfolio: {dayPct: 0.01},
    theses: [
      {
        name: 'Energía local',
        dayPct: 0.024,
        contributions: [
          {ticker: 'PAMP', contribPct: -0.001, thesisNames: ['Energía local', 'Cobertura en pesos']},
        ],
        movers: [
          {symbol: 'PAMP', dayPct: -0.008, thesisNames: ['Energía local', 'Cobertura en pesos']},
        ],
      },
    ],
    prefs: {},
  });
  
  const pampChipCount = (html.match(/Tesis: Energía local/g) || []).length;
  assert.ok(pampChipCount >= 2, 'Should show multiple thesis chips for ticker in multiple theses');
  assert.ok(html.includes('Cobertura en pesos'));
});

test('buildDigestHtml: respects threshold preferences', () => {
  const html = buildDigestHtml({
    date: new Date('2026-11-06'),
    portfolio: {dayPct: 0.02},
    theses: [],
    alertsFired: [
      {symbol: 'YPFD', dayPct: 0.062, thesisNames: [], threshold: 7.5},
    ],
    prefs: {thresholdAssetPct: 7.5, thresholdPortfolioPct: 4.0},
  });
  
  assert.ok(html.includes('±7,5'));
  assert.ok(html.includes('±4,0'));
});

test('buildDigestHtml: dark mode classes present', () => {
  const html = buildDigestHtml({
    date: new Date('2026-11-06'),
    portfolio: {dayPct: 0.01},
    theses: [],
    prefs: {},
  });
  
  assert.ok(html.includes('.bg-page'));
  assert.ok(html.includes('.bg-paper'));
  assert.ok(html.includes('.c-gain'));
  assert.ok(html.includes('.c-loss'));
  assert.ok(html.includes('@media (prefers-color-scheme: dark)'));
  assert.ok(html.includes('html.force-dark'));
});

test('buildTradeHtml: zero and near-zero values', () => {
  const html = buildTradeHtml({
    ticker: 'TEST',
    side: 'compra',
    thesisName: 'Test',
    date: new Date('2026-11-06'),
    weightBeforePct: 0.10,
    weightAfterPct: 0.10001,
    weightDeltaPct: 0.00001,
    assetDayPct: 0.0001,
    portfolioDayPct: 0.0001,
    reasonPlain: 'Test reason',
    thesisImpactPct: 0,
    portfolioImpactPct: 0,
    thesisNames: ['Test'],
  });
  
  assert.ok(html.includes('TEST'));
  assert.ok(html.includes('10,0'));
});
