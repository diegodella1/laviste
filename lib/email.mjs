import {randomUUID, randomBytes, createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {emailEnabled} from './features.mjs';

export const EMAIL_FROM = 'alertas@laviste.diegodella.ar';
export const EMAIL_DAILY_LIMIT = 5;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const RESEND_API_URL = 'https://api.resend.com/emails';
/** Fixture template used by F0 unit tests; no dedupe_key. */
export const EMAIL_TEST_TEMPLATE = 'test';
export const EMAIL_ALLOWLIST_ENV = 'EMAIL_ALLOWLIST';
export const EMAIL_TRADES_FREQS = Object.freeze(['each', 'max_per_day', 'digest_only', 'off']);
export const EMAIL_PAUSA_FREQS = Object.freeze(['each', 'digest_only', 'off']);
export const EMAIL_DIGEST_FREQS = Object.freeze(['daily', 'off']);
/** Default N for new prefs rows. No-row GET stays 1 so existing tests keep pinning that. */
export const EMAIL_TRADES_DEFAULT_MAX = 3;
export const DIGEST_REQUIRED_CODE = 'digest_required';
export const DIGEST_REQUIRED_MESSAGE =
  'El resumen diario tiene que estar prendido si las operaciones o las pausas van al resumen.';
export const EMAIL_UNSUBSCRIBE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ART_OFFSET_MS = -3 * 60 * 60 * 1000;
const LIST_UNSUBSCRIBE_ORIGIN = 'https://laviste.diegodella.ar';
const LIST_UNSUBSCRIBE_PAGE = `${LIST_UNSUBSCRIBE_ORIGIN}/app#/cuenta/email`;

export function parseEmailAllowlist(env = process.env) {
  const raw = env?.[EMAIL_ALLOWLIST_ENV] ?? env?.EMAIL_RECIPIENT_ALLOWLIST ?? '';
  return String(raw)
    .split(/[,;\s]+/)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
}

/** Prod in this repo: NODE_ENV=production or the Compose cookie flag used on the Pi. */
export function isProductionEnv(env = process.env) {
  return String(env?.NODE_ENV || '').toLowerCase() === 'production'
    || env?.COOKIE_SECURE === 'true';
}

export function isRecipientAllowed(email, env = process.env) {
  const allowlist = parseEmailAllowlist(env);
  if (!allowlist.length) return !isProductionEnv(env);
  return allowlist.includes(String(email || '').trim().toLowerCase());
}

export function warnIfProductionAllowlistEmpty(env = process.env, log = console) {
  if (!isProductionEnv(env) || parseEmailAllowlist(env).length) return false;
  log.warn(JSON.stringify({
    event: 'email_allowlist_empty_in_production',
    message: 'EMAIL_ALLOWLIST is empty in production; all recipients are blocked',
  }));
  return true;
}

export function artDayString(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + ART_OFFSET_MS).toISOString().slice(0, 10);
}

export function tradesNeedsDigest(freq) {
  return freq === 'digest_only' || freq === 'max_per_day';
}

export function pausaNeedsDigest(freq) {
  return freq === 'digest_only';
}

export function prefsNeedDigest(tradesFreq, pausaFreq) {
  return tradesNeedsDigest(tradesFreq) || pausaNeedsDigest(pausaFreq);
}

function digestRequired() {
  throw Object.assign(new Error(DIGEST_REQUIRED_MESSAGE), {status: 400, code: DIGEST_REQUIRED_CODE});
}

export function unsubscribeSecret(env = process.env) {
  return String(env?.EMAIL_UNSUBSCRIBE_SECRET || '').trim();
}

