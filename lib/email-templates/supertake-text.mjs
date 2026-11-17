/**
 * Texto plano del digest «Cierre del día» (paridad con supertake-html.mjs, SoT §8).
 * Sparkline → «semana {%}», pill → [Estado], explicación con «| », links con URL completa.
 */

import {
  STATUS_COPY, FOOTER, formatPct, formatEyebrowDate, heroLabel, changesPhrase,
  leaderParts, rowMetricText, autoActionLines,
} from './supertake-copy.mjs';

export function buildSupertakeText(view) {
  const L = [];
  const day = view.portfolio.dayPct;
  L.push(`CIERRE DEL DÍA · ${formatEyebrowDate(view.date).toUpperCase()}`);
  L.push(`Resultado total del día · ${heroLabel(day)}`);
  L.push(`Tu cartera cerró ${formatPct(day)} hoy`);
  L.push('El mercado cerró. Así les fue a tus tesis.');
  L.push('');
  if (Number.isFinite(view.portfolio.weekPct)) L.push(`Tu cartera en la semana: ${formatPct(view.portfolio.weekPct)}`);
  L.push(`Hoy: ${view.upCount} de ${view.thesesCount} tesis en alza · ${changesPhrase(view.changesCount)}`);
  L.push('');
  L.push('CAMBIOS DE ESTADO');
  L.push('Solo las tesis que cambiaron hoy, y por qué.');
  L.push('');
  if (view.changes.length === 0) {
    L.push('Sin cambios de estado hoy');
    L.push(`Tus ${view.thesesCount} tesis siguen como ayer. Abajo está cómo le fue a cada una.`);
    L.push('');
  }
  for (const t of view.changes) {
    L.push(t.name);
    L.push(`Pasó de ${STATUS_COPY[t.statusPrev].label} a ${STATUS_COPY[t.status].label}`);
    const week = Number.isFinite(t.weekPct) ? ` · semana ${formatPct(t.weekPct)}` : '';
    L.push(`Dinero de práctica · hoy ${formatPct(t.dayPct)}${week}`);
    L.push(`| ${t.explanation}`);
    L.push(`Ver qué cambió: ${t.link}`);
    L.push('');
  }
  if (view.moreChanges > 0) {
    L.push(`y ${view.moreChanges} ${view.moreChanges === 1 ? 'cambio más' : 'cambios más'}: ${view.appUrl}#/`);
    L.push('');
  }
  L.push('TODAS TUS TESIS');
  L.push('Ordenadas por cuánto movieron tu cartera hoy.');
  L.push('');
  for (const t of view.rows) {
    const week = Number.isFinite(t.weekPct) ? ` · semana ${formatPct(t.weekPct)}` : '';
    L.push(`${t.name} [${STATUS_COPY[t.status].label}] — hoy ${formatPct(t.dayPct)}${week}`);
    const lead = leaderParts(t);
    const metric = rowMetricText(t, view.rowMetric);
    const leadText = lead
      ? (lead.still ? `${lead.ticker} ${formatPct(0)} · sin movimiento hoy` : `${lead.ticker} ${formatPct(lead.dayPct)} lideró`)
      : null;
    const line = [leadText, metric].filter(Boolean).join(' · ');
    if (line) L.push(line);
    L.push(t.rowLine);
    L.push('');
  }
  if (view.moreRows > 0) {
    L.push(`y ${view.moreRows} tesis más en el panorama completo: ${view.appUrl}#/`);
    L.push('');
  }
  if (view.autoActions.length || view.pausaActions.length) {
    L.push('QUÉ HIZO AUTOMÁTICO HOY');
    L.push('');
    for (const a of view.autoActions.filter(x => x.ticker)) {
      const lines = autoActionLines(a);
      L.push(lines.title, lines.thesis, lines.reason, '');
    }
    for (const p of view.pausaActions) {
      L.push(`Pausa · ${p.thesisName || 'Tesis'}`, p.reasonPlain || 'Automático se pausó.', '');
    }
  }
  L.push(`Ver el panorama completo: ${view.appUrl}#/`);
  L.push('');
  L.push('—');
  L.push(`${FOOTER.linesTxtLead} ${FOOTER.cadence} Ajustes: ${view.appUrl}#/cuenta/email`);
  L.push('');
  L.push(FOOTER.disclaimer);
  L.push('');
  L.push(`${FOOTER.unsubscribe}: ${view.appUrl}#/cuenta/email`);
  L.push('');
  L.push(FOOTER.copyright);
  return `${L.join('\n')}\n`;
}
