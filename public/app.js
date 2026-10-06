import {icon} from './icons.js';
import {settingsView, accountView} from './integrations.js';
import {portfolioSeries} from './math.js';
import {buildTimeline, movementsToday, artTime, artClock} from './timeline.mjs';
import {money, pct1} from './format.mjs';
import {takeTotal, effectiveAttention, simulateRebalance, proposalDiff, holdingDerived} from './portfolio.mjs';
import {porQueRow, eventPorQue, porQueKey} from './por-que.mjs';
import {PRACTICE_FOOTER} from './copy.mjs';

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const DEF_SHORT = 'La Viste convierte tus ideas en carteras con dinero de práctica (ARS) y las sigue con chequeos de reglas y noticias con fuentes. No envía órdenes.';

let state = null;
let stateLoaded = false;
let refreshSeq = 0;
let lastSig = '';
let lastOkAt = null;
let knownJobs = new Set();
let busyChat = null;
let adjustChatId = null;
let filter = 'all';
let period = 'all';
/** @type {null | 'capital' | 'index'} */
let compareMode = null;
let expanded = new Set();
const prevProposal = {};
let routeBefore = '';
let jobPoller = null;
let reviewCooldownUntil = 0;
let reviewTickTimer = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pct = n => (n >= 0 ? '+' : '') + n.toFixed(1).replace('.', ',') + '%';
const date = s => s ? new Date(s).toLocaleString('es-AR', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : 'Pendiente';
const total = t => takeTotal(t);
const gain = t => t.invested ? (total(t) / t.invested - 1) * 100 : 0;
const active = () => state.takes.filter(t => t.phase === 'active' || t.phase === 'archived');
const attentionLabels = {track: 'En camino', watch: 'Vigilando', review: 'Revisar'};
const phaseLabels = {draft: 'Borrador', archived: 'Archivada'};
const attentionPill = a => `<span class="status attention ${esc(a || 'track')}">${esc(attentionLabels[a] || a)}</span>`;
const phaseChip = p => `<span class="status phase ${esc(p)}">${esc(phaseLabels[p] || p)}</span>`;

function timelineFor(t) {
  return buildTimeline(t, (state.reviews || []).filter(r => r.takeId === t.id), (state.jobs || []).filter(j => j.takeId === t.id));
}

function statusForTake(t) {
  if (t.phase === 'draft') return phaseChip('draft');
  if (t.phase === 'archived') return phaseChip('archived');
  const {items} = timelineFor(t);
  const eff = effectiveAttention(t, items);
  return attentionPill(eff.attention);
}

function reasonForTake(t) {
  const {items} = timelineFor(t);
  return effectiveAttention(t, items).reason || t.attentionReason || t.coverageDetail || 'Seguimiento en curso.';
}

async function api(path, body, key) {
  const r = await fetch('/api' + path, {method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : {'Content-Type': 'application/json', 'Idempotency-Key': key || crypto.randomUUID()}, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401 && path !== '/login') login();
    throw new Error(data.error || 'No se pudo completar.');
  }
  return data;
}

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.style.display = 'none', 5000);
}

function route() {
  const parts = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  return parts;
}

function signature(s) {
  return JSON.stringify({
    takes: s.takes.map(t => [t.id, t.version, t.events?.[0]?.id, t.checkedAt, t.newsCheckedAt, t.attention, t.coverage]),
    jobs: (s.jobs || []).map(j => [j.id, j.status]),
    reviews: s.reviews?.[0]?.id,
    chats: s.chats.map(c => [c.id, c.messages.length]),
    config: [s.config?.aiConfigured, s.config?.iolConfigured, s.config?.iolEnabled, s.config?.openaiStatus, s.config?.model],
    quotes: s.quotes?.asOf,
  });
}

function showRefreshBar(on) {
  let bar = document.querySelector('.refresh-bar');
  if (!bar && on) {
    bar = document.createElement('div');
    bar.className = 'refresh-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Actualizando');
    document.querySelector('.topbar')?.append(bar);
  }
  if (bar) bar.style.display = on ? 'block' : 'none';
}

function snapshotInputs() {
  const snap = new Map();
  document.querySelectorAll('#app textarea, #app input:not([type=checkbox]):not([type=radio])').forEach(el => {
    if (el.id || el.name) snap.set(el.id || el.name, {value: el.value, sel: el.selectionStart});
  });
  return snap;
}

function restoreInputs(snap) {
  for (const [id, {value, sel}] of snap) {
    const el = document.querySelector(`#${CSS.escape(id)}`) || document.querySelector(`[name="${id}"]`);
    if (el && el.value !== value) {
      el.value = value;
      if (sel != null) try { el.setSelectionRange(sel, sel); } catch {}
    }
  }
}

function hasDirtyInput() {
  return [...document.querySelectorAll('#app textarea, #app input')].some(el => el === document.activeElement || (el.value && el.value.trim()));
}

function onLivePage() {
  const [page] = route();
  return !page || page === 'take' || page === 'activity' || page === 'takes';
}

function resetRouteScopedState() {
  const [page, id] = route();
  const prev = routeBefore.split('|');
  if (prev[0] === 'chat' && (page !== 'chat' || prev[1] !== id)) adjustChatId = null;
}

function hhmm(d) {
  return d ? new Date(d).toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit'}) : '—';
}

async function revalidate({quiet = true} = {}) {
  const seq = ++refreshSeq;
  const t = setTimeout(() => showRefreshBar(true), 400);
  try {
    const next = await api('/state');
    if (seq !== refreshSeq) return;
    const sig = signature(next);
    lastOkAt = new Date();
    const newJob = (next.jobs || []).some(j => ['queued', 'running'].includes(j.status) && !knownJobs.has(j.id));
    state = next;
    knownJobs = new Set((next.jobs || []).map(j => j.id));
    if (sig !== lastSig && stateLoaded) {
      lastSig = sig;
      const snap = snapshotInputs();
      render();
      restoreInputs(snap);
      restoreDisclosure();
    } else if (sig !== lastSig) {
      lastSig = sig;
    }
    if (newJob) ensureJobPoller();
  } catch (e) {
    if (!quiet) toast(`No pudimos actualizar. Mostramos lo último que vimos (${hhmm(lastOkAt)}).`);
    if (e.message?.includes('sesión') || e.message?.includes('Iniciá')) login();
  } finally {
    clearTimeout(t);
    showRefreshBar(false);
  }
}

async function refresh() {
  return revalidate({quiet: false});
}

function ensureJobPoller() {
  if (jobPoller) return;
  jobPoller = setInterval(async () => {
    const running = (state.jobs || []).some(j => ['queued', 'running'].includes(j.status));
    if (!running) {
      clearInterval(jobPoller);
      jobPoller = null;
      return;
    }
    if (!document.hidden && !modal.open) await revalidate({quiet: true});
  }, 5000);
}

function go(path) {
  if (location.hash === '#' + path) {
    render();
    revalidate({quiet: false});
  } else location.hash = path;
  window.scrollTo(0, 0);
}