export function createUnsubscribeToken(userId, {secret, now = Date.now, ttlMs = EMAIL_UNSUBSCRIBE_TTL_MS} = {}) {
  const id = String(userId || '');
  const key = String(secret || '');
  if (!id || !key) return '';
  const nowFn = typeof now === 'function' ? now : () => now;
  const exp = Math.floor((nowFn() + ttlMs) / 1000);
  const payload = `${id}.${exp}`;
  const sig = createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(token, {secret, now = Date.now} = {}) {
  const key = String(secret || '');
  if (!key) return null;
  const raw = String(token || '');
  const last = raw.lastIndexOf('.');
  if (last <= 0) return null;
  const payload = raw.slice(0, last);
  const sig = raw.slice(last + 1);
  const dot = payload.lastIndexOf('.');
  if (dot <= 0 || !sig) return null;
  const userId = payload.slice(0, dot);
  const exp = Number(payload.slice(dot + 1));
  if (!userId || !Number.isInteger(exp)) return null;
  const nowFn = typeof now === 'function' ? now : () => now;
  if (exp * 1000 <= nowFn()) return null;
  const expected = createHmac('sha256', key).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return {userId, exp};
}

export function listUnsubscribeUrl(userId, {secret, origin = LIST_UNSUBSCRIBE_ORIGIN, now, ttlMs} = {}) {
  const token = createUnsubscribeToken(userId, {secret, now, ttlMs});
  if (!token) return '';
  return `${origin}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** API-facing prefs: no-row GET shows N=3 without writing a row (F14). getEmailPrefs stays 1. */
export function presentEmailPrefs(prefs) {
  if (!prefs) return null;
  if (prefs.updatedAt == null) return {...prefs, tradesMaxPerDay: EMAIL_TRADES_DEFAULT_MAX};
  return prefs;
}

export function outboxDedupeKey({template, userId, groupId, scheduledAt} = {}) {
  if (!userId || !template || template === EMAIL_TEST_TEMPLATE || template === 'email_verification') {
    return null;
  }
  if (template === 'daily_digest') {
    const day = artDayString(scheduledAt || new Date().toISOString());
    return day ? `digest:${userId}:${day}` : null;
  }
  if ((template === 'alert_trades' || template === 'alert_pausa') && groupId) {
    return `${template}:${userId}:${groupId}`;
  }
  return null;
}

export function findOutboxByDedupeKey(db, dedupeKey) {
  if (!dedupeKey) return null;
  return db.prepare(`
    SELECT id, status, scheduled_at, to_email, dedupe_key FROM email_outbox
    WHERE dedupe_key = ? AND status IN ('pending', 'sent')
    LIMIT 1
  `).get(dedupeKey) || null;
}

/** @deprecated Use findOutboxByDedupeKey. Kept for digest ART-day lookup via computed key. */
export function findOutboxDaySend(db, {userId, template, scheduledAt} = {}) {
  const key = outboxDedupeKey({template, userId, scheduledAt: scheduledAt || new Date().toISOString()});
  return findOutboxByDedupeKey(db, key);
}

export function countOutboxForArtDay(db, {userId, template, scheduledAt} = {}) {
  if (!userId || !template) return 0;
  const day = artDayString(scheduledAt || new Date().toISOString());
  const rows = db.prepare(`
    SELECT scheduled_at FROM email_outbox
    WHERE user_id = ? AND template = ? AND status IN ('pending', 'sent')
  `).all(userId, template);
  return rows.filter(row => artDayString(row.scheduled_at) === day).length;
}

export const LEGAL_FOOTER_SPANISH = `
Este mensaje es educativo y simulado. No constituye asesoramiento financiero.
La Viste es un simulador con dinero de práctica, no real.
`.trim();

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function mintEmailVerificationToken() {
  return randomBytes(32).toString('base64url');
}

/**
 * Send email via Resend HTTP API using native fetch.
 * Returns {ok: true, messageId} on success, throws on error.
 */
export async function sendViaResend({to, subject, text, html, headers = {}}, {apiKey, fetcher = fetch, env = process.env} = {}) {
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured; email not sent');
  }

  const recipients = Array.isArray(to) ? to : [to];
  for (const recipient of recipients) {
    if (!isRecipientAllowed(recipient, env)) {
      throw new Error(`Recipient not on EMAIL_ALLOWLIST: ${recipient}`);
    }
  }
  
  const payload = {
    from: EMAIL_FROM,
    to: recipients,
    subject,
    text,
    ...(html ? {html} : {}),
    headers: {
      ...headers,
    },
  };

  const response = await fetcher(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');
    throw new Error(`Resend API error (${response.status}): ${error}`);
  }

  const result = await response.json();
  return {ok: true, messageId: result.id};
}

/**
 * Create email verification token for a user.
 */
export function createEmailVerificationToken(db, userId, {now = Date.now} = {}) {
  const token = mintEmailVerificationToken();
  const createdAt = new Date(now()).toISOString();
  const expiresAt = new Date(now() + EMAIL_VERIFICATION_TTL_MS).toISOString();
  
  db.prepare(`
    INSERT INTO email_verification_tokens(token_hash, user_id, created_at, expires_at, used_at)
    VALUES (?, ?, ?, ?, NULL)
  `).run(hashToken(token), userId, createdAt, expiresAt);
  
  return {token, expiresAt};
}

/**
 * Verify email verification token and mark email as verified.
 */
export function verifyEmailToken(db, token, {now = Date.now} = {}) {
  const row = db.prepare(`
    SELECT t.token_hash, t.user_id, t.expires_at, t.used_at, u.email
    FROM email_verification_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ?
  `).get(hashToken(token));

  if (!row) {
    throw Object.assign(new Error('Token de verificación inválido o expirado.'), {status: 400, code: 'invalid_token'});
  }
  
  if (row.used_at) {
    throw Object.assign(new Error('Este enlace ya fue usado.'), {status: 400, code: 'token_used'});
  }
  
  if (Date.parse(row.expires_at) <= now()) {
    throw Object.assign(new Error('Este enlace expiró.'), {status: 400, code: 'token_expired'});
  }

  const t = new Date(now()).toISOString();
  db.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ?')
    .run(t, row.token_hash);
  db.prepare('UPDATE users SET email_verified = 1, email_verified_at = ? WHERE id = ?')
    .run(t, row.user_id);

  return {userId: row.user_id, email: row.email};
}

function invalidPrefs(message) {
  throw Object.assign(new Error(message), {status: 400, code: 'invalid_prefs'});
}

function defaultFreqsFromTradesEnabled(tradesEnabled) {
  const on = tradesEnabled ? 'each' : 'off';
  return {tradesFreq: on, pausaFreq: on, digestFreq: 'daily', tradesMaxPerDay: 1};
}

function mapPrefsRow(row, userId) {
  if (!row) {
    return {
      userId,
      tradesEnabled: 0,
      newsEnabled: 0,
      thresholdAssetPct: 5.0,
      thresholdPortfolioPct: 3.0,
      tradesFreq: 'off',
      tradesMaxPerDay: 1,
      pausaFreq: 'off',
      digestFreq: 'daily',
      updatedAt: null,
    };
  }
  const tradesEnabled = row.trades_enabled ? 1 : 0;
  const fallback = defaultFreqsFromTradesEnabled(tradesEnabled);
  return {
    userId: row.user_id,
    tradesEnabled,
    newsEnabled: row.news_enabled ? 1 : 0,
    thresholdAssetPct: row.threshold_asset_pct,
    thresholdPortfolioPct: row.threshold_portfolio_pct,
    tradesFreq: row.trades_freq || fallback.tradesFreq,
    tradesMaxPerDay: Number.isInteger(row.trades_max_per_day) ? row.trades_max_per_day : 1,
    pausaFreq: row.pausa_freq || fallback.pausaFreq,
    digestFreq: row.digest_freq || fallback.digestFreq,
    updatedAt: row.updated_at,
  };
}

/**
 * Get email preferences for a user.
 */
export function getEmailPrefs(db, userId) {
  const row = db.prepare('SELECT * FROM email_prefs WHERE user_id = ?').get(userId);
  return mapPrefsRow(row, userId);
}

function parseMaxPerDay(value, fallback) {
  if (value == null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) invalidPrefs('tradesMaxPerDay debe ser un entero entre 1 y 5.');
  return n;
}

/**
 * Update email preferences for a user.
 */
export function updateEmailPrefs(db, userId, prefs = {}, {now = Date.now} = {}) {
  const current = getEmailPrefs(db, userId);
  const updatedAt = new Date(now()).toISOString();

  let tradesEnabled = current.tradesEnabled;
  let newsEnabled = current.newsEnabled;
  let tradesFreq = current.tradesFreq;
  let pausaFreq = current.pausaFreq;
  let digestFreq = current.digestFreq;
  let tradesMaxPerDay = current.tradesMaxPerDay;
  const thresholdAssetPct = typeof prefs.thresholdAssetPct === 'number' ? prefs.thresholdAssetPct : current.thresholdAssetPct;
  const thresholdPortfolioPct = typeof prefs.thresholdPortfolioPct === 'number' ? prefs.thresholdPortfolioPct : current.thresholdPortfolioPct;

  if (typeof prefs.newsEnabled === 'boolean') newsEnabled = prefs.newsEnabled ? 1 : 0;

  if (typeof prefs.tradesEnabled === 'boolean') {
    tradesEnabled = prefs.tradesEnabled ? 1 : 0;
    tradesFreq = prefs.tradesEnabled ? 'each' : 'off';
    pausaFreq = prefs.tradesEnabled ? 'each' : 'off';
  } else if (current.updatedAt === null && prefs.tradesFreq == null) {
    // First write that does not mention trades (legacy threshold/news tests) must
    // not look like an explicit «Apagado»: digest still lists those operations.
    tradesFreq = 'each';
    pausaFreq = prefs.pausaFreq != null ? pausaFreq : 'each';
    tradesEnabled = 1;
  }

  if (prefs.tradesFreq != null) {
    if (!EMAIL_TRADES_FREQS.includes(prefs.tradesFreq)) {
      invalidPrefs('tradesFreq inválida.');
    }
    tradesFreq = prefs.tradesFreq;
    tradesEnabled = (tradesFreq === 'each' || tradesFreq === 'max_per_day') ? 1 : 0;
  }
  if (prefs.pausaFreq != null) {
    if (!EMAIL_PAUSA_FREQS.includes(prefs.pausaFreq)) invalidPrefs('pausaFreq inválida.');
    pausaFreq = prefs.pausaFreq;
  }
  if (prefs.digestFreq != null) {
    if (!EMAIL_DIGEST_FREQS.includes(prefs.digestFreq)) invalidPrefs('digestFreq inválida.');
    digestFreq = prefs.digestFreq;
  }
  if (prefs.tradesMaxPerDay != null) {
    tradesMaxPerDay = parseMaxPerDay(prefs.tradesMaxPerDay, tradesMaxPerDay);
  } else if (current.updatedAt === null) {
    tradesMaxPerDay = EMAIL_TRADES_DEFAULT_MAX;
  } else if (tradesFreq === 'max_per_day') {
    tradesMaxPerDay = parseMaxPerDay(tradesMaxPerDay, EMAIL_TRADES_DEFAULT_MAX);
  }

  if (digestFreq === 'off' && prefsNeedDigest(tradesFreq, pausaFreq)) digestRequired();

  if (current.updatedAt === null) {
    db.prepare(`
      INSERT INTO email_prefs(
        user_id, trades_enabled, news_enabled, threshold_asset_pct, threshold_portfolio_pct,
        trades_freq, trades_max_per_day, pausa_freq, digest_freq, updated_at, prefs_touched
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      userId, tradesEnabled, newsEnabled, thresholdAssetPct, thresholdPortfolioPct,
      tradesFreq, tradesMaxPerDay, pausaFreq, digestFreq, updatedAt,
    );
  } else {
    db.prepare(`
      UPDATE email_prefs
      SET trades_enabled = ?, news_enabled = ?, threshold_asset_pct = ?, threshold_portfolio_pct = ?,
          trades_freq = ?, trades_max_per_day = ?, pausa_freq = ?, digest_freq = ?, updated_at = ?,
          prefs_touched = 1
      WHERE user_id = ?
    `).run(
      tradesEnabled, newsEnabled, thresholdAssetPct, thresholdPortfolioPct,
      tradesFreq, tradesMaxPerDay, pausaFreq, digestFreq, updatedAt, userId,
    );
  }

  return getEmailPrefs(db, userId);
}

