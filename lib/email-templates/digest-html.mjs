/**
 * Daily digest HTML template (Clarity design approved Nov 6, 2026).
 * Fully responsive, dark mode support, email-client compatible.
 */

import {formatPercentES, formatPercentWithArrow, directionLabel, formatDateES, escapeHtml, formatAbsolutePercent} from './format.mjs';

const NNBSP = '\u202F';

export function buildDigestHtml({
  userName,
  date,
  portfolio,
  theses = [],
  takeaway,
  autoActions = [],
  alertsFired = [],
  tip,
  newsItems = [],
  prefs = {},
  isExample = false,
} = {}) {
  const dateStr = formatDateES(date || new Date(), {long: true});
  const dateShort = formatDateES(date || new Date());
  
  const portfolioPct = portfolio?.dayPct ?? null;
  const portfolioWeekPct = portfolio?.weekPct ?? null;
  const hasPortfolioData = portfolioPct !== null;
  
  const preheader = hasPortfolioData
    ? `${directionLabel(portfolioPct)} ${formatPercentWithArrow(portfolioPct)} · por tesis y movimientos · práctica · ${dateShort}`
    : `Resumen de práctica · ${dateShort}`;
  
  const heroLabel = hasPortfolioData ? directionLabel(portfolioPct) : 'Resultado del día';
  const heroClass = hasPortfolioData && portfolioPct >= 0 ? 'c-gain' : (hasPortfolioData && portfolioPct < 0 ? 'c-loss' : 'c-ink');
  const heroColorInline = hasPortfolioData && portfolioPct >= 0 ? 'color:#047857;' : (hasPortfolioData && portfolioPct < 0 ? 'color:#B91C1C;' : 'color:#0F172A;');
  const heroPct = hasPortfolioData ? formatPercentWithArrow(portfolioPct) : '—';
  
  const hasData = hasPortfolioData || theses.length > 0 || autoActions.length > 0 || alertsFired.length > 0 || newsItems.length > 0;
  
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${hasPortfolioData ? `Tu cartera hoy ${formatPercentES(portfolioPct)} · resumen de práctica` : 'Resumen de práctica'}</title>
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
          ${hasData ? renderHero({portfolioPct, portfolioWeekPct, heroLabel, heroClass, heroColorInline, heroPct, theses}) : ''}
          ${takeaway ? renderTakeaway(takeaway) : ''}
          ${renderTheses(theses)}
          ${renderAutoActions(autoActions)}
          ${renderAlertsFired(alertsFired, portfolioPct, prefs)}
          ${newsItems.length > 0 ? renderNews(newsItems) : ''}
          ${tip ? renderTip(tip) : ''}
          ${hasData ? '' : renderEmptyState()}
          ${renderCta()}
          ${renderFooter('digest', prefs)}
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
            <span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:4px 10px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.06em;background-color:#EFF6FF;color:#2563EB;">PRÁCTICA</span>
          </td>
        </tr>
        <tr>
          <td colspan="2" class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;padding-top:4px;font-size:13px;line-height:18px;color:#475569;">Resumen diario · ${escapeHtml(dateStr)}</td>
        </tr>
      </table>
    </td>
  </tr>${isExample ? `<tr>
    <td class="px" style="padding:8px 32px 0 32px;">
      <p class="c-watch" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 16px 0;font-size:12px;line-height:16px;color:#B45309;">Datos de ejemplo · no es la cartera de un usuario real. Quitar este renglón en producción.</p>
    </td>
  </tr>` : ''}`;
}

function renderHero({portfolioPct, portfolioWeekPct, heroLabel, heroClass, heroColorInline, heroPct, theses}) {
  if (portfolioPct === null) return '';
  
  const weekContext = portfolioWeekPct !== null
    ? `En la semana la cartera lleva ${formatPercentWithArrow(portfolioWeekPct)} (práctica). El número grande de arriba es solo el día de hoy, no un monto.`
    : 'El número de arriba es solo el día de hoy (práctica), no un monto.';
  
  return `<tr>
    <td class="px" style="padding:0 32px 24px 32px;">
      <table role="presentation" class="bg-surface bd-line" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;">
        <tr>
          <td style="padding:24px 24px 4px 24px;">
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;font-size:14px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#475569;">Resultado total del día</p>
            <p class="${heroClass}" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 4px 0;font-size:15px;font-weight:700;${heroColorInline}">${escapeHtml(heroLabel)}</p>
            <p class="hero-num ${heroClass}" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:42px;font-weight:800;line-height:46px;letter-spacing:-0.03em;${heroColorInline}">${escapeHtml(heroPct)}</p>
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:10px 0 0 0;font-size:13px;line-height:18px;color:#475569;">Toda tu cartera de práctica · simulado · precios demorados · solo %</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 24px 8px 24px;">
            <table role="presentation" class="bg-soft" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F5F9" style="background-color:#F1F5F9;border-radius:8px;">
              <tr>
                <td style="padding:12px 16px;">
                  <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:13px;line-height:18px;color:#475569;">${escapeHtml(weekContext)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${theses.length > 0 ? renderThesisBreakdown(theses) : ''}
      </table>
    </td>
  </tr>`;
}

function renderThesisBreakdown(theses) {
  if (!theses || theses.length === 0) return '';
  
  return `<tr>
    <td style="padding:8px 24px 8px 24px;">
      <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#475569;">Cómo se armó, por tesis</p>
    </td>
  </tr>
  <tr>
    <td style="padding:0 24px 8px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${theses.map((thesis, i) => renderThesisRow(thesis, i < theses.length - 1)).join('')}
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 24px 20px 24px;">
      <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:14px;line-height:20px;line-height:18px;color:#475569;">El % de cada tesis es su resultado del día (práctica). No suman en crudo al % de la cartera: cada una pesa distinto.</p>
    </td>
  </tr>`;
}

function renderThesisRow(thesis, hasBorder) {
  const dayPct = thesis.dayPct ?? null;
  if (dayPct === null) return '';
  
  const label = directionLabel(dayPct);
  const colorClass = dayPct >= 0 ? 'c-gain' : (dayPct < 0 ? 'c-loss' : 'c-muted');
  const colorInline = dayPct >= 0 ? 'color:#047857;' : (dayPct < 0 ? 'color:#B91C1C;' : 'color:#64748B;');
  const formatted = formatPercentWithArrow(dayPct);
  const borderStyle = hasBorder ? 'border-bottom:1px solid #E2E8F0;' : '';
  
  return `<tr>
    <td class="${hasBorder ? 'bd-line' : ''}" valign="middle" style="padding:10px 0;${borderStyle}">
      <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;font-size:15px;font-weight:800;color:#0F172A;">${escapeHtml(thesis.name)}</p>
      <span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:3px 8px;border-radius:9999px;font-size:14px;font-weight:700;line-height:18px;letter-spacing:0;background-color:#EFF6FF;color:#2563EB;margin:0 4px 4px 0;">Tesis: ${escapeHtml(thesis.name)}</span>
    </td>
    <td class="${hasBorder ? 'bd-line' : ''}" valign="middle" align="right" style="padding:10px 0;${borderStyle}white-space:nowrap;">
      <p class="${colorClass}" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:14px;font-weight:700;${colorInline}">${escapeHtml(label)}</p>
      <p class="${colorClass}" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:2px 0 0 0;font-size:18px;font-weight:800;${colorInline}">${escapeHtml(formatted)}</p>
    </td>
  </tr>`;
}

function renderTakeaway(text) {
  return `<tr>
    <td class="px" style="padding:0 32px 24px 32px;">
      <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:16px;line-height:24px;color:#0F172A;">${escapeHtml(text)}</p>
    </td>
  </tr>`;
}

function renderTheses(theses) {
  if (!theses || theses.length === 0) return '';
  
  return `<tr>
    <td class="px" style="padding:0 32px 8px 32px;">
      <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#0F172A;">Tus tesis</p>
    </td>
  </tr>
  ${theses.map(thesis => renderThesisCard(thesis)).join('')}`;
}

function renderThesisCard(thesis) {
  const dayPct = thesis.dayPct ?? null;
  if (dayPct === null) return '';
  
  const colorClass = dayPct >= 0 ? 'c-gain' : (dayPct < 0 ? 'c-loss' : 'c-ink');
  const colorInline = dayPct >= 0 ? 'color:#047857;' : (dayPct < 0 ? 'color:#B91C1C;' : 'color:#0F172A;');
  const formatted = formatPercentWithArrow(dayPct);
  const contributions = thesis.contributions || [];
  const movers = thesis.movers || [];
  
  return `<tr>
    <td class="px" style="padding:8px 32px 12px 32px;">
      <table role="presentation" class="bg-surface bd-line" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;">
        <tr>
          <td style="padding:20px 20px 8px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="stack c-ink" valign="top" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;font-size:17px;font-weight:800;color:#0F172A;padding-bottom:6px;">${escapeHtml(thesis.name)}</td>
                <td class="stack ${colorClass}" valign="top" align="right" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;font-size:17px;font-weight:800;white-space:nowrap;${colorInline}">${escapeHtml(formatted)}</td>
              </tr>
            </table>
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:14px;line-height:20px;line-height:18px;color:#475569;">% del día · aportes a esta tesis</p>
          </td>
        </tr>
        ${contributions.length > 0 ? renderContributions(contributions) : ''}
        ${movers.length > 0 ? renderMovers(movers) : ''}
      </table>
    </td>
  </tr>`;
}

function renderContributions(contributions) {
  const maxAbs = Math.max(...contributions.map(c => Math.abs(c.contribPct || 0)));
  
  return `<tr>
    <td style="padding:8px 20px 8px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${contributions.map((contrib, i) => {
          const pct = contrib.contribPct ?? 0;
          const colorClass = pct >= 0 ? 'c-gain' : 'c-loss';
          const colorInline = pct >= 0 ? 'color:#047857;' : 'color:#B91C1C;';
          const barColor = pct >= 0 ? '#059669' : '#EF4444';
          const width = maxAbs > 0 ? Math.round((Math.abs(pct) / maxAbs) * 100) : 0;
          const thesisNames = contrib.thesisNames || [contrib.thesisName];
          
          return `<tr>
            <td class="c-ink" width="64" valign="middle" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;width:64px;font-size:14px;font-weight:700;color:#0F172A;padding:10px 8px 0 0;">${escapeHtml(contrib.ticker)}</td>
            <td valign="middle" style="padding:10px 8px 0 8px;">
              <table role="presentation" class="bg-bar" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#E2E8F0" style="background-color:#E2E8F0;border-radius:4px;">
                <tr>
                  <td width="${width}%" bgcolor="${barColor}" style="width:${width}%;background-color:${barColor};height:8px;font-size:0;line-height:8px;border-radius:4px${width < 100 ? ' 0 0 4px' : ''};">&nbsp;</td>
                  ${width < 100 ? `<td width="${100 - width}%" style="width:${100 - width}%;height:8px;font-size:0;">&nbsp;</td>` : ''}
                </tr>
              </table>
            </td>
            <td class="${colorClass}" width="88" align="right" valign="middle" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;width:88px;font-size:14px;font-weight:700;white-space:nowrap;padding-top:10px;${colorInline}">${escapeHtml(formatPercentWithArrow(pct))}</td>
          </tr>
          <tr>
            <td colspan="3" style="padding:6px 0 10px 0;">${(thesisNames || []).map(name => 
              `<span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:3px 8px;border-radius:9999px;font-size:14px;font-weight:700;line-height:18px;letter-spacing:0;background-color:#EFF6FF;color:#2563EB;margin:0 4px 4px 0;">Tesis: ${escapeHtml(name)}</span>`
            ).join('')}</td>
          </tr>`;
        }).join('')}
      </table>
    </td>
  </tr>`;
}

