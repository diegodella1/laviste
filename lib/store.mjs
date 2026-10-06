import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assert, seedTakes} from './engine.mjs';

const dayUTC = () => new Date().toISOString().slice(0, 10);
export function createStore(dir, {seed = false} = {}) {
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
    PRAGMA user_version=5;`);
  const parse = row => row ? JSON.parse(row.data) : null;
  const put = (table, value) => db.prepare(`INSERT INTO ${table}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(value.id, JSON.stringify(value));
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
      const version = {id: randomUUID(), takeId: take.id, version: take.version || 1, at: new Date().toISOString(), thesis: take.thesis, invalidation: take.invalidation, horizon: take.horizon, settings: take.settings};
      db.prepare('INSERT OR IGNORE INTO versions VALUES (?,?,?,?)').run(version.id, take.id, version.version, JSON.stringify(version));
    },
    reviews: id => id ? db.prepare('SELECT data FROM reviews WHERE take_id=? ORDER BY rowid DESC LIMIT 100').all(id).map(parse) : all('reviews'),
    putReview(review) { db.prepare('INSERT OR IGNORE INTO reviews VALUES (?,?,?)').run(review.id, review.takeId, JSON.stringify(review)); },
    jobs: () => all('jobs'), job: id => one('jobs', id),
    putJob(job) { db.prepare('INSERT INTO jobs VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data').run(job.id, job.takeId, job.status, JSON.stringify(job)); },
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
