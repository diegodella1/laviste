/**
 * Trade alert HTML template (Clarity design approved Nov 6, 2026).
 * Compact, mobile-responsive, dark mode support.
 */

import {formatPercentES, formatPercentWithArrow, formatWeightPercent, directionLabel, formatDateES, escapeHtml} from './format.mjs';

const NNBSP = '\u202F';

function sanitizeReasonPlain(text) {
  if (!text) return text;
  return text.replace(/\.+$/, '').replace(/\.\s*\./g, '.');
}

export function buildTradeHtml({
  ticker,
  side,
  thesisName,
  date,
  weightBeforePct,
  weightAfterPct,
  weightDeltaPct,
  assetDayPct,
  portfolioDayPct,
  reasonPlain,
  thesisImpactPct,
  portfolioImpactPct,
  thesisNames = [],
  deepLink,
  isExample = false,
} = {}) {
  const dateStr = formatDateES(date || new Date(), {long: true, time: true});
  const sideLabel = side === 'compra' ? 'Compra' : (side === 'venta' ? 'Venta' : 'Operación');
  
  const preheader = `${sideLabel} simulada de ${ticker} · Tesis: ${thesisName} · tu cartera hoy ${formatPercentWithArrow(portfolioDayPct || 0)}.`;
  
  const portfolioLabel = directionLabel(portfolioDayPct);
  const portfolioClass = (portfolioDayPct ?? 0) >= 0 ? 'c-gain' : 'c-loss';
  const portfolioBg = (portfolioDayPct ?? 0) >= 0 ? 'bg-gain' : 'bg-loss';
  const portfolioBgColor = (portfolioDayPct ?? 0) >= 0 ? '#ECFDF5' : '#FEF2F2';
  const portfolioColorInline = (portfolioDayPct ?? 0) >= 0 ? 'color:#047857;' : 'color:#B91C1C;';
  const portfolioFormatted = formatPercentWithArrow(portfolioDayPct);
  
  const tickerEscaped = escapeHtml(ticker);
  // Asset day %: distinguish known-zero from missing
  let assetClass, assetColorInline, assetPctFormatted, assetLabel;
  if (assetDayPct === null || assetDayPct === undefined) {
    // Missing data: will omit block entirely
    assetClass = 'c-ink';
    assetColorInline = 'color:#0F172A;';
    assetPctFormatted = '';
    assetLabel = null;
  } else if (assetDayPct === 0) {
    // Known zero: neutral color, "Sin cambio"
    assetClass = 'c-ink';
    assetColorInline = 'color:#0F172A;';
    assetPctFormatted = formatPercentWithArrow(0);
    assetLabel = 'Sin cambio en el día';
  } else {
    // Gain or loss
    assetClass = assetDayPct > 0 ? 'c-gain' : 'c-loss';
    assetColorInline = assetDayPct > 0 ? 'color:#047857;' : 'color:#B91C1C;';
    assetPctFormatted = formatPercentWithArrow(assetDayPct);
    assetLabel = null;
  }
  
  const weightClass = (weightDeltaPct ?? 0) < 0 ? 'c-loss' : 'c-ink';
  const weightColorInline = (weightDeltaPct ?? 0) < 0 ? 'color:#B91C1C;' : 'color:#0F172A;';
  const weightFormatted = formatPercentES(weightDeltaPct);
  
  const allThesisNames = thesisNames.length > 0 ? thesisNames : [thesisName];
  
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Automático: ${sideLabel.toLowerCase()} simulada de ${escapeHtml(ticker)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
  ${getEmailStyles()}
  </style>
</head>
<body class="bg-page" style="margin:0;padding:0;background-color:#E2E8F0;font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;">
  <div class="preheader">${escapeHtml(preheader)}</div>
  <table role="presentation" class="bg-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#E2E8F0" style="background-color:#E2E8F0;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="container bg-paper" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#F8FAFC" style="width:600px;max-width:600px;background-color:#F8FAFC;border-radius:16px;overflow:hidden;">
          ${renderHeader(dateStr, isExample)}
          ${renderWhatHappened({ticker, side, sideLabel, thesisName, weightBeforePct, weightAfterPct, weightDeltaPct, assetDayPct, assetClass, assetColorInline, tickerEscaped, assetPctFormatted, assetLabel, weightClass, weightColorInline, weightFormatted, allThesisNames})}
          ${portfolioDayPct !== null ? renderPortfolioToday({portfolioLabel, portfolioClass, portfolioBg, portfolioBgColor, portfolioColorInline, portfolioFormatted, side}) : ''}
          ${renderReason({reasonPlain, thesisName})}
          ${renderImpact({portfolioImpactPct, thesisImpactPct, thesisName})}
          ${renderCta(deepLink)}
          ${renderFooter()}
        </table>
        <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:16px 0 0 0;font-size:11px;line-height:16px;color:#475569;">© 2026 La Viste · Una mirada propia.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderHeader(dateStr, isExample) {
  return `<tr>
    <td class="px" style="padding:28px 32px 8px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" style="padding:0 0 8px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="bg-tile" valign="middle" align="center" bgcolor="#0F172A" width="32" height="32" style="width:32px;height:32px;background-color:#0F172A;border-radius:8px;font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;font-size:12px;font-weight:800;line-height:32px;color:#FFFFFF;">lv</td>
                <td valign="middle" style="padding-left:10px;">
                  <span class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;font-size:18px;font-weight:800;line-height:22px;color:#0F172A;letter-spacing:-0.02em;">la viste</span><span class="c-period" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;font-size:18px;font-weight:800;color:#1142E8;">.</span>
                </td>
              </tr>
            </table>
          </td>
          <td valign="middle" align="right" style="padding:0 0 8px 0;">
            <span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:4px 10px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.06em;background-color:#EFF6FF;color:#2563EB;">AUTOMÁTICO</span>
          </td>
        </tr>
        <tr>
          <td colspan="2" class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;padding-top:4px;font-size:14px;line-height:20px;color:#475569;">Alerta de práctica · ${escapeHtml(dateStr)}</td>
        </tr>
      </table>
    </td>
  </tr>${isExample ? `<tr>
    <td class="px" style="padding:8px 32px 0 32px;">
      <p class="c-watch" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 16px 0;font-size:14px;line-height:20px;color:#B45309;">Datos de ejemplo · no es la cartera de un usuario real.</p>
    </td>
  </tr>` : ''}`;
}

function renderWhatHappened({ticker, side, sideLabel, thesisName, weightBeforePct, weightAfterPct, weightDeltaPct, assetDayPct, assetClass, assetColorInline, tickerEscaped, assetPctFormatted, assetLabel, weightClass, weightColorInline, weightFormatted, allThesisNames}) {
  const beforeFmt = formatWeightPercent(weightBeforePct);
  const afterFmt = formatWeightPercent(weightAfterPct);
  
  return `<tr>
    <td class="px" style="padding:0 32px 20px 32px;">
      <table role="presentation" class="bg-surface bd-line" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;">
        <tr>
          <td style="padding:24px 24px 8px 24px;">
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;font-size:14px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#475569;">Qué pasó</p>
            <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 8px 0;font-size:26px;font-weight:800;line-height:32px;letter-spacing:-0.02em;color:#0F172A;">${escapeHtml(sideLabel)} simulada de ${escapeHtml(ticker)}</p>
            <p style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 10px 0;">${allThesisNames.map(name => 
              `<span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:3px 8px;border-radius:9999px;font-size:14px;font-weight:700;line-height:18px;letter-spacing:0;background-color:#EFF6FF;color:#2563EB;margin:0 4px 4px 0;">Tesis: ${escapeHtml(name)}</span>`
            ).join('')}</p>
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:15px;line-height:22px;color:#475569;">Dinero de práctica · no se envió ninguna orden a un broker.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px 24px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="stack bg-soft" valign="top" width="50%" bgcolor="#F1F5F9" style="width:50%;background-color:#F1F5F9;border-radius:8px;padding:14px 16px;">
                  <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 4px 0;font-size:14px;font-weight:600;line-height:20px;color:#475569;">Peso de ${escapeHtml(ticker)}</p>
                  <p style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;">${allThesisNames.map(name => 
                    `<span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:3px 8px;border-radius:9999px;font-size:14px;font-weight:700;line-height:18px;letter-spacing:0;background-color:#EFF6FF;color:#2563EB;margin:0 4px 4px 0;">Tesis: ${escapeHtml(name)}</span>`
                  ).join('')}</p>
                  <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:18px;font-weight:800;color:#0F172A;">${beforeFmt}${NNBSP}→${NNBSP}${afterFmt}</p>
                  <p class="${weightClass}" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:6px 0 0 0;font-size:14px;font-weight:700;${weightColorInline}">${side === 'venta' ? '▼' : (side === 'compra' ? '▲' : '')} ${weightFormatted} (peso)</p>
                </td>
                ${assetDayPct !== null && assetDayPct !== undefined ? `<td class="stack stack-pad" width="12" style="width:12px;font-size:0;">&nbsp;</td>
                <td class="stack bg-soft" valign="top" width="50%" bgcolor="#F1F5F9" style="width:50%;background-color:#F1F5F9;border-radius:8px;padding:14px 16px;">
                  <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 4px 0;font-size:14px;font-weight:600;color:#475569;">Activo · día</p>
                  <p class="${assetClass}" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;font-size:18px;font-weight:800;${assetColorInline}">${tickerEscaped} ${assetPctFormatted}</p>
                  ${assetLabel ? `<p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:14px;line-height:20px;color:#475569;">${escapeHtml(assetLabel)}</p>` : `<p style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;">${allThesisNames.map(name => 
                    `<span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:3px 8px;border-radius:9999px;font-size:14px;font-weight:700;line-height:18px;letter-spacing:0;background-color:#EFF6FF;color:#2563EB;margin:0 4px 4px 0;">Tesis: ${escapeHtml(name)}</span>`
                  ).join('')}</p>
                  <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:14px;line-height:20px;color:#475569;">La ${assetDayPct > 0 ? 'suba' : 'baja'} disparó ${side === 'venta' ? 'el tope' : (side === 'compra' ? 'el rebalanceo' : 'una regla')} de esa tesis.</p>`}
                </td>` : ''}
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderPortfolioToday({portfolioLabel, portfolioClass, portfolioBg, portfolioBgColor, portfolioColorInline, portfolioFormatted, side}) {
  return `<tr>
    <td class="px" style="padding:0 32px 12px 32px;">
      <table role="presentation" class="${portfolioBg}" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${portfolioBgColor}" style="background-color:${portfolioBgColor};border-radius:16px;">
        <tr>
          <td style="padding:20px;">
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#475569;">Tu cartera hoy, después de esta operación</p>
            <p class="${portfolioClass}" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 4px 0;font-size:15px;font-weight:700;${portfolioColorInline}">${escapeHtml(portfolioLabel)}</p>
            <p class="${portfolioClass}" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:28px;font-weight:800;line-height:32px;letter-spacing:-0.02em;${portfolioColorInline}">${escapeHtml(portfolioFormatted)}</p>
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:10px 0 0 0;font-size:14px;line-height:20px;color:#475569;">Resultado total de tu cartera de práctica en el día, ya contando esta operación simulada. Solo %. No es un monto.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderReason({reasonPlain, thesisName}) {
  const sanitized = sanitizeReasonPlain(reasonPlain);
  return `<tr>
    <td class="px" style="padding:0 32px 12px 32px;">
      <table role="presentation" class="bg-accent" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EFF6FF" style="background-color:#EFF6FF;border-radius:16px;">
        <tr>
          <td style="padding:20px;">
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#475569;">Por qué</p>
            <p style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 10px 0;"><span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:3px 8px;border-radius:9999px;font-size:14px;font-weight:700;line-height:18px;letter-spacing:0;background-color:#EFF6FF;color:#2563EB;margin:0 4px 4px 0;">Tesis: ${escapeHtml(thesisName)}</span></p>
            <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:15px;line-height:23px;color:#0F172A;">${escapeHtml(sanitized)}. Es la regla de ${reasonPlain.includes('tope') ? 'tope' : 'rebalanceo'}, no una recomendación nueva.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderImpact({portfolioImpactPct, thesisImpactPct, thesisName}) {
  const hasPortfolio = portfolioImpactPct !== null && portfolioImpactPct !== undefined;
  const hasThesis = thesisImpactPct !== null && thesisImpactPct !== undefined;
  
  if (!hasPortfolio && !hasThesis) {
    return '';
  }
  
  const portfolioFmt = hasPortfolio ? formatPercentWithArrow(portfolioImpactPct) : '—';
  const thesisFmt = hasThesis ? formatPercentWithArrow(thesisImpactPct) : '—';
  
  return `<tr>
    <td class="px" style="padding:12px 32px 24px 32px;">
      <table role="presentation" class="bg-surface bd-line" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;">
        <tr>
          <td style="padding:20px;">
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 8px 0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#475569;">Impacto de esta operación</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="stack" valign="top" style="padding:0 12px 8px 0;">
                  <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 4px 0;font-size:14px;line-height:20px;color:#475569;">Cartera</p>
                  <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:20px;font-weight:800;color:#0F172A;">${escapeHtml(portfolioFmt)}</p>
                </td>
                <td class="stack" valign="top" style="padding:0 0 8px 0;">
                  <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 4px 0;font-size:14px;line-height:20px;color:#475569;">Tesis «${escapeHtml(thesisName)}»</p>
                  <p style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;"><span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:3px 8px;border-radius:9999px;font-size:14px;font-weight:700;line-height:18px;letter-spacing:0;background-color:#EFF6FF;color:#2563EB;margin:0 4px 4px 0;">Tesis: ${escapeHtml(thesisName)}</span></p>
                  <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:20px;font-weight:800;color:#0F172A;">${escapeHtml(thesisFmt)}</p>
                </td>
              </tr>
            </table>
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:8px 0 0 0;font-size:14px;line-height:20px;color:#475569;">Cambio de valor en % atribuible a esta operación (práctica), distinto del resultado total del día de arriba. No es un monto ni una ganancia en dinero real.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderCta(deepLink) {
  const url = deepLink || 'https://laviste.diegodella.ar/app';
  return `<tr>
    <td class="px" align="left" style="padding:0 32px 32px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="bg-cta" align="center" bgcolor="#0F172A" style="background-color:#0F172A;border-radius:8px;">
            <a class="c-on-cta" href="${escapeHtml(url)}" target="_blank" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;line-height:16px;color:#FFFFFF;text-decoration:none;border-radius:8px;min-height:16px;">
              Ver la operación
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderFooter() {
  return `<tr><td class="hair" bgcolor="#E2E8F0" height="1" style="background-color:#E2E8F0;font-size:1px;line-height:1px;height:1px;">&nbsp;</td></tr>
  <tr>
    <td class="px" style="padding:24px 32px 32px 32px;">
      <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 12px 0;font-size:14px;line-height:20px;color:#475569;">Este mensaje es educativo y simulado. No constituye asesoramiento financiero. La Viste es un simulador con dinero de práctica (simulado), no real. Los precios pueden ir demorados. No se envían órdenes a un broker.</p>
      <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 12px 0;font-size:14px;line-height:20px;color:#475569;">Recibís este aviso porque activaste las alertas de Automático. Las operaciones son de práctica: no se envía ninguna orden a un broker.</p>
      <p style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:14px;line-height:20px;">
        <a class="c-accent" href="https://laviste.diegodella.ar/app#/cuenta/email" target="_blank" style="color:#2563EB;text-decoration:underline;">Darse de baja o cambiar alertas</a>
        <span class="c-muted" style="color:#475569;"> · </span>
        <a class="c-accent" href="https://laviste.diegodella.ar/privacidad" target="_blank" style="color:#2563EB;text-decoration:underline;">Privacidad y datos</a>
      </p>
    </td>
  </tr>`;
}

function getEmailStyles() {
  return `:root { color-scheme: light dark; }
  html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; width: 100% !important; }
  img { border: 0; outline: none; text-decoration: none; }
  table { border-collapse: collapse; }
  a { text-decoration: none; }
  .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; max-height: 0; max-width: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; }
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; max-width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .stack { display: block !important; width: 100% !important; box-sizing: border-box !important; }
    .stack-pad { padding-left: 0 !important; padding-right: 0 !important; padding-top: 10px !important; }
    .hero-num { font-size: 36px !important; line-height: 40px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg-page { background-color: #020617 !important; }
    .bg-paper { background-color: #0B1220 !important; }
    .bg-surface { background-color: #1E293B !important; }
    .bg-soft { background-color: #334155 !important; }
    .bg-gain { background-color: #064E3B !important; }
    .bg-loss { background-color: #7F1D1D !important; }
    .bg-watch { background-color: #78350F !important; }
    .bg-accent { background-color: #1E3A5F !important; }
    .bg-cta { background-color: #F8FAFC !important; }
    .bg-tile { background-color: #1E293B !important; }
    .bg-bar { background-color: #334155 !important; }
    .c-ink { color: #F8FAFC !important; }
    .c-muted { color: #94A3B8 !important; }
    .bg-soft .c-muted, .bg-watch .c-muted, .bg-gain .c-muted, .bg-loss .c-muted { color: #CBD5E1 !important; }
    .c-gain { color: #6EE7B7 !important; }
    .c-loss { color: #FCA5A5 !important; }
    .c-watch { color: #FBBF24 !important; }
    .c-accent { color: #93C5FD !important; }
    .c-on-cta { color: #0F172A !important; }
    .c-period { color: #60A5FA !important; }
    .bd-line { border-color: #334155 !important; }
    .hair { background-color: #334155 !important; }
  }
  html.force-dark .bg-page, html.force-dark.bg-page { background-color: #020617 !important; }
  html.force-dark .bg-paper { background-color: #0B1220 !important; }
  html.force-dark .bg-surface { background-color: #1E293B !important; }
  html.force-dark .bg-soft { background-color: #334155 !important; }
  html.force-dark .bg-gain { background-color: #064E3B !important; }
  html.force-dark .bg-loss { background-color: #7F1D1D !important; }
  html.force-dark .bg-watch { background-color: #78350F !important; }
  html.force-dark .bg-accent { background-color: #1E3A5F !important; }
  html.force-dark .bg-cta { background-color: #F8FAFC !important; }
  html.force-dark .bg-tile { background-color: #1E293B !important; }
  html.force-dark .bg-bar { background-color: #334155 !important; }
  html.force-dark .c-ink { color: #F8FAFC !important; }
  html.force-dark .c-muted { color: #94A3B8 !important; }
  html.force-dark .bg-soft .c-muted, html.force-dark .bg-watch .c-muted, html.force-dark .bg-gain .c-muted, html.force-dark .bg-loss .c-muted { color: #CBD5E1 !important; }
  html.force-dark .c-gain { color: #6EE7B7 !important; }
  html.force-dark .c-loss { color: #FCA5A5 !important; }
  html.force-dark .c-watch { color: #FBBF24 !important; }
  html.force-dark .c-accent { color: #93C5FD !important; }
  html.force-dark .c-on-cta { color: #0F172A !important; }
  html.force-dark .c-period { color: #60A5FA !important; }
  html.force-dark .bd-line { border-color: #334155 !important; }
  html.force-dark .hair { background-color: #334155 !important; }`;
}