/**
 * Check if email is suppressed (bounce, complaint, unsubscribe).
 */
export function isEmailSuppressed(db, email) {
  const row = db.prepare('SELECT reason FROM email_suppressions WHERE email = ?').get(email.toLowerCase());
  return row ? {suppressed: true, reason: row.reason} : {suppressed: false};
}

/**
 * Add email to suppression list.
 */
export function suppressEmail(db, email, reason, {now = Date.now} = {}) {
  const createdAt = new Date(now()).toISOString();
  db.prepare(`
    INSERT INTO email_suppressions(email, reason, created_at, meta)
    VALUES (?, ?, ?, '{}')
    ON CONFLICT(email) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at
  `).run(email.toLowerCase(), reason, createdAt);
}

/** Turn off prefs and suppress the user's own address. Tied to userId, not a free-form email. */
export function unsubscribeUser(db, userId, {now = Date.now} = {}) {
  const row = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
  if (!row?.email) {
    throw Object.assign(new Error('No encontramos esa cuenta.'), {status: 404, code: 'user_not_found'});
  }
  suppressEmail(db, row.email, 'unsubscribe', {now});
  return updateEmailPrefs(db, userId, {
    tradesFreq: 'off',
    pausaFreq: 'off',
    digestFreq: 'off',
    newsEnabled: false,
  }, {now});
}

