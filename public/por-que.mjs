import {money, pct1, pctInt, pp} from './format.mjs';
import {icon} from './icons.js';
import {holdingDerived, relatedNews} from './portfolio.mjs';
import {artTime, artWhen} from './timeline.mjs';
import {normalizeVerdictText} from './copy.mjs';
import {tickerIdHtml} from './ticker-logo.mjs';

const chipLabel = {ok: 'Dentro de la regla', cap: 'Supera el tope', drift: 'Desvío sobre umbral', draft: 'Se evalúa al activar'};
const chipClass = {ok: 'ok', cap: 'warn', drift: 'warn', draft: 'muted'};

export function ruleChip(kind) {
  const labels = {ok: 'Dentro', cap: 'Sobre tope', drift: 'Revisar', draft: '—'};
  const cls = {ok: 'track', cap: 'review', drift: 'watch', draft: 'muted'};
  const label = labels[kind] || kind;
  if (kind === 'draft') return `<span class="phase">${label}</span>`;
  return `<span class="estado ${cls[kind] || 'muted'}">${label}</span>`;
}

function lastChequeoFor(t, ticker, events) {
  const list = (t.events || []).filter(e => e.type === 'chequeo');
  const specific = list.find(e => e.ruleCite?.includes(ticker));
  if (specific) return specific;
  return list[0];
}

export function porQueKey(scope, key) {
  return `${location.hash}|${scope}|${key}`;
}

export function porQueRow(variant, ctx) {
  const {esc, t, h, proposal, takeId, diffChip = '', isNew = false, expanded} = ctx;
  const d = variant === 'draft' || !t?.invested ? null : holdingDerived(t, h);
  const discloseKey = porQueKey(variant, h.ticker);
  const open = expanded?.has(discloseKey);
  const cap = t?.settings?.cap ?? proposal?.settings?.cap ?? 25;
  const drift = t?.settings?.drift ?? 5;
  const lo = Math.max(0, h.weight - drift);
  const hi = Math.min(cap, h.weight + drift);

  let summaryRight = '';
  if (variant === 'active' && d) {
    summaryRight = `<span class="pq-weight">${pct1(d.actual)} / obj. ${pctInt(h.weight)}</span><span class="pq-val">${money(d.value)}</span>${ruleChip(d.ruleChip)}`;
  } else {
    summaryRight = `<span class="pq-weight">${pctInt(h.weight)}</span>${diffChip}`;
  }

  const panel = variant === 'event' ? '' : `
    <div class="porque-panel" role="region" aria-hidden="${open ? 'false' : 'true'}">
      <dl class="porque-dl">
        <dt>Por qué está</dt><dd>${esc(h.reason || 'Sin explicación guardada para esta posición.')}</dd>
        <dt>Tesis</dt><dd>${variant === 'draft' ? esc((proposal?.thesis || '').slice(0, 140)) : `De tu tesis «${esc(t.title)}»: ${esc(t.thesis.slice(0, 140))}… <a class="nav-link" href="#/take/${takeId}/idea">Ver la idea →</a>`}</dd>
        <dt>Regla numérica</dt><dd class="rule-block">${variant === 'draft' ? `Tope ${pctInt(cap)} · desvío ±${drift} pp (se evalúan cuando actives).` : `Tope por posición ${pctInt(cap)} · desvío permitido ±${drift} pp · banda ${pctInt(lo)}–${pctInt(hi)}${d ? `<div class="rule-cite">Hoy: ${pct1(d.actual)} vs objetivo ${pctInt(h.weight)} → desvío ${pp(d.dev)}</div>${ruleChip(d.ruleChip)}` : ''}`}</dd>
        <dt>Peso</dt><dd>${variant === 'draft' || !t?.invested ? `Objetivo ${pctInt(h.weight)} · El monto en ARS se calcula al activar, con el monto que elijas.` : `Objetivo ${pctInt(h.weight)} · Actual ${pct1(d.actual)} · ${money(d.value)} · ${h.units} u. × ${money(h.price)} (${ctx.quoteLabel ? esc(ctx.quoteLabel(h.ticker)) : 'precio demorado'})`}</dd>
        <dt>Riesgo</dt><dd>${riskLines(ctx, d)}</dd>
        <dt>Qué la rompe</dt><dd>${breakLine(ctx)}</dd>
        ${variant !== 'draft' ? `<dt>Noticias relacionadas</dt><dd>${newsLines(ctx)}</dd><dt>Último chequeo</dt><dd>${checkLine(ctx, d)}</dd>` : ''}
      </dl>
      ${variant === 'active' ? `<a class="nav-link" href="#/take/${takeId}/news">Ver en la línea de tiempo →</a>` : ''}
    </div>`;

  if (variant === 'event') return '';

  return `<div class="disclosure-row ${open ? 'expanded' : ''}">
    <button type="button" class="disclosure-btn" data-action="disclose" data-scope="${esc(variant)}" data-key="${esc(h.ticker)}" aria-expanded="${open}">
      ${tickerIdHtml(h.ticker, h.name)}<span class="pq-name">${esc(h.name || '')}</span>
      ${summaryRight}
      <span class="chev" aria-hidden="true">${icon('chevron')}</span>
    </button>${panel}
  </div>`;
}

