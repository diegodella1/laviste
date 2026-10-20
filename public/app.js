import {icon} from './icons.js';
import {settingsView, accountView} from './integrations.js';
import {portfolioSeries, portfolioSeriesARS, dayDelta, seriesForRange} from './math.js';
import {buildTimeline, movementsToday, artTime, artWhen, artClock} from './timeline.mjs';
import {money, pct1, pctInt, pctSigned, signedMoney, MINUS} from './format.mjs';
import {takeTotal, simulateRebalance, proposalDiff, holdingDerived, bucketsFor, libroPrimary, formatThemePct} from './portfolio.mjs';
import {computeThesisState, countByAttention, takeMatchesAttention} from './thesis-state.mjs';
import {
  groupNovedades, shouldHideSuggestedAction, formatDayHeading, emptyNovedadesCopy,
  implicationLine, countNewSince, newsChipLabel, curatedNovedades, previewNovedades,
  NEWS_FILTER_ALL, NEWS_FILTER_NEWS, NEWS_FILTER_RULES, isAutoTradeItem,
} from './novedades.mjs';
import {
  autoUiVisible, autoPolicyFor, autoChipHtml, autoChipState, autoSettingsHtml,
  autoConsentFormHtml, autoNewsConsentFormHtml, autoUndoButtonHtml, autoUndoModalHtml,
  autoPutBody, AUTO_CONSENT_TITLE, AUTO_NEWS_CONSENT_TITLE,
} from './auto.mjs';
import {porQueRow, porQueKey} from './por-que.mjs';
import {
  PRACTICE_FOOTER, DEF_SHORT, isNoActionVerdict, TAKE_ASK_PLACEHOLDER, TAKE_ASK_CTA,
  LOGIN_TITLE, LOGIN_LEAD, LOGIN_EMAIL_LABEL, LOGIN_PASSWORD_LABEL, LOGIN_SUBMIT, LOGIN_GOOGLE, LOGIN_GOOGLE_OR,
  LOGIN_GOOGLE_ERROR, LOGIN_GOOGLE_LIMIT, LOGIN_GOOGLE_PASSWORD_ONLY, LOGIN_GOOGLE_CANCEL, LOGIN_GOOGLE_NOACCESS,
  LOGIN_PRIVACY, LOGIN_STORY_TITLE, LOGIN_FORGOT, LOGIN_FORGOT_BODY, LOGIN_FORGOT_GOOGLE,
  SESSION_EXPIRED, USER_MENU_LABEL, USER_MENU_ACCOUNT, USER_MENU_FAQ, USER_LOGOUT, USER_ROLE_SUPERADMIN, USER_ROLE_USER,
  ACCOUNT_EYEBROW, ACCOUNT_TITLE, ACCOUNT_LEAD, ACCOUNT_LOADING, ACCOUNT_LOAD_ERROR, ACCOUNT_RETRY,
  ACCOUNT_DATA_TITLE, ACCOUNT_EMAIL_LABEL, ACCOUNT_EMAIL_HINT, ACCOUNT_ROLE_LABEL, ACCOUNT_ROLE_SUPERADMIN,
  ACCOUNT_GOOGLE_LABEL, ACCOUNT_GOOGLE_ON, ACCOUNT_GOOGLE_OFF, ACCOUNT_GOOGLE_OFF_HINT,
  PW_CHANGE_TITLE, PW_CHANGE_LEAD, PW_CURRENT, PW_NEW, PW_CONFIRM, PW_RULE, PW_SHOW, PW_HIDE,
  PW_SUBMIT, PW_SUBMITTING, PW_OK, PW_OK_SOLO, PW_ERR_CURRENT_EMPTY, PW_ERR_CURRENT, PW_ERR_NEW_EMPTY,
  PW_ERR_SHORT, PW_ERR_LONG, PW_ERR_MATCH, PW_ERR_EMAIL, PW_ERR_SAME, PW_ERR_RATE, PW_ERR_NOT_SET, PW_GOOGLE_ONLY_TITLE,
  PW_GOOGLE_ONLY_BODY, NET_ERROR, pwShowLabel, pwHideLabel, pwOkCopy,
  SESSIONS_TITLE, SESSIONS_NOTE, SESSIONS_REVOKE, sessionsCountLabel, sessionsRevokedLabel,
  DATA_TITLE, DATA_BODY, DATA_EXPORT,
  RESET_CHECKING, RESET_TITLE, RESET_LEAD, RESET_SUBMIT, RESET_SUBMITTING, RESET_OK,
  RESET_INVALID_TITLE, RESET_INVALID_BODY, RESET_MISSING_TITLE, RESET_MISSING_BODY, RESET_RATE, RESET_TO_LOGIN,
  resetForLabel,
  HOME_EMPTY_EYEBROW, HOME_EMPTY_TITLE, HOME_EMPTY_BODY, CHATS_EMPTY, AI_UNAVAILABLE,
  friendlyApiError as mapApiError,
  QUOTA_NEWS_WAITING, QUOTA_MONITORED,
  AI_PAUSED_LABEL, AI_PAUSED_USER, AI_PAUSED_DISABLED_ADMIN, AI_PAUSED_BUDGET_ADMIN,
  AI_BUDGET_80_ADMIN, AI_PRICES_MISSING, budgetSpendLine,
  VERDICT_ACTION_RULES, PRACTICE_ORDER_NOTE, ENTRY_LEAD, ENTRY_PROPOSE_TITLE, ENTRY_PROPOSE_BODY,
  ENTRY_PROPOSE_CTA, ENTRY_MANUAL_TITLE, ENTRY_MANUAL_BODY, ENTRY_MANUAL_CTA, ENTRY_PROPOSE_SUBMIT,
  ENTRY_MANUAL_USE, ENTRY_SWITCH_MANUAL, ENTRY_SWITCH_PROPOSE, ADJUST_AI_CTA, ADJUST_MANUAL_CTA,
  DRAFT_WEIGHTS_CTA, SETTINGS_ASK_NOTE, SETTINGS_ASK_NOTE_AUTO, DRAFT_GUIDE, ENTRY_PROPOSE_HINT, ENTRY_MANUAL_HINT,
  ENTRY_LEAD_AUTO,
  AUTO_UNDO_TITLE, AUTO_UNDO_DONE, AUTO_UNDO_HINT_CLOSED, autoUndoErrorCopy,
  AUTO_ON_TOAST, AUTO_OFF_TOAST, AUTO_NEWS_ON_TOAST, AUTO_NEWS_OFF_TOAST, AUTO_NEEDS_MONITORING,
  POS_COMPOSITION_LABEL, POS_BUCKET_UNGROUPED, POS_BUCKET_CASH, POS_BUCKET_CASH_HINT,
  POS_BUCKET_EDIT_WEIGHTS, POS_DRAFT_COMPOSITION, LIBRO_PRIMARY_DEPOSIT, LIBRO_PRIMARY_TRADE,
  LIBRO_MORE, LIBRO_SECONDARY_WITHDRAW, positionsChipLabel, bucketCountLabel,
  HOME_THESIS_DELTA_ZERO, HOME_THESIS_DELTA_UNKNOWN,
  TAKE_HEADER_MONEY_LABEL, TAKE_HEADER_EYEBROW,
  COVERAGE_PARTIAL, POSITIONS_LINK, CHECK_NOW, TRY_SCENARIO, RETRY_CHECK, CHECK_ERROR,
  P1_IDEA, P1_PREFS, P1_CLOSE, P1_CLOSE_X, P1_NEW_THESIS, P1_RAIL_THESIS, P1_RAIL_DRAFTS,
  P1_DRAFT_LABEL, P1_RESULT_LABEL, P1_CHART_NO_HISTORY, P1_NEWS_EMPTY_FILTER, P1_NEWS_SEE_ALL,
  P1_NEWS_ALL, P1_NEWS_NEWS, P1_NEWS_RULES, P1_PANEL_POSITIONS_ERROR, P1_PANEL_RETRY,
  P1_RANGE_WEEK, P1_RANGE_MONTH, P1_RANGE_ALL, P1_TODAY, P1_RESUMEN,
  showingNovedadesLabel, olderNovedadesLabel,
  TD_SETTINGS_BTN, TD_SETTINGS_ARIA, TD_CAD_SAVED, TD_PAUSE_ON_TOAST, TD_PAUSE_OFF_TOAST,
  TD_RULES_SAVED, TD_ARCHIVE_TITLE, TD_ARCHIVED_TOAST, TD_PRESET_CUSTOM,
} from './copy.mjs';
import {
  ajustesPageHtml, archiveModalHtml, settingsPayload, validateCapDrift, maxTargetWeight,
  parseNum, cadenceLabel, RULES_PRESETS, presetFor,
} from './ajustes.mjs';
import {takeHref, panelFromRoute, isAjustesTab, parseTakeParts, canonicalTakeHash} from './take-route.mjs';
import {aggregatePracticeCapital, chartSinglePointMessage, chartPeriodEmptyMessage, chartNoHistoryMessage, resultPhrase} from './chart-copy.mjs';
import {tickerIdHtml, bindTickerLogoFallbacks} from './ticker-logo.mjs';
import {
  adminAgentDirty, bindAdminAgent, isAdminAgentRoute, loadAdminAgent, promptAdminLeave, renderAdminAgent, updateAdminSession,
} from './admin-agent.mjs';
import {
  bindAdminFuentes, isAdminFuentesRoute, loadAdminFuentes, renderAdminFuentes, updateAdminFuentesSession,
} from './admin-fuentes.mjs';
import {weightBarHtml, weightLegendHtml} from './wbar.mjs';
import {scheduleChartPaint} from './chart-suizo.mjs';
import {PANEL_HOME_HASH, safePanelNext} from './home-route.mjs';

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
let currentUser = null;
let pendingDraftWeights = null;
let newsShowAll = new Set();
let newsExpanded = new Set();
let newsTypeFilter = NEWS_FILTER_ALL;
let panelFocusKey = null;
let lastPanelKey = null;
let lastRenderedRouteKey = null;
let pendingFocusKey = null;
let modalReturnFocusKey = null;
let panelUi = {key: null, scroll: 0, focusAction: '', focusValue: ''};
let takePeriod = 'all';
let googleAuthEnabled = false;
let passwordResetEnabled = false;
let meState = null;
let meError = false;
let meLoadGen = 0;
let meInflight = null;
let accountPwOk = null;
let accountPwAlert = '';
let accountSessionsNote = '';
let pwSubmitted = false;
let resetToken = '';
let resetView = 'missing';
let resetEmail = '';
let resetAlert = '';
let resetSubmitted = false;
let autoState = {available: false, trades: [], policies: {}};

const GOOGLE_G_SVG = '<svg class="google-g" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

function isSuperadmin() {
  return currentUser?.role === 'superadmin';
}

function roleLabel(role) {
  return role === 'superadmin' ? USER_ROLE_SUPERADMIN : USER_ROLE_USER;
}

function resetAccountState() {
  meLoadGen += 1;
  meInflight = null;
  meState = null;
  meError = false;
  accountPwOk = null;
  accountPwAlert = '';
  accountSessionsNote = '';
  pwSubmitted = false;
}

function applySessionUser(user) {
  const nextId = user?.id || null;
  if ((currentUser?.id || null) !== nextId) {
    resetAccountState();
    filter = 'all';
  }
  currentUser = user || null;
  if (!isSuperadmin()) adminSession = {enabled: false, unlocked: false};
  const root = document.documentElement;
  if (currentUser) {
    root.dataset.lvRole = currentUser.role || '';
    root.dataset.lvEmail = currentUser.email || '';
  } else {
    delete root.dataset.lvRole;
    delete root.dataset.lvEmail;
  }
}

function friendlyApiError(err) {
  return mapApiError(err, {superadmin: isSuperadmin()});
}

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

function autoChipForTake(t, {showOff = false} = {}) {
  if (!autoUiVisible(autoState) || t.phase === 'draft' || t.phase === 'archived') return '';
  return autoChipHtml(autoPolicyFor(autoState, t.id), state?.quotes, {
    esc, aiPaused: !!state?.ai?.paused, showOff,
  });
}

function statusForTake(t) {
  if (t.phase === 'draft') return phaseChip('draft');
  if (t.phase === 'archived') return phaseChip('archived');
  const st = stateForTake(t);
  const auto = autoChipForTake(t);
  if (!auto) return statusChip(st.attention, st.statusLabel);
  return `<span class="thesis-chips">${statusChip(st.attention, st.statusLabel)}${auto}</span>`;
}

function autoReasonForTake(t) {
  if (!autoUiVisible(autoState) || t.phase === 'draft' || t.phase === 'archived') return '';
  const st = autoChipState(autoPolicyFor(autoState, t.id), {
    quotes: state?.quotes, aiPaused: !!state?.ai?.paused,
  });
  if (st.kind === 'paused' || st.kind === 'waiting' || st.reasonLabel) return st.reasonLabel;
  return '';
}

function reasonForTake(t) {
  const st = stateForTake(t);
  return st.motivo || t.attentionReason || t.coverageDetail || 'Seguimiento en curso.';
}

async function api(path, body, key, method) {
  const verb = method || (body === undefined ? 'GET' : 'POST');
  const hasBody = body !== undefined;
  const headers = hasBody ? {'Content-Type': 'application/json', 'Idempotency-Key': key || crypto.randomUUID()} : {};
  const r = await fetch('/api' + path, {method: verb, headers, body: hasBody ? JSON.stringify(body) : undefined});
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401 && path !== '/login') {
      login({expired: true});
      throw new Error(SESSION_EXPIRED);
    }
    const error = new Error(data.error || 'No se pudo completar.');
    error.status = r.status;
    if (data.code) error.code = data.code;
    throw error;
  }
  return data;
}

async function apiOptional(path) {
  const r = await fetch('/api' + path);
  if (r.status === 401 && path !== '/login') {
    login({expired: true});
    throw new Error(SESSION_EXPIRED);
  }
  if (r.status === 404) return null;
  const data = await r.json();
  if (!r.ok) {
    const error = new Error(data.error || 'No se pudo completar.');
    error.status = r.status;
    if (data.code) error.code = data.code;
    throw error;
  }
  return data;
}

