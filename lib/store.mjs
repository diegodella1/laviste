import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {seedTakes} from './engine.mjs';
import {applyMultiuserMigrations, ownerUserId as readOwnerUserId} from './migrations/multiuser.mjs';

const dayUTC = () => new Date().toISOString().slice(0, 10);

function pragmaUserVersion(db) {
  const row = db.prepare('PRAGMA user_version').get();
  if (!row) return 0;
  if (typeof row.user_version === 'number') return row.user_version;
  const first = Object.values(row)[0];
  return typeof first === 'number' ? first : 0;
}

/** Additive schema only. Never fabricates historical ops from takes/events. */
function migrateStore(db, options = {}) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const version = pragmaUserVersion(db);
    if (version < 6) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ops(
          id TEXT PRIMARY KEY,
          take_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          at TEXT NOT NULL,
          ticker TEXT,
          units INTEGER,
          amount REAL NOT NULL,
          currency TEXT NOT NULL DEFAULT 'ARS',
          price REAL,
          quote_as_of TEXT,
          quote_provider TEXT,
          quote_class TEXT NOT NULL,
          quote_eligible INTEGER NOT NULL,
          quote_stale INTEGER NOT NULL DEFAULT 0,
          parent_id TEXT,
          batch_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL UNIQUE,
          fingerprint TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          meta TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ops_take_at ON ops(take_id, at, id);
        CREATE INDEX IF NOT EXISTS ops_batch ON ops(batch_id);
      `);
      db.exec('PRAGMA user_version=6');
    }
    if (version < 7) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS orders(
          id TEXT PRIMARY KEY,
          take_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          status TEXT NOT NULL,
          take_version INTEGER NOT NULL,
          payload TEXT NOT NULL,
          preview TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          idempotency_key TEXT UNIQUE,
          created_at TEXT NOT NULL,
          confirmed_at TEXT,
          cancelled_at TEXT
        );
        CREATE INDEX IF NOT EXISTS orders_take ON orders(take_id, created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS one_pending_order ON orders(take_id) WHERE status='pending';
      `);
      db.exec('PRAGMA user_version=7');
    }
    if (version < 8) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS news_feeds(
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          url TEXT NOT NULL UNIQUE,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_ok_at TEXT,
          last_error TEXT,
          last_probe_at TEXT,
          etag TEXT,
          last_modified TEXT
        );
        CREATE INDEX IF NOT EXISTS news_feeds_updated ON news_feeds(updated_at DESC);
      `);
      db.exec('PRAGMA user_version=8');
    }
    applyMultiuserMigrations(db, {version, ...options});
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function parseOp(row) {
  if (!row) return null;
  return {
    id: row.id,
    takeId: row.take_id,
    kind: row.kind,
    at: row.at,
    ticker: row.ticker,
    units: row.units,
    amount: row.amount,
    currency: row.currency,
    price: row.price,
    quoteAsOf: row.quote_as_of,
    quoteProvider: row.quote_provider,
    quoteClass: row.quote_class,
    quoteEligible: !!row.quote_eligible,
    quoteStale: !!row.quote_stale,
    parentId: row.parent_id,
    batchId: row.batch_id,
    idempotencyKey: row.idempotency_key,
    fingerprint: row.fingerprint,
    note: row.note,
    meta: row.meta ? JSON.parse(row.meta) : {},
    createdAt: row.created_at,
    rowid: row.rowid,
  };
}

export function createStore(dir, {seed = false, ownerEmail, ownerPassword} = {}) {
  mkdirSync(dir, {recursive: true});
  const db = new DatabaseSync(join(dir, 'tesis.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS takes(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS usage(day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY, take_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(take_id, version));
    CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, take_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, take_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending_review ON jobs(take_id) WHERE status IN ('queued','running');
    CREATE TABLE IF NOT EXISTS consumption(day TEXT NOT NULL, kind TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, searches INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, kind));
    CREATE TABLE IF NOT EXISTS idempotency(key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS quote_cache(ticker TEXT PRIMARY KEY, price REAL NOT NULL, as_of TEXT NOT NULL, provider TEXT NOT NULL, stale INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS benchmark_cache(id TEXT PRIMARY KEY, price REAL NOT NULL, as_of TEXT NOT NULL, stale INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS agent_prompt_versions(
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL UNIQUE,
      body TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      who TEXT NOT NULL DEFAULT 'admin',
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      char_count INTEGER NOT NULL
    );
    `);
  try {
    migrateStore(db, {ownerEmail, ownerPassword});
  } catch (error) {
    db.close();
    throw error;
  }
  const parse = row => row ? JSON.parse(row.data) : null;
  const ownerId = () => readOwnerUserId(db);
  const userIdForTake = takeId => db.prepare('SELECT user_id FROM takes WHERE id=?').get(takeId)?.user_id || ownerId();
  const put = (table, value) => db.prepare(`INSERT INTO ${table}(id,data,user_id) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(value.id, JSON.stringify(value), ownerId());
  const one = (table, id) => parse(db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id));
  const all = table => db.prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`).all().map(parse);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (seed && !db.prepare("SELECT value FROM meta WHERE key='seeded'").get()) {
    transaction(() => {
      for (const take of seedTakes()) put('takes', take);
      db.prepare("INSERT INTO meta VALUES ('seeded','1')").run();
    });
  }
  const store = {
    db, transaction,
    putTake: value => put('takes', value), putChat: value => put('chats', value),
    takes: () => all('takes'), chats: () => all('chats'),
    take: id => one('takes', id), chat: id => one('chats', id),
    setting(key) { const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(row.value) : null; },
    setSetting(key, value) { db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); },
    deleteSetting: key => db.prepare('DELETE FROM settings WHERE key=?').run(key),
    versions: id => db.prepare('SELECT data FROM versions WHERE take_id=? ORDER BY version DESC').all(id).map(parse),
    version(take) {
      const version = {
        id: randomUUID(), takeId: take.id, version: take.version || 1, at: new Date().toISOString(),
        thesis: take.thesis, invalidation: take.invalidation, horizon: take.horizon, settings: take.settings,
        holdings: (take.holdings || []).map(h => ({ticker: h.ticker, weight: h.weight, units: h.units})),
        cash: take.cash, invested: take.invested,
      };
      db.prepare('INSERT OR IGNORE INTO versions(id,take_id,version,data,user_id) VALUES (?,?,?,?,?)').run(version.id, take.id, version.version, JSON.stringify(version), userIdForTake(take.id));
    },
    reviews: id => id ? db.prepare('SELECT data FROM reviews WHERE take_id=? ORDER BY rowid DESC LIMIT 100').all(id).map(parse) : all('reviews'),
    putReview(review) { db.prepare('INSERT OR IGNORE INTO reviews(id,take_id,data,user_id) VALUES (?,?,?,?)').run(review.id, review.takeId, JSON.stringify(review), userIdForTake(review.takeId)); },
    jobs: () => all('jobs'), job: id => one('jobs', id),
    putJob(job) { db.prepare('INSERT INTO jobs(id,take_id,status,data,user_id) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data').run(job.id, job.takeId, job.status, JSON.stringify(job), userIdForTake(job.takeId)); },
    reserve(kind, limit, count = 1) {
      const day = dayUTC();
      db.prepare('INSERT OR IGNORE INTO consumption(day,kind) VALUES (?,?)').run(day, kind);
      return db.prepare('UPDATE consumption SET calls=calls+? WHERE day=? AND kind=? AND calls+?<=?').run(count, day, kind, count, limit).changes === 1;
    },
    tokens(kind, usage, searches = 0, day = dayUTC()) {
      db.prepare('INSERT OR IGNORE INTO consumption(day,kind) VALUES (?,?)').run(day, kind);
      db.prepare('UPDATE consumption SET input_tokens=input_tokens+?,output_tokens=output_tokens+?,searches=searches+? WHERE day=? AND kind=?').run(usage?.input_tokens || 0, usage?.output_tokens || 0, searches, day, kind);
    },
    usage: () => db.prepare('SELECT * FROM consumption WHERE day=?').all(dayUTC()),
    idempotent(key) { const row = db.prepare('SELECT * FROM idempotency WHERE key=?').get(key); return row && {...row, data: JSON.parse(row.data)}; },
    remember(key, fingerprint, data) { db.prepare('INSERT INTO idempotency VALUES (?,?,?)').run(key, fingerprint, JSON.stringify(data)); },
    opsForTake: takeId => db.prepare('SELECT rowid, * FROM ops WHERE take_id=? ORDER BY rowid ASC').all(takeId).map(parseOp),
    opsByBatch: batchId => db.prepare('SELECT rowid, * FROM ops WHERE batch_id=? ORDER BY rowid ASC').all(batchId).map(parseOp),
    op: id => parseOp(db.prepare('SELECT rowid, * FROM ops WHERE id=?').get(id)),
    parseOrder(row) {
      if (!row) return null;
      return {
        id: row.id, takeId: row.take_id, kind: row.kind, status: row.status,
        takeVersion: row.take_version,
        payload: JSON.parse(row.payload), preview: JSON.parse(row.preview),
        fingerprint: row.fingerprint, idempotencyKey: row.idempotency_key,
        createdAt: row.created_at, confirmedAt: row.confirmed_at, cancelledAt: row.cancelled_at,
      };
    },
    ordersForTake: takeId => db.prepare('SELECT * FROM orders WHERE take_id=? ORDER BY created_at DESC').all(takeId).map(store.parseOrder),
    pendingOrders: () => db.prepare("SELECT * FROM orders WHERE status='pending' ORDER BY created_at DESC").all().map(store.parseOrder),
    pendingOrderForTake: takeId => store.parseOrder(db.prepare("SELECT * FROM orders WHERE take_id=? AND status='pending'").get(takeId)),
    order: id => store.parseOrder(db.prepare('SELECT * FROM orders WHERE id=?').get(id)),
    orderByIdempotency: key => store.parseOrder(db.prepare('SELECT * FROM orders WHERE idempotency_key=?').get(key)),
    insertOrder(order) {
      db.prepare(`INSERT INTO orders(
        id,take_id,kind,status,take_version,payload,preview,fingerprint,idempotency_key,created_at,confirmed_at,cancelled_at,user_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        order.id, order.takeId, order.kind, order.status, order.takeVersion,
        JSON.stringify(order.payload), JSON.stringify(order.preview), order.fingerprint,
        order.idempotencyKey || null, order.createdAt, order.confirmedAt || null, order.cancelledAt || null,
        userIdForTake(order.takeId),
      );
    },
    updateOrder(order) {
      db.prepare('UPDATE orders SET status=?, confirmed_at=?, cancelled_at=? WHERE id=?')
        .run(order.status, order.confirmedAt || null, order.cancelledAt || null, order.id);
    },
    insertOp(op) {
      db.prepare(`INSERT INTO ops(
        id,take_id,kind,at,ticker,units,amount,currency,price,quote_as_of,quote_provider,quote_class,quote_eligible,quote_stale,parent_id,batch_id,idempotency_key,fingerprint,note,meta,created_at,user_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        op.id, op.takeId, op.kind, op.at, op.ticker, op.units, op.amount, op.currency || 'ARS', op.price,
        op.quoteAsOf, op.quoteProvider, op.quoteClass, op.quoteEligible, op.quoteStale,
        op.parentId, op.batchId, op.idempotencyKey, op.fingerprint, op.note || '', JSON.stringify(op.meta || {}),
        op.createdAt || op.at, userIdForTake(op.takeId),
      );
    },
    userVersion: () => pragmaUserVersion(db),
    ownerUserId: () => readOwnerUserId(db),
    agentPromptVersionById(id) {
      return db.prepare('SELECT id,version,body,note,who,source,created_at,char_count FROM agent_prompt_versions WHERE id=?').get(id) || null;
    },
    agentPromptVersionsMeta() {
      return db.prepare('SELECT id,version,note,who,source,created_at,char_count FROM agent_prompt_versions ORDER BY version DESC').all();
    },
    nextAgentPromptVersion() {
      const row = db.prepare('SELECT MAX(version) AS max FROM agent_prompt_versions').get();
      return (row?.max || 0) + 1;
    },
    parseNewsFeed(row) {
      if (!row) return null;
      return {
        id: row.id,
        label: row.label,
        url: row.url,
        enabled: !!row.enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastOkAt: row.last_ok_at,
        lastError: row.last_error,
        lastProbeAt: row.last_probe_at,
        etag: row.etag,
        lastModified: row.last_modified,
      };
    },
    listNewsFeeds({enabled} = {}) {
      if (enabled === true) {
        return db.prepare('SELECT * FROM news_feeds WHERE enabled=1 ORDER BY updated_at DESC, id DESC').all().map(store.parseNewsFeed);
      }
      if (enabled === false) {
        return db.prepare('SELECT * FROM news_feeds WHERE enabled=0 ORDER BY updated_at DESC, id DESC').all().map(store.parseNewsFeed);
      }
      return db.prepare('SELECT * FROM news_feeds ORDER BY updated_at DESC, id DESC').all().map(store.parseNewsFeed);
    },
    newsFeed(id) {
      return store.parseNewsFeed(db.prepare('SELECT * FROM news_feeds WHERE id=?').get(id));
    },
    insertNewsFeed({label, url, enabled = true}) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO news_feeds(id,label,url,enabled,created_at,updated_at)
        VALUES (?,?,?,?,?,?)`).run(id, label, url, enabled ? 1 : 0, now, now);
      return store.newsFeed(id);
    },
    updateNewsFeed(id, patch) {
      const current = store.newsFeed(id);
      if (!current) return null;
      const now = new Date().toISOString();
      const label = patch.label !== undefined ? patch.label : current.label;
      const url = patch.url !== undefined ? patch.url : current.url;
      const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : (current.enabled ? 1 : 0);
      db.prepare('UPDATE news_feeds SET label=?, url=?, enabled=?, updated_at=? WHERE id=?')
        .run(label, url, enabled, now, id);
      return store.newsFeed(id);
    },
    deleteNewsFeed(id) {
      return db.prepare('DELETE FROM news_feeds WHERE id=?').run(id).changes === 1;
    },
    recordNewsFeedProbe(id, {ok, error = null, etag = null, lastModified = null}) {
      const now = new Date().toISOString();
      if (ok) {
        db.prepare(`UPDATE news_feeds SET last_ok_at=?, last_error=NULL, last_probe_at=?, etag=?, last_modified=?, updated_at=? WHERE id=?`)
          .run(now, now, etag, lastModified, now, id);
      } else {
        db.prepare(`UPDATE news_feeds SET last_error=?, last_probe_at=?, updated_at=? WHERE id=?`)
          .run(error || 'No se pudo probar el feed.', now, now, id);
      }
      return store.newsFeed(id);
    },
    appendAgentPromptVersion({body, note = '', who = 'admin', source}) {
      const id = randomUUID();
      const version = store.nextAgentPromptVersion();
      const created_at = new Date().toISOString();
      const char_count = body.length;
      return transaction(() => {
        db.prepare('INSERT INTO agent_prompt_versions(id,version,body,note,who,source,created_at,char_count) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, version, body, note || '', who, source, created_at, char_count);
        store.setSetting('agentPrompt', {activeId: id, activeVersion: version, updatedAt: created_at});
        return store.agentPromptVersionById(id);
      });
    },
    close: () => db.close(),
  };
  for (const take of store.takes()) {
    if (!take.version) {
      take.version = 1;
      take.coverage = 'pending';
      take.attention = 'track';
      take.monitoringPaused = true;
      store.putTake(take);
      store.version(take);
    }
  }
  return store;
}
