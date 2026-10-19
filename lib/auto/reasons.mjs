/** Explicit block codes so AU3 can persist skip_reason / audit without guessing. */

export const REASONS = Object.freeze({
  USUARIO_SUSPENDIDO: 'usuario_suspendido',
  IA_EN_PAUSA: 'ia_en_pausa',
  ORDEN_MANUAL_PENDIENTE: 'orden_manual_pendiente',
  TESIS_ROTA: 'tesis_rota',
  MERCADO_CERRADO: 'mercado_cerrado',
  FERIADO: 'feriado',
  COTIZACION_VIEJA: 'cotizacion_vieja',
  COTIZACION_NO_ELEGIBLE: 'cotizacion_no_elegible',
  COTIZACION_FALTANTE: 'cotizacion_faltante',
  PRECIO_NO_SINCRONIZADO: 'precio_no_sincronizado',
  SIN_EFECTIVO: 'sin_efectivo',
  UNIDADES_INSUFICIENTES: 'unidades_insuficientes',
  PESO_POSTERIOR_MAYOR_AL_TOPE: 'peso_posterior_mayor_al_tope',
  LIMITE_TESIS: 'limite_tesis',
  LIMITE_USUARIO: 'limite_usuario',
  ROTACION_DIARIA: 'rotacion_diaria',
  DEMO: 'demo',
  ESCENARIO_NO_NORMAL: 'escenario_no_normal',
  MONITOREO_PAUSADO: 'monitoreo_pausado',
  FASE_INACTIVA: 'fase_inactiva',
  SIN_PRECIOS_REALES: 'sin_precios_reales',
  VERSION_CAMBIADA: 'version_cambiada',
  NEWS_TRIGGER_APAGADO: 'news_trigger_apagado',
  VENTANA_DESHACER_VENCIDA: 'ventana_deshacer_vencida',
  YA_DESHECHO: 'ya_deshecho',
  SIMULACION_REQUERIDA: 'simulacion_requerida',
  POLITICA_PAUSADA: 'politica_pausada',
  AUTO_TESIS_APAGADO: 'auto_tesis_apagado',
  AUTO_GLOBAL_APAGADO: 'auto_global_apagado',
  AUTO_FEATURE_APAGADO: 'auto_feature_apagado',
  CANARY_NO_OWNER: 'canary_no_owner',
  COOLDOWN: 'cooldown',
  CONDICION_AUSENTE: 'condicion_ausente',
  SIN_PATAS: 'sin_patas',
  PREVIEW_RECHAZADO: 'preview_rechazado',
});

export function blocked(reason, extra = {}) {
  return {ok: false, reason, reasons: extra.reasons || [reason], ...extra};
}

export function allowed(extra = {}) {
  return {ok: true, reason: null, reasons: extra.reasons || [], ...extra};
}