function restoreDisclosure() {
  document.querySelectorAll('[data-action="disclose"]').forEach(btn => {
    const key = porQueKey(btn.dataset.scope, btn.dataset.key);
    const open = expanded.has(key);
    btn.setAttribute('aria-expanded', open);
    const panel = btn.parentElement?.querySelector('.porque-panel');
    if (panel) panel.hidden = !open;
    btn.parentElement?.classList.toggle('expanded', open);
  });
}

function focusH1() {
  const h1 = document.querySelector('.main h1, .main .page-heading h1');
  if (h1) {
    h1.setAttribute('tabindex', '-1');
    h1.focus({preventScroll: true});
  }
}

function practiceFooter() {
  return `<p class="practice-footer" role="contentinfo">${PRACTICE_FOOTER}</p>`;
}

function homeLoadingView() {
  return `<div class="home-loading skeleton" aria-busy="true" aria-label="Cargando tu observatorio">
    <p class="eyebrow">Tu observatorio</p>
    <div class="sk lg"></div>
    <div class="sk" style="width:80%"></div>
    <div class="ahora-strip skeleton-panel"><div class="sk lg"></div><div class="sk"></div><div class="sk" style="width:45%"></div></div>
  </div>`;
}

function shell(content) {
  const [page, id] = route();
  const amount = active().reduce((s, t) => s + total(t), 0);
  return `<header class="topbar"><div class="brand-group"><button class="iconbtn mobile-menu" data-action="menu" aria-label="Abrir navegación">${icon('menu')}</button><a class="brand" href="#/" aria-label="La Viste, inicio">la viste<span class="brand-dot">.</span></a><span class="pill">Terminal privada</span></div><div class="topmeta"><span class="muted">Práctica · ARS</span><span class="topvalue">${money(amount)}</span><a class="iconbtn" href="#/activity" aria-label="Ver actividad">${icon('bell')}</a></div></header><aside class="sidebar" id="sidebar"><a class="newtake" href="#/new">${icon('plus')} Nueva tesis</a><nav class="nav" aria-label="Principal">${[['', 'home', 'Inicio'], ['takes', 'chart', 'Mis tesis'], ['chats', 'chat', 'Conversaciones']].map(([p, i, label]) => `<a class="navlink ${page === p || (!page && !p) ? 'active' : ''}" href="#/${p}">${icon(i)}${label}</a>`).join('')}</nav><div class="side-label"><span class="eyebrow">Tus ideas</span><span class="small muted">${state.takes.length}</span></div><div class="side-takes">${state.takes.map(t => `<a class="side-take ${id === t.id ? 'selected' : ''}" href="#/take/${t.id}"><span class="side-take-title">${esc(t.title)}</span><span class="side-take-meta">${statusForTake(t)}<span class="${gain(t) < 0 ? 'negative' : 'positive'}">${t.invested > 0 ? pct(gain(t)) : '—'}</span></span></a>`).join('')}</div><a class="navlink ${page === 'settings' ? 'active' : ''}" href="#/settings">${icon('settings')} Configuración</a><a class="navlink" href="/">↗ Conocé La Viste</a><div class="side-bottom"><div class="row"><div class="avatar">D</div><div><div class="small">Mi espacio</div><div class="small muted">Personal · Cartera de práctica</div></div></div></div></aside><main class="main"><div class="content">${content}</div>${practiceFooter()}</main>`;
}

function quoteTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires'});
}

function quoteMetaNote() {
  const qs = state.quotes || {};
  if (qs.market === 'demo') return 'precios de ejemplo (sin cotización en vivo)';
  if (!qs.asOf) return 'sin cotización';
  const suffix = !qs.marketOpen ? ' · mercado cerrado' : (qs.stale ? ' · desactualizado' : '');
  return `precio demorado · ${quoteTime(qs.asOf)}${suffix}`;
}

function tickerQuoteLabel(ticker) {
  const row = state.quotes?.quotes?.find(q => q.ticker === ticker);
  if (!row?.available) return 'sin cotización';
  if (state.quotes?.market === 'demo') return 'precio de ejemplo';
  const asOf = row.asOf || state.quotes?.asOf;
  const suffix = !state.quotes?.marketOpen ? ' · mercado cerrado' : (row.stale ? ' · desactualizado' : '');
  return `precio demorado · ${quoteTime(asOf)}${suffix}`;
}

function indexCompareReady(t, history) {
  if (!state.quotes?.indexCompareAvailable) return false;
  const h = history || t?.history;
  if (!h?.some(p => p.indexRecorded)) return false;
  if (t && !t.realPricesAt) return false;
  return true;
}

function chart(history, label = 'Evolución de la cartera', take = null) {
  let h = history;
  if (period === 'week') {
    const cutoff = Date.now() - 7 * 86400000;
    h = h.filter(p => new Date(p.at).getTime() >= cutoff);
  }
  if (compareMode === 'index') h = h.filter(p => p.indexRecorded && p.index != null);
  if (!h.length) return '<div class="empty">Todavía no hay registros en este período.</div>';
  if (compareMode === 'index' && take && !indexCompareReady(take, h)) {
    return '<div class="empty small">La comparación empieza con el próximo precio de índice registrado.</div>';
  }
  if (h.length === 1) return `<div class="empty small">La cartera empieza en ${money(h[0].value)}. Todavía no hay variaciones registradas. ${esc(quoteMetaNote())}.</div>`;
  const compareKey = compareMode === 'index' ? 'index' : 'benchmark';
  const vals = h.flatMap(p => compareMode ? [p.value, p[compareKey] ?? p.benchmark] : [p.value]);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * .25, hi * .002);
  lo -= pad;
  hi += pad;
  const w = Math.max(280, Math.min(1100, window.innerWidth - (window.innerWidth <= 640 ? 76 : window.innerWidth <= 1100 ? 318 : 410)));
  const height = 225;
  const left = 53;
  const right = 10;
  const top = 14;
  const bottom = 32;
  const x = i => left + i / (h.length - 1) * (w - left - right);
  const y = v => top + (hi - v) / (hi - lo) * (height - top - bottom);
  const line = key => h.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y((p[key] ?? p.benchmark)).toFixed(2)}`).join(' ');
  const base = h[0].value;
  const area = line('value') + ` L${x(h.length - 1)},${height - bottom} L${left},${height - bottom} Z`;
  const compareLine = compareMode ? line(compareKey) : '';
  return `<svg class="chart" viewBox="0 0 ${w} ${height}" role="img" aria-label="${esc(label)}"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#B54E1C" stop-opacity=".12"/><stop offset="100%" stop-color="#B54E1C" stop-opacity="0"/></linearGradient></defs>${[0, 1, 2, 3].map(i => { const v = lo + (hi - lo) * i / 3; const Y = y(v); return `<path d="M${left} ${Y}H${w - right}" stroke="#D9D0C4" stroke-dasharray="3 4"/><text x="0" y="${Y + 4}">${pct((v / base - 1) * 100)}</text>`; }).join('')}${compareLine ? `<path d="${compareLine}" fill="none" stroke="#5E574F" stroke-width="1.5" stroke-dasharray="4 5"/>` : ''}<path d="${area}" fill="url(#chart-fill)"/><path d="${line('value')}" fill="none" stroke="#8B3A12" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
}

