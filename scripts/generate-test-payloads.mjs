/**
 * Generate self-contained email payload artifacts for owner-only test emails.
 * PRUEBA · Datos de ejemplo · Fictional test data only · Not production templates.
 */

import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {buildDigestHtml} from '../lib/email-templates/digest-html.mjs';
import {buildDigestText} from '../lib/email-templates/digest-text.mjs';
import {buildTradeHtml} from '../lib/email-templates/trade-html.mjs';
import {buildTradeText} from '../lib/email-templates/trade-text.mjs';
import {formatPercentES} from '../lib/email-templates/format.mjs';

const HEAD_SHA = '5fb3dc7ef7874ab306c7a6103fca5c48912ed2ac';

// === DIGEST PAYLOAD ===

const digestEnrichedData = {
  portfolio: {dayPct: 0.024, weekPct: null},
  theses: [
    {name: 'Energía local', dayPct: 0.045, contributionPct: 0.015},
    {name: 'Tech global', dayPct: 0.012, contributionPct: 0.009},
  ],
  takeaway: 'Las tesis de energía local tuvieron un día fuerte gracias a YPFD.',
  autoActions: [
    {
      ticker: 'AAPL',
      side: 'compra',
      thesisName: 'Tech global',
      reasonPlain: 'El peso del activo cayó fuera del rango acordado. Automático ejecutó esta operación para volver al rango',
      thesisNames: ['Tech global'],
    },
  ],
  alertsFired: [
    {ticker: 'YPFD', dayPct: 0.062, thresholdPct: 5.0, thesisNames: ['Energía local']},
  ],
  tip: 'Un activo puede subir mucho y mover poco la cartera si su peso es chico. Por eso mostramos el % del día y cuánto aportó cada tesis.',
  newsItems: [
    {title: 'YPF anuncia inversión millonaria en Vaca Muerta', url: 'https://example.com/news/ypf'},
  ],
};

const digestPrefs = {
  thresholdAssetPct: 5.0,
  thresholdPortfolioPct: 3.0,
  newsEnabled: true,
};

const digestSubject = `Tu cartera hoy ${formatPercentES(0.024)} · resumen de práctica`;

const digestBodyHtml = buildDigestHtml({
  userName: 'Ejemplo',
  date: new Date('2026-11-06T21:00:00.000Z'),
  portfolio: digestEnrichedData.portfolio,
  theses: digestEnrichedData.theses,
  takeaway: digestEnrichedData.takeaway,
  autoActions: digestEnrichedData.autoActions,
  alertsFired: digestEnrichedData.alertsFired,
  tip: digestEnrichedData.tip,
  newsItems: digestEnrichedData.newsItems,
  prefs: digestPrefs,
});

const digestBodyText = buildDigestText({
  userName: 'Ejemplo',
  date: new Date('2026-11-06T21:00:00.000Z'),
  portfolio: digestEnrichedData.portfolio,
  theses: digestEnrichedData.theses,
  takeaway: digestEnrichedData.takeaway,
  autoActions: digestEnrichedData.autoActions,
  alertsFired: digestEnrichedData.alertsFired,
  tip: digestEnrichedData.tip,
  newsItems: digestEnrichedData.newsItems,
  prefs: digestPrefs,
});

// Prepend clear PRUEBA markers
const digestBodyHtmlMarked = `<!-- PRUEBA · Datos de ejemplo · Test artifact only · Not production template -->
<!-- Fictional fixture data for owner-only test emails after separate send review -->
${digestBodyHtml}`;

const digestBodyTextMarked = `[PRUEBA · Datos de ejemplo · Test artifact only]
[Fictional fixture data for owner-only test emails after separate send review]

${digestBodyText}`;

const digestPayload = {
  metadata: {
    type: 'digest',
    headSHA: HEAD_SHA,
    generated: new Date().toISOString(),
    warning: 'PRUEBA · Datos de ejemplo · Fictional test data only · Not production template',
  },
  subject: digestSubject,
  bodyHtml: digestBodyHtmlMarked,
  bodyText: digestBodyTextMarked,
};

