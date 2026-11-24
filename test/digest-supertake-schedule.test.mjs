/**
 * «Cierre del día»: envío todos los días hábiles (aprobado), camino normal del outbox
 * (template daily_digest + dedupe), `now` siempre Date (#76) y cambios de estado entre días.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates, value} from '../lib/engine.mjs';
import {updateEmailPrefs} from '../lib/email.mjs';
import {createDailyMarksJob} from '../lib/daily-marks.mjs';
import {
  DIGEST_STYLE_DEFAULT,
  DIGEST_STYLE_CLASSIC,
  DIGEST_STYLE_SUPERTAKE,
  isMarketBusinessDay,
  supertakeScheduledAt,
  buildSupertakeDigestData,
  scheduleSupertakeDigest,
} from '../lib/digest-supertake.mjs';

// Lunes 16/11/2026 17:30 ART, martes 17/11 17:30 ART, sábado 21/11 17:30 ART.
const MON = Date.parse('2026-11-16T20:30:00.000Z');
const TUE = Date.parse('2026-11-17T20:30:00.000Z');
const SAT = Date.parse('2026-11-21T20:30:00.000Z');
const FRI_PRIOR = '2026-11-13';

test('business days: Monday–Friday in ART, never weekends or market holidays', () => {
  assert.equal(isMarketBusinessDay(new Date(MON)), true);
  assert.equal(isMarketBusinessDay(MON), true, 'numeric clock accepted');
  assert.equal(isMarketBusinessDay(() => MON), true, 'Date.now-style function accepted');
  assert.equal(isMarketBusinessDay(new Date(SAT)), false);
  assert.equal(isMarketBusinessDay(new Date('2026-11-22T15:00:00.000Z')), false);
  assert.equal(isMarketBusinessDay(new Date('2026-11-21T02:00:00.000Z')), true, 'Friday 23:00 ART is still Friday');
  assert.equal(isMarketBusinessDay(new Date('2026-11-23T20:30:00.000Z'), {holidays: ['2026-11-23']}), false);
});

test('scheduled at 18:00 ART of the same day, or now if already past', () => {
  assert.equal(supertakeScheduledAt(MON), '2026-11-16T21:00:00.000Z');
  assert.equal(supertakeScheduledAt(Date.parse('2026-11-16T22:15:00.000Z')), '2026-11-16T22:15:00.000Z');
});

test('the default digest style stays classic in this PR (switch pending Diego OK)', () => {
  assert.equal(DIGEST_STYLE_DEFAULT, DIGEST_STYLE_CLASSIC);
});

function world({dayChangePct = 0.001, priceFactor = 1.001} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'digest-supertake-'));
  const store = createStore(dir, {ownerEmail: 'test@example.com', ownerPassword: 'test-password-only'});
  const userId = store.ownerUserId();
  store.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
  updateEmailPrefs(store.db, userId, {newsEnabled: false});
  const scoped = store.forUser(userId);
  const take = createTake(templates[0]);
  activate(take, 1_000_000);
  take.realPricesAt = '2026-11-16T20:00:00.000Z';
  take.scenario = 'normal';
  const base = value(take);
  for (const h of take.holdings) h.price *= priceFactor;
  scoped.putTake(take);
  store.db.prepare(`
    INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(take.id, userId, FRI_PRIOR, base, take.invested);
  const quotes = makeQuotes(take, '2026-11-16T20:00:00.000Z', dayChangePct);
  return {dir, store, userId, scoped, take, quotes};
}

function makeQuotes(take, asOf, dayChangePct) {
  const map = {};
  for (const h of take.holdings) {
    map[h.ticker] = {ticker: h.ticker, price: h.price, asOf, changeAsOf: asOf, dayChangePct, stale: false, available: true};
  }
  return {getCached: t => map[t] || null, getBenchmarkCached: () => null, isDemo: () => false};
}

function outbox(store, userId) {
  return store.db.prepare(`SELECT * FROM email_outbox WHERE template = 'daily_digest' AND user_id = ? ORDER BY scheduled_at`).all(userId);
}

test('now stays a Date: numeric Date.now-style clock builds the payload without throwing', () => {
  const {dir, store, userId, scoped, quotes} = world();
  try {
    const takes = scoped.takeIds().map(id => scoped.take(id));
    store.db.prepare(`INSERT INTO take_daily_marks (take_id, user_id, day, value, invested, eligible) VALUES (?, ?, '2026-11-16', ?, ?, 1)`)
      .run(takes[0].id, userId, value(takes[0]), takes[0].invested);
    for (const now of [MON, () => MON, new Date(MON), '2026-11-16T20:30:00.000Z']) {
      const data = buildSupertakeDigestData({db: store.db, userId, takes, quotes, now});
      assert.ok(data.now instanceof Date, 'payload.now is a Date');
      assert.equal(data.date, '2026-11-16');
      assert.ok(Number.isFinite(data.portfolio.dayPct));
      assert.equal(data.theses.length, 1);
    }
    store.close();
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('daily marks job (supertake) schedules exactly one digest on a business day, even on a quiet day', () => {
  const {dir, store, userId, quotes} = world({dayChangePct: 0.001, priceFactor: 1.001});
  const errors = [];
  try {
    const job = createDailyMarksJob({
      store, quotes, now: () => MON, env: {FEATURE_EMAIL: '1'},
      digestStyle: DIGEST_STYLE_SUPERTAKE, logger: {error: l => errors.push(String(l))},
    });
    job.write({force: true});
    assert.deepEqual(errors.filter(l => l.includes('daily_digest_failed')), []);
    const rows = outbox(store, userId);
    assert.equal(rows.length, 1, 'quiet day still sends (no threshold gate)');
    const [row] = rows;
    assert.equal(row.status, 'pending');
    assert.equal(row.scheduled_at, '2026-11-16T21:00:00.000Z');
    assert.equal(row.dedupe_key, `digest:${userId}:2026-11-16`);
    assert.match(row.subject, /^Cierre del día: resumen de tu cartera [▲▼=]\u00A0/);
    assert.match(row.subject, /sin cambios de estado$/);
    assert.ok(row.body_text.includes('Sin cambios de estado hoy'));
    assert.ok(!/\$|USD|ARS/.test(row.body_text + row.body_html));
    const meta = JSON.parse(row.meta);
    assert.equal(meta.style, 'supertake');
    assert.ok(Object.values(meta.statuses).every(s => ['ok', 'watch', 'risk'].includes(s)));

    // Second run the same day respects the dedupe: still one row, nothing else pending.
    job.write({force: true});
    assert.equal(outbox(store, userId).length, 1);
    store.close();
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('no digest on weekends or market holidays', () => {
  const {dir, store, userId, quotes} = world();
  const errors = [];
  try {
    const job = createDailyMarksJob({
      store, quotes, now: () => SAT, env: {FEATURE_EMAIL: '1'},
      digestStyle: DIGEST_STYLE_SUPERTAKE, logger: {error: l => errors.push(String(l))},
    });
    job.write({force: true});
    assert.equal(outbox(store, userId).length, 0);
    assert.ok(errors.some(l => l.includes('not_business_day')));

    store.setSetting('autoTrading', {enabled: false, allowUserIds: [], marketHolidays: ['2026-11-16']});
    const holidayJob = createDailyMarksJob({
      store, quotes, now: () => MON, env: {FEATURE_EMAIL: '1'}, digestStyle: DIGEST_STYLE_SUPERTAKE, logger: {error: () => {}},
    });
    holidayJob.write({force: true});
    assert.equal(outbox(store, userId).length, 0);
    store.close();
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('no digest without the portfolio day % (hero cannot be empty) or when digest is off', () => {
  const {dir, store, userId} = world();
  try {
    const noDay = {date: '2026-11-16', isTradingDay: true, portfolio: {dayPct: null}, theses: [{id: 'x', name: 'X', dayPct: 0, status: 'ok', statusPrev: 'ok'}]};
    assert.equal(scheduleSupertakeDigest(store.db, {userId, data: noDay, now: MON}).reason, 'no_portfolio_day');
    updateEmailPrefs(store.db, userId, {digestFreq: 'off'});
    const ok = {...noDay, portfolio: {dayPct: 0.01}};
    assert.equal(scheduleSupertakeDigest(store.db, {userId, data: ok, now: MON}).reason, 'digest_off');
    assert.equal(outbox(store, userId).length, 0);
    store.close();
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('status change across days: En camino on Monday → En riesgo on Tuesday (−3 % thesis and −5 % asset)', () => {
  const {dir, store, userId, scoped, take, quotes} = world({dayChangePct: 0.001, priceFactor: 1.001});
  try {
    const mon = createDailyMarksJob({store, quotes, now: () => MON, env: {FEATURE_EMAIL: '1'}, digestStyle: DIGEST_STYLE_SUPERTAKE, logger: {error: () => {}}});
    mon.write({force: true});
    const [monRow] = outbox(store, userId);
    assert.equal(JSON.parse(monRow.meta).statuses[take.id], 'ok');
    store.db.prepare(`UPDATE email_outbox SET status = 'sent' WHERE id = ?`).run(monRow.id);

    const live = scoped.take(take.id);
    for (const h of live.holdings) h.price *= 0.94;
    scoped.putTake(live);
    const tueQuotes = makeQuotes(live, '2026-11-17T20:00:00.000Z', -0.06);
    const tue = createDailyMarksJob({store, quotes: tueQuotes, now: () => TUE, env: {FEATURE_EMAIL: '1'}, digestStyle: DIGEST_STYLE_SUPERTAKE, logger: {error: () => {}}});
    tue.write({force: true});
    const rows = outbox(store, userId);
    assert.equal(rows.length, 2);
    const tueRow = rows[1];
    assert.equal(JSON.parse(tueRow.meta).statuses[take.id], 'risk');
    assert.match(tueRow.subject, /· 1 tesis cambió de estado$/);
    assert.ok(tueRow.body_text.includes('Pasó de En camino a En riesgo'));
    assert.ok(tueRow.body_text.includes('romper la tesis'));
    assert.ok(tueRow.body_text.includes(`Ver qué cambió: https://laviste.diegodella.ar/app#/tesis/${take.id}`));
    assert.equal(rows.filter(r => r.status === 'pending').length, 1);
    store.close();
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('without a stored previous status no change is reported (never invented)', () => {
  const {dir, store, userId, scoped, take} = world();
  try {
    const live = scoped.take(take.id);
    for (const h of live.holdings) h.price *= 0.94;
    scoped.putTake(live);
    const quotes = makeQuotes(live, '2026-11-16T20:00:00.000Z', -0.06);
    const job = createDailyMarksJob({store, quotes, now: () => MON, env: {FEATURE_EMAIL: '1'}, digestStyle: DIGEST_STYLE_SUPERTAKE, logger: {error: () => {}}});
    job.write({force: true});
    const [row] = outbox(store, userId);
    assert.match(row.subject, /sin cambios de estado$/);
    assert.ok(row.body_text.includes('[En riesgo]'));
    store.close();
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