function chartControls(take = null) {
  const indexOk = state.quotes?.indexCompareAvailable && (!take || indexCompareReady(take, take.history));
  const indexLabel = take?.benchmarkLabel ? `vs Índice (${take.benchmarkLabel})` : 'vs Índice';
  const compareLabel = compareMode === 'index' ? indexLabel : 'Capital aportado';
  const indexBtn = indexOk ? `<button class="period ${compareMode === 'index' ? 'active' : ''}" data-action="benchmark" data-mode="index" aria-pressed="${compareMode === 'index'}">${esc(indexLabel)}</button>` : '';
  return `<div class="periods"><button class="period ${period === 'week' ? 'active' : ''}" data-action="period" data-value="week">1S</button><button class="period ${period === 'all' ? 'active' : ''}" data-action="period" data-value="all">Todo</button><button class="period ${compareMode === 'capital' ? 'active' : ''}" data-action="benchmark" data-mode="capital" aria-pressed="${compareMode === 'capital'}">Capital aportado</button>${indexBtn}</div>`;
}

function indexDelta(t) {
  if (!t.benchmarkLabel) return '';
  return `<p class="demo-note">Comparación de referencia: ${esc(t.benchmarkLabel)}. En el gráfico, usá «${esc(t.benchmarkLabel.includes('Merval') ? 'vs Índice (Índice Merval)' : `vs Índice (${t.benchmarkLabel})`)}».</p>`;
}

function attentionCounts() {
  const counts = {track: 0, watch: 0, review: 0, draft: 0};
  for (const t of state.takes) {
    if (t.phase === 'draft') counts.draft++;
    else if (t.phase === 'active') {
      const {items} = timelineFor(t);
      counts[effectiveAttention(t, items).attention]++;
    }
  }
  return counts;
}

function ahoraStrip() {
  const ts = state.takes.filter(t => t.phase === 'active');
  const amount = ts.reduce((s, t) => s + total(t), 0);
  const invested = ts.reduce((s, t) => s + t.invested, 0);
  const g = invested ? (amount / invested - 1) * 100 : 0;
  const c = attentionCounts();
  const checks = ts.filter(t => t.checkedAt).map(t => ({at: t.checkedAt, title: t.title}));
  const next = ts.filter(t => t.nextCheckAt).map(t => ({at: t.nextCheckAt, title: t.title}));
  const last = checks.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const nxt = next.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  const moves = movementsToday(state.takes, state.reviews || [], state.jobs || []);
  const pillRow = [['track', 'En camino'], ['watch', 'Vigilando'], ['review', 'Revisar']]
    .map(([k, l]) => `<span class="attention-inline-pill ${k}${c[k] ? '' : ' muted'}">${l} · ${c[k]}</span>`).join('');
  return `<section class="ahora-strip" aria-label="Ahora en tu espacio"><div class="ahora-value"><div class="metric-label">Dinero de práctica · ARS</div><div class="big-number">${money(amount)}</div><div class="summary-gain ${g < 0 ? 'negative' : 'positive'}">${pct(g)} <span class="muted">desde el inicio</span></div></div><div class="ahora-pills" role="list" aria-label="Tesis activas por atención">${pillRow}</div><div class="ahora-meta"><div><span class="eyebrow">Último chequeo</span><p>${last ? `${artTime(last.at)} · ${esc(last.title)}` : 'Todavía no hubo chequeos.'}</p></div><div><span class="eyebrow">Próximo chequeo</span><p>${nxt ? `${artTime(nxt.at)} · ${esc(nxt.title)}` : 'Sin chequeos programados.'}</p></div><div><span class="eyebrow">Hoy</span><p>${moves.length} movimientos</p></div></div></section>`;
}

function movementRows(moves) {
  if (!moves.length) return '<p class="empty small">Hoy todavía no hubo movimientos.</p>';
  return `<ul class="movement-list">${moves.map(m => {
    const cta = m.item.verdictText
      ? `<span class="move-cta verdict-chip ${m.item.verdict === 'none' ? 'ok' : 'action'}">${esc(m.item.verdictText === 'No necesitás hacer nada' ? 'No necesitás hacer nada' : 'Acción sugerida')} →</span>`
      : '';
    const detail = [m.takeTitle, (m.item.ruleCite || m.item.body || '').replace(/\s+/g, ' ').trim()].filter(Boolean).join(' · ');
    return `<li class="movement-item"><a class="movement-row" href="#/take/${m.takeId}/news/${m.item.key}"><span class="move-time">${esc(artClock(m.at))}</span><div class="move-main"><span class="move-type">${esc(m.item.title)}</span><span class="move-detail">${esc(detail)}</span></div>${cta}</a></li>`;
  }).join('')}</ul>`;
}

function homeEmptySeed() {
  return `<section class="home-empty card-empty"><span class="eyebrow">Espacio vacío</span><h2>La intuición es el principio.<br>No la prueba.</h2><p>Todavía no hay tesis. Empezá con una idea o abrí un ejemplo de práctica.</p><div class="form-actions"><a class="btn primary" href="#/new">Explorar mi idea</a></div></section>`;
}

function home() {
  if (!state.takes.length) {
    return `${!state.config.aiConfigured ? '<div class="pending-banner"><strong>Falta conectar OpenAI.</strong> <a class="btn" href="#/settings">Configurar OpenAI</a></div>' : ''}<div class="page-heading"><h1>Tus tesis, en perspectiva.</h1><p>${DEF_SHORT}</p></div>${homeEmptySeed()}`;
  }
  const moves = movementsToday(state.takes, state.reviews || [], state.jobs || []);
  const activeTakes = state.takes.filter(t => t.phase === 'active');
  const drafts = state.takes.filter(t => t.phase === 'draft');
  const benchLegend = compareMode ? `<span><span class="legend-line bench" aria-hidden="true"></span>${compareMode === 'index' ? 'Índice de referencia' : 'Capital aportado'}</span>` : '';
  return `${!state.config.aiConfigured ? '<div class="pending-banner"><strong>Falta conectar OpenAI.</strong> <a class="btn" href="#/settings">Configurar OpenAI</a></div>' : ''}<div class="page-heading"><div><div class="eyebrow">Tu observatorio</div><h1 tabindex="-1">Tus tesis, en perspectiva.</h1><p>${DEF_SHORT}</p></div><a href="#/new" class="btn primary">${icon('plus')} Explorar una idea</a></div>${ahoraStrip()}<section class="movimientos-dia"><div class="section-heading"><h2 class="icon-heading">${icon('radar')}Movimientos de hoy</h2></div>${movementRows(moves)}</section><div class="section-heading"><h2 class="icon-heading">${icon('layers')}Tus tesis</h2></div><div class="thesis-rows">${activeTakes.map(thesisRow).join('') || '<p class="empty small">No hay tesis activas.</p>'}</div>${drafts.length ? `<div class="section-heading"><h2>Borradores</h2></div><div class="thesis-rows">${drafts.map(thesisRow).join('')}</div>` : ''}<section class="summary chart-card"><div class="chart-card-head"><div><span class="eyebrow">Evolución agregada</span><h2 class="chart-card-title">Práctica en el tiempo</h2><p class="small muted">Todas tus tesis activas · ${esc(quoteMetaNote())}</p></div>${chartControls()}</div><div class="chart-wrap">${chart(aggregateHistory(), 'Evolución de práctica agregada')}</div><div class="chart-foot"><div class="legend"><span><span class="legend-line" aria-hidden="true"></span>Cartera de práctica</span>${benchLegend}</div><span class="demo-note">Variación % desde el inicio del período</span></div></section>`;
}

