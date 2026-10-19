/** User-scoped and admin store views. Handlers should use forUser; services use admin. */

import {randomUUID} from 'node:crypto';
import {isUuid, normalizeEmail, ownerUserId as readOwnerUserId} from './migrations/multiuser.mjs';
import {
  MODEL_PRICES_KEY, defaultModelPrices, normalizeModelPrices, dayInBuenosAires,
  recordUserUsage as writeUserUsage, listUserUsage as readUserUsage,
} from './usage.mjs';
import {
  isQuotaKind, mergeLimits, normalizeLimitPatch, isExemptRole, quotaSnapshot,
  countMonitoredTakes, defaultsPayload,
} from './quota.mjs';
import {
  adminBudgetPayload, defaultAiControl, deriveBudgetState, estimateCallCostMicro,
  monthRange, monthInBuenosAires, normalizeAiControl, pauseError, pricesAreLoaded,
  publicAiState,
} from './budget.mjs';

const dayUTC = () => new Date().toISOString().slice(0, 10);

export const USER_SCOPED_METHODS = Object.freeze([
  'putTake', 'putChat', 'takes', 'chats', 'take', 'chat',
  'versions', 'version', 'reviews', 'putReview',
  'jobs', 'job', 'putJob',
  'idempotent', 'remember',
  'opsForTake', 'opsByBatch', 'op', 'insertOp',
  'ordersForTake', 'pendingOrders', 'pendingOrderForTake', 'order', 'orderByIdempotency', 'insertOrder', 'updateOrder',
  'setting', 'setSetting', 'deleteSetting',
]);

export function storeNotFound(message = 'No encontramos ese recurso.') {
  return Object.assign(new Error(message), {status: 404});
}

export function adminOf(store) {
  return store.admin || store;
}

export function userIsActive(store, userId) {
  if (!userId || !store.db) return false;
  return store.db.prepare('SELECT status FROM users WHERE id=?').get(userId)?.status === 'active';
}

/** User-scoped view for a take's owner, or null if that user is not active. */
export function scopeForTake(store, takeId) {
  if (typeof store.forUser !== 'function') return adminOf(store);
  const userId = (store.userIdForTake || store.admin?.userIdForTake)?.(takeId);
  if (!userId) return adminOf(store);
  if (!userIsActive(store, userId)) return null;
  return store.forUser(userId);
}

export function parseJsonRow(row) {
  return row ? JSON.parse(row.data) : null;
}

export function parseOrder(row, publicIdempotencyKey = null) {
  if (!row) return null;
  return {
    id: row.id,
    takeId: row.take_id,
    kind: row.kind,
    status: row.status,
    takeVersion: row.take_version,
    payload: JSON.parse(row.payload),
    preview: JSON.parse(row.preview),
    fingerprint: row.fingerprint,
    idempotencyKey: publicIdempotencyKey !== null ? publicIdempotencyKey : row.idempotency_key,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    cancelledAt: row.cancelled_at,
  };
}

export function assertExistingUser(db, userId) {
  if (!isUuid(userId)) throw storeNotFound('Usuario inexistente.');
  const row = db.prepare('SELECT id FROM users WHERE id=?').get(userId);
  if (!row) throw storeNotFound('Usuario inexistente.');
  return row.id;
}

export function insertUser(db, {id, email, displayName, role = 'user', status = 'active', passwordHash = ''} = {}) {
  const userId = id || randomUUID();
  if (!isUuid(userId)) throw new Error('createUser: invalid id');
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) throw new Error('createUser: email required');
  const name = displayName || normalized.split('@')[0];
  db.prepare(`INSERT INTO users(id,email,display_name,role,status,password_hash,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(userId, normalized, name, role, status, passwordHash, new Date().toISOString());
  return userId;
}

function remapProposalKey(key, userId) {
  if (!key.startsWith('proposal:')) return key;
  if (key.startsWith(`proposal:${userId}:`)) return key;
  return `proposal:${userId}:${key.slice('proposal:'.length)}`;
}

function publicOrderKey(stored, userId) {
  if (!stored || !userId) return stored;
  const prefix = `${userId}:`;
  return stored.startsWith(prefix) ? stored.slice(prefix.length) : stored;
}

function createTransaction(db) {
  return function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
}

function createBlobApi(db, {userId, ownerId}) {
  const unscoped = !userId;

  function put(table, value) {
    const uid = unscoped ? ownerId() : userId;
    const payload = JSON.stringify(value);
    if (unscoped) {
      db.prepare(`INSERT INTO ${table}(id,data,user_id) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`)
        .run(value.id, payload, uid);
      return;
    }
    const result = db.prepare(
      `INSERT INTO ${table}(id,data,user_id) VALUES (?,?,?)
       ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE ${table}.user_id=?`,
    ).run(value.id, payload, uid, uid);
    if (result.changes === 0) throw storeNotFound();
  }

  function one(table, id) {
    if (unscoped) return parseJsonRow(db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id));
    return parseJsonRow(db.prepare(`SELECT data FROM ${table} WHERE id=? AND user_id=?`).get(id, userId));
  }

  function all(table) {
    if (unscoped) return db.prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`).all().map(parseJsonRow);
    return db.prepare(`SELECT data FROM ${table} WHERE user_id=? ORDER BY rowid DESC`).all(userId).map(parseJsonRow);
  }

  return {put, one, all};
}

