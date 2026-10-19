import {readFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {hashPassword} from '../password.mjs';
import {MODEL_PRICES_KEY, defaultModelPrices} from '../usage.mjs';

export const SCHEMA_USER_VERSION = 12;
export const DEFAULT_OWNER_EMAIL = 'diego@diegodella.ar';
export const OWNER_META_KEY = 'ownerUserId';

export const USER_SCOPED_TABLES = Object.freeze([
  'takes', 'chats', 'versions', 'reviews', 'jobs', 'ops', 'orders',
]);
export const CHILD_TABLES = Object.freeze(['versions', 'reviews', 'jobs', 'ops', 'orders']);
export const GLOBAL_TABLES = Object.freeze([
  'quote_cache', 'benchmark_cache', 'news_feeds', 'agent_prompt_versions',
  'consumption', 'settings', 'meta', 'idempotency',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

function assertUuid(id) {
  if (!isUuid(id)) throw new Error('migrate: invalid owner id');
}

function displayNameFromEmail(email) {
  const local = String(email).split('@')[0] || 'owner';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
}

function hasColumn(db, table, column) {
  return columnNames(db, table).includes(column);
}

function tableExists(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
}

function count(db, sql) {
  return db.prepare(sql).get().n;
}

export function readOwnerEmail(override) {
  if (override) return normalizeEmail(override);
  return normalizeEmail(process.env.OWNER_EMAIL || DEFAULT_OWNER_EMAIL);
}

/** Reads APP_PASSWORD(_FILE) the same way server.mjs does. Never logs the value. */
export function readOwnerPassword(override) {
  if (override != null) return String(override);
  if (process.env.APP_PASSWORD_FILE) {
    try {
      return readFileSync(process.env.APP_PASSWORD_FILE, 'utf8').trim();
    } catch {
      return '';
    }
  }
  return process.env.APP_PASSWORD || '';
}

export function ownerUserId(db) {
  const row = db.prepare('SELECT value FROM meta WHERE key=?').get(OWNER_META_KEY);
  return row?.value || null;
}

export function pragmaUserVersion(db) {
  const row = db.prepare('PRAGMA user_version').get();
  if (!row) return 0;
  if (typeof row.user_version === 'number') return row.user_version;
  const first = Object.values(row)[0];
  return typeof first === 'number' ? first : 0;
}

function setUserVersion(db, version) {
  db.exec(`PRAGMA user_version=${Number(version)}`);
}

function applyV9(db, options = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','superadmin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
      password_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_login_at TEXT,
      legal_accepted_at TEXT,
      legal_accepted_version TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      ip_hash TEXT,
      ua TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      actor_user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      target TEXT,
      meta TEXT NOT NULL DEFAULT '{}',
      ip_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log(at DESC);
    CREATE INDEX IF NOT EXISTS audit_log_actor ON audit_log(actor_user_id, at DESC);
  `);

  if (!ownerUserId(db)) {
    const id = randomUUID();
    assertUuid(id);
    const email = readOwnerEmail(options.ownerEmail);
    if (!email || !email.includes('@')) throw new Error('migrate v9: OWNER_EMAIL is required');
    const password_hash = hashPassword(readOwnerPassword(options.ownerPassword));
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users(id,email,display_name,role,status,password_hash,created_at)
      VALUES (?,?,?,?,?,?,?)`).run(
      id, email, displayNameFromEmail(email), 'superadmin', 'active', password_hash, now,
    );
    db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run(OWNER_META_KEY, id);
  }
  setUserVersion(db, 9);
}

function addUserIdColumn(db, table) {
  if (!tableExists(db, table) || hasColumn(db, table, 'user_id')) return;
  // SQLite forbids ADD COLUMN … REFERENCES with a non-NULL DEFAULT. Nullable + backfill.
  db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT REFERENCES users(id)`);
}

function applyV10(db) {
  const ownerId = ownerUserId(db);
  if (!ownerId) throw new Error('migrate v10: ownerUserId missing');
  assertUuid(ownerId);

  for (const table of USER_SCOPED_TABLES) addUserIdColumn(db, table);

  if (tableExists(db, 'takes')) db.prepare('UPDATE takes SET user_id=? WHERE user_id IS NULL').run(ownerId);
  if (tableExists(db, 'chats')) db.prepare('UPDATE chats SET user_id=? WHERE user_id IS NULL').run(ownerId);
  for (const table of CHILD_TABLES) {
    if (!tableExists(db, table)) continue;
    db.exec(`UPDATE ${table} SET user_id=(SELECT user_id FROM takes WHERE takes.id=${table}.take_id) WHERE user_id IS NULL`);
    db.prepare(`UPDATE ${table} SET user_id=? WHERE user_id IS NULL`).run(ownerId);
  }

  for (const table of USER_SCOPED_TABLES) {
    if (!tableExists(db, table) || !hasColumn(db, table, 'user_id')) continue;
    const n = count(db, `SELECT COUNT(*) AS n FROM ${table} WHERE user_id IS NULL`);
    if (n !== 0) throw new Error(`migrate v10: ${table}.user_id still NULL (${n} rows)`);
  }
  setUserVersion(db, 10);
}

function applyV11(db) {
  const indexes = [
    ['takes', 'CREATE INDEX IF NOT EXISTS takes_user ON takes(user_id)'],
    ['chats', 'CREATE INDEX IF NOT EXISTS chats_user ON chats(user_id)'],
    ['ops', 'CREATE INDEX IF NOT EXISTS ops_user_take_at ON ops(user_id, take_id, at)'],
    ['orders', 'CREATE INDEX IF NOT EXISTS orders_user_take ON orders(user_id, take_id)'],
    ['jobs', 'CREATE INDEX IF NOT EXISTS jobs_user_status ON jobs(user_id, status)'],
    ['reviews', 'CREATE INDEX IF NOT EXISTS reviews_user_take ON reviews(user_id, take_id)'],
    ['versions', 'CREATE INDEX IF NOT EXISTS versions_user_take ON versions(user_id, take_id)'],
  ];
  for (const [table, sql] of indexes) {
    if (tableExists(db, table)) db.exec(sql);
  }

  for (const table of USER_SCOPED_TABLES) {
    if (!tableExists(db, table)) continue;
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ${table}_user_id_required_insert
      BEFORE INSERT ON ${table}
      FOR EACH ROW
      WHEN NEW.user_id IS NULL
      BEGIN
        SELECT RAISE(ABORT, '${table}.user_id is required');
      END;
      CREATE TRIGGER IF NOT EXISTS ${table}_user_id_required_update
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      WHEN NEW.user_id IS NULL
      BEGIN
        SELECT RAISE(ABORT, '${table}.user_id is required');
      END;
    `);
  }

  for (const table of CHILD_TABLES) {
    if (!tableExists(db, table)) continue;
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ${table}_user_id_matches_take_insert
      BEFORE INSERT ON ${table}
      FOR EACH ROW
      WHEN EXISTS (SELECT 1 FROM takes WHERE id = NEW.take_id)
       AND NEW.user_id IS NOT (SELECT user_id FROM takes WHERE id = NEW.take_id)
      BEGIN
        SELECT RAISE(ABORT, '${table}.user_id must match takes.user_id');
      END;
      CREATE TRIGGER IF NOT EXISTS ${table}_user_id_matches_take_update
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      WHEN EXISTS (SELECT 1 FROM takes WHERE id = NEW.take_id)
       AND NEW.user_id IS NOT (SELECT user_id FROM takes WHERE id = NEW.take_id)
      BEGIN
        SELECT RAISE(ABORT, '${table}.user_id must match takes.user_id');
      END;
    `);
  }
  setUserVersion(db, 11);
}

function applyV12(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_usage (
      user_id TEXT NOT NULL REFERENCES users(id),
      day TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('chat','review','research','preview')),
      calls INTEGER NOT NULL DEFAULT 0,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      est_cost_micro INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id, day, kind)
    );
    CREATE INDEX IF NOT EXISTS user_usage_day ON user_usage(day, user_id);
  `);
  const existing = db.prepare('SELECT 1 FROM settings WHERE key=?').get(MODEL_PRICES_KEY);
  if (!existing) {
    db.prepare('INSERT INTO settings(key,value) VALUES (?,?)')
      .run(MODEL_PRICES_KEY, JSON.stringify(defaultModelPrices()));
  }
  setUserVersion(db, SCHEMA_USER_VERSION);
}

