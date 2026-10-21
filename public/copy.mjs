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
export const LOGIN_GOOGLE_NOACCESS =
  'Esta cuenta de Google no tiene acceso a La Viste. Pedile acceso a quien administra La Viste.';
export const LOGIN_PRIVACY = 'Privacidad y datos ↗';
export const LOGIN_STORY_TITLE = 'Tu espacio de práctica.';
export const SESSION_EXPIRED = 'La sesión venció. Iniciá de nuevo.';

/** User menu (Fase 1E). es-AR, tono Suizo. */
export const USER_MENU_LABEL = 'Tu cuenta';
export const USER_MENU_ACCOUNT = 'Cuenta';
export const USER_MENU_FAQ = 'Preguntas frecuentes ↗';
export const USER_LOGOUT = 'Cerrar sesión';
export const USER_ROLE_SUPERADMIN = 'Superadmin';
export const USER_ROLE_USER = 'Usuario';

/** Cuenta y contraseña (P0A). es-AR. */
export const ACCOUNT_EYEBROW = 'Tu espacio';
export const ACCOUNT_TITLE = 'Tu cuenta';
export const ACCOUNT_LEAD = 'Tu correo, tu contraseña y las sesiones abiertas.';
export const ACCOUNT_LOADING = 'Cargando tu cuenta…';
export const ACCOUNT_LOAD_ERROR = 'No pudimos cargar tu cuenta. Probá de nuevo.';
export const ACCOUNT_RETRY = 'Reintentar';
export const ACCOUNT_DATA_TITLE = 'Datos';
export const ACCOUNT_EMAIL_LABEL = 'Correo electrónico';
export const ACCOUNT_EMAIL_HINT = 'Para cambiar el correo, pedíselo a quien administra La Viste.';
export const ACCOUNT_ROLE_LABEL = 'Rol';
export const ACCOUNT_ROLE_SUPERADMIN = USER_ROLE_SUPERADMIN;
export const ACCOUNT_GOOGLE_LABEL = 'Acceso con Google';
export const ACCOUNT_GOOGLE_ON = 'Vinculado';
export const ACCOUNT_GOOGLE_OFF = 'No vinculado';
export const ACCOUNT_GOOGLE_OFF_HINT =
  'Se vincula la primera vez que entrás con Google usando este correo.';
export const ACCOUNT_LINK = 'Ir a Cuenta →';
export const SETTINGS_ACCESS_TITLE = 'Tu acceso';
export const SETTINGS_ACCESS_LEAD = 'Tu contraseña y tus sesiones se manejan en Cuenta.';

export const PW_CHANGE_TITLE = 'Cambiar contraseña';
export const PW_CHANGE_LEAD =
  'Al guardar, cerramos tu sesión en los otros dispositivos. En este seguís conectado.';
export const PW_CURRENT = 'Contraseña actual';
export const PW_NEW = 'Contraseña nueva';
export const PW_CONFIRM = 'Repetí la contraseña nueva';
export const PW_RULE = 'Al menos 12 caracteres. Puede tener espacios. Evitá usar tu correo.';
export const PW_SHOW = 'Mostrar';
export const PW_HIDE = 'Ocultar';
export const PW_SUBMIT = 'Guardar contraseña';
export const PW_SUBMITTING = 'Guardando…';
export const PW_OK = 'Contraseña actualizada. Cerramos tu sesión en los otros dispositivos.';
export const PW_OK_SOLO = 'Contraseña actualizada.';
export const PW_ERR_CURRENT_EMPTY = 'Escribí tu contraseña actual.';
export const PW_ERR_CURRENT = 'La contraseña actual no es correcta.';
export const PW_ERR_NEW_EMPTY = 'Escribí una contraseña nueva.';
export const PW_ERR_SHORT = 'Usá al menos 12 caracteres.';
export const PW_ERR_LONG = 'Es demasiado larga. Usá menos de 1024 caracteres.';
export const PW_ERR_EMAIL = 'No uses tu correo como contraseña.';
export const PW_ERR_SAME = 'Elegí una contraseña distinta de la actual.';
export const PW_ERR_MATCH = 'Las contraseñas no coinciden.';
export const PW_ERR_RATE = 'Demasiados intentos. Esperá diez minutos.';
export const PW_ERR_NOT_SET =
  'Tu cuenta no tiene contraseña. Pedile a quien administra La Viste un enlace para crearla.';