async function loadAutoState(takes) {
  try {
    const listed = await apiOptional('/auto/trades');
    if (listed === null) {
      autoState = {available: false, trades: [], policies: {}};
      return;
    }
    autoState = {
      available: true,
      trades: listed.trades || [],
      policies: listed.policies || {},
    };
  } catch (err) {
    if (err.message === SESSION_EXPIRED) throw err;
  }
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

function canonicalizeHash() {
  const next = canonicalTakeHash(location.hash);
  if (next && next !== location.hash) history.replaceState(history.state, '', next);
}

function route() {
  return parseTakeParts(location.hash);
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
    auto: [autoState.available, Object.keys(autoState.policies || {}).map(id => {
      const p = autoState.policies[id];
      return [id, p?.enabled, p?.newsTrigger, p?.pausedReason, p?.updatedAt];
    }), (autoState.trades || []).map(t => [t.id, t.status, t.undoTradeId])],
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
    await loadAutoState(next.takes || []);
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
    if (e.message === SESSION_EXPIRED || e.message?.includes('sesión') || e.message?.includes('Iniciá')) {
      login({expired: true});
      return;
    }
    if (!quiet) toast(`No pudimos actualizar. Mostramos lo último que vimos (${hhmm(lastOkAt)}).`);
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

function parseHash(hash) {
  return parseTakeParts(hash);
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
    window.scrollTo(0, 0);
    return;
  }
  const [curPage, curId, curTab] = route();
  const [nextPage, nextId, nextTab] = parseHash(target);
  const curAjustes = curPage === 'take' && isAjustesTab(curTab);
  const nextAjustes = nextPage === 'take' && isAjustesTab(nextTab);
  const curPanel = curPage === 'take' && !curAjustes ? panelFromRoute(curTab) : null;
  const nextPanel = nextPage === 'take' && !nextAjustes ? panelFromRoute(nextTab) : null;
  if (curPage === 'take' && nextPage === 'take' && curId && curId === nextId) {
    if (curPanel && nextPanel) {
      history.replaceState({...(history.state || {}), lvPanel: true}, '', target);
      render();
      return;
    }
    if (curPanel && !nextPanel && !nextAjustes) {
      closeTakePanel(curId);
      return;
    }
  }
  location.hash = target;
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
  const h1 = document.querySelector('.login h1, .main h1, .main .page-heading h1');
  if (h1) {
    h1.setAttribute('tabindex', '-1');
    h1.focus({preventScroll: true});
  }
}

function focusKeyOf(el) {
  if (!el || el === document.body || el === document.documentElement) return null;
  if (!(el instanceof Element)) return null;
  if (el.dataset?.action) {
    return {
      kind: 'action',
      action: el.dataset.action,
      id: el.dataset.id || '',
      value: el.dataset.value || '',
      trade: el.dataset.trade || '',
    };
  }
  if (el.name) {
    return {kind: 'named', name: el.name, value: el.value || '', id: el.id || ''};
  }
  const form = el.form || el.closest?.('form');
  if (form?.id && (el.matches?.('button[type="submit"], [type="submit"]') || (el.tagName === 'BUTTON' && !el.getAttribute('type')))) {
    return {kind: 'submit', formId: form.id};
  }
  if (el.id) return {kind: 'id', id: el.id};
  return null;
}

function rememberFocus(el) {
  const key = focusKeyOf(el);
  if (key) pendingFocusKey = key;
}

function restoreFocusKey(key) {
  if (!key) return false;
  let el = null;
  if (key.kind === 'action') {
    let sel = `[data-action="${CSS.escape(key.action)}"]`;
    if (key.id) sel += `[data-id="${CSS.escape(key.id)}"]`;
    if (key.value) sel += `[data-value="${CSS.escape(key.value)}"]`;
    if (key.trade) sel += `[data-trade="${CSS.escape(key.trade)}"]`;
    el = document.querySelector(sel);
  } else if (key.kind === 'named') {
    if (key.name) {
      el = document.querySelector(`[name="${CSS.escape(key.name)}"]:checked`)
        || (key.value ? document.querySelector(`[name="${CSS.escape(key.name)}"][value="${CSS.escape(key.value)}"]`) : null);
    }
    if (!el && key.id) el = document.getElementById(key.id);
  } else if (key.kind === 'submit' && key.formId) {
    el = document.querySelector(`#${CSS.escape(key.formId)} button[type="submit"], #${CSS.escape(key.formId)} [type="submit"]`);
  } else if (key.kind === 'id') {
    el = document.getElementById(key.id);
  }
  if (!el || el.disabled) return false;
  el.focus({preventScroll: true});
  return document.activeElement === el;
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
  const takesSection = href === '#/takes' && page === 'take';
  const current = activeNav ? ' aria-current="page"' : takesSection ? ' aria-current="true"' : '';
  return `<a class="topnav-link ${activeNav || takesSection ? 'active' : ''}" href="${href}"${current}>${label}</a>`;
}

function isDesktopChrome() {
  return window.matchMedia('(min-width: 1024px)').matches;
}

function syncTopbarHeight() {
  const bar = document.querySelector('.topbar');
  if (!bar || isDesktopChrome()) {
    document.documentElement.style.removeProperty('--lv-topbar-h');
    return 0;
  }
  const h = Math.max(52, Math.ceil(bar.getBoundingClientRect().height));
  document.documentElement.style.setProperty('--lv-topbar-h', `${h}px`);
  return h;
}

function syncTopnavOpen(open) {
  const btn = document.querySelector('.topnav-toggle');
  const nav = document.getElementById('app-topnav');
  const scrim = document.querySelector('.nav-scrim');
  nav?.classList.toggle('open', open);
  btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.classList.toggle('nav-open', open);
  if (scrim) {
    if (open) scrim.removeAttribute('hidden');
    else scrim.setAttribute('hidden', '');
  }
  syncTopbarHeight();
}

function closeTopnav() {
  syncTopnavOpen(false);
}

function panelFocusables(panel) {
  return [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.offsetParent !== null);
}

function snapshotPanelUi() {
  const panel = document.querySelector('.lv-panel');
  if (!panel) {
    panelUi = {key: null, scroll: 0, focusAction: '', focusValue: ''};
    return;
  }
  const body = panel.querySelector('.panel-body');
  const ae = panel.contains(document.activeElement) ? document.activeElement : null;
  panelUi = {
    key: panel.getAttribute('data-panel'),
    scroll: body ? body.scrollTop : 0,
    focusAction: ae?.dataset?.action || '',
    focusValue: ae?.dataset?.value || '',
  };
}

function syncPanelCloseFocus() {
  const [page, , tab] = route();
  const next = page === 'take' && !isAjustesTab(tab) ? panelFromRoute(tab) : null;
  if (lastPanelKey && !next) panelFocusKey = panelFocusKey || lastPanelKey;
  lastPanelKey = next;
}

function setBackgroundInert(on) {
  document.querySelectorAll('.app-frame, .chat-dock').forEach(el => {
    if (on) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  });
}

function restorePanelFocus(panel) {
  if (!panelUi.focusAction) return false;
  let sel = `[data-action="${CSS.escape(panelUi.focusAction)}"]`;
  if (panelUi.focusValue) sel += `[data-value="${CSS.escape(panelUi.focusValue)}"]`;
  const el = panel.querySelector(sel);
  if (!el) return false;
  el.focus({preventScroll: true});
  return true;
}

function closeTakePanel(id) {
  const panel = document.querySelector('.lv-panel');
  panelFocusKey = panel?.getAttribute('data-panel') || lastPanelKey || 'news';
  const resumen = takeHref(id);
  if (location.hash === resumen) {
    render();
    return;
  }
  if (history.state?.lvPanel) {
    history.back();
    return;
  }
  history.replaceState(history.state, '', resumen);
  render();
}

function bindTakePanel() {
  const panel = document.querySelector('.lv-panel');
  document.documentElement.classList.toggle('lv-panel-open', !!panel);
  setBackgroundInert(!!panel);
  if (!panel) return;
  if (panel.getAttribute('data-panel') === 'news') {
    const takeId = panel.querySelector('[data-action="close-panel"]')?.dataset.id;
    if (takeId) {
      try { localStorage.setItem('lv:lastSeen:' + takeId, new Date().toISOString()); } catch {}
    }
  }
  const same = panelUi.key === panel.getAttribute('data-panel');
  const body = panel.querySelector('.panel-body');
  if (same && body) body.scrollTop = panelUi.scroll;
  const restored = same && restorePanelFocus(panel);
  if (!same && !restored) {
    (panel.querySelector('.panel-close') || panelFocusables(panel)[0])?.focus();
  }
  if (panel.dataset.bound) return;
  panel.dataset.bound = '1';
  body?.addEventListener('scroll', () => { panelUi.scroll = body.scrollTop; }, {passive: true});
  panel.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const list = panelFocusables(panel);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  const handle = panel.querySelector('.panel-handle');
  if (!handle) return;
  let startY = 0;
  handle.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, {passive: true});
  handle.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 56) {
      const id = panel.querySelector('[data-action="close-panel"]')?.dataset.id;
      if (id) closeTakePanel(id);
    }
  }, {passive: true});
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('modal')?.open) return;
  const userMenu = document.querySelector('details.user-menu[open]');
  if (userMenu) {
    e.preventDefault();
    closeUserMenu(userMenu);
    return;
  }
  const panel = document.querySelector('.lv-panel');
  if (!panel) return;
  const id = panel.querySelector('[data-action="close-panel"]')?.dataset.id;
  if (id) {
    e.preventDefault();
    closeTakePanel(id);
  }
});

function practiceTotals() {
  const ts = (state?.takes || []).filter(t => t.phase === 'active');
  const amount = ts.reduce((s, t) => s + total(t), 0);
  const dayArs = ts.reduce((s, t) => s + (dayDelta(t)?.ars || 0), 0);
  const hasDay = ts.some(t => dayDelta(t));
  return {amount, dayArs, hasDay, count: ts.length};
}

function topbarPracticeMeta() {
  const {amount, dayArs, hasDay, count} = practiceTotals();
  if (!count) return `<div class="topmeta"><span class="muted">Dinero de práctica · ARS</span></div>`;
  const day = hasDay
    ? `<span class="${dayArs < 0 ? 'loss' : dayArs > 0 ? 'gain' : 'muted'}">${signedMoney(dayArs)} ${P1_TODAY}</span>`
    : '';
  return `<div class="topmeta practice-meta"><b class="num">${money(amount)}</b>${day ? ` · ${day}` : ''}</div>`;
}

function railDot(t) {
  if (t.phase === 'draft') return `<span class="rail-dot draft" aria-label="${esc(P1_DRAFT_LABEL)}"></span>`;
  if (t.phase === 'archived') return `<span class="rail-dot archived" aria-label="Archivada"></span>`;
  const st = stateForTake(t);
  return `<span class="rail-dot ${esc(st.attention)}" aria-label="${esc(st.statusLabel)}"></span>`;
}

function railRow(t, activeId) {
  const on = t.id === activeId ? ' on' : '';
  const dlt = t.phase === 'active' ? dayDelta(t) : null;
  const right = t.phase === 'draft'
    ? `<span class="small">${esc(P1_DRAFT_LABEL)}</span>`
    : !dlt
      ? `<span class="muted num">—</span>`
      : Math.round(dlt.ars) === 0
        ? `<span class="muted num">${signedMoney(0)}</span>`
        : `<span class="${dlt.ars < 0 ? 'loss' : 'gain'} num">${signedMoney(dlt.ars)}</span>`;
  return `<a class="rail-item${on}" href="${takeHref(t.id)}" title="${esc(t.title)}">${railDot(t)}<span class="rail-name">${esc(t.title)}</span>${right}</a>`;
}

function thesisRailHtml(activeId) {
  const takes = (state?.takes || []).filter(t => t.phase === 'active' || t.phase === 'archived');
  const drafts = (state?.takes || []).filter(t => t.phase === 'draft');
  if (!takes.length && !drafts.length) return '';
  return `<aside class="thesis-rail" aria-label="${esc(P1_RAIL_THESIS)}"><a class="rail-new" href="#/new">${esc(P1_NEW_THESIS)}</a><div class="rail-hd">${esc(P1_RAIL_THESIS)}</div>${takes.map(t => railRow(t, activeId)).join('')}${drafts.length ? `<div class="rail-hd">${esc(P1_RAIL_DRAFTS)}</div>${drafts.map(t => railRow(t, activeId)).join('')}` : ''}</aside>`;
}

function userInitial() {
  const source = currentUser?.displayName || currentUser?.email || '?';
  const ch = [...String(source)][0] || '?';
  return ch.toUpperCase();
}

function userMenuIdentity() {
  const email = esc(currentUser?.email || '');
  const role = esc(roleLabel(currentUser?.role));
  return `<p class="user-menu-id"><strong class="user-menu-email">${email}</strong><span class="user-menu-role">${role}</span></p>`;
}

function userMenuPublicLinks({menuItem = false} = {}) {
  const role = menuItem ? ' role="menuitem"' : '';
  const current = route()[0] === 'cuenta' ? ' aria-current="page"' : '';
  return `<a class="user-menu-link" href="#/cuenta"${role}${current}>${esc(USER_MENU_ACCOUNT)}</a><a class="user-menu-link" href="/preguntas#preguntas"${role}>${esc(USER_MENU_FAQ)}</a><a class="user-menu-link" href="/privacidad"${role}>${esc(LOGIN_PRIVACY)}</a>`;
}

