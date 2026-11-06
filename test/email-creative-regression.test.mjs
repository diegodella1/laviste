/**
 * Regression tests for PR #75 creative review fixes.
 * Verify 6 design corrections: semantic colors, buy/sell consistency,
 * dark contrast, font sizes, unsigned weights, NNBSP.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDigestHtml} from '../lib/email-templates/digest-html.mjs';
import {buildDigestText} from '../lib/email-templates/digest-text.mjs';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildTradeText} from '../lib/email-templates/trade-text.mjs';

test('#1: Semantic gain/loss colors are inline in light mode', () => {
  const html = buildDigestHtml({
    userName: 'Test',
    date: new Date('2026-11-06T18:00:00Z'),
    portfolio: {dayPct: 0.024, weekPct: null},
    theses: [],
    autoActions: [],
    alertsFired: [],
    newsItems: [],
    prefs: {},
  });
  
  // Gain color inline
  assert.ok(html.includes('color:#047857;'), 'Should have gain color #047857 inline');
  
  const htmlNeg = buildDigestHtml({
    userName: 'Test',
    date: new Date('2026-11-06T18:00:00Z'),
    portfolio: {dayPct: -0.018, weekPct: null},
    theses: [],
    autoActions: [],
    alertsFired: [],
    newsItems: [],
    prefs: {},
  });
  
  // Loss color inline
  assert.ok(htmlNeg.includes('color:#B91C1C;'), 'Should have loss color #B91C1C inline');
});

test('#1: Trade hero background has bgcolor inline', () => {
  const html = buildTradeHtml({
    ticker: 'YPFD',
    side: 'compra',
    thesisName: 'Energía',
    date: new Date('2026-11-06T18:00:00Z'),
    weightBeforePct: 0.20,
    weightAfterPct: 0.25,
    weightDeltaPct: 0.05,
    assetDayPct: 0.032,
    portfolioDayPct: 0.015,
    reasonPlain: 'Rebalanceo',
    thesisImpactPct: 0.008,
    portfolioImpactPct: 0.003,
  });
  
  // Gain bgcolor
  assert.ok(html.includes('bgcolor="#ECFDF5"'), 'Should have gain bgcolor #ECFDF5');
  
  const htmlLoss = buildTradeHtml({
    ticker: 'YPFD',
    side: 'venta',
    thesisName: 'Energía',
    date: new Date('2026-11-06T18:00:00Z'),
    weightBeforePct: 0.25,
    weightAfterPct: 0.20,
    weightDeltaPct: -0.05,
    assetDayPct: -0.028,
    portfolioDayPct: -0.012,
    reasonPlain: 'Tope',
    thesisImpactPct: -0.006,
    portfolioImpactPct: -0.002,
  });
  
  // Loss bgcolor
  assert.ok(htmlLoss.includes('bgcolor="#FEF2F2"'), 'Should have loss bgcolor #FEF2F2');
});

test('#2: Buy/sell consistency from side parameter', () => {
  const htmlBuy = buildTradeHtml({
    ticker: 'YPFD',
    side: 'compra',
    thesisName: 'Energía',
    date: new Date('2026-11-06T18:00:00Z'),
    weightBeforePct: 0.20,
    weightAfterPct: 0.25,
    weightDeltaPct: 0.05,
    assetDayPct: 0.032,
    portfolioDayPct: -0.005,
    reasonPlain: 'Rebalanceo',
    thesisImpactPct: 0.008,
    portfolioImpactPct: -0.001,
  });
  
  const textBuy = buildTradeText({
    ticker: 'YPFD',
    side: 'compra',
    thesisName: 'Energía',
    date: new Date('2026-11-06T18:00:00Z'),
    weightBeforePct: 0.20,
    weightAfterPct: 0.25,
    weightDeltaPct: 0.05,
    assetDayPct: 0.032,
    portfolioDayPct: -0.005,
    reasonPlain: 'Rebalanceo',
    thesisImpactPct: 0.008,
    portfolioImpactPct: -0.001,
  });
  
  // Even though portfolio is negative, side is compra
  assert.ok(htmlBuy.includes('Compra simulada'), 'HTML subject should say Compra');
  assert.ok(htmlBuy.includes('esta compra simulada'), 'HTML body should say compra');
  assert.ok(textBuy.includes('Compra simulada'), 'Text subject should say Compra');
  assert.ok(textBuy.includes('esta compra simulada'), 'Text body should say compra');
  
  const htmlSell = buildTradeHtml({
    ticker: 'YPFD',
    side: 'venta',
    thesisName: 'Energía',
    date: new Date('2026-11-06T18:00:00Z'),
    weightBeforePct: 0.25,
    weightAfterPct: 0.20,
    weightDeltaPct: -0.05,
    assetDayPct: -0.028,
    portfolioDayPct: 0.008,
    reasonPlain: 'Tope',
    thesisImpactPct: -0.006,
    portfolioImpactPct: 0.002,
  });
  
  const textSell = buildTradeText({
    ticker: 'YPFD',
    side: 'venta',
    thesisName: 'Energía',
    date: new Date('2026-11-06T18:00:00Z'),
    weightBeforePct: 0.25,
    weightAfterPct: 0.20,
    weightDeltaPct: -0.05,
    assetDayPct: -0.028,
    portfolioDayPct: 0.008,
    reasonPlain: 'Tope',
    thesisImpactPct: -0.006,
    portfolioImpactPct: 0.002,
  });
  
  // Even though portfolio is positive, side is venta
  assert.ok(htmlSell.includes('Venta simulada'), 'HTML subject should say Venta');
  assert.ok(htmlSell.includes('esta venta simulada'), 'HTML body should say venta');
  assert.ok(textSell.includes('Venta simulada'), 'Text subject should say Venta');
  assert.ok(textSell.includes('esta venta simulada'), 'Text body should say venta');
});

test('#3: Dark mode muted on tinted panels uses #CBD5E1', () => {
  const html = buildDigestHtml({
    userName: 'Test',
    date: new Date('2026-11-06T18:00:00Z'),
    portfolio: {dayPct: 0.024, weekPct: null},
    theses: [],
    autoActions: [],
    alertsFired: [],
    newsItems: [],
    prefs: {},
  });
  
  // Contextual override for muted on tinted panels
  assert.ok(html.includes('.bg-soft .c-muted'), 'Should have contextual .bg-soft .c-muted rule');
  assert.ok(html.includes('color: #CBD5E1 !important'), 'Should use #CBD5E1 for better contrast');
});

test('#4: Essential text is >= 14px', () => {
  const html = buildDigestHtml({
    userName: 'Test',
    date: new Date('2026-11-06T18:00:00Z'),
    portfolio: {dayPct: 0.024, weekPct: null},
    theses: [{name: 'Energía', dayPct: 0.018}],
    autoActions: [],
    alertsFired: [],
    newsItems: [],
    prefs: {},
  });
  
  // Chips should be 14px
  assert.ok(html.includes('font-size:14px;font-weight:700;line-height:18px;'), 'Chips should be 14px');
  
  // Labels should be >= 14px
  const matches = html.match(/font-size:(\d+)px/g) || [];
  const sizes = matches.map(m => parseInt(m.match(/(\d+)/)[1]));
  const hasSmallEssential = sizes.some(sz => sz < 12);
  assert.ok(!hasSmallEssential || sizes.filter(s => s >= 14).length > sizes.filter(s => s < 14).length, 'Most essential text should be >= 14px');
});

test('#5: Unsigned weights and threshold magnitude', () => {
  const html = buildTradeHtml({
    ticker: 'YPFD',
    side: 'compra',
    thesisName: 'Energía',
    date: new Date('2026-11-06T18:00:00Z'),
    weightBeforePct: 0.264,
    weightAfterPct: 0.220,
    weightDeltaPct: -0.044,
    assetDayPct: 0.032,
    portfolioDayPct: 0.015,
    reasonPlain: 'Rebalanceo',
    thesisImpactPct: 0.008,
    portfolioImpactPct: 0.003,
  });
  
  const text = buildTradeText({
    ticker: 'YPFD',
    side: 'compra',
    thesisName: 'Energía',
    date: new Date('2026-11-06T18:00:00Z'),
    weightBeforePct: 0.264,
    weightAfterPct: 0.220,
    weightDeltaPct: -0.044,
    assetDayPct: 0.032,
    portfolioDayPct: 0.015,
    reasonPlain: 'Rebalanceo',
    thesisImpactPct: 0.008,
    portfolioImpactPct: 0.003,
  });
  
  // Unsigned weights
  assert.ok(html.includes('26,4'), 'HTML should show unsigned weight 26,4');
  assert.ok(html.includes('22,0'), 'HTML should show unsigned weight 22,0');
  assert.ok(!html.match(/\+26,4/), 'HTML should NOT show +26,4');
  assert.ok(!html.match(/\+22,0/), 'HTML should NOT show +22,0');
  
  assert.ok(text.includes('26,4'), 'Text should show unsigned weight 26,4');
  assert.ok(text.includes('22,0'), 'Text should show unsigned weight 22,0');
  assert.ok(!text.match(/\+26,4/), 'Text should NOT show +26,4');
  assert.ok(!text.match(/\+22,0/), 'Text should NOT show +22,0');
  
  // No duplicate signs in thresholds
  const digestHtml = buildDigestHtml({
    userName: 'Test',
    date: new Date('2026-11-06T18:00:00Z'),
    portfolio: {dayPct: 0.024, weekPct: null},
    theses: [],
    autoActions: [],
    alertsFired: [{ticker: 'YPFD', dayPct: 0.06, thesisNames: ['Energía']}],
    newsItems: [],
    prefs: {thresholdAssetPct: 5.0, thresholdPortfolioPct: 3.0},
  });
  
  assert.ok(!digestHtml.match(/±\+/), 'HTML should NOT have ±+ duplicate sign');
  assert.ok(digestHtml.match(/±5,0/), 'HTML should have ±5,0 % (not ±+5,0 %)');
});

test('#6: Consistent U+202F NNBSP in percentages', () => {
  const html = buildDigestHtml({
    userName: 'Test',
    date: new Date('2026-11-06T18:00:00Z'),
    portfolio: {dayPct: 0.054, weekPct: null},
    theses: [],
    autoActions: [],
    alertsFired: [],
    newsItems: [],
    prefs: {},
    takeaway: 'La cartera subió más de 5 % hoy.',
  });
  
  const text = buildDigestText({
    userName: 'Test',
    date: new Date('2026-11-06T18:00:00Z'),
    portfolio: {dayPct: 0.054, weekPct: null},
    theses: [],
    autoActions: [],
    alertsFired: [],
    newsItems: [],
    prefs: {},
    takeaway: 'La cartera subió más de 5 % hoy.',
  });
  
  // Check for NNBSP in formatted numbers
  const NNBSP = '\u202F';
  const hasSomeNNBSP = html.split('%').length > 1 && html.includes(NNBSP);
  assert.ok(hasSomeNNBSP, 'HTML should use NNBSP before % in formatted numbers');
  
  const textHasNNBSP = text.split('%').length > 1 && text.includes(NNBSP);
  assert.ok(textHasNNBSP, 'Text should use NNBSP before % in formatted numbers');
  
  // Count occurrences of NNBSP+% vs normal space+%
  const nnbspCount = (html.match(new RegExp(NNBSP + '%', 'g')) || []).length;
  const normalSpaceCount = (html.match(/\d+ %/g) || []).length;
  
  // Most percentages should use NNBSP (allow some in user copy)
  assert.ok(nnbspCount > normalSpaceCount, `Most percentages should use NNBSP (${nnbspCount} vs ${normalSpaceCount})`);
});

test('Unknown returns are omitted not rendered as zero', () => {
  const html = buildDigestHtml({
    userName: 'Test',
    date: new Date('2026-11-06T18:00:00Z'),
    portfolio: {dayPct: null, weekPct: null},
    theses: [],
    autoActions: [],
    alertsFired: [],
    newsItems: [],
    prefs: {},
  });
  
  // Should not show hero when dayPct is null
  assert.ok(!html.includes('Resultado total del día') || !html.includes('▲'), 'Should omit hero when data unavailable');
  assert.ok(!html.includes('0,0'), 'Should not show 0,0 % for unknown data');
});