/** Caller must wrap in BEGIN IMMEDIATE … COMMIT / ROLLBACK. */
export function applyMultiuserMigrations(db, options = {}) {
  const version = typeof options.version === 'number' ? options.version : pragmaUserVersion(db);
  const stopAt = typeof options.stopAt === 'number' ? options.stopAt : SCHEMA_USER_VERSION;
  if (version < 9 && stopAt >= 9) applyV9(db, options);
  if (version < 10 && stopAt >= 10) applyV10(db);
  if (version < 11 && stopAt >= 11) applyV11(db);
  if (version < 12 && stopAt >= 12) applyV12(db);
}

export function opsChecksum(db) {
  if (!tableExists(db, 'ops')) return null;
  const rows = db.prepare('SELECT id, amount, at FROM ops ORDER BY id').all();
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function scopedCounts(db) {
  const counts = {};
  for (const table of USER_SCOPED_TABLES) {
    counts[table] = tableExists(db, table) ? count(db, `SELECT COUNT(*) AS n FROM ${table}`) : null;
  }
  return counts;
}

function nullUserIds(db) {
  const nulls = {};
  for (const table of USER_SCOPED_TABLES) {
    if (!tableExists(db, table) || !hasColumn(db, table, 'user_id')) {
      nulls[table] = null;
      continue;
    }
    nulls[table] = count(db, `SELECT COUNT(*) AS n FROM ${table} WHERE user_id IS NULL`);
  }
  return nulls;
}

export function inspectMigration(db) {
  const errors = [];
  const userVersionRow = db.prepare('PRAGMA user_version').get();
  const userVersion = typeof userVersionRow?.user_version === 'number'
    ? userVersionRow.user_version
    : Number(Object.values(userVersionRow || {})[0]) || 0;

  if (userVersion !== SCHEMA_USER_VERSION) {
    errors.push(`PRAGMA user_version=${userVersion}, expected ${SCHEMA_USER_VERSION}`);
  }

  const ownerId = ownerUserId(db);
  let ownerEmail = null;
  let ownerRole = null;
  let ownerStatus = null;
  let ownerHasPasswordHash = false;
  if (!ownerId) errors.push('meta.ownerUserId missing');
  else {
    const owner = db.prepare('SELECT email, role, status, password_hash FROM users WHERE id=?').get(ownerId);
    if (!owner) errors.push('owner row missing in users');
    else {
      ownerEmail = owner.email;
      ownerRole = owner.role;
      ownerStatus = owner.status;
      ownerHasPasswordHash = !!owner.password_hash;
      if (owner.role !== 'superadmin') errors.push(`owner role is ${owner.role}, expected superadmin`);
      if (owner.status !== 'active') errors.push(`owner status is ${owner.status}, expected active`);
    }
  }

  const nulls = nullUserIds(db);
  for (const [table, n] of Object.entries(nulls)) {
    if (n == null) errors.push(`${table}.user_id column missing`);
    else if (n !== 0) errors.push(`${table}: ${n} rows with user_id NULL`);
  }

  const integrityRow = db.prepare('PRAGMA integrity_check').get();
  const integrity = integrityRow?.integrity_check || String(Object.values(integrityRow || {})[0] || '');
  if (integrity !== 'ok') errors.push(`integrity_check=${integrity}`);

  const fkRows = db.prepare('PRAGMA foreign_key_check').all();
  if (fkRows.length) errors.push(`foreign_key_check: ${fkRows.length} violation(s)`);

  const globalHasUserId = {};
  for (const table of GLOBAL_TABLES) {
    globalHasUserId[table] = tableExists(db, table) && hasColumn(db, table, 'user_id');
    if (globalHasUserId[table]) errors.push(`${table} must stay global (no user_id)`);
  }

  if (!tableExists(db, 'user_usage')) errors.push('user_usage table missing');
  else {
    const cols = columnNames(db, 'user_usage');
    for (const col of ['user_id', 'day', 'kind', 'calls', 'prompt_tokens', 'completion_tokens', 'est_cost_micro']) {
      if (!cols.includes(col)) errors.push(`user_usage.${col} missing`);
    }
  }

  return {
    ok: errors.length === 0,
    userVersion,
    ownerUserId: ownerId,
    ownerEmail,
    ownerRole,
    ownerStatus,
    ownerHasPasswordHash,
    counts: scopedCounts(db),
    nullUserIds: nulls,
    opsChecksum: opsChecksum(db),
    integrity,
    foreignKeyViolations: fkRows.length,
    globalHasUserId,
    errors,
  };
}
