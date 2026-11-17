/**
 * Digest diario «Cierre del día» (estilo Supertake), SoT DesignBot 2026-11-16:
 * /workspace/laviste-design/digest-supertake-2026-11-16/ (§2–§9).
 *
 * Aprobado por Diego (16/11): mocks, envío todos los días hábiles, tercer estado
 * «En riesgo», umbrales −3 % tesis / −5 % activo, explicaciones con texto asistido por IA.
 *
 * Todo lo que Diego NO definió vive en DIGEST_SUPERTAKE_PROPOSALS: son defaults
 * aislados en código (no config de prod) y están marcados como PROPUESTA.
 *
 * Solo porcentajes: el payload que sale de acá no lleva montos, valores ni unidades.
 */

import {value} from './engine.mjs';
import {dailyReturn} from './leaderboard-stats.mjs';
import {dayInBuenosAires} from './usage.mjs';
import {artParts, artWallClockToDate} from './quote-time.mjs';
import {attentionFromLive} from './thesis-state.mjs';
import {DIGEST_HOUR} from './email-alerts.mjs';
import {
  artDayString,
  enqueueEmail,
  findOutboxByDedupeKey,
  getEmailPrefs,
  outboxDedupeKey,
} from './email.mjs';
import {buildSupertakeHtml} from './email-templates/supertake-html.mjs';
import {buildSupertakeText} from './email-templates/supertake-text.mjs';
import {buildSupertakeSubject, buildSupertakePreheader, templateExplanation, templateRowLine} from './email-templates/supertake-copy.mjs';
import {renderSparklinePng, sparklineFileName} from './sparkline-png.mjs';

export const DIGEST_STYLE_CLASSIC = 'classic';
export const DIGEST_STYLE_SUPERTAKE = 'supertake';
/**
 * Qué digest arma el job de daily marks. Queda en «classic» en este PR.
 * Pasar a SUPERTAKE es un cambio de una línea, en un commit aparte, que necesita
 * el OK de Diego. El asunto ya es «Cierre del día: resumen de tu cartera …»
 * (decisión de Diego, 17/11 09:29 ART); el test existente de main no se toca.
 */
export const DIGEST_STYLE_DEFAULT = DIGEST_STYLE_CLASSIC;

/** Aprobado por Diego: «OK umbrales −3 % tesis / −5 % activo» (fracciones). */
export const DIGEST_STATUS_THRESHOLDS = Object.freeze({
  thesisPct: -0.03,
  assetPct: -0.05,
  // §9.1: vuelve a «En camino» si la semana vuelve a ≥ −1,0 % y el día fue ≥ 0.
  recoverWeekPct: -0.01,
});

export const STATUS_OK = 'ok';
export const STATUS_WATCH = 'watch';
export const STATUS_RISK = 'risk';
export const STATUS_SEVERITY = Object.freeze({ok: 0, watch: 1, risk: 2});

/**
 * PROPUESTAS pendientes del OK de Diego. Cada una es un default aislado y fácil de cambiar.
 */
export const DIGEST_SUPERTAKE_PROPOSALS = Object.freeze({
  // (a) «En riesgo»: no hay regla de invalidación numérica en el modelo (la invalidación es texto).
  //  'thesis_and_asset': la tesis cruza −3 % (día o semana) Y un activo cruza −5 % el mismo día,
  //  o la app ya marca la tesis como «Revisar» (attentionFromLive → review).
  riskCriterion: 'thesis_and_asset',
  // (b) Renglón de cada tesis: 'weight' → «Peso 35 %» (como el mock); 'contribution' → «Aportó −1,4 % a la cartera».
  rowMetric: 'weight',
  // (c) «El día» en cripto: 'art_mark_window' = misma ventana que el resto (marca 17:30 ART a marca 17:30 ART);
  //  lo del fin de semana cae en el lunes. 'exclude_from_asset_trigger' = además, cripto no dispara el −5 % de activo.
  cryptoDayMode: 'art_mark_window',
  cryptoTickers: Object.freeze(['BTC', 'ETH', 'USDT', 'USDC', 'SOL']),
  // (d) PNG de sparklines: 'off' = no se emite <img> (fallback de la SoT: queda «Semana {%}» en texto).
  //  Propuesta: 'app' = servir desde la app en /email/spark/{sha256}.png (necesita una ruta nueva en server.mjs: otro PR).
  sparklineHosting: 'off',
  sparklineBaseUrl: 'https://laviste.diegodella.ar/email/spark/',
  // (e) «Ver qué cambió →»: 'thesis' = /app#/tesis/{id}. No existe todavía una vista de historial de estados.
  changeLinkTarget: 'thesis',
  // (f) Texto con IA: apagado. Siempre hay plantilla determinista en español de respaldo.
  aiExplanations: false,
});

