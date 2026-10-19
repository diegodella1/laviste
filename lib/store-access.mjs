/** User-scoped and admin store views. Handlers should use forUser; services use admin. */

import {randomUUID} from 'node:crypto';
import {isUuid, normalizeEmail, ownerUserId as readOwnerUserId} from './migrations/multiuser.mjs';

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
  function tokens(kind, usage, searches = 0, day = dayUTC()) {
    db.prepare('INSERT OR IGNORE INTO consumption(day,kind) VALUES (?,?)').run(day, kind);
    db.prepare('UPDATE consumption SET input_tokens=input_tokens+?,output_tokens=output_tokens+?,searches=searches+? WHERE day=? AND kind=?')
      .run(usage?.input_tokens || 0, usage?.output_tokens || 0, searches, day, kind);
  }
  const usage = () => db.prepare('SELECT * FROM consumption WHERE day=?').all(dayUTC());
  return {reserve, tokens, usage};
}

/** `userId` null = admin/unscoped (owner-stamped writes, no read filter). */
export function createAccess(db, {userId = null, parseOp} = {}) {
  const ownerId = () => readOwnerUserId(db);
  const {put, one, all} = createBlobApi(db, {userId, ownerId});
  const settings = createSettingsApi(db, {userId, ownerId});
  const idempotency = createIdempotencyApi(db, {userId, ownerId});
  const child = createChildApi(db, {userId, ownerId, parseOp});
  const consumption = createConsumptionApi(db);
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
