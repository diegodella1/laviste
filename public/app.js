import {icon} from './icons.js';
import {settingsView, accountView} from './integrations.js';
import {portfolioSeries, portfolioSeriesARS} from './math.js';
import {buildTimeline, movementsToday, artTime, artWhen, artClock} from './timeline.mjs';
import {money, pct1} from './format.mjs';
import {takeTotal, effectiveAttention, effectiveVerdict, portfolioRuleState, simulateRebalance, proposalDiff, holdingDerived} from './portfolio.mjs';
import {porQueRow, eventPorQue, porQueKey} from './por-que.mjs';
import {PRACTICE_FOOTER, DEF_SHORT, isNoActionVerdict, TAKE_ASK_PLACEHOLDER, TAKE_ASK_CTA, VERDICT_ACTION_RULES, PRACTICE_ORDER_NOTE} from './copy.mjs';
import {aggregatePracticeCapital, chartSinglePointMessage, chartLegendHtml, chartPeriodEmptyMessage} from './chart-copy.mjs';
import {tickerIdHtml, bindTickerLogoFallbacks} from './ticker-logo.mjs';
import {
  adminAgentDirty, bindAdminAgent, isAdminAgentRoute, loadAdminAgent, promptAdminLeave, renderAdminAgent, updateAdminSession,
} from './admin-agent.mjs';
import {weightBarHtml, weightLegendHtml} from './wbar.mjs';
import {scheduleChartPaint} from './chart-suizo.mjs';

const app = document.getElementById('app');
const modal = document.getElementById('modal');

const NEW_EXAMPLES = [
  'Vaca Muerta sostiene la tesis energética.',
  'Si baja la inflación, el crédito bancario se reactiva.',
  'Compresión de riesgo país en AL30/GD30.',
  'Exportadoras y agro con mejor saldo comercial.',
  'Utilities por normalización tarifaria.',
  'CEDEARs como cobertura cambiaria.',
  'Giro pro-mercado en LatAm (el neoliberalismo avanza en la región): bonos argentinos, bancos, energía y CEDEARs regionales.',
  'Normalización macro regional / ciclo electoral en LatAm.',
];

const DEMO_THESIS_TITLES = [
  'Energía en Vaca Muerta',
  'Bancos y crédito si baja la inflación',
  'Bonos soberanos (AL30/GD30) y riesgo país',
  'Exportadoras y agro',
  'Utilities y normalización tarifaria',
  'CEDEARs como cobertura cambiaria',
  'Giro pro-mercado en LatAm',
  'Normalización macro regional en LatAm',
];