export const APP_URL = 'https://laviste.diegodella.ar/app';
export const MAX_THESES_ROWS = 8;
export const MAX_CHANGE_CARDS = 3;
export const WEEK_POINTS = 6; // base + 5 ruedas
const MIN_SERIES_POINTS = 3;

function asDate(now) {
  const raw = typeof now === 'function' ? now() : now;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number' || typeof raw === 'string') return new Date(raw);
  return new Date();
}

/** «Digest todos los días hábiles»: lunes a viernes ART, salvo feriados de mercado. */
export function isMarketBusinessDay(now = new Date(), {holidays = []} = {}) {
  const at = asDate(now);
  const p = artParts(at);
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
  const day = `${p.year}-${p.month}-${p.day}`;
  return !(holidays || []).map(String).includes(day);
}

/** 18:00 ART del día de hoy; si ya pasó, ahora (el contenido es del cierre de hoy). */
export function supertakeScheduledAt(now = new Date()) {
  const at = asDate(now);
  const p = artParts(at);
  const target = artWallClockToDate(Number(p.year), Number(p.month), Number(p.day), DIGEST_HOUR, 0);
  return (at.getTime() < target.getTime() ? target : at).toISOString();
}

export function isCryptoTicker(ticker, proposals = DIGEST_SUPERTAKE_PROPOSALS) {
  return (proposals.cryptoTickers || []).includes(String(ticker || '').toUpperCase());
}

/**
 * Estado del día por tesis (§9.1 + umbrales aprobados + propuesta (a)).
 * @param {object} f - {dayPct, weekPct, minAssetDayPct, appReview, prev}
 */
export function computeThesisStatus({dayPct = null, weekPct = null, minAssetDayPct = null, appReview = false, prev = null} = {},
  {thresholds = DIGEST_STATUS_THRESHOLDS, proposals = DIGEST_SUPERTAKE_PROPOSALS} = {}) {
  const thesisTrig = (Number.isFinite(dayPct) && dayPct <= thresholds.thesisPct)
    || (Number.isFinite(weekPct) && weekPct <= thresholds.thesisPct);
  const assetTrig = Number.isFinite(minAssetDayPct) && minAssetDayPct <= thresholds.assetPct;
  let risk = false;
  if (proposals.riskCriterion === 'thesis_and_asset') risk = appReview || (thesisTrig && assetTrig);
  else if (proposals.riskCriterion === 'app_review_only') risk = appReview;
  if (risk) return STATUS_RISK;
  const watchTrig = thesisTrig || assetTrig;
  if (watchTrig) return STATUS_WATCH;
  // Histéresis: saliendo de riesgo pasa primero por vigilar.
  if (prev === STATUS_RISK) return STATUS_WATCH;
  if (prev === STATUS_WATCH) {
    const recovered = Number.isFinite(weekPct) && weekPct >= thresholds.recoverWeekPct
      && Number.isFinite(dayPct) && dayPct >= 0;
    return recovered ? STATUS_OK : STATUS_WATCH;
  }
  return STATUS_OK;
}

function loadMarks(db, takeId) {
  return db.prepare(`
    SELECT day, value, invested FROM take_daily_marks
    WHERE take_id = ? ORDER BY day ASC
  `).all(takeId).filter(m => Number.isFinite(m.value) && Number.isFinite(m.invested));
}

/** Cumulative % (in % points) from chained flow-adjusted daily returns. */
function cumulativeSeries(marks) {
  if (!marks || marks.length < 2) return null;
  const out = [0];
  let acc = 1;
  for (let i = 1; i < marks.length; i++) {
    const r = dailyReturn(marks[i - 1], marks[i]);
    if (r === null) return null;
    acc *= 1 + r;
    out.push((acc - 1) * 100);
  }
  return out;
}