function createSettingsApi(db, {userId, ownerId}) {
  const unscoped = !userId;

  function readRaw(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row ? JSON.parse(row.value) : null;
  }

  function setting(key) {
    if (unscoped) return readRaw(key);
    const mapped = remapProposalKey(key, userId);
    const value = readRaw(mapped);
    if (value !== null) return value;
    if (userId === ownerId() && mapped !== key) return readRaw(key);
    return null;
  }

  function setSetting(key, value) {
    const mapped = unscoped ? key : remapProposalKey(key, userId);
    db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(mapped, JSON.stringify(value));
  }

  function deleteSetting(key) {
    const mapped = unscoped ? key : remapProposalKey(key, userId);
    db.prepare('DELETE FROM settings WHERE key=?').run(mapped);
  }

  return {setting, setSetting, deleteSetting};
}

function createIdempotencyApi(db, {userId, ownerId}) {
  const unscoped = !userId;

  function scopedKey(key) {
    return unscoped ? key : `${userId}:${key}`;
  }

  function read(key) {
    const row = db.prepare('SELECT * FROM idempotency WHERE key=?').get(key);
    return row && {...row, data: JSON.parse(row.data)};
  }

  function idempotent(key) {
    const found = read(scopedKey(key));
    if (found) return found;
    if (!unscoped && userId === ownerId()) return read(key);
    return null;
  }

  function remember(key, fingerprint, data) {
    db.prepare('INSERT INTO idempotency VALUES (?,?,?)').run(scopedKey(key), fingerprint, JSON.stringify(data));
  }

  return {idempotent, remember};
}