function thesisRow(t) {
  const reason = reasonForTake(t).slice(0, 110);
  const amount = t.invested > 0 ? money(total(t)) : 'Lista para activar';
  return `<a class="thesis-row" href="#/take/${t.id}"><div class="thesis-row-meta">${statusForTake(t)}<span class="thesis-row-amount">${amount}</span></div><h3>${esc(t.title)}</h3><p class="reason-line">${esc(reason)}</p></a>`;
}

function aggregateHistory() {
  return portfolioSeries(state.takes);
}

function overlapsFor(h) {
  const rows = [];
  for (const ot of active()) {
    const oh = ot.holdings.find(x => x.ticker === h.ticker);
    if (oh) rows.push({title: ot.title, weight: oh.weight, ticker: h.ticker});
  }
  const sum = rows.reduce((s, r) => s + r.weight, 0);
  return rows.map(r => ({...r, sum}));
}

function portfolioCard(proposal, chatId, overlaps) {
  const sum = proposal.holdings.reduce((s, h) => s + h.weight, 0);
  const cash = 100 - sum;
  const diff = prevProposal[chatId] ? proposalDiff(prevProposal[chatId], proposal) : {added: [], removed: [], changed: []};
  const ctxBase = {esc, proposal, expanded, takeId: null};
  return `<div class="portfolio-card" id="portfolio-card"><div class="portfolio-card-head"><div><span class="eyebrow">Propuesta</span><h2>${esc(proposal.title)}</h2><p class="portfolio-thesis">${esc(proposal.thesis)}</p><span class="pill">${esc(proposal.horizon)}</span><div class="small muted">${proposal.holdings.length} posiciones · ${cash.toFixed(0)}% efectivo</div></div><span class="pill demo-pill">DEMO</span></div>${overlaps.length ? `<div class="callout amber">Ya tenés exposición a ${esc(overlaps.join(', '))} en otras tesis.</div>` : ''}<div class="portfolio-holdings">${proposal.holdings.map(h => {
    let chip = '';
    if (diff.added.some(a => a.ticker === h.ticker)) chip = '<span class="chip added">Nueva</span>';
    const ch = diff.changed.find(c => c.ticker === h.ticker);
    if (ch) chip = `<span class="chip diff">Sube ${ch.from}→${ch.to}%</span>`;
    return porQueRow('draft', {...ctxBase, h: {...h, name: h.name || h.ticker}, t: null, diffChip: chip});
  }).join('')}${diff.removed.length ? `<p class="small muted diff-removed">Sale: ${diff.removed.map(r => `${r.ticker} (${r.weight}%)`).join(', ')}</p>` : ''}</div><p class="small muted card-helper">Se agregan a tu práctica ${proposal.holdings.length} posiciones + ${cash.toFixed(0)}% en efectivo.</p><div class="form-actions card-ctas"><button class="btn primary" type="button" data-action="activate-practice" data-id="${esc(chatId)}" ${busyChat === chatId ? 'disabled' : ''}>Activar práctica</button><button class="btn" type="button" data-action="adjust-proposal" data-id="${esc(chatId)}" aria-pressed="${adjustChatId === chatId}">Ajustar</button></div></div>`;
}

function newsQuotaExhausted() {
  const row = (state.consumption || []).find(r => r.kind === 'news');
  const used = row?.calls || 0;
  return state.config.aiConfigured && used >= (state.config.newsLimit || 10);
}

function reviewUiState(t, job, cd) {
  if (!state.config.aiConfigured) {
    return {state: 'no_ai', label: 'Revisar ahora', sub: 'Conectá OpenAI para revisar noticias. <a class="nav-link" href="#/settings">Configurar OpenAI →</a>', disabled: true};
  }
  if (t.monitoringPaused) {
    return {state: 'paused', label: 'Revisar ahora', sub: `El seguimiento está pausado. <a class="nav-link" href="#/take/${t.id}/settings">Reanudar en Preferencias →</a>`, disabled: true};
  }
  if (newsQuotaExhausted()) {
    return {state: 'quota', label: 'En espera', sub: 'Cuota diaria de noticias agotada. Se retoma después de las 21:00 ART.', disabled: true};
  }
  if (job?.status === 'queued') {
    return {state: 'waiting', label: 'En cola…', sub: 'Tu revisión está en cola. Podés seguir usando tu espacio.', disabled: true};
  }
  if (job?.status === 'running') {
    return {state: 'running', label: 'Revisando…', sub: 'Buscando fuentes y evaluando tu tesis…', disabled: true};
  }
  if (job?.status === 'completed' && job.finishedAt && Date.now() - Date.parse(job.finishedAt) < 45000) {
    return {state: 'done', label: 'Revisión lista', sub: 'Actualizamos novedades y el veredicto. Revisá la línea de tiempo.', disabled: true};
  }
  if (cd > 0) {
    const s = Math.ceil(cd / 1000);
    return {state: 'countdown', label: `Disponible en ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, sub: 'Para cuidar tu cuota, podés repetir la revisión una vez por minuto.', disabled: true};
  }
  if (job?.status === 'failed') {
    return {state: 'error', label: 'Reintentar revisión', sub: job.error || 'No se pudo completar la revisión.', disabled: false};
  }
  const sub = 'Revisá noticias y reglas con fuentes.';
  return {state: 'idle', label: 'Revisar ahora', sub, disabled: false};
}

function ensureReviewTick() {
  const cd = Math.max(0, reviewCooldownUntil - Date.now());
  if (!cd) {
    if (reviewTickTimer) {
      clearInterval(reviewTickTimer);
      reviewTickTimer = null;
    }
    return;
  }
  if (reviewTickTimer) return;
  reviewTickTimer = setInterval(() => {
    const left = Math.max(0, reviewCooldownUntil - Date.now());
    if (!left) {
      clearInterval(reviewTickTimer);
      reviewTickTimer = null;
      render();
      return;
    }
    const btn = document.querySelector('.review-control[data-review-state="countdown"] [data-action="review"]');
    if (btn) {
      const s = Math.ceil(left / 1000);
      btn.innerHTML = `${icon('clock')} Disponible en ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    } else render();
  }, 1000);
}