function quoteValidToday(quote, today, now) {
  if (!quote?.asOf || quote.stale) return false;
  if (dayInBuenosAires(new Date(quote.asOf)) !== today) return false;
  if (new Date(quote.asOf).getTime() > now.getTime()) return false;
  if (!Number.isFinite(quote.dayChangePct)) return false;
  if (!quote.changeAsOf || dayInBuenosAires(new Date(quote.changeAsOf)) !== today) return false;
  return new Date(quote.changeAsOf).getTime() <= now.getTime();
}

/** Last stored statuses from a previous day's supertake digest (outbox meta). No schema change. */
export function loadPreviousStatuses(db, userId, today) {
  const rows = db.prepare(`
    SELECT meta, scheduled_at FROM email_outbox
    WHERE user_id = ? AND template = 'daily_digest' AND status IN ('pending', 'sent')
    ORDER BY scheduled_at DESC LIMIT 15
  `).all(userId);
  for (const row of rows) {
    if (artDayString(row.scheduled_at) >= today) continue;
    try {
      const meta = JSON.parse(row.meta || '{}');
      if (meta?.statuses && typeof meta.statuses === 'object') return meta.statuses;
    } catch {
      // ignore malformed meta
    }
  }
  return {};
}

/**
 * Payload §9.2 a partir de marcas diarias y cotizaciones reales (sin datos inventados).
 * `now` siempre se normaliza a Date (fix #76).
 */
export function buildSupertakeDigestData({
  db, userId, takes = [], quotes, now = new Date(), holidays = [], enrichedData = null,
  proposals = DIGEST_SUPERTAKE_PROPOSALS, thresholds = DIGEST_STATUS_THRESHOLDS, prevStatuses = null,
} = {}) {
  const at = asDate(now);
  const today = dayInBuenosAires(at);
  const active = takes.filter(t => t?.phase === 'active' && t?.id);
  const base = {
    date: today,
    now: at,
    isTradingDay: isMarketBusinessDay(at, {holidays}),
    portfolio: {dayPct: null, weekPct: null, weekSeries: null},
    theses: [],
    autoActions: enrichedData?.autoActions || [],
    pausaActions: enrichedData?.pausaActions || [],
  };
  if (!db || !userId || active.length === 0) return base;

  const marksByTake = new Map(active.map(t => [t.id, loadMarks(db, t.id)]));
  // Shared baseline: every take needs today's mark and a common prior day (≤ 5 back).
  const allHaveToday = active.every(t => marksByTake.get(t.id).some(m => m.day === today));
  if (!allHaveToday) return base;
  const commonDays = [...marksByTake.get(active[0].id).map(m => m.day)]
    .filter(d => d <= today && active.every(t => marksByTake.get(t.id).some(m => m.day === d)));
  const priorDay = commonDays.filter(d => d < today).pop();
  if (!priorDay) return base;

  const sumOn = day => active.reduce((acc, t) => {
    const m = marksByTake.get(t.id).find(x => x.day === day);
    return {value: acc.value + m.value, invested: acc.invested + m.invested};
  }, {value: 0, invested: 0});
  const pPrior = sumOn(priorDay);
  const pToday = sumOn(today);
  const portfolioDayPct = dailyReturn(pPrior, pToday);
  const weekDays = commonDays.slice(-WEEK_POINTS);
  const portfolioSeries = cumulativeSeries(weekDays.map(sumOn));
  base.portfolio = {
    dayPct: portfolioDayPct,
    weekPct: portfolioSeries ? portfolioSeries[portfolioSeries.length - 1] / 100 : null,
    weekSeries: portfolioSeries && portfolioSeries.length >= MIN_SERIES_POINTS ? portfolioSeries : null,
  };

  const prev = prevStatuses || loadPreviousStatuses(db, userId, today);
  const denom = pPrior.value + (pToday.invested - pPrior.invested);
  const totalToday = pToday.value;

  for (const take of active) {
    const name = typeof take.title === 'string' ? take.title.trim() : '';
    if (!name) continue; // §7: nunca una fila sin nombre (ni un UUID)
    const marks = marksByTake.get(take.id);
    const tPrior = marks.find(m => m.day === priorDay);
    const tToday = marks.find(m => m.day === today);
    const dayPct = dailyReturn(tPrior, tToday);
    if (dayPct === null) continue;
    const ownDays = marks.filter(m => m.day <= today).slice(-WEEK_POINTS);
    const series = cumulativeSeries(ownDays);
    const weekPct = series ? series[series.length - 1] / 100 : null;
    const cash = tToday.invested - tPrior.invested;
    const contributionPct = denom > 0 ? (dayPct * (tPrior.value + cash)) / denom : null;
    const weightPct = totalToday > 0 ? tToday.value / totalToday : null;

    // Activos: solo cotizaciones válidas para hoy (misma regla temporal que el digest actual).
    let topMover = null;
    let minAssetDayPct = null;
    const tv = value(take);
    for (const h of take.holdings || []) {
      if (!h?.ticker || !quotes?.getCached) continue;
      const q = quotes.getCached(h.ticker);
      if (!quoteValidToday(q, today, at)) continue;
      const d = q.dayChangePct;
      const excluded = proposals.cryptoDayMode === 'exclude_from_asset_trigger' && isCryptoTicker(h.ticker, proposals);
      if (!excluded && (minAssetDayPct === null || d < minAssetDayPct)) minAssetDayPct = d;
      const w = tv > 0 && Number.isFinite(h.units) && Number.isFinite(h.price) ? (h.units * h.price) / tv : 0;
      const impact = Math.abs(w * d);
      if (!topMover || impact > topMover.impact) topMover = {ticker: h.ticker, dayPct: d, impact};
    }
    if (topMover) delete topMover.impact;

    let appReview = false;
    try {
      appReview = attentionFromLive(take).attention === 'review';
    } catch {
      appReview = false;
    }
    const statusPrevRaw = prev?.[take.id];
    const statusPrev = statusPrevRaw in STATUS_SEVERITY ? statusPrevRaw : null;
    const status = computeThesisStatus({dayPct, weekPct, minAssetDayPct, appReview, prev: statusPrev}, {thresholds, proposals});
    base.theses.push({
      id: take.id,
      name,
      weightPct,
      dayPct,
      contributionPct,
      weekPct,
      weekSeries: series && series.length >= MIN_SERIES_POINTS ? series : null,
      status,
      // Sin estado previo guardado no se informa un cambio (no se inventa).
      statusPrev: statusPrev ?? status,
      topMover,
      minAssetDayPct,
      appReview,
      reasonCode: reasonCodeFor(status, statusPrev ?? status),
      explanation: null,
      explanationSource: null,
    });
  }
  return base;
}