const digestJson = JSON.stringify(digestPayload, null, 2);
const digestHash = createHash('sha256').update(digestJson).digest('hex');

// === TRADE ALERT PAYLOAD ===

const tradeSubject = 'Automático: compra simulada de YPFD';

const tradeBodyHtml = buildTradeHtml({
  ticker: 'YPFD',
  side: 'compra',
  thesisName: 'Energía local',
  date: new Date('2026-11-06T18:30:00.000Z'),
  weightBeforePct: 0.20,
  weightAfterPct: 0.25,
  weightDeltaPct: 0.05,
  assetDayPct: 0.062,
  portfolioDayPct: 0.024,
  reasonPlain: 'El peso de YPFD cayó fuera del rango acordado en «Energía local». Automático ejecutó (simuló) esta compra para volver al rango. Es la regla de tope, no una recomendación nueva',
  thesisImpactPct: 0.004,
  portfolioImpactPct: 0.002,
  thesisNames: ['Energía local'],
  deepLink: 'https://laviste.diegodella.ar/app#/tesis/ejemplo-123',
});

const tradeBodyText = buildTradeText({
  ticker: 'YPFD',
  side: 'compra',
  thesisName: 'Energía local',
  date: new Date('2026-11-06T18:30:00.000Z'),
  weightBeforePct: 0.20,
  weightAfterPct: 0.25,
  weightDeltaPct: 0.05,
  assetDayPct: 0.062,
  portfolioDayPct: 0.024,
  reasonPlain: 'El peso de YPFD cayó fuera del rango acordado en «Energía local». Automático ejecutó (simuló) esta compra para volver al rango. Es la regla de tope, no una recomendación nueva',
  thesisImpactPct: 0.004,
  portfolioImpactPct: 0.002,
  thesisNames: ['Energía local'],
  deepLink: 'https://laviste.diegodella.ar/app#/tesis/ejemplo-123',
});

const tradeBodyHtmlMarked = `<!-- PRUEBA · Datos de ejemplo · Test artifact only · Not production template -->
<!-- Fictional fixture data for owner-only test emails after separate send review -->
${tradeBodyHtml}`;

const tradeBodyTextMarked = `[PRUEBA · Datos de ejemplo · Test artifact only]
[Fictional fixture data for owner-only test emails after separate send review]

${tradeBodyText}`;

const tradePayload = {
  metadata: {
    type: 'trade-alert',
    headSHA: HEAD_SHA,
    generated: new Date().toISOString(),
    warning: 'PRUEBA · Datos de ejemplo · Fictional test data only · Not production template',
  },
  subject: tradeSubject,
  bodyHtml: tradeBodyHtmlMarked,
  bodyText: tradeBodyTextMarked,
};

const tradeJson = JSON.stringify(tradePayload, null, 2);
const tradeHash = createHash('sha256').update(tradeJson).digest('hex');

// Write artifacts
const digestPath = 'test/fixtures/email/payload-digest-example.json';
const tradePath = 'test/fixtures/email/payload-trade-example.json';

writeFileSync(digestPath, digestJson);
writeFileSync(tradePath, tradeJson);

console.log('✅ Generated test email payload artifacts:\n');
console.log(`Digest:
  Path: ${digestPath}
  SHA-256: ${digestHash}
  Subject: ${digestSubject}
  HTML length: ${digestBodyHtmlMarked.length} bytes
  Text length: ${digestBodyTextMarked.length} bytes\n`);

console.log(`Trade Alert:
  Path: ${tradePath}
  SHA-256: ${tradeHash}
  Subject: ${tradeSubject}
  HTML length: ${tradeBodyHtmlMarked.length} bytes
  Text length: ${tradeBodyTextMarked.length} bytes\n`);

console.log(`HEAD SHA: ${HEAD_SHA}`);
console.log(`\n⚠️  PRUEBA · Datos de ejemplo · Fictional test data only`);
console.log(`⚠️  For owner-only test emails after separate send review`);
console.log(`⚠️  Not production templates · Do NOT send to real users\n`);