function reviewScheduleMeta(t) {
  const lastNews = (state.reviews || []).filter(r => r.takeId === t.id).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return `<div class="review-schedule small muted"><span>Último chequeo ${t.checkedAt ? artTime(t.checkedAt) : '—'}</span><span>Próximo ${t.nextCheckAt ? artTime(t.nextCheckAt) : '—'}</span>${lastNews ? `<span>Noticias ${artTime(lastNews.at)}</span>` : ''}</div>`;
}

function reviewControl(t) {
  if (t.phase !== 'active' || t.phase === 'archived') return '';
  const jobs = (state.jobs || []).filter(j => j.takeId === t.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const job = jobs[0];
  const cd = Math.max(0, reviewCooldownUntil - Date.now());
  const ui = reviewUiState(t, job, cd);
  ensureReviewTick();
  return `<div class="review-control review-state-${ui.state}" data-take="${t.id}" data-review-state="${ui.state}"><button class="btn" data-action="review" data-id="${t.id}" ${ui.disabled ? 'disabled' : ''}>${icon('clock')} ${ui.label}</button><p class="small muted review-status">${ui.sub}</p>${reviewScheduleMeta(t)}</div>`;
}

function suggestedAction(t) {
  const {items} = timelineFor(t);
  const chequeo = items.find(i => i.type === 'chequeo' && i.verdict === 'action');
  if (!chequeo || t.phase !== 'active') return '';
  const sim = simulateRebalance(t);
  if (!sim.lines.length || !state.config.rebalanceAvailable) {
    return `<div class="suggested-action"><p class="eyebrow">Acción sugerida</p><a class="nav-link" href="#/take/${t.id}/positions">Revisá los pesos en Posiciones →</a></div>`;
  }
  const afterPct = pct1((sim.afterCash / sim.total) * 100);
  const trades = sim.lines.map(l => esc(l.line)).join('<br>');
  return `<div class="suggested-action"><div class="verdict-box"><span class="eyebrow">Veredicto</span><p>${esc(chequeo.verdictText)}</p></div><p class="eyebrow warn">Acción sugerida · rebalance a pesos objetivo</p><p class="rebalance-trade-lines">${trades}</p><p class="small muted">Efectivo después · ${money(sim.afterCash)} (${afterPct})</p><p class="demo-note">${esc(quoteMetaNote())}. Nada cambia hasta que aprietes el botón.</p><div class="form-actions"><button class="btn primary" data-action="apply-rebalance" data-id="${t.id}">Aplicar en práctica</button><button class="btn ghost" type="button" data-action="dismiss-action">Ignorar por ahora</button><a class="nav-link" href="#/take/${t.id}/positions">Revisá los pesos en Posiciones →</a></div></div>`;
}

function timelineView(t, focusKey) {
  const reviews = (state.reviews || []).filter(r => r.takeId === t.id);
  const jobs = (state.jobs || []).filter(j => j.takeId === t.id);
  const coverage = {pending: 'Primera revisión pendiente', partial: 'Cobertura parcial', stale: 'Cobertura atrasada', interrupted: 'Seguimiento interrumpido'};
  const {items, verdict} = timelineFor(t);
  const lastSeen = localStorage.getItem('lv:lastSeen:' + t.id);
  let html = `<div class="callout coverage-callout"><strong>${coverage[t.coverage] || 'Pendiente'}</strong><p>${esc(t.coverageDetail || 'La búsqueda consulta una selección de fuentes, no todo el mercado.')}</p></div>`;
  html += suggestedAction(t);
  if (verdict) html += `<div class="verdict-box" role="status"><span class="eyebrow">Veredicto</span><p class="verdict-text">${esc(verdict.text)}</p></div>`;
  html += `<ol class="timeline timeline-disclosures">${items.map(item => {
    const isNew = lastSeen && Date.parse(item.at) > Date.parse(lastSeen);
    if (focusKey && item.key === focusKey) expanded.add(porQueKey('event', item.key));
    return eventPorQue({...item, key: item.key || item.eventId}, {esc, expanded, takeId: t.id, isNew});
  }).join('')}</ol>`;
  return html;
}

function positions(t) {
  const amount = total(t);
  const sum = t.holdings.reduce((s, h) => s + h.weight, 0);
  const ctx = {esc, t, expanded, reviews: state.reviews || [], takeId: t.id, overlaps: [], quoteLabel: tickerQuoteLabel};
  return `<div class="row" style="justify-content:space-between"><h2 style="margin:0">Posiciones</h2><span class="small muted">${t.holdings.length} posiciones</span></div><div class="buckets">${t.holdings.map((h, i) => `<div class="bucket" style="width:${h.weight}%;opacity:${1 - i * .07}" title="${esc(h.ticker)} ${h.weight}%"></div>`).join('')}<div style="width:${100 - sum}%;background:var(--lv-line)"></div></div><p class="demo-note">${esc(quoteMetaNote())}</p><div class="position-list">${t.holdings.map(h => porQueRow('active', {...ctx, h, overlaps: overlapsFor(h)})).join('')}</div><div class="cash-row info-row"><span>Efectivo disponible · ${t.invested > 0 ? pct1(t.cash / amount * 100) : (100 - sum).toFixed(1) + '%'}</span><span>${t.invested > 0 ? money(t.cash) : '—'}</span></div>`;
}

function idea(t) {
  const caps = t.holdings.map(h => {
    const d = t.invested ? holdingDerived(t, h) : null;
    return d ? `<li>${esc(h.ticker)}: ${pct1(d.actual)} (obj. ${h.weight}%) — ${d.ruleChip === 'ok' ? 'dentro de banda' : 'revisar'}</li>` : `<li>${esc(h.ticker)}: objetivo ${h.weight}%</li>`;
  }).join('');
  return `<section class="idea-section"><div class="section-heading" style="margin-top:0"><h2 class="icon-heading">${icon('file')}La idea</h2><button class="btn" data-action="versions" data-id="${t.id}">Historial</button><button class="btn" data-action="edit-idea" data-id="${t.id}">Editar</button></div><p>${esc(t.thesis)}</p><span class="pill">Horizonte: ${esc(t.horizon)}</span></section><section class="idea-section"><h2>Qué nos haría cambiar de opinión</h2><p>${esc(t.invalidation)}</p></section><section class="idea-section"><h2>Reglas</h2><ul>${caps}</ul>${indexDelta(t)}<a class="nav-link" href="#/take/${t.id}/settings">Preferencias →</a></section>`;
}

function takeSettings(t) {
  return `<form id="take-settings" data-id="${t.id}" class="settings-grid"><section class="settings-section"><h2>Cómo la seguimos</h2><label class="field">Frecuencia<select name="cadence"><option value="patient" ${t.settings.cadence === 'patient' ? 'selected' : ''}>Paciente · cada 7 días</option><option value="standard" ${t.settings.cadence === 'standard' ? 'selected' : ''}>Estándar · cada 24 horas</option><option value="manual" ${t.settings.cadence === 'manual' ? 'selected' : ''}>Solo manual</option></select></label></section><section class="settings-section"><label class="check-label"><input name="monitoringPaused" type="checkbox" ${t.monitoringPaused ? 'checked' : ''}> Pausar seguimiento</label></section><section class="settings-section"><div class="two-cols"><label class="field">Máximo por posición (%)<input class="input" name="cap" type="number" min="10" max="25" required value="${t.settings.cap}"></label><label class="field">Desvío (pp)<input class="input" name="drift" type="number" min="1" max="20" required value="${t.settings.drift}"></label></div><button class="btn primary" type="submit">Guardar preferencias</button>${t.phase === 'active' ? `<button class="btn" type="button" data-action="archive" data-id="${t.id}">Archivar</button>` : ''}</section></form>`;
}

function takePage(id, tab = 'news', focus) {
  tab = tab || 'news';
  const t = state.takes.find(x => x.id === id);
  if (!t) return '<div class="empty">No encontramos esa tesis.</div>';
  const draft = t.phase === 'draft';
  const archived = t.phase === 'archived';
  const eff = effectiveAttention(t, timelineFor(t).items);
  return `<div class="take-header"><div class="eyebrow">${draft ? phaseChip('draft') : archived ? phaseChip('archived') : 'Cartera de práctica'} · ${esc(t.horizon)}</div><h1 tabindex="-1">${esc(t.title)}</h1><p class="description">${esc(t.thesis)}</p></div><div class="take-toolbar"><div class="row">${statusForTake(t)}<span class="small muted">${esc(eff.reason || reasonForTake(t).slice(0, 80))}</span></div><div class="row">${archived ? '' : draft ? `<button class="btn primary" data-action="activate" data-id="${id}">Activar práctica</button>` : `${reviewControl(t)}<button class="btn" data-action="scenario" data-id="${id}">Probar escenario</button>`}</div></div>${!draft ? `<div class="summary-top"><div class="take-metrics"><div><div class="metric-label">Valor de práctica · ARS</div><div class="metric-value">${money(total(t))}</div><p class="small muted">${esc(quoteMetaNote())}</p></div><div><div class="metric-label">Desde el inicio</div><div class="metric-value ${gain(t) < 0 ? 'negative' : 'positive'}">${pct(gain(t))}</div></div></div>${chartControls(t)}</div><div class="chart-wrap">${chart(t.history, t.title, t)}</div>` : '<div class="callout">Revisá la composición antes de activar.</div>'}<div class="tabs" role="tablist">${[['news', 'Novedades'], ['positions', 'Posiciones'], ['idea', 'La idea'], ['settings', 'Preferencias']].map(([key, label]) => `<button role="tab" aria-selected="${tab === key}" class="tab ${tab === key ? 'active' : ''}" data-action="tab" data-id="${id}" data-value="${key}">${label}</button>`).join('')}</div><div class="take-body take-page-with-dock">${tab === 'positions' ? positions(t) : tab === 'idea' ? idea(t) : tab === 'settings' ? takeSettings(t) : draft ? '<div class="empty">Activá para ver novedades.</div>' : timelineView(t, focus)}</div><div class="chat-dock"><form id="take-ask" data-id="${id}" class="dock-inner"><input name="message" maxlength="4000" placeholder="Conversemos sobre esta tesis…"><button class="btn primary" type="submit">Conversar</button></form></div>`;
}

function news(t, focus) {
  return timelineView(t, focus);
}

function takes() {
  const list = state.takes.filter(t => filter === 'all' || filter === t.phase);
  return `<div class="page-heading"><h1 tabindex="-1">Mis tesis</h1></div><div class="filter-row">${[['all', 'Todas'], ['active', 'En seguimiento'], ['draft', 'Borradores'], ['archived', 'Archivadas']].map(([f, l]) => `<button class="filter ${filter === f ? 'active' : ''}" data-action="filter" data-value="${f}">${l}</button>`).join('')}</div><div class="thesis-rows">${list.map(thesisRow).join('')}</div>`;
}

function newPage() {
  return `<div class="new-view"><h1 tabindex="-1">¿Qué creés que va a cambiar?</h1><p>${DEF_SHORT}</p><form id="new-chat" class="prompt-box"><textarea id="new-prompt" name="message" maxlength="4000" required></textarea><button class="btn primary" type="submit" ${busyChat ? 'disabled' : ''}>Explorar mi idea</button></form></div>`;
}

function chatPage(id) {
  const c = state.chats.find(x => x.id === id);
  if (!c) return '<div class="empty">Conversación no encontrada.</div>';
  const overlaps = c.proposal ? [...new Set(c.proposal.holdings.filter(h => active().some(t => t.holdings.some(p => p.ticker === h.ticker))).map(h => h.ticker))] : [];
  return `<div class="chat-page"><h1 tabindex="-1">${esc(c.title)}</h1>${c.messages.map(m => `<div class="message ${m.role}">${esc(m.content)}</div>`).join('')}${busyChat === id ? '<div class="processing">Pensando…</div>' : ''}${c.proposal ? portfolioCard(c.proposal, c.id, overlaps) : ''}</div><div class="chat-dock"><form id="chat-send" data-id="${id}" class="dock-inner"><textarea name="message" placeholder="${adjustChatId === id ? 'Escribí qué querés ajustar…' : 'Seguimos pensando…'}" required ${busyChat === id ? 'disabled' : ''}></textarea><button class="btn primary" type="submit">Enviar</button></form></div>`;
}

function chats() {
  return `<div class="page-heading"><h1 tabindex="-1">Conversaciones</h1></div>${state.chats.map(c => `<a class="briefing" href="#/chat/${c.id}"><h3>${esc(c.title)}</h3></a>`).join('')}`;
}

function activity() {
  return `<div class="page-heading"><h1 tabindex="-1">Actividad</h1></div>`;
}

function settings() {
  return settingsView(state);
}

function render() {
  if (!state) return;
  const [page, id, tab, focus] = route();
  const loadingHome = !stateLoaded && !page;
  const body = loadingHome
    ? homeLoadingView()
    : page === 'take'
      ? takePage(id, tab || 'news', focus)
      : page === 'takes'
        ? takes()
        : page === 'new'
          ? newPage()
          : page === 'chat'
            ? chatPage(id)
            : page === 'chats'
              ? chats()
              : page === 'settings'
                ? settings()
                : page === 'activity'
                  ? activity()
                  : home();
  app.innerHTML = shell(body);
  document.title = 'La Viste · ' + (page === 'take' ? state.takes.find(t => t.id === id)?.title || 'Tesis' : 'Tu espacio');
  if (focus) {
    const el = document.querySelector(`[data-key="${CSS.escape(focus)}"]`);
    el?.scrollIntoView({block: 'center'});
  }
  focusH1();
}

function openModal(title, content) {
  modal.innerHTML = `<div class="modal-title"><h2>${esc(title)}</h2><button class="iconbtn" data-action="close" aria-label="Cerrar">${icon('close')}</button></div>${content}`;
  modal.showModal();
}

function openRebalanceModal(t) {
  const sim = simulateRebalance(t);
  const tot = sim.total;
  const head = '<thead><tr><th>Posición</th><th>Peso</th><th>Unidades</th><th>Valor</th></tr></thead>';
  const rows = t.holdings.map(h => {
    const d = holdingDerived(t, h);
    const afterH = sim.holdingsAfter.find(x => x.ticker === h.ticker);
    const afterVal = afterH.units * afterH.price;
    const afterPct = afterVal / sim.afterTotal * 100;
    return {
      ticker: h.ticker,
      before: {pct: d.actual, units: h.units, val: h.units * h.price, weight: h.weight},
      after: {pct: afterPct, units: afterH.units, val: afterVal, weight: h.weight},
    };
  });
  const tableBefore = rows.map(r => `<tr><td>${esc(r.ticker)}</td><td>${pct1(r.before.pct)} (obj. ${r.before.weight}%)</td><td>${r.before.units} u.</td><td>${money(r.before.val)}</td></tr>`).join('');
  const tableAfter = rows.map(r => `<tr><td>${esc(r.ticker)}</td><td>${pct1(r.after.pct)} (obj. ${r.after.weight}%)</td><td>${r.after.units} u.</td><td>${money(r.after.val)}</td></tr>`).join('');
  const stack = rows.map(r => `<article class="rebalance-position-card"><div class="rbp-ticker">${esc(r.ticker)}</div><div class="rbp-row"><span class="rbp-label">Antes</span><span>${pct1(r.before.pct)} · ${r.before.units} u. · ${money(r.before.val)}</span></div><div class="rbp-row"><span class="rbp-label">Después</span><span>${pct1(r.after.pct)} · ${r.after.units} u. · ${money(r.after.val)}</span></div><div class="rbp-obj small muted">Objetivo ${r.before.weight}%</div></article>`).join('');
  openModal('Aplicar en práctica', `<p class="modal-copy">Confirmá el rebalance con ${esc(quoteMetaNote())}.</p><div class="rebalance-compare"><h3>Antes</h3><table class="rebalance-table rebalance-table-desktop">${head}<tbody>${tableBefore}</tbody></table><p class="rebalance-cash">Efectivo · ${money(t.cash)} (${pct1(t.cash / tot * 100)})</p><h3>Después (objetivo)</h3><table class="rebalance-table rebalance-table-desktop">${head}<tbody>${tableAfter}</tbody></table><div class="rebalance-stack">${stack}</div><p class="rebalance-cash">Efectivo · ${money(sim.afterCash)} (${pct1(sim.afterCash / tot * 100)})</p><p class="small muted rebalance-trade-lines">${sim.lines.map(l => esc(l.line)).join('<br>')}</p><button class="btn primary" data-action="confirm-rebalance" data-id="${t.id}" data-version="${t.version}">Aplicar en práctica</button></div>`);
}

function login() {
  state = null;
  stateLoaded = false;
  app.innerHTML = `<div class="login-layout"><section class="login-story"><a href="/" class="brand">la viste<span class="brand-dot">.</span></a><h1>Una mirada propia.</h1><p>${DEF_SHORT}</p></section><section class="login"><h2>Retomá el hilo.</h2><p class="muted">La Viste es tu espacio privado para practicar tesis de inversión con dinero simulado.</p><form id="login"><label class="field">Contraseña<input class="input" type="password" name="password" autocomplete="current-password" required></label><div id="login-error" class="login-error" role="alert"></div><button class="btn primary" type="submit">Entrar a mi espacio</button></form><a class="small muted" href="/privacidad">Privacidad y datos ↗</a></section><footer class="login-foot">${practiceFooter()}</footer></div>`;
}

const pendingMessages = new Map();

async function send(id, text, adjusting = false) {
  prevProposal[id] = structuredClone(state.chats.find(c => c.id === id)?.proposal || null);
  const previous = pendingMessages.get(id);
  const key = previous?.text === text ? previous.key : crypto.randomUUID();
  pendingMessages.set(id, {text, key, adjusting});
  busyChat = id;
  render();
  try {
    await api(`/chats/${id}/messages`, {message: text, adjusting}, key);
    pendingMessages.delete(id);
    adjustChatId = null;
    await refresh();
  } catch (e) {
    toast(e.message);
    throw e;
  } finally {
    busyChat = null;
    render();
  }
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const {action, id, value, index, scope, key, version} = b.dataset;
  try {
    if (action === 'menu') document.getElementById('sidebar').classList.toggle('open');
    if (action === 'period') { period = value; render(); }
    if (action === 'benchmark') {
      const mode = b.dataset.mode;
      if (mode === 'index' && state.quotes?.indexCompareAvailable) compareMode = compareMode === 'index' ? null : 'index';
      else compareMode = compareMode === 'capital' ? null : 'capital';
      render();
    }
    if (action === 'filter') { filter = value; render(); }
    if (action === 'tab') go(`/take/${id}/${value}`);
    if (action === 'close') modal.close();
    if (action === 'disclose') {
      const k = porQueKey(scope, key);
      if (expanded.has(k)) expanded.delete(k); else {
        if (window.matchMedia('(max-width:640px)').matches) expanded.clear();
        expanded.add(k);
      }
      restoreDisclosure();
    }
    if (action === 'activate-practice') {
      const chat = state.chats.find(c => c.id === id);
      let takeId = chat.takeId;
      if (!takeId) {
        const t = await api('/takes', {sourceChatId: id});
        takeId = t.id;
        await refresh();
      }
      openActivateModal(takeId);
    }
    if (action === 'adjust-proposal') { adjustChatId = id; render(); }
    if (action === 'activate') openActivateModal(id);
    if (action === 'review') {
      b.disabled = true;
      b.textContent = 'Encolando…';
      await api(`/takes/${id}/review`, {});
      reviewCooldownUntil = Date.now() + 60000;
      await refresh();
      toast('Revisión en cola. Podés seguir usando tu espacio.');
    }
    if (action === 'apply-rebalance') openRebalanceModal(state.takes.find(t => t.id === id));
    if (action === 'confirm-rebalance') {
      b.disabled = true;
      await api(`/takes/${id}/rebalance`, {version: Number(version)});
      modal.close();
      await refresh();
      toast('Rebalance aplicado en práctica.');
    }
    if (action === 'scenario') {
      openModal('Probá cómo responde tu tesis', `<div class="scenario-list">${[['drop', 'Caída puntual de 8%'], ['broken', 'Evidencia contraria'], ['recovery', 'Recuperación'], ['normal', 'Volver a base']].map(([s, title]) => `<button class="scenario-option" data-action="apply-scenario" data-id="${id}" data-value="${s}"><strong>${title}</strong></button>`).join('')}</div>`);
    }
    if (action === 'apply-scenario') {
      const preview = await api(`/takes/${id}/scenario`, {scenario: value});
      modal.close();
      openModal('Escenario de demostración', `<p class="callout">Vista aislada · no guardada</p><p>${esc(preview.events[0].body)}</p><p>Valor simulado: ${money(total(preview))}</p>`);
    }
    if (action === 'versions') {
      const versions = await api(`/takes/${id}/versions`);
      openModal('Historia de la idea', versions.map(v => `<article class="news-item"><h3>Versión ${v.version} · ${date(v.at)}</h3><p>${esc(v.thesis)}</p></article>`).join(''));
    }
    if (action === 'edit-idea') {
      const t = state.takes.find(x => x.id === id);
      openModal('Refiná tu idea', `<form id="idea-form" data-id="${id}"><label class="field">La tesis<textarea name="thesis" required>${esc(t.thesis)}</textarea></label><label class="field">Invalidación<textarea name="invalidation" required>${esc(t.invalidation)}</textarea></label><button class="btn primary" type="submit">Guardar</button></form>`);
    }
    if (action === 'template') {
      const t = await api('/takes', {proposal: state.templates[Number(index)]});
      await refresh();
      go('/take/' + t.id + '/positions');
    }
    if (action === 'suggest') {
      const el = document.getElementById('new-prompt');
      if (el) el.value = ['Quiero empezar a invertir.', 'Creo que la energía argentina tiene oportunidad.', 'La IA sale de la nube.'][Number(index)];
    }
    if (action === 'test-openai') {
      b.disabled = true;
      await api('/integrations/openai/test', {target: value});
      const st = await api('/integrations');
      state.config = {...state.config, ...st};
      lastSig = signature(state);
      render();
      toast('Conexión verificada.');
      b.disabled = false;
    }
    if (action === 'remove-openai') { await api('/integrations/openai/remove', {}); await refresh(); }
    if (action === 'remove-iol') { if (!state.config.iolEnabled) return; await api('/integrations/iol/remove', {}); await refresh(); }
    if (action === 'iol-snapshot') {
      if (!state.config.iolEnabled) return;
      const data = await api('/brokers/iol/snapshot');
      openModal('Mi cuenta IOL', accountView(data));
    }
    if (action === 'iol-quote') {
      if (!state.config.iolEnabled) return;
      const result = await api('/brokers/iol/quote?market=' + encodeURIComponent(b.dataset.market) + '&symbol=' + encodeURIComponent(b.dataset.symbol));
      modal.close();
      openModal('Cotización IOL', `<p>Último precio: ${esc(result.data.ultimoPrecio)}</p>`);
    }
    if (action === 'archive') { await api(`/takes/${id}/archive`, {}); await refresh(); }
    if (action === 'logout') { await api('/logout', {}); login(); }
  } catch (err) {
    toast(err.message);
    b.disabled = false;
  }
});

