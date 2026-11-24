/**
 * Texto explicativo asistido por IA para «Cambios de estado» (aprobado: «Explicaciones con
 * texto asistido por IA»). Proveedor y costo: PENDIENTE de Diego (propuesta (f)).
 *
 * - Apagado por defecto (DIGEST_SUPERTAKE_PROPOSALS.aiExplanations = false).
 * - No agrega secretos ni variables de entorno: el generador se inyecta.
 * - Si está apagado, falla, tarda o devuelve algo inválido → plantilla determinista (§9.3).
 * - La IA solo redacta a partir de los datos que le pasamos; nunca montos, nunca causas nuevas.
 */

import {DIGEST_SUPERTAKE_PROPOSALS, STATUS_RISK} from './digest-supertake.mjs';
import {STATUS_COPY, formatPct, templateExplanation} from './email-templates/supertake-copy.mjs';

export const DIGEST_AI_TIMEOUT_MS = 4000;
export const DIGEST_AI_MAX_CHARS = 360;
export const DIGEST_AI_MIN_CHARS = 40;

const CURRENCY_RE = /\$|U\$S|\bUSD\b|\bARS\b|\bEUR\b|\bpesos\b|\bd[óo]lares?\b|\bmonto|\bvalor de la cartera/i;
const ENGLISH_RE = /\b(the|and|today|portfolio|thesis|stock|market|down|up)\b/i;

/** Hechos (solo %) que recibe el generador. Nada de montos ni ids. */
export function explanationFacts(t) {
  return {
    thesisName: t.name,
    statusPrev: STATUS_COPY[t.statusPrev]?.label,
    status: STATUS_COPY[t.status]?.label,
    dayPct: formatPct(t.dayPct),
    weekPct: Number.isFinite(t.weekPct) ? formatPct(t.weekPct) : null,
    topMover: t.topMover ? {ticker: t.topMover.ticker, dayPct: formatPct(t.topMover.dayPct)} : null,
    mustClose: t.status === STATUS_RISK ? 'rompe la tesis' : 'ruido de mercado',
  };
}

/** Valida la salida de la IA: español, sin montos, sin números que no estén en los hechos. */
export function validateAiExplanation(text, facts) {
  if (typeof text !== 'string') return false;
  const s = text.trim();
  if (s.length < DIGEST_AI_MIN_CHARS || s.length > DIGEST_AI_MAX_CHARS) return false;
  if (/[<>]/.test(s)) return false;
  if (CURRENCY_RE.test(s) || ENGLISH_RE.test(s)) return false;
  if (!s.includes(facts.mustClose)) return false;
  // Quitamos los % y tickers permitidos; si queda algún dígito, hay un número inventado.
  let rest = s;
  for (const p of [facts.dayPct, facts.weekPct, facts.topMover?.dayPct].filter(Boolean)) rest = rest.split(p).join('');
  if (facts.topMover?.ticker) rest = rest.split(facts.topMover.ticker).join('');
  return !/\d/.test(rest);
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('digest_ai_timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Completa `explanation` de cada tesis que cambió de estado. Devuelve un payload nuevo.
 * @param {object} data - payload de buildSupertakeDigestData
 * @param {{enabled?: boolean, generate?: (facts: object) => Promise<string>, timeoutMs?: number, logger?: object}} opts
 */
export async function applyAiExplanations(data, {
  enabled = DIGEST_SUPERTAKE_PROPOSALS.aiExplanations,
  generate = null,
  timeoutMs = DIGEST_AI_TIMEOUT_MS,
  logger = console,
} = {}) {
  const theses = [];
  for (const t of data?.theses || []) {
    const changed = t.statusPrev && t.status !== t.statusPrev;
    if (!changed) {
      theses.push(t);
      continue;
    }
    let explanation = templateExplanation(t);
    let explanationSource = 'template';
    if (enabled && typeof generate === 'function') {
      const facts = explanationFacts(t);
      try {
        const out = await withTimeout(Promise.resolve().then(() => generate(facts)), timeoutMs);
        if (validateAiExplanation(out, facts)) {
          explanation = out.trim();
          explanationSource = 'ai';
        } else {
          logger?.error?.(JSON.stringify({event: 'digest_ai_rejected'}));
        }
      } catch (error) {
        logger?.error?.(JSON.stringify({event: 'digest_ai_failed', error: error?.message === 'digest_ai_timeout' ? 'timeout' : 'error'}));
      }
    }
    theses.push({...t, explanation, explanationSource});
  }
  return {...data, theses};
}
