import {icon} from './icons.js';
import {settingsView, accountView} from './integrations.js';
import {portfolioSeries, portfolioSeriesARS, dayDelta} from './math.js';
import {buildTimeline, movementsToday, artTime, artWhen, artClock} from './timeline.mjs';
import {money, pct1, pctInt, pctSigned, signedMoney, MINUS} from './format.mjs';
import {takeTotal, simulateRebalance, proposalDiff, holdingDerived, bucketsFor, libroPrimary, formatThemePct} from './portfolio.mjs';
import {computeThesisState, countByAttention, takeMatchesAttention} from './thesis-state.mjs';
import {groupNovedades, shouldHideSuggestedAction, formatDayHeading, emptyNovedadesCopy} from './novedades.mjs';
import {porQueRow, porQueKey} from './por-que.mjs';
import {
  PRACTICE_FOOTER, DEF_SHORT, isNoActionVerdict, TAKE_ASK_PLACEHOLDER, TAKE_ASK_CTA,
  VERDICT_ACTION_RULES, PRACTICE_ORDER_NOTE, ENTRY_LEAD, ENTRY_PROPOSE_TITLE, ENTRY_PROPOSE_BODY,
  ENTRY_PROPOSE_CTA, ENTRY_MANUAL_TITLE, ENTRY_MANUAL_BODY, ENTRY_MANUAL_CTA, ENTRY_PROPOSE_SUBMIT,
  ENTRY_MANUAL_USE, ENTRY_SWITCH_MANUAL, ENTRY_SWITCH_PROPOSE, ADJUST_AI_CTA, ADJUST_MANUAL_CTA,
  DRAFT_WEIGHTS_CTA, SETTINGS_ASK_NOTE, DRAFT_GUIDE, ENTRY_PROPOSE_HINT, ENTRY_MANUAL_HINT,
  POS_COMPOSITION_LABEL, POS_BUCKET_UNGROUPED, POS_BUCKET_CASH, POS_BUCKET_CASH_HINT,
  POS_BUCKET_EDIT_WEIGHTS, POS_DRAFT_COMPOSITION, LIBRO_PRIMARY_DEPOSIT, LIBRO_PRIMARY_TRADE,
  LIBRO_MORE, LIBRO_SECONDARY_WITHDRAW, positionsChipLabel, bucketCountLabel,
  HOME_THESIS_DELTA_ZERO, HOME_THESIS_DELTA_UNKNOWN,
  TAKE_HEADER_MONEY_LABEL, TAKE_HEADER_EYEBROW,
  COVERAGE_PARTIAL, POSITIONS_LINK, CHECK_NOW, TRY_SCENARIO, RETRY_CHECK, CHECK_ERROR,
} from './copy.mjs';
import {aggregatePracticeCapital, chartSinglePointMessage, chartPeriodEmptyMessage} from './chart-copy.mjs';
import {tickerIdHtml, bindTickerLogoFallbacks} from './ticker-logo.mjs';
import {
  adminAgentDirty, bindAdminAgent, isAdminAgentRoute, loadAdminAgent, promptAdminLeave, renderAdminAgent, updateAdminSession,
} from './admin-agent.mjs';
import {
  bindAdminFuentes, isAdminFuentesRoute, loadAdminFuentes, renderAdminFuentes, updateAdminFuentesSession,
} from './admin-fuentes.mjs';
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
let pendingDraftWeights = null;
let newsShowAll = new Set();
let newsExpanded = new Set();

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pct = n => pctSigned(n);
const date = s => s ? new Date(s).toLocaleString('es-AR', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : 'Pendiente';
const total = t => takeTotal(t);
const gain = t => t.invested ? (total(t) / t.invested - 1) * 100 : 0;
const active = () => state.takes.filter(t => t.phase === 'active' || t.phase === 'archived');
const attentionLabels = {track: 'En camino', watch: 'Vigilando', review: 'Revisar'};
const phaseLabels = {draft: 'Borrador', archived: 'Archivada'};
const statusMark = (kind, label) => `<span class="status-mark ${esc(kind)}">● ${esc(label)}</span>`;
const statusChip = (kind, label) => `<span class="chip-s ${esc(kind)}">${esc(label)}</span>`;
const phaseChip = p => `<span class="phase">${esc(phaseLabels[p] || p)}</span>`;

function signedPctHoy(n) {
  if (!Number.isFinite(n)) return HOME_THESIS_DELTA_UNKNOWN;
  return `${pctSigned(n)} hoy`;
}

function dayDeltaHtml(t) {
  const d = dayDelta(t);
  if (!d) return `<span class="thesis-list-delta muted">${HOME_THESIS_DELTA_UNKNOWN}</span>`;
  if (Math.round(d.ars) === 0) return `<span class="thesis-list-delta muted">${HOME_THESIS_DELTA_ZERO}</span>`;
  const kind = d.ars > 0 ? 'gain' : 'loss';
  return `<span class="thesis-list-delta ${kind}">${signedMoney(d.ars)} · ${signedPctHoy(d.pct)}</span>`;
}

function timelineFor(t) {
  return buildTimeline(t, (state.reviews || []).filter(r => r.takeId === t.id), (state.jobs || []).filter(j => j.takeId === t.id));
}

function stateForTake(t) {
  return computeThesisState(t, takeStateOpts(t));
}

function statusForTake(t) {
  if (t.phase === 'draft') return phaseChip('draft');
  if (t.phase === 'archived') return phaseChip('archived');
  const st = stateForTake(t);
  return statusChip(st.attention, st.statusLabel);
}

function reasonForTake(t) {
  const st = stateForTake(t);
  return st.motivo || t.attentionReason || t.coverageDetail || 'Seguimiento en curso.';
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
  if (!state) return;
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
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    const controls = btn.getAttribute('aria-controls');
    const panel = (controls && document.getElementById(controls)) || btn.parentElement?.querySelector('.porque-panel');
    if (panel) {
      panel.hidden = !open;
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
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
  const activeNav = p.startsWith('admin/')
    ? page === 'admin' && id === p.slice('admin/'.length)
    : p ? page === p : !page;
  return `<a class="topnav-link ${activeNav ? 'active' : ''}" href="${href}">${label}</a>`;
}

function syncTopnavOpen(open) {
  const btn = document.querySelector('.topnav-toggle');
  const nav = document.getElementById('app-topnav');
  const scrim = document.querySelector('.nav-scrim');
  const bar = document.querySelector('.topbar');
  nav?.classList.toggle('open', open);
  btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.classList.toggle('nav-open', open);
  if (scrim) {
    if (open) scrim.removeAttribute('hidden');
    else scrim.setAttribute('hidden', '');
  }
  if (open && bar) {
    const h = Math.ceil(bar.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--lv-topbar-h', `${h}px`);
  } else {
    document.documentElement.style.removeProperty('--lv-topbar-h');
  }
}

function closeTopnav() {
  syncTopnavOpen(false);
}

function shell(content, {skipFooter = false, dock = ''} = {}) {
  const [page, id] = route();
  const take = page === 'take' && id ? state.takes.find(x => x.id === id) : null;
  const coreNav = [['/', 'Inicio'], ['#/takes', 'Mis tesis'], ['#/new', 'Nueva tesis'], ['#/settings', 'Configuración']];
  const adminNav = adminSession.enabled && adminSession.unlocked
    ? [['#/admin/agente', 'Admin · Agente'], ['#/admin/fuentes', 'Admin · Fuentes']]
    : [];
  const navHtml = coreNav.map(([href, label]) => navLink(href, label, page, id)).join('');
  const overflowHtml = adminNav.map(([href, label]) => navLink(href, label, page, id)).join('');
  const footer = skipFooter ? '' : practiceFooter();
  const meta = take ? '' : '<div class="topbar-right topmeta"><span class="muted">Dinero de práctica · ARS</span></div>';
  const col = page === 'new' ? 'shell-new' : 'shell-col';
  return `<header class="topbar${take ? ' topbar-take' : ''}"><div class="topbar-inner"><a class="brand" href="#/" aria-label="La Viste, inicio">la viste<span class="brand-dot">.</span></a><button type="button" class="topnav-toggle" aria-expanded="false" aria-controls="app-topnav">Menú</button><nav class="topnav" id="app-topnav" aria-label="Principal">${navHtml}${overflowHtml ? `<div class="topnav-overflow" aria-label="Administración">${overflowHtml}</div>` : ''}</nav>${meta}</div></header><div class="nav-scrim" hidden></div><main class="main"><div class="shell ${col}">${content}${footer}</div></main>${dock}`;
}

function bindTopnavMenu() {
  const btn = document.querySelector('.topnav-toggle');
  const nav = document.getElementById('app-topnav');
  const scrim = document.querySelector('.nav-scrim');
  if (!btn || !nav || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  const setOpen = open => syncTopnavOpen(open);
  btn.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  scrim?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('open')) setOpen(false);
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
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
  return `<div class="chart-stack"><div class="chart-host" data-ready="1" data-h="230" data-chart='${esc(JSON.stringify(payload))}'></div></div>`;
}

function chartControls() {
  return `<div class="periods"><button class="period ${period === 'week' ? 'active' : ''}" data-action="period" data-value="week">1S</button><button class="period ${period === 'all' ? 'active' : ''}" data-action="period" data-value="all">Todo</button></div>`;
}

function takeStateOpts(t) {
  return {timelineItems: timelineFor(t).items, quotesAsOf: state?.quotes?.asOf || null};
}

function attentionCounts() {
  return countByAttention(state.takes, t => takeStateOpts(t));
}

function beginnerEntries() {
  return `<div class="entry-paths" role="list" aria-label="Cómo armar la tesis"><article class="entry-card" role="listitem"><p class="eyebrow">${esc(ENTRY_PROPOSE_TITLE)}</p><h3>${esc(ENTRY_PROPOSE_CTA)}</h3><p>${esc(ENTRY_PROPOSE_BODY)}</p><a class="btn primary" href="#/new/proponer">${esc(ENTRY_PROPOSE_CTA)}</a></article><article class="entry-card" role="listitem"><p class="eyebrow">${esc(ENTRY_MANUAL_TITLE)}</p><h3>${esc(ENTRY_MANUAL_CTA)}</h3><p>${esc(ENTRY_MANUAL_BODY)}</p><a class="btn" href="#/new/manual">${esc(ENTRY_MANUAL_CTA)}</a></article></div>`;
}

function homeDemoBlock() {
  const sampleCards = homeDemoSample.map(s => `<article class="take-card demo-card"><div class="card-foot">${statusMark(s.attention, attentionLabels[s.attention])}<span class="pill demo-pill">DEMO</span></div><h3>${esc(s.title)}</h3><p class="reason-line">${esc(s.reason)}</p><div class="take-card-value"><span>${money(s.value)}</span><small class="muted">${esc(s.when)}</small></div></article>`).join('');
  return `<section class="home-demo-sample" id="ejemplo-practica"><div class="section-heading"><h2 class="icon-heading">${icon('layers')}Ejemplo ilustrativo</h2><span class="pill demo-pill">DEMO</span></div><p class="small muted">Así se vería tu espacio con tesis en seguimiento. No son datos reales ni carteras guardadas.</p><div class="take-grid">${sampleCards}</div></section>`;
}

function homeEmptySeed() {
  return `<section class="home-empty card-empty"><p class="eyebrow">Sin tesis todavía</p><h2>Nueva tesis</h2><p>Partí de una idea. Podés pedirle una propuesta a La Viste o armar la cartera a mano.</p><p class="small muted">${esc(ENTRY_LEAD)}</p>${beginnerEntries()}</section>${homeDemoBlock()}`;
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
  const openLink = firstActive ? `<a class="nav-link touch-44" href="#/take/${firstActive.id}">Abrir «${esc(firstActive.title)}» →</a>` : '';
  const dayArs = activeTakes.reduce((s, t) => s + (dayDelta(t)?.ars || 0), 0);
  const hasDay = activeTakes.some(t => dayDelta(t));
  const dayBit = hasDay
    ? ` · <span class="${dayArs < 0 ? 'loss' : 'gain'}">${signedMoney(dayArs)} hoy</span>`
    : '';
  const gainClass = g < 0 ? 'loss' : 'gain';
  const hero = `<section class="hero-n" aria-label="Resumen de práctica"><div class="hero-n-total"><span class="metric-label">${esc(TAKE_HEADER_MONEY_LABEL)}</span><div class="big-number num">${Number.isFinite(amount) ? money(amount) : '—'}</div><div class="hero-delta ${gainClass} num">${pct(g)} desde el inicio${dayBit}</div></div><div class="hero-n-actions"><a href="#/new" class="btn primary">${icon('plus')} Nueva tesis</a>${openLink}</div></section>`;
  const ahoraStat = `<div class="home-stat home-stat-attention"><span class="stat-label">Ahora en tu espacio</span><div class="ahora-pills" role="list" aria-label="Tesis activas por atención">${[['track', 'En camino'], ['watch', 'Vigilando'], ['review', 'Revisar']].map(([k, l]) => `<a role="listitem" class="attention-inline-pill status-mark ${k}${c[k] ? '' : ' muted'}" href="#/takes?f=${k}">● ${l} · ${c[k]}</a>`).join('')}</div></div>`;
  const hoyLink = `<a class="home-stat-link${moves.length ? '' : ' muted'}" href="#/activity"><span class="stat-label">Hoy</span><strong class="stat-value-compact">${moves.length} movimientos</strong></a>`;
  const stats = `<div class="home-stats stats" role="list">${ahoraStat}<div class="home-stat"><span class="stat-label">Último chequeo</span><strong class="stat-value-compact">${last ? artWhen(last.at) : '—'}</strong></div><div class="home-stat"><span class="stat-label">Capital aportado</span><strong class="num stat-value-compact">${money(invested)}</strong></div><div class="home-stat home-stat-hoy">${hoyLink}</div></div>`;
  const chartBlock = `<section class="home-chart"><div class="chart-card-head"><div><span class="eyebrow">Evolución agregada</span><p class="small muted">${esc(quoteMetaNote())}</p></div>${chartControls()}</div>${chart(aggregateHistory(), 'Evolución de práctica agregada')}</section>`;
  const list = `<div class="section-heading"><h2>Tus tesis</h2></div><div class="thesis-list">${activeTakes.map(thesisRow).join('') || '<p class="empty small">No hay tesis activas.</p>'}${drafts.length ? `<div class="section-heading"><h2>Borradores</h2></div>${drafts.map(thesisRow).join('')}` : ''}</div>`;
  return `${!state.config.aiConfigured ? '<div class="pending-banner"><strong>Falta conectar OpenAI.</strong> <a class="btn" href="#/settings">Configurar OpenAI</a></div>' : ''}${hero}${stats}${chartBlock}${list}`;
}

function thesisRow(t) {
  const reason = reasonForTake(t);
  const liveMoney = t.phase !== 'draft' && t.invested > 0;
  const amount = liveMoney ? money(total(t)) : 'Lista para activar';
  const gLine = liveMoney ? `<span class="thesis-list-gain ${gain(t) < 0 ? 'negative' : 'positive'}">${pct(gain(t))}</span>` : '';
  const dLine = liveMoney ? dayDeltaHtml(t) : '';
  return `<a class="thesis-list-row" href="#/take/${t.id}">${statusForTake(t)}<span class="thesis-list-title">${esc(t.title)}</span><span class="thesis-list-reason">${esc(reason)}</span><span class="thesis-list-amount"><span class="thesis-list-val">${amount}</span>${gLine}${dLine}</span></a>`;
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
  }).join('')}${diff.removed.length ? `<p class="small muted diff-removed">Sale: ${diff.removed.map(r => `${r.ticker} (${r.weight}%)`).join(', ')}</p>` : ''}</div><p class="small muted card-helper">Se agregan a tu práctica ${proposal.holdings.length} posiciones + ${cash.toFixed(0)}% en efectivo.</p><div class="form-actions card-ctas"><button class="btn primary" type="button" data-action="activate-practice" data-id="${esc(chatId)}" ${busyChat === chatId ? 'disabled' : ''}>Activar práctica</button><button class="btn" type="button" data-action="adjust-proposal" data-id="${esc(chatId)}" aria-pressed="${adjustChatId === chatId}">${esc(ADJUST_AI_CTA)}</button><button class="btn" type="button" data-action="adjust-manual" data-id="${esc(chatId)}">${esc(ADJUST_MANUAL_CTA)}</button></div></div>`;
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
    return {state: 'error', label: RETRY_CHECK, sub: CHECK_ERROR, disabled: false};
  }
  return {state: 'idle', label: CHECK_NOW, sub: '', disabled: false};
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

function reviewUi(t) {
  if (t.phase !== 'active') return null;
  const jobs = (state.jobs || []).filter(j => j.takeId === t.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const job = jobs[0];
  const cd = Math.max(0, reviewCooldownUntil - Date.now());
  return reviewUiState(t, job, cd);
}

function reviewControl(t) {
  const ui = reviewUi(t);
  if (!ui) return '';
  const revClass = ui.state === 'idle' ? 'rev-default' : `rev-${ui.state}`;
  ensureReviewTick();
  const status = ui.sub ? `<p class="review-status status-line">${esc(ui.sub)}</p>` : '';
  return `<div class="review-control ${revClass}" data-take="${t.id}" data-review-state="${ui.state}"><button class="btn btn-g" data-action="review" data-id="${t.id}" ${ui.disabled ? 'disabled' : ''}>${icon('refresh')} ${esc(ui.label)}</button>${status}</div>`;
}

function headerActions(t) {
  const ui = reviewUi(t);
  if (!ui) return '';
  ensureReviewTick();
  return `<span class="take-header-actions"><button class="btn btn-g" data-action="review" data-id="${t.id}" ${ui.disabled ? 'disabled' : ''}>${icon('refresh')} ${esc(ui.label)}</button><button class="btn btn-g" data-action="scenario" data-id="${t.id}">${esc(TRY_SCENARIO)}</button></span>`;
}

function canApplyRebalance(t) {
  if (t?.phase !== 'active' || !state.config.rebalanceAvailable) return false;
  const st = stateForTake(t);
  if (!st.live.hasCapBreach && !st.live.hasDriftBreach) return false;
  return simulateRebalance(t).lines.length > 0;
}

function rebalanceApplyHtml(t) {
  if (!canApplyRebalance(t)) return '';
  const sim = simulateRebalance(t);
  const afterPct = pct1((sim.afterCash / sim.total) * 100);
  const trades = sim.lines.map(l => esc(l.line)).join('<br>');
  return `<p class="rebalance-trade-lines">${trades}</p><p class="small muted">Efectivo después · ${money(sim.afterCash)} (${afterPct})</p><p class="demo-note">${esc(quoteMetaNote())}. Nada cambia hasta que aprietes el botón.</p><div class="form-actions"><button class="btn primary" data-action="apply-rebalance" data-id="${t.id}">Aplicar en práctica</button></div>`;
}

function thesisVerdictHtml(t, {withApply = false} = {}) {
  if (t.phase !== 'active') return '';
  const st = stateForTake(t);
  const v = st.verdict;
  const cls = v.attention === 'review' ? 'review' : v.attention === 'watch' ? 'watch' : 'ok';
  const link = v.kind !== 'none'
    ? `<a class="lnk touch-44" href="#/take/${t.id}/positions">${esc(POSITIONS_LINK)}</a>`
    : '';
  const apply = withApply ? rebalanceApplyHtml(t) : '';
  return `<div class="verdict ${cls}" role="status" data-attention="${esc(v.attention)}"><b>${esc(v.title)}</b><p>${esc(v.text)} ${link}</p>${apply}</div>`;
}

function newsCardHtml(t, item, {isNew = false, pageNoAction = false} = {}) {
  const key = item.key || item.eventId || `${item.type}-${item.at}`;
  const open = newsExpanded.has(porQueKey('event', key));
  const hideAction = shouldHideSuggestedAction(item.verdictText, item.body, {pageNoAction});
  const action = !hideAction && item.verdictText
    ? `<p class="news-action">${esc(item.verdictText)}</p>`
    : '';
  const more = `<button type="button" class="news-more touch-44" data-action="news-expand" data-key="${esc(key)}" aria-expanded="${open ? 'true' : 'false'}">${open ? 'Ver menos' : 'Ver más'}</button>`;
  const bodyCls = open ? 'news-body is-open' : 'news-body';
  const headline = item.evidence?.[0]?.title || item.title;
  const extra = open && item.evidence?.length
    ? item.evidence.map(e => `<section class="news-evidence"><p>${esc(e.fact || '')}</p></section>`).join('')
    : '';
  const sources = (item.sources || []).map(s =>
    `<a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`
  ).join(' ');
  return `<article class="news-card${isNew ? ' is-new' : ''}" data-key="${esc(key)}">
    <div class="news-meta"><b>${esc(artClock(item.at))}</b><span>${esc(item.type === 'news' ? 'Revisión de noticias' : item.title)}</span></div>
    <h4>${esc(headline)}</h4>
    <p class="${bodyCls}">${esc(item.body || '')}</p>
    ${extra}${action}${sources ? `<div class="news-sources">${sources}</div>` : ''}${more}
  </article>`;
}

function timelineView(t, focusKey) {
  const {items} = timelineFor(t);
  const st = stateForTake(t);
  if (focusKey) newsExpanded.add(porQueKey('event', focusKey));
  let html = '';
  if (t.coverage === 'partial') {
    html += `<p class="small muted coverage-note">${esc(COVERAGE_PARTIAL)}</p>`;
  } else if (t.coverage && t.coverage !== 'ok') {
    html += `<p class="small muted coverage-note">${esc(t.coverageDetail || COVERAGE_PARTIAL)}</p>`;
  }
  html += thesisVerdictHtml(t, {withApply: true});
  const ui = reviewUi(t);
  if (ui?.state === 'error') {
    html += `<div class="check-error"><p>${esc(CHECK_ERROR)}</p><button type="button" class="btn btn-g" data-action="review" data-id="${t.id}">${esc(RETRY_CHECK)}</button></div>`;
  }
  if (!items.length) {
    html += `<p class="empty small">${esc(emptyNovedadesCopy(t))}</p>`;
    return html;
  }
  const grouped = groupNovedades(items, {showAll: newsShowAll.has(t.id)});
  html += grouped.days.map(day => {
    const heading = formatDayHeading(day.at);
    const cards = day.cards.map(card => {
      if (card.kind === 'collapsed-chequeos') {
        return `<div class="collapse-chequeos">${card.count} chequeos de reglas sin cambios</div>`;
      }
      const lastSeen = localStorage.getItem('lv:lastSeen:' + t.id);
      const isNew = lastSeen && Date.parse(card.item.at) > Date.parse(lastSeen);
      return newsCardHtml(t, card.item, {isNew, pageNoAction: st.verdict.kind === 'none'});
    }).join('');
    return `<div class="news-day"><div class="day-head">${esc(heading)}</div>${cards}</div>`;
  }).join('');
  if (grouped.hiddenCount > 0 && !newsShowAll.has(t.id)) {
    html += `<button type="button" class="btn-show-prev" data-action="news-older" data-id="${t.id}">Mostrar anteriores · ${grouped.hiddenCount}</button>`;
  }
  return html;
}

function verdictBlock(t) {
  return thesisVerdictHtml(t, {withApply: false});
}

function positionsTable(t) {
  const st = stateForTake(t);
  const cap = st.cap;
  const amount = total(t);
  const rows = t.holdings.map((h, i) => {
    const row = st.holdings[i];
    const actual = row?.actual ?? 0;
    const val = row?.value != null ? money(row.value) : '—';
    const estado = row ? ruleChipFromDerived({ruleChip: row.ruleChip}) : '<span class="phase">—</span>';
    return `<tr><td>${tickerIdHtml(h.ticker, h.name)}</td><td class="muted">${esc(h.sector || h.bucket || '')}</td><td>${weightBarHtml(actual, h.weight, cap)}</td><td class="num r">${row?.actualDisplay || '—'}</td><td class="num r">${pctInt(h.weight)}</td><td class="num r">${pctInt(cap)}</td><td class="num r">${val}</td><td>${estado}</td></tr>`;
  }).join('');
  const sum = t.holdings.reduce((s, h) => s + h.weight, 0);
  const cashPct = t.invested > 0 ? pct1(t.cash / amount * 100) : pct1(100 - sum);
  const cashRow = `<tr class="cash-row"><td colspan="6">Efectivo · ${cashPct}</td><td class="num r">${t.invested > 0 ? money(t.cash) : '—'}</td><td></td></tr>`;
  return `${weightLegendHtml()}<table class="table positions-table"><thead><tr><th>Ticker</th><th>Sector</th><th>Peso vs obj / tope</th><th class="r">Peso</th><th class="r">Obj</th><th class="r">Tope</th><th class="r">Valor</th><th>Estado</th></tr></thead><tbody>${rows}${cashRow}</tbody></table>`;
}

function positionsMobileList(t) {
  const st = stateForTake(t);
  const cap = st.cap;
  const amount = total(t);
  const rows = t.holdings.map((h, i) => {
    const row = st.holdings[i];
    const actual = row?.actual ?? 0;
    const val = row?.value != null ? money(row.value) : '—';
    const estado = row ? ruleChipFromDerived({ruleChip: row.ruleChip}) : '<span class="phase">—</span>';
    return `<article class="position-list-row"><div class="position-list-head">${tickerIdHtml(h.ticker, h.name)}<span class="pq-weight num">${row?.actualDisplay || '—'}</span></div>${weightBarHtml(actual, h.weight, cap)}<div class="position-list-meta"><span class="muted">Obj ${pctInt(h.weight)} · tope ${pctInt(cap)}</span><span class="pq-val num">${val}</span></div><div class="position-list-estado">${estado}</div></article>`;
  }).join('');
  const sum = t.holdings.reduce((s, h) => s + h.weight, 0);
  const cashPct = t.invested > 0 ? pct1(t.cash / amount * 100) : pct1(100 - sum);
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

function bucketBreachHtml(t, bucket) {
  if (!t.invested) return '';
  return bucket.holdings.map(h => {
    const d = holdingDerived(t, h);
    if (d.ruleChip === 'ok') return '';
    const chip = d.ruleChip === 'cap' ? 'Sobre tope' : 'Revisar';
    return `<div class="bucket-breach">● Revisar · ${esc(h.ticker)} ${chip} (${pct1(d.actual)})</div>`;
  }).join('');
}

function compositionHtml(t) {
  const holdings = t.holdings || [];
  const {themes, cash, invested} = bucketsFor(t, {ungrouped: POS_BUCKET_UNGROUPED, cashName: POS_BUCKET_CASH});
  if (!holdings.length) {
    return `<section class="composition"><p class="eyebrow">${esc(POS_COMPOSITION_LABEL)}</p><p class="muted small">${esc(POS_DRAFT_COMPOSITION)}</p></section>`;
  }
  const colored = themes.map((b, i) => ({...b, colorVar: `var(--tb-${(i % 4) + 1})`}));
  const cashColored = {...cash, colorVar: 'var(--tb-5)'};
  const barParts = [...colored, cashColored].filter(s => s.pct > 0.05);
  const aria = 'Composición: ' + [...colored, cashColored].map(s => `${s.name} ${formatThemePct(s.pct)}`).join(', ');
  const bar = `<div class="comp-bar" role="img" aria-label="${esc(aria)}">${barParts.map(s => `<i style="width:${s.pct}%;background:${s.colorVar}" title="${esc(s.name)} ${formatThemePct(s.pct)}"></i>`).join('')}</div>`;
  const canEdit = t.phase === 'active';
  const themeRows = colored.map(b => {
    const tickers = b.holdings.map(h => h.ticker).join(' · ');
    const edit = canEdit ? `<button type="button" class="bucket-edit" data-action="practice-weights" data-id="${t.id}">${esc(POS_BUCKET_EDIT_WEIGHTS)}</button>` : '';
    const breach = bucketBreachHtml(t, b);
    return `<div class="bucket${breach ? ' has-breach' : ''}"><span class="bucket-dot" style="background:${b.colorVar}"></span><div><div class="bucket-name">${esc(b.name)}</div><div class="bucket-tickers">${esc(tickers)}</div>${breach}${edit}</div><div><div class="bucket-pct num">${formatThemePct(b.pct)}</div><div class="bucket-meta">${esc(bucketCountLabel(b.holdings.length))}</div></div></div>`;
  }).join('');
  const cashMeta = invested ? money(cashColored.value) : 'sin invertir';
  const cashRow = `<div class="bucket bucket-cash"><span class="bucket-dot" style="background:${cashColored.colorVar}"></span><div><div class="bucket-name">${esc(cashColored.name)}</div><div class="bucket-tickers">${esc(POS_BUCKET_CASH_HINT)}</div></div><div><div class="bucket-pct num">${formatThemePct(cashColored.pct)}</div><div class="bucket-meta">${esc(cashMeta)}</div></div></div>`;
  return `<section class="composition"><p class="eyebrow">${esc(POS_COMPOSITION_LABEL)}</p>${bar}<div class="bucket-list">${themeRows}${cashRow}</div></section>`;
}

function positionsDisclosure(t) {
  const n = (t.holdings || []).length;
  const open = expanded.has(porQueKey('positions-table', t.id));
  const panelId = `positions-table-${t.id}`;
  const disabled = n === 0 ? ' disabled' : '';
  return `<div class="chip-row"><button type="button" class="chip positions-chip" data-action="disclose" data-scope="positions-table" data-key="${esc(t.id)}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${panelId}"${disabled}>${esc(positionsChipLabel(n))} <span class="chev" aria-hidden="true">▾</span></button></div><div id="${panelId}" class="positions-disclosure"${open ? '' : ' hidden'} aria-hidden="${open ? 'false' : 'true'}">${positionsTableWrap(t)}</div>`;
}

function positions(t) {
  const hist = t.history || [];
  const chartBlock = t.phase !== 'draft' && hist.length
    ? `<div class="take-positions-chart"><div class="chart-card-head"><div><span class="eyebrow">Evolución</span><p class="small muted">${esc(quoteMetaNote())}</p></div></div>${chart(hist, t.title, t, {period: 'all'})}</div>`
    : '';
  return `${verdictBlock(t)}<p class="demo-note">${esc(quoteMetaNote())}</p>${compositionHtml(t)}${positionsDisclosure(t)}${practiceDesk(t)}${chartBlock}`;
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

function libroActions(t) {
  const primaryKind = libroPrimary(t);
  const all = [
    {id: 'deposit', action: 'practice-aporte', label: LIBRO_PRIMARY_DEPOSIT},
    {id: 'withdraw', action: 'practice-retiro', label: LIBRO_SECONDARY_WITHDRAW},
    {id: 'trade', action: 'practice-trade', label: LIBRO_PRIMARY_TRADE},
    {id: 'weights', action: 'practice-weights', label: POS_BUCKET_EDIT_WEIGHTS},
  ];
  const primaryId = primaryKind === 'trade' ? 'trade' : 'deposit';
  const primary = all.find(x => x.id === primaryId);
  const restIds = primaryId === 'trade' ? ['deposit', 'withdraw', 'weights'] : ['withdraw', 'trade', 'weights'];
  const rest = restIds.map(id => all.find(x => x.id === id));
  const primaryBtn = `<button class="btn primary libro-primary" type="button" data-action="${primary.action}" data-id="${t.id}">${esc(primary.label)}</button>`;
  const moreItems = rest.map(x => `<button type="button" role="menuitem" data-action="${x.action}" data-id="${t.id}">${esc(x.label)}</button>`).join('');
  const more = `<details class="more-wrap libro-more"><summary class="btn ghost">${esc(LIBRO_MORE)}</summary><div class="more-menu" role="menu">${moreItems}</div></details>`;
  return `<div class="libro-actions">${primaryBtn}${more}</div>`;
}

function practiceDesk(t) {
  if (t.phase !== 'active') return '';
  const pending = pendingForTake(t);
  const pendingCard = pending
    ? `<div class="pending-order"><p class="eyebrow">Orden pendiente</p>${orderPreviewHtml(pending)}<p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><div class="form-actions"><button class="btn primary" type="button" data-action="confirm-order" data-id="${t.id}" data-order="${pending.id}" data-version="${t.version}">Confirmar en práctica</button><button class="btn" type="button" data-action="cancel-order" data-id="${t.id}" data-order="${pending.id}">Cancelar</button></div></div>`
    : libroActions(t);
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
  return `<form id="take-settings" data-id="${t.id}" class="settings-grid"><section class="settings-section"><h2>Cómo la seguimos</h2><p class="small muted">${esc(SETTINGS_ASK_NOTE)}</p><label class="field">Frecuencia<select name="cadence"><option value="patient" ${t.settings.cadence === 'patient' ? 'selected' : ''}>Paciente · cada 7 días</option><option value="standard" ${t.settings.cadence === 'standard' ? 'selected' : ''}>Estándar · cada 24 horas</option><option value="manual" ${t.settings.cadence === 'manual' ? 'selected' : ''}>Solo manual</option></select></label></section><section class="settings-section"><label class="check-label"><input name="monitoringPaused" type="checkbox" ${t.monitoringPaused ? 'checked' : ''}> Pausar seguimiento</label></section><section class="settings-section"><div class="two-cols"><label class="field">Máximo por posición (%)<input class="input" name="cap" type="number" min="10" max="25" required value="${t.settings.cap}"></label><label class="field">Desvío (pp)<input class="input" name="drift" type="number" min="1" max="20" required value="${t.settings.drift}"></label></div><button class="btn primary" type="submit">Guardar preferencias</button>${t.phase === 'active' ? `<button class="btn" type="button" data-action="archive" data-id="${t.id}">Archivar</button>` : ''}</section></form>`;
}

function takePage(id, tab = 'news', focus) {
  tab = tab || 'news';
  const t = state.takes.find(x => x.id === id);
  if (!t) return '<div class="empty">No encontramos esa tesis.</div>';
  const draft = t.phase === 'draft';
  const archived = t.phase === 'archived';
  const st = draft || archived ? null : stateForTake(t);
  const toolbar = archived ? '' : draft
    ? `<div class="take-toolbar"><button class="btn primary" data-action="activate" data-id="${id}">Activar práctica</button><button class="btn" type="button" data-action="draft-weights" data-id="${id}">${esc(DRAFT_WEIGHTS_CTA)}</button></div>`
    : '';
  const draftNote = draft ? `<div class="callout">${esc(DRAFT_GUIDE)}</div>` : '';
  const eyebrow = draft ? 'Borrador' : archived ? 'Archivada' : TAKE_HEADER_EYEBROW;
  const dlt = !draft && t.invested ? dayDelta(t) : null;
  const deltaKind = dlt && Math.round(dlt.ars) !== 0 ? (dlt.ars < 0 ? 'loss' : 'gain') : 'muted';
  const deltaTxt = !dlt
    ? ''
    : Math.round(dlt.ars) === 0
      ? HOME_THESIS_DELTA_ZERO
      : `${signedMoney(dlt.ars)} · ${signedPctHoy(dlt.pct)}`;
  const heroNum = draft ? '' : `<div class="take-hero-n num"><span class="take-hero-val">${Number.isFinite(total(t)) ? money(total(t)) : '—'}</span>${deltaTxt ? `<span class="delta ${deltaKind}">${deltaTxt}</span>` : ''}</div>`;
  const chip = archived || draft ? '' : `<div class="take-header-status">${statusChip(st.attention, st.statusLabel)}</div>`;
  const why = archived || draft ? '' : `<p class="why">${esc(st.motivo)}${st.verdict.kind !== 'none' ? ` <a class="lnk touch-44" href="#/take/${id}/positions">${esc(POSITIONS_LINK)}</a>` : ''}</p>`;
  const meta = archived || draft
    ? ''
    : `<div class="meta-row"><span>${esc(st.metaLine || quoteMetaNote())}</span>${headerActions(t)}</div>${reviewUi(t)?.sub ? `<p class="review-status status-line">${esc(reviewUi(t).sub)}</p>` : ''}`;
  const tabs = `<div class="tabs-wrap"><div class="tabs" role="tablist">${[['news', 'Novedades'], ['positions', 'Posiciones'], ['idea', 'La idea'], ['settings', 'Preferencias']].map(([key, label]) => `<button role="tab" aria-selected="${tab === key}" class="tab ${tab === key ? 'active' : ''}" data-action="tab" data-id="${id}" data-value="${key}">${label}</button>`).join('')}</div></div>`;
  const body = `<div class="take-header"><span class="eyebrow lab">${esc(eyebrow)}</span><h1 tabindex="-1">${esc(t.title)}</h1>${heroNum}${chip}${why}${meta}</div>${toolbar}${draftNote}${tabs}<div class="take-body take-page-with-dock">${tab === 'positions' ? positions(t) : tab === 'idea' ? idea(t) : tab === 'settings' ? takeSettings(t) : draft ? '<div class="empty">Activá para ver novedades.</div>' : timelineView(t, focus)}<div class="take-dock-spacer" aria-hidden="true"></div></div>`;
  const dockBtn = (tab === 'news' && canApplyRebalance(t)) ? 'btn btn-g' : 'btn primary';
  const dock = `<div class="chat-dock chat-dock-take"><form id="take-ask" data-id="${id}" class="dock-inner"><input name="message" maxlength="4000" placeholder="${esc(TAKE_ASK_PLACEHOLDER)}" aria-label="${esc(TAKE_ASK_PLACEHOLDER)}"><button class="${dockBtn}" type="submit">${esc(TAKE_ASK_CTA)}</button></form></div>`;
  return {body, dock};
}

function news(t, focus) {
  return timelineView(t, focus);
}

function takes() {
  let list = state.takes.filter(t => filter === 'all' || filter === t.phase);
  if (attentionFilter) {
    list = list.filter(t => takeMatchesAttention(t, attentionFilter, takeStateOpts(t)));
  }
  const attnNote = attentionFilter
    ? `<p class="small muted">Filtrado por atención: ${esc(attentionLabels[attentionFilter])}. <a class="nav-link" href="#/takes">Ver todas</a></p>`
    : '';
  const empty = list.length ? '' : (state.takes.length ? '<p class="empty small">No hay tesis en este filtro.</p>' : beginnerEntries());
  return `<div class="page-heading"><h1 tabindex="-1">Mis tesis</h1></div>${attnNote}<div class="filter-row">${[['all', 'Todas'], ['active', 'En seguimiento'], ['draft', 'Borradores'], ['archived', 'Archivadas']].map(([f, l]) => `<button class="filter ${filter === f ? 'active' : ''}" data-action="filter" data-value="${f}">${l}</button>`).join('')}</div><div class="thesis-list">${list.map(thesisRow).join('') || empty}</div>`;
}

function proposePage() {
  const chips = NEW_EXAMPLES.map((text, i) => `<button type="button" class="btn ghost suggest-chip" data-action="suggest" data-index="${i}">${esc(text)}</button>`).join('');
  return `<div class="new-view"><p class="eyebrow">${esc(ENTRY_PROPOSE_TITLE)}</p><h1 tabindex="-1">Partí de una tesis</h1><p>${esc(ENTRY_PROPOSE_BODY)}</p><form id="new-chat" class="prompt-box"><textarea id="new-prompt" name="message" maxlength="4000" required placeholder="${esc(ENTRY_PROPOSE_HINT)}"></textarea><div class="suggest-row">${chips}</div><button class="btn primary" type="submit" ${busyChat ? 'disabled' : ''}>${esc(ENTRY_PROPOSE_SUBMIT)}</button></form><p class="small muted"><a class="nav-link" href="#/new/manual">${esc(ENTRY_SWITCH_MANUAL)}</a></p></div>`;
}

function manualPage() {
  const templates = state.templates || [];
  const cards = templates.map((t, i) => {
    const tickers = (t.holdings || []).map(h => esc(h.ticker)).join(' · ');
    return `<article class="template-pick"><div><h3>${esc(t.title)}</h3><p>${esc(t.thesis)}</p><p class="small muted">${tickers}</p></div><button type="button" class="btn" data-action="template" data-index="${i}">${esc(ENTRY_MANUAL_USE)}</button></article>`;
  }).join('');
  return `<div class="new-view"><p class="eyebrow">${esc(ENTRY_MANUAL_TITLE)}</p><h1 tabindex="-1">Armá la cartera a mano</h1><p>${esc(ENTRY_MANUAL_HINT)}</p><div class="template-pick-list">${cards}</div><p class="small muted"><a class="nav-link" href="#/new/proponer">${esc(ENTRY_SWITCH_PROPOSE)}</a></p></div>`;
}

function newPage(mode) {
  if (mode === 'proponer') return proposePage();
  if (mode === 'manual') return manualPage();
  return `<div class="new-view"><h1 tabindex="-1">Partí de una tesis</h1><p>${esc(ENTRY_LEAD)}</p>${beginnerEntries()}</div>`;
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

function adminFuentesPage() {
  return renderAdminFuentes();
}

function isAdminChrome(page, id) {
  return page === 'admin' && (id === 'agente' || id === 'fuentes');
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
          ? newPage(id)
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
                    : page === 'admin' && id === 'fuentes'
                      ? adminFuentesPage()
                      : home();
  if (body && typeof body === 'object' && body.body) {
    dock = body.dock || '';
    body = body.body;
  }
  const adminPage = isAdminChrome(page, id);
  app.innerHTML = shell(body, {skipFooter: adminPage, dock});
  bindTopnavMenu();
  document.title = page === 'admin' && id === 'fuentes'
    ? 'La Viste · Admin · Fuentes'
    : adminPage ? 'La Viste · Admin · Agente' : 'La Viste · ' + (page === 'take' ? state.takes.find(t => t.id === id)?.title || 'Tesis' : 'Tu espacio');
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
    if (pendingDraftWeights) {
      const draftId = pendingDraftWeights;
      pendingDraftWeights = null;
      const t = state.takes.find(x => x.id === draftId);
      if (t?.phase === 'draft') openDraftWeightsModal(draftId);
    }
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
  document.querySelectorAll('details.libro-more[open]').forEach(d => {
    if (!d.contains(e.target)) d.removeAttribute('open');
  });
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const {action, id, value, index, scope, key, version} = b.dataset;
  try {
    if (action === 'menu') { /* Suizo layout: sin sidebar */ }
    if (action === 'period') { period = value; render(); }
    if (action === 'filter') { filter = value; render(); }
    if (action === 'tab') go(`/take/${id}/${value}`);
    if (action === 'news-older') { newsShowAll.add(id); render(); }
    if (action === 'news-expand') {
      const k = porQueKey('event', key);
      if (newsExpanded.has(k)) newsExpanded.delete(k); else newsExpanded.add(k);
      render();
    }
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
    if (action === 'adjust-manual') {
      const chat = state.chats.find(c => c.id === id);
      let takeId = chat?.takeId;
      if (!takeId) {
        const t = await api('/takes', {sourceChatId: id});
        takeId = t.id;
        await refresh();
      }
      pendingDraftWeights = takeId;
      go('/take/' + takeId + '/positions');
    }
    if (action === 'draft-weights') openDraftWeightsModal(id);
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

function openDraftWeightsModal(takeId) {
  const t = state.takes.find(x => x.id === takeId);
  if (!t || t.phase !== 'draft') return;
  const rows = t.holdings.map(h => `<label class="field practice-weight-row"><span>${esc(h.ticker)} · hoy ${h.weight}%</span><input class="input" type="number" name="weight-${esc(h.ticker)}" min="0.01" max="${t.settings.cap}" step="0.01" value="${h.weight}" required></label>`).join('');
  openModal(DRAFT_WEIGHTS_CTA, `<p class="modal-copy">${esc(DRAFT_GUIDE)}</p><p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><form id="draft-weights-form" data-id="${takeId}"><div class="draft-weight-rows">${rows}</div><p class="small muted">La suma debe quedar entre 30% y 95%. Tope por posición ${t.settings.cap}%.</p><div class="form-actions"><button class="btn ghost" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Guardar pesos</button></div></form>`);
}

async function showPendingPreview(takeId, result) {
  const t = state.takes.find(x => x.id === takeId);
  const order = result.order;
  openModal('Vista previa', `${orderPreviewHtml(order)}<p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><div class="form-actions"><button class="btn ghost" type="button" data-action="cancel-order" data-id="${takeId}" data-order="${order.id}">Cancelar</button><button class="btn primary" type="button" data-action="confirm-order" data-id="${takeId}" data-order="${order.id}" data-version="${t.version}">Confirmar en práctica</button></div>`);
}

document.addEventListener('submit', async e => {
  const f = e.target;
  if (!['login', 'activate-form', 'take-settings', 'new-chat', 'chat-send', 'idea-form', 'take-ask', 'openai-settings', 'iol-settings', 'practice-cash-form', 'practice-trade-form', 'practice-weights-form', 'draft-weights-form'].includes(f.id)) return;
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
    if (f.id === 'draft-weights-form') {
      const t = state.takes.find(x => x.id === f.dataset.id);
      const weights = t.holdings.map(h => ({ticker: h.ticker, weight: Number(data[`weight-${h.ticker}`])}));
      await api(`/takes/${f.dataset.id}/composition`, {weights});
      modal.close();
      await refresh();
      toast('Pesos del borrador actualizados. La práctica no se activó.');
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
  else if (page === 'admin' && id === 'fuentes') loadAdminFuentes({admin: adminSession}).then(() => render());
  else render();
  window.scrollTo(0, 0);
  if (stateLoaded && !isAdminChrome(page, id)) revalidate({quiet: false});
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
    const syncAdmin = next => {
      adminSession = next;
      updateAdminSession({admin: adminSession});
      updateAdminFuentesSession({admin: adminSession});
    };
    updateAdminSession({admin: adminSession});
    updateAdminFuentesSession({admin: adminSession});
    bindAdminAgent({render, toast, openModal, onUnlock: syncAdmin});
    bindAdminFuentes({render, toast, openModal, onUnlock: syncAdmin});
    await loadAppState({quiet: false});
    if (isAdminAgentRoute(route())) {
      await loadAdminAgent({admin: adminSession});
      render();
    } else if (isAdminFuentesRoute(route())) {
      await loadAdminFuentes({admin: adminSession});
      render();
    }
  } catch (err) {
    app.innerHTML = `<div class="boot"><p>${esc(err.message)}</p>${practiceFooter()}</div>`;
  }
}

boot();
