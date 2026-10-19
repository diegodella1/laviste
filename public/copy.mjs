/** Login (Fase 1C). es-AR, tono Suizo. */
export const LOGIN_TITLE = 'Acceso';
export const LOGIN_LEAD =
  'La Viste es tu espacio privado para practicar tesis con dinero de práctica en ARS.';
export const LOGIN_EMAIL_LABEL = 'Correo electrónico';
export const LOGIN_PASSWORD_LABEL = 'Contraseña';
export const LOGIN_SUBMIT = 'Entrar a mi espacio';
export const LOGIN_PRIVACY = 'Privacidad y datos ↗';
export const LOGIN_STORY_TITLE = 'Tu espacio de práctica.';
export const SESSION_EXPIRED = 'La sesión venció. Iniciá de nuevo.';

/** User menu (Fase 1E). es-AR, tono Suizo. */
export const USER_MENU_LABEL = 'Tu cuenta';
export const USER_LOGOUT = 'Cerrar sesión';
export const USER_ROLE_SUPERADMIN = 'Superadmin';
export const USER_ROLE_USER = 'Usuario';

export const HOME_EMPTY_EYEBROW = 'Sin tesis todavía';
export const HOME_EMPTY_TITLE = 'Nueva tesis';
export const HOME_EMPTY_BODY =
  'Partí de una idea. Podés pedirle una propuesta a La Viste o armar la cartera a mano.';
export const CHATS_EMPTY = 'Todavía no hay conversaciones. Partí de una tesis para empezar.';
export const AI_UNAVAILABLE = 'La revisión de noticias no está disponible.';
export const AI_UNAVAILABLE_USER =
  'El análisis no está disponible en este momento. Probá más tarde.';

/** Per-user quotas (Fase 2 / PR 2B). es-AR; no internals. */
export const QUOTA_CHAT =
  'Alcanzaste el límite diario de mensajes. Se reinicia a las 00:00 (Argentina).';
export const QUOTA_NEWS =
  'Alcanzaste el límite diario de revisiones. Se reinicia a las 00:00 (Argentina).';
export const QUOTA_TOKENS =
  'Alcanzaste el límite diario de tokens (prompt + completion). Se reinicia a las 00:00 (Argentina).';
export const QUOTA_TOKENS_USER =
  'Alcanzaste el límite diario de análisis. Se reinicia a las 00:00 (Argentina).';
export const QUOTA_MONITORED =
  'Llegaste al máximo de tesis en seguimiento. Pausá o archivá una para activar otra.';
export const QUOTA_RATE =
  'Hay demasiados pedidos seguidos. Esperá un minuto y reintentá.';
export const QUOTA_CHAT_SIZE =
  'Esta conversación llegó al límite. Abrí una nueva.';
export const QUOTA_NEWS_WAITING =
  'Cuota diaria de revisiones agotada. Se retoma a las 00:00 (Argentina).';

const AI_REQUIRED_RE = /Configuraci[oó]n|clave OpenAI/i;
const AI_REQUIRED_CODES = new Set(['ai_required', 'aiRequired', 'openai_required']);
const QUOTA_USER_COPY = {
  quota_chat: QUOTA_CHAT,
  quota_news: QUOTA_NEWS,
  quota_tokens: QUOTA_TOKENS_USER,
  quota_monitored: QUOTA_MONITORED,
  rate_limit: QUOTA_RATE,
};

function apiErrorMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return err.message || err.error || '';
}

function apiErrorCode(err) {
  if (!err || typeof err === 'string') return '';
  return err.code || err.errorCode || '';
}

/**
 * Map backend errors for toast/login. Superadmin keeps the server copy
 * (incl. «Configuración»). Role user never sees a CTA to that screen.
 */
export function friendlyApiError(err, {superadmin = false} = {}) {
  const message = apiErrorMessage(err);
  const code = String(apiErrorCode(err));
  if (superadmin) {
    if (code === 'quota_tokens') return QUOTA_TOKENS;
    return message;
  }
  if (QUOTA_USER_COPY[code]) return QUOTA_USER_COPY[code];
  if (AI_REQUIRED_CODES.has(code) || AI_REQUIRED_RE.test(message)) return AI_UNAVAILABLE_USER;
  return message;
}

