import {randomUUID} from 'node:crypto';
import {getEmailPrefs, enqueueEmail, LEGAL_FOOTER_SPANISH} from './email.mjs';
import {buildDigestHtml} from './email-templates/digest-html.mjs';
import {buildDigestText} from './email-templates/digest-text.mjs';
import {buildTradeHtml} from './email-templates/trade-html.mjs';
import {buildTradeText} from './email-templates/trade-text.mjs';
import {formatPercentES} from './email-templates/format.mjs';

export const ALERT_GROUP_WINDOW_MS = 15 * 60 * 1000;
export const SILENCE_START_HOUR = 22;
export const SILENCE_END_HOUR = 8;
export const DIGEST_HOUR = 18;
const ART_OFFSET_MS = -3 * 60 * 60 * 1000;

function utcToART(date) {
  return new Date(date.getTime() + ART_OFFSET_MS);
}

function artToUTC(artDate) {
  return new Date(artDate.getTime() - ART_OFFSET_MS);
}

function inSilenceWindow(date) {
  const artDate = utcToART(date);
  const hour = artDate.getUTCHours();
  return hour >= SILENCE_START_HOUR || hour < SILENCE_END_HOUR;
}

function scheduleAfterSilence(date) {
  const artDate = utcToART(date);
  const hour = artDate.getUTCHours();
  
  if (hour < SILENCE_END_HOUR) {
    artDate.setUTCHours(SILENCE_END_HOUR, 0, 0, 0);
    return artToUTC(artDate);
  }
  
  if (hour >= SILENCE_START_HOUR) {
    artDate.setUTCDate(artDate.getUTCDate() + 1);
    artDate.setUTCHours(SILENCE_END_HOUR, 0, 0, 0);
    return artToUTC(artDate);
  }
  
  return date;
}

