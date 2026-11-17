/**
 * HTML del digest «Cierre del día» (port de build_mocks.py + _head.html, SoT 2026-11-16).
 * Tablas, estilos inline, dark mode por clases, sin JS ni SVG. Solo porcentajes.
 */

import {
  STATUS_COPY, TONE, FOOTER, formatPct, formatEyebrowDate, heroLabel, changesPhrase, toneOf,
  leaderParts, rowMetricText, sparkAlt, autoActionLines, escapeHtml,
} from './supertake-copy.mjs';

const F = "font-family:'Plus Jakarta Sans', Helvetica, Arial, sans-serif;";

export const SUPERTAKE_STYLES = `
  :root { color-scheme: light dark; }
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
  html.force-dark .c-gain { color: #6EE7B7 !important; }
  html.force-dark .c-loss { color: #FCA5A5 !important; }
  html.force-dark .c-watch { color: #FBBF24 !important; }
  html.force-dark .c-accent { color: #93C5FD !important; }
  html.force-dark .c-on-cta { color: #0F172A !important; }
  html.force-dark .c-period { color: #60A5FA !important; }
  html.force-dark .bd-line { border-color: #334155 !important; }
  html.force-dark .hair { background-color: #334155 !important; }

  @media (prefers-color-scheme: dark) {
    .bg-soft .c-muted { color: #CBD5E1 !important; }
    .pill-ok { background-color: #064E3B !important; color: #6EE7B7 !important; }
    .pill-watch { background-color: #78350F !important; color: #FCD34D !important; }
    .pill-risk { background-color: #7F1D1D !important; color: #FECACA !important; }
    .stack-line { border-color: #334155 !important; }
  }
  @media only screen and (max-width: 620px) {
    .hero-num { font-size: 30px !important; line-height: 36px !important; }
    .stack-line { border-left: 0 !important; border-top: 1px solid #E2E8F0 !important; }
    .spark-wrap { float: none !important; margin-left: 0 !important; }
    .stack-pad { padding: 0 20px 16px 20px !important; text-align: left !important; }
    .stack-pad p, .center-sm { text-align: left !important; }
    .stack-pad table { margin-left: 0 !important; }
    .px { padding-left: 16px !important; padding-right: 16px !important; }
    .pin { padding-left: 16px !important; padding-right: 16px !important; }
    .stack-pad { padding: 0 16px 16px 16px !important; }
    .pexp { padding: 12px 14px !important; }
    .stack-pad { border-top: 0 !important; }
    .mtab { float: none !important; margin: 0 !important; }
    .mtab tr { display: inline-block !important; vertical-align: middle !important; }
    .mcell { display: inline-block !important; text-align: left !important; vertical-align: middle !important; padding: 0 14px 0 0 !important; }
  }
  @media only screen and (max-width: 620px) and (prefers-color-scheme: dark) {
    .stack-line { border-top-color: #334155 !important; }
  }
`;

function pctSpan(fraction, {size = null, weight = 700} = {}) {
  const tone = TONE[toneOf(fraction)];
  const sz = size ? `${F}font-size:${size};` : '';
  return `<span class="${tone.cls}" style="${sz}font-weight:${weight};color:${tone.color};white-space:nowrap;">${formatPct(fraction, {html: true})}</span>`;
}

function pill(status) {
  const s = STATUS_COPY[status];
  return `<span class="${s.pillClass}" style="${F}display:inline-block;padding:3px 10px;border-radius:9999px;font-size:14px;line-height:20px;font-weight:700;background-color:${s.bg};color:${s.fg};white-space:nowrap;">${s.label}</span>`;
}

function spark(url, name, weekPct, dayPct) {
  if (!url) return '';
  return `<img src="${escapeHtml(url)}" width="96" height="28" alt="${escapeHtml(sparkAlt(name, weekPct, dayPct))}" style="display:block;width:96px;height:28px;border:0;outline:none;">`;
}

function weekTxt(weekPct) {
  if (!Number.isFinite(weekPct)) return '';
  return `<span class="c-muted" style="${F}font-size:14px;line-height:20px;color:#475569;white-space:nowrap;">Semana ${pctSpan(weekPct)}</span>`;
}

function metrics(cells) {
  const rows = cells.filter(([c]) => c).map(([c, pb]) => `<tr><td class="mcell" align="right" style="padding:0 0 ${pb}px 0;text-align:right;">${c}</td></tr>`).join('');
  return rows ? `<table role="presentation" class="mtab" cellpadding="0" cellspacing="0" border="0" align="right">${rows}</table>` : '';
}