/** Single practice disclaimer line (SPA + static site). */
export const PRACTICE_FOOTER =
  'Dinero de práctica · precios demorados · no se envían órdenes · el análisis puede equivocarse';

export const DEF_SHORT =
  'A partir de tu tesis, La Viste analiza mercado, noticias y precios, arma una cartera de práctica en ARS a la medida y la sigue con chequeos de reglas y noticias con fuentes. No envía órdenes.';

export const DEF_LONG =
  'Espacio privado para practicar inversiones con criterio: a partir de tu tesis, La Viste analiza mercado, noticias y precios, arma una cartera de práctica en ARS a la medida y la sigue con chequeos y noticias con fuentes. No envía órdenes ni mueve dinero real. El análisis puede equivocarse.';

export const VERDICT_NO_ACTION = 'Sin acción necesaria';
export const VERDICT_ACTION_RULES = 'Acción sugerida: revisar concentración o desvíos';

/** app.take.ask.* (COPY lock) */
export const TAKE_ASK_PLACEHOLDER = 'Consultá sobre esta tesis';
export const TAKE_ASK_CTA = 'Enviar';
export const COVERAGE_PARTIAL = 'Cobertura parcial: la búsqueda se limitó a las fuentes consultadas.';
export const POSITIONS_LINK = 'Ver posiciones →';
export const CHECK_NOW = 'Revisar ahora';
export const TRY_SCENARIO = 'Probar escenario';
export const RETRY_CHECK = 'Reintentar';
export const CHECK_ERROR = 'No pudimos revisar ahora. Probá de nuevo.';

export const PRACTICE_ORDER_NOTE =
  'Nada se mueve hasta que confirmes. No se envían órdenes.';

/** Beginner entries: Manual vs Proponer (ask/confirm only; no autopilot). */
export const ENTRY_LEAD =
  'Elegí cómo armar la cartera de práctica. En los dos caminos revisás y confirmás antes de activar. No hay modo automático ni envío de órdenes.';
export const ENTRY_PROPOSE_TITLE = 'Proponer';
export const ENTRY_PROPOSE_BODY =
  'Contá tu idea. La Viste aclara y te trae una propuesta para revisar. Vos decidís si activar la práctica o pedir un ajuste.';
export const ENTRY_PROPOSE_CTA = 'Proponer cartera';
export const ENTRY_MANUAL_TITLE = 'Manual';
export const ENTRY_MANUAL_BODY =
  'Partí de un ejemplo y ajustá los pesos vos. La práctica no empieza hasta que confirmes el capital.';
export const ENTRY_MANUAL_CTA = 'Armar a mano';
export const ENTRY_PROPOSE_SUBMIT = 'Pedile una propuesta';
export const ENTRY_MANUAL_USE = 'Usar esta cartera';
export const ENTRY_SWITCH_MANUAL = 'Prefiero armarla a mano';
export const ENTRY_SWITCH_PROPOSE = 'Prefiero que La Viste proponga';
export const ADJUST_AI_CTA = 'Pedile un ajuste';
export const ADJUST_MANUAL_CTA = 'Ajustar a mano';
export const DRAFT_WEIGHTS_CTA = 'Ajustar pesos';
export const SETTINGS_ASK_NOTE =
  'Las propuestas se confirman a mano. No hay ejecución automática.';
export const DRAFT_GUIDE =
  'Revisá la composición. Podés ajustar pesos a mano o pedirle un cambio a La Viste. Nada se activa hasta que lo confirmes.';
export const ENTRY_PROPOSE_HINT =
  'Describí tu tesis en una o dos oraciones (Argentina o macro LatAm). Horizonte, riesgo o qué la invalidaría, si ya lo sabés.';
export const ENTRY_MANUAL_HINT =
  'Se abre como borrador. Podés ajustar pesos o activar práctica cuando quieras. No se envían órdenes.';