/** @deprecated Use formatPercentES from email-templates/format.mjs */
function formatPercentage(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0%';
  const pct = (value * 100).toFixed(2);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

export function recordTradeAlert(db, {
  userId,
  takeId,
  tradeKind,
  deltaPercent,
  ticker,
  side,
  thesisName,
  reasonPlain,
  weightBeforePct,
  weightAfterPct,
  weightDeltaPct,
  assetDayPct,
  portfolioDayPct,
  thesisImpactPct,
  portfolioImpactPct,
  thesisNames,
  now = Date.now
} = {}) {
  const nowFn = typeof now === 'function' ? now : () => now;
  const createdAt = new Date(nowFn());
  const windowStart = new Date(Math.floor(createdAt.getTime() / ALERT_GROUP_WINDOW_MS) * ALERT_GROUP_WINDOW_MS);
  const windowEnd = new Date(windowStart.getTime() + ALERT_GROUP_WINDOW_MS);
  
  const existing = db.prepare(`
    SELECT * FROM email_alert_groups
    WHERE user_id = ? AND alert_type = 'trades' AND window_start = ? AND status = 'pending'
  `).get(userId, windowStart.toISOString());
  
  const event = {
    takeId,
    tradeKind,
    deltaPercent,
    ticker,
    side,
    thesisName,
    reasonPlain,
    weightBeforePct,
    weightAfterPct,
    weightDeltaPct,
    assetDayPct,
    portfolioDayPct,
    thesisImpactPct,
    portfolioImpactPct,
    thesisNames,
    at: createdAt.toISOString()
  };
  
  if (existing) {
    const events = JSON.parse(existing.events_json);
    events.push(event);
    db.prepare(`
      UPDATE email_alert_groups
      SET event_count = ?, events_json = ?
      WHERE id = ?
    `).run(events.length, JSON.stringify(events), existing.id);
    return {id: existing.id, windowStart: existing.window_start, windowEnd: existing.window_end};
  }
  
  const id = randomUUID();
  db.prepare(`
    INSERT INTO email_alert_groups(id, user_id, alert_type, window_start, window_end, event_count, events_json, status, created_at)
    VALUES (?, ?, 'trades', ?, ?, 1, ?, 'pending', ?)
  `).run(id, userId, windowStart.toISOString(), windowEnd.toISOString(), JSON.stringify([event]), createdAt.toISOString());
  
  return {id, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString()};
}

export function recordPausaAlert(db, {userId, takeId, reason, now = Date.now} = {}) {
  const nowFn = typeof now === 'function' ? now : () => now;
  const createdAt = new Date(nowFn());
  const windowStart = new Date(Math.floor(createdAt.getTime() / ALERT_GROUP_WINDOW_MS) * ALERT_GROUP_WINDOW_MS);
  const windowEnd = new Date(windowStart.getTime() + ALERT_GROUP_WINDOW_MS);
  
  const existing = db.prepare(`
    SELECT * FROM email_alert_groups
    WHERE user_id = ? AND alert_type = 'pausa' AND window_start = ? AND status = 'pending'
  `).get(userId, windowStart.toISOString());
  
  const event = {takeId, reason, at: createdAt.toISOString()};
  
  if (existing) {
    const events = JSON.parse(existing.events_json);
    events.push(event);
    db.prepare(`
      UPDATE email_alert_groups
      SET event_count = ?, events_json = ?
      WHERE id = ?
    `).run(events.length, JSON.stringify(events), existing.id);
    return {id: existing.id, windowStart: existing.window_start, windowEnd: existing.window_end};
  }
  
  const id = randomUUID();
  db.prepare(`
    INSERT INTO email_alert_groups(id, user_id, alert_type, window_start, window_end, event_count, events_json, status, created_at)
    VALUES (?, ?, 'pausa', ?, ?, 1, ?, 'pending', ?)
  `).run(id, userId, windowStart.toISOString(), windowEnd.toISOString(), JSON.stringify([event]), createdAt.toISOString());
  
  return {id, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString()};
}

function buildTradesEmail(events, userName) {
  const count = events.length;
  
  if (count === 0) {
    return {
      subject: 'Automático ejecutó una operación',
      bodyText: `Hola${userName ? ` ${userName}` : ''},\n\nTu Automático ejecutó una operación.\n\n${LEGAL_FOOTER_SPANISH}`,
      bodyHtml: null
    };
  }
  
  const firstEvent = events[0];
  const ticker = firstEvent.ticker || 'activo';
  const side = firstEvent.side === 'compra' ? 'compra' : 'venta';
  
  const subject = count === 1
    ? `Automático: ${side} simulada de ${ticker}`
    : `Automático ejecutó ${count} operaciones de práctica`;
  
  if (count === 1) {
    const evt = firstEvent;
    const bodyHtml = buildTradeHtml({
      ticker: evt.ticker,
      side: evt.side,
      thesisName: evt.thesisName || 'Tesis',
      date: new Date(evt.at),
      weightBeforePct: evt.weightBeforePct,
      weightAfterPct: evt.weightAfterPct,
      weightDeltaPct: evt.weightDeltaPct,
      assetDayPct: evt.assetDayPct,
      portfolioDayPct: evt.portfolioDayPct,
      reasonPlain: evt.reasonPlain || 'Operación automática de práctica',
      thesisImpactPct: evt.thesisImpactPct,
      portfolioImpactPct: evt.portfolioImpactPct,
      thesisNames: evt.thesisNames || [],
      deepLink: `https://laviste.diegodella.ar/app#/tesis/${evt.takeId}`,
    });
    
    const bodyText = buildTradeText({
      ticker: evt.ticker,
      side: evt.side,
      thesisName: evt.thesisName || 'Tesis',
      date: new Date(evt.at),
      weightBeforePct: evt.weightBeforePct,
      weightAfterPct: evt.weightAfterPct,
      weightDeltaPct: evt.weightDeltaPct,
      assetDayPct: evt.assetDayPct,
      portfolioDayPct: evt.portfolioDayPct,
      reasonPlain: evt.reasonPlain || 'Operación automática de práctica',
      thesisImpactPct: evt.thesisImpactPct,
      portfolioImpactPct: evt.portfolioImpactPct,
      thesisNames: evt.thesisNames || [],
      deepLink: `https://laviste.diegodella.ar/app#/tesis/${evt.takeId}`,
    });
    
    return {subject, bodyText, bodyHtml};
  }
  
  let bodyText = `Hola${userName ? ` ${userName}` : ''},\n\n`;
  bodyText += `Tu Automático ejecutó ${count} operaciones de práctica:\n\n`;
  
  for (const evt of events) {
    const sideLabel = evt.side === 'compra' ? 'Compra' : 'Venta';
    bodyText += `• ${sideLabel} de ${evt.ticker || 'activo'}\n`;
    bodyText += `  Tesis: ${evt.thesisName || evt.takeId?.slice(0, 8) || 'Tesis'}\n`;
    if (evt.reasonPlain) {
      bodyText += `  ${evt.reasonPlain}\n`;
    }
    bodyText += `\n`;
  }
  
  bodyText += LEGAL_FOOTER_SPANISH + '\n\n';
  bodyText += `Darse de baja o cambiar alertas: https://laviste.diegodella.ar/app#/cuenta/email\n`;
  
  return {subject, bodyText, bodyHtml: null};
}

function buildPausaEmail(events, userName) {
  const count = events.length;
  const subject = count === 1
    ? 'Automático pausó una tesis'
    : `Automático pausó ${count} tesis`;
  
  let bodyText = `Hola${userName ? ` ${userName}` : ''},\n\n`;
  bodyText += `Tu Automático pausó ${count === 1 ? 'una tesis' : `${count} tesis`}:\n\n`;
  
  for (const evt of events) {
    bodyText += `• Tesis ${evt.takeId.slice(0, 8)}: ${evt.reason}\n`;
  }
  
  bodyText += '\n' + LEGAL_FOOTER_SPANISH;
  
  return {subject, bodyText};
}

export function flushPendingAlerts(db, {now = Date.now} = {}) {
  const nowFn = typeof now === 'function' ? now : () => now;
  const currentTime = new Date(nowFn());
  
  const pending = db.prepare(`
    SELECT * FROM email_alert_groups
    WHERE status = 'pending' AND window_end <= ?
    ORDER BY window_end ASC
  `).all(currentTime.toISOString());
  
  let flushed = 0;
  
  for (const group of pending) {
    const user = db.prepare('SELECT id, email, email_verified FROM users WHERE id = ?').get(group.user_id);
    if (!user || !user.email_verified) {
      db.prepare('UPDATE email_alert_groups SET status = ? WHERE id = ?').run('failed', group.id);
      continue;
    }
    
    const prefs = getEmailPrefs(db, group.user_id);
    if (!prefs.tradesEnabled) {
      db.prepare('UPDATE email_alert_groups SET status = ? WHERE id = ?').run('failed', group.id);
      continue;
    }
    
    const events = JSON.parse(group.events_json || '[]');
    if (events.length === 0) {
      db.prepare('UPDATE email_alert_groups SET status = ? WHERE id = ?').run('failed', group.id);
      continue;
    }
    
    const userName = user.email.split('@')[0];
    const result = group.alert_type === 'trades'
      ? buildTradesEmail(events, userName)
      : buildPausaEmail(events, userName);
    
    const scheduled = inSilenceWindow(currentTime)
      ? scheduleAfterSilence(currentTime).toISOString()
      : currentTime.toISOString();
    
    enqueueEmail(db, {
      userId: group.user_id,
      template: group.alert_type === 'trades' ? 'alert_trades' : 'alert_pausa',
      toEmail: user.email,
      subject: result.subject,
      bodyText: result.bodyText,
      bodyHtml: result.bodyHtml || null,
      meta: {groupId: group.id, eventCount: events.length},
      scheduledAt: scheduled,
      now: nowFn,
    });
    
    db.prepare('UPDATE email_alert_groups SET status = ?, sent_at = ? WHERE id = ?')
      .run('sent', currentTime.toISOString(), group.id);
    
    flushed++;
  }
  
  return {flushed};
}

function buildDigestEmail(enrichedData, userName, prefs) {
  const {portfolio, theses = [], takeaway, autoActions = [], alertsFired = [], tip, newsItems = []} = enrichedData;
  const portfolioDayPct = portfolio?.dayPct ?? null;
  
  const filteredNewsItems = prefs.newsEnabled ? newsItems : [];
  
  let subject = 'Resumen de práctica';
  if (portfolioDayPct !== null) {
    const formatted = formatPercentES(portfolioDayPct);
    subject = `Tu cartera hoy ${formatted} · resumen de práctica`;
  }
  
  const bodyHtml = buildDigestHtml({
    userName,
    date: new Date(),
    portfolio,
    theses,
    takeaway,
    autoActions,
    alertsFired,
    tip,
    newsItems: filteredNewsItems,
    prefs,
  });
  
  const bodyText = buildDigestText({
    userName,
    date: new Date(),
    portfolio,
    theses,
    takeaway,
    autoActions,
    alertsFired,
    tip,
    newsItems: filteredNewsItems,
    prefs,
  });
  
  return {subject, bodyText, bodyHtml};
}

export function scheduleDailyDigest(db, {
  userId,
  portfolioMovements = [], // Deprecated: kept for API compatibility, not used for scheduling logic
  newsItems = [],
  enrichedData = null,
  now = Date.now
} = {}) {
  const nowFn = typeof now === 'function' ? now : () => now;
  const currentTime = new Date(nowFn());
  
  const user = db.prepare('SELECT id, email, email_verified FROM users WHERE id = ?').get(userId);
  if (!user || !user.email_verified) return {scheduled: false, reason: 'unverified'};
  
  const prefs = getEmailPrefs(db, userId);
  
  // Check portfolio threshold
  const enrichedPortfolioDayPct = enrichedData?.portfolio?.dayPct ?? null;
  const portfolioThresholdMet = enrichedPortfolioDayPct !== null && enrichedPortfolioDayPct !== undefined
    ? Math.abs(enrichedPortfolioDayPct) >= prefs.thresholdPortfolioPct / 100
    : false;
  
  // Check asset thresholds from enrichedData.portfolioMovements
  const assetAlerts = [];
  const assetMovements = enrichedData?.portfolioMovements || [];
  for (const movement of assetMovements) {
    if (Number.isFinite(movement.dayPct) && Math.abs(movement.dayPct) >= prefs.thresholdAssetPct / 100) {
      assetAlerts.push({
        ticker: movement.ticker,
        dayPct: movement.dayPct,
        thesisNames: movement.thesisNames || [],
        threshold: prefs.thresholdAssetPct,
      });
    }
  }
  const assetThresholdMet = assetAlerts.length > 0;
  
  // Respect approved threshold contract: only send if portfolio/asset threshold met,
  // news exists, or auto actions exist. Mere existence of theses is not qualifying movement.
  const shouldSend = portfolioThresholdMet || assetThresholdMet || newsItems.length > 0 
    || (enrichedData?.autoActions?.length > 0);
  
  if (!shouldSend) {
    return {scheduled: false, reason: 'no_significant_changes'};
  }
  
  const artCurrent = utcToART(currentTime);
  const currentARTHour = artCurrent.getUTCHours();
  artCurrent.setUTCHours(DIGEST_HOUR, 0, 0, 0);
  
  if (currentARTHour >= DIGEST_HOUR) {
    artCurrent.setUTCDate(artCurrent.getUTCDate() + 1);
  }
  
  const scheduledAt = artToUTC(artCurrent).toISOString();
  const userName = user.email.split('@')[0];
  
  // Build alertsFired array
  const alertsFired = [];
  if (portfolioThresholdMet) {
    alertsFired.push({
      type: 'portfolio_threshold',
      threshold: prefs.thresholdPortfolioPct,
      value: enrichedPortfolioDayPct,
    });
  }
  for (const alert of assetAlerts) {
    alertsFired.push({
      type: 'asset_threshold',
      ticker: alert.ticker,
      threshold: alert.threshold,
      value: alert.dayPct,
      thesisNames: alert.thesisNames,
    });
  }
  
  const digestData = enrichedData ? {
    ...enrichedData,
    alertsFired,
    newsItems,
  } : {
    portfolio: {dayPct: null, weekPct: null},
    theses: [],
    takeaway: null,
    autoActions: [],
    alertsFired,
    tip: 'Un activo puede subir mucho y mover poco la cartera si su peso es chico. Por eso mostramos el % del día y cuánto aportó cada tesis.',
    newsItems,
  };
  
  const {subject, bodyText, bodyHtml} = buildDigestEmail(digestData, userName, prefs);
  
  const existing = db.prepare(`
    SELECT id FROM email_outbox
    WHERE user_id = ? AND template = 'daily_digest' AND status = 'pending'
    AND DATE(scheduled_at) = DATE(?)
  `).get(userId, scheduledAt);
  
  if (existing) {
    return {scheduled: false, reason: 'already_scheduled'};
  }
  
  enqueueEmail(db, {
    userId,
    template: 'daily_digest',
    toEmail: user.email,
    subject,
    bodyText,
    bodyHtml,
    meta: {
      movementCount: portfolioMovements.length,
      newsCount: newsItems.length,
      thesesCount: digestData.theses.length,
      hasPortfolioDayPct: enrichedPortfolioDayPct !== null,
    },
    scheduledAt,
    now: nowFn,
  });
  
  return {scheduled: true, scheduledAt};
}

export function getNextDigestTime(now = Date.now) {
  const nowFn = typeof now === 'function' ? now : () => now;
  const currentTime = new Date(nowFn());
  const artCurrent = utcToART(currentTime);
  const currentARTHour = artCurrent.getUTCHours();
  artCurrent.setUTCHours(DIGEST_HOUR, 0, 0, 0);
  
  if (currentARTHour >= DIGEST_HOUR) {
    artCurrent.setUTCDate(artCurrent.getUTCDate() + 1);
  }
  
  return artToUTC(artCurrent);
}