function header() {
  return `<tr><td class="px" style="padding:28px 32px 18px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="bg-tile" valign="middle" align="center" bgcolor="#0F172A" width="32" height="32" style="width:32px;height:32px;background-color:#0F172A;border-radius:8px;${F}font-size:14px;font-weight:800;line-height:32px;color:#FFFFFF;">lv</td>
<td valign="middle" style="padding-left:10px;"><span class="c-ink" style="${F}font-size:18px;font-weight:800;line-height:22px;color:#0F172A;letter-spacing:-0.02em;">la viste</span><span class="c-period" style="${F}font-size:18px;font-weight:800;color:#1142E8;">.</span></td>
</tr></table></td>
<td valign="middle" align="right"><span class="bg-accent c-accent" style="${F}display:inline-block;padding:3px 10px;border-radius:9999px;font-size:14px;line-height:20px;font-weight:700;background-color:#EFF6FF;color:#2563EB;">Práctica</span></td>
</tr></table></td></tr>`;
}

function hero(view) {
  const day = view.portfolio.dayPct;
  const tone = TONE[toneOf(day)];
  return `<tr><td class="px" style="padding:0 32px 8px 32px;">
<p class="c-muted" style="${F}margin:0 0 6px 0;font-size:14px;line-height:20px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#475569;">Cierre del día · ${formatEyebrowDate(view.date)}</p>
<p class="c-muted" style="${F}margin:0 0 2px 0;font-size:14px;line-height:20px;font-weight:600;color:#475569;">Resultado total del día · <span class="${tone.cls}" style="font-weight:700;color:${tone.color};">${heroLabel(day)}</span></p>
<h1 class="hero-num c-ink" style="${F}margin:0;font-size:36px;line-height:42px;font-weight:800;letter-spacing:-0.03em;color:#0F172A;">Tu cartera cerró <span class="${tone.cls}" style="color:${tone.color};white-space:nowrap;">${formatPct(day, {html: true})}</span> hoy</h1>
<p class="c-muted" style="${F}margin:10px 0 0 0;font-size:16px;line-height:24px;color:#475569;">El mercado cerró. Así les fue a tus tesis.</p>
</td></tr>`;
}

function glance(view) {
  const wk = view.portfolio.weekPct;
  const weekCell = Number.isFinite(wk) ? `<td class="stack" valign="middle" width="50%" style="padding:16px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:12px;"><p class="c-muted" style="${F}margin:0;font-size:14px;line-height:20px;color:#475569;">Tu cartera en la semana</p>
<p class="${TONE[toneOf(wk)].cls}" style="${F}margin:2px 0 0 0;font-size:18px;line-height:24px;font-weight:800;color:${TONE[toneOf(wk)].color};white-space:nowrap;">${formatPct(wk, {html: true})}</p></td>
<td valign="middle">${spark(view.portfolio.sparkUrl, 'tu cartera', wk, view.portfolio.dayPct)}</td></tr></table></td>
` : '';
  return `<tr><td class="px" style="padding:12px 32px 24px 32px;">
<table role="presentation" class="bg-surface bd-line" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;"><tr>
${weekCell}<td class="stack stack-line bd-line" valign="middle" style="padding:16px 20px;${weekCell ? 'border-left:1px solid #E2E8F0;' : ''}">
<p class="c-muted" style="${F}margin:0;font-size:14px;line-height:20px;color:#475569;">Hoy</p>
<p class="c-ink" style="${F}margin:2px 0 0 0;font-size:16px;line-height:24px;font-weight:700;color:#0F172A;">${view.upCount} de ${view.thesesCount} tesis en alza · ${changesPhrase(view.changesCount)}</p></td>
</tr></table></td></tr>`;
}

function changeCard(t) {
  const st = STATUS_COPY[t.status];
  const prev = STATUS_COPY[t.statusPrev].label;
  return `<tr><td class="px" style="padding:0 32px 12px 32px;">
<table role="presentation" class="bg-surface bd-line" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;">
<tr><td class="stack pin" valign="top" style="padding:20px 20px 12px 20px;">
<p class="c-ink" style="${F}margin:0 0 6px 0;font-size:18px;line-height:24px;font-weight:800;color:#0F172A;">${escapeHtml(t.name)}</p>
<p class="c-muted" style="${F}margin:0;font-size:14px;line-height:28px;color:#475569;">Pasó de <span class="c-muted" style="text-decoration:line-through;color:#475569;white-space:nowrap;">${prev}</span> a ${pill(t.status)}</p>
<p class="c-muted" style="${F}margin:4px 0 0 0;font-size:14px;line-height:20px;color:#475569;">Dinero de práctica · hoy ${pctSpan(t.dayPct)}</p>
</td>
<td class="stack stack-pad" valign="top" align="right" width="140" style="padding:22px 20px 12px 0;">
${metrics([[spark(t.sparkUrl, t.name, t.weekPct, t.dayPct), 6], [weekTxt(t.weekPct), 0]])}</td></tr>
<tr><td colspan="2" class="stack pin" style="padding:4px 20px 20px 20px;">
<table role="presentation" class="bg-soft" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F5F9" style="background-color:#F1F5F9;border-left:4px solid ${st.border};border-radius:0 8px 8px 0;"><tr><td class="pexp" style="padding:12px 16px;">
<p class="c-ink" style="${F}margin:0;font-size:15px;line-height:23px;color:#0F172A;">${escapeHtml(t.explanation)}</p>
<p style="${F}margin:10px 0 0 0;font-size:14px;line-height:20px;font-weight:700;"><a class="c-accent" href="${escapeHtml(t.link)}" target="_blank" style="color:#2563EB;text-decoration:none;">Ver qué cambió →</a></p>
</td></tr></table></td></tr></table></td></tr>`;
}

