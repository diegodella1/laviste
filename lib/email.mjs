import {randomUUID, randomBytes, createHash} from 'node:crypto';
import {emailEnabled} from './features.mjs';

export const EMAIL_FROM = 'alertas@laviste.diegodella.ar';
export const EMAIL_DAILY_LIMIT = 5;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const RESEND_API_URL = 'https://api.resend.com/emails';

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
export async function sendViaResend({to, subject, text, html, headers = {}}, {apiKey, fetcher = fetch} = {}) {
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured; email not sent');
  }
  
  const payload = {
    from: EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
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

/**
 * Get email preferences for a user.
 */
export function getEmailPrefs(db, userId) {
  const row = db.prepare('SELECT * FROM email_prefs WHERE user_id = ?').get(userId);
  if (!row) {
    return {
      userId,
      tradesEnabled: 0,
      newsEnabled: 0,
      thresholdAssetPct: 5.0,
      thresholdPortfolioPct: 3.0,
      updatedAt: null,
    };
  }
  return {
    userId: row.user_id,
    tradesEnabled: row.trades_enabled,
    newsEnabled: row.news_enabled,
    thresholdAssetPct: row.threshold_asset_pct,
    thresholdPortfolioPct: row.threshold_portfolio_pct,
    updatedAt: row.updated_at,
  };
}

/**
 * Update email preferences for a user.
 */
export function updateEmailPrefs(db, userId, prefs, {now = Date.now} = {}) {
  const current = getEmailPrefs(db, userId);
  const updatedAt = new Date(now()).toISOString();
  
  const tradesEnabled = typeof prefs.tradesEnabled === 'boolean' ? (prefs.tradesEnabled ? 1 : 0) : current.tradesEnabled;
  const newsEnabled = typeof prefs.newsEnabled === 'boolean' ? (prefs.newsEnabled ? 1 : 0) : current.newsEnabled;
  const thresholdAssetPct = typeof prefs.thresholdAssetPct === 'number' ? prefs.thresholdAssetPct : current.thresholdAssetPct;
  const thresholdPortfolioPct = typeof prefs.thresholdPortfolioPct === 'number' ? prefs.thresholdPortfolioPct : current.thresholdPortfolioPct;

  if (current.updatedAt === null) {
    db.prepare(`
      INSERT INTO email_prefs(user_id, trades_enabled, news_enabled, threshold_asset_pct, threshold_portfolio_pct, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, tradesEnabled, newsEnabled, thresholdAssetPct, thresholdPortfolioPct, updatedAt);
  } else {
    db.prepare(`
      UPDATE email_prefs
      SET trades_enabled = ?, news_enabled = ?, threshold_asset_pct = ?, threshold_portfolio_pct = ?, updated_at = ?
      WHERE user_id = ?
    `).run(tradesEnabled, newsEnabled, thresholdAssetPct, thresholdPortfolioPct, updatedAt, userId);
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
export function enqueueEmail(db, {userId, template, toEmail, subject, bodyText, bodyHtml, meta = {}, scheduledAt, now = Date.now} = {}) {
  const id = randomUUID();
  const createdAt = new Date(now()).toISOString();
  const scheduled = scheduledAt || createdAt;
  
  db.prepare(`
    INSERT INTO email_outbox(id, user_id, template, to_email, subject, body_text, body_html, meta, status, attempts, created_at, scheduled_at, sent_at, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, NULL, NULL)
  `).run(id, userId, template, toEmail, subject, bodyText, bodyHtml || null, JSON.stringify(meta), createdAt, scheduled);
  
  return {id, userId, template, toEmail, subject, status: 'pending', createdAt, scheduledAt: scheduled};
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
  const day = new Date(now()).toISOString().slice(0, 10);

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

      const dailyCount = getDailyEmailCount(db, email.userId, day);
      if (dailyCount >= EMAIL_DAILY_LIMIT) {
        markEmailFailed(db, email.id, `Daily limit reached (${EMAIL_DAILY_LIMIT})`, {now});
        skipped++;
        continue;
      }

      const unsubscribeUrl = `https://laviste.diegodella.ar/app#/cuenta/email`;
      const headers = {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };

      await sendViaResend({
        to: email.toEmail,
        subject: email.subject,
        text: email.bodyText,
        html: email.bodyHtml,
        headers,
      }, {apiKey, fetcher});

      markEmailSent(db, email.id, {now});
      incrementDailyEmailCount(db, email.userId, day);
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
  const nowFn = typeof now === 'function' ? now : () => now;
  const updatedAt = new Date(nowFn()).toISOString();
  
  db.prepare(`
    INSERT INTO email_prefs(user_id, trades_enabled, news_enabled, threshold_asset_pct, threshold_portfolio_pct, updated_at)
    VALUES (?, ?, 0, 5.0, 3.0, ?)
  `).run(userId, tradesEnabled, updatedAt);
  
  return getEmailPrefs(db, userId);
}
