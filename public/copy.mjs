/** Login (Fase 1C). es-AR, tono Suizo. */
export const LOGIN_TITLE = 'Acceso';
export const LOGIN_LEAD =
  'La Viste es tu espacio privado para practicar tesis con dinero de práctica en ARS.';
export const LOGIN_EMAIL_LABEL = 'Correo electrónico';
export const LOGIN_PASSWORD_LABEL = 'Contraseña';
export const LOGIN_SUBMIT = 'Entrar a mi espacio';
export const LOGIN_GOOGLE = 'Acceder con Google';
export const LOGIN_GOOGLE_OR = 'o';
export const LOGIN_GOOGLE_ERROR =
  'No pudimos acceder con Google. Si todavía no tenés acceso a La Viste, pedíselo a quien la administra.';
export const LOGIN_GOOGLE_LIMIT =
  'Hiciste muchos intentos con Google. Esperá diez minutos y probá de nuevo.';
export const LOGIN_GOOGLE_PASSWORD_ONLY =
  'Esta cuenta no puede acceder con Google. Entrá con tu correo y tu contraseña.';
export const LOGIN_GOOGLE_CANCEL =
  'Cancelaste el acceso con Google. Podés intentarlo de nuevo o entrar con tu correo.';
export const LOGIN_PRIVACY = 'Privacidad y datos ↗';
export const LOGIN_STORY_TITLE = 'Tu espacio de práctica.';
export const SESSION_EXPIRED = 'La sesión venció. Iniciá de nuevo.';

/** User menu (Fase 1E). es-AR, tono Suizo. */
export const USER_MENU_LABEL = 'Tu cuenta';
export const USER_MENU_FAQ = 'Preguntas frecuentes ↗';
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

/** Global kill switch + spend cap (Fase 2 / PR 2C). es-AR; no internals. */
export const AI_PAUSED_LABEL = 'IA en pausa';
export const AI_PAUSED_USER =
  'La IA está en pausa. Podés seguir tu espacio; el análisis se retoma cuando el administrador lo habilite.';
export const AI_PAUSED_DISABLED_ADMIN =
  'La IA está apagada (kill switch). Los usuarios ven «IA en pausa».';
export const AI_PAUSED_BUDGET_ADMIN = 'Se alcanzó el tope de gasto. IA en pausa.';
export const AI_BUDGET_80_ADMIN =
  'El gasto estimado llegó al 80 % del presupuesto.';
export const AI_PRICES_MISSING =
  'Precios sin cargar: el presupuesto no se puede medir.';

/** Concurrencia IA (Fase 2 / PR 2D). HTTP fails fast with 429 — no request queue. */
export const AI_BUSY_USER =
  'Ya hay un análisis en curso para tu cuenta. Esperá a que termine.';
export const AI_BUSY_GLOBAL =
  'La IA está ocupada. Probá de nuevo en unos segundos.';