function emptyChanges(view) {
  return `<tr><td class="px" style="padding:0 32px 24px 32px;">
<table role="presentation" class="bg-soft" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F5F9" style="background-color:#F1F5F9;border-radius:16px;"><tr><td style="padding:16px 20px;">
<p class="c-ink" style="${F}margin:0;font-size:16px;line-height:24px;font-weight:700;color:#0F172A;">Sin cambios de estado hoy</p>
<p class="c-muted" style="${F}margin:2px 0 0 0;font-size:14px;line-height:21px;color:#475569;">Tus ${view.thesesCount} tesis siguen como ayer. Abajo está cómo le fue a cada una.</p>
</td></tr></table></td></tr>`;
}

function moreLink(text, href) {
  return `<tr><td class="px" style="padding:0 32px 16px 32px;"><p style="${F}margin:0;font-size:14px;line-height:20px;font-weight:700;"><a class="c-accent" href="${escapeHtml(href)}" target="_blank" style="color:#2563EB;text-decoration:none;">${text}</a></p></td></tr>`;
}

function thesisRow(t, i, view) {
  const top = i === 0 ? '' : 'border-top:1px solid #E2E8F0;';
  const lead = leaderParts(t);
  const leadHtml = lead
    ? (lead.still
      ? `${escapeHtml(lead.ticker)} <span class="c-muted" style="font-weight:700;color:#475569;">${formatPct(0, {html: true})}</span> · sin movimiento hoy`
      : `${escapeHtml(lead.ticker)} ${pctSpan(lead.dayPct)} lideró`)
    : '';
  const metric = rowMetricText(t, view.rowMetric, {html: true});
  const metaLine = [leadHtml, metric].filter(Boolean).join(' · ');
  return `<tr><td class="stack pin bd-line" valign="top" style="padding:18px 20px 16px 20px;${top}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding:0 10px 4px 0;"><p class="c-ink" style="${F}margin:0;font-size:17px;line-height:24px;font-weight:800;color:#0F172A;">${escapeHtml(t.name)}</p></td>
<td valign="middle" style="padding:0 0 4px 0;">${pill(t.status)}</td></tr></table>
${metaLine ? `<p class="c-muted" style="${F}margin:2px 0 0 0;font-size:14px;line-height:20px;color:#475569;">${metaLine}</p>` : ''}
<p class="c-ink" style="${F}margin:6px 0 0 0;font-size:15px;line-height:22px;color:#0F172A;">${escapeHtml(t.rowLine)}</p></td>
<td class="stack stack-pad bd-line" valign="top" align="right" width="140" style="padding:18px 20px 16px 0;${top}">
${metrics([[`<span class="${TONE[toneOf(t.dayPct)].cls}" style="${F}font-size:20px;line-height:26px;font-weight:800;color:${TONE[toneOf(t.dayPct)].color};white-space:nowrap;">${formatPct(t.dayPct, {html: true})}</span>`, 6], [spark(t.sparkUrl, t.name, t.weekPct, t.dayPct), 6], [weekTxt(t.weekPct), 0]])}</td></tr>`;
}

function autoSection(view) {
  const autos = view.autoActions.filter(a => a.ticker);
  if (!autos.length && !view.pausaActions.length) return '';
  const items = [
    ...autos.map(a => autoActionLines(a)).map(l => `<p class="c-ink" style="${F}margin:0 0 2px 0;font-size:15px;line-height:22px;font-weight:700;color:#0F172A;">${escapeHtml(l.title)}</p>
<p class="c-muted" style="${F}margin:0;font-size:14px;line-height:20px;color:#475569;">${escapeHtml(l.thesis)}</p>
<p class="c-ink" style="${F}margin:2px 0 12px 0;font-size:15px;line-height:22px;color:#0F172A;">${escapeHtml(l.reason)}</p>`),
    ...view.pausaActions.map(p => `<p class="c-ink" style="${F}margin:0 0 2px 0;font-size:15px;line-height:22px;font-weight:700;color:#0F172A;">Pausa · ${escapeHtml(p.thesisName || 'Tesis')}</p>
<p class="c-ink" style="${F}margin:0 0 12px 0;font-size:15px;line-height:22px;color:#0F172A;">${escapeHtml(p.reasonPlain || 'Automático se pausó.')}</p>`),
  ].join('\n');
  return `<tr><td class="px" style="padding:0 32px 8px 32px;">
<h2 class="c-ink" style="${F}margin:0 0 12px 0;font-size:20px;line-height:28px;font-weight:800;letter-spacing:-0.01em;color:#0F172A;">Qué hizo Automático hoy</h2></td></tr>
<tr><td class="px" style="padding:0 32px 24px 32px;">
<table role="presentation" class="bg-surface bd-line" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;"><tr><td style="padding:16px 20px 4px 20px;">
${items}
</td></tr></table></td></tr>`;
}

