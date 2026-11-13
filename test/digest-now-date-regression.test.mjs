/**
 * Regression: tryScheduleDigest must pass a Date to buildDigestEnrichedData.
 * Production createDailyMarksJob defaults to `now = Date.now` (a function that
 * returns a number). isQuoteValidForDay then calls now.getTime() and throws
 * "now.getTime is not a function", which is swallowed as daily_digest_failed
 * and the digest never leaves.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {updateEmailPrefs} from '../lib/email.mjs';
import {createDailyMarksJob} from '../lib/daily-marks.mjs';

// Wednesday 2026-10-28, 17:30 ART — numeric Date.now-style clock.
const NOW_MS = Date.parse('2026-10-28T20:30:00.000Z');
const QUOTE_AS_OF = '2026-10-28T20:00:00.000Z';
const TODAY = '2026-10-28';
const YESTERDAY = '2026-10-27';
const OWNER_EMAIL = 'test@example.com';
const OWNER_PASSWORD = 'test-password-only';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'digest-now-date-'));
}

function cleanup(dir) {
  try { rmSync(dir, {recursive: true}); } catch {}
}

function quotesApi(take, asOf) {
  const map = {};
  for (const h of take.holdings) {
    map[h.ticker] = {
      ticker: h.ticker,
      price: h.price,
      asOf,
      changeAsOf: asOf,
      dayChangePct: 0.03,
      provider: 'data912',
      stale: false,
      available: true,
    };
  }
  return {
    getCached: ticker => map[ticker] || null,
    getBenchmarkCached: () => null,
    isDemo: () => false,
  };
}

test('tryScheduleDigest with a numeric Date.now clock schedules the digest and does not throw', () => {
  const dir = tmp();
  const errors = [];
  try {
    const store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
    const userId = store.ownerUserId();
    store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    updateEmailPrefs(store.db, userId, {newsEnabled: true, thresholdPortfolioPct: 1.0});

    const scoped = store.forUser(userId);
    const take = createTake(templates[0]);
    activate(take, 1_000_000);
    take.realPricesAt = QUOTE_AS_OF;
    take.monitoringPaused = false;
    take.scenario = 'normal';
    for (const h of take.holdings) {
      h.price = h.price * 1.03;
    }
    scoped.putTake(take);

    // Shared baseline so buildDigestEnrichedData reaches isQuoteValidForDay.
    store.db.prepare(`
      INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(take.id, userId, YESTERDAY, 1_000_000, 1_000_000);

    const quotes = quotesApi(take, QUOTE_AS_OF);
    const now = () => NOW_MS;
    assert.equal(typeof now(), 'number', 'clock must be Date.now-style (numeric)');

    const job = createDailyMarksJob({
      store,
      quotes,
      now,
      env: {FEATURE_EMAIL: '1'},
      logger: {error: line => errors.push(String(line))},
    });

    let result;
    assert.doesNotThrow(() => {
      result = job.write({force: true});
    });
    assert.ok(result, 'write() should return a result');
    assert.equal(result.skipped, false);
    assert.ok(result.written > 0);
    assert.equal(result.day, TODAY);

    const failed = errors.filter(line => line.includes('daily_digest_failed'));
    assert.equal(failed.length, 0, `digest must not fail: ${failed.join(' | ')}`);

    const outbox = store.db.prepare(
      'SELECT id, template, status FROM email_outbox WHERE template = ? AND user_id = ?'
    ).all('daily_digest', userId);
    assert.equal(outbox.length, 1, 'exactly one daily digest should be scheduled');
    assert.equal(outbox[0].status, 'pending');

    store.close();
  } finally {
    cleanup(dir);
  }
});
