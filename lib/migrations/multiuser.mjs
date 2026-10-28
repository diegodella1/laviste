import {readFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {hashPassword} from '../password.mjs';
import {DEFAULT_MONTHLY_CAP_USD} from '../budget.mjs';
import {MODEL_PRICES_KEY, defaultModelPrices} from '../usage.mjs';
import {
  AUTO_NEWS_TRIGGER_DEFAULT, AUTO_MAX_TRADES_DAY, AUTO_MAX_TURNOVER_PCT,
  AUTO_MAX_TRADES_DAY_USER, AUTO_BROKEN_ACTION, AUTO_UNDO_AT,
  AUTO_UNDO_WINDOW_HOURS, AUTO_CANARY_OWNER_ONLY_DEFAULT,
} from '../auto/constants.mjs';

export const SCHEMA_USER_VERSION = 20;
export const DEFAULT_OWNER_EMAIL = 'diego@diegodella.ar';
export const OWNER_META_KEY = 'ownerUserId';

export const USER_SCOPED_TABLES = Object.freeze([
  'takes', 'chats', 'versions', 'reviews', 'jobs', 'ops', 'orders',
]);
export const CHILD_TABLES = Object.freeze(['versions', 'reviews', 'jobs', 'ops', 'orders']);
export const AUTO_TABLES = Object.freeze(['auto_policies', 'auto_signals', 'auto_trades']);
export const LEADERBOARD_TABLES = Object.freeze(['take_daily_marks', 'public_take_stats']);
export const TAKE_DAILY_MARKS_COLUMNS = Object.freeze([
  'take_id', 'user_id', 'day', 'value', 'invested', 'bench_id', 'bench_price', 'eligible',
]);
export const PUBLIC_TAKE_STATS_COLUMNS = Object.freeze([
  'public_id', 'take_id', 'user_id', 'title', 'alias', 'bench_label', 'pct_since', 'pct_30d',
  'bench_30d', 'holdings_json', 'days_active', 'ranked', 'auto_label', 'note', 'window_end',
  'computed_at',
]);
export const GLOBAL_TABLES = Object.freeze([
  'quote_cache', 'benchmark_cache', 'news_feeds', 'agent_prompt_versions',
  'consumption', 'settings', 'meta', 'idempotency',
]);
export const SIMULATED_TABLES = Object.freeze(['ops', 'orders', ...AUTO_TABLES]);

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

function tableSql(db, table) {
  return db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table)?.sql || '';
}

function hasSimulatedCheck(db, table) {
  return /CHECK\s*\(\s*simulated\s*=\s*1\s*\)/i.test(tableSql(db, table));
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

  ensureUserIdRequiredTriggers(db, USER_SCOPED_TABLES);
  ensureUserIdMatchesTakeTriggers(db, CHILD_TABLES);
  setUserVersion(db, 11);
}

function ensureUserIdRequiredTriggers(db, tables) {
  for (const table of tables) {
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
}

function ensureUserIdMatchesTakeTriggers(db, tables) {
  for (const table of tables) {
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
  setUserVersion(db, 12);
}

function applyV13(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_limits (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      chat_per_day INTEGER,
      news_per_day INTEGER,
      tokens_per_day INTEGER,
      monitored_takes INTEGER,
      rpm INTEGER,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS user_quota (
      user_id TEXT NOT NULL REFERENCES users(id),
      day TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('chat','news','tokens')),
      units INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id, day, kind)
    );
    CREATE INDEX IF NOT EXISTS user_quota_day ON user_quota(day, user_id);
  `);
  setUserVersion(db, 13);
}

function applyV14(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_control (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      monthly_cap_usd REAL NOT NULL DEFAULT 20,
      daily_cap_usd REAL,
      alert_month TEXT,
      alert_month_80 INTEGER NOT NULL DEFAULT 0,
      alert_day TEXT,
      alert_day_80 INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );
  `);
  const existing = db.prepare('SELECT id FROM ai_control WHERE id=1').get();
  if (!existing) {
    db.prepare(`INSERT INTO ai_control(
      id, enabled, monthly_cap_usd, daily_cap_usd, updated_at
    ) VALUES (1, 1, ?, NULL, ?)`).run(DEFAULT_MONTHLY_CAP_USD, new Date().toISOString());
  }
  setUserVersion(db, 14);
}

