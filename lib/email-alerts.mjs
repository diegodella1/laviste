import {randomUUID} from 'node:crypto';
import {getEmailPrefs, enqueueEmail, LEGAL_FOOTER_SPANISH} from './email.mjs';

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

function formatPercentage(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0%';
  const pct = (value * 100).toFixed(2);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

export function recordTradeAlert(db, {userId, takeId, tradeKind, deltaPercent, now = Date.now} = {}) {
  const nowFn = typeof now === 'function' ? now : () => now;
  const createdAt = new Date(nowFn());
  const windowStart = new Date(Math.floor(createdAt.getTime() / ALERT_GROUP_WINDOW_MS) * ALERT_GROUP_WINDOW_MS);
  const windowEnd = new Date(windowStart.getTime() + ALERT_GROUP_WINDOW_MS);
  
  const existing = db.prepare(`
    SELECT * FROM email_alert_groups
    WHERE user_id = ? AND alert_type = 'trades' AND window_start = ? AND status = 'pending'
  `).get(userId, windowStart.toISOString());
  
  const event = {takeId, tradeKind, deltaPercent, at: createdAt.toISOString()};
  
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
  const subject = count === 1
    ? 'Automático ejecutó una operación'
    : `Automático ejecutó ${count} operaciones`;
  
  let bodyText = `Hola${userName ? ` ${userName}` : ''},\n\n`;
  bodyText += `Tu Automático ejecutó ${count === 1 ? 'una operación' : `${count} operaciones`} en tus tesis:\n\n`;
  
  for (const evt of events) {
    const pct = formatPercentage(evt.deltaPercent);
    bodyText += `• Tesis ${evt.takeId.slice(0, 8)}: ${evt.tradeKind} (${pct})\n`;
  }
  
  bodyText += '\n' + LEGAL_FOOTER_SPANISH;
  
  return {subject, bodyText};
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
    const {subject, bodyText} = group.alert_type === 'trades'
      ? buildTradesEmail(events, userName)
      : buildPausaEmail(events, userName);
    
    const scheduled = inSilenceWindow(currentTime)
      ? scheduleAfterSilence(currentTime).toISOString()
      : currentTime.toISOString();
    
    enqueueEmail(db, {
      userId: group.user_id,
      template: group.alert_type === 'trades' ? 'alert_trades' : 'alert_pausa',
      toEmail: user.email,
      subject,
      bodyText,
      bodyHtml: null,
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

function buildDigestEmail(portfolioMovements, newsItems, userName, prefs) {
  const subject = 'Resumen diario de tu portfolio';
  
  let bodyText = `Hola${userName ? ` ${userName}` : ''},\n\n`;
  bodyText += 'Resumen diario de tu portfolio:\n\n';
  
  if (portfolioMovements.length > 0) {
    bodyText += '📊 Movimientos:\n';
    for (const mov of portfolioMovements) {
      const pct = formatPercentage(mov.deltaPercent);
      bodyText += `• ${mov.symbol}: ${pct}\n`;
    }
    bodyText += '\n';
  }
  
  if (newsItems.length > 0 && prefs.newsEnabled) {
    bodyText += '📰 Noticias relevantes:\n';
    for (const item of newsItems) {
      bodyText += `• ${item.title}\n`;
      if (item.url) bodyText += `  ${item.url}\n`;
    }
    bodyText += '\n';
  }
  
  if (portfolioMovements.length === 0 && newsItems.length === 0) {
    bodyText += 'No hay movimientos significativos ni noticias destacadas hoy.\n\n';
  }
  
  bodyText += LEGAL_FOOTER_SPANISH;
  
  return {subject, bodyText};
}

export function scheduleDailyDigest(db, {userId, portfolioMovements = [], newsItems = [], now = Date.now} = {}) {
  const nowFn = typeof now === 'function' ? now : () => now;
  const currentTime = new Date(nowFn());
  
  const user = db.prepare('SELECT id, email, email_verified FROM users WHERE id = ?').get(userId);
  if (!user || !user.email_verified) return {scheduled: false, reason: 'unverified'};
  
  const prefs = getEmailPrefs(db, userId);
  const thresholdMet = portfolioMovements.some(m =>
    Math.abs(m.deltaPercent) >= prefs.thresholdAssetPct / 100
  );
  
  if (!thresholdMet && newsItems.length === 0) {
    return {scheduled: false, reason: 'no_significant_changes'};
  }
  
  const artCurrent = utcToART(currentTime);
  artCurrent.setUTCHours(DIGEST_HOUR, 0, 0, 0);
  
  if (artCurrent < currentTime) {
    artCurrent.setUTCDate(artCurrent.getUTCDate() + 1);
  }
  
  const scheduledAt = artToUTC(artCurrent).toISOString();
  const userName = user.email.split('@')[0];
  const {subject, bodyText} = buildDigestEmail(portfolioMovements, newsItems, userName, prefs);
  
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
    bodyHtml: null,
    meta: {movementCount: portfolioMovements.length, newsCount: newsItems.length},
    scheduledAt,
    now: nowFn,
  });
  
  return {scheduled: true, scheduledAt};
}

export function getNextDigestTime(now = Date.now) {
  const nowFn = typeof now === 'function' ? now : () => now;
  const currentTime = new Date(nowFn());
  const artCurrent = utcToART(currentTime);
  artCurrent.setUTCHours(DIGEST_HOUR, 0, 0, 0);
  
  if (artCurrent < currentTime) {
    artCurrent.setUTCDate(artCurrent.getUTCDate() + 1);
  }
  
  return artToUTC(artCurrent);
}