function renderMovers(movers) {
  return `<tr>
    <td style="padding:4px 20px 20px 20px;">
      <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 8px 0;font-size:14px;line-height:20px;font-weight:600;color:#475569;">Movimientos del activo (día)</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${movers.map((mover, i) => {
          const dayPct = mover.dayPct ?? 0;
          const colorClass = dayPct >= 0 ? 'c-gain' : 'c-loss';
          const colorInline = dayPct >= 0 ? 'color:#047857;' : 'color:#B91C1C;';
          const symbolEscaped = escapeHtml(mover.symbol);
          const pctFormatted = formatPercentWithArrow(dayPct);
          const thesisNames = mover.thesisNames || [];
          const borderStyle = i < movers.length - 1 ? 'border-bottom:1px solid #E2E8F0;' : '';
          
          return `<tr>
            <td ${i < movers.length - 1 ? 'class="bd-line"' : ''} valign="top" style="padding:10px 0;${borderStyle}">
              <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;font-size:14px;line-height:20px;color:#0F172A;"><span class="${colorClass}" style="font-weight:800;${colorInline}">${symbolEscaped} ${pctFormatted}</span></p>
              ${(thesisNames || []).map(name => 
                `<span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:3px 8px;border-radius:9999px;font-size:14px;font-weight:700;line-height:18px;letter-spacing:0;background-color:#EFF6FF;color:#2563EB;margin:0 4px 4px 0;">Tesis: ${escapeHtml(name)}</span>`
              ).join('')}
            </td>
          </tr>`;
        }).join('')}
      </table>
    </td>
  </tr>`;
}