export function budgetSpendLine(ai) {
  if (!ai) return '';
  const spent = Number(ai.spentMonthUsd || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const cap = Number(ai.monthlyCapUsd || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `Gastado USD ${spent} de USD ${cap} este mes.`;
}

const AI_REQUIRED_RE = /Configuraci[oó]n|clave OpenAI/i;
const AI_REQUIRED_CODES = new Set(['ai_required', 'aiRequired', 'openai_required']);
const QUOTA_USER_COPY = {
  quota_chat: QUOTA_CHAT,
  quota_news: QUOTA_NEWS,
  quota_tokens: QUOTA_TOKENS_USER,
  quota_monitored: QUOTA_MONITORED,
  rate_limit: QUOTA_RATE,
};
const AI_PAUSED_CODES = new Set(['ai_paused', 'ai_paused_disabled', 'ai_paused_budget']);
const AI_BUSY_COPY = {
  ai_busy: AI_BUSY_GLOBAL,
  ai_busy_user: AI_BUSY_USER,
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
  if (AUTO_UNDO_ERRORS[code]) return AUTO_UNDO_ERRORS[code];
  if (AUTO_REASON_CODES.has(code)) return AUTO_UNDO_ERROR_DEFAULT;
  if (AUTO_UNDO_ERRORS[message]) return AUTO_UNDO_ERRORS[message];
  if (AUTO_REASON_CODES.has(message)) return AUTO_UNDO_ERROR_DEFAULT;
  if (superadmin) {
    if (code === 'quota_tokens') return QUOTA_TOKENS;
    return message;
  }
  if (QUOTA_USER_COPY[code]) return QUOTA_USER_COPY[code];
  if (AI_BUSY_COPY[code]) return AI_BUSY_COPY[code];
  if (AI_PAUSED_CODES.has(code)) return AI_PAUSED_USER;
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
/** Shown on «Nueva tesis» only when Automático está en canary. */
export const ENTRY_LEAD_AUTO =
  'Elegí cómo armar la cartera de práctica. En los dos caminos revisás y confirmás antes de activar. Después podés encender Automático de práctica en cada tesis; nunca envía órdenes.';
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
/** Shown only when GET /auto returns 200. */
export const SETTINGS_ASK_NOTE_AUTO =
  'Las propuestas se confirman a mano. Si encendés Automático de práctica, opera solo por tope y objetivo, con dinero simulado y sin enviar órdenes.';
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

/** AU4 · Automático (práctica). Consent versions: bump to force re-accept. */
export const AUTO_CONSENT_VERSION = 'auto-practice-v1';
export const AUTO_NEWS_CONSENT_VERSION = 'auto-news-v1';

export const AUTO_SECTION_TITLE = 'Automático (práctica)';
export const AUTO_SECTION_LEAD =
  'Opcional. Con el seguimiento activo, compra o vende en la cartera de práctica cuando una posición se pasa del tope o se desvía del objetivo. Dinero simulado: no envía órdenes.';
export const AUTO_SWITCH_LABEL = 'Automático de práctica';
export const AUTO_SWITCH_ON = 'Encendido';
export const AUTO_SWITCH_OFF = 'Apagado';
export const AUTO_SWITCH_HINT = 'Se aplica al instante. Podés apagarlo cuando quieras.';
export const AUTO_NEWS_SWITCH_LABEL = 'También por noticias (tesis rota)';
export const AUTO_NEWS_SWITCH_HINT_LOCKED =
  'Viene apagado. Se habilita con Automático de práctica encendido.';
export const AUTO_NEWS_SWITCH_HINT =
  'Usa las revisiones de noticias con IA. Si la IA está en pausa, queda en espera.';
export const AUTO_NEWS_WAITING =
  'En espera: la IA está en pausa. El tope y el objetivo por precio siguen.';

export const AUTO_CONSENT_TITLE = 'Activar Automático de práctica';
export const AUTO_CONSENT_INTRO =
  'Automático opera solo con dinero de práctica, en esta tesis. No envía órdenes a un broker ni mueve dinero real.';
export const AUTO_CONSENT_ITEMS = Object.freeze([
  'Qué hace: compra o vende en la cartera de práctica cuando una posición se pasa del tope o se desvía del objetivo, y la lleva a su peso objetivo.',
  'Cuándo: de lunes a viernes, de 11 a 17 h (hora de Buenos Aires), con el último precio demorado y solo si la cotización está al día.',
  'Límites: hasta 2 operaciones por día en esta tesis y 6 por día en total, y como máximo el 50 % del valor de la tesis por día.',
  'Control: podés apagarlo cuando quieras desde Preferencias. Cada operación queda en Novedades con su motivo y se puede deshacer durante 72 horas, al precio de ese momento (no al original).',
  'Por noticias: es una opción aparte y viene apagada.',
]);
export const AUTO_CONSENT_CHECK =
  'Entiendo que Automático opera con dinero de práctica y que deshacer usa el precio actual.';
export const AUTO_CONSENT_CONFIRM = 'Activar Automático de práctica';
export const AUTO_CONSENT_CANCEL = 'Cancelar';

export const AUTO_NEWS_CONSENT_TITLE = 'Activar también por noticias';
export const AUTO_NEWS_CONSENT_INTRO =
  'Si una revisión de noticias marca esta tesis como rota, Automático vende la mitad de cada posición en la cartera de práctica y después queda en pausa. No envía órdenes a un broker.';
export const AUTO_NEWS_CONSENT_ITEMS = Object.freeze([
  'Vende en unidades enteras: una posición de 1 unidad no se toca.',
  'Después de esa venta, Automático queda en pausa en esta tesis hasta que lo vuelvas a encender.',
  'Depende de la revisión de noticias con IA: si la IA está en pausa, esta opción queda en espera. El tope y el objetivo por precio siguen.',
  'Usa las revisiones de tu cuota diaria; no pide revisiones extra.',
  'Podés apagar esta opción cuando quieras y deshacer la venta durante 72 horas, al precio actual.',
]);
export const AUTO_NEWS_CONSENT_CHECK =
  'Entiendo que una tesis rota vende la mitad de cada posición y pausa Automático.';
export const AUTO_NEWS_CONSENT_CONFIRM = 'Activar por noticias';
export const AUTO_NEWS_CONSENT_CANCEL = 'Cancelar';

export const AUTO_CHIP_ON = 'Automático · práctica';
export const AUTO_CHIP_WAITING = 'Automático · en espera';
export const AUTO_CHIP_PAUSED = 'Automático · en pausa';
export const AUTO_CHIP_OFF = 'Automático · apagado';
export const AUTO_CHIP_NEWS_PAUSED = 'Noticias en pausa';

export const AUTO_WAITING_REASONS = Object.freeze({
  mercado_cerrado: 'Mercado cerrado: retoma en la próxima rueda.',
  cotizacion_vieja: 'Sin precio actualizado: espera la próxima cotización.',
});

export const AUTO_PAUSE_REASONS = Object.freeze({
  tesis_rota: 'Tesis rota: vendió la mitad de cada posición y quedó en pausa. Encendelo de nuevo cuando lo decidas.',
  error_libro: 'Se pausó para revisar el libro de práctica. Esa operación no se aplicó.',
  usuario_suspendido: 'Tu cuenta está suspendida. Automático no opera.',
  auto_global_apagado: 'Automático está desactivado en La Viste por ahora.',
  politica_pausada: 'En pausa en esta tesis. Encendelo de nuevo desde Preferencias.',
});

export const AUTO_UNDO_LABEL = 'Deshacer';
export function AUTO_UNDO_HINT(until) {
  return `Al precio actual, no al original. Disponible hasta el ${until}.`;
}
export const AUTO_UNDO_HINT_CLOSED =
  'Se puede deshacer con el mercado abierto, de lunes a viernes de 11 a 17 h.';
export function AUTO_UNDO_ARIA(line) {
  return `Deshacer ${String(line || 'esta operación').trim()} al precio actual`;
}
export const AUTO_UNDO_TITLE = 'Deshacer al precio actual';
export const AUTO_UNDO_LEAD =
  'Se arma la operación inversa con el precio demorado de ahora, no con el original. La diferencia queda en tu resultado de práctica.';
export const AUTO_UNDO_PARTIAL =
  'Solo se puede deshacer una parte: los límites de efectivo, unidades o tope recortan la operación.';
export const AUTO_UNDO_CONFIRM = 'Deshacer ahora';
export const AUTO_UNDO_CANCEL = 'Cancelar';
export const AUTO_UNDO_DONE = 'Listo: se deshizo en la cartera de práctica. Quedó en Novedades.';

export const AUTO_UNDO_ERRORS = Object.freeze({
  mercado_cerrado: 'No se puede deshacer con el mercado cerrado. Probá de lunes a viernes, de 11 a 17 h.',
  feriado: 'No se puede deshacer con el mercado cerrado. Probá de lunes a viernes, de 11 a 17 h.',
  cotizacion_vieja: 'No hay un precio actualizado para deshacer ahora. Probá en unos minutos.',
  cotizacion_faltante: 'No hay un precio actualizado para deshacer ahora. Probá en unos minutos.',
  cotizacion_no_elegible: 'No hay un precio actualizado para deshacer ahora. Probá en unos minutos.',
  precio_no_sincronizado: 'No hay un precio actualizado para deshacer ahora. Probá en unos minutos.',
  sin_efectivo: 'No alcanza el efectivo de práctica para recomprar.',
  unidades_insuficientes: 'No hay unidades suficientes para volver a vender.',
  peso_posterior_mayor_al_tope: 'Recomprar dejaría la posición por encima del tope.',
  orden_manual_pendiente: 'Hay una operación manual pendiente en esta tesis. Confirmala o cancelala antes.',
  version_cambiada: 'La tesis cambió. Actualizamos la vista; probá de nuevo.',
  ventana_deshacer_vencida: 'Pasaron más de 72 horas: ya no se puede deshacer.',
  ya_deshecho: 'Esta operación ya se deshizo.',
  usuario_suspendido: 'Tu cuenta está suspendida. No se puede deshacer.',
});
export const AUTO_UNDO_ERROR_DEFAULT = 'No se pudo deshacer. No se movió nada.';

/** Keep in sync with REASONS in lib/auto/reasons.mjs (+ error_libro from the runner). */
const AUTO_REASON_CODES = new Set([
  'usuario_suspendido', 'ia_en_pausa', 'orden_manual_pendiente', 'tesis_rota',
  'mercado_cerrado', 'feriado', 'cotizacion_vieja', 'cotizacion_no_elegible',
  'cotizacion_faltante', 'precio_no_sincronizado', 'sin_efectivo',
  'unidades_insuficientes', 'peso_posterior_mayor_al_tope', 'limite_tesis',
  'limite_usuario', 'rotacion_diaria', 'demo', 'escenario_no_normal',
  'monitoreo_pausado', 'fase_inactiva', 'sin_precios_reales', 'version_cambiada',
  'news_trigger_apagado', 'ventana_deshacer_vencida', 'ya_deshecho',
  'simulacion_requerida', 'politica_pausada', 'auto_tesis_apagado',
  'auto_global_apagado', 'auto_feature_apagado', 'canary_no_owner',
  'cooldown', 'condicion_ausente', 'sin_patas', 'preview_rechazado',
  'error_libro',
]);

export function autoUndoErrorCopy(code) {
  return AUTO_UNDO_ERRORS[code] || AUTO_UNDO_ERROR_DEFAULT;
}

export const AUTO_ON_TOAST = 'Automático de práctica quedó encendido en esta tesis.';
export const AUTO_OFF_TOAST = 'Automático de práctica quedó apagado en esta tesis.';
export const AUTO_NEWS_ON_TOAST = 'También por noticias quedó encendido.';
export const AUTO_NEWS_OFF_TOAST = 'También por noticias quedó apagado.';
export const AUTO_NEEDS_MONITORING =
  'Para encender Automático, la tesis tiene que estar activa y con seguimiento.';
export const AUTO_EMPTY =
  'Todavía no operó. Cuando lo haga, lo vas a ver en Novedades con su motivo.';
export function AUTO_LAST(when) {
  return `Última operación: ${when}.`;
}
export const AUTO_EVENT_REVERSED_TITLE = 'Operación deshecha · Automático';