function riskLines(ctx, d) {
  const {t, h, esc, overlaps = []} = ctx;
  const lines = [];
  if (d && d.margin < 5 && d.margin >= 0) lines.push(`A ${pp(d.margin)} del tope de ${d.cap}%.`);
  if (d && h.entryPrice) {
    const sign = d.pnl >= 0 ? '+' : '';
    lines.push(`${sign}${pct1(d.pnl)} vs. precio de entrada.`);
  }
  for (const o of overlaps.filter(x => x.ticker === h.ticker)) {
    lines.push(`También está en «${esc(o.title)}» (${pctInt(o.weight)}). Exposición total: ${pctInt(o.sum)}.`);
  }
  if (h.risk) lines.push(esc(h.risk));
  if (!lines.length) {
    return !ctx.t?.invested ? 'Sin un riesgo específico cargado para esta posición. La regla de concentración de arriba es el control activo.' : 'Sin un riesgo específico cargado para esta posición.';
  }
  return lines.join(' ');
}

function variantDraft(ctx) {
  return !ctx.t?.invested;
}

function breakLine(ctx) {
  const {h, t, proposal, esc} = ctx;
  if (h.break) return esc(h.break);
  const inv = t?.invalidation || proposal?.invalidation || '';
  return `De la tesis (no hay una condición específica para ${esc(h.ticker)}): ${esc(inv)}`;
}

function newsLines(ctx) {
  const {t, h, esc, reviews = []} = ctx;
  if (!t.newsCheckedAt) return 'La primera revisión de noticias está pendiente.';
  const rel = relatedNews(reviews, t.id, h);
  if (!rel.length) return `Ninguna revisión guardada menciona a ${esc(h.ticker)} todavía.`;
  return rel.map(e => `<div class="pq-news"><strong>${esc(e.title)}</strong><p>${esc(e.fact)}</p><p class="small muted">Para tu tesis: ${esc(e.interpretation)}</p></div>`).join('') + `<a class="nav-link" href="#/take/${t.id}/news">Ver todas en Novedades →</a>`;
}

function checkLine(ctx, d) {
  const {t, h} = ctx;
  const ev = lastChequeoFor(t, h.ticker);
  if (!ev) return 'Todavía no hubo chequeos.';
  if (ev.ruleCite?.includes(h.ticker)) {
    return `${artTime(ev.at)} · ${ev.ruleCite} · ${normalizeVerdictText(ev.verdictText) || ''}`;
  }
  return `${artTime(ev.at)} · sin alertas para ${h.ticker}`;
}

export function eventPorQue(item, ctx) {
  const {esc, expanded, takeId} = ctx;
  const key = item.key || item.eventId || `${item.type}-${item.at}`;
  const open = expanded?.has(porQueKey('event', key));
  return `<div class="disclosure-row timeline-disclosure ${open ? 'expanded' : ''}">
    <button type="button" class="disclosure-btn" data-action="disclose" data-scope="event" data-key="${esc(key)}" aria-expanded="${open}">
      <span class="timeline-card-head"><time class="timeline-when">${esc(artWhen(item.at))}</time><span class="timeline-type">${esc(item.title)}</span></span>
      <span class="timeline-snippet">${esc(item.ruleCite || item.body || '')}</span>
      ${item.verdictText ? `<span class="timeline-verdict ${item.verdict === 'none' ? 'ok' : 'action'}">${esc(normalizeVerdictText(item.verdictText))}</span>` : ''}
      ${ctx.isNew ? '<span class="chip new">Nuevo</span>' : ''}
      <span class="chev">›</span>
    </button>
    <div class="porque-panel" role="region" ${open ? '' : 'hidden'}>
      ${item.ruleCite ? `<p class="rule-cite">Regla (La idea): ${esc(item.ruleCite)}</p>` : ''}
      <p>${esc(item.body)}</p>
      ${item.evidence?.length ? item.evidence.map(e => `<section class="evidence"><h4>${esc(e.title)}</h4><p><strong>Hecho:</strong> ${esc(e.fact)}</p><p><strong>Para tu tesis:</strong> ${esc(e.interpretation)}</p>${e.uncertainty ? `<p><strong>Incertidumbre:</strong> ${esc(e.uncertainty)}</p>` : ''}${e.affected ? `<p><strong>Afecta:</strong> ${esc(e.affected)}</p>` : ''}${(e.sourceIds || []).map(sid => item.sources?.find(s => s.id === sid)).filter(Boolean).map(source => `<a class="source-link" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a>`).join(' ')}</section>`).join('') : ''}
      <a class="nav-link" href="#/take/${takeId}/positions">Revisá los pesos en Posiciones →</a>
    </div>
  </div>`;
}