/**
 * Check daily email count for user.
 */
export function getDailyEmailCount(db, userId, day) {
  const row = db.prepare('SELECT count FROM email_daily_counts WHERE user_id = ? AND day = ?').get(userId, day);
  return row ? row.count : 0;
}

/**
 * Increment daily email count for user.
 */
export function incrementDailyEmailCount(db, userId, day) {
  const current = getDailyEmailCount(db, userId, day);
  if (current === 0) {
    db.prepare('INSERT INTO email_daily_counts(user_id, day, count) VALUES (?, ?, 1)').run(userId, day);
  } else {
    db.prepare('UPDATE email_daily_counts SET count = count + 1 WHERE user_id = ? AND day = ?').run(userId, day);
  }
  return current + 1;
}

/**
 * Enqueue email to outbox.
 */
export function enqueueEmail(db, {userId, template, toEmail, subject, bodyText, bodyHtml, meta = {}, scheduledAt, now = Date.now, env = process.env} = {}) {
  const id = randomUUID();
  const createdAt = new Date(now()).toISOString();
  const scheduled = scheduledAt || createdAt;
  const groupId = meta?.groupId;
  const dedupeKey = outboxDedupeKey({template, userId, groupId, scheduledAt: scheduled});

  if (!isRecipientAllowed(toEmail, env)) {
    return {
      id: null, userId, template, toEmail, subject, status: 'blocked',
      reason: 'recipient_not_allowed', createdAt, scheduledAt: scheduled, dedupeKey,
    };
  }

  if (template === 'alert_trades') {
    const prefs = getEmailPrefs(db, userId);
    if (prefs.tradesFreq === 'max_per_day') {
      const cap = Math.min(Math.max(prefs.tradesMaxPerDay || 1, 1), 5);
      const sentOrPending = countOutboxForArtDay(db, {userId, template, scheduledAt: scheduled});
      if (sentOrPending >= cap) {
        return {
          id: null, userId, template, toEmail, subject, status: 'deferred',
          reason: 'deferred_digest', createdAt, scheduledAt: scheduled, dedupeKey,
        };
      }
    }
  }

  const existing = findOutboxByDedupeKey(db, dedupeKey);
  if (existing) {
    return {
      id: existing.id, userId, template, toEmail: existing.to_email, subject,
      status: existing.status, reason: 'already_queued_or_sent', duplicate: true,
      createdAt, scheduledAt: existing.scheduled_at, dedupeKey,
    };
  }

  try {
    db.prepare(`
      INSERT INTO email_outbox(id, user_id, template, to_email, subject, body_text, body_html, meta, status, attempts, created_at, scheduled_at, sent_at, error, dedupe_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, NULL, NULL, ?)
    `).run(id, userId, template, toEmail, subject, bodyText, bodyHtml || null, JSON.stringify(meta), createdAt, scheduled, dedupeKey);
  } catch (error) {
    const constraint = /UNIQUE constraint failed/i.test(String(error?.message || error));
    if (constraint) {
      const raced = findOutboxByDedupeKey(db, dedupeKey);
      if (raced) {
        return {
          id: raced.id, userId, template, toEmail: raced.to_email, subject,
          status: raced.status, reason: 'already_queued_or_sent', duplicate: true,
          createdAt, scheduledAt: raced.scheduled_at, dedupeKey,
        };
      }
    }
    throw error;
  }

  return {id, userId, template, toEmail, subject, status: 'pending', createdAt, scheduledAt: scheduled, dedupeKey};
}

