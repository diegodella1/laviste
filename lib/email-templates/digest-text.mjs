/**
 * Daily digest plain text template (mirror of HTML).
 * Spanish es-AR, voseo, clean formatting.
 */

import {formatPercentES, formatPercentWithArrow, formatAbsolutePercent, directionLabel, formatDateES} from './format.mjs';

export function buildDigestText({
  userName,
  date,
  portfolio,
  theses = [],
  takeaway,
  autoActions = [],
  alertsFired = [],
  tip,
  newsItems = [],
  prefs = {},
} = {}) {
  const dateStr = formatDateES(date || new Date(), {long: true});
  const portfolioPct = portfolio?.dayPct ?? null;
  const portfolioWeekPct = portfolio?.weekPct ?? null;
  const hasPortfolioData = portfolioPct !== null;
  
  let text = `Hola${userName ? ` ${userName}` : ''},\n\n`;
  text += `Resumen diario · ${dateStr}\n\n`;
  
  if (hasPortfolioData) {
    const label = directionLabel(portfolioPct);
    const formatted = formatPercentWithArrow(portfolioPct);
    text += `=== RESULTADO TOTAL DEL DÍA ===\n`;
    text += `${label}: ${formatted}\n`;
    text += `Toda tu cartera de práctica · simulado · precios demorados · solo %\n\n`;
    
    if (portfolioWeekPct !== null) {
      text += `En la semana la cartera lleva ${formatPercentWithArrow(portfolioWeekPct)} (práctica).\n\n`;
    }
    
    if (theses.length > 0) {
      text += `Cómo se armó, por tesis:\n`;
      for (const thesis of theses) {
        if (thesis.dayPct !== null) {
          text += `  • ${thesis.name}: ${directionLabel(thesis.dayPct).toLowerCase()} ${formatPercentWithArrow(thesis.dayPct)}\n`;
        }
      }
      text += `\n`;
    }
  }
  
  if (takeaway) {
    text += `${takeaway}\n\n`;
  }
  
  if (theses.length > 0) {
    text += `=== TUS TESIS ===\n\n`;
    for (const thesis of theses) {
      if (thesis.dayPct === null) continue;
      
      text += `${thesis.name}\n`;
      text += `${formatPercentWithArrow(thesis.dayPct)} del día\n\n`;
      
      if (thesis.contributions && thesis.contributions.length > 0) {
        text += `Aportes:\n`;
        for (const contrib of thesis.contributions) {
          const thesisNames = contrib.thesisNames || [contrib.thesisName];
          text += `  • ${contrib.ticker}: ${formatPercentWithArrow(contrib.contribPct)} (${thesisNames.join(', ')})\n`;
        }
        text += `\n`;
      }
      
      if (thesis.movers && thesis.movers.length > 0) {
        text += `Movimientos del activo (día):\n`;
        for (const mover of thesis.movers) {
          const thesisNames = mover.thesisNames || [];
          text += `  • ${mover.symbol} ${formatPercentWithArrow(mover.dayPct)}`;
          if (thesisNames.length > 0) {
            text += ` (${thesisNames.join(', ')})`;
          }
          text += `\n`;
        }
        text += `\n`;
      }
    }
  }
  
  if (autoActions.length > 0) {
    text += `=== QUÉ HIZO EL MODO AUTOMÁTICO Y POR QUÉ ===\n\n`;
    const hasRealActions = autoActions.some(a => a.ticker);
    if (hasRealActions) {
      for (const action of autoActions) {
        if (!action.ticker) continue;
        const side = action.side === 'compra' ? 'Compra' : 'Venta';
        text += `${side} simulada · ${action.ticker}\n`;
        text += `Tesis: ${action.thesisName}\n`;
        text += `${action.reasonPlain}. No se envió ninguna orden a un broker.\n\n`;
      }
    } else {
      text += `Hoy Automático no ejecutó operaciones de práctica.\n\n`;
    }
  }
  
  if (alertsFired.length > 0) {
    text += `=== ALERTAS DISPARADAS ===\n\n`;
    const thresholdAsset = prefs.thresholdAssetPct ?? 5.0;
    const thresholdPortfolio = prefs.thresholdPortfolioPct ?? 3.0;
    
    for (const alert of alertsFired) {
      if (!alert.ticker) continue;
      const thesisNames = alert.thesisNames || [];
      text += `${alert.ticker} ${formatPercentWithArrow(alert.dayPct)} cruzó tu umbral de activo (${formatAbsolutePercent(thresholdAsset / 100)}).\n`;
      if (thesisNames.length > 0) {
        text += `Tesis: ${thesisNames.join(', ')}\n`;
      }
    }
    
    if (portfolioPct !== null) {
      text += `\nLa cartera — ${directionLabel(portfolioPct).toLowerCase()} ${formatPercentWithArrow(portfolioPct)} — no cruzó el umbral de cartera (${formatAbsolutePercent(thresholdPortfolio / 100)}).\n`;
    }
    text += `\n`;
  }
  
  if (newsItems.length > 0) {
    text += `=== NOTICIAS RELEVANTES ===\n\n`;
    for (const item of newsItems) {
      text += `• ${item.title}\n`;
      if (item.url) {
        text += `  ${item.url}\n`;
      }
    }
    text += `\n`;
  }
  
  if (tip) {
    text += `=== PARA APRENDER ===\n\n`;
    text += `${tip}\n\n`;
  }
  
  if (!hasPortfolioData && theses.length === 0 && autoActions.length === 0 && alertsFired.length === 0 && newsItems.length === 0) {
    // Unknown data: don't claim "no movements" when we don't have data
    text += `El resultado del día no está disponible todavía.\n`;
    text += `Revisá la app para ver el estado actual de tu cartera de práctica.\n\n`;
  }
  
  text += `Abrir La Viste: https://laviste.diegodella.ar/app\n\n`;
  text += `---\n\n`;
  text += getFooter('digest', prefs);
  
  return text;
}

function getFooter(type, prefs) {
  const thresholdAsset = prefs.thresholdAssetPct ?? 5.0;
  const thresholdPortfolio = prefs.thresholdPortfolioPct ?? 3.0;
  
  let footer = `Este mensaje es educativo y simulado. No constituye asesoramiento financiero. La Viste es un simulador con dinero de práctica (simulado), no real. Los precios pueden ir demorados. No se envían órdenes a un broker.\n\n`;
  
  if (type === 'digest') {
    footer += `Recibís este resumen porque tenés el digest de práctica activado. Lo armamos alrededor de las 18:00 (Argentina) cuando un activo se mueve al menos ${formatAbsolutePercent(thresholdAsset / 100)} (o el umbral que elegiste), cuando la cartera se mueve al menos ${formatAbsolutePercent(thresholdPortfolio / 100)}, o cuando hay noticias que pediste.\n\n`;
  } else {
    footer += `Recibís este aviso porque activaste las alertas de Automático. Las operaciones son de práctica: no se envía ninguna orden a un broker.\n\n`;
  }
  
  footer += `Darse de baja o cambiar alertas: https://laviste.diegodella.ar/app#/cuenta/email\n`;
  footer += `Privacidad y datos: https://laviste.diegodella.ar/privacidad\n\n`;
  footer += `© 2026 La Viste · Una mirada propia.`;
  
  return footer;
}