function createChildApi(db, {userId, ownerId, parseOp}) {
  const unscoped = !userId;

  function userIdForTake(takeId) {
    return db.prepare('SELECT user_id FROM takes WHERE id=?').get(takeId)?.user_id || (unscoped ? ownerId() : null);
  }

  function stamp(takeId) {
    return unscoped ? userIdForTake(takeId) : userId;
  }

  function ownsTake(takeId) {
    if (unscoped) return true;
    return !!db.prepare('SELECT 1 FROM takes WHERE id=? AND user_id=?').get(takeId, userId);
  }

  function requireTake(takeId) {
    if (!ownsTake(takeId)) throw storeNotFound('No encontramos esa tesis.');
  }

  function versions(id) {
    if (unscoped) {
      return db.prepare('SELECT data FROM versions WHERE take_id=? ORDER BY version DESC').all(id).map(parseJsonRow);
    }
    return db.prepare('SELECT data FROM versions WHERE take_id=? AND user_id=? ORDER BY version DESC')
      .all(id, userId).map(parseJsonRow);
  }

  function version(take) {
    if (!unscoped) requireTake(take.id);
    const snapshot = {
      id: randomUUID(), takeId: take.id, version: take.version || 1, at: new Date().toISOString(),
      thesis: take.thesis, invalidation: take.invalidation, horizon: take.horizon, settings: take.settings,
      holdings: (take.holdings || []).map(h => ({ticker: h.ticker, weight: h.weight, units: h.units})),
      cash: take.cash, invested: take.invested,
    };
    db.prepare('INSERT OR IGNORE INTO versions(id,take_id,version,data,user_id) VALUES (?,?,?,?,?)')
      .run(snapshot.id, take.id, snapshot.version, JSON.stringify(snapshot), stamp(take.id));
  }

  function reviews(id, allReviews) {
    if (!id) return allReviews();
    if (unscoped) {
      return db.prepare('SELECT data FROM reviews WHERE take_id=? ORDER BY rowid DESC LIMIT 100').all(id).map(parseJsonRow);
    }
    return db.prepare('SELECT data FROM reviews WHERE take_id=? AND user_id=? ORDER BY rowid DESC LIMIT 100')
      .all(id, userId).map(parseJsonRow);
  }

  function putReview(review) {
    if (!unscoped) requireTake(review.takeId);
    db.prepare('INSERT OR IGNORE INTO reviews(id,take_id,data,user_id) VALUES (?,?,?,?)')
      .run(review.id, review.takeId, JSON.stringify(review), stamp(review.takeId));
  }

  function putJob(job) {
    if (!unscoped) requireTake(job.takeId);
    if (unscoped) {
      db.prepare('INSERT INTO jobs(id,take_id,status,data,user_id) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data')
        .run(job.id, job.takeId, job.status, JSON.stringify(job), stamp(job.takeId));
      return;
    }
    const result = db.prepare(
      `INSERT INTO jobs(id,take_id,status,data,user_id) VALUES (?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data WHERE jobs.user_id=?`,
    ).run(job.id, job.takeId, job.status, JSON.stringify(job), userId, userId);
    if (result.changes === 0) throw storeNotFound('No encontramos ese trabajo.');
  }

  function jobRow(id, one) {
    return one('jobs', id);
  }

  function opsForTake(takeId) {
    if (unscoped) {
      return db.prepare('SELECT rowid, * FROM ops WHERE take_id=? ORDER BY rowid ASC').all(takeId).map(parseOp);
    }
    return db.prepare('SELECT rowid, * FROM ops WHERE take_id=? AND user_id=? ORDER BY rowid ASC')
      .all(takeId, userId).map(parseOp);
  }

  function opsByBatch(batchId) {
    if (unscoped) {
      return db.prepare('SELECT rowid, * FROM ops WHERE batch_id=? ORDER BY rowid ASC').all(batchId).map(parseOp);
    }
    return db.prepare('SELECT rowid, * FROM ops WHERE batch_id=? AND user_id=? ORDER BY rowid ASC')
      .all(batchId, userId).map(parseOp);
  }

  function op(id) {
    if (unscoped) return parseOp(db.prepare('SELECT rowid, * FROM ops WHERE id=?').get(id));
    return parseOp(db.prepare('SELECT rowid, * FROM ops WHERE id=? AND user_id=?').get(id, userId));
  }

  function insertOp(opValue) {
    if (!unscoped) requireTake(opValue.takeId);
    db.prepare(`INSERT INTO ops(
      id,take_id,kind,at,ticker,units,amount,currency,price,quote_as_of,quote_provider,quote_class,quote_eligible,quote_stale,parent_id,batch_id,idempotency_key,fingerprint,note,meta,created_at,user_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      opValue.id, opValue.takeId, opValue.kind, opValue.at, opValue.ticker, opValue.units, opValue.amount, opValue.currency || 'ARS', opValue.price,
      opValue.quoteAsOf, opValue.quoteProvider, opValue.quoteClass, opValue.quoteEligible, opValue.quoteStale,
      opValue.parentId, opValue.batchId, opValue.idempotencyKey, opValue.fingerprint, opValue.note || '', JSON.stringify(opValue.meta || {}),
      opValue.createdAt || opValue.at, stamp(opValue.takeId),
    );
  }

  function orderKey(key) {
    return !key ? null : (unscoped ? key : `${userId}:${key}`);
  }

  function asOrder(row, requestedKey = null) {
    if (!row) return null;
    const shown = unscoped ? row.idempotency_key : (requestedKey ?? publicOrderKey(row.idempotency_key, userId));
    return parseOrder(row, shown);
  }

  function ordersForTake(takeId) {
    if (unscoped) {
      return db.prepare('SELECT * FROM orders WHERE take_id=? ORDER BY created_at DESC').all(takeId).map(row => asOrder(row));
    }
    return db.prepare('SELECT * FROM orders WHERE take_id=? AND user_id=? ORDER BY created_at DESC')
      .all(takeId, userId).map(row => asOrder(row));
  }

  function pendingOrders() {
    if (unscoped) {
      return db.prepare("SELECT * FROM orders WHERE status='pending' ORDER BY created_at DESC").all().map(row => asOrder(row));
    }
    return db.prepare("SELECT * FROM orders WHERE status='pending' AND user_id=? ORDER BY created_at DESC")
      .all(userId).map(row => asOrder(row));
  }

  function pendingOrderForTake(takeId) {
    if (unscoped) {
      return asOrder(db.prepare("SELECT * FROM orders WHERE take_id=? AND status='pending'").get(takeId));
    }
    return asOrder(db.prepare("SELECT * FROM orders WHERE take_id=? AND status='pending' AND user_id=?").get(takeId, userId));
  }

  function order(id) {
    if (unscoped) return asOrder(db.prepare('SELECT * FROM orders WHERE id=?').get(id));
    return asOrder(db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(id, userId));
  }

  function orderByIdempotency(key) {
    const mapped = orderKey(key);
    const found = unscoped
      ? db.prepare('SELECT * FROM orders WHERE idempotency_key=?').get(mapped)
      : db.prepare('SELECT * FROM orders WHERE idempotency_key=? AND user_id=?').get(mapped, userId);
    if (found) return asOrder(found, key);
    if (!unscoped && userId === ownerId()) {
      return asOrder(db.prepare('SELECT * FROM orders WHERE idempotency_key=? AND user_id=?').get(key, userId), key);
    }
    return null;
  }

  function insertOrder(orderValue) {
    if (!unscoped) requireTake(orderValue.takeId);
    db.prepare(`INSERT INTO orders(
      id,take_id,kind,status,take_version,payload,preview,fingerprint,idempotency_key,created_at,confirmed_at,cancelled_at,user_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      orderValue.id, orderValue.takeId, orderValue.kind, orderValue.status, orderValue.takeVersion,
      JSON.stringify(orderValue.payload), JSON.stringify(orderValue.preview), orderValue.fingerprint,
      orderKey(orderValue.idempotencyKey), orderValue.createdAt, orderValue.confirmedAt || null, orderValue.cancelledAt || null,
      stamp(orderValue.takeId),
    );
  }

  function updateOrder(orderValue) {
    if (unscoped) {
      db.prepare('UPDATE orders SET status=?, confirmed_at=?, cancelled_at=? WHERE id=?')
        .run(orderValue.status, orderValue.confirmedAt || null, orderValue.cancelledAt || null, orderValue.id);
      return;
    }
    const result = db.prepare('UPDATE orders SET status=?, confirmed_at=?, cancelled_at=? WHERE id=? AND user_id=?')
      .run(orderValue.status, orderValue.confirmedAt || null, orderValue.cancelledAt || null, orderValue.id, userId);
    if (result.changes === 0) throw storeNotFound('No encontramos esa orden.');
  }

  return {
    userIdForTake, versions, version, reviews, putReview, putJob, jobRow,
    opsForTake, opsByBatch, op, insertOp,
    ordersForTake, pendingOrders, pendingOrderForTake, order, orderByIdempotency, insertOrder, updateOrder,
  };
}

function createConsumptionApi(db) {
  function reserve(kind, limit, count = 1) {
    const day = dayUTC();
    db.prepare('INSERT OR IGNORE INTO consumption(day,kind) VALUES (?,?)').run(day, kind);
    return db.prepare('UPDATE consumption SET calls=calls+? WHERE day=? AND kind=? AND calls+?<=?')
      .run(count, day, kind, count, limit).changes === 1;
  }
  function bumpConsumption(kind, count = 1) {
    const day = dayUTC();
    const n = Number.isInteger(count) && count > 0 ? count : 0;
    if (!n) return;
    db.prepare('INSERT OR IGNORE INTO consumption(day,kind) VALUES (?,?)').run(day, kind);
    db.prepare('UPDATE consumption SET calls=calls+? WHERE day=? AND kind=?').run(n, day, kind);
  }
  function tokens(kind, usage, searches = 0, day = dayUTC()) {
    db.prepare('INSERT OR IGNORE INTO consumption(day,kind) VALUES (?,?)').run(day, kind);
    db.prepare('UPDATE consumption SET input_tokens=input_tokens+?,output_tokens=output_tokens+?,searches=searches+? WHERE day=? AND kind=?')
      .run(usage?.input_tokens || 0, usage?.output_tokens || 0, searches, day, kind);
  }
  const usage = () => db.prepare('SELECT * FROM consumption WHERE day=?').all(dayUTC());
  return {reserve, bumpConsumption, tokens, usage};
}

function readLimitRow(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    chatPerDay: row.chat_per_day,
    newsPerDay: row.news_per_day,
    tokensPerDay: row.tokens_per_day,
    monitoredTakes: row.monitored_takes,
    rpm: row.rpm,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function createQuotaApi(db, {userId}) {
  function ensureQuotaRow(uid, kind, day) {
    if (!isQuotaKind(kind)) throw Object.assign(new Error('Tipo de cuota inválido.'), {status: 400});
    db.prepare('INSERT OR IGNORE INTO user_quota(user_id, day, kind, units) VALUES (?,?,?,0)')
      .run(uid, day, kind);
  }
  function reserveUser(uid, kind, n, limit, {now} = {}) {
    const id = uid || userId;
    if (!id) return false;
    const count = Number.isInteger(n) && n > 0 ? n : 0;
    if (!count) return false;
    const cap = Number(limit);
    if (!Number.isFinite(cap) || cap < 0) return false;
    const day = dayInBuenosAires(now);
    ensureQuotaRow(id, kind, day);
    return db.prepare(
      'UPDATE user_quota SET units=units+? WHERE user_id=? AND day=? AND kind=? AND units+?<=?',
    ).run(count, id, day, kind, count, cap).changes === 1;
  }
  function releaseUser(uid, kind, n, {now} = {}) {
    const id = uid || userId;
    if (!id) return;
    const count = Number.isInteger(n) && n > 0 ? n : 0;
    if (!count) return;
    const day = dayInBuenosAires(now);
    ensureQuotaRow(id, kind, day);
    db.prepare('UPDATE user_quota SET units=MAX(0, units-?) WHERE user_id=? AND day=? AND kind=?')
      .run(count, id, day, kind);
  }
  function reconcileUser(uid, kind, reserved, actual, {now} = {}) {
    const id = uid || userId;
    if (!id) return;
    const from = Number.isFinite(Number(reserved)) ? Math.max(0, Math.round(Number(reserved))) : 0;
    const to = Number.isFinite(Number(actual)) ? Math.max(0, Math.round(Number(actual))) : 0;
    const day = dayInBuenosAires(now);
    ensureQuotaRow(id, kind, day);
    db.prepare('UPDATE user_quota SET units=MAX(0, units-?+?) WHERE user_id=? AND day=? AND kind=?')
      .run(from, to, id, day, kind);
  }
  function quotaUsed(uid, {now} = {}) {
    const id = uid || userId;
    const day = dayInBuenosAires(now);
    const rows = id
      ? db.prepare('SELECT kind, units FROM user_quota WHERE user_id=? AND day=?').all(id, day)
      : [];
    const used = {chat: 0, news: 0, tokens: 0};
    for (const row of rows) used[row.kind] = row.units;
    return {day, ...used};
  }
  function userLimits(uid) {
    const id = uid || userId;
    if (!id) return null;
    return readLimitRow(db.prepare('SELECT * FROM user_limits WHERE user_id=?').get(id));
  }
  function userRoleOf(uid) {
    const id = uid || userId;
    if (!id) return null;
    return db.prepare('SELECT role FROM users WHERE id=?').get(id)?.role || null;
  }
  function effectiveLimits(uid, role) {
    const id = uid || userId;
    const resolvedRole = role || userRoleOf(id);
    const merged = mergeLimits(userLimits(id));
    return {...merged, exempt: isExemptRole(resolvedRole), role: resolvedRole};
  }
  function setUserLimits(uid, patch, {updatedBy} = {}) {
    const id = assertExistingUser(db, uid);
    const current = userLimits(id) || {};
    const next = {...current, ...normalizeLimitPatch(patch)};
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO user_limits(
      user_id, chat_per_day, news_per_day, tokens_per_day, monitored_takes, rpm, updated_at, updated_by
    ) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      chat_per_day=excluded.chat_per_day,
      news_per_day=excluded.news_per_day,
      tokens_per_day=excluded.tokens_per_day,
      monitored_takes=excluded.monitored_takes,
      rpm=excluded.rpm,
      updated_at=excluded.updated_at,
      updated_by=excluded.updated_by`).run(
      id, next.chatPerDay ?? null, next.newsPerDay ?? null, next.tokensPerDay ?? null,
      next.monitoredTakes ?? null, next.rpm ?? null, now, updatedBy || null,
    );
    return {override: userLimits(id), effective: effectiveLimits(id)};
  }
  function listUsersLite() {
    return db.prepare(
      'SELECT id, email, display_name AS displayName, role, status FROM users ORDER BY email',
    ).all();
  }
  function quotaSnapshotFor(uid, role, takes, {now} = {}) {
    const id = uid || userId;
    const limits = effectiveLimits(id, role);
    return quotaSnapshot({
      exempt: limits.exempt,
      limits,
      used: quotaUsed(id, {now}),
      monitoredUsed: countMonitoredTakes(takes),
      now,
    });
  }
  function listQuotaState({now} = {}) {
    const day = dayInBuenosAires(now);
    const users = listUsersLite().map(user => {
      const override = userLimits(user.id);
      const effective = effectiveLimits(user.id, user.role);
      const used = quotaUsed(user.id, {now});
      return {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        exempt: effective.exempt,
        override: override ? {
          chatPerDay: override.chatPerDay,
          newsPerDay: override.newsPerDay,
          tokensPerDay: override.tokensPerDay,
          monitoredTakes: override.monitoredTakes,
          rpm: override.rpm,
          updatedAt: override.updatedAt,
        } : null,
        effective: {
          chatPerDay: effective.chatPerDay,
          newsPerDay: effective.newsPerDay,
          tokensPerDay: effective.tokensPerDay,
          monitoredTakes: effective.monitoredTakes,
          rpm: effective.rpm,
        },
        usedToday: {chat: used.chat, news: used.news, tokens: used.tokens},
      };
    });
    return {defaults: defaultsPayload(), day, timezone: defaultsPayload().timezone, users};
  }
  return {
    reserveUser, releaseUser, reconcileUser, quotaUsed, userLimits, effectiveLimits,
    setUserLimits, listUsersLite, quotaSnapshotFor, listQuotaState,
  };
}

function createUserUsageApi(db, {userId}) {
  function readPrices() {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(MODEL_PRICES_KEY);
    return row ? normalizeModelPrices(JSON.parse(row.value)) : defaultModelPrices();
  }
  function modelPrices() {
    return readPrices();
  }
  function setModelPrices(input) {
    const current = readPrices();
    const patch = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const incoming = patch.models && typeof patch.models === 'object' && !Array.isArray(patch.models)
      ? patch.models
      : {};
    const next = normalizeModelPrices({
      note: patch.note || current.note,
      models: {...current.models, ...incoming},
    });
    next.updatedAt = new Date().toISOString();
    db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(MODEL_PRICES_KEY, JSON.stringify(next));
    return next;
  }
  function recordUserUsage({userId: uid, kind, usage, model, calls = 1, now} = {}) {
    const id = uid || userId;
    if (!id) return null;
    return writeUserUsage(db, {userId: id, kind, usage, model, calls, prices: readPrices(), now});
  }
  function listUserUsage(filters = {}) {
    return readUserUsage(db, filters);
  }
  return {modelPrices, setModelPrices, recordUserUsage, listUserUsage, readPrices};
}

function readAiControlRow(row) {
  if (!row) return defaultAiControl();
  return {
    enabled: !!row.enabled,
    monthlyCapUsd: row.monthly_cap_usd,
    dailyCapUsd: row.daily_cap_usd,
    alertMonth: row.alert_month,
    alertMonth80: !!row.alert_month_80,
    alertDay: row.alert_day,
    alertDay80: !!row.alert_day_80,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function createBudgetApi(db, {readPrices}) {
  const budgetHolds = new Map();

  function writeAudit({actorUserId = null, action, target = 'ai_control', meta = {}, ipHash = null} = {}) {
    db.prepare(`INSERT INTO audit_log(id, at, actor_user_id, action, target, meta, ip_hash)
      VALUES (?,?,?,?,?,?,?)`).run(
      randomUUID(), new Date().toISOString(), actorUserId, action, target,
      JSON.stringify(meta || {}), ipHash,
    );
  }

  function listAuditLog({action, limit = 50} = {}) {
    const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
    const rows = action
      ? db.prepare('SELECT * FROM audit_log WHERE action=? ORDER BY at DESC LIMIT ?').all(action, cap)
      : db.prepare('SELECT * FROM audit_log ORDER BY at DESC LIMIT ?').all(cap);
    return rows.map(row => ({
      id: row.id,
      at: row.at,
      actorUserId: row.actor_user_id,
      action: row.action,
      target: row.target,
      meta: JSON.parse(row.meta || '{}'),
      ipHash: row.ip_hash,
    }));
  }

  function aiControl() {
    return readAiControlRow(db.prepare('SELECT * FROM ai_control WHERE id=1').get());
  }

  function spentBetween(start, endExclusive) {
    const row = db.prepare(
      'SELECT COALESCE(SUM(est_cost_micro),0) AS n FROM user_usage WHERE day>=? AND day<?',
    ).get(start, endExclusive);
    return row?.n || 0;
  }

  function spentFor(now) {
    const day = dayInBuenosAires(now);
    const month = monthInBuenosAires(now);
    const range = monthRange(month);
    const dayRow = db.prepare(
      'SELECT COALESCE(SUM(est_cost_micro),0) AS n FROM user_usage WHERE day=?',
    ).get(day);
    return {
      day,
      month,
      spentDayMicro: dayRow?.n || 0,
      spentMonthMicro: spentBetween(range.start, range.endExclusive),
    };
  }

  function heldMicro() {
    let n = 0;
    for (const hold of budgetHolds.values()) n += hold.micro;
    return n;
  }

  function budgetState({now, estimateMicro, kind, model, tokenUnits} = {}) {
    const control = aiControl();
    const spend = spentFor(now);
    const prices = readPrices();
    const loaded = pricesAreLoaded(prices);
    const estimate = estimateMicro != null
      ? estimateMicro
      : ((kind || tokenUnits != null) && loaded
        ? estimateCallCostMicro({kind, model, prices, tokenUnits})
        : 0);
    return deriveBudgetState({
      enabled: control.enabled,
      monthlyCapUsd: control.monthlyCapUsd,
      dailyCapUsd: control.dailyCapUsd,
      spentMonthMicro: spend.spentMonthMicro + heldMicro(),
      spentDayMicro: spend.spentDayMicro + heldMicro(),
      pricesLoaded: loaded,
      estimateMicro: estimate,
      now,
    });
  }

  function isAiPaused(opts = {}) {
    return budgetState(opts).paused;
  }

  function publicAi(role, opts = {}) {
    return publicAiState(budgetState(opts), {superadmin: role === 'superadmin'});
  }

  function persistControl(next, {updatedBy} = {}) {
    const now = new Date().toISOString();
    db.prepare(`UPDATE ai_control SET
      enabled=?, monthly_cap_usd=?, daily_cap_usd=?,
      alert_month=?, alert_month_80=?, alert_day=?, alert_day_80=?,
      updated_at=?, updated_by=?
      WHERE id=1`).run(
      next.enabled ? 1 : 0, next.monthlyCapUsd, next.dailyCapUsd,
      next.alertMonth || null, next.alertMonth80 ? 1 : 0,
      next.alertDay || null, next.alertDay80 ? 1 : 0,
      now, updatedBy || null,
    );
    return aiControl();
  }

  function setAiControl(patch, {updatedBy, ipHash} = {}) {
    const current = aiControl();
    const parsed = normalizeAiControl(patch, {partial: true});
    const next = {
      ...current,
      enabled: parsed.enabled !== undefined ? parsed.enabled : current.enabled,
      monthlyCapUsd: parsed.monthlyCapUsd !== undefined ? parsed.monthlyCapUsd : current.monthlyCapUsd,
      dailyCapUsd: parsed.dailyCapUsd !== undefined ? parsed.dailyCapUsd : current.dailyCapUsd,
    };
    persistControl(next, {updatedBy});
    if (!!current.enabled !== !!next.enabled) {
      writeAudit({
        actorUserId: updatedBy, action: 'ai.enabled', ipHash,
        meta: {enabled: next.enabled, previous: current.enabled},
      });
    }
    const capChanged = current.monthlyCapUsd !== next.monthlyCapUsd || current.dailyCapUsd !== next.dailyCapUsd;
    if (capChanged) {
      writeAudit({
        actorUserId: updatedBy, action: 'ai.caps', ipHash,
        meta: {
          monthlyCapUsd: next.monthlyCapUsd,
          dailyCapUsd: next.dailyCapUsd,
          previous: {monthlyCapUsd: current.monthlyCapUsd, dailyCapUsd: current.dailyCapUsd},
        },
      });
    }
    syncBudgetAlerts({actorUserId: updatedBy, ipHash});
    return adminBudgetPayload(budgetState());
  }

  function syncBudgetAlerts({actorUserId = null, ipHash = null} = {}) {
    const state = budgetState();
    const current = aiControl();
    const next = {...current};
    if (!state.pricesLoaded) return state;
    if (state.alert80Month && (current.alertMonth !== state.month || !current.alertMonth80)) {
      writeAudit({
        actorUserId, action: 'ai.budget.80', ipHash,
        meta: {
          period: 'month',
          month: state.month,
          spentMicro: state.spentMonthMicro,
          capUsd: state.monthlyCapUsd,
        },
      });
      next.alertMonth = state.month;
      next.alertMonth80 = true;
    } else if (!state.alert80Month && current.alertMonth === state.month && current.alertMonth80) {
      next.alertMonth80 = false;
    }
    if (state.alert80Day && (current.alertDay !== state.day || !current.alertDay80)) {
      writeAudit({
        actorUserId, action: 'ai.budget.80', ipHash,
        meta: {
          period: 'day',
          day: state.day,
          spentMicro: state.spentDayMicro,
          capUsd: state.dailyCapUsd,
        },
      });
      next.alertDay = state.day;
      next.alertDay80 = true;
    } else if (!state.alert80Day && current.alertDay === state.day && current.alertDay80) {
      next.alertDay80 = false;
    }
    if (
      next.alertMonth !== current.alertMonth || next.alertMonth80 !== current.alertMonth80
      || next.alertDay !== current.alertDay || next.alertDay80 !== current.alertDay80
    ) persistControl(next, {updatedBy: current.updatedBy});
    return state;
  }

  function beginAiGate({kind, model, now, tokenUnits} = {}) {
    const prices = readPrices();
    const loaded = pricesAreLoaded(prices);
    const estimate = loaded ? estimateCallCostMicro({kind, model, prices, tokenUnits}) : 0;
    const state = budgetState({now, estimateMicro: estimate, kind, model, tokenUnits});
    if (state.paused) throw pauseError(state);
    const id = randomUUID();
    budgetHolds.set(id, {micro: estimate, kind: kind || null, at: Date.now()});
    return {id, estimateMicro: estimate, kind, model};
  }

  function commitAiGate(handle) {
    if (handle?.id) budgetHolds.delete(handle.id);
  }

  function rollbackAiGate(handle) {
    if (handle?.id) budgetHolds.delete(handle.id);
  }

  function assertAiAllowed(opts = {}) {
    const state = budgetState(opts);
    if (state.paused) throw pauseError(state);
    return state;
  }

  return {
    aiControl, setAiControl, budgetState, isAiPaused, publicAi, assertAiAllowed,
    beginAiGate, commitAiGate, rollbackAiGate, syncBudgetAlerts,
    writeAudit, listAuditLog, adminBudgetPayload: () => adminBudgetPayload(budgetState()),
  };
}

/** `userId` null = admin/unscoped (owner-stamped writes, no read filter). */
export function createAccess(db, {userId = null, parseOp} = {}) {
  const ownerId = () => readOwnerUserId(db);
  const {put, one, all} = createBlobApi(db, {userId, ownerId});
  const settings = createSettingsApi(db, {userId, ownerId});
  const idempotency = createIdempotencyApi(db, {userId, ownerId});
  const child = createChildApi(db, {userId, ownerId, parseOp});
  const consumption = createConsumptionApi(db);
  const userUsage = createUserUsageApi(db, {userId});
  const quota = createQuotaApi(db, {userId});
  const budget = createBudgetApi(db, {readPrices: userUsage.readPrices});
  return {
    scope: userId ? 'user' : 'admin',
    userId: userId || null,
    transaction: createTransaction(db),
    ownerUserId: ownerId,
    userIdForTake: child.userIdForTake,
    putTake: value => put('takes', value),
    putChat: value => put('chats', value),
    takes: () => all('takes'),
    chats: () => all('chats'),
    take: id => one('takes', id),
    chat: id => one('chats', id),
    ...settings,
    versions: child.versions,
    version: child.version,
    reviews: id => child.reviews(id, () => all('reviews')),
    putReview: child.putReview,
    jobs: () => all('jobs'),
    job: id => child.jobRow(id, one),
    putJob: child.putJob,
    ...consumption,
    ...userUsage,
    ...quota,
    ...budget,
    ...idempotency,
    opsForTake: child.opsForTake,
    opsByBatch: child.opsByBatch,
    op: child.op,
    insertOp: child.insertOp,
    parseOrder,
    ordersForTake: child.ordersForTake,
    pendingOrders: child.pendingOrders,
    pendingOrderForTake: child.pendingOrderForTake,
    order: child.order,
    orderByIdempotency: child.orderByIdempotency,
    insertOrder: child.insertOrder,
    updateOrder: child.updateOrder,
  };
}