function userMenuDesktop() {
  if (!currentUser) return '';
  return `<details class="user-menu" data-user-menu="desktop"><summary class="user-menu-toggle" aria-label="${esc(USER_MENU_LABEL)}" aria-haspopup="menu" aria-expanded="false"><span class="user-menu-avatar" aria-hidden="true">${esc(userInitial())}</span><span class="user-menu-email-short">${esc(currentUser.email || '')}</span></summary><div class="user-menu-panel" role="menu">${userMenuIdentity()}${userMenuPublicLinks({menuItem: true})}<button type="button" class="btn user-menu-logout" data-action="logout" role="menuitem">${icon('exit')}${esc(USER_LOGOUT)}</button></div></details>`;
}

function userMenuDrawer() {
  if (!currentUser) return '';
  return `<div class="user-menu-drawer" data-user-menu="drawer">${userMenuIdentity()}${userMenuPublicLinks()}<button type="button" class="btn user-menu-logout" data-action="logout">${icon('exit')}${esc(USER_LOGOUT)}</button></div>`;
}

function syncUserMenuExpanded(menu) {
  const summary = menu?.querySelector('summary');
  summary?.setAttribute('aria-expanded', menu.open ? 'true' : 'false');
}

function closeUserMenu(menu, {restoreFocus = true} = {}) {
  if (!menu) return;
  const summary = menu.querySelector('summary');
  if (menu.open) menu.removeAttribute('open');
  syncUserMenuExpanded(menu);
  if (restoreFocus) summary?.focus();
}

function bindUserMenu() {
  const menu = document.querySelector('details.user-menu');
  if (!menu) return;
  const summary = menu.querySelector('summary');
  syncUserMenuExpanded(menu);
  if (menu.dataset.bound) return;
  menu.dataset.bound = '1';
  // Native <details> flips `open` as the click default action (after this
  // handler). Mirror the upcoming state so aria-expanded is not a task late.
  summary?.addEventListener('click', () => {
    const willOpen = !menu.open;
    summary.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (willOpen) {
      const first = menu.querySelector('[role="menuitem"]');
      requestAnimationFrame(() => first?.focus());
    }
  });
  menu.addEventListener('toggle', () => {
    syncUserMenuExpanded(menu);
    if (menu.open) {
      const first = menu.querySelector('[role="menuitem"]');
      requestAnimationFrame(() => first?.focus());
      return;
    }
    if (summary && menu.contains(document.activeElement)) summary.focus();
  });
}

function openaiPendingBanner() {
  if (!isSuperadmin() || state.config?.aiConfigured) return '';
  return '<div class="pending-banner"><strong>Falta conectar OpenAI.</strong> <a class="btn" href="#/settings">Configurar OpenAI</a></div>';
}

function aiStatusBanners() {
  const ai = state.ai;
  if (!ai) return '';
  if (isSuperadmin()) {
    const bits = [];
    if (ai.warningPrices) {
      bits.push(`<div class="budget-banner" data-banner="prices" role="status">${esc(AI_PRICES_MISSING)}</div>`);
    }
    if (ai.alert80 && !ai.paused) {
      bits.push(`<div class="budget-banner" data-banner="budget80" role="status">${esc(AI_BUDGET_80_ADMIN)} ${esc(budgetSpendLine(ai))}</div>`);
    }
    if (ai.paused) {
      const detail = ai.pauseReason === 'disabled' ? AI_PAUSED_DISABLED_ADMIN : AI_PAUSED_BUDGET_ADMIN;
      const spend = ai.pauseReason && String(ai.pauseReason).startsWith('budget') ? ` ${esc(budgetSpendLine(ai))}` : '';
      bits.push(`<div class="budget-banner budget-banner-paused" data-banner="paused" role="status"><strong>${esc(AI_PAUSED_LABEL)}.</strong> ${esc(detail)}${spend}</div>`);
    }
    return bits.join('');
  }
  if (!ai.paused) return '';
  return `<div class="ai-paused-banner" data-banner="paused" role="status"><strong>${esc(AI_PAUSED_LABEL)}.</strong> ${esc(AI_PAUSED_USER)}</div>`;
}

function shell(content, {skipFooter = false, dock = '', extra = ''} = {}) {
  const [page, id, tab] = route();
  const take = page === 'take' && id ? state.takes.find(x => x.id === id) : null;
  const ajustes = page === 'take' && isAjustesTab(tab);
  const coreNav = [[PANEL_HOME_HASH, 'Inicio'], ['#/takes', 'Mis tesis'], ['#/new', 'Nueva tesis']];
  if (isSuperadmin()) coreNav.push(['#/settings', 'Configuración']);
  const adminNav = isSuperadmin() && adminSession.enabled && adminSession.unlocked
    ? [['#/admin/agente', 'Admin · Agente'], ['#/admin/fuentes', 'Admin · Fuentes']]
    : [];
  const navHtml = coreNav.map(([href, label]) => navLink(href, label, page, id)).join('');
  const overflowHtml = adminNav.map(([href, label]) => navLink(href, label, page, id)).join('');
  const footer = skipFooter ? '' : practiceFooter();
  const meta = topbarPracticeMeta();
  const col = page === 'new' || ajustes ? 'shell-new' : page === 'take' ? 'shell-take' : page === 'cuenta' ? 'shell-col col-narrow' : 'shell-col';
  const rail = page === 'take' ? thesisRailHtml(take?.id) : '';
  const withRail = rail ? ' has-rail' : '';
  // Single DOM: .topbar restyles as a 240px left sidebar at >=1024 (see app-theme.css).
  return `<header class="topbar${take ? ' topbar-take' : ''}"><div class="topbar-inner"><a class="brand" href="#/" aria-label="La Viste, inicio">la viste<span class="brand-dot">.</span></a><button type="button" class="topnav-toggle" aria-expanded="false" aria-controls="app-topnav">Menú</button><nav class="topnav" id="app-topnav" aria-label="Principal">${navHtml}${overflowHtml ? `<div class="topnav-overflow" aria-label="Administración">${overflowHtml}</div>` : ''}${rail}${userMenuDrawer()}</nav><div class="topbar-right">${meta}${userMenuDesktop()}</div></div></header><div class="nav-scrim" hidden></div><div class="app-frame${withRail}">${rail}<main class="main"><div class="shell ${col}">${aiStatusBanners()}${content}${footer}</div></main></div>${dock}${extra}`;
}

function bindChromeBreakpoint() {
  if (bindChromeBreakpoint.bound) return;
  bindChromeBreakpoint.bound = true;
  const mq = window.matchMedia('(min-width: 1024px)');
  const sync = () => {
    if (mq.matches) closeTopnav();
    syncTopbarHeight();
  };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', sync);
  else mq.addListener(sync);
  window.addEventListener('resize', () => syncTopbarHeight());
}