/**
 * Get pending emails from outbox.
 */
export function getPendingEmails(db, {limit = 10, now = Date.now} = {}) {
  const currentTime = new Date(now()).toISOString();
  return db.prepare(`
    SELECT * FROM email_outbox
    WHERE status = 'pending' AND scheduled_at <= ?
    ORDER BY scheduled_at ASC
    LIMIT ?
  `).all(currentTime, limit).map(row => ({
    id: row.id,
    userId: row.user_id,
    template: row.template,
    toEmail: row.to_email,
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    meta: row.meta ? JSON.parse(row.meta) : {},
    status: row.status,
    attempts: row.attempts,
    createdAt: row.created_at,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    error: row.error,
  }));
}

/**
 * Mark email as sent.
 */
export function markEmailSent(db, emailId, {now = Date.now} = {}) {
  const sentAt = new Date(now()).toISOString();
  db.prepare(`
    UPDATE email_outbox
    SET status = 'sent', sent_at = ?, attempts = attempts + 1
    WHERE id = ?
  `).run(sentAt, emailId);
}

/**
 * Mark email as failed.
 */
export function markEmailFailed(db, emailId, error, {now = Date.now} = {}) {
  db.prepare(`
    UPDATE email_outbox
    SET status = 'failed', error = ?, attempts = attempts + 1
    WHERE id = ?
  `).run(String(error).slice(0, 500), emailId);
}