export const PW_GOOGLE_ONLY_TITLE = 'Contraseña';
export const PW_GOOGLE_ONLY_BODY =
  'Tu cuenta entra con Google y no tiene contraseña. Si querés entrar también con tu correo, pedile a quien administra La Viste un enlace para crearla.';
export const NET_ERROR = 'No se pudo completar. Revisá la conexión y probá de nuevo.';

export function pwShowLabel(field) {
  return `Mostrar ${field}`;
}
export function pwHideLabel(field) {
  return `Ocultar ${field}`;
}

export const SESSIONS_TITLE = 'Sesiones';
export const SESSIONS_ONE = 'Estás conectado solo en este dispositivo.';
export const SESSIONS_MANY_TMPL = 'Tenés {n} sesiones abiertas, contando esta.';
export const SESSIONS_NOTE =
  'Una sesión dura hasta doce horas y se renueva mientras usás La Viste.';
export const SESSIONS_REVOKE = 'Cerrar sesión en los otros dispositivos';
export const SESSIONS_LOGOUT = USER_LOGOUT;
export const DATA_TITLE = 'Tus datos';
export const DATA_BODY =
  'Descargá tus tesis, conversaciones, revisiones y operaciones de práctica en un archivo JSON. No incluye contraseñas ni credenciales.';
export const DATA_EXPORT = 'Exportar mis datos';

export const LOGIN_FORGOT = '¿Olvidaste tu contraseña?';
export const LOGIN_FORGOT_BODY =
  'Pedile a quien administra La Viste un enlace para elegir una contraseña nueva. Vence en 24 horas y sirve una sola vez.';
export const LOGIN_FORGOT_GOOGLE =
  'Si tu cuenta está vinculada a Google, también podés entrar con «Acceder con Google».';

export const RESET_CHECKING = 'Revisando el enlace…';
export const RESET_TITLE = 'Elegí una contraseña nueva';
export const RESET_LEAD =
  'Al guardar, cerramos todas las sesiones abiertas de esta cuenta y entrás con la contraseña nueva.';
export const RESET_SUBMIT = 'Guardar y entrar';
export const RESET_SUBMITTING = 'Guardando…';
export const RESET_OK = 'Listo. Tu contraseña cambió y cerramos las otras sesiones.';
export const RESET_INVALID_TITLE = 'Este enlace venció o ya se usó';
export const RESET_INVALID_BODY =
  'Los enlaces duran 24 horas y sirven una sola vez. Pedile uno nuevo a quien administra La Viste.';
export const RESET_MISSING_TITLE = 'Falta el enlace completo';
export const RESET_MISSING_BODY =
  'Abrí de nuevo el enlace completo que te compartieron. Si ya lo usaste, pedí uno nuevo a quien administra La Viste.';
export const RESET_RATE = 'Demasiados intentos desde esta conexión. Esperá diez minutos.';
export const RESET_TO_LOGIN = 'Ir a Acceso';

export const ADMIN_RESET_HINT =
  'Genera un enlace de un solo uso para elegir una contraseña nueva.';
export const ADMIN_RESET_BTN = 'Restablecer acceso';
export const ADMIN_RESET_BODY =
  'Se cierran todas sus sesiones y su contraseña actual deja de funcionar. Vas a ver un enlace de un solo uso para que elija una nueva; vence en 24 horas.';
export const ADMIN_RESET_GOOGLE_NOTE =
  'Tiene Google vinculado: puede seguir entrando con Google.';
export const ADMIN_RESET_CANCEL = 'Cancelar';
export const ADMIN_RESET_CONFIRM = 'Restablecer acceso';
export const ADMIN_RESET_LINK_LABEL = 'Enlace de un solo uso';
export const ADMIN_RESET_COPY = 'Copiar enlace';
export const ADMIN_RESET_COPIED = 'Enlace copiado.';
export const ADMIN_RESET_COPY_FAIL =
  'No se pudo copiar. Seleccioná el enlace y copialo a mano.';
export const ADMIN_RESET_CLOSE = 'Listo';
export const ADMIN_RESET_SELF = 'Para tu propia cuenta usá Cuenta → Cambiar contraseña.';
export const ADMIN_RESET_SUSPENDED =
  'La cuenta está suspendida. Reactivala antes de restablecer el acceso.';
export const ADMIN_RESET_ERR_NOT_FOUND = 'Esa cuenta ya no existe. Recargá la página.';
export const ADMIN_RESET_RATE = 'Generaste muchos enlaces en la última hora. Esperá un rato.';

