/** Per-user OpenAI usage (Fase 2 / PR 2A). Global `consumption` stays UTC and unchanged. */

export const USAGE_KINDS = Object.freeze(['chat', 'review', 'research', 'preview']);
export const MODEL_PRICES_KEY = 'modelPrices';
export const USAGE_TIMEZONE = 'America/Buenos_Aires';

/** Model ids that already appear as defaults in this repo. Not an OpenAI catalog. */
export const KNOWN_MODEL_IDS = Object.freeze(['gpt-5-mini']);

export const MODEL_PRICES_NOTE =
  'Valores en USD por 1 millón de tokens. Son configuración editable para estimar est_cost_micro; no son tarifas facturadas ni precios oficiales.';

const MODEL_ID_RE = /^[a-zA-Z0-9._-]{1,100}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRICE_MAX = 1_000_000;

export function isUsageKind(kind) {
  return USAGE_KINDS.includes(kind);
}

export function dayInBuenosAires(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: USAGE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function tokenCounts(usage) {
  const prompt = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
  const completion = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
  return {
    promptTokens: Number.isFinite(prompt) && prompt > 0 ? Math.round(prompt) : 0,
    completionTokens: Number.isFinite(completion) && completion > 0 ? Math.round(completion) : 0,
  };
}

/**
 * USD/MTok × tokens = micro-USD (1 USD = 1e6 micro).
 * Missing/null rates count as 0 so unpriced models do not invent a cost.
 */
export function estimateCostMicro(promptTokens, completionTokens, price) {
  const promptRate = rateOrZero(price?.promptUsdPerMTok);
  const completionRate = rateOrZero(price?.completionUsdPerMTok);
  const prompt = Number(promptTokens) || 0;
  const completion = Number(completionTokens) || 0;
  return Math.round(prompt * promptRate + completion * completionRate);
}

function rateOrZero(value) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function emptyModelPrice() {
  return {promptUsdPerMTok: null, completionUsdPerMTok: null};
}

export function defaultModelPrices() {
  const models = {};
  for (const id of KNOWN_MODEL_IDS) models[id] = emptyModelPrice();
  return {models, note: MODEL_PRICES_NOTE, updatedAt: null};
}

function parsePriceField(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > PRICE_MAX) {
    throw Object.assign(new Error('Precio de modelo inválido.'), {status: 400});
  }
  return n;
}

export function normalizeModelPrices(input) {
  const base = defaultModelPrices();
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const incoming = src.models && typeof src.models === 'object' && !Array.isArray(src.models)
    ? src.models
    : src;
  const models = {...base.models};
  for (const [id, row] of Object.entries(incoming || {})) {
    if (!MODEL_ID_RE.test(id)) {
      throw Object.assign(new Error('Modelo inválido.'), {status: 400});
    }
    const price = row && typeof row === 'object' ? row : {};
    models[id] = {
      promptUsdPerMTok: parsePriceField(price.promptUsdPerMTok),
      completionUsdPerMTok: parsePriceField(price.completionUsdPerMTok),
    };
  }
  const note = typeof src.note === 'string' && src.note.trim()
    ? src.note.trim().slice(0, 500)
    : MODEL_PRICES_NOTE;
  return {
    models,
    note,
    updatedAt: src.updatedAt || null,
  };
}

export function priceForModel(prices, model) {
  const models = prices?.models || {};
  return models[model] || emptyModelPrice();
}

export function recordUserUsage(db, {
  userId, kind, usage, model, calls = 1, prices, now,
} = {}) {
  if (!userId) return null;
  if (!isUsageKind(kind)) {
    throw Object.assign(new Error('Tipo de uso inválido.'), {status: 400});
  }
  const {promptTokens, completionTokens} = tokenCounts(usage);
  const nCalls = Number.isInteger(calls) && calls > 0 ? calls : 1;
  const table = prices || normalizeModelPrices(null);
  const est = estimateCostMicro(promptTokens, completionTokens, priceForModel(table, model));
  const day = dayInBuenosAires(now);
  db.prepare(`INSERT INTO user_usage(user_id, day, kind, calls, prompt_tokens, completion_tokens, est_cost_micro)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id, day, kind) DO UPDATE SET
      calls=calls+excluded.calls,
      prompt_tokens=prompt_tokens+excluded.prompt_tokens,
      completion_tokens=completion_tokens+excluded.completion_tokens,
      est_cost_micro=est_cost_micro+excluded.est_cost_micro`).run(
    userId, day, kind, nCalls, promptTokens, completionTokens, est,
  );
  return {userId, day, kind, calls: nCalls, promptTokens, completionTokens, estCostMicro: est, model: model || null};
}

function assertDay(value, fallback) {
  if (value == null || value === '') return fallback;
  const day = String(value);
  if (!DAY_RE.test(day)) throw Object.assign(new Error('Fecha inválida.'), {status: 400});
  return day;
}

export function listUserUsage(db, {from, to, userId, now} = {}) {
  const today = dayInBuenosAires(now);
  const start = assertDay(from, shiftDay(today, -13));
  const end = assertDay(to, today);
  if (start > end) throw Object.assign(new Error('Rango de fechas inválido.'), {status: 400});
  const params = [start, end];
  let sql = `SELECT u.user_id AS userId, usr.email, usr.display_name AS displayName, usr.role,
      u.day, u.kind, u.calls, u.prompt_tokens AS promptTokens,
      u.completion_tokens AS completionTokens, u.est_cost_micro AS estCostMicro
    FROM user_usage u
    JOIN users usr ON usr.id = u.user_id
    WHERE u.day>=? AND u.day<=?`;
  if (userId) {
    sql += ' AND u.user_id=?';
    params.push(userId);
  }
  sql += ' ORDER BY u.day DESC, usr.email, u.kind LIMIT 1000';
  return {
    timezone: USAGE_TIMEZONE,
    from: start,
    to: end,
    rows: db.prepare(sql).all(...params),
  };
}

function shiftDay(day, delta) {
  const [y, m, d] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + delta));
  return utc.toISOString().slice(0, 10);
}