/**
 * Process outbox: send pending emails respecting daily limits.
 */
export async function processOutbox(db, {apiKey, fetcher, limit = 10, now = Date.now, env = process.env} = {}) {
  if (!emailEnabled(env)) {
    return {processed: 0, sent: 0, skipped: 0, failed: 0, reason: 'feature_disabled'};
  }

  if (!apiKey) {
    return {processed: 0, sent: 0, skipped: 0, failed: 0, reason: 'no_api_key'};
  }

  const pending = getPendingEmails(db, {limit, now});
  let sent = 0, skipped = 0, failed = 0;
  const utcDay = new Date(now()).toISOString().slice(0, 10);
  const artDay = artDayString(now());
  const secret = unsubscribeSecret(env);

  for (const email of pending) {
    try {
      const suppression = isEmailSuppressed(db, email.toEmail);
      if (suppression.suppressed) {
        markEmailFailed(db, email.id, `Suppressed: ${suppression.reason}`, {now});
        skipped++;
        continue;
      }

      const user = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(email.userId);
      if (!user || !user.email_verified) {
        markEmailFailed(db, email.id, 'Email not verified', {now});
        skipped++;
        continue;
      }

      if (!isRecipientAllowed(email.toEmail, env)) {
        markEmailFailed(db, email.id, 'Recipient not on EMAIL_ALLOWLIST', {now});
        skipped++;
        continue;
      }

      const dailyCount = Math.max(
        getDailyEmailCount(db, email.userId, utcDay),
        getDailyEmailCount(db, email.userId, artDay),
      );
      if (dailyCount >= EMAIL_DAILY_LIMIT) {
        markEmailFailed(db, email.id, `Daily limit reached (${EMAIL_DAILY_LIMIT})`, {now});
        skipped++;
        continue;
      }

      const unsubscribeUrl = listUnsubscribeUrl(email.userId, {secret, now});
      const headers = {};
      if (unsubscribeUrl) {
        headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      } else {
        headers['List-Unsubscribe'] = `<${LIST_UNSUBSCRIBE_PAGE}>`;
      }

      await sendViaResend({
        to: email.toEmail,
        subject: email.subject,
        text: email.bodyText,
        html: email.bodyHtml,
        headers,
      }, {apiKey, fetcher, env});

      markEmailSent(db, email.id, {now});
      incrementDailyEmailCount(db, email.userId, artDay);
      if (utcDay !== artDay) incrementDailyEmailCount(db, email.userId, utcDay);
      sent++;
    } catch (error) {
      markEmailFailed(db, email.id, error.message, {now});
      failed++;
    }
  }

  return {processed: pending.length, sent, skipped, failed};
}