export function reasonCodeFor(status, statusPrev) {
  if (status === statusPrev) return null;
  if (status === STATUS_RISK) return 'risk';
  if (status === STATUS_OK) return 'recovery';
  if (statusPrev === STATUS_RISK) return 'risk_easing';
  return 'noise';
}

function changeLinkFor(thesis, proposals) {
  if (proposals.changeLinkTarget === 'thesis') return `${APP_URL}#/tesis/${encodeURIComponent(thesis.id)}`;
  return `${APP_URL}#/`;
}

/** URL del sparkline según la propuesta (d). Con 'off' devuelve null y se omite el <img>. */
export function sparklineUrlFor(series, proposals = DIGEST_SUPERTAKE_PROPOSALS) {
  if (proposals.sparklineHosting !== 'app' || !series) return null;
  const png = renderSparklinePng(series);
  const file = sparklineFileName(png);
  return file ? `${proposals.sparklineBaseUrl}${file}` : null;
}

/** Arma la vista lista para las plantillas (mismo objeto para HTML y TXT → paridad). */
export function buildSupertakeView(data, {proposals = DIGEST_SUPERTAKE_PROPOSALS, sparkUrl = series => sparklineUrlFor(series, proposals)} = {}) {
  const theses = (data?.theses || []).filter(t => t?.name && Number.isFinite(t.dayPct));
  const changesAll = theses
    .filter(t => t.statusPrev && t.status !== t.statusPrev)
    .sort((a, b) => (STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status]) || (Math.abs(b.dayPct) - Math.abs(a.dayPct)));
  const rowsAll = [...theses].sort((a, b) => Math.abs(b.contributionPct ?? b.dayPct * (b.weightPct ?? 0))
    - Math.abs(a.contributionPct ?? a.dayPct * (a.weightPct ?? 0)));
  const decorate = t => ({
    ...t,
    link: changeLinkFor(t, proposals),
    sparkUrl: t.weekSeries ? sparkUrl(t.weekSeries) : null,
    explanation: t.explanation || templateExplanation(t),
    explanationSource: t.explanation ? (t.explanationSource || 'ai') : 'template',
    rowLine: templateRowLine(t, {changed: t.statusPrev && t.status !== t.statusPrev}),
  });
  const changes = changesAll.slice(0, MAX_CHANGE_CARDS).map(decorate);
  const rows = rowsAll.slice(0, MAX_THESES_ROWS).map(decorate);
  const view = {
    date: data.date,
    portfolio: {
      ...data.portfolio,
      sparkUrl: data.portfolio?.weekSeries ? sparkUrl(data.portfolio.weekSeries) : null,
    },
    thesesCount: theses.length,
    upCount: theses.filter(t => Math.round(t.dayPct * 1000) > 0).length,
    changesCount: changesAll.length,
    changes,
    moreChanges: Math.max(0, changesAll.length - MAX_CHANGE_CARDS),
    rows,
    moreRows: Math.max(0, rowsAll.length - MAX_THESES_ROWS),
    topContributor: rowsAll[0]?.name || null,
    rowMetric: proposals.rowMetric,
    autoActions: data.autoActions || [],
    pausaActions: data.pausaActions || [],
    appUrl: APP_URL,
  };
  view.subject = buildSupertakeSubject(view);
  view.preheader = buildSupertakePreheader(view);
  return view;
}