const OPS_COLUMNS = [
  'id', 'take_id', 'kind', 'at', 'ticker', 'units', 'amount', 'currency', 'price',
  'quote_as_of', 'quote_provider', 'quote_class', 'quote_eligible', 'quote_stale',
  'parent_id', 'batch_id', 'idempotency_key', 'fingerprint', 'note', 'meta',
  'created_at', 'user_id',
];
const ORDERS_COLUMNS = [
  'id', 'take_id', 'kind', 'status', 'take_version', 'payload', 'preview',
  'fingerprint', 'idempotency_key', 'created_at', 'confirmed_at', 'cancelled_at', 'user_id',
];

function simulatedNotOneCount(db, table) {
  if (!tableExists(db, table) || !hasColumn(db, table, 'simulated')) return null;
  return count(db, `SELECT COUNT(*) AS n FROM ${table} WHERE simulated IS NOT 1`);
}

function probeSimulatedCheckEnforced(db, table) {
  db.exec('SAVEPOINT v15_sim_probe');
  try {
    if (table === 'ops') {
      db.prepare(`INSERT INTO ops(
        id,take_id,kind,at,amount,quote_class,quote_eligible,batch_id,idempotency_key,fingerprint,created_at,user_id,simulated
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        '__v15_probe_ops', '__v15_none__', 'aporte', '1970-01-01T00:00:00.000Z', 0, 'missing', 0,
        '__v15_probe', '__v15_probe_ops', 'probe', '1970-01-01T00:00:00.000Z', ownerUserId(db), 0,
      );
    } else if (table === 'orders') {
      db.prepare(`INSERT INTO orders(
        id,take_id,kind,status,take_version,payload,preview,fingerprint,created_at,user_id,simulated
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        '__v15_probe_ord', '__v15_none__', 'aporte', 'cancelled', 1, '{}', '{}', 'probe',
        '1970-01-01T00:00:00.000Z', ownerUserId(db), 0,
      );
    } else {
      throw new Error(`migrate v15: no probe for ${table}`);
    }
    db.exec('ROLLBACK TO v15_sim_probe');
    db.exec('RELEASE v15_sim_probe');
    return false;
  } catch (error) {
    try { db.exec('ROLLBACK TO v15_sim_probe'); } catch { /* already rolled back */ }
    try { db.exec('RELEASE v15_sim_probe'); } catch { /* released */ }
    if (/CHECK constraint failed/i.test(String(error.message))) return true;
    throw error;
  }
}

function rebuildLedgerWithSimulatedCheck(db, table) {
  const newName = `${table}__v15`;
  const cols = table === 'ops' ? OPS_COLUMNS : ORDERS_COLUMNS;
  const copy = cols.join(', ');
  if (table === 'ops') {
    db.exec(`
      CREATE TABLE ${newName} (
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
        created_at TEXT NOT NULL,
        user_id TEXT REFERENCES users(id),
        simulated INTEGER NOT NULL DEFAULT 1 CHECK(simulated=1)
      );
    `);
  } else {
    db.exec(`
      CREATE TABLE ${newName} (
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
        cancelled_at TEXT,
        user_id TEXT REFERENCES users(id),
        simulated INTEGER NOT NULL DEFAULT 1 CHECK(simulated=1)
      );
    `);
  }
  const hasSim = hasColumn(db, table, 'simulated');
  const selectSim = hasSim ? 'COALESCE(simulated, 1)' : '1';
  db.exec(`INSERT INTO ${newName}(rowid, ${copy}, simulated) SELECT rowid, ${copy}, ${selectSim} FROM ${table}`);
  db.exec(`DROP TABLE ${table}`);
  db.exec(`ALTER TABLE ${newName} RENAME TO ${table}`);
  if (table === 'ops') {
    db.exec(`
      CREATE INDEX IF NOT EXISTS ops_take_at ON ops(take_id, at, id);
      CREATE INDEX IF NOT EXISTS ops_batch ON ops(batch_id);
      CREATE INDEX IF NOT EXISTS ops_user_take_at ON ops(user_id, take_id, at);
    `);
  } else {
    db.exec(`
      CREATE INDEX IF NOT EXISTS orders_take ON orders(take_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS one_pending_order ON orders(take_id) WHERE status='pending';
      CREATE INDEX IF NOT EXISTS orders_user_take ON orders(user_id, take_id);
    `);
  }
  ensureUserIdRequiredTriggers(db, [table]);
  ensureUserIdMatchesTakeTriggers(db, [table]);
}

/** Light ALTER + CHECK. Rebuilds only if this SQLite does not enforce the new CHECK. */
function addSimulatedColumn(db, table) {
  if (!tableExists(db, table)) return;
  if (!hasColumn(db, table, 'simulated')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN simulated INTEGER NOT NULL DEFAULT 1 CHECK(simulated=1)`);
  }
  const bad = simulatedNotOneCount(db, table);
  if (bad) throw new Error(`migrate v15: ${table} has ${bad} rows with simulated<>1`);
  if (hasSimulatedCheck(db, table) && probeSimulatedCheckEnforced(db, table)) return;
  rebuildLedgerWithSimulatedCheck(db, table);
  const after = simulatedNotOneCount(db, table);
  if (after) throw new Error(`migrate v15: ${table} rebuild left ${after} rows with simulated<>1`);
  if (!hasSimulatedCheck(db, table) || !probeSimulatedCheckEnforced(db, table)) {
    throw new Error(`migrate v15: ${table}.simulated CHECK(simulated=1) is not enforced`);
  }
}

function assertTableColumns(db, table, cols) {
  if (!tableExists(db, table)) throw new Error(`migrate v15: ${table} table missing`);
  const have = columnNames(db, table);
  for (const col of cols) {
    if (!have.includes(col)) throw new Error(`migrate v15: ${table}.${col} missing`);
  }
}

function applyV15(db) {
  addSimulatedColumn(db, 'ops');
  addSimulatedColumn(db, 'orders');

  db.exec(`
    CREATE TABLE IF NOT EXISTS auto_policies (
      take_id TEXT PRIMARY KEY REFERENCES takes(id),
      user_id TEXT REFERENCES users(id),
      enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
      simulated INTEGER NOT NULL DEFAULT 1 CHECK(simulated=1),
      news_trigger INTEGER NOT NULL DEFAULT ${AUTO_NEWS_TRIGGER_DEFAULT} CHECK(news_trigger IN (0,1)),
      max_trades_day INTEGER NOT NULL DEFAULT ${AUTO_MAX_TRADES_DAY} CHECK(max_trades_day >= 1),
      max_turnover_pct INTEGER NOT NULL DEFAULT ${AUTO_MAX_TURNOVER_PCT} CHECK(max_turnover_pct BETWEEN 1 AND 100),
      max_trades_day_user INTEGER NOT NULL DEFAULT ${AUTO_MAX_TRADES_DAY_USER} CHECK(max_trades_day_user = ${AUTO_MAX_TRADES_DAY_USER}),
      broken_action TEXT NOT NULL DEFAULT '${AUTO_BROKEN_ACTION}' CHECK(broken_action = '${AUTO_BROKEN_ACTION}'),
      undo_at TEXT NOT NULL DEFAULT '${AUTO_UNDO_AT}' CHECK(undo_at = '${AUTO_UNDO_AT}'),
      undo_window_hours INTEGER NOT NULL DEFAULT ${AUTO_UNDO_WINDOW_HOURS} CHECK(undo_window_hours = ${AUTO_UNDO_WINDOW_HOURS}),
      canary_owner_only INTEGER NOT NULL DEFAULT ${AUTO_CANARY_OWNER_ONLY_DEFAULT} CHECK(canary_owner_only IN (0,1)),
      arm_state TEXT NOT NULL DEFAULT '{}',
      paused_reason TEXT,
      consent_version TEXT,
      news_consent_version TEXT,
      enabled_at TEXT,
      enabled_by TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auto_policies_user ON auto_policies(user_id);
    CREATE INDEX IF NOT EXISTS auto_policies_enabled ON auto_policies(enabled, take_id);

    CREATE TABLE IF NOT EXISTS auto_signals (
      id TEXT PRIMARY KEY,
      take_id TEXT NOT NULL REFERENCES takes(id),
      user_id TEXT REFERENCES users(id),
      simulated INTEGER NOT NULL DEFAULT 1 CHECK(simulated=1),
      kind TEXT NOT NULL CHECK(kind IN ('cap','drift','broken')),
      ticker TEXT,
      signature TEXT NOT NULL,
      arm_epoch INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('pending','confirmed','expired','skipped','suppressed','executed')),
      skip_reason TEXT,
      source_review_id TEXT,
      quote_as_of TEXT,
      detected_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT,
      meta TEXT NOT NULL DEFAULT '{}',
      UNIQUE(take_id, signature)
    );
    CREATE INDEX IF NOT EXISTS auto_signals_user_take ON auto_signals(user_id, take_id);

    CREATE TABLE IF NOT EXISTS auto_trades (
      id TEXT PRIMARY KEY,
      take_id TEXT NOT NULL REFERENCES takes(id),
      user_id TEXT REFERENCES users(id),
      simulated INTEGER NOT NULL DEFAULT 1 CHECK(simulated=1),
      signal_id TEXT UNIQUE REFERENCES auto_signals(id),
      kind TEXT NOT NULL CHECK(kind IN ('cap','drift','broken','undo')),
      day TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('executed','reversed','partially_reversed')),
      order_id TEXT,
      batch_id TEXT,
      undo_trade_id TEXT UNIQUE,
      reverses_id TEXT,
      executed_at TEXT NOT NULL,
      amount REAL,
      meta TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auto_trades_user_day ON auto_trades(user_id, day);
    CREATE INDEX IF NOT EXISTS auto_trades_take_day ON auto_trades(take_id, day);
  `);

  assertTableColumns(db, 'auto_policies', [
    'take_id', 'user_id', 'enabled', 'simulated', 'news_trigger', 'max_trades_day',
    'max_turnover_pct', 'max_trades_day_user', 'broken_action', 'undo_at',
    'undo_window_hours', 'canary_owner_only', 'arm_state', 'paused_reason',
    'consent_version', 'news_consent_version', 'enabled_at', 'enabled_by', 'updated_at',
  ]);
  assertTableColumns(db, 'auto_signals', [
    'id', 'take_id', 'user_id', 'simulated', 'kind', 'ticker', 'signature', 'arm_epoch',
    'status', 'skip_reason', 'source_review_id', 'quote_as_of', 'detected_at',
    'updated_at', 'expires_at', 'meta',
  ]);
  assertTableColumns(db, 'auto_trades', [
    'id', 'take_id', 'user_id', 'simulated', 'signal_id', 'kind', 'day', 'status',
    'order_id', 'batch_id', 'undo_trade_id', 'reverses_id', 'executed_at', 'amount',
    'meta', 'created_at',
  ]);

  ensureUserIdRequiredTriggers(db, AUTO_TABLES);
  ensureUserIdMatchesTakeTriggers(db, AUTO_TABLES);
  setUserVersion(db, 15);
}

function applyV16(db) {
  if (tableExists(db, 'users')) {
    if (!hasColumn(db, 'users', 'google_sub')) {
      db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
    }
    if (!hasColumn(db, 'users', 'google_linked_at')) {
      db.exec('ALTER TABLE users ADD COLUMN google_linked_at TEXT');
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL');
  }
  setUserVersion(db, 16);
}

function applyV17(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      created_by TEXT REFERENCES users(id),
      source     TEXT NOT NULL CHECK(source IN ('admin','cli')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id);
  `);
  setUserVersion(db, 17);
}

function applyV18(db) {
  if (tableExists(db, 'takes')) {
    if (!hasColumn(db, 'takes', 'is_public')) {
      db.exec('ALTER TABLE takes ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1))');
    }
    if (!hasColumn(db, 'takes', 'public_id')) {
      db.exec('ALTER TABLE takes ADD COLUMN public_id TEXT');
    }
    if (!hasColumn(db, 'takes', 'public_since')) {
      db.exec('ALTER TABLE takes ADD COLUMN public_since TEXT');
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS takes_public_id ON takes(public_id) WHERE public_id IS NOT NULL');
  }
  if (tableExists(db, 'users')) {
    if (!hasColumn(db, 'users', 'public_alias')) {
      db.exec('ALTER TABLE users ADD COLUMN public_alias TEXT');
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_public_alias ON users(lower(public_alias)) WHERE public_alias IS NOT NULL');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS take_daily_marks(
      take_id TEXT NOT NULL REFERENCES takes(id),
      user_id TEXT REFERENCES users(id),
      day TEXT NOT NULL,
      value REAL NOT NULL,
      invested REAL NOT NULL,
      bench_id TEXT,
      bench_price REAL,
      eligible INTEGER NOT NULL,
      PRIMARY KEY(take_id, day)
    );
    CREATE TABLE IF NOT EXISTS public_take_stats(
      public_id TEXT PRIMARY KEY,
      take_id TEXT NOT NULL UNIQUE REFERENCES takes(id),
      user_id TEXT REFERENCES users(id),
      title TEXT NOT NULL,
      alias TEXT NOT NULL,
      bench_label TEXT,
      pct_since REAL,
      pct_30d REAL,
      bench_30d REAL,
      holdings_json TEXT NOT NULL,
      days_active INTEGER NOT NULL,
      ranked INTEGER NOT NULL,
      auto_label INTEGER NOT NULL,
      note TEXT,
      window_end TEXT NOT NULL,
      computed_at TEXT NOT NULL
    );
  `);
  ensureUserIdRequiredTriggers(db, LEADERBOARD_TABLES);
  ensureUserIdMatchesTakeTriggers(db, LEADERBOARD_TABLES);
  setUserVersion(db, 18);
}

function applyV19(db) {
  if (tableExists(db, 'users')) {
    if (!hasColumn(db, 'users', 'email_verified')) {
      db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1))');
    }
    if (!hasColumn(db, 'users', 'email_verified_at')) {
      db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
    }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS email_verification_tokens_user ON email_verification_tokens(user_id);
    CREATE INDEX IF NOT EXISTS email_verification_tokens_expires ON email_verification_tokens(expires_at);

    CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      template TEXT NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT NOT NULL,
      body_html TEXT,
      meta TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL CHECK(status IN ('pending','sent','failed')) DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      sent_at TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS email_outbox_status ON email_outbox(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS email_outbox_user ON email_outbox(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS email_prefs (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      trades_enabled INTEGER NOT NULL DEFAULT 0 CHECK(trades_enabled IN (0,1)),
      news_enabled INTEGER NOT NULL DEFAULT 0 CHECK(news_enabled IN (0,1)),
      threshold_asset_pct REAL NOT NULL DEFAULT 5.0,
      threshold_portfolio_pct REAL NOT NULL DEFAULT 3.0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_suppressions (
      email TEXT PRIMARY KEY,
      reason TEXT NOT NULL CHECK(reason IN ('bounce','complaint','unsubscribe')),
      created_at TEXT NOT NULL,
      meta TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS email_suppressions_created ON email_suppressions(created_at DESC);

    CREATE TABLE IF NOT EXISTS email_daily_counts (
      user_id TEXT NOT NULL REFERENCES users(id),
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id, day)
    );
    CREATE INDEX IF NOT EXISTS email_daily_counts_day ON email_daily_counts(day);
  `);
  setUserVersion(db, 19);
}

function applyV20(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_alert_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      alert_type TEXT NOT NULL CHECK(alert_type IN ('trades','pausa')),
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      event_count INTEGER NOT NULL DEFAULT 0,
      events_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK(status IN ('pending','sent','failed')) DEFAULT 'pending',
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS email_alert_groups_user_type ON email_alert_groups(user_id, alert_type, window_start);
    CREATE INDEX IF NOT EXISTS email_alert_groups_status ON email_alert_groups(status, window_end);
  `);
  setUserVersion(db, 20);
}

/** Caller must wrap in BEGIN IMMEDIATE … COMMIT / ROLLBACK. */
export function applyMultiuserMigrations(db, options = {}) {
  const version = typeof options.version === 'number' ? options.version : pragmaUserVersion(db);
  const stopAt = typeof options.stopAt === 'number' ? options.stopAt : SCHEMA_USER_VERSION;
  if (version < 9 && stopAt >= 9) applyV9(db, options);
  if (version < 10 && stopAt >= 10) applyV10(db);
  if (version < 11 && stopAt >= 11) applyV11(db);
  if (version < 12 && stopAt >= 12) applyV12(db);
  if (version < 13 && stopAt >= 13) applyV13(db);
  if (version < 14 && stopAt >= 14) applyV14(db);
  if (version < 15 && stopAt >= 15) applyV15(db);
  if (version < 16 && stopAt >= 16) applyV16(db);
  if (version < 17 && stopAt >= 17) applyV17(db);
  if (version < 18 && stopAt >= 18) applyV18(db);
  if (version < 19 && stopAt >= 19) applyV19(db);
  if (version < 20 && stopAt >= 20) applyV20(db);
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

  if (!tableExists(db, 'user_limits')) errors.push('user_limits table missing');
  else {
    const cols = columnNames(db, 'user_limits');
    for (const col of ['user_id', 'chat_per_day', 'news_per_day', 'tokens_per_day', 'monitored_takes', 'rpm', 'updated_at', 'updated_by']) {
      if (!cols.includes(col)) errors.push(`user_limits.${col} missing`);
    }
  }
  if (!tableExists(db, 'user_quota')) errors.push('user_quota table missing');
  else {
    const cols = columnNames(db, 'user_quota');
    for (const col of ['user_id', 'day', 'kind', 'units']) {
      if (!cols.includes(col)) errors.push(`user_quota.${col} missing`);
    }
  }

  if (!tableExists(db, 'ai_control')) errors.push('ai_control table missing');
  else {
    const cols = columnNames(db, 'ai_control');
    for (const col of [
      'id', 'enabled', 'monthly_cap_usd', 'daily_cap_usd',
      'alert_month', 'alert_month_80', 'alert_day', 'alert_day_80', 'updated_at', 'updated_by',
    ]) {
      if (!cols.includes(col)) errors.push(`ai_control.${col} missing`);
    }
    const row = db.prepare('SELECT COUNT(*) AS n FROM ai_control').get();
    if (row.n !== 1) errors.push(`ai_control must have exactly 1 row, has ${row.n}`);
  }

  const simulated = {};
  for (const table of SIMULATED_TABLES) {
    if (!tableExists(db, table)) {
      errors.push(`${table} table missing`);
      simulated[table] = null;
      continue;
    }
    if (!hasColumn(db, table, 'simulated')) {
      errors.push(`${table}.simulated missing`);
      simulated[table] = null;
    } else {
      if (!hasSimulatedCheck(db, table)) errors.push(`${table} missing CHECK(simulated=1)`);
      const n = simulatedNotOneCount(db, table);
      simulated[table] = n;
      if (n !== 0) errors.push(`${table}: ${n} rows with simulated<>1`);
    }
  }

  const autoNulls = {};
  for (const table of AUTO_TABLES) {
    if (!tableExists(db, table) || !hasColumn(db, table, 'user_id')) {
      autoNulls[table] = null;
      if (tableExists(db, table)) errors.push(`${table}.user_id column missing`);
      continue;
    }
    autoNulls[table] = count(db, `SELECT COUNT(*) AS n FROM ${table} WHERE user_id IS NULL`);
    if (autoNulls[table] !== 0) errors.push(`${table}: ${autoNulls[table]} rows with user_id NULL`);
  }

  if (tableExists(db, 'users')) {
    if (!hasColumn(db, 'users', 'google_sub')) errors.push('users.google_sub missing');
    if (!hasColumn(db, 'users', 'google_linked_at')) errors.push('users.google_linked_at missing');
    const googleIdx = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='users_google_sub'",
    ).get();
    if (!googleIdx) errors.push('users_google_sub index missing');
  } else {
    errors.push('users table missing');
  }

  if (!tableExists(db, 'password_resets')) errors.push('password_resets missing');
  else {
    const cols = columnNames(db, 'password_resets');
    for (const col of ['token_hash', 'user_id', 'created_by', 'source', 'created_at', 'expires_at', 'used_at']) {
      if (!cols.includes(col)) errors.push(`password_resets.${col} missing`);
    }
  }

  if (tableExists(db, 'auto_policies')) {
    const cols = columnNames(db, 'auto_policies');
    for (const col of [
      'take_id', 'user_id', 'enabled', 'simulated', 'news_trigger', 'max_trades_day',
      'max_turnover_pct', 'max_trades_day_user', 'broken_action', 'undo_at',
      'undo_window_hours', 'canary_owner_only', 'arm_state', 'consent_version', 'news_consent_version',
    ]) {
      if (!cols.includes(col)) errors.push(`auto_policies.${col} missing`);
    }
    const sql = tableSql(db, 'auto_policies');
    if (!sql.includes(`DEFAULT ${AUTO_NEWS_TRIGGER_DEFAULT}`)) errors.push('auto_policies.news_trigger default missing');
    if (!sql.includes(`DEFAULT ${AUTO_MAX_TRADES_DAY}`)) errors.push('auto_policies.max_trades_day default missing');
    if (!sql.includes(`DEFAULT ${AUTO_MAX_TURNOVER_PCT}`)) errors.push('auto_policies.max_turnover_pct default missing');
    if (!sql.includes(`DEFAULT ${AUTO_MAX_TRADES_DAY_USER}`)) errors.push('auto_policies.max_trades_day_user default missing');
    if (!sql.includes(AUTO_BROKEN_ACTION)) errors.push('auto_policies.broken_action default missing');
    if (!sql.includes(AUTO_UNDO_AT)) errors.push('auto_policies.undo_at default missing');
    if (!sql.includes(`DEFAULT ${AUTO_UNDO_WINDOW_HOURS}`)) errors.push('auto_policies.undo_window_hours default missing');
    if (!sql.includes(`DEFAULT ${AUTO_CANARY_OWNER_ONLY_DEFAULT}`)) errors.push('auto_policies.canary_owner_only default missing');
  }

  if (tableExists(db, 'takes')) {
    for (const col of ['is_public', 'public_id', 'public_since']) {
      if (!hasColumn(db, 'takes', col)) errors.push(`takes.${col} missing`);
    }
    const isPublic = db.prepare("PRAGMA table_info(takes)").all().find(col => col.name === 'is_public');
    if (isPublic) {
      if (!isPublic.notnull) errors.push('takes.is_public must be NOT NULL');
      if (String(isPublic.dflt_value) !== '0') errors.push('takes.is_public default must be 0');
    }
    if (!db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='takes_public_id'").get()) {
      errors.push('takes_public_id index missing');
    }
  }

  if (tableExists(db, 'users')) {
    if (!hasColumn(db, 'users', 'public_alias')) errors.push('users.public_alias missing');
    if (!db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='users_public_alias'").get()) {
      errors.push('users_public_alias index missing');
    }
  }

  if (!tableExists(db, 'take_daily_marks')) errors.push('take_daily_marks table missing');
  else {
    const cols = columnNames(db, 'take_daily_marks');
    for (const col of TAKE_DAILY_MARKS_COLUMNS) {
      if (!cols.includes(col)) errors.push(`take_daily_marks.${col} missing`);
    }
  }
  if (!tableExists(db, 'public_take_stats')) errors.push('public_take_stats table missing');
  else {
    const cols = columnNames(db, 'public_take_stats');
    for (const col of PUBLIC_TAKE_STATS_COLUMNS) {
      if (!cols.includes(col)) errors.push(`public_take_stats.${col} missing`);
    }
  }

  const leaderboardNulls = {};
  for (const table of LEADERBOARD_TABLES) {
    if (!tableExists(db, table) || !hasColumn(db, table, 'user_id')) {
      leaderboardNulls[table] = null;
      if (tableExists(db, table)) errors.push(`${table}.user_id column missing`);
      continue;
    }
    leaderboardNulls[table] = count(db, `SELECT COUNT(*) AS n FROM ${table} WHERE user_id IS NULL`);
    if (leaderboardNulls[table] !== 0) errors.push(`${table}: ${leaderboardNulls[table]} rows with user_id NULL`);
    for (const suffix of [
      'user_id_required_insert', 'user_id_required_update',
      'user_id_matches_take_insert', 'user_id_matches_take_update',
    ]) {
      const name = `${table}_${suffix}`;
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name)) {
        errors.push(`${name} trigger missing`);
      }
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
    autoNullUserIds: autoNulls,
    leaderboardNullUserIds: leaderboardNulls,
    simulated,
    opsChecksum: opsChecksum(db),
    integrity,
    foreignKeyViolations: fkRows.length,
    globalHasUserId,
    errors,
  };
}

export function verifyMigration(db) {
  const report = inspectMigration(db);
  if (!report.ok) throw new Error(`verifyMigration failed: ${report.errors.join('; ')}`);
  return report;
}