export function buildSupertakeHtml(view) {
  const app = view.appUrl;
  const h = [];
  h.push(`<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(view.subject)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>${SUPERTAKE_STYLES}</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background-color:#E2E8F0;${F}">
<div class="preheader">${escapeHtml(view.preheader)}</div>
<table role="presentation" class="bg-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#E2E8F0" style="background-color:#E2E8F0;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container bg-paper" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#F8FAFC" style="width:600px;max-width:600px;background-color:#F8FAFC;border-radius:16px;overflow:hidden;">`);
  h.push(header());
  h.push(hero(view));
  h.push(glance(view));
  h.push(`<tr><td class="px" style="padding:0 32px 8px 32px;">
<h2 class="c-ink" style="${F}margin:0;font-size:20px;line-height:28px;font-weight:800;letter-spacing:-0.01em;color:#0F172A;">Cambios de estado</h2>
<p class="c-muted" style="${F}margin:2px 0 12px 0;font-size:14px;line-height:20px;color:#475569;">Solo las tesis que cambiaron hoy, y por qué.</p></td></tr>`);
  if (!view.changes.length) h.push(emptyChanges(view));
  for (const t of view.changes) h.push(changeCard(t));
  if (view.moreChanges > 0) h.push(moreLink(`y ${view.moreChanges} ${view.moreChanges === 1 ? 'cambio más' : 'cambios más'} →`, `${app}#/`));
  h.push(`<tr><td class="px" style="padding:16px 32px 8px 32px;">
<h2 class="c-ink" style="${F}margin:0;font-size:20px;line-height:28px;font-weight:800;letter-spacing:-0.01em;color:#0F172A;">Todas tus tesis</h2>
<p class="c-muted" style="${F}margin:2px 0 12px 0;font-size:14px;line-height:20px;color:#475569;">Ordenadas por cuánto movieron tu cartera hoy.</p></td></tr>
<tr><td class="px" style="padding:0 32px 24px 32px;">
<table role="presentation" class="bg-surface bd-line" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;">`);
  view.rows.forEach((t, i) => h.push(thesisRow(t, i, view)));
  h.push('</table></td></tr>');
  if (view.moreRows > 0) h.push(moreLink(`y ${view.moreRows} tesis más en el panorama completo →`, `${app}#/`));
  h.push(autoSection(view));
  h.push(`<tr><td class="px" align="left" style="padding:0 32px 28px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="bg-cta" bgcolor="#0F172A" style="background-color:#0F172A;border-radius:8px;">
<a class="c-on-cta" href="${app}#/" target="_blank" style="${F}display:inline-block;padding:14px 28px;font-size:16px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">Ver el panorama completo</a></td></tr></table></td></tr>
<tr><td class="px" style="padding:0 32px 28px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="hair" height="1" bgcolor="#E2E8F0" style="height:1px;line-height:1px;font-size:1px;background-color:#E2E8F0;">&nbsp;</td></tr></table>
<p class="c-muted" style="${F}margin:16px 0 0 0;font-size:14px;line-height:21px;color:#475569;">${FOOTER.linesHtmlLead} ${FOOTER.cadence} <a class="c-accent" href="${app}#/cuenta/email" target="_blank" style="color:#2563EB;text-decoration:underline;">Ajustes</a>.</p>
<p class="c-muted" style="${F}margin:12px 0 0 0;font-size:14px;line-height:21px;color:#475569;">${FOOTER.disclaimer}</p>
<p style="${F}margin:12px 0 0 0;font-size:14px;line-height:21px;"><a class="c-accent" href="${app}#/cuenta/email" target="_blank" style="color:#2563EB;text-decoration:underline;">${FOOTER.unsubscribe}</a></p>
<p class="c-muted" style="${F}margin:12px 0 0 0;font-size:14px;line-height:21px;color:#475569;">${FOOTER.copyright}</p>
</td></tr></table></td></tr></table></body></html>`);
  return h.join('\n');
}