export function sessionsCountLabel(n) {
  return n <= 1 ? SESSIONS_ONE : SESSIONS_MANY_TMPL.replace('{n}', String(n));
}

export function sessionsRevokedLabel(n) {
  const count = n === 1 ? '1 sesión' : `${n} sesiones`;
  return `Cerramos ${count}. Seguís conectado en este dispositivo.`;
}

export function resetForLabel(email) {
  return `Para ${email}.`;
}

export function adminResetHeading(email) {
  return `Acceso de ${email}`;
}

export function adminResetTitle(email) {
  return `Restablecer acceso de ${email}`;
}

export function adminResetDoneTitle(email) {
  return `Enlace para ${email}`;
}

export function adminResetLinkNote(fecha, hora) {
  return `Compartilo por un canal privado. No lo vas a volver a ver. Vence el ${fecha} a las ${hora} (Argentina).`;
}

export function pwOkCopy(revokedSessions) {
  return revokedSessions === 0 ? PW_OK_SOLO : PW_OK;
}

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
const ACCOUNT_ERROR_COPY = {
  password_current_required: PW_ERR_CURRENT_EMPTY,
  password_current_invalid: PW_ERR_CURRENT,
  password_too_short: PW_ERR_SHORT,
  password_too_long: PW_ERR_LONG,
  password_is_email: PW_ERR_EMAIL,
  password_same: PW_ERR_SAME,
  password_not_set: PW_ERR_NOT_SET,
  password_rate_limited: PW_ERR_RATE,
  reset_invalid: RESET_INVALID_TITLE,
  reset_rate_limited: RESET_RATE,
  user_not_found: ADMIN_RESET_ERR_NOT_FOUND,
  reset_self: ADMIN_RESET_SELF,
  reset_target_suspended: ADMIN_RESET_SUSPENDED,
  reset_admin_rate_limited: ADMIN_RESET_RATE,
};

