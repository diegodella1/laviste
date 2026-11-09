/**
 * Trade alert plain text template (mirror of HTML).
 * Spanish es-AR, voseo, clean formatting.
 */

import {formatPercentES, formatPercentWithArrow, formatWeightPercent, directionLabel, formatDateES} from './format.mjs';

const NNBSP = '\u202F';

function sanitizeReasonPlain(text) {
  if (!text) return text;
  return text.replace(/\.+$/, '').replace(/\.\s*\./g, '.');
}

export function buildTradeText({
  ticker,
  side,
  thesisName,
  date,
  weightBeforePct,
  weightAfterPct,
  weightDeltaPct,
  assetDayPct,
  portfolioDayPct,
  reasonPlain,
  thesisImpactPct,
  portfolioImpactPct,
  thesisNames = [],
  deepLink,
  isExample = false,
} = {}) {
  const dateStr = formatDateES(date || new Date(), {long: true, time: true});
  const sideLabel = side === 'compra' ? 'Compra' : 'Venta';
  
  let text = `Alerta de práctica · ${dateStr}\n`;
  if (isExample) {
    text += `\n⚠️  DATOS DE EJEMPLO · No es la cartera de un usuario real.\n`;
  }
  text += `\n`;
  text += `=== QUÉ PASÓ ===\n`;
  text += `${sideLabel} simulada de ${ticker}\n`;
  text += `Tesis: ${thesisName}\n`;
  
  const allThesisNames = thesisNames.length > 0 ? thesisNames : [thesisName];
  if (allThesisNames.length > 1) {
    text += `(También en: ${allThesisNames.slice(1).join(', ')})\n`;
  }
  
  text += `Dinero de práctica · no se envió ninguna orden a un broker.\n\n`;
  
  if (weightBeforePct !== null && weightAfterPct !== null) {
    const beforeFmt = formatWeightPercent(weightBeforePct);
    const afterFmt = formatWeightPercent(weightAfterPct);
    const deltaFmt = formatPercentES(weightDeltaPct);
    text += `Peso de ${ticker}: ${beforeFmt}${NNBSP}→${NNBSP}${afterFmt} (${side === 'venta' ? '▼' : '▲'} ${deltaFmt})\n`;
  }
  
  if (assetDayPct !== null) {
    text += `${ticker} en el día: ${formatPercentWithArrow(assetDayPct)}\n`;
  }
  
  text += `\n`;
  
  text += `=== TU CARTERA HOY, DESPUÉS DE ESTA OPERACIÓN ===\n`;
  text += `${directionLabel(portfolioDayPct)}: ${formatPercentWithArrow(portfolioDayPct)}\n`;
  text += `Resultado total de tu cartera de práctica en el día, ya contando esta ${side === 'venta' ? 'venta' : 'compra'} simulada.\n\n`;
  
  text += `=== POR QUÉ ===\n`;
  text += `Tesis: ${thesisName}\n`;
  const sanitized = sanitizeReasonPlain(reasonPlain);
  text += `${sanitized}. Es la regla de ${reasonPlain.includes('tope') ? 'tope' : 'rebalanceo'}, no una recomendación nueva.\n\n`;
  
  if (portfolioImpactPct !== null || thesisImpactPct !== null) {
    text += `=== IMPACTO DE ESTA OPERACIÓN ===\n`;
    text += `Cartera: ${portfolioImpactPct !== null ? formatPercentWithArrow(portfolioImpactPct) : '—'}\n`;
    text += `Tesis «${thesisName}»: ${thesisImpactPct !== null ? formatPercentWithArrow(thesisImpactPct) : '—'}\n`;
    text += `Cambio de valor en % atribuible a esta operación (práctica), distinto del resultado total del día de arriba.\n\n`;
  }
  
  const url = deepLink || 'https://laviste.diegodella.ar/app';
  text += `Ver la operación: ${url}\n\n`;
  text += `---\n\n`;
  text += getFooter();
  
  return text;
}

function getFooter() {
  let footer = `Este mensaje es educativo y simulado. No constituye asesoramiento financiero. La Viste es un simulador con dinero de práctica (simulado), no real. Los precios pueden ir demorados. No se envían órdenes a un broker.\n\n`;
  footer += `Recibís este aviso porque activaste las alertas de Automático. Las operaciones son de práctica: no se envía ninguna orden a un broker.\n\n`;
  footer += `Darse de baja o cambiar alertas: https://laviste.diegodella.ar/app#/cuenta/email\n`;
  footer += `Privacidad y datos: https://laviste.diegodella.ar/privacidad\n\n`;
  footer += `© 2026 La Viste · Una mirada propia.`;
  return footer;
}
