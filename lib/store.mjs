import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {seedTakes} from './engine.mjs';
import {applyMultiuserMigrations} from './migrations/multiuser.mjs';
import {assertExistingUser, createAccess, insertUser} from './store-access.mjs';

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
  const store = createAccess(db, {parseOp});
  const scopedCache = new Map();
  function parseNewsFeed(row) {
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
  }
  Object.assign(store, {
    db,
    userVersion: () => pragmaUserVersion(db),
    createUser: options => insertUser(db, options),
    forUser(userId) {
      const id = assertExistingUser(db, userId);
      let scoped = scopedCache.get(id);
      if (!scoped) {
        scoped = createAccess(db, {userId: id, parseOp});
        scoped.listNewsFeeds = store.listNewsFeeds;
        scopedCache.set(id, scoped);
      }
      return scoped;
    },
    userIsActive(userId) {
      if (!userId) return false;
      return db.prepare('SELECT status FROM users WHERE id=?').get(userId)?.status === 'active';
    },
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
    parseNewsFeed,
    listNewsFeeds({enabled} = {}) {
      if (enabled === true) {
        return db.prepare('SELECT * FROM news_feeds WHERE enabled=1 ORDER BY updated_at DESC, id DESC').all().map(parseNewsFeed);
      }
      if (enabled === false) {
        return db.prepare('SELECT * FROM news_feeds WHERE enabled=0 ORDER BY updated_at DESC, id DESC').all().map(parseNewsFeed);
      }
      return db.prepare('SELECT * FROM news_feeds ORDER BY updated_at DESC, id DESC').all().map(parseNewsFeed);
    },
    newsFeed(id) {
      return parseNewsFeed(db.prepare('SELECT * FROM news_feeds WHERE id=?').get(id));
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
      return store.transaction(() => {
        db.prepare('INSERT INTO agent_prompt_versions(id,version,body,note,who,source,created_at,char_count) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, version, body, note || '', who, source, created_at, char_count);
        store.setSetting('agentPrompt', {activeId: id, activeVersion: version, updatedAt: created_at});
        return store.agentPromptVersionById(id);
      });
    },
    close: () => db.close(),
  });
  store.admin = {
    scope: 'admin',
    takes: store.takes,
    chats: store.chats,
    take: store.take,
    chat: store.chat,
    jobs: store.jobs,
    job: store.job,
    reviews: store.reviews,
    pendingOrders: store.pendingOrders,
    userIdForTake: store.userIdForTake,
    putTake: store.putTake,
    putChat: store.putChat,
    putJob: store.putJob,
    putReview: store.putReview,
    reserve: store.reserve,
    tokens: store.tokens,
    usage: store.usage,
    listNewsFeeds: store.listNewsFeeds,
    createUser: store.createUser,
    ownerUserId: store.ownerUserId,
    userIsActive: store.userIsActive,
    transaction: store.transaction,
  };
  if (seed && !db.prepare("SELECT value FROM meta WHERE key='seeded'").get()) {
    store.transaction(() => {
      for (const take of seedTakes()) store.putTake(take);
      db.prepare("INSERT INTO meta VALUES ('seeded','1')").run();
    });
  }
  for (const take of store.admin.takes()) {
    if (!take.version) {
      const uid = store.userIdForTake(take.id) || store.ownerUserId();
      const scoped = uid ? store.forUser(uid) : store;
      take.version = 1;
      take.coverage = 'pending';
      take.attention = 'track';
      take.monitoringPaused = true;
      scoped.putTake(take);
      scoped.version(take);
    }
  }
  return store;
}