export function friendlyApiError(err, {superadmin = false} = {}) {
  const message = apiErrorMessage(err);
  const code = String(apiErrorCode(err));
  if (ACCOUNT_ERROR_COPY[code]) return ACCOUNT_ERROR_COPY[code];
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
export const P1_PREFS = 'Ajustes';
export const P1_CLOSE = 'Cerrar';
export const P1_CLOSE_X = 'Cerrar ✕';
export const P1_NEW_THESIS = '+ Nueva tesis';
export const P1_RAIL_THESIS = 'Tesis';
export const P1_RAIL_DRAFTS = 'Borradores';
export const P1_DRAFT_LABEL = 'Borrador';
export const P1_RESULT_LABEL = 'Tu resultado desde el inicio';
export const P1_CHART_NO_HISTORY = 'El gráfico aparece después de la primera rueda con precios.';
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
export const AUTO_SWITCH_TRACKING_PAUSED = 'En pausa: el seguimiento está detenido. Automático no opera.';
export const AUTO_SWITCH_PAUSED = 'En pausa';
export const AUTO_PAUSED_INCONSISTENCY = 'Pausado por inconsistencia';
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
  'Control: podés apagarlo cuando quieras desde Ajustes. Cada operación queda en Novedades con su motivo y se puede deshacer durante 72 horas, al precio de ese momento (no al original).',
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
  politica_pausada: 'En pausa en esta tesis. Encendelo de nuevo desde Ajustes.',
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

/** TD1 · Ajustes por tesis + Archivar. es-AR, voseo sobrio. */
export const TD_SETTINGS_BTN = 'Ajustes';
export const TD_SETTINGS_ARIA = 'Ajustes de la tesis';
export const TD_SET_EYEBROW = 'Ajustes de la tesis';
export const TD_SET_TITLE = 'Ajustes';
export const TD_SET_LEAD = 'Valen solo para esta tesis. Todo es práctica: no se envían órdenes.';
export const TD_SEC_FOLLOW = 'Seguimiento';
export const TD_SEC_FOLLOW_LEAD = 'Cada cuánto revisamos precios, reglas y noticias. Se aplica al instante.';
export const TD_CAD_PATIENT = 'Paciente';
export const TD_CAD_PATIENT_SUB = 'Cada 7 días. Para tesis de largo plazo.';
export const TD_CAD_STANDARD = 'Estándar';
export const TD_CAD_STANDARD_SUB = 'Cada 24 horas.';
export const TD_CAD_MANUAL = 'Solo manual';
export const TD_CAD_MANUAL_SUB = 'Cuando toques «Revisar ahora».';
export const TD_CAD_NOTE = 'Cada revisión de noticias usa una de tus revisiones del día.';
export function TD_CAD_SAVED(label) {
  return `Frecuencia: ${label}.`;
}
export const TD_PAUSE_LABEL = 'Pausar seguimiento';
export const TD_PAUSE_ON = 'En pausa';
export const TD_PAUSE_OFF = 'Activo';
export const TD_PAUSE_HINT = 'En pausa no se revisan precios, reglas ni noticias, y Automático no opera.';
export const TD_PAUSE_ON_TOAST = 'Seguimiento en pausa.';
export const TD_PAUSE_OFF_TOAST = 'Seguimiento reanudado.';
export const TD_SEC_RULES = 'Reglas de la cartera';
export const TD_SEC_RULES_LEAD =
  'Las usan los chequeos y Automático de práctica para decidir cuándo volver al objetivo.';
export const TD_PRESET_TIGHT = 'Ajustada';
export const TD_PRESET_TIGHT_SUB = 'Tope 20\u202F% · desvío ±3 pp';
export const TD_PRESET_BAL = 'Equilibrada';
export const TD_PRESET_BAL_SUB = 'Tope 25\u202F% · desvío ±5 pp';
export const TD_PRESET_WIDE = 'Amplia';
export const TD_PRESET_WIDE_SUB = 'Tope 25\u202F% · desvío ±10 pp';
export function TD_PRESET_CUSTOM(cap, drift) {
  return `Personalizado: tope ${cap}\u202F% · desvío ±${drift} pp`;
}
export function TD_RULES_PRESET_BLOCKED(tickers, w) {
  return `No disponible: ${tickers} tienen objetivo de ${w}\u202F%.`;
}
export const TD_RULES_CUSTOM = 'Personalizar tope y desvío';
export const TD_CAP_LABEL = 'Tope por posición (%)';
export function TD_CAP_HELP(w) {
  return `Entre 10 y 25. No puede ser menor que el objetivo más alto (${w}\u202F%).`;
}
export const TD_DRIFT_LABEL = 'Desvío permitido (pp)';
export const TD_DRIFT_HELP = 'Entre 1 y 20 puntos.';
export const TD_ERR_CAP_RANGE = 'El tope tiene que estar entre 10 y 25\u202F%.';
export function TD_ERR_CAP_BELOW_WEIGHT(w) {
  return `El tope no puede ser menor que el objetivo más alto (${w}\u202F%).`;
}
export const TD_ERR_DRIFT_RANGE = 'El desvío tiene que estar entre 1 y 20 puntos.';
export const TD_RULES_SAVE = 'Guardar reglas';
export const TD_RULES_SAVED = 'Reglas guardadas. Quedó registrado en Novedades.';
export const TD_RULES_AUTO_NOTE = 'Automático de práctica usa estas mismas reglas.';
export const TD_AUTO_LIMITS =
  'Límites fijos: hasta 2 operaciones por día en esta tesis y 6 por día en total, y como máximo el 50\u202F% del valor de la tesis por día.';
export const TD_AUTO_UNDO =
  'Cada operación queda en Novedades y se puede deshacer durante 72 horas, al precio de ese momento.';
export const TD_SEC_INDEX = 'Índice de comparación';
export const TD_INDEX_CHOSEN = 'Elegido al activar';
export const TD_INDEX_RULE =
  'Se elige según la mezcla de la cartera: con la mitad o más en acciones locales se compara con el Índice Merval; si no, con el CEDEAR SPY.';
export const TD_INDEX_NONE = 'Esta tesis no tiene índice de comparación guardado.';
export const TD_INDEX_DRAFT = 'Se elige al activar, según la mezcla de la cartera.';
export const TD_SEC_MANAGE = 'Gestionar';
export const TD_ARCHIVE_ROW = 'Archivar tesis';
export const TD_ARCHIVE_ROW_BODY =
  'Se detiene el seguimiento y se conserva la historia. Queda en Mis tesis → Archivadas.';
export const TD_ARCHIVE_BTN = 'Archivar…';
export function TD_ARCHIVE_TITLE(title) {
  return `¿Archivar «${title}»?`;
}
export const TD_ARCHIVE_BODY =
  'Se detiene el seguimiento y se conserva la historia. Podés verla en Mis tesis → Archivadas.';
export const TD_ARCHIVE_SIDE = 'Automático de práctica deja de operar en esta tesis.';
export const TD_ARCHIVE_CONFIRM = 'Archivar';
export const TD_ARCHIVE_CANCEL = 'Cancelar';
export const TD_ARCHIVED_TOAST = 'Tesis archivada.';
export function TD_ARCHIVED_AT(fecha) {
  return fecha
    ? `Archivada el ${fecha}. La historia queda guardada.`
    : 'Archivada. La historia queda guardada.';
}

/** TD2 · Cabecera + paneles. es-AR, voseo sobrio. */
export const TD_RULES_LINK = 'Cambiar reglas →';
export const TD_CHIP_IN = 'Dentro';
export const TD_CHIP_DRIFT = 'Desvío';
export const TD_CHIP_OVER = 'Sobre tope';
export const TD_IDEA_HOW = 'Cómo actúa';
const TD_HOW_CADENCE_PHRASE = {
  patient: 'cada 7 días (Paciente)',
  standard: 'cada 24 horas (Estándar)',
  manual: 'cuando lo pedís (Solo manual)',
};
export function TD_HOW_CADENCE(cadence) {
  const phrase = TD_HOW_CADENCE_PHRASE[cadence] || TD_HOW_CADENCE_PHRASE.standard;
  return `Chequea tope y desvío ${phrase}.`;
}
export function TD_HOW_AUTO_ON(drift) {
  return `Automático de práctica: encendido. Compra o vende para volver al objetivo cuando una posición se pasa del tope o se desvía más de ±${drift} pp.`;
}
export const TD_HOW_AUTO_OFF = 'Automático de práctica: apagado. Las propuestas se confirman a mano.';
export const TD_HOW_AUTO_PAUSED = 'En pausa. Encendelo de nuevo en Ajustes para que vuelva a operar.';
export const TD_HOW_AUTO_TRACKING_PAUSED =
  'En pausa: el seguimiento está detenido. Automático no opera.';
export const TD_HOW_NEWS_ON =
  'Si una revisión marca la tesis como rota: vende la mitad de cada posición y pausa Automático.';
export const TD_HOW_NEWS_OFF =
  'Si una revisión marca la tesis como rota: te avisa en Novedades.';
export const TD_IDEA_EDIT = 'Editar la idea';
export const TD_IDEA_SCENARIO = TRY_SCENARIO;
export const TD_IDEA_HISTORY = 'Historial de versiones';
export const TD_PCT_OF_TOTAL = 'del total';
export const TD_OBJ_LABEL = 'obj.';

/** TD3 · Estados del detalle. es-AR, voseo sobrio. */
export const TD_LOADING = 'Cargando la tesis…';
export const TD_LOAD_ERROR_TITLE = 'No pudimos cargar esta tesis';
export const TD_LOAD_ERROR_BODY =
  'Sigue guardada; el problema es de conexión o del servidor. Probá de nuevo en unos segundos.';
export const TD_RETRY = 'Reintentar';
export const TD_GO_TAKES = 'Ir a Mis tesis';
export const TD_NOT_FOUND_TITLE = 'No encontramos esa tesis';
export const TD_NOT_FOUND_BODY =
  'Puede que el enlace esté mal o que la tesis sea de otra cuenta.';
export const TD_NEW_WHY = 'Recién activada: todas las posiciones están en su objetivo.';
export function TD_NEW_NEXT(h) {
  return `Primera revisión: hoy a las ${h}`;
}
export function TD_NEW_NEXT_ON(date, h) {
  return `Primera revisión: ${date} a las ${h}`;
}
export const TD_ARCHIVED_BANNER = 'Archivada: ya no se sigue. La historia queda como estaba.';
export const TD_ARCHIVED_ASK = 'Archivada: no admite consultas';
export const TD_CMP_GROUP = 'Comparar con';
export const TD_CMP_CAPITAL = 'vs. aportado';
export function TD_CMP_INDEX(i) {
  return `vs. ${i}`;
}
export const TD_SINCE_START = 'Desde el inicio';
export function TD_INDEX_PENDING(i) {
  return `vs. ${i}: después de la primera rueda`;
}
export function TD_INDEX_NOT_YET(i) {
  return `La comparación con ${i} aparece cuando haya dos ruedas con su precio.`;
}

export const PRIVACY_PUBLIC_SECTION =
  'Las tesis públicas se ven desde sus Ajustes.';