function bindTopnavMenu() {
  bindChromeBreakpoint();
  const btn = document.querySelector('.topnav-toggle');
  const nav = document.getElementById('app-topnav');
  const scrim = document.querySelector('.nav-scrim');
  if (!btn || !nav || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  const setOpen = open => {
    if (open) document.querySelectorAll('details.user-menu[open]').forEach(d => closeUserMenu(d, {restoreFocus: false}));
    syncTopnavOpen(open);
  };
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
  const chartPeriod = opts.period ?? (take ? takePeriod : period);
  let h = trimChartHistory(history);
  h = seriesForRange(h, chartPeriod);
  h = trimChartHistory(h);
  if (!take && h.length === 1) h = widenAggregateChartHistory(h);
  if (!h.length) {
    const full = seriesForRange(trimChartHistory(history), 'all');
    const empty = take && !full.length
      ? chartNoHistoryMessage()
      : chartPeriodEmptyMessage(quoteMetaNote());
    return `<div class="chart-empty empty">${esc(empty)}</div>`;
  }
  if (h.length === 1) {
    if (take) return `<div class="chart-empty empty small">${esc(chartNoHistoryMessage())}</div>`;
    const capital = aggregatePracticeCapital(state.takes);
    const text = chartSinglePointMessage(capital, {scope: 'practice', quoteMeta: quoteMetaNote()});
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

function availableChartRanges(history) {
  const hist = trimChartHistory(history || []);
  return [
    ['week', P1_RANGE_WEEK],
    ['month', P1_RANGE_MONTH],
    ['all', P1_RANGE_ALL],
  ].filter(([v]) => seriesForRange(hist, v).length > 0);
}

function rangePills(current, action = 'period', history = []) {
  const pills = availableChartRanges(history);
  if (!pills.length) return '';
  return `<div class="periods pills">${pills.map(([v, l]) => `<button type="button" class="period ${current === v ? 'active' : ''}" data-action="${action}" data-value="${v}">${esc(l)}</button>`).join('')}</div>`;
}

function chartControls() {
  return rangePills(period, 'period', aggregateHistory());
}

function takeChartControls(t) {
  return rangePills(takePeriod, 'take-period', t?.history);
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
  const lead = autoUiVisible(autoState) ? ENTRY_LEAD_AUTO : ENTRY_LEAD;
  return `<section class="home-empty card-empty" data-empty="tesis"><p class="eyebrow">${esc(HOME_EMPTY_EYEBROW)}</p><h2>${esc(HOME_EMPTY_TITLE)}</h2><p>${esc(HOME_EMPTY_BODY)}</p><p class="small muted">${esc(lead)}</p>${beginnerEntries()}</section>${homeDemoBlock()}`;
}

function home() {
  if (!state.takes.length) {
    return `${openaiPendingBanner()}<div class="page-heading"><div><p class="eyebrow">Tu espacio</p><h1>Tus tesis.</h1><p>${DEF_SHORT}</p></div></div>${homeEmptySeed()}`;
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
  const openLink = firstActive ? `<a class="nav-link touch-44" href="${takeHref(firstActive.id)}">Abrir «${esc(firstActive.title)}» →</a>` : '';
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
  return `${openaiPendingBanner()}${hero}${stats}${chartBlock}${list}`;
}

function thesisRow(t) {
  const reason = reasonForTake(t);
  const liveMoney = t.phase !== 'draft' && t.invested > 0;
  const amount = liveMoney ? money(total(t)) : 'Lista para activar';
  const gLine = liveMoney ? `<span class="thesis-list-gain ${gain(t) < 0 ? 'negative' : 'positive'}">${pct(gain(t))}</span>` : '';
  const dLine = liveMoney ? dayDeltaHtml(t) : '';
  return `<a class="thesis-list-row" href="${takeHref(t.id)}">${statusForTake(t)}<span class="thesis-list-title">${esc(t.title)}</span><span class="thesis-list-reason">${esc(reason)}</span><span class="thesis-list-amount"><span class="thesis-list-val">${amount}</span>${gLine}${dLine}</span></a>`;
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
  return `<div class="portfolio-card" id="portfolio-card"><div class="portfolio-card-head"><div><span class="eyebrow">Propuesta</span><h2>${esc(proposal.title)}</h2><p class="portfolio-thesis">${esc(proposal.thesis)}</p><span class="pill">${esc(proposal.horizon)}</span><div class="small muted">${proposal.holdings.length} posiciones · ${pctInt(cash)} efectivo</div></div><span class="pill demo-pill">DEMO</span></div>${overlaps.length ? `<div class="callout amber overlap-tickers">Ya tenés exposición en otras tesis: ${overlaps.map(t => tickerIdHtml(t)).join('')}</div>` : ''}<div class="portfolio-holdings">${proposal.holdings.map(h => {
    let chip = '';
    if (diff.added.some(a => a.ticker === h.ticker)) chip = '<span class="chip added">Nueva</span>';
    const ch = diff.changed.find(c => c.ticker === h.ticker);
    if (ch) chip = `<span class="chip diff">${ch.to > ch.from ? 'Sube' : 'Baja'} ${pctInt(ch.from)}→${pctInt(ch.to)}</span>`;
    return porQueRow('draft', {...ctxBase, h: {...h, name: h.name || h.ticker}, t: null, diffChip: chip});
  }).join('')}${diff.removed.length ? `<p class="small muted diff-removed">Sale: ${diff.removed.map(r => `${r.ticker} (${pctInt(r.weight)})`).join(', ')}</p>` : ''}</div><p class="small muted card-helper">Se agregan a tu práctica ${proposal.holdings.length} posiciones + ${pctInt(cash)} en efectivo.</p><div class="form-actions card-ctas"><button class="btn primary" type="button" data-action="activate-practice" data-id="${esc(chatId)}" ${busyChat === chatId ? 'disabled' : ''}>Activar práctica</button><button class="btn" type="button" data-action="adjust-proposal" data-id="${esc(chatId)}" aria-pressed="${adjustChatId === chatId}">${esc(ADJUST_AI_CTA)}</button><button class="btn" type="button" data-action="adjust-manual" data-id="${esc(chatId)}">${esc(ADJUST_MANUAL_CTA)}</button></div></div>`;
}

function newsQuotaExhausted() {
  const quota = state.quota;
  if (quota?.exempt) return false;
  if (quota?.news && Number.isFinite(quota.news.remaining)) {
    return state.config.aiConfigured && quota.news.remaining <= 0;
  }
  const row = (state.consumption || []).find(r => r.kind === 'news');
  const used = row?.calls || 0;
  return state.config.aiConfigured && used >= (state.config.newsLimit || 10);
}

function reviewUiState(t, job, cd) {
  if (!state.config.aiConfigured) {
    return {state: 'no_ai', label: 'Revisar ahora', sub: isSuperadmin() ? 'Conectá OpenAI para revisar noticias.' : AI_UNAVAILABLE, disabled: true};
  }
  if (state.ai?.paused) {
    const sub = isSuperadmin()
      ? (state.ai.pauseReason === 'disabled' ? AI_PAUSED_DISABLED_ADMIN : AI_PAUSED_BUDGET_ADMIN)
      : AI_PAUSED_USER;
    return {state: 'ai_paused', label: AI_PAUSED_LABEL, sub, disabled: true};
  }
  if (t.monitoringPaused) {
    return {state: 'paused', label: 'Revisar ahora', sub: 'El seguimiento está pausado.', disabled: true};
  }
  if (newsQuotaExhausted()) {
    return {state: 'quota', label: 'En espera', sub: QUOTA_NEWS_WAITING, disabled: true};
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
    ? `<a class="lnk touch-44" href="${takeHref(t.id, 'positions')}">${esc(POSITIONS_LINK)}</a>`
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
  const implication = implicationLine(item);
  const impl = implication ? `<p class="news-impl">${esc(implication)}</p>` : '';
  const undo = autoUiVisible(autoState)
    ? autoUndoButtonHtml(item, autoState.trades, {
      esc, takeId: t.id, version: t.version, quotes: state.quotes,
    })
    : '';
  const quoteAsOf = item.meta?.quote?.asOf;
  const quoteLine = quoteAsOf
    ? `<p class="small muted news-quote">${esc(`precio demorado · ${quoteTime(quoteAsOf)}`)}</p>`
    : '';
  const autoAttr = item.meta?.autoTradeId ? ` data-auto-trade="${esc(item.meta.autoTradeId)}"` : '';
  return `<article class="news-card${isNew ? ' is-new' : ''}${isAutoTradeItem(item) ? ' auto-trade-card' : ''}" data-key="${esc(key)}"${autoAttr}>
    <div class="news-meta"><b>${esc(artClock(item.at))}</b><span>${esc(item.type === 'news' ? 'Revisión de noticias' : item.title)}</span></div>
    <h4>${esc(headline)}</h4>
    ${impl}
    <p class="${bodyCls}">${esc(item.body || '')}</p>
    ${quoteLine}${extra}${action}${sources ? `<div class="news-sources">${sources}</div>` : ''}${undo}${more}
  </article>`;
}

function newsDaysHtml(t, grouped, st) {
  const lastSeen = localStorage.getItem('lv:lastSeen:' + t.id);
  return grouped.days.map(day => {
    const heading = formatDayHeading(day.at);
    const cards = day.cards.map(card => {
      if (card.kind === 'collapsed-chequeos') {
        return `<div class="collapse-chequeos">${card.count} chequeos de reglas sin cambios</div>`;
      }
      const isNew = lastSeen && Date.parse(card.item.at) > Date.parse(lastSeen);
      return newsCardHtml(t, card.item, {isNew, pageNoAction: st.verdict.kind === 'none'});
    }).join('');
    return `<div class="news-day"><div class="day-head">${esc(heading)}</div>${cards}</div>`;
  }).join('');
}

function novedadesPreview(t) {
  const {items} = timelineFor(t);
  const st = stateForTake(t);
  if (!items.length) return '';
  const grouped = previewNovedades(items, {limit: 3});
  let html = newsDaysHtml(t, grouped, st);
  if (grouped.hiddenCount > 0) {
    html += `<button type="button" class="btn-show-prev" data-action="tab" data-id="${t.id}" data-value="news">${esc(olderNovedadesLabel(grouped.hiddenCount))}</button>`;
  }
  return html;
}

function newsFilterChips() {
  const chips = [
    [NEWS_FILTER_ALL, P1_NEWS_ALL],
    [NEWS_FILTER_NEWS, P1_NEWS_NEWS],
    [NEWS_FILTER_RULES, P1_NEWS_RULES],
  ];
  return `<div class="news-filters" role="group" aria-label="Filtro de novedades">${chips.map(([v, l]) => `<button type="button" class="news-filter ${newsTypeFilter === v ? 'on' : ''}" data-action="news-filter" data-value="${v}" aria-pressed="${newsTypeFilter === v}">${esc(l)}</button>`).join('')}</div>`;
}

function timelineView(t, focusKey, {withApply = true, preview = false} = {}) {
  const {items} = timelineFor(t);
  const st = stateForTake(t);
  if (focusKey) newsExpanded.add(porQueKey('event', focusKey));
  let html = '';
  if (t.coverage === 'partial') {
    html += `<p class="small muted coverage-note">${esc(COVERAGE_PARTIAL)}</p>`;
  } else if (t.coverage && t.coverage !== 'ok') {
    html += `<p class="small muted coverage-note">${esc(t.coverageDetail || COVERAGE_PARTIAL)}</p>`;
  }
  html += thesisVerdictHtml(t, {withApply});
  const ui = reviewUi(t);
  if (ui?.state === 'error') {
    html += `<div class="check-error"><p>${esc(CHECK_ERROR)}</p><button type="button" class="btn btn-g" data-action="review" data-id="${t.id}">${esc(RETRY_CHECK)}</button></div>`;
  }
  if (!items.length) {
    html += `<p class="empty small">${esc(emptyNovedadesCopy(t))}</p>`;
    return html;
  }
  if (preview) {
    html += novedadesPreview(t);
    return html;
  }
  const grouped = curatedNovedades(items, {filter: newsTypeFilter, showAll: newsShowAll.has(t.id)});
  html += newsFilterChips();
  html += `<p class="news-showing small muted">${esc(showingNovedadesLabel(grouped.shownCount, grouped.totalCount))} <button type="button" class="lnk news-see-all" data-action="news-filter" data-value="${NEWS_FILTER_ALL}">${esc(P1_NEWS_SEE_ALL)}</button></p>`;
  if (!grouped.shownCount) {
    html += `<p class="empty small">${esc(P1_NEWS_EMPTY_FILTER)}</p><button type="button" class="btn" data-action="news-filter" data-value="${NEWS_FILTER_ALL}">${esc(P1_NEWS_SEE_ALL)}</button>`;
    return html;
  }
  html += newsDaysHtml(t, grouped, st);
  if (grouped.hiddenCount > 0 && !newsShowAll.has(t.id)) {
    html += `<button type="button" class="btn-show-prev" data-action="news-older" data-id="${t.id}">${esc(olderNovedadesLabel(grouped.hiddenCount))}</button>`;
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

function compositionParts(t) {
  const holdings = t.holdings || [];
  const {themes, cash, invested} = bucketsFor(t, {ungrouped: POS_BUCKET_UNGROUPED, cashName: POS_BUCKET_CASH});
  const colored = themes.map((b, i) => ({...b, colorVar: `var(--tb-${(i % 4) + 1})`}));
  const cashColored = {...cash, colorVar: 'var(--tb-5)'};
  const barParts = [...colored, cashColored].filter(s => s.pct > 0.05);
  const aria = 'Composición: ' + [...colored, cashColored].map(s => `${s.name} ${formatThemePct(s.pct)}`).join(', ');
  const bar = holdings.length
    ? `<div class="comp-bar" role="img" aria-label="${esc(aria)}">${barParts.map(s => `<i style="width:${s.pct}%;background:${s.colorVar}" title="${esc(s.name)} ${formatThemePct(s.pct)}"></i>`).join('')}</div>`
    : '';
  return {holdings, colored, cashColored, invested, bar};
}

function compositionBarOnly(t) {
  const {bar} = compositionParts(t);
  return bar || '';
}

function compositionHtml(t) {
  const {holdings, colored, cashColored, invested, bar} = compositionParts(t);
  if (!holdings.length) {
    return `<section class="composition"><p class="eyebrow">${esc(POS_COMPOSITION_LABEL)}</p><p class="muted small">${esc(POS_DRAFT_COMPOSITION)}</p></section>`;
  }
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

function positionsRulesLine(t) {
  const st = t.phase === 'active' ? stateForTake(t) : null;
  const cap = st?.cap ?? t.settings?.cap ?? 25;
  const drift = st?.drift ?? t.settings?.drift ?? 5;
  const clock = st?.preciosEn ? ` · precios de las ${artClock(st.preciosEn)}.` : '.';
  return `Tope ${pctInt(cap)} · desvío ±${drift} pp${clock}`;
}

function positionsPanelBody(t) {
  if (!t) {
    return `<p class="empty">${esc(P1_PANEL_POSITIONS_ERROR)}</p><button type="button" class="btn" data-action="panel-retry">${esc(P1_PANEL_RETRY)}</button>`;
  }
  return `<p class="why">${esc(positionsRulesLine(t))}</p>${compositionHtml(t)}${positionsDisclosure(t)}${practiceDesk(t)}`;
}

function positions(t) {
  return positionsPanelBody(t);
}

function takeChartBlock(t) {
  if (t.phase === 'draft') return '';
  const hist = t.history || [];
  const phrase = resultPhrase({
    invested: t.invested,
    value: total(t),
    activatedAt: t.activatedAt || hist[0]?.at,
  });
  const result = `<div class="result-phrase"><div class="lab">${esc(P1_RESULT_LABEL)}</div><div class="result-val num ${phrase.tone}">${esc(phrase.pct)}${phrase.detail ? `<span class="small result-detail">${esc(phrase.detail)}</span>` : ''}</div></div>`;
  return `<div class="take-chart take-positions-chart"><div class="chart-card-head"><div><span class="lab">Valor vs. aportado</span><p class="small muted">${esc(quoteMetaNote())}</p></div>${takeChartControls(t)}</div>${chart(hist, t.title, t, {period: takePeriod})}${result}</div>`;
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
    return d ? `<li>${esc(h.ticker)}: ${pct1(d.actual)} (obj. ${pctInt(h.weight)}) — ${d.ruleChip === 'ok' ? 'dentro de banda' : 'revisar'}</li>` : `<li>${esc(h.ticker)}: objetivo ${pctInt(h.weight)}</li>`;
  }).join('');
  return `<section class="idea-section"><div class="section-heading" style="margin-top:0"><h2 class="icon-heading">${icon('file')}La idea</h2><button class="btn" data-action="versions" data-id="${t.id}">Historial</button><button class="btn" data-action="edit-idea" data-id="${t.id}">Editar</button></div><p>${esc(t.thesis)}</p><span class="pill">Horizonte: ${esc(t.horizon)}</span></section><section class="idea-section"><h2>Qué nos haría cambiar de opinión</h2><p>${esc(t.invalidation)}</p></section><section class="idea-section"><h2>Reglas</h2><ul>${caps}</ul><a class="nav-link" href="${takeHref(t.id, 'ajustes')}">${esc(P1_PREFS)} →</a></section>`;
}

function takeAutoHtml(t) {
  return autoSettingsHtml({
    visible: autoUiVisible(autoState),
    policy: autoPolicyFor(autoState, t.id),
    takeId: t.id,
    version: t.version,
    esc,
    aiPaused: !!state?.ai?.paused,
    trades: autoState.trades,
  });
}

function takeAjustesPage(t) {
  return ajustesPageHtml({t, esc, autoHtml: takeAutoHtml(t)});
}

function newsChipForTake(t) {
  const {items} = timelineFor(t);
  const lastSeen = localStorage.getItem('lv:lastSeen:' + t.id);
  const neu = countNewSince(items, lastSeen);
  return newsChipLabel(items.length, neu);
}

function panelChips(t, openPanel) {
  const n = (t.holdings || []).length;
  const chips = [
    ['positions', positionsChipLabel(n)],
    ['news', newsChipForTake(t)],
    ['idea', P1_IDEA],
  ];
  return `<div class="panel-chips">${chips.map(([key, label]) => {
    const on = openPanel === key;
    const controls = on ? ' aria-controls="take-panel"' : '';
    return `<button type="button" class="panel-chip btn${on ? ' on' : ''}" data-action="tab" data-id="${t.id}" data-value="${key}" aria-expanded="${on ? 'true' : 'false'}"${controls}>${esc(label)}</button>`;
  }).join('')}</div>`;
}

function dockButtonClass(t, panel) {
  if (t.phase === 'draft') return 'btn btn-g';
  if (panel === 'news' && canApplyRebalance(t)) return 'btn btn-g';
  if (panel === 'positions' && t.phase === 'active') return 'btn btn-g';
  return 'btn primary';
}

function takePanelHtml(t, panel, focus) {
  const titles = {positions: 'Posiciones', news: 'Novedades', idea: P1_IDEA};
  const inner = panel === 'positions'
    ? positionsPanelBody(t)
    : panel === 'idea'
      ? idea(t)
      : t.phase === 'draft'
        ? '<div class="empty">Activá para ver novedades.</div>'
        : timelineView(t, focus, {withApply: true});
  return `<div class="lv-scrim" data-action="close-panel" data-id="${t.id}"></div><aside id="take-panel" class="lv-panel" data-panel="${panel}" role="dialog" aria-modal="true" aria-labelledby="panel-title"><div class="panel-handle" aria-hidden="true"></div><header class="panel-head"><div><div class="lab">${esc(t.title)}</div><h2 id="panel-title">${esc(titles[panel] || panel)}</h2></div><button type="button" class="btn panel-close" data-action="close-panel" data-id="${t.id}">${esc(P1_CLOSE_X)}</button></header><div class="panel-body">${inner}</div></aside>`;
}

function takeAjustesBtn(id) {
  return `<a class="btn take-ajustes-btn" href="${takeHref(id, 'ajustes')}" aria-label="${esc(TD_SETTINGS_ARIA)}">${icon('settings')}<span class="ajustes-label">${esc(TD_SETTINGS_BTN)}</span></a>`;
}

function takePage(id, tab = '', focus) {
  const t = state.takes.find(x => x.id === id);
  if (!t) return '<div class="empty">No encontramos esa tesis.</div>';
  if (isAjustesTab(tab)) return {body: takeAjustesPage(t), dock: ''};
  const panel = panelFromRoute(tab);
  const draft = t.phase === 'draft';
  const archived = t.phase === 'archived';
  const st = draft || archived ? null : stateForTake(t);
  const toolbar = archived ? '' : draft
    ? `<div class="take-toolbar"><button class="btn primary" data-action="activate" data-id="${id}">Activar práctica</button><button class="btn" type="button" data-action="draft-weights" data-id="${id}">${esc(DRAFT_WEIGHTS_CTA)}</button></div>`
    : '';
  const draftNote = draft ? `<div class="callout">${esc(DRAFT_GUIDE)}</div>` : '';
  const eyebrow = draft ? P1_DRAFT_LABEL : archived ? 'Archivada' : TAKE_HEADER_EYEBROW;
  const dlt = !draft && t.invested ? dayDelta(t) : null;
  const deltaKind = dlt && Math.round(dlt.ars) !== 0 ? (dlt.ars < 0 ? 'loss' : 'gain') : 'muted';
  const deltaTxt = !dlt
    ? ''
    : Math.round(dlt.ars) === 0
      ? HOME_THESIS_DELTA_ZERO
      : `${signedMoney(dlt.ars)} ${P1_TODAY}`;
  const heroNum = draft ? '' : `<div class="take-hero-n num"><span class="take-hero-val">${Number.isFinite(total(t)) ? money(total(t)) : '—'}</span>${deltaTxt ? `<span class="delta ${deltaKind}">${deltaTxt}</span>` : ''}</div>`;
  const autoReason = archived || draft ? '' : autoReasonForTake(t);
  const chip = archived || draft ? '' : `<div class="take-header-status">${statusChip(st.attention, st.statusLabel)}${autoChipForTake(t)}</div>${autoReason ? `<p class="small muted auto-reason">${esc(autoReason)}</p>` : ''}`;
  const thesisLine = t.thesis ? `<p class="thesis-line">${esc(t.thesis)}</p>` : '';
  const why = archived || draft ? '' : `<p class="why">${esc(st.motivo)}${st.verdict.kind !== 'none' ? ` <a class="lnk touch-44" href="${takeHref(id, 'positions')}">${esc(POSITIONS_LINK)}</a>` : ''}</p>`;
  const meta = archived || draft
    ? ''
    : `<div class="meta-row"><span>${esc(st.metaLine || quoteMetaNote())}</span>${headerActions(t)}</div>${reviewUi(t)?.sub ? `<p class="review-status status-line">${esc(reviewUi(t).sub)}</p>` : ''}`;
  const preview = draft ? '<div class="empty">Activá para ver novedades.</div>' : novedadesPreview(t);
  const resumen = `<div class="take-header"><div class="take-header-top"><span class="eyebrow lab">${esc(eyebrow)}</span>${takeAjustesBtn(id)}</div><h1 tabindex="-1">${esc(t.title)}</h1>${thesisLine}${heroNum}${chip}${why}${meta}</div>${toolbar}${draftNote}${takeChartBlock(t)}${compositionBarOnly(t)}<div class="take-body take-page-with-dock">${panelChips(t, panel)}${preview}<div class="take-dock-spacer" aria-hidden="true"></div></div>`;
  const extra = panel ? takePanelHtml(t, panel, focus) : '';
  const dockBtn = dockButtonClass(t, panel);
  const paused = !!state.ai?.paused;
  const dock = `<div class="chat-dock chat-dock-take"><form id="take-ask" data-id="${id}" class="dock-inner"><input name="message" maxlength="4000" placeholder="${esc(paused ? AI_PAUSED_LABEL : TAKE_ASK_PLACEHOLDER)}" aria-label="${esc(paused ? AI_PAUSED_LABEL : TAKE_ASK_PLACEHOLDER)}" ${paused ? 'disabled' : ''}><button class="${dockBtn}" type="submit" ${paused ? 'disabled' : ''}>${esc(TAKE_ASK_CTA)}</button></form></div>`;
  return {body: resumen, dock, extra};
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
  const empty = list.length ? '' : (state.takes.length
    ? '<p class="empty small">No hay tesis en este filtro.</p>'
    : `<section class="home-empty card-empty takes-empty" data-empty="tesis"><p class="eyebrow">${esc(HOME_EMPTY_EYEBROW)}</p><h2>${esc(HOME_EMPTY_TITLE)}</h2><p>${esc(HOME_EMPTY_BODY)}</p>${beginnerEntries()}</section>`);
  return `<div class="page-heading"><h1 tabindex="-1">Mis tesis</h1></div>${attnNote}<div class="filter-row">${[['all', 'Todas'], ['active', 'En seguimiento'], ['draft', 'Borradores'], ['archived', 'Archivadas']].map(([f, l]) => `<button class="filter ${filter === f ? 'active' : ''}" data-action="filter" data-value="${f}">${l}</button>`).join('')}</div><div class="thesis-list">${list.map(thesisRow).join('') || empty}</div>`;
}

function proposePage() {
  const chips = NEW_EXAMPLES.map((text, i) => `<button type="button" class="btn ghost suggest-chip" data-action="suggest" data-index="${i}">${esc(text)}</button>`).join('');
  const paused = !!state.ai?.paused;
  return `<div class="new-view"><p class="eyebrow">${esc(ENTRY_PROPOSE_TITLE)}</p><h1 tabindex="-1">Partí de una tesis</h1><p>${esc(ENTRY_PROPOSE_BODY)}</p><form id="new-chat" class="prompt-box"><textarea id="new-prompt" name="message" maxlength="4000" required placeholder="${esc(paused ? AI_PAUSED_USER : ENTRY_PROPOSE_HINT)}" ${paused ? 'disabled' : ''}></textarea><div class="suggest-row">${chips}</div><button class="btn primary" type="submit" ${busyChat || paused ? 'disabled' : ''}>${esc(paused ? AI_PAUSED_LABEL : ENTRY_PROPOSE_SUBMIT)}</button></form><p class="small muted"><a class="nav-link" href="#/new/manual">${esc(ENTRY_SWITCH_MANUAL)}</a></p></div>`;
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
  const lead = autoUiVisible(autoState) ? ENTRY_LEAD_AUTO : ENTRY_LEAD;
  return `<div class="new-view"><h1 tabindex="-1">Partí de una tesis</h1><p>${esc(lead)}</p>${beginnerEntries()}</div>`;
}

function chatPage(id) {
  const c = state.chats.find(x => x.id === id);
  if (!c) return '<div class="empty">Conversación no encontrada.</div>';
  const overlaps = c.proposal ? [...new Set(c.proposal.holdings.filter(h => active().some(t => t.holdings.some(p => p.ticker === h.ticker))).map(h => h.ticker))] : [];
  const body = `<div class="chat-page chat-page-with-dock"><h1 tabindex="-1">${esc(c.title)}</h1>${c.messages.length ? c.messages.map(m => `<div class="message ${m.role}">${esc(m.content)}</div>`).join('') : '<p class="muted">Partí de una tesis. La Viste analiza mercado, noticias y precios y arma una cartera a la medida.</p>'}${busyChat === id ? '<div class="processing">Pensando…</div>' : ''}${c.proposal ? portfolioCard(c.proposal, c.id, overlaps) : ''}</div>`;
  const paused = !!state.ai?.paused;
  const dock = `<div class="chat-dock"><form id="chat-send" data-id="${id}" class="dock-inner"><textarea name="message" placeholder="${paused ? AI_PAUSED_LABEL : (adjustChatId === id ? 'Escribí qué querés ajustar…' : 'Ajuste o precisión sobre la tesis…')}" required ${busyChat === id || paused ? 'disabled' : ''}></textarea><button class="btn primary" type="submit" ${paused ? 'disabled' : ''}>Enviar</button></form></div>`;
  return {body, dock};
}

function chats() {
  const list = state.chats || [];
  const empty = list.length ? '' : `<p class="empty small" data-empty="chats">${esc(CHATS_EMPTY)}</p>`;
  return `<div class="page-heading"><h1 tabindex="-1">Conversaciones</h1></div>${list.map(c => `<a class="briefing" href="#/chat/${c.id}"><h3>${esc(c.title)}</h3></a>`).join('')}${empty}`;
}

function movementRows(moves) {
  if (!moves.length) return '<p class="empty small">Hoy todavía no hubo movimientos.</p>';
  return `<ul class="movement-list">${moves.map(m => {
    const verdictHint = m.item.verdictText
      ? `<span class="move-verdict-hint">${esc(isNoActionVerdict(m.item.verdictText) ? 'Sin acción necesaria' : 'Acción sugerida')}</span>`
      : '';
    const excerpt = (m.item.ruleCite || m.item.body || '').replace(/\s+/g, ' ').trim();
    const excerptBlock = excerpt ? `<span class="move-detail">${esc(excerpt)}</span>` : '';
    return `<li class="movement-item"><a class="movement-row" href="${takeHref(m.takeId, 'news', m.item.key)}"><span class="move-time">${esc(artClock(m.at))}</span><div class="move-main"><span class="move-type">${esc(m.item.title)}</span><span class="move-thesis">${esc(m.takeTitle)}</span>${excerptBlock}</div>${verdictHint}</a></li>`;
  }).join('')}</ul>`;
}

function activity() {
  const moves = movementsToday(state.takes, state.reviews || [], state.jobs || []);
  return `<div class="page-heading"><h1 tabindex="-1">Actividad</h1><p class="small muted">Movimientos de hoy · horario Argentina</p></div>${movementRows(moves)}`;
}

function settings() {
  if (!isSuperadmin()) return home();
  return settingsView(state);
}

function pwField({id, name, label, autocomplete, describedBy}) {
  const desc = describedBy ? ` aria-describedby="${esc(describedBy)}"` : '';
  return `<div class="field pw-field">
    <label for="${esc(id)}">${esc(label)}</label>
    <div class="pw-wrap">
      <input class="input" id="${esc(id)}" name="${esc(name)}" type="password" autocomplete="${esc(autocomplete)}" maxlength="1024" required${desc}>
      <button type="button" class="pw-toggle" data-action="pw-toggle" data-for="${esc(id)}" aria-controls="${esc(id)}" aria-pressed="false" aria-label="${esc(pwShowLabel(label))}">${esc(PW_SHOW)}</button>
    </div>
    <p class="field-error" id="${esc(id)}-error" hidden></p>
  </div>`;
}

function setFieldError(id, message) {
  const input = document.getElementById(id);
  const err = document.getElementById(`${id}-error`);
  if (input) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (err) {
    err.textContent = message || '';
    err.hidden = !message;
  }
}

function resetPwVisibility(form) {
  form?.querySelectorAll('.pw-wrap input').forEach(input => { input.type = 'password'; });
  form?.querySelectorAll('.pw-toggle').forEach(btn => {
    const label = document.querySelector(`label[for="${btn.dataset.for}"]`)?.textContent || '';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', pwShowLabel(label));
    btn.textContent = PW_SHOW;
  });
}

function validatePasswordFields({next, confirm, current, hasPassword, email}) {
  const errors = {};
  if (hasPassword && (typeof current !== 'string' || !current)) errors.current = PW_ERR_CURRENT_EMPTY;
  if (typeof next !== 'string' || !next) errors.next = PW_ERR_NEW_EMPTY;
  else if (next.length < 12) errors.next = PW_ERR_SHORT;
  else if (next.length > 1024) errors.next = PW_ERR_LONG;
  else if (email && next.trim().toLowerCase() === String(email).trim().toLowerCase()) errors.next = PW_ERR_EMAIL;
  if (!errors.next && next !== confirm) errors.confirm = PW_ERR_MATCH;
  return errors;
}

function applyPasswordErrors(map, {currentId, nextId, confirmId}) {
  if (currentId) setFieldError(currentId, map.current || '');
  setFieldError(nextId, map.next || '');
  setFieldError(confirmId, map.confirm || '');
  const first = (map.current && currentId) || (map.next && nextId) || (map.confirm && confirmId);
  if (first) document.getElementById(first)?.focus();
  return !map.current && !map.next && !map.confirm;
}

function accountDlRows(me) {
  const googleOn = me.googleEnabled || me.googleLinked;
  const googleValue = me.googleLinked ? ACCOUNT_GOOGLE_ON : ACCOUNT_GOOGLE_OFF;
  const googleHint = !me.googleLinked && googleOn
    ? `<p class="small muted">${esc(ACCOUNT_GOOGLE_OFF_HINT)}</p>` : '';
  const role = me.role === 'superadmin'
    ? `<div><dt>${esc(ACCOUNT_ROLE_LABEL)}</dt><dd>${esc(ACCOUNT_ROLE_SUPERADMIN)}</dd></div>` : '';
  const google = googleOn
    ? `<div><dt>${esc(ACCOUNT_GOOGLE_LABEL)}</dt><dd>${esc(googleValue)}${googleHint}</dd></div>` : '';
  return `<dl class="account-dl">
    <div><dt>${esc(ACCOUNT_EMAIL_LABEL)}</dt><dd><span class="account-email">${esc(me.email)}</span><p class="small muted">${esc(ACCOUNT_EMAIL_HINT)}</p></dd></div>
    ${role}${google}
  </dl>`;
}

function accountPasswordSection(me) {
  if (!me.hasPassword) {
    return `<section class="settings-section" aria-labelledby="account-pw"><h2 id="account-pw">${esc(PW_GOOGLE_ONLY_TITLE)}</h2>
      <div class="callout">${esc(PW_GOOGLE_ONLY_BODY)}</div></section>`;
  }
  const success = accountPwOk
    ? `<p class="form-success" role="status" tabindex="-1">${esc(pwOkCopy(accountPwOk.revokedSessions))}</p>` : '';
  const alert = accountPwAlert ? `<div class="form-alert" role="alert">${esc(accountPwAlert)}</div>` : '';
  return `<section class="settings-section" aria-labelledby="account-pw"><h2 id="account-pw">${esc(PW_CHANGE_TITLE)}</h2>
    <p class="muted">${esc(PW_CHANGE_LEAD)}</p>
    ${success}
    <form id="password-form" novalidate>
      <input type="email" name="username" autocomplete="username" value="${esc(me.email)}" hidden readonly>
      ${pwField({id: 'pw-current', name: 'current', label: PW_CURRENT, autocomplete: 'current-password', describedBy: 'pw-current-error'})}
      ${pwField({id: 'pw-next', name: 'next', label: PW_NEW, autocomplete: 'new-password', describedBy: 'pw-rule pw-next-error'})}
      <p class="small muted" id="pw-rule">${esc(PW_RULE)}</p>
      ${pwField({id: 'pw-confirm', name: 'confirm', label: PW_CONFIRM, autocomplete: 'new-password', describedBy: 'pw-confirm-error'})}
      ${alert}
      <button class="btn primary" type="submit">${esc(PW_SUBMIT)}</button>
    </form>
  </section>`;
}

function accountSessionsSection(me) {
  const many = (me.sessionCount || 1) > 1;
  const revoke = many
    ? `<button type="button" class="btn" data-action="revoke-others">${esc(SESSIONS_REVOKE)}</button>` : '';
  const note = accountSessionsNote ? `<p class="form-success" role="status">${esc(accountSessionsNote)}</p>` : '';
  return `<section class="settings-section" aria-labelledby="account-sessions"><h2 id="account-sessions">${esc(SESSIONS_TITLE)}</h2>
    <p>${esc(sessionsCountLabel(me.sessionCount || 1))}</p>
    <p class="small muted">${esc(SESSIONS_NOTE)}</p>
    ${note}
    ${revoke}
    <button type="button" class="btn ghost" data-action="logout">${esc(USER_LOGOUT)}</button>
  </section>`;
}

function cuentaPage() {
  const heading = `<div class="page-heading"><div><p class="eyebrow">${esc(ACCOUNT_EYEBROW)}</p><h1 tabindex="-1">${esc(ACCOUNT_TITLE)}</h1><p class="muted">${esc(ACCOUNT_LEAD)}</p></div></div>`;
  if (meError) {
    return `<section class="account-page">${heading}<div class="callout error">${esc(ACCOUNT_LOAD_ERROR)}</div><button type="button" class="btn" data-action="retry-account">${esc(ACCOUNT_RETRY)}</button></section>`;
  }
  if (!meState) {
    return `<section class="account-page">${heading}<p class="visually-hidden" role="status">${esc(ACCOUNT_LOADING)}</p>
      <div class="skeleton-panel"><div class="sk lg"></div></div>
      <div class="skeleton-panel"><div class="sk lg"></div></div>
      <div class="skeleton-panel"><div class="sk lg"></div></div></section>`;
  }
  return `<section class="account-page">${heading}
    <section class="settings-section" aria-labelledby="account-datos"><h2 id="account-datos">${esc(ACCOUNT_DATA_TITLE)}</h2>${accountDlRows(meState)}</section>
    ${accountPasswordSection(meState)}
    ${accountSessionsSection(meState)}
    <section class="settings-section" aria-labelledby="account-data"><h2 id="account-data">${esc(DATA_TITLE)}</h2>
      <p>${esc(DATA_BODY)}</p>
      <a class="btn" href="/api/export" download>${icon('download')}${esc(DATA_EXPORT)}</a>
    </section>
  </section>`;
}

function captureResetToken() {
  const token = hashQuery().get('t');
  if (token) {
    resetToken = token;
    history.replaceState(null, '', '/app#/restablecer');
  }
}

function resetShell(inner) {
  return `<div class="login-layout reset-layout"><section class="login-story"><a href="/" class="brand">la viste<span class="brand-dot">.</span></a><h1>${LOGIN_STORY_TITLE}</h1><p>${DEF_SHORT}</p></section><section class="login">${inner}</section><footer class="login-foot">${practiceFooter()}</footer></div>`;
}

function resetPage() {
  captureResetToken();
  if (resetView === 'checking') {
    return resetShell(`<h1 tabindex="-1">${esc(RESET_TITLE)}</h1><p role="status">${esc(RESET_CHECKING)}</p>`);
  }
  if (resetView === 'missing' || !resetToken) {
    return resetShell(`<h1 tabindex="-1">${esc(RESET_MISSING_TITLE)}</h1><p>${esc(RESET_MISSING_BODY)}</p><a class="btn" href="/app">${esc(RESET_TO_LOGIN)}</a>`);
  }
  if (resetView === 'invalid') {
    return resetShell(`<h1 tabindex="-1">${esc(RESET_INVALID_TITLE)}</h1><p>${esc(RESET_INVALID_BODY)}</p><a class="btn" href="/app">${esc(RESET_TO_LOGIN)}</a>`);
  }
  if (resetView === 'rate' && !resetEmail) {
    return resetShell(`<h1 tabindex="-1">${esc(RESET_TITLE)}</h1><p role="alert">${esc(RESET_RATE)}</p><a class="btn" href="/app">${esc(RESET_TO_LOGIN)}</a>`);
  }
  const alert = resetAlert ? `<div class="form-alert" role="alert">${esc(resetAlert)}</div>` : '';
  return resetShell(`<h1 tabindex="-1">${esc(RESET_TITLE)}</h1>
    <p>${esc(resetForLabel(resetEmail))}</p>
    <p class="muted">${esc(RESET_LEAD)}</p>
    <form id="reset-form" novalidate>
      <input type="email" name="username" autocomplete="username" value="${esc(resetEmail)}" hidden readonly>
      ${pwField({id: 'reset-next', name: 'next', label: PW_NEW, autocomplete: 'new-password', describedBy: 'pw-rule reset-next-error'})}
      <p class="small muted" id="pw-rule">${esc(PW_RULE)}</p>
      ${pwField({id: 'reset-confirm', name: 'confirm', label: PW_CONFIRM, autocomplete: 'new-password', describedBy: 'reset-confirm-error'})}
      ${alert}
      <button class="btn primary" type="submit">${esc(RESET_SUBMIT)}</button>
    </form>`);
}

async function bootResetPage() {
  captureResetToken();
  if (!resetToken) {
    resetView = 'missing';
    app.innerHTML = resetPage();
    focusH1();
    return;
  }
  resetView = 'checking';
  app.innerHTML = resetPage();
  focusH1();
  try {
    const data = await api('/auth/reset/check', {token: resetToken});
    resetEmail = data.email || '';
    resetView = 'valid';
    resetAlert = '';
    app.innerHTML = resetPage();
    document.getElementById('reset-next')?.focus();
  } catch (err) {
    if (err.status === 429 || err.code === 'reset_rate_limited') resetView = 'rate';
    else resetView = 'invalid';
    app.innerHTML = resetPage();
    focusH1();
  }
}

function showUnauthenticated() {
  const e = hashQuery().get('e');
  const googleError = e === 'google_limit' ? 'limit'
    : e === 'google_password' ? 'password'
    : e === 'google_cancel' ? 'cancel'
    : e === 'google_noaccess' ? 'noaccess'
    : (e && e.startsWith('google')) ? 'generic'
    : null;
  if (route()[0] === 'login') history.replaceState(history.state, '', '/app');
  if (route()[0] === 'restablecer') {
    bootResetPage();
    return;
  }
  login({googleError});
}

function adminAgentPage() {
  return renderAdminAgent({aiConfigured: state.config?.aiConfigured});
}

function adminFuentesPage() {
  return renderAdminFuentes();
}

function isAdminChrome(page, id) {
  return isSuperadmin() && page === 'admin' && (id === 'agente' || id === 'fuentes');
}

function isSuperadminOnlyPage(page) {
  return page === 'settings' || page === 'admin';
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
  if (route()[0] === 'restablecer') {
    app.innerHTML = resetPage();
    return;
  }
  canonicalizeHash();
  if (!state) return;
  snapshotPanelUi();
  syncPanelCloseFocus();
  syncAttentionFilterFromHash();
  let [page, id, tab, focus] = route();
  if (!isSuperadmin() && isSuperadminOnlyPage(page)) {
    const homeHash = '#/';
    if (location.hash && location.hash !== homeHash) history.replaceState(history.state, '', homeHash);
    page = '';
    id = undefined;
    tab = undefined;
    focus = undefined;
  }
  const loadingHome = !stateLoaded && !page;
  let dock = '';
  let extra = '';
  let body = loadingHome
    ? homeLoadingView()
    : page === 'take'
      ? takePage(id, tab, focus)
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
                : page === 'cuenta'
                  ? cuentaPage()
                  : page === 'activity'
                    ? activity()
                    : page === 'admin' && id === 'agente'
                      ? adminAgentPage()
                      : page === 'admin' && id === 'fuentes'
                        ? adminFuentesPage()
                        : home();
  if (body && typeof body === 'object' && body.body) {
    dock = body.dock || '';
    extra = body.extra || '';
    body = body.body;
  }
  const adminPage = isAdminChrome(page, id);
  const routeKey = [page, id || '', tab || ''].join('/');
  const sameRoute = routeKey === lastRenderedRouteKey;
  const keep = sameRoute ? (focusKeyOf(document.activeElement) || pendingFocusKey) : null;
  pendingFocusKey = null;
  app.innerHTML = shell(body, {skipFooter: adminPage, dock, extra});
  bindTopnavMenu();
  bindUserMenu();
  const takeTitle = page === 'take' ? (state.takes.find(t => t.id === id)?.title || 'Tesis') : '';
  document.title = page === 'admin' && id === 'fuentes'
    ? 'La Viste · Admin · Fuentes'
    : adminPage ? 'La Viste · Admin · Agente'
      : page === 'cuenta' ? 'La Viste · Tu cuenta'
        : page === 'take' && isAjustesTab(tab) ? 'La Viste · Ajustes · ' + takeTitle
          : 'La Viste · ' + (page === 'take' ? takeTitle : 'Tu espacio');
  if (page === 'cuenta') {
    if (!meState && !meError) loadAccount();
  } else {
    resetAccountState();
  }
  if (focus) {
    const el = document.querySelector(`[data-key="${CSS.escape(focus)}"]`);
    el?.scrollIntoView({block: 'center'});
  }
  const restored = keep ? restoreFocusKey(keep) : false;
  if (!restored && !lastPanelKey) focusH1();
  lastRenderedRouteKey = routeKey;
  bindTickerLogoFallbacks(app);
  syncTopbarHeight();
  bindTakePanel();
  scheduleChartPaint();
  syncChatDockInset();
  requestAnimationFrame(() => {
    syncTopbarHeight();
    syncChatDockInset();
    if (panelFocusKey) {
      document.querySelector(`.panel-chip[data-value="${CSS.escape(panelFocusKey)}"]`)?.focus();
      panelFocusKey = null;
    }
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

async function openUndoPreviewModal(take, tradeId, returnFocusEl) {
  const pv = await api(`/auto/trades/${tradeId}/undo/preview`);
  if (!pv.ok) {
    toast(autoUndoErrorCopy(pv.reason));
    return;
  }
  openModal(AUTO_UNDO_TITLE, autoUndoModalHtml({
    line: pv.line, partial: !!pv.partial, takeId: take.id, tradeId,
    version: take.version, fingerprint: pv.fingerprint, esc,
  }), returnFocusEl, {initialFocus: '.form-actions [data-action="close"]'});
}

function openModal(title, content, returnFocusEl = null, {initialFocus} = {}) {
  modal.innerHTML = `<div class="modal-title"><h2>${esc(title)}</h2><button class="iconbtn" data-action="close" aria-label="Cerrar">${icon('close')}</button></div>${content}`;
  bindTickerLogoFallbacks(modal);
  const scrollY = window.scrollY;
  modalReturnFocus = returnFocusEl instanceof HTMLElement ? returnFocusEl : document.activeElement;
  modalReturnFocusKey = focusKeyOf(modalReturnFocus);
  if (modal.open) modal.close();
  modal.showModal();
  document.documentElement.classList.add('modal-open');
  if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
  (initialFocus && modal.querySelector(initialFocus) || modalFocusables()[0])?.focus();
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
  const tableBefore = rows.map(r => `<tr><td>${tickerIdHtml(r.ticker, r.name)}</td><td>${pct1(r.before.pct)} (obj. ${pctInt(r.before.weight)})</td><td>${r.before.units} u.</td><td>${money(r.before.val)}</td></tr>`).join('');
  const tableAfter = rows.map(r => `<tr><td>${tickerIdHtml(r.ticker, r.name)}</td><td>${pct1(r.after.pct)} (obj. ${pctInt(r.after.weight)})</td><td>${r.after.units} u.</td><td>${money(r.after.val)}</td></tr>`).join('');
  const stack = rows.map(r => `<article class="rebalance-position-card"><div class="rbp-ticker">${tickerIdHtml(r.ticker, r.name)}</div><div class="rbp-row"><span class="rbp-label">Antes</span><span>${pct1(r.before.pct)} · ${r.before.units} u. · ${money(r.before.val)}</span></div><div class="rbp-row"><span class="rbp-label">Después</span><span>${pct1(r.after.pct)} · ${r.after.units} u. · ${money(r.after.val)}</span></div><div class="rbp-obj small muted">Objetivo ${pctInt(r.before.weight)}</div></article>`).join('');
  const cashBefore = `<p class="rebalance-cash rebalance-cash-desktop">Efectivo · ${money(t.cash)} (${pct1(t.cash / tot * 100)})</p>`;
  const cashAfter = `<p class="rebalance-cash rebalance-cash-desktop">Efectivo · ${money(sim.afterCash)} (${pct1(sim.afterCash / tot * 100)})</p>`;
  const cashPair = `<div class="rebalance-cash-pair"><p class="rebalance-cash"><span class="rbp-label">Antes</span><span>Efectivo · ${money(t.cash)} (${pct1(t.cash / tot * 100)})</span></p><p class="rebalance-cash"><span class="rbp-label">Después</span><span>Efectivo · ${money(sim.afterCash)} (${pct1(sim.afterCash / tot * 100)})</span></p></div>`;
  openModal('Aplicar en práctica', `<p class="modal-copy">Confirmá el rebalance con precios demorados. No se envían órdenes.</p><div class="rebalance-compare"><h3 class="rebalance-phase-heading">Antes</h3><table class="rebalance-table rebalance-table-desktop">${head}<tbody>${tableBefore}</tbody></table>${cashBefore}<h3 class="rebalance-phase-heading">Después (objetivo)</h3><table class="rebalance-table rebalance-table-desktop">${head}<tbody>${tableAfter}</tbody></table>${cashAfter}<h3 class="rebalance-phase-heading rebalance-phase-heading-stack">Por posición</h3><div class="rebalance-stack">${stack}</div>${cashPair}<p class="small muted rebalance-trade-lines">${sim.lines.map(l => esc(l.line)).join('<br>')}</p><button class="btn primary" data-action="confirm-rebalance" data-id="${t.id}" data-version="${t.version}">Aplicar en práctica</button></div>`);
}

function login({expired = false, googleError = null} = {}) {
  state = null;
  stateLoaded = false;
  autoState = {available: false, trades: [], policies: {}};
  filter = 'all';
  lastRenderedRouteKey = null;
  pendingFocusKey = null;
  resetAccountState();
  applySessionUser(null);
  const error = expired ? SESSION_EXPIRED
    : googleError === 'limit' ? LOGIN_GOOGLE_LIMIT
    : googleError === 'password' ? LOGIN_GOOGLE_PASSWORD_ONLY
    : googleError === 'cancel' ? LOGIN_GOOGLE_CANCEL
    : googleError === 'noaccess' ? LOGIN_GOOGLE_NOACCESS
    : googleError ? LOGIN_GOOGLE_ERROR
    : '';
  const googleBtn = googleAuthEnabled
    ? `<div class="login-or" aria-hidden="true"><span>${LOGIN_GOOGLE_OR}</span></div><a class="btn google" id="login-google" href="/api/auth/google/start">${GOOGLE_G_SVG}<span>${LOGIN_GOOGLE}</span></a>`
    : '';
  const forgotGoogle = googleAuthEnabled ? `<p>${esc(LOGIN_FORGOT_GOOGLE)}</p>` : '';
  app.innerHTML = `<div class="login-layout"><section class="login-story"><a href="/" class="brand">la viste<span class="brand-dot">.</span></a><h1>${LOGIN_STORY_TITLE}</h1><p>${DEF_SHORT}</p></section><section class="login"><h2>${LOGIN_TITLE}</h2><p class="muted">${LOGIN_LEAD}</p><form id="login"><label class="field">${LOGIN_EMAIL_LABEL}<input class="input" type="email" name="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required autofocus></label><label class="field">${LOGIN_PASSWORD_LABEL}<input class="input" type="password" name="password" autocomplete="current-password" required></label><button type="button" class="link-btn" data-action="toggle-forgot" aria-expanded="false" aria-controls="login-forgot">${esc(LOGIN_FORGOT)}</button><div id="login-forgot" class="login-forgot" hidden><p>${esc(LOGIN_FORGOT_BODY)}</p>${forgotGoogle}</div><div id="login-error" class="login-error" role="alert">${esc(error)}</div><button class="btn primary" type="submit">${LOGIN_SUBMIT}</button></form>${googleBtn}<a class="small muted" href="/privacidad">${LOGIN_PRIVACY}</a></section><footer class="login-foot">${practiceFooter()}</footer></div>`;
  if (googleError === 'password' || googleError === 'noaccess') {
    document.querySelector('#login input[name="email"]')?.focus();
  }
}

async function loadAccount() {
  if (meInflight) return meInflight;
  const gen = meLoadGen;
  meError = false;
  meInflight = (async () => {
    try {
      const data = await api('/me');
      if (gen !== meLoadGen) return;
      meState = data;
      render();
    } catch (err) {
      if (gen !== meLoadGen) return;
      if (err.status === 401) return;
      meError = true;
      render();
    } finally {
      if (gen === meLoadGen) meInflight = null;
    }
  })();
  return meInflight;
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
    toast(friendlyApiError(e));
    throw e;
  } finally {
    busyChat = null;
    render();
  }
}

document.addEventListener('click', async e => {
  document.querySelectorAll('details.libro-more[open], details.user-menu[open]').forEach(d => {
    if (d.contains(e.target)) return;
    if (d.matches('.user-menu')) closeUserMenu(d, {restoreFocus: false});
    else d.removeAttribute('open');
  });
  if (e.target.closest('.preset-opt.is-disabled')) {
    e.preventDefault();
    return;
  }
  const b = e.target.closest('[data-action]');
  if (!b) return;
  rememberFocus(b);
  const {action, id, value, index, scope, key, version} = b.dataset;
  try {
    if (action === 'menu') { /* Suizo layout: sin sidebar */ }
    if (action === 'period') { period = value; render(); }
    if (action === 'take-period') { takePeriod = value; render(); }
    if (action === 'filter') { filter = value; render(); }
    if (action === 'tab') {
      const current = panelFromRoute(route()[2]);
      if (current === value) closeTakePanel(id);
      else go(takeHref(id, value));
    }
    if (action === 'close-panel') closeTakePanel(id);
    if (action === 'panel-retry') revalidate({quiet: false});
    if (action === 'news-filter') { newsTypeFilter = value || NEWS_FILTER_ALL; newsShowAll.add(id || route()[1]); render(); }
    if (action === 'news-older') { newsShowAll.add(id); render(); }
    if (action === 'news-expand') {
      const k = porQueKey('event', key);
      if (newsExpanded.has(k)) newsExpanded.delete(k); else newsExpanded.add(k);
      render();
    }
    if (action === 'pw-toggle') {
      const input = document.getElementById(b.dataset.for);
      if (!input) return;
      const show = input.type === 'password';
      const label = document.querySelector(`label[for="${b.dataset.for}"]`)?.textContent || '';
      input.type = show ? 'text' : 'password';
      b.setAttribute('aria-pressed', show ? 'true' : 'false');
      b.setAttribute('aria-label', show ? pwHideLabel(label) : pwShowLabel(label));
      b.textContent = show ? PW_HIDE : PW_SHOW;
      b.focus();
    }
    if (action === 'toggle-forgot') {
      const panel = document.getElementById('login-forgot');
      if (!panel) return;
      const open = panel.hidden;
      panel.hidden = !open;
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (action === 'retry-account') {
      meError = false;
      meState = null;
      loadAccount();
    }
    if (action === 'revoke-others') {
      const result = await api('/me/sessions/revoke-others', {});
      if (meState) meState.sessionCount = 1;
      accountSessionsNote = sessionsRevokedLabel(result.revoked || 0);
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
      go(takeHref(takeId));
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
      go(takeHref(t.id));
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
    if (action === 'auto-toggle') {
      const take = state.takes.find(x => x.id === id);
      const policy = autoPolicyFor(autoState, id);
      if (!take || !autoUiVisible(autoState)) return;
      if (policy?.enabled) {
        b.disabled = true;
        await api(`/takes/${id}/auto`, autoPutBody({enabled: false, version: take.version}), null, 'PUT');
        await refresh();
        toast(AUTO_OFF_TOAST);
      } else {
        if (take.phase !== 'active' || take.monitoringPaused) {
          toast(AUTO_NEEDS_MONITORING);
          return;
        }
        openModal(AUTO_CONSENT_TITLE, autoConsentFormHtml({takeId: id, version: take.version, esc}), b, {
          initialFocus: '.form-actions [data-action="close"]',
        });
      }
    }
    if (action === 'auto-news-toggle') {
      const take = state.takes.find(x => x.id === id);
      const policy = autoPolicyFor(autoState, id);
      if (!take || !autoUiVisible(autoState) || !policy?.enabled) return;
      if (policy.newsTrigger) {
        b.disabled = true;
        await api(`/takes/${id}/auto`, autoPutBody({
          enabled: true, newsTrigger: false, version: take.version,
        }), null, 'PUT');
        await refresh();
        toast(AUTO_NEWS_OFF_TOAST);
      } else {
        openModal(AUTO_NEWS_CONSENT_TITLE, autoNewsConsentFormHtml({takeId: id, version: take.version, esc}), b, {
          initialFocus: '.form-actions [data-action="close"]',
        });
      }
    }
    if (action === 'auto-undo') {
      const take = state.takes.find(x => x.id === id);
      if (!take || !autoUiVisible(autoState)) return;
      if (b.getAttribute('aria-disabled') === 'true') {
        toast(AUTO_UNDO_HINT_CLOSED);
        return;
      }
      await openUndoPreviewModal(take, b.dataset.trade, b);
    }
    if (action === 'auto-undo-confirm') {
      b.disabled = true;
      try {
        await api(`/auto/trades/${b.dataset.trade}/undo`, {
          version: Number(version), fingerprint: b.dataset.fingerprint,
        });
        modal.close();
        await refresh();
        toast(AUTO_UNDO_DONE);
      } catch (err) {
        if (err.status === 409) {
          modal.close();
          const take = state.takes.find(x => x.id === id);
          if (take) await openUndoPreviewModal(take, b.dataset.trade, modalReturnFocus);
          else toast(friendlyApiError(err));
          return;
        }
        throw err;
      }
    }
    if (action === 'archive') {
      const take = state.takes.find(x => x.id === id);
      if (!take || take.phase !== 'active') return;
      openModal(TD_ARCHIVE_TITLE(take.title), archiveModalHtml({esc, takeId: id}), b, {
        initialFocus: '.form-actions [data-action="close"]',
      });
    }
    if (action === 'archive-confirm') {
      const errEl = document.getElementById('archive-error');
      if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
      b.disabled = true;
      try {
        await api(`/takes/${id}/archive`, {});
        modal.close();
        filter = 'archived';
        await refresh();
        toast(TD_ARCHIVED_TOAST);
        go('#/takes');
      } catch (err) {
        b.disabled = false;
        b.focus({preventScroll: true});
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = friendlyApiError(err);
          return;
        }
        throw err;
      }
    }
    if (action === 'pause-follow') {
      const take = state.takes.find(x => x.id === id);
      if (!take || take.phase !== 'active') return;
      const nextPaused = !take.monitoringPaused;
      const errEl = document.getElementById('pause-error');
      if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
      b.setAttribute('aria-busy', 'true');
      try {
        await api(`/takes/${id}/settings`, settingsPayload(take, {monitoringPaused: nextPaused}));
        await refresh();
        toast(nextPaused ? TD_PAUSE_ON_TOAST : TD_PAUSE_OFF_TOAST);
      } catch (err) {
        b.setAttribute('aria-busy', 'false');
        if (err.status === 409 || err.code === 'quota_monitored') {
          if (errEl) {
            errEl.hidden = false;
            errEl.textContent = err.code === 'quota_monitored' || err.message === QUOTA_MONITORED
              ? QUOTA_MONITORED
              : friendlyApiError(err);
            return;
          }
        }
        throw err;
      }
    }
    if (action === 'logout') {
      try { await api('/logout', {}); } catch {}
      resetAccountState();
      login();
      return;
    }
  } catch (err) {
    if (document.getElementById('login')) return;
    toast(friendlyApiError(err));
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
  const rows = t.holdings.map(h => `<label class="field practice-weight-row"><span>${esc(h.ticker)} · hoy ${pctInt(h.weight)}</span><input class="input" type="number" name="weight-${esc(h.ticker)}" min="0.01" max="${t.settings.cap}" step="0.01" value="${h.weight}" required></label>`).join('');
  openModal('Editar pesos objetivo', `<p class="modal-copy">Se guardan los objetivos. Las tenencias no se mueven hasta un rebalance o una compra/venta confirmada.</p><p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><form id="practice-weights-form" data-id="${takeId}" data-version="${t.version}">${rows}<p class="small muted">La suma debe quedar entre ${pctInt(30)} y ${pctInt(95)}. Tope por posición ${pctInt(t.settings.cap)}.</p><div class="form-actions"><button class="btn ghost" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Vista previa</button></div></form>`);
}

function openDraftWeightsModal(takeId) {
  const t = state.takes.find(x => x.id === takeId);
  if (!t || t.phase !== 'draft') return;
  const rows = t.holdings.map(h => `<label class="field practice-weight-row"><span>${esc(h.ticker)} · hoy ${pctInt(h.weight)}</span><input class="input" type="number" name="weight-${esc(h.ticker)}" min="0.01" max="${t.settings.cap}" step="0.01" value="${h.weight}" required></label>`).join('');
  openModal(DRAFT_WEIGHTS_CTA, `<p class="modal-copy">${esc(DRAFT_GUIDE)}</p><p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><form id="draft-weights-form" data-id="${takeId}"><div class="draft-weight-rows">${rows}</div><p class="small muted">La suma debe quedar entre ${pctInt(30)} y ${pctInt(95)}. Tope por posición ${pctInt(t.settings.cap)}.</p><div class="form-actions"><button class="btn ghost" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">Guardar pesos</button></div></form>`);
}

async function showPendingPreview(takeId, result) {
  const t = state.takes.find(x => x.id === takeId);
  const order = result.order;
  openModal('Vista previa', `${orderPreviewHtml(order)}<p class="demo-note">${esc(PRACTICE_ORDER_NOTE)}</p><div class="form-actions"><button class="btn ghost" type="button" data-action="cancel-order" data-id="${takeId}" data-order="${order.id}">Cancelar</button><button class="btn primary" type="button" data-action="confirm-order" data-id="${takeId}" data-order="${order.id}" data-version="${t.version}">Confirmar en práctica</button></div>`);
}

function revalidatePwField(input) {
  const form = input.closest('#password-form, #reset-form');
  if (!form) return;
  const submitted = form.id === 'password-form' ? pwSubmitted : resetSubmitted;
  if (!submitted) return;
  const data = Object.fromEntries(new FormData(form));
  const hasPassword = form.id === 'password-form';
  const email = form.id === 'password-form' ? (meState?.email || '') : resetEmail;
  const errors = validatePasswordFields({
    next: data.next || '', confirm: data.confirm || '', current: data.current || '',
    hasPassword, email,
  });
  const field = input.id.endsWith('current') ? 'current' : input.id.endsWith('confirm') ? 'confirm' : 'next';
  setFieldError(input.id, errors[field] || '');
  if (form.id === 'password-form') {
    accountPwOk = null;
    const ok = document.querySelector('.form-success');
    if (ok) ok.remove();
  }
}

function setRulesFieldError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const err = document.getElementById(errorId);
  if (input) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (err) {
    err.textContent = message || '';
    err.hidden = !message;
  }
}

function syncRulesPresetUi() {
  const capEl = document.getElementById('td-cap');
  const driftEl = document.getElementById('td-drift');
  if (!capEl || !driftEl) return;
  const cap = parseNum(capEl.value);
  const drift = parseNum(driftEl.value);
  const match = presetFor(cap, drift);
  document.querySelectorAll('input[name="td-preset"]').forEach(r => {
    r.checked = !!(match && r.value === match.id && r.dataset.blocked !== '1');
  });
  let note = document.getElementById('td-preset-custom');
  const details = document.querySelector('.rules-custom');
  if (!match) {
    const text = TD_PRESET_CUSTOM(Number.isFinite(cap) ? cap : capEl.value, Number.isFinite(drift) ? drift : driftEl.value);
    if (!note) {
      note = document.createElement('p');
      note.className = 'small muted';
      note.id = 'td-preset-custom';
      details?.insertAdjacentElement('beforebegin', note);
    }
    note.textContent = text;
    if (details) details.open = true;
  } else if (note) note.remove();
}

document.addEventListener('input', e => {
  const input = e.target;
  if (input && ['pw-current', 'pw-next', 'pw-confirm', 'reset-next', 'reset-confirm'].includes(input.id)) {
    revalidatePwField(input);
    return;
  }
  if (input && (input.id === 'td-cap' || input.id === 'td-drift')) {
    if (input.hasAttribute('aria-invalid')) {
      setRulesFieldError(input.id, input.id + '-error', '');
    }
    syncRulesPresetUi();
  }
});

document.addEventListener('change', async e => {
  const box = e.target;
  if (box?.name === 'consent') {
    const form = box.closest('#auto-consent-form, #auto-news-consent-form');
    if (!form) return;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = !box.checked;
    return;
  }
  if (box?.name === 'td-preset') {
    if (box.dataset.blocked === '1') {
      box.checked = false;
      syncRulesPresetUi();
      return;
    }
    const preset = RULES_PRESETS.find(p => p.id === box.value);
    if (!preset) return;
    const capEl = document.getElementById('td-cap');
    const driftEl = document.getElementById('td-drift');
    if (capEl) capEl.value = String(preset.cap);
    if (driftEl) driftEl.value = String(preset.drift);
    setRulesFieldError('td-cap', 'td-cap-error', '');
    setRulesFieldError('td-drift', 'td-drift-error', '');
    syncRulesPresetUi();
    return;
  }
  if (box?.name === 'td-cadence') {
    const takeId = route()[1];
    const take = state.takes.find(x => x.id === takeId);
    if (!take || take.phase !== 'active') return;
    rememberFocus(box);
    const prev = take.settings.cadence;
    const group = box.closest('[role="radiogroup"]');
    group?.setAttribute('aria-busy', 'true');
    try {
      await api(`/takes/${takeId}/settings`, settingsPayload(take, {cadence: box.value}));
      await refresh();
      toast(TD_CAD_SAVED(cadenceLabel(box.value)));
    } catch (err) {
      const old = document.querySelector(`input[name="td-cadence"][value="${CSS.escape(prev)}"]`);
      if (old) old.checked = true;
      toast(friendlyApiError(err));
    } finally {
      group?.removeAttribute('aria-busy');
    }
  }
});

document.addEventListener('submit', async e => {
  const f = e.target;
  if (!['login', 'activate-form', 'take-settings', 'new-chat', 'chat-send', 'idea-form', 'take-ask', 'openai-settings', 'iol-settings', 'practice-cash-form', 'practice-trade-form', 'practice-weights-form', 'draft-weights-form', 'auto-consent-form', 'auto-news-consent-form', 'password-form', 'reset-form'].includes(f.id)) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(f));
  const button = f.querySelector('button[type=submit]');
  rememberFocus(button || f);
  if (button) button.disabled = true;
  try {
    if (f.id === 'login') {
      const result = await api('/login', data);
      applySessionUser(result.user);
      const session = await api('/session');
      googleAuthEnabled = session.google?.enabled === true;
      passwordResetEnabled = session.passwordReset?.enabled === true;
      if (session.user) applySessionUser(session.user);
      wireAdminFromSession(session);
      const next = safePanelNext(new URLSearchParams(location.search).get('next'));
      const keep = location.hash.startsWith('#/login') ? '' : location.hash;
      history.replaceState(history.state, '', '/app' + (next || keep || PANEL_HOME_HASH));
      await loadAppState({quiet: false});
    }
    if (f.id === 'password-form') {
      pwSubmitted = true;
      const ids = {currentId: 'pw-current', nextId: 'pw-next', confirmId: 'pw-confirm'};
      const errors = validatePasswordFields({
        next: data.next, confirm: data.confirm, current: data.current,
        hasPassword: true, email: meState?.email,
      });
      if (!applyPasswordErrors(errors, ids)) {
        resetPwVisibility(f);
        return;
      }
      accountPwAlert = '';
      accountPwOk = null;
      const submit = f.querySelector('button[type=submit]');
      if (submit) {
        submit.disabled = true;
        submit.setAttribute('aria-busy', 'true');
        submit.textContent = PW_SUBMITTING;
      }
      f.querySelectorAll('input').forEach(el => { el.readOnly = true; });
      try {
        const result = await api('/me/password', {current: data.current, next: data.next});
        resetPwVisibility(f);
        f.reset();
        meState = await api('/me');
        accountPwOk = {revokedSessions: result.revokedSessions || 0};
        accountPwAlert = '';
        pwSubmitted = false;
        render();
        document.querySelector('.form-success')?.focus();
      } catch (err) {
        resetPwVisibility(f);
        f.querySelectorAll('input').forEach(el => { el.readOnly = false; });
        const code = err.code || '';
        const mapped = {};
        if (code === 'password_current_required' || code === 'password_current_invalid') {
          mapped.current = code === 'password_current_required' ? PW_ERR_CURRENT_EMPTY : PW_ERR_CURRENT;
        } else if (code === 'password_too_short' || err.message === PW_ERR_SHORT) mapped.next = PW_ERR_SHORT;
        else if (code === 'password_too_long' || err.message === PW_ERR_LONG) mapped.next = PW_ERR_LONG;
        else if (code === 'password_is_email' || err.message === PW_ERR_EMAIL) mapped.next = PW_ERR_EMAIL;
        else if (code === 'password_same') mapped.next = PW_ERR_SAME;
        else if (code === 'password_rate_limited' || err.status === 429) accountPwAlert = PW_ERR_RATE;
        else if (code === 'password_not_set') accountPwAlert = PW_ERR_NOT_SET;
        else accountPwAlert = NET_ERROR;
        if (mapped.current || mapped.next || mapped.confirm) applyPasswordErrors(mapped, ids);
        else {
          const alert = f.querySelector('.form-alert') || f.insertBefore(
            Object.assign(document.createElement('div'), {className: 'form-alert', role: 'alert'}),
            submit,
          );
          alert.textContent = accountPwAlert;
        }
        if (submit) {
          submit.disabled = false;
          submit.removeAttribute('aria-busy');
          submit.textContent = PW_SUBMIT;
        }
        return;
      }
    }
    if (f.id === 'reset-form') {
      resetSubmitted = true;
      const ids = {nextId: 'reset-next', confirmId: 'reset-confirm'};
      const errors = validatePasswordFields({
        next: data.next, confirm: data.confirm, hasPassword: false, email: resetEmail,
      });
      if (!applyPasswordErrors(errors, ids)) {
        resetPwVisibility(f);
        return;
      }
      resetAlert = '';
      const submit = f.querySelector('button[type=submit]');
      if (submit) {
        submit.disabled = true;
        submit.setAttribute('aria-busy', 'true');
        submit.textContent = RESET_SUBMITTING;
      }
      f.querySelectorAll('input').forEach(el => { el.readOnly = true; });
      try {
        await api('/auth/reset', {token: resetToken, next: data.next});
        resetPwVisibility(f);
        resetToken = '';
        resetView = 'missing';
        sessionStorage.setItem('lv_reset_ok', '1');
        history.replaceState(null, '', '/app#/');
        await boot();
        return;
      } catch (err) {
        resetPwVisibility(f);
        f.querySelectorAll('input').forEach(el => { el.readOnly = false; });
        if (err.code === 'reset_invalid') {
          resetView = 'invalid';
          app.innerHTML = resetPage();
          focusH1();
          return;
        }
        const mapped = {};
        if (err.message === PW_ERR_SHORT || err.code === 'password_too_short') mapped.next = PW_ERR_SHORT;
        else if (err.message === PW_ERR_LONG || err.code === 'password_too_long') mapped.next = PW_ERR_LONG;
        else if (err.message === PW_ERR_EMAIL || err.code === 'password_is_email') mapped.next = PW_ERR_EMAIL;
        else if (err.status === 429 || err.code === 'reset_rate_limited') resetAlert = RESET_RATE;
        else resetAlert = NET_ERROR;
        if (mapped.next || mapped.confirm) applyPasswordErrors(mapped, ids);
        else {
          const alert = f.querySelector('.form-alert') || f.insertBefore(
            Object.assign(document.createElement('div'), {className: 'form-alert', role: 'alert'}),
            submit,
          );
          alert.textContent = resetAlert;
        }
        if (submit) {
          submit.disabled = false;
          submit.removeAttribute('aria-busy');
          submit.textContent = RESET_SUBMIT;
        }
        return;
      }
    }
    if (f.id === 'activate-form') {
      await api(`/takes/${f.dataset.id}/activate`, {amount: Number(data.amount)});
      modal.close();
      await refresh();
      go(takeHref(f.dataset.id));
      toast('Tu tesis quedó en seguimiento de práctica.');
    }
    if (f.id === 'take-settings') {
      const take = state.takes.find(x => x.id === f.dataset.id);
      if (!take) return;
      const cap = parseNum(data.cap);
      const drift = parseNum(data.drift);
      const errors = validateCapDrift(cap, drift, maxTargetWeight(take));
      setRulesFieldError('td-cap', 'td-cap-error', errors.cap || '');
      setRulesFieldError('td-drift', 'td-drift-error', errors.drift || '');
      if (errors.cap || errors.drift) {
        document.getElementById(errors.cap ? 'td-cap' : 'td-drift')?.focus();
        return;
      }
      await api(`/takes/${f.dataset.id}/settings`, settingsPayload(take, {cap, drift}));
      await refresh();
      toast(TD_RULES_SAVED);
    }
    if (f.id === 'auto-consent-form') {
      if (data.consent !== '1') return;
      const take = state.takes.find(x => x.id === f.dataset.id);
      await api(`/takes/${f.dataset.id}/auto`, autoPutBody({
        enabled: true, newsTrigger: false, consent: true, version: Number(f.dataset.version || take?.version),
      }), null, 'PUT');
      modal.close();
      await refresh();
      toast(AUTO_ON_TOAST);
    }
    if (f.id === 'auto-news-consent-form') {
      if (data.consent !== '1') return;
      const take = state.takes.find(x => x.id === f.dataset.id);
      await api(`/takes/${f.dataset.id}/auto`, autoPutBody({
        enabled: true, newsTrigger: true, newsConsent: true, version: Number(f.dataset.version || take?.version),
      }), null, 'PUT');
      modal.close();
      await refresh();
      toast(AUTO_NEWS_ON_TOAST);
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
    if (f.id === 'login') document.getElementById('login-error').textContent = friendlyApiError(err);
    else if (f.id === 'password-form' || f.id === 'reset-form') toast(friendlyApiError(err));
    else toast(friendlyApiError(err));
  } finally {
    if (button) button.disabled = false;
  }
});

function dismissModal() {
  if (modal.open) modal.close();
}

window.addEventListener('hashchange', () => {
  canonicalizeHash();
  if (route()[0] === 'restablecer') {
    bootResetPage();
    return;
  }
  if (!currentUser) {
    showUnauthenticated();
    return;
  }
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
  const nextPanel = page === 'take' && !isAjustesTab(tab) ? panelFromRoute(tab) : null;
  if (nextPanel && !lastPanelKey) {
    history.replaceState({...(history.state || {}), lvPanel: true}, '');
  }
  routeBefore = `${page}|${id || ''}`;
  if (isSuperadmin() && page === 'admin' && id === 'agente') loadAdminAgent({admin: adminSession}).then(() => render());
  else if (isSuperadmin() && page === 'admin' && id === 'fuentes') loadAdminFuentes({admin: adminSession}).then(() => render());
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
  const key = modalReturnFocusKey;
  modalReturnFocus = null;
  modalReturnFocusKey = null;
  if (key) pendingFocusKey = key;
  if (el?.isConnected && el.focus) el.focus({preventScroll: true});
  else restoreFocusKey(key);
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

function wireAdminFromSession(session) {
  adminSession = isSuperadmin() ? (session.admin || adminSession) : {enabled: false, unlocked: false};
  const syncAdmin = next => {
    adminSession = next;
    updateAdminSession({admin: adminSession, userId: currentUser?.id});
    updateAdminFuentesSession({admin: adminSession});
  };
  updateAdminSession({admin: adminSession, userId: currentUser?.id});
  updateAdminFuentesSession({admin: adminSession});
  bindAdminAgent({render, toast, openModal, onUnlock: syncAdmin});
  bindAdminFuentes({render, toast, openModal, onUnlock: syncAdmin});
}

async function boot() {
  if (location.hash === '#preguntas') {
    location.replace('/preguntas#preguntas');
    return;
  }
  if (route()[0] === 'restablecer') {
    await bootResetPage();
    return;
  }
  try {
    const session = await api('/session');
    googleAuthEnabled = session.google?.enabled === true;
    passwordResetEnabled = session.passwordReset?.enabled === true;
    if (!session.authenticated) {
      showUnauthenticated();
      return;
    }
    applySessionUser(session.user);
    wireAdminFromSession(session);
    await loadAppState({quiet: false});
    if (sessionStorage.getItem('lv_reset_ok')) {
      sessionStorage.removeItem('lv_reset_ok');
      toast(RESET_OK);
    }
    if (isSuperadmin() && isAdminAgentRoute(route())) {
      await loadAdminAgent({admin: adminSession});
      render();
    } else if (isSuperadmin() && isAdminFuentesRoute(route())) {
      await loadAdminFuentes({admin: adminSession});
      render();
    }
  } catch (err) {
    app.innerHTML = `<div class="boot"><p>${esc(err.message)}</p>${practiceFooter()}</div>`;
  }
}

boot();