function renderAutoActions(actions) {
  if (!actions || actions.length === 0) return '';
  
  const hasActions = actions.some(a => a.ticker);
  
  return `<tr>
    <td class="px" style="padding:0 32px 12px 32px;">
      <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 12px 0;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#0F172A;">Qué hizo el modo Automático y por qué</p>
      <table role="presentation" class="bg-surface bd-line" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;">
        ${hasActions ? actions.map((action, i) => renderAutoAction(action, i > 0)).join('') : ''}
        <tr><td class="hair" bgcolor="#E2E8F0" height="1" style="background-color:#E2E8F0;font-size:1px;line-height:1px;height:1px;">&nbsp;</td></tr>
        <tr>
          <td style="padding:12px 20px 16px 28px;">
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:14px;line-height:21px;color:#475569;">Hoy Automático no ejecutó operaciones de práctica${hasActions ? ' adicionales' : ''}.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderAutoAction(action, showSeparator) {
  const side = action.side === 'compra' ? 'Compra' : 'Venta';
  
  return `${showSeparator ? '<tr><td class="hair" bgcolor="#E2E8F0" height="1" style="background-color:#E2E8F0;font-size:1px;line-height:1px;height:1px;">&nbsp;</td></tr>' : ''}
  <tr>
    <td style="padding:4px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="top" width="8" bgcolor="#3B82F6" style="width:8px;background-color:#3B82F6;border-radius:16px 0 0 ${showSeparator ? '0' : '16px'};font-size:0;">&nbsp;</td>
          <td style="padding:16px 16px 12px 16px;">
            <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;font-size:15px;font-weight:700;color:#0F172A;">${escapeHtml(side)} simulada · ${escapeHtml(action.ticker)}</p>
            <p style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 8px 0;"><span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:3px 8px;border-radius:9999px;font-size:14px;font-weight:700;line-height:18px;letter-spacing:0;background-color:#EFF6FF;color:#2563EB;margin:0 4px 4px 0;">Tesis: ${escapeHtml(action.thesisName)}</span></p>
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:14px;line-height:21px;color:#475569;">${escapeHtml(action.reasonPlain)}. No se envió ninguna orden a un broker.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderAlertsFired(alerts, portfolioPct, prefs) {
  if (!alerts || alerts.length === 0) return '';
  
  const thresholdAsset = prefs.thresholdAssetPct ?? 5.0;
  const thresholdPortfolio = prefs.thresholdPortfolioPct ?? 3.0;
  
  const hasAssetAlerts = alerts.some(a => a.symbol);
  const portfolioMsg = portfolioPct !== null && portfolioPct !== undefined
    ? `La cartera — ${directionLabel(portfolioPct).toLowerCase()} ${formatPercentWithArrow(portfolioPct)} — no cruzó el umbral de cartera (${formatAbsolutePercent(thresholdPortfolio / 100)}).`
    : '';
  
  return `<tr>
    <td class="px" style="padding:12px 32px 12px 32px;">
      <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 12px 0;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#0F172A;">Alertas disparadas</p>
      <table role="presentation" class="bg-watch" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFBEB" style="background-color:#FFFBEB;border-radius:16px;">
        <tr>
          <td style="padding:16px 20px;">
            ${hasAssetAlerts ? alerts.map(alert => {
              const dayPct = alert.dayPct ?? 0;
              const colorClass = dayPct >= 0 ? 'c-watch' : 'c-watch';
              const symbolEscaped = escapeHtml(alert.ticker);
              const pctFormatted = formatPercentWithArrow(dayPct);
              const thesisNames = alert.thesisNames || [];
              
              return `<p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 6px 0;font-size:14px;line-height:21px;color:#0F172A;"><span class="${colorClass}" style="font-weight:800;">${symbolEscaped} ${pctFormatted}</span> cruzó tu umbral de activo (${formatAbsolutePercent(thresholdAsset / 100)}).</p>
              ${thesisNames.length > 0 ? `<p style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 10px 0;">${thesisNames.map(name => 
                `<span class="bg-accent c-accent" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:3px 8px;border-radius:9999px;font-size:14px;font-weight:700;line-height:18px;letter-spacing:0;background-color:#EFF6FF;color:#2563EB;margin:0 4px 4px 0;">Tesis: ${escapeHtml(name)}</span>`
              ).join('')}</p>` : ''}`;
            }).join('') : ''}
            ${portfolioMsg ? `<p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:14px;line-height:21px;color:#475569;">${escapeHtml(portfolioMsg)}</p>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderNews(newsItems) {
  return `<tr>
    <td class="px" style="padding:12px 32px 12px 32px;">
      <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 12px 0;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#0F172A;">Noticias relevantes</p>
      <table role="presentation" class="bg-surface bd-line" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;">
        <tr>
          <td style="padding:16px 20px;">
            ${newsItems.map((item, i) => 
              `<p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 ${i < newsItems.length - 1 ? '12px' : '0'} 0;font-size:14px;line-height:21px;color:#0F172A;"><a class="c-accent" href="${escapeHtml(item.url)}" target="_blank" style="color:#2563EB;text-decoration:underline;">${escapeHtml(item.title)}</a></p>`
            ).join('')}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderTip(tip) {
  return `<tr>
    <td class="px" style="padding:12px 32px 24px 32px;">
      <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 12px 0;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#0F172A;">Para aprender</p>
      <table role="presentation" class="bg-accent" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EFF6FF" style="background-color:#EFF6FF;border-radius:16px;">
        <tr>
          <td style="padding:16px 20px;">
            <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:14px;line-height:22px;color:#0F172A;">${escapeHtml(tip)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderEmptyState() {
  return `<tr>
    <td class="px" style="padding:0 32px 24px 32px;">
      <table role="presentation" class="bg-surface bd-line" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;">
        <tr>
          <td style="padding:24px;">
            <p class="c-ink" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 12px 0;font-size:16px;font-weight:700;color:#0F172A;">El resultado del día no está disponible todavía</p>
            <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:14px;line-height:21px;color:#475569;">Revisá la app para ver el estado actual de tu cartera de práctica.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderCta() {
  return `<tr>
    <td class="px" align="left" style="padding:0 32px 32px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="bg-cta" align="center" bgcolor="#0F172A" style="background-color:#0F172A;border-radius:8px;">
            <a class="c-on-cta" href="https://laviste.diegodella.ar/app" target="_blank" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;line-height:16px;color:#FFFFFF;text-decoration:none;border-radius:8px;min-height:16px;">
              Abrir La Viste
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderFooter(type, prefs) {
  const thresholdAsset = prefs.thresholdAssetPct ?? 5.0;
  const thresholdPortfolio = prefs.thresholdPortfolioPct ?? 3.0;
  
  const reason = type === 'digest'
    ? `Recibís este resumen porque tenés el digest de práctica activado. Lo armamos alrededor de las 18:00 (Argentina) cuando un activo se mueve al menos ${formatAbsolutePercent(thresholdAsset / 100)} (o el umbral que elegiste), cuando la cartera se mueve al menos ${formatAbsolutePercent(thresholdPortfolio / 100)}, o cuando hay noticias que pediste.`
    : `Recibís este aviso porque activaste las alertas de Automático. Las operaciones son de práctica: no se envía ninguna orden a un broker.`;
  
  return `<tr><td class="hair" bgcolor="#E2E8F0" height="1" style="background-color:#E2E8F0;font-size:1px;line-height:1px;height:1px;">&nbsp;</td></tr>
  <tr>
    <td class="px" style="padding:24px 32px 32px 32px;">
      <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 12px 0;font-size:14px;line-height:20px;line-height:18px;color:#475569;">Este mensaje es educativo y simulado. No constituye asesoramiento financiero. La Viste es un simulador con dinero de práctica (simulado), no real. Los precios pueden ir demorados. No se envían órdenes a un broker.</p>
      <p class="c-muted" style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0 0 12px 0;font-size:14px;line-height:20px;line-height:18px;color:#475569;">${reason}</p>
      <p style="font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;margin:0;font-size:12px;line-height:18px;">
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
    .center-sm { text-align: left !important; }
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