/**
 * Initialize email prefs for user based on auto policy.
 * Called when user activates a take or enables auto.
 */
export function initializeEmailPrefsForUser(db, userId, {hasAutoPolicyEnabled = false, now = Date.now} = {}) {
  const existing = db.prepare('SELECT user_id FROM email_prefs WHERE user_id = ?').get(userId);
  if (existing) return getEmailPrefs(db, userId);

  const tradesEnabled = hasAutoPolicyEnabled ? 1 : 0;
  const freq = hasAutoPolicyEnabled ? 'each' : 'off';
  const nowFn = typeof now === 'function' ? now : () => now;
  const updatedAt = new Date(nowFn()).toISOString();

  db.prepare(`
    INSERT INTO email_prefs(
      user_id, trades_enabled, news_enabled, threshold_asset_pct, threshold_portfolio_pct,
      trades_freq, trades_max_per_day, pausa_freq, digest_freq, updated_at
    )     VALUES (?, ?, 0, 5.0, 3.0, ?, ${EMAIL_TRADES_DEFAULT_MAX}, ?, 'daily', ?)
  `).run(userId, tradesEnabled, freq, freq, updatedAt);

  return getEmailPrefs(db, userId);
}

/** On enabling Automático: create each/each, or promote an untouched off/off default (F4/N3). */
export function promoteEmailPrefsOnAutoEnabled(db, userId, {now = Date.now} = {}) {
  const row = db.prepare(
    'SELECT trades_freq, pausa_freq, prefs_touched FROM email_prefs WHERE user_id = ?',
  ).get(userId);
  if (!row) return initializeEmailPrefsForUser(db, userId, {hasAutoPolicyEnabled: true, now});
  if (row.prefs_touched) return getEmailPrefs(db, userId);
  if (row.trades_freq === 'off' && row.pausa_freq === 'off') {
    return updateEmailPrefs(db, userId, {tradesFreq: 'each', pausaFreq: 'each'}, {now});
  }
  return getEmailPrefs(db, userId);
}