function openActivateModal(takeId) {
  openModal('Dale un lugar a tu idea', `<form id="activate-form" data-id="${takeId}"><label class="field">Monto de práctica (ARS)<input class="input" type="number" name="amount" min="100000" value="1000000" required></label><button class="btn primary" type="submit">Activar simulación</button></form>`);
}

document.addEventListener('submit', async e => {
  const f = e.target;
  if (!['login', 'activate-form', 'take-settings', 'new-chat', 'chat-send', 'idea-form', 'take-ask', 'openai-settings', 'iol-settings'].includes(f.id)) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(f));
  const button = f.querySelector('button[type=submit]');
  if (button) button.disabled = true;
  try {
    if (f.id === 'login') { await api('/login', data); await loadAppState({quiet: false}); }
    if (f.id === 'activate-form') {
      await api(`/takes/${f.dataset.id}/activate`, {amount: Number(data.amount)});
      modal.close();
      await refresh();
      go('/take/' + f.dataset.id + '/news');
      toast('Tu tesis ya está en seguimiento de práctica.');
    }
    if (f.id === 'take-settings') {
      await api(`/takes/${f.dataset.id}/settings`, {cadence: data.cadence, mode: 'ask', cap: Number(data.cap), drift: Number(data.drift), paused: false, monitoringPaused: data.monitoringPaused === 'on'});
      await refresh();
    }
    if (f.id === 'new-chat') {
      const c = await api('/chats', {});
      await refresh();
      go('/chat/' + c.id);
      await send(c.id, data.message, false);
    }
    if (f.id === 'openai-settings') {
      const cfg = await api('/integrations/openai', {...data, dailyLimit: Number(data.dailyLimit), newsLimit: Number(data.newsLimit)});
      state.config = {...state.config, ...cfg};
      lastSig = signature(state);
      f.reset();
      render();
      toast('Clave guardada. Probá conversación y búsqueda web.');
    }
    if (f.id === 'iol-settings') {
      await api('/integrations/iol', data);
      f.reset();
      await refresh();
    }
    if (f.id === 'idea-form') {
      await api(`/takes/${f.dataset.id}/idea`, data);
      modal.close();
      await refresh();
    }
    if (f.id === 'take-ask') {
      const c = state.chats.find(x => x.takeId === f.dataset.id) || await api('/chats', {takeId: f.dataset.id});
      await refresh();
      go('/chat/' + c.id);
      await send(c.id, data.message, false);
    }
    if (f.id === 'chat-send') await send(f.dataset.id, data.message, adjustChatId === f.dataset.id);
  } catch (err) {
    if (f.id === 'login') document.getElementById('login-error').textContent = err.message;
    else toast(err.message);
  } finally {
    if (button) button.disabled = false;
  }
});

window.addEventListener('hashchange', () => {
  resetRouteScopedState();
  const [page, id] = route();
  routeBefore = `${page}|${id || ''}`;
  render();
  window.scrollTo(0, 0);
  revalidate({quiet: false});
});

let visThrottle = 0;
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - visThrottle > 15000) {
    visThrottle = Date.now();
    if (!hasDirtyInput() && !modal.open) revalidate({quiet: true});
  }
});

setInterval(() => {
  if (!document.hidden && onLivePage() && !hasDirtyInput() && !modal.open) revalidate({quiet: true});
}, 60000);

modal.addEventListener('click', e => {
  if (e.target === modal) modal.close();
});

function emptyState() {
  return {takes: [], chats: [], reviews: [], jobs: [], consumption: [], config: {}, quotes: {}};
}

async function loadAppState({quiet = false} = {}) {
  state = emptyState();
  stateLoaded = false;
  render();
  await revalidate({quiet});
  stateLoaded = true;
  render();
}

async function boot() {
  try {
    const session = await api('/session');
    if (!session.authenticated) return login();
    await loadAppState({quiet: false});
  } catch (err) {
    app.innerHTML = `<div class="boot"><p>${esc(err.message)}</p>${practiceFooter()}</div>`;
  }
}

boot();