/** GROUP PR A — Posiciones composition + Libro hierarchy */
export const POS_COMPOSITION_LABEL = 'Composición por tema';
export const POS_BUCKET_UNGROUPED = 'Sin agrupar';
export const POS_BUCKET_CASH = 'Efectivo';
export const POS_BUCKET_CASH_HINT = 'ARS en libro de práctica';
export const POS_BUCKET_EDIT_WEIGHTS = 'Editar pesos';
export const POS_TABLE_CHIP = '{n} posiciones';
export const POS_TABLE_CHIP_ONE = '1 posición';
export const POS_DRAFT_COMPOSITION = 'Se calcula al activar';
export const LIBRO_PRIMARY_DEPOSIT = 'Aportar';
export const LIBRO_PRIMARY_TRADE = 'Comprar o vender';
export const LIBRO_MORE = 'Más';
export const LIBRO_SECONDARY_WITHDRAW = 'Retirar';

export function positionsChipLabel(n) {
  return n === 1 ? POS_TABLE_CHIP_ONE : POS_TABLE_CHIP.replace('{n}', String(n));
}

export function bucketCountLabel(n) {
  return n === 1 ? '1 posición' : `${n} posiciones`;
}

/** Home «Tus tesis» day delta + thesis header (GROUP PR B). */
export const HOME_THESIS_DELTA_ZERO = '0,0\u202F% hoy';
export const HOME_THESIS_DELTA_UNKNOWN = '—';
export const TAKE_HEADER_MONEY_LABEL = 'Dinero de práctica · ARS';
export const TAKE_HEADER_EYEBROW = 'Cartera de práctica';

/** Polish P1 — resumen, paneles, rail, gráfico. */
export const P1_RESUMEN = 'Resumen';
export const P1_IDEA = 'La idea';
export const P1_PREFS = 'Preferencias';
export const P1_CLOSE = 'Cerrar';
export const P1_CLOSE_X = 'Cerrar ✕';
export const P1_NEW_THESIS = '+ Nueva tesis';
export const P1_RAIL_THESIS = 'Tesis';
export const P1_RAIL_DRAFTS = 'Borradores';
export const P1_DRAFT_LABEL = 'Borrador';
export const P1_RESULT_LABEL = 'Tu resultado desde el inicio';
export const P1_CHART_NO_HISTORY = 'Todavía no hay historia para graficar. Vuelve a verse mañana.';
export const P1_NEWS_EMPTY_FILTER = 'No hay novedades para este filtro.';
export const P1_NEWS_SEE_ALL = 'Ver todas';
export const P1_NEWS_ALL = 'Todas';
export const P1_NEWS_NEWS = 'Noticias';
export const P1_NEWS_RULES = 'Reglas';
export const P1_PANEL_POSITIONS_ERROR = 'No pudimos cargar las posiciones.';
export const P1_PANEL_RETRY = 'Reintentar';
export const P1_PANEL_LOADING = 'Cargando…';
export const P1_AFFECTS = 'Afecta a:';
export const P1_SHOWING = 'Mostrando {n} de {m} novedades';
export const P1_OLDER = 'Anteriores · {n}';
export const P1_RANGE_WEEK = '1S';
export const P1_RANGE_MONTH = '1M';
export const P1_RANGE_ALL = 'Todo';
export const P1_TODAY = 'hoy';

export function showingNovedadesLabel(n, m) {
  return P1_SHOWING.replace('{n}', String(n)).replace('{m}', String(m));
}

export function olderNovedadesLabel(n) {
  return P1_OLDER.replace('{n}', String(n));
}

const VERDICT_NO_ACTION_LEGACY = 'No necesitás hacer nada';

/** Map stored verdict text for display without rewriting DB rows. */
export function normalizeVerdictText(text) {
  if (text === VERDICT_NO_ACTION_LEGACY) return VERDICT_NO_ACTION;
  return text;
}

export function isNoActionVerdict(text) {
  return normalizeVerdictText(text) === VERDICT_NO_ACTION;
}