export function buildSupertakeEmail(data, opts = {}) {
  const view = buildSupertakeView(data, opts);
  return {
    subject: view.subject,
    bodyHtml: buildSupertakeHtml(view),
    bodyText: buildSupertakeText(view),
    view,
  };
}

/**
 * Encola el digest «Cierre del día» por el camino normal (template daily_digest, mismo dedupe).
 * Sale todos los días hábiles de mercado; no depende de cruzar umbrales.
 */
export function scheduleSupertakeDigest(db, {userId, data, now = Date.now, env = process.env, proposals = DIGEST_SUPERTAKE_PROPOSALS} = {}) {
  const at = asDate(now);
  const user = db.prepare('SELECT id, email, email_verified FROM users WHERE id = ?').get(userId);
  if (!user || !user.email_verified) return {scheduled: false, reason: 'unverified'};
  const prefs = getEmailPrefs(db, userId);
  if (prefs.digestFreq === 'off') return {scheduled: false, reason: 'digest_off'};
  if (!data?.isTradingDay) return {scheduled: false, reason: 'not_business_day'};
  if (!Number.isFinite(data?.portfolio?.dayPct)) return {scheduled: false, reason: 'no_portfolio_day'};
  if (!data.theses?.length) return {scheduled: false, reason: 'no_theses'};

  const scheduledAt = supertakeScheduledAt(at);
  const key = outboxDedupeKey({template: 'daily_digest', userId, scheduledAt});
  if (findOutboxByDedupeKey(db, key)) return {scheduled: false, reason: 'already_scheduled'};

  const {subject, bodyText, bodyHtml, view} = buildSupertakeEmail(data, {proposals});
  const statuses = Object.fromEntries(data.theses.map(t => [t.id, t.status]));
  const queued = enqueueEmail(db, {
    userId,
    template: 'daily_digest',
    toEmail: user.email,
    subject,
    bodyText,
    bodyHtml,
    meta: {
      style: DIGEST_STYLE_SUPERTAKE,
      day: data.date,
      thesesCount: view.thesesCount,
      changesCount: view.changesCount,
      hasPortfolioDayPct: true,
      statuses,
    },
    scheduledAt,
    now: () => at.getTime(),
    env,
  });
  if (queued.duplicate || queued.reason === 'already_queued_or_sent') return {scheduled: false, reason: 'already_scheduled'};
  if (queued.reason === 'recipient_not_allowed') return {scheduled: false, reason: 'recipient_not_allowed'};
  return {scheduled: true, scheduledAt};
}