/** Illustrative home cards when the space is empty (not stored takes). */
const homeDemoSample = [
  {
    title: 'Energía en Vaca Muerta',
    attention: 'track',
    reason: 'Las posiciones siguen dentro de banda — sin acción necesaria.',
    value: 1_024_000,
    when: 'hoy',
  },
  {
    title: 'Bancos y crédito si baja la inflación',
    attention: 'watch',
    reason: 'Un desvío pide mirar concentración antes de rebalancear.',
    value: 768_000,
    when: 'esta sem.',
  },
  {
    title: 'CEDEARs como cobertura cambiaria',
    attention: 'track',
    reason: 'Chequeo de reglas al día; precios demorados en ARS.',
    value: 512_000,
    when: 'ayer',
  },
];

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
let attentionFilter = null;
let expanded = new Set();
const prevProposal = {};
let routeBefore = '';
let jobPoller = null;
let reviewCooldownUntil = 0;
let reviewTickTimer = null;
let adminSession = {enabled: false, unlocked: false};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pct = n => (n >= 0 ? '+' : '') + n.toFixed(1).replace('.', ',') + '%';
const date = s => s ? new Date(s).toLocaleString('es-AR', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : 'Pendiente';
const total = t => takeTotal(t);
const gain = t => t.invested ? (total(t) / t.invested - 1) * 100 : 0;
const active = () => state.takes.filter(t => t.phase === 'active' || t.phase === 'archived');
const attentionLabels = {track: 'En camino', watch: 'Vigilando', review: 'Revisar'};
const phaseLabels = {draft: 'Borrador', archived: 'Archivada'};
const statusMark = (kind, label) => `<span class="status-mark ${esc(kind)}">● ${esc(label)}</span>`;
const phaseChip = p => `<span class="phase">${esc(phaseLabels[p] || p)}</span>`;

function timelineFor(t) {
  return buildTimeline(t, (state.reviews || []).filter(r => r.takeId === t.id), (state.jobs || []).filter(j => j.takeId === t.id));
}

function statusForTake(t) {
  if (t.phase === 'draft') return phaseChip('draft');
  if (t.phase === 'archived') return phaseChip('archived');
  const {items} = timelineFor(t);
  const eff = effectiveAttention(t, items);
  return statusMark(eff.attention, attentionLabels[eff.attention]);
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

function hashQuery() {
  const raw = location.hash.slice(1) || '/';
  const q = raw.indexOf('?');
  return q >= 0 ? new URLSearchParams(raw.slice(q + 1)) : new URLSearchParams();
}

function route() {
  const raw = location.hash.slice(1) || '/';
  const path = raw.split('?')[0];
  return path.split('/').filter(Boolean);
}

function syncAttentionFilterFromHash() {
  const f = hashQuery().get('f');
  attentionFilter = ['track', 'watch', 'review'].includes(f) ? f : null;
}

function signature(s) {
  return JSON.stringify({
    takes: s.takes.map(t => [t.id, t.version, t.title, t.events?.[0]?.id, t.checkedAt, t.newsCheckedAt, t.attention, t.coverage]),
    jobs: (s.jobs || []).map(j => [j.id, j.status]),
    reviews: s.reviews?.[0]?.id,
    chats: s.chats.map(c => [c.id, c.messages.length]),
    config: [s.config?.aiConfigured, s.config?.iolConfigured, s.config?.iolEnabled, s.config?.openaiStatus, s.config?.model],
    quotes: s.quotes?.asOf,
    orders: (s.orders || []).map(o => [o.id, o.status, o.takeId]),
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
  const target = path.startsWith('#') ? path : '#' + path;
  if (isAdminAgentRoute(route()) && adminAgentDirty()) {
    promptAdminLeave(openModal, () => go(target));
    return;
  }
  if (location.hash === target) {
    render();
    revalidate({quiet: false});
  } else location.hash = target;
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
  return `<div class="home-loading skeleton state-loading" aria-busy="true" aria-label="Cargando tu espacio">
    <div class="hero-n skeleton-panel"><div class="sk lg"></div><div class="sk" style="width:40%"></div></div>
    <div class="home-stats skeleton-panel"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>
    <div class="chart-host skeleton-panel" style="min-height:230px"><div class="sk lg" style="height:180px"></div></div>
  </div>`;
}

function navLink(href, label, page, id) {
  const p = href.slice(2) || '';
  const activeNav = p === 'admin/agente' ? page === 'admin' && id === 'agente' : p ? page === p : !page;
  return `<a class="topnav-link ${activeNav ? 'active' : ''}" href="${href}">${label}</a>`;
}

function shell(content, {skipFooter = false, dock = ''} = {}) {
  const [page, id] = route();
  const take = page === 'take' && id ? state.takes.find(x => x.id === id) : null;
  const coreNav = [['/', 'Inicio'], ['#/takes', 'Mis tesis'], ['#/settings', 'Configuración']];
  const adminNav = adminSession.enabled && adminSession.unlocked ? [['#/admin/agente', 'Admin · Agente']] : [];
  const navHtml = coreNav.map(([href, label]) => navLink(href, label, page, id)).join('');
  const overflowHtml = adminNav.map(([href, label]) => navLink(href, label, page, id)).join('');
  const footer = skipFooter ? '' : practiceFooter();
  const meta = take ? '' : '<div class="topbar-right topmeta"><span class="muted">Dinero de práctica · ARS</span></div>';
  return `<header class="topbar${take ? ' topbar-take' : ''}"><div class="topbar-left"><a class="brand" href="#/" aria-label="La Viste, inicio">la viste<span class="brand-dot">.</span></a><button type="button" class="topnav-toggle" aria-expanded="false" aria-controls="app-topnav">Menú</button><nav class="topnav" id="app-topnav" aria-label="Principal">${navHtml}${overflowHtml ? `<div class="topnav-overflow" aria-label="Administración">${overflowHtml}</div>` : ''}</nav></div>${meta}</header><main class="main"><div class="shell">${content}${footer}</div></main>${dock}`;
}

function bindTopnavMenu() {
  const btn = document.querySelector('.topnav-toggle');
  const nav = document.getElementById('app-topnav');
  if (!btn || !nav || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', e => {
    if (!nav.classList.contains('open')) return;
    if (nav.contains(e.target) || btn.contains(e.target)) return;
    nav.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }));
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

function widenAggregateChartHistory(h) {
  if (h.length !== 1) return h;
  const start = h[0];
  const t0 = Date.parse(start.at);
  const earlier = Number.isFinite(t0)
    ? new Date(t0 - 3 * 3600_000).toISOString()
    : new Date(Date.now() - 3600_000).toISOString();
  return [{...start, at: earlier}, start];
}

function trimChartHistory(h) {
  let i = 0;
  while (i < h.length - 1 && h[i].value === 0) i++;
  return i ? h.slice(i) : h;
}

function chart(history, label = 'Evolución de la cartera', take = null, opts = {}) {
  const chartPeriod = opts.period ?? (take ? 'all' : period);
  let h = trimChartHistory(history);
  if (chartPeriod === 'week') {
    const cutoff = Date.now() - 7 * 86400000;
    h = h.filter(p => new Date(p.at).getTime() >= cutoff);
  }
  h = trimChartHistory(h);
  if (!take && h.length === 1) h = widenAggregateChartHistory(h);
  if (!h.length) return `<div class="chart-empty empty">${esc(chartPeriodEmptyMessage(quoteMetaNote()))}</div>`;
  if (h.length === 1) {
    const capital = take ? (take.invested > 0 ? take.invested : 0) : aggregatePracticeCapital(state.takes);
    const scope = take ? 'thesis' : 'practice';
    const text = chartSinglePointMessage(capital, {scope, quoteMeta: quoteMetaNote()});
    return `<div class="chart-empty empty small">${esc(text)}</div>`;
  }
  const compareKey = 'benchmark';
  const capital = take ? (take.invested > 0 ? take.invested : 0) : aggregatePracticeCapital(state.takes);
  const flatCapital = !!take;
  const series = take ? h.map(p => ({...p, value: p.value, benchmark: capital})) : h;
  const aria = `${label}. Valor frente a capital aportado. ${quoteMetaNote()}`;
  const payload = {history: series, capital, compareKey, label: aria, valueScale: 'ars', flatCapital};
  return `<div class="chart-stack"><div class="chart-host" data-ready="1" data-h="230" data-chart='${esc(JSON.stringify(payload))}'></div>${chartLegendHtml()}</div>`;
}

function chartControls() {
  return `<div class="periods"><button class="period ${period === 'week' ? 'active' : ''}" data-action="period" data-value="week">1S</button><button class="period ${period === 'all' ? 'active' : ''}" data-action="period" data-value="all">Todo</button></div>`;
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

function homeEmptySeed() {
  const demos = DEMO_THESIS_TITLES.map((title, i) => `<button type="button" class="btn demo-thesis" data-action="template" data-index="${i}">${esc(title)}</button>`).join('');
  const sampleCards = homeDemoSample.map(s => `<article class="take-card demo-card"><div class="card-foot">${statusMark(s.attention, attentionLabels[s.attention])}<span class="pill demo-pill">DEMO</span></div><h3>${esc(s.title)}</h3><p class="reason-line">${esc(s.reason)}</p><div class="take-card-value"><span>${money(s.value)}</span><small class="muted">${esc(s.when)}</small></div></article>`).join('');
  return `<section class="home-empty card-empty"><p class="eyebrow">Sin tesis todavía</p><h2>Nueva tesis</h2><p>Partí de una tesis. La Viste analiza mercado, noticias y precios y arma una cartera a la medida. Capital aportado en ARS. No se envían órdenes.</p><div class="form-actions home-empty-actions"><a class="btn primary" href="#/new">Nueva tesis</a><button type="button" class="btn" data-action="template" data-index="0">Ver ejemplo</button></div><div class="demo-thesis-list">${demos}</div></section><section class="home-demo-sample" id="ejemplo-practica"><div class="section-heading"><h2 class="icon-heading">${icon('layers')}Ejemplo ilustrativo</h2><span class="pill demo-pill">DEMO</span></div><p class="small muted">Así se vería tu espacio con tesis en seguimiento. No son datos reales ni carteras guardadas.</p><div class="take-grid">${sampleCards}</div></section>`;
}

function home() {
  if (!state.takes.length) {
    return `${!state.config.aiConfigured ? '<div class="pending-banner"><strong>Falta conectar OpenAI.</strong> <a class="btn" href="#/settings">Configurar OpenAI</a></div>' : ''}<div class="page-heading"><div><p class="eyebrow">Tu espacio</p><h1>Tus tesis.</h1><p>${DEF_SHORT}</p></div></div>${homeEmptySeed()}`;
  }
  const ts = state.takes.filter(t => t.phase === 'active');
  const amount = ts.reduce((s, t) => s + total(t), 0);
  const invested = ts.reduce((s, t) => s + t.invested, 0);
  const g = invested ? (amount / invested - 1) * 100 : 0;
  const c = attentionCounts();
  const checks = ts.filter(t => t.checkedAt).map(t => ({at: t.checkedAt, title: t.title}));
  const last = checks.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const moves = movementsToday(state.takes, state.reviews || [], state.jobs || []);
  const activeTakes = state.takes.filter(t => t.phase === 'active');
  const drafts = state.takes.filter(t => t.phase === 'draft');
  const firstActive = activeTakes[0];
  const openLink = firstActive ? `<a class="nav-link" href="#/take/${firstActive.id}">Abrir «${esc(firstActive.title)}» →</a>` : '';
  const hero = `<section class="hero-n" aria-label="Resumen de práctica"><div class="hero-n-total"><span class="metric-label">Dinero de práctica · ARS</span><div class="big-number">${money(amount)}</div><div class="summary-gain ${g < 0 ? 'negative' : 'positive'}">${pct(g)} <span class="muted">desde el inicio</span></div></div><div class="hero-n-actions"><a href="#/new" class="btn primary">${icon('plus')} Nueva tesis</a>${openLink}</div></section>`;
  const ahoraStat = `<div class="home-stat home-stat-attention"><span class="stat-label">Ahora en tu espacio</span><div class="ahora-pills" role="list" aria-label="Tesis activas por atención">${[['track', 'En camino'], ['watch', 'Vigilando'], ['review', 'Revisar']].map(([k, l]) => `<a role="listitem" class="attention-inline-pill status-mark ${k}${c[k] ? '' : ' muted'}" href="#/takes?f=${k}">● ${l} · ${c[k]}</a>`).join('')}</div></div>`;
  const hoyLink = `<a class="home-stat-link${moves.length ? '' : ' muted'}" href="#/activity"><span class="stat-label">Hoy</span><strong class="stat-value-compact">${moves.length} movimientos</strong></a>`;
  const stats = `<div class="home-stats stats" role="list">${ahoraStat}<div class="home-stat"><span class="stat-label">Último chequeo</span><strong class="stat-value-compact">${last ? artWhen(last.at) : '—'}</strong></div><div class="home-stat"><span class="stat-label">Capital aportado</span><strong class="num stat-value-compact">${money(invested)}</strong></div><div class="home-stat home-stat-hoy">${hoyLink}</div></div>`;
  const chartBlock = `<section class="home-chart"><div class="chart-card-head"><div><span class="eyebrow">Evolución agregada</span><p class="small muted">${esc(quoteMetaNote())}</p></div>${chartControls()}</div>${chart(aggregateHistory(), 'Evolución de práctica agregada')}</section>`;
  const list = `<div class="section-heading"><h2>Tus tesis</h2></div><div class="thesis-list">${activeTakes.map(thesisRow).join('') || '<p class="empty small">No hay tesis activas.</p>'}${drafts.length ? `<div class="section-heading"><h2>Borradores</h2></div>${drafts.map(thesisRow).join('')}` : ''}</div>`;
  return `${!state.config.aiConfigured ? '<div class="pending-banner"><strong>Falta conectar OpenAI.</strong> <a class="btn" href="#/settings">Configurar OpenAI</a></div>' : ''}${hero}${stats}${chartBlock}${list}`;
}

function thesisRow(t) {
  const reason = reasonForTake(t);
  const amount = t.invested > 0 ? money(total(t)) : 'Lista para activar';
  const gLine = t.invested > 0 ? `<span class="thesis-list-gain ${gain(t) < 0 ? 'negative' : 'positive'}">${pct(gain(t))}</span>` : '';
  return `<a class="thesis-list-row" href="#/take/${t.id}">${statusForTake(t)}<span class="thesis-list-title">${esc(t.title)}</span><span class="thesis-list-reason">${esc(reason)}</span><span class="thesis-list-amount">${amount}${gLine}</span></a>`;
}

function aggregateHistory() {
  return portfolioSeriesARS(state.takes);
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
  return `<div class="portfolio-card" id="portfolio-card"><div class="portfolio-card-head"><div><span class="eyebrow">Propuesta</span><h2>${esc(proposal.title)}</h2><p class="portfolio-thesis">${esc(proposal.thesis)}</p><span class="pill">${esc(proposal.horizon)}</span><div class="small muted">${proposal.holdings.length} posiciones · ${cash.toFixed(0)}% efectivo</div></div><span class="pill demo-pill">DEMO</span></div>${overlaps.length ? `<div class="callout amber overlap-tickers">Ya tenés exposición en otras tesis: ${overlaps.map(t => tickerIdHtml(t)).join('')}</div>` : ''}<div class="portfolio-holdings">${proposal.holdings.map(h => {
    let chip = '';
    if (diff.added.some(a => a.ticker === h.ticker)) chip = '<span class="chip added">Nueva</span>';
    const ch = diff.changed.find(c => c.ticker === h.ticker);
    if (ch) chip = `<span class="chip diff">${ch.to > ch.from ? 'Sube' : 'Baja'} ${ch.from}→${ch.to}%</span>`;
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
    return {state: 'no_ai', label: 'Revisar ahora', sub: 'Conectá OpenAI para revisar noticias.', disabled: true};
  }
  if (t.monitoringPaused) {
    return {state: 'paused', label: 'Revisar ahora', sub: 'El seguimiento está pausado.', disabled: true};
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
    const hhmm = new Date(job.finishedAt).toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires'});
    const k = (state.reviews || []).filter(r => r.takeId === t.id && Date.parse(r.at) >= Date.parse(job.createdAt)).length;
    const sub = k > 0 ? `Revisión lista · ${hhmm}. ${k} novedades nuevas.` : 'Revisión lista · sin novedades que cambien tu tesis.';
    return {state: 'done', label: 'Revisión lista', sub, disabled: true};
  }
  if (cd > 0) {
    const s = Math.ceil(cd / 1000);
    return {state: 'countdown', label: `Disponible en ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, sub: 'Para cuidar tu cuota, podés repetir la revisión una vez por minuto.', disabled: true};
  }
  if (job?.status === 'failed') {
    return {state: 'error', label: 'Reintentar revisión', sub: `No se pudo completar la revisión. ${job.error || 'Intentá de nuevo.'}`, disabled: false};
  }
  return {state: 'idle', label: 'Revisar ahora', sub: 'Revisá noticias y reglas.', disabled: false};
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
      btn.innerHTML = `${icon('refresh')} Disponible en ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
  const revClass = ui.state === 'idle' ? 'rev-default' : `rev-${ui.state}`;
  ensureReviewTick();
  return `<div class="review-control ${revClass}" data-take="${t.id}" data-review-state="${ui.state}"><button class="btn ghost" data-action="review" data-id="${t.id}" ${ui.disabled ? 'disabled' : ''}>${icon('refresh')} ${ui.label}</button><p class="review-status status-line">${ui.sub}</p></div>`;
}

function suggestedAction(t) {
  const {items, verdict} = timelineFor(t);
  const eff = effectiveVerdict(t, verdict);
  const chequeo = items.find(i => i.type === 'chequeo' && i.verdict === 'action');
  const live = portfolioRuleState(t);
  const rulesBreach = live.hasCapBreach || live.hasDriftBreach;
  if ((!chequeo && !rulesBreach) || t.phase !== 'active') return '';
  const verdictText = chequeo?.verdictText || eff?.text || VERDICT_ACTION_RULES;
  const sim = simulateRebalance(t);
  if (!sim.lines.length || !state.config.rebalanceAvailable) {
    return `<div class="suggested-action"><p class="eyebrow">Acción sugerida</p><a class="nav-link" href="#/take/${t.id}/positions">Revisá los pesos en Posiciones →</a></div>`;
  }
  const afterPct = pct1((sim.afterCash / sim.total) * 100);
  const trades = sim.lines.map(l => esc(l.line)).join('<br>');
  return `<div class="suggested-action"><div class="verdict action"><p>${esc(verdictText)}</p><a class="nav-link" href="#/take/${t.id}/positions">Revisá los pesos en Posiciones →</a></div><p class="rebalance-trade-lines">${trades}</p><p class="small muted">Efectivo después · ${money(sim.afterCash)} (${afterPct})</p><p class="demo-note">${esc(quoteMetaNote())}. Nada cambia hasta que aprietes el botón.</p><div class="form-actions"><button class="btn primary" data-action="apply-rebalance" data-id="${t.id}">Aplicar en práctica</button></div></div>`;
}

function timelineView(t, focusKey) {
  const reviews = (state.reviews || []).filter(r => r.takeId === t.id);
  const jobs = (state.jobs || []).filter(j => j.takeId === t.id);
  const coverage = {pending: 'Primera revisión pendiente', partial: 'Cobertura parcial', stale: 'Cobertura atrasada', interrupted: 'Seguimiento interrumpido'};
  const {items, verdict} = timelineFor(t);
  const effVerdict = effectiveVerdict(t, verdict);
  const lastSeen = localStorage.getItem('lv:lastSeen:' + t.id);
  let html = `<div class="callout coverage-callout"><strong>${coverage[t.coverage] || 'Pendiente'}</strong><p>${esc(t.coverageDetail || 'La búsqueda consulta una selección de fuentes, no todo el mercado.')}</p></div>`;
  const applyBlock = suggestedAction(t);
  html += applyBlock;
  const live = portfolioRuleState(t);
  const liveBreach = live.hasCapBreach || live.hasDriftBreach;
  if (effVerdict && !liveBreach && !(applyBlock && effVerdict.kind === 'action')) {
    const vCls = effVerdict.kind === 'none' ? 'ok' : 'action';
    const vLink = effVerdict.kind !== 'none' ? `<a class="nav-link" href="#/take/${t.id}/positions">Revisá los pesos en Posiciones →</a>` : '';
    html += `<div class="verdict ${vCls}" role="status"><p>${esc(effVerdict.text)}</p>${vLink}</div>`;
  }
  html += `<ol class="timeline timeline-disclosures">${items.map(item => {
    const isNew = lastSeen && Date.parse(item.at) > Date.parse(lastSeen);
    if (focusKey && item.key === focusKey) expanded.add(porQueKey('event', item.key));
    return eventPorQue({...item, key: item.key || item.eventId}, {esc, expanded, takeId: t.id, isNew});
  }).join('')}</ol>`;
  return html;
}

function verdictBlock(t) {
  const {verdict, items} = timelineFor(t);
  const eff = effectiveVerdict(t, verdict);
  if (!eff || t.phase !== 'active') return '';
  const vCls = eff.kind === 'none' ? 'ok' : 'action';
  if (vCls === 'ok') {
    return `<div class="verdict ${vCls}">${esc(eff.text)}</div><p class="muted small">Dentro del tope y del desvío.</p>`;
  }
  const chequeo = items.find(i => i.type === 'chequeo' && i.verdict === 'action');
  const cite = eff.ruleCite || chequeo?.ruleCite;
  const detail = cite ? `<p class="muted small">${esc(cite)}</p>` : '';
  return `<div class="verdict ${vCls}">${esc(eff.text)}</div>${detail}<p class="verdict-link"><a class="nav-link" href="#/take/${t.id}/positions">Revisá los pesos en Posiciones →</a></p>`;
}

function positionsTable(t) {
  const cap = t.settings?.cap ?? 25;
  const amount = total(t);
  const rows = t.holdings.map(h => {
    const d = t.invested ? holdingDerived(t, h) : null;
    const actual = d ? d.actual : 0;
    const val = d ? money(d.value) : '—';
    const estado = d ? ruleChipFromDerived(d) : '<span class="phase">—</span>';
    return `<tr><td>${tickerIdHtml(h.ticker, h.name)}</td><td class="muted">${esc(h.sector || h.bucket || '')}</td><td>${weightBarHtml(actual, h.weight, cap)}</td><td class="num r">${pct1(actual)}</td><td class="num r">${h.weight}%</td><td class="num r">${cap}%</td><td class="num r">${val}</td><td>${estado}</td></tr>`;
  }).join('');
  const sum = t.holdings.reduce((s, h) => s + h.weight, 0);
  const cashPct = t.invested > 0 ? pct1(t.cash / amount * 100) : `${(100 - sum).toFixed(1)}%`;
  const cashRow = `<tr class="cash-row"><td colspan="6">Efectivo · ${cashPct}</td><td class="num r">${t.invested > 0 ? money(t.cash) : '—'}</td><td></td></tr>`;
  return `${weightLegendHtml()}<table class="table positions-table"><thead><tr><th>Ticker</th><th>Sector</th><th>Peso vs obj / tope</th><th class="r">Peso</th><th class="r">Obj</th><th class="r">Tope</th><th class="r">Valor</th><th>Estado</th></tr></thead><tbody>${rows}${cashRow}</tbody></table>`;
}

function positionsMobileList(t) {
  const cap = t.settings?.cap ?? 25;
  const amount = total(t);
  const rows = t.holdings.map(h => {
    const d = t.invested ? holdingDerived(t, h) : null;
    const actual = d ? d.actual : 0;
    const val = d ? money(d.value) : '—';
    const estado = d ? ruleChipFromDerived(d) : '<span class="phase">—</span>';
    return `<article class="position-list-row"><div class="position-list-head">${tickerIdHtml(h.ticker, h.name)}<span class="pq-weight num">${pct1(actual)}</span></div>${weightBarHtml(actual, h.weight, cap)}<div class="position-list-meta"><span class="muted">Obj ${h.weight}% · tope ${cap}%</span><span class="pq-val num">${val}</span></div><div class="position-list-estado">${estado}</div></article>`;
  }).join('');
  const sum = t.holdings.reduce((s, h) => s + h.weight, 0);
  const cashPct = t.invested > 0 ? pct1(t.cash / amount * 100) : `${(100 - sum).toFixed(1)}%`;
  const cash = `<article class="position-list-row position-list-cash"><div class="position-list-head"><strong>Efectivo</strong><span class="pq-weight num">${cashPct}</span></div><div class="position-list-meta"><span class="muted">Sin posición</span><span class="pq-val num">${t.invested > 0 ? money(t.cash) : '—'}</span></div></article>`;
  return `${weightLegendHtml()}<div class="position-list">${rows}${cash}</div>`;
}

function positionsTableWrap(t) {
  return `<div class="positions-table-wrap"><div class="positions-desktop">${positionsTable(t)}</div><div class="positions-mobile">${positionsMobileList(t)}</div></div>`;
}

function ruleChipFromDerived(d) {
  if (d.ruleChip === 'ok') return '<span class="estado track">Dentro</span>';
  if (d.ruleChip === 'cap') return '<span class="estado review">Sobre tope</span>';
  return '<span class="estado watch">Revisar</span>';
}

function positions(t) {
  const ctx = {esc, t, expanded, reviews: state.reviews || [], takeId: t.id, overlaps: [], quoteLabel: tickerQuoteLabel};
  const hist = t.history || [];
  const chartBlock = t.phase !== 'draft' && hist.length
    ? `<div class="take-positions-chart"><div class="chart-card-head"><div><span class="eyebrow">Evolución</span><p class="small muted">${esc(quoteMetaNote())}</p></div></div>${chart(hist, t.title, t, {period: 'all'})}</div>`
    : '';
  const disclosures = t.holdings.map(h => {
    const open = expanded?.has(porQueKey('active', h.ticker));
    return porQueRow('active', {...ctx, h, overlaps: overlapsFor(h), expanded});
  }).join('');
  return `${verdictBlock(t)}<p class="demo-note">${esc(quoteMetaNote())}</p>${practiceDesk(t)}${positionsTableWrap(t)}<div class="position-disclosures">${disclosures}</div>${chartBlock}`;
}

function pendingForTake(t) {
  return (state.orders || []).find(o => o.takeId === t.id && o.status === 'pending') || null;
}

function orderPreviewHtml(order) {
  const p = order.preview || {};
  if (order.kind === 'weights') {
    return `<p>${esc(p.line || '')}</p><p class="small muted">Efectivo objetivo ${p.cashTargetAfter}%. Las tenencias no se mueven.</p>`;
  }
  if (order.kind === 'trade') {
    const leftover = p.leftoverAmount > 0 ? `<p class="small muted">Sobra ${money(p.leftoverAmount)} sin alcanzar otra unidad.</p>` : '';
    return `<p>${esc(p.line || '')}</p><p class="small muted">Efectivo después · ${money(p.cashAfter)}</p>${leftover}`;
  }
  return `<p>${esc(p.line || '')}</p><p class="small muted">Efectivo ${money(p.cashBefore)} → ${money(p.cashAfter)} · capital aportado ${money(p.investedBefore)} → ${money(p.investedAfter)}</p>`;
}

function practiceDesk(t) {
  if (t.phase !== 'active') return '';
  const pending = pendingForTake(t);
  const actions = `<div class="form-actions practice-actions"><button class="btn" type="button" data-action="practice-aporte" data-id="${t.id}">Aportar</button><button class="btn" type="button" data-action="practice-retiro" data-id="${t.id}">Retirar</button><button class="btn" type="button" data-action="practice-trade" data-id="${t.id}">Comprar o vender</button><button class="btn" type="button" data-action="practice-weights" data-id="${t.id}">Editar pesos</button></div>`;
  const pendingCard = pending
    ? `<div class="pending-order"><p class="eyebrow">Orden pendiente</p>${orderPreviewHtml(pending)}<p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><div class="form-actions"><button class="btn primary" type="button" data-action="confirm-order" data-id="${t.id}" data-order="${pending.id}" data-version="${t.version}">Confirmar en práctica</button><button class="btn" type="button" data-action="cancel-order" data-id="${t.id}" data-order="${pending.id}">Cancelar</button></div></div>`
    : actions;
  return `<section class="practice-desk"><div class="section-heading"><h2 class="icon-heading">${icon('layers')}Libro de práctica</h2></div><p class="small muted">Aportes, retiros y operaciones quedan en el libro. ${esc(PRACTICE_ORDER_NOTE)}</p>${pendingCard}</section>`;
}

function idea(t) {
  const caps = t.holdings.map(h => {
    const d = t.invested ? holdingDerived(t, h) : null;
    return d ? `<li>${esc(h.ticker)}: ${pct1(d.actual)} (obj. ${h.weight}%) — ${d.ruleChip === 'ok' ? 'dentro de banda' : 'revisar'}</li>` : `<li>${esc(h.ticker)}: objetivo ${h.weight}%</li>`;
  }).join('');
  return `<section class="idea-section"><div class="section-heading" style="margin-top:0"><h2 class="icon-heading">${icon('file')}La idea</h2><button class="btn" data-action="versions" data-id="${t.id}">Historial</button><button class="btn" data-action="edit-idea" data-id="${t.id}">Editar</button></div><p>${esc(t.thesis)}</p><span class="pill">Horizonte: ${esc(t.horizon)}</span></section><section class="idea-section"><h2>Qué nos haría cambiar de opinión</h2><p>${esc(t.invalidation)}</p></section><section class="idea-section"><h2>Reglas</h2><ul>${caps}</ul><a class="nav-link" href="#/take/${t.id}/settings">Preferencias →</a></section>`;
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
  const cap = t.settings?.cap ?? 25;
  const drift = t.settings?.drift ?? 5;
  const rulesLine = `Reglas: tope ${cap}% · desvío ±${drift} pp. Precios demorados. No se envían órdenes.`;
  const toolbar = archived ? '' : draft
    ? `<div class="take-toolbar"><button class="btn primary" data-action="activate" data-id="${id}">Activar práctica</button></div>`
    : `<div class="take-toolbar">${reviewControl(t)}<button class="btn primary btn-ink" data-action="scenario" data-id="${id}">Probar escenario</button></div>`;
  const draftNote = draft ? '<div class="callout">Revisá la composición antes de activar.</div>' : '';
  const body = `<div class="take-header"><div class="take-header-row"><div class="take-header-copy"><span class="eyebrow">${draft ? 'Borrador' : archived ? 'Archivada' : 'Cartera de práctica'}</span><h1 tabindex="-1">${esc(t.title)}</h1><p class="take-rules muted">${rulesLine}</p></div>${!draft && !archived ? `<div class="take-header-status">${statusForTake(t)}</div>` : ''}</div></div>${toolbar}${draftNote}<div class="tabs" role="tablist">${[['news', 'Novedades'], ['positions', 'Posiciones'], ['idea', 'La idea'], ['settings', 'Preferencias']].map(([key, label]) => `<button role="tab" aria-selected="${tab === key}" class="tab ${tab === key ? 'active' : ''}" data-action="tab" data-id="${id}" data-value="${key}">${label}</button>`).join('')}</div><div class="take-body take-page-with-dock">${tab === 'positions' ? positions(t) : tab === 'idea' ? idea(t) : tab === 'settings' ? takeSettings(t) : draft ? '<div class="empty">Activá para ver novedades.</div>' : timelineView(t, focus)}<div class="take-dock-spacer" aria-hidden="true"></div></div>`;
  const dock = `<div class="chat-dock chat-dock-take"><form id="take-ask" data-id="${id}" class="dock-inner"><input name="message" maxlength="4000" placeholder="${esc(TAKE_ASK_PLACEHOLDER)}"><button class="btn primary" type="submit">${esc(TAKE_ASK_CTA)}</button></form></div>`;
  return {body, dock};
}

function news(t, focus) {
  return timelineView(t, focus);
}

function takes() {
  let list = state.takes.filter(t => filter === 'all' || filter === t.phase);
  if (attentionFilter) {
    list = list.filter(t => {
      if (t.phase !== 'active') return false;
      const {items} = timelineFor(t);
      return effectiveAttention(t, items).attention === attentionFilter;
    });
  }
  const attnNote = attentionFilter
    ? `<p class="small muted">Filtrado por atención: ${esc(attentionLabels[attentionFilter])}. <a class="nav-link" href="#/takes">Ver todas</a></p>`
    : '';
  return `<div class="page-heading"><h1 tabindex="-1">Mis tesis</h1></div>${attnNote}<div class="filter-row">${[['all', 'Todas'], ['active', 'En seguimiento'], ['draft', 'Borradores'], ['archived', 'Archivadas']].map(([f, l]) => `<button class="filter ${filter === f ? 'active' : ''}" data-action="filter" data-value="${f}">${l}</button>`).join('')}</div><div class="thesis-list">${list.map(thesisRow).join('') || '<p class="empty small">No hay tesis en este filtro.</p>'}</div>`;
}

function newPage() {
  const chips = NEW_EXAMPLES.map((text, i) => `<button type="button" class="btn ghost suggest-chip" data-action="suggest" data-index="${i}">${esc(text)}</button>`).join('');
  return `<div class="new-view"><h1 tabindex="-1">Partí de una tesis</h1><p>${DEF_SHORT}</p><form id="new-chat" class="prompt-box"><textarea id="new-prompt" name="message" maxlength="4000" required placeholder="Describí tu tesis en una o dos oraciones (Argentina o macro LatAm). Horizonte, riesgo o qué la invalidaría, si ya lo sabés."></textarea><div class="suggest-row">${chips}</div><button class="btn primary" type="submit" ${busyChat ? 'disabled' : ''}>Analizar y armar cartera</button></form></div>`;
}

function chatPage(id) {
  const c = state.chats.find(x => x.id === id);
  if (!c) return '<div class="empty">Conversación no encontrada.</div>';
  const overlaps = c.proposal ? [...new Set(c.proposal.holdings.filter(h => active().some(t => t.holdings.some(p => p.ticker === h.ticker))).map(h => h.ticker))] : [];
  const body = `<div class="chat-page chat-page-with-dock"><h1 tabindex="-1">${esc(c.title)}</h1>${c.messages.length ? c.messages.map(m => `<div class="message ${m.role}">${esc(m.content)}</div>`).join('') : '<p class="muted">Partí de una tesis. La Viste analiza mercado, noticias y precios y arma una cartera a la medida.</p>'}${busyChat === id ? '<div class="processing">Pensando…</div>' : ''}${c.proposal ? portfolioCard(c.proposal, c.id, overlaps) : ''}</div>`;
  const dock = `<div class="chat-dock"><form id="chat-send" data-id="${id}" class="dock-inner"><textarea name="message" placeholder="${adjustChatId === id ? 'Escribí qué querés ajustar…' : 'Ajuste o precisión sobre la tesis…'}" required ${busyChat === id ? 'disabled' : ''}></textarea><button class="btn primary" type="submit">Enviar</button></form></div>`;
  return {body, dock};
}

function chats() {
  return `<div class="page-heading"><h1 tabindex="-1">Conversaciones</h1></div>${state.chats.map(c => `<a class="briefing" href="#/chat/${c.id}"><h3>${esc(c.title)}</h3></a>`).join('')}`;
}

function movementRows(moves) {
  if (!moves.length) return '<p class="empty small">Hoy todavía no hubo movimientos.</p>';
  return `<ul class="movement-list">${moves.map(m => {
    const verdictHint = m.item.verdictText
      ? `<span class="move-verdict-hint">${esc(isNoActionVerdict(m.item.verdictText) ? 'Sin acción necesaria' : 'Acción sugerida')}</span>`
      : '';
    const excerpt = (m.item.ruleCite || m.item.body || '').replace(/\s+/g, ' ').trim();
    const excerptBlock = excerpt ? `<span class="move-detail">${esc(excerpt)}</span>` : '';
    return `<li class="movement-item"><a class="movement-row" href="#/take/${m.takeId}/news/${m.item.key}"><span class="move-time">${esc(artClock(m.at))}</span><div class="move-main"><span class="move-type">${esc(m.item.title)}</span><span class="move-thesis">${esc(m.takeTitle)}</span>${excerptBlock}</div>${verdictHint}</a></li>`;
  }).join('')}</ul>`;
}

function activity() {
  const moves = movementsToday(state.takes, state.reviews || [], state.jobs || []);
  return `<div class="page-heading"><h1 tabindex="-1">Actividad</h1><p class="small muted">Movimientos de hoy · horario Argentina</p></div>${movementRows(moves)}`;
}

function settings() {
  return settingsView(state);
}

function adminAgentPage() {
  return renderAdminAgent({aiConfigured: state.config?.aiConfigured});
}

function focusComposer() {
  const el = document.querySelector('.chat-dock textarea, .dock-inner textarea, #take-ask input[name=message]');
  el?.focus();
}

let chatDockObserver = null;

function syncChatDockInset() {
  const dock = document.querySelector('.chat-dock');
  if (!dock) {
    document.documentElement.style.removeProperty('--lv-chat-dock');
    chatDockObserver?.disconnect();
    chatDockObserver = null;
    document.body.classList.remove('has-chat-dock');
    return;
  }
  document.body.classList.add('has-chat-dock');
  const measure = () => {
    const gap = 36;
    const h = Math.ceil(dock.getBoundingClientRect().height + gap);
    document.documentElement.style.setProperty('--lv-chat-dock', `${h}px`);
  };
  measure();
  if (typeof ResizeObserver !== 'undefined') {
    if (!chatDockObserver) chatDockObserver = new ResizeObserver(measure);
    chatDockObserver.disconnect();
    chatDockObserver.observe(dock);
  }
}

function render() {
  if (!state) return;
  syncAttentionFilterFromHash();
  const [page, id, tab, focus] = route();
  const loadingHome = !stateLoaded && !page;
  let dock = '';
  let body = loadingHome
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
                  : page === 'admin' && id === 'agente'
                    ? adminAgentPage()
                    : home();
  if (body && typeof body === 'object' && body.body) {
    dock = body.dock || '';
    body = body.body;
  }
  const adminPage = page === 'admin' && id === 'agente';
  app.innerHTML = shell(body, {skipFooter: adminPage, dock});
  bindTopnavMenu();
  document.title = adminPage ? 'La Viste · Admin · Agente' : 'La Viste · ' + (page === 'take' ? state.takes.find(t => t.id === id)?.title || 'Tesis' : 'Tu espacio');
  if (focus) {
    const el = document.querySelector(`[data-key="${CSS.escape(focus)}"]`);
    el?.scrollIntoView({block: 'center'});
  }
  focusH1();
  bindTickerLogoFallbacks(app);
  scheduleChartPaint();
  syncChatDockInset();
  requestAnimationFrame(() => {
    syncChatDockInset();
    if (adjustChatId) focusComposer();
  });
}

let modalReturnFocus = null;

function modalFocusables() {
  return [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.offsetParent !== null);
}

function openModal(title, content, returnFocusEl = null) {
  modal.innerHTML = `<div class="modal-title"><h2>${esc(title)}</h2><button class="iconbtn" data-action="close" aria-label="Cerrar">${icon('close')}</button></div>${content}`;
  bindTickerLogoFallbacks(modal);
  const scrollY = window.scrollY;
  modalReturnFocus = returnFocusEl instanceof HTMLElement ? returnFocusEl : document.activeElement;
  if (modal.open) modal.close();
  modal.showModal();
  document.documentElement.classList.add('modal-open');
  if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
  modalFocusables()[0]?.focus();
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
      name: h.name,
      before: {pct: d.actual, units: h.units, val: h.units * h.price, weight: h.weight},
      after: {pct: afterPct, units: afterH.units, val: afterVal, weight: h.weight},
    };
  });
  const tableBefore = rows.map(r => `<tr><td>${tickerIdHtml(r.ticker, r.name)}</td><td>${pct1(r.before.pct)} (obj. ${r.before.weight}%)</td><td>${r.before.units} u.</td><td>${money(r.before.val)}</td></tr>`).join('');
  const tableAfter = rows.map(r => `<tr><td>${tickerIdHtml(r.ticker, r.name)}</td><td>${pct1(r.after.pct)} (obj. ${r.after.weight}%)</td><td>${r.after.units} u.</td><td>${money(r.after.val)}</td></tr>`).join('');
  const stack = rows.map(r => `<article class="rebalance-position-card"><div class="rbp-ticker">${tickerIdHtml(r.ticker, r.name)}</div><div class="rbp-row"><span class="rbp-label">Antes</span><span>${pct1(r.before.pct)} · ${r.before.units} u. · ${money(r.before.val)}</span></div><div class="rbp-row"><span class="rbp-label">Después</span><span>${pct1(r.after.pct)} · ${r.after.units} u. · ${money(r.after.val)}</span></div><div class="rbp-obj small muted">Objetivo ${r.before.weight}%</div></article>`).join('');
  const cashBefore = `<p class="rebalance-cash rebalance-cash-desktop">Efectivo · ${money(t.cash)} (${pct1(t.cash / tot * 100)})</p>`;
  const cashAfter = `<p class="rebalance-cash rebalance-cash-desktop">Efectivo · ${money(sim.afterCash)} (${pct1(sim.afterCash / tot * 100)})</p>`;
  const cashPair = `<div class="rebalance-cash-pair"><p class="rebalance-cash"><span class="rbp-label">Antes</span><span>Efectivo · ${money(t.cash)} (${pct1(t.cash / tot * 100)})</span></p><p class="rebalance-cash"><span class="rbp-label">Después</span><span>Efectivo · ${money(sim.afterCash)} (${pct1(sim.afterCash / tot * 100)})</span></p></div>`;
  openModal('Aplicar en práctica', `<p class="modal-copy">Confirmá el rebalance con precios demorados. No se envían órdenes.</p><div class="rebalance-compare"><h3 class="rebalance-phase-heading">Antes</h3><table class="rebalance-table rebalance-table-desktop">${head}<tbody>${tableBefore}</tbody></table>${cashBefore}<h3 class="rebalance-phase-heading">Después (objetivo)</h3><table class="rebalance-table rebalance-table-desktop">${head}<tbody>${tableAfter}</tbody></table>${cashAfter}<h3 class="rebalance-phase-heading rebalance-phase-heading-stack">Por posición</h3><div class="rebalance-stack">${stack}</div>${cashPair}<p class="small muted rebalance-trade-lines">${sim.lines.map(l => esc(l.line)).join('<br>')}</p><button class="btn primary" data-action="confirm-rebalance" data-id="${t.id}" data-version="${t.version}">Aplicar en práctica</button></div>`);
}

function login() {
  state = null;
  stateLoaded = false;
  app.innerHTML = `<div class="login-layout"><section class="login-story"><a href="/" class="brand">la viste<span class="brand-dot">.</span></a><h1>Tu espacio de práctica.</h1><p>${DEF_SHORT}</p></section><section class="login"><h2>Acceso</h2><p class="muted">La Viste es tu espacio privado para practicar tesis con dinero de práctica en ARS.</p><form id="login"><label class="field">Contraseña<input class="input" type="password" name="password" autocomplete="current-password" required></label><div id="login-error" class="login-error" role="alert"></div><button class="btn primary" type="submit">Entrar a mi espacio</button></form><a class="small muted" href="/privacidad">Privacidad y datos ↗</a></section><footer class="login-foot">${practiceFooter()}</footer></div>`;
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
    if (action === 'menu') { /* Suizo layout: sin sidebar */ }
    if (action === 'period') { period = value; render(); }
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
    if (action === 'practice-aporte') openCashModal(id, 'aporte');
    if (action === 'practice-retiro') openCashModal(id, 'retiro');
    if (action === 'practice-trade') openTradeModal(id);
    if (action === 'practice-weights') openWeightsModal(id);
    if (action === 'confirm-order') {
      b.disabled = true;
      await api(`/takes/${id}/orders/${b.dataset.order}/confirm`, {version: Number(version)});
      modal.close();
      await refresh();
      toast('Movimiento anotado en el libro de práctica.');
    }
    if (action === 'cancel-order') {
      b.disabled = true;
      await api(`/takes/${id}/orders/${b.dataset.order}/cancel`, {});
      modal.close();
      await refresh();
      toast('Orden pendiente cancelada.');
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
      openModal('Probar escenario', `<p class="callout">Vista aislada · no modifica tu cartera</p><div class="scenario-list">${[['drop', 'Caída de demostración'], ['broken', 'Ruptura de demostración'], ['recovery', 'Recuperación de demostración'], ['normal', 'Volver al punto de partida']].map(([s, title]) => `<button class="scenario-option" data-action="apply-scenario" data-id="${id}" data-value="${s}"><strong>${title}</strong></button>`).join('')}</div>`);
    }
    if (action === 'apply-scenario') {
      const preview = await api(`/takes/${id}/scenario`, {scenario: value});
      if (!modal.open) return;
      modal.close();
      openModal('Probar escenario', `<p class="callout">Vista aislada · no modifica tu cartera</p><p>${esc(preview.events[0].body)}</p><p>Valor simulado: ${money(total(preview))}</p>`);
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
      if (el) el.value = NEW_EXAMPLES[Number(index)] || '';
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
  openModal('Activar práctica', `<p class="modal-copy">No se envían órdenes. Precios demorados.</p><form id="activate-form" data-id="${takeId}"><label class="field">Capital aportado (ARS)<input class="input" type="number" name="amount" min="100000" value="1000000" required></label><div class="form-actions"><button class="btn ghost" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Activar práctica</button></div></form>`);
}

function openCashModal(takeId, kind) {
  const t = state.takes.find(x => x.id === takeId);
  const title = kind === 'retiro' ? 'Retirar efectivo' : 'Aportar a la práctica';
  const hint = kind === 'retiro'
    ? `Efectivo disponible · ${money(t.cash)}. El retiro baja el capital aportado; no cuenta como pérdida.`
    : `Efectivo actual · ${money(t.cash)}. El aporte sube el capital aportado; no cuenta como rendimiento.`;
  openModal(title, `<p class="modal-copy">${esc(hint)}</p><p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><form id="practice-cash-form" data-id="${takeId}" data-kind="${kind}" data-version="${t.version}"><label class="field">Monto (ARS)<input class="input" type="number" name="amount" min="1" step="1" required></label><div class="form-actions"><button class="btn ghost" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Vista previa</button></div></form>`);
}

function openTradeModal(takeId) {
  const t = state.takes.find(x => x.id === takeId);
  const opts = t.holdings.map(h => `<option value="${esc(h.ticker)}">${esc(h.ticker)} · ${h.units} u. · ${money(h.price)}</option>`).join('');
  openModal('Comprar o vender', `<p class="modal-copy">Por monto o por cantidad. Unidades enteras. ${esc(quoteMetaNote())}.</p><p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><form id="practice-trade-form" data-id="${takeId}" data-version="${t.version}"><label class="field">Operación<select name="side"><option value="compra">Compra</option><option value="venta">Venta</option></select></label><label class="field">Instrumento<select name="ticker">${opts}</select></label><label class="field">Usar<select name="by"><option value="amount">Monto (ARS)</option><option value="units">Cantidad (unidades)</option></select></label><label class="field">Monto (ARS)<input class="input" type="number" name="amount" min="1" step="1"></label><label class="field">Cantidad<input class="input" type="number" name="units" min="1" step="1"></label><div class="form-actions"><button class="btn ghost" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Vista previa</button></div></form>`);
}

function openWeightsModal(takeId) {
  const t = state.takes.find(x => x.id === takeId);
  const rows = t.holdings.map(h => `<label class="field practice-weight-row"><span>${esc(h.ticker)} · hoy ${h.weight}%</span><input class="input" type="number" name="weight-${esc(h.ticker)}" min="0.01" max="${t.settings.cap}" step="0.01" value="${h.weight}" required></label>`).join('');
  openModal('Editar pesos objetivo', `<p class="modal-copy">Se guardan los objetivos. Las tenencias no se mueven hasta un rebalance o una compra/venta confirmada.</p><p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><form id="practice-weights-form" data-id="${takeId}" data-version="${t.version}">${rows}<p class="small muted">La suma debe quedar entre 30% y 95%. Tope por posición ${t.settings.cap}%.</p><div class="form-actions"><button class="btn ghost" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Vista previa</button></div></form>`);
}

async function showPendingPreview(takeId, result) {
  const t = state.takes.find(x => x.id === takeId);
  const order = result.order;
  openModal('Vista previa', `${orderPreviewHtml(order)}<p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><div class="form-actions"><button class="btn ghost" type="button" data-action="cancel-order" data-id="${takeId}" data-order="${order.id}">Cancelar</button><button class="btn primary" type="button" data-action="confirm-order" data-id="${takeId}" data-order="${order.id}" data-version="${t.version}">Confirmar en práctica</button></div>`);
}

document.addEventListener('submit', async e => {
  const f = e.target;
  if (!['login', 'activate-form', 'take-settings', 'new-chat', 'chat-send', 'idea-form', 'take-ask', 'openai-settings', 'iol-settings', 'practice-cash-form', 'practice-trade-form', 'practice-weights-form'].includes(f.id)) return;
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
      toast('Tu tesis quedó en seguimiento de práctica.');
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
    if (f.id === 'practice-cash-form') {
      const result = await api(`/takes/${f.dataset.id}/orders`, {kind: f.dataset.kind, amount: Number(data.amount), version: Number(f.dataset.version)});
      await refresh();
      await showPendingPreview(f.dataset.id, result);
    }
    if (f.id === 'practice-trade-form') {
      const by = data.by;
      const body = {kind: 'trade', side: data.side, ticker: data.ticker, by, version: Number(f.dataset.version)};
      if (by === 'units') body.units = Number(data.units);
      else body.amount = Number(data.amount);
      const result = await api(`/takes/${f.dataset.id}/orders`, body);
      await refresh();
      await showPendingPreview(f.dataset.id, result);
    }
    if (f.id === 'practice-weights-form') {
      const t = state.takes.find(x => x.id === f.dataset.id);
      const weights = t.holdings.map(h => ({ticker: h.ticker, weight: Number(data[`weight-${h.ticker}`])}));
      const result = await api(`/takes/${f.dataset.id}/orders`, {kind: 'weights', weights, version: Number(f.dataset.version)});
      await refresh();
      await showPendingPreview(f.dataset.id, result);
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

function dismissModal() {
  if (modal.open) modal.close();
}

window.addEventListener('hashchange', () => {
  const prevParts = routeBefore.split('|');
  const leavingAdmin = isAdminAgentRoute(prevParts) && !isAdminAgentRoute(route());
  if (leavingAdmin && adminAgentDirty()) {
    const intended = location.hash;
    location.hash = prevParts[0] === 'admin' ? '#/admin/agente' : `#/${prevParts.filter(Boolean).join('/')}`;
    promptAdminLeave(openModal, () => { location.hash = intended; });
    return;
  }
  dismissModal();
  resetRouteScopedState();
  const [page, id, tab] = route();
  routeBefore = `${page}|${id || ''}`;
  if (page === 'admin' && id === 'agente') loadAdminAgent({admin: adminSession}).then(() => render());
  else render();
  window.scrollTo(0, 0);
  if (!(page === 'admin' && id === 'agente')) revalidate({quiet: false});
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
modal.addEventListener('close', () => {
  document.documentElement.classList.remove('modal-open');
  const el = modalReturnFocus;
  modalReturnFocus = null;
  if (el?.focus) el.focus({preventScroll: true});
});
modal.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || !modal.open) return;
  const nodes = modalFocusables();
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

function emptyState() {
  return {takes: [], chats: [], reviews: [], jobs: [], orders: [], consumption: [], config: {}, quotes: {}};
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
    adminSession = session.admin || adminSession;
    updateAdminSession({admin: adminSession});
    bindAdminAgent({render, toast, openModal});
    await loadAppState({quiet: false});
    if (isAdminAgentRoute(route())) {
      await loadAdminAgent({admin: adminSession});
      render();
    }
  } catch (err) {
    app.innerHTML = `<div class="boot"><p>${esc(err.message)}</p>${practiceFooter()}</div>`;
  }
}

boot();
