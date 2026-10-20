import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createStore} from '../lib/store.mjs';
import {createTake, activate, templates} from '../lib/engine.mjs';
import {hashPassword, verifyPassword} from '../lib/password.mjs';
import {
  SCHEMA_USER_VERSION, DEFAULT_OWNER_EMAIL, USER_SCOPED_TABLES, CHILD_TABLES, GLOBAL_TABLES,
  AUTO_TABLES, SIMULATED_TABLES, inspectMigration, opsChecksum, ownerUserId, normalizeEmail,
  applyMultiuserMigrations,
} from '../lib/migrations/multiuser.mjs';
import {
  AUTO_NEWS_TRIGGER_DEFAULT, AUTO_MAX_TRADES_DAY, AUTO_MAX_TURNOVER_PCT,
  AUTO_MAX_TRADES_DAY_USER, AUTO_BROKEN_ACTION, AUTO_UNDO_AT,
  AUTO_UNDO_WINDOW_HOURS, AUTO_CANARY_OWNER_ONLY_DEFAULT,
} from '../lib/auto/constants.mjs';
import {MODEL_PRICES_KEY, KNOWN_MODEL_IDS, USAGE_KINDS} from '../lib/usage.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'mu-'));
}

function withEnv(vars, fn) {
  const prev = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    if (vars[key] == null) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try { return fn(); }
  finally {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

const V8_DDL = `
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
    id TEXT PRIMARY KEY, version INTEGER NOT NULL UNIQUE, body TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    who TEXT NOT NULL DEFAULT 'admin', source TEXT NOT NULL, created_at TEXT NOT NULL, char_count INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ops(
    id TEXT PRIMARY KEY, take_id TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL, ticker TEXT, units INTEGER,
    amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'ARS', price REAL, quote_as_of TEXT, quote_provider TEXT,
    quote_class TEXT NOT NULL, quote_eligible INTEGER NOT NULL, quote_stale INTEGER NOT NULL DEFAULT 0,
    parent_id TEXT, batch_id TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '', meta TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ops_take_at ON ops(take_id, at, id);
  CREATE INDEX IF NOT EXISTS ops_batch ON ops(batch_id);
  CREATE TABLE IF NOT EXISTS orders(
    id TEXT PRIMARY KEY, take_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, take_version INTEGER NOT NULL,
    payload TEXT NOT NULL, preview TEXT NOT NULL, fingerprint TEXT NOT NULL, idempotency_key TEXT UNIQUE,
    created_at TEXT NOT NULL, confirmed_at TEXT, cancelled_at TEXT
  );
  CREATE INDEX IF NOT EXISTS orders_take ON orders(take_id, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS one_pending_order ON orders(take_id) WHERE status='pending';
  CREATE TABLE IF NOT EXISTS news_feeds(
    id TEXT PRIMARY KEY, label TEXT NOT NULL, url TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_ok_at TEXT, last_error TEXT, last_probe_at TEXT,
    etag TEXT, last_modified TEXT
  );
  CREATE INDEX IF NOT EXISTS news_feeds_updated ON news_feeds(updated_at DESC);
  PRAGMA user_version=8;
`;

function seedV8Shape(db) {
  const take = createTake(templates[0]);
  activate(take, 1_000_000);
  const chat = {id: randomUUID(), messages: [{role: 'user', content: 'idea propia del owner'}], proposal: null};
  db.prepare('INSERT INTO takes(id,data) VALUES (?,?)').run(take.id, JSON.stringify(take));
  db.prepare('INSERT INTO chats(id,data) VALUES (?,?)').run(chat.id, JSON.stringify(chat));
  db.prepare('INSERT INTO versions(id,take_id,version,data) VALUES (?,?,?,?)')
    .run('ver-1', take.id, 1, JSON.stringify({id: 'ver-1', takeId: take.id, version: 1, thesis: take.thesis}));
  db.prepare('INSERT INTO reviews(id,take_id,data) VALUES (?,?,?)')
    .run('rev-1', take.id, JSON.stringify({id: 'rev-1', takeId: take.id, summary: 'solo del owner'}));
  db.prepare('INSERT INTO jobs(id,take_id,status,data) VALUES (?,?,?,?)')
    .run('job-1', take.id, 'queued', JSON.stringify({id: 'job-1', takeId: take.id, status: 'queued'}));
  db.prepare(`INSERT INTO ops(id,take_id,kind,at,amount,currency,quote_class,quote_eligible,quote_stale,batch_id,idempotency_key,fingerprint,note,meta,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'op-1', take.id, 'aporte', '2026-01-02T00:00:00.000Z', 1000, 'ARS', 'missing', 0, 0,
    'batch-1', 'idem-1', 'fp-1', '', '{}', '2026-01-02T00:00:00.000Z',
  );
  db.prepare(`INSERT INTO orders(id,take_id,kind,status,take_version,payload,preview,fingerprint,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run('ord-1', take.id, 'aporte', 'pending', 1, '{}', '{}', 'fp-o', '2026-01-02T00:00:00.000Z');
  db.prepare('INSERT INTO quote_cache(ticker,price,as_of,provider,stale) VALUES (?,?,?,?,?)')
    .run('GGAL', 100, '2026-01-02T00:00:00.000Z', 'data912', 0);
  db.prepare('INSERT INTO consumption(day,kind,calls) VALUES (?,?,?)').run('2026-01-02', 'chat', 3);
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run('proposal:chat-x:hash', JSON.stringify({takeId: take.id}));
  db.prepare('INSERT INTO news_feeds(id,label,url,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run('feed-1', 'Test', 'https://example.test/rss', 1, '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
  db.prepare('INSERT INTO idempotency(key,fingerprint,data) VALUES (?,?,?)').run('POST:/api/takes:k', 'fp', '{}');
  return {take, chat};
}

function writeV8Db(dir) {
  const db = new DatabaseSync(join(dir, 'tesis.sqlite'));
  db.exec(V8_DDL);
  const seeded = seedV8Shape(db);
  const checksum = opsChecksum(db);
  const counts = Object.fromEntries(USER_SCOPED_TABLES.map(table => {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    return [table, n];
  }));
  db.close();
  return {checksum, counts, ...seeded};
}

function insertUser(db, {id = randomUUID(), email}) {
  db.prepare(`INSERT INTO users(id,email,display_name,role,status,password_hash,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(id, email, 'Other', 'user', 'active', '', new Date().toISOString());
  return id;
}

test('scrypt hash verifies and does not treat empty as a match', () => {
  const password = 'owner-keeps-this-12';
  const stored = hashPassword(password);
  assert.equal(stored.startsWith('scrypt$'), true);
  assert.equal(verifyPassword(password, stored), true);
  assert.equal(verifyPassword('wrong-password-12', stored), false);
  assert.equal(hashPassword(''), '');
  assert.equal(verifyPassword('', ''), false);
});

test('fresh store lands on current schema with owner superadmin and no NULL user_id', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir, {ownerEmail: 'Diego@diegodella.ar'});
    assert.equal(store.userVersion(), SCHEMA_USER_VERSION);
    const report = inspectMigration(store.db);
    assert.equal(report.ok, true, report.errors.join('; '));
    assert.equal(report.ownerEmail, DEFAULT_OWNER_EMAIL);
    assert.equal(report.ownerRole, 'superadmin');
    assert.equal(report.ownerStatus, 'active');
    assert.equal(store.ownerUserId(), report.ownerUserId);
    for (const table of USER_SCOPED_TABLES) assert.equal(report.nullUserIds[table], 0);
    for (const table of GLOBAL_TABLES) assert.equal(report.globalHasUserId[table], false);
    const usageCols = store.db.prepare('PRAGMA table_info(user_usage)').all().map(c => c.name);
    assert.deepEqual(usageCols, ['user_id', 'day', 'kind', 'calls', 'prompt_tokens', 'completion_tokens', 'est_cost_micro']);
    const limitCols = store.db.prepare('PRAGMA table_info(user_limits)').all().map(c => c.name);
    assert.deepEqual(limitCols, ['user_id', 'chat_per_day', 'news_per_day', 'tokens_per_day', 'monitored_takes', 'rpm', 'updated_at', 'updated_by']);
    const quotaCols = store.db.prepare('PRAGMA table_info(user_quota)').all().map(c => c.name);
    assert.deepEqual(quotaCols, ['user_id', 'day', 'kind', 'units']);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM user_limits').get().n, 0);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM user_quota').get().n, 0);
    const aiCols = store.db.prepare('PRAGMA table_info(ai_control)').all().map(c => c.name);
    assert.ok(aiCols.includes('enabled') && aiCols.includes('monthly_cap_usd'));
    const ai = store.db.prepare('SELECT * FROM ai_control WHERE id=1').get();
    assert.equal(ai.enabled, 1);
    assert.equal(ai.monthly_cap_usd, 20);
    assert.equal(ai.daily_cap_usd, null);
    for (const table of AUTO_TABLES) {
      assert.equal(store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
      assert.equal(report.autoNullUserIds[table], 0, table);
    }
    for (const table of SIMULATED_TABLES) assert.equal(report.simulated[table], 0, table);
    const policyCols = store.db.prepare('PRAGMA table_info(auto_policies)').all().map(c => c.name);
    assert.ok(policyCols.includes('news_trigger') && policyCols.includes('canary_owner_only'));
    assert.ok(policyCols.includes('max_trades_day_user') && policyCols.includes('broken_action'));
    const policySql = store.db.prepare("SELECT sql FROM sqlite_master WHERE name='auto_policies'").get().sql;
    assert.ok(policySql.includes(`DEFAULT ${AUTO_NEWS_TRIGGER_DEFAULT}`));
    assert.ok(policySql.includes(`DEFAULT ${AUTO_MAX_TRADES_DAY}`));
    assert.ok(policySql.includes(`DEFAULT ${AUTO_MAX_TURNOVER_PCT}`));
    assert.ok(policySql.includes(`DEFAULT ${AUTO_MAX_TRADES_DAY_USER}`));
    assert.ok(policySql.includes(AUTO_BROKEN_ACTION));
    assert.ok(policySql.includes(AUTO_UNDO_AT));
    assert.ok(policySql.includes(`DEFAULT ${AUTO_UNDO_WINDOW_HOURS}`));
    assert.ok(policySql.includes(`DEFAULT ${AUTO_CANARY_OWNER_ONLY_DEFAULT}`));
    const prices = JSON.parse(store.db.prepare('SELECT value FROM settings WHERE key=?').get(MODEL_PRICES_KEY).value);
    for (const id of KNOWN_MODEL_IDS) {
      assert.equal(id in prices.models, true);
      assert.equal(prices.models[id].promptUsdPerMTok, null);
      assert.equal(prices.models[id].completionUsdPerMTok, null);
    }
    for (const kind of USAGE_KINDS) assert.equal(typeof kind, 'string');
    const userCols = store.db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    assert.ok(userCols.includes('google_sub') && userCols.includes('google_linked_at'));
    assert.ok(store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='users_google_sub'").get());
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('v8 real-shaped fixture migrates with identical counts and ops checksum', () => {
  const dir = tmp();
  let store;
  try {
    const before = writeV8Db(dir);
    store = createStore(dir);
    const report = inspectMigration(store.db);
    assert.equal(report.ok, true, report.errors.join('; '));
    assert.equal(report.opsChecksum, before.checksum);
    for (const table of USER_SCOPED_TABLES) assert.equal(report.counts[table], before.counts[table], table);
    const ownerId = store.ownerUserId();
    for (const table of USER_SCOPED_TABLES) {
      const n = store.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).get(ownerId).n;
      assert.equal(n, before.counts[table], `${table} owned by owner`);
    }
    const takeJson = JSON.parse(store.db.prepare('SELECT data FROM takes WHERE id=?').get(before.take.id).data);
    assert.equal('user_id' in takeJson, false);
    assert.equal(store.take(before.take.id).thesis, before.take.thesis);
    assert.equal(store.chat(before.chat.id).messages[0].content, 'idea propia del owner');
    assert.equal(store.setting('proposal:chat-x:hash').takeId, before.take.id);
    assert.equal(store.db.prepare('SELECT calls FROM consumption WHERE day=? AND kind=?').get('2026-01-02', 'chat').calls, 3);
    assert.equal(store.db.prepare('SELECT price FROM quote_cache WHERE ticker=?').get('GGAL').price, 100);
    assert.equal(store.listNewsFeeds().length, 1);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('migration is idempotent: second open keeps owner, counts and checksum', () => {
  const dir = tmp();
  let first, second;
  try {
    writeV8Db(dir);
    first = createStore(dir);
    const snap = {
      owner: first.ownerUserId(),
      checksum: opsChecksum(first.db),
      report: inspectMigration(first.db),
    };
    first.close();
    first = null;
    second = createStore(dir);
    assert.equal(second.userVersion(), SCHEMA_USER_VERSION);
    assert.equal(second.ownerUserId(), snap.owner);
    assert.equal(opsChecksum(second.db), snap.checksum);
    const again = inspectMigration(second.db);
    assert.equal(again.ok, true);
    assert.deepEqual(again.counts, snap.report.counts);
  } finally {
    first?.close();
    second?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('failed v9 rolls back and leaves user_version at 8', () => {
  const dir = tmp();
  const path = join(dir, 'tesis.sqlite');
  const db = new DatabaseSync(path);
  db.exec(V8_DDL);
  db.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY, email TEXT, display_name TEXT, role TEXT, status TEXT,
    password_hash TEXT, created_at TEXT, last_login_at TEXT, legal_accepted_at TEXT,
    legal_accepted_version TEXT, CHECK(0)
  )`);
  db.close();
  assert.throws(() => createStore(dir));
  const after = new DatabaseSync(path);
  try {
    assert.equal(after.prepare('PRAGMA user_version').get().user_version, 8);
    assert.equal(after.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'").get(), undefined);
    assert.equal(after.prepare("SELECT value FROM meta WHERE key='ownerUserId'").get(), undefined);
  } finally {
    after.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('store writes stamp owner user_id; omitting user_id is rejected by triggers', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const ownerId = store.ownerUserId();
    const take = createTake(templates[1]);
    store.putTake(take);
    store.version(take);
    store.putChat({id: 'c1', messages: []});
    store.putReview({id: 'r1', takeId: take.id, summary: 'x'});
    store.putJob({id: 'j1', takeId: take.id, status: 'queued'});
    store.insertOp({
      id: 'op-n', takeId: take.id, kind: 'aporte', at: '2026-01-03T00:00:00.000Z',
      ticker: null, units: null, amount: 1, currency: 'ARS', price: null,
      quoteAsOf: null, quoteProvider: null, quoteClass: 'missing', quoteEligible: 0, quoteStale: 0,
      parentId: null, batchId: 'b', idempotencyKey: 'k-n', fingerprint: 'f', note: '', meta: {},
      createdAt: '2026-01-03T00:00:00.000Z',
    });
    store.insertOrder({
      id: 'ord-n', takeId: take.id, kind: 'aporte', status: 'pending', takeVersion: 1,
      payload: {}, preview: {}, fingerprint: 'f', idempotencyKey: null,
      createdAt: '2026-01-03T00:00:00.000Z',
    });
    for (const table of USER_SCOPED_TABLES) {
      const n = store.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id IS NULL`).get().n;
      assert.equal(n, 0, table);
    }
    assert.equal(store.db.prepare('SELECT user_id FROM takes WHERE id=?').get(take.id).user_id, ownerId);
    const blob = JSON.parse(store.db.prepare('SELECT data FROM takes WHERE id=?').get(take.id).data);
    assert.equal('user_id' in blob, false);
    assert.throws(
      () => store.db.prepare('INSERT INTO takes(id,data) VALUES (?,?)').run('legacy-write', JSON.stringify({id: 'legacy-write'})),
      /takes\.user_id is required/,
    );
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('triggers reject NULL user_id and child rows that do not match the take owner', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const ownerId = store.ownerUserId();
    const take = createTake(templates[0]);
    store.putTake(take);
    const other = insertUser(store.db, {email: 'b@example.test'});
    const otherTake = 'take-b';
    store.db.prepare('INSERT INTO takes(id,data,user_id) VALUES (?,?,?)')
      .run(otherTake, JSON.stringify({id: otherTake}), other);

    assert.throws(
      () => store.db.prepare('INSERT INTO takes(id,data,user_id) VALUES (?,?,?)').run('t-null', '{}', null),
      /takes\.user_id is required/,
    );
    assert.throws(
      () => store.db.prepare('UPDATE takes SET user_id=NULL WHERE id=?').run(take.id),
      /takes\.user_id is required/,
    );
    for (const table of CHILD_TABLES) {
      const rowId = `bad-${table}`;
      const sql = table === 'versions'
        ? 'INSERT INTO versions(id,take_id,version,data,user_id) VALUES (?,?,?,?,?)'
        : table === 'jobs'
          ? 'INSERT INTO jobs(id,take_id,status,data,user_id) VALUES (?,?,?,?,?)'
          : table === 'ops'
            ? `INSERT INTO ops(id,take_id,kind,at,amount,quote_class,quote_eligible,batch_id,idempotency_key,fingerprint,created_at,user_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
            : table === 'orders'
              ? 'INSERT INTO orders(id,take_id,kind,status,take_version,payload,preview,fingerprint,created_at,user_id) VALUES (?,?,?,?,?,?,?,?,?,?)'
              : 'INSERT INTO reviews(id,take_id,data,user_id) VALUES (?,?,?,?)';
      const params = table === 'versions' ? [rowId, take.id, 99, '{}', other]
        : table === 'jobs' ? [rowId, take.id, 'queued', '{}', other]
        : table === 'ops' ? [rowId, take.id, 'aporte', '2026-01-04T00:00:00.000Z', 1, 'missing', 0, 'bx', rowId, 'f', '2026-01-04T00:00:00.000Z', other]
        : table === 'orders' ? [rowId, take.id, 'aporte', 'pending', 1, '{}', '{}', 'f', '2026-01-04T00:00:00.000Z', other]
        : [rowId, take.id, '{}', other];
      assert.throws(() => store.db.prepare(sql).run(...params), /must match takes\.user_id/, table);
    }

    store.db.prepare('INSERT INTO chats(id,data,user_id) VALUES (?,?,?)').run('chat-b', '{}', other);
    const ownerTakes = store.db.prepare('SELECT id FROM takes WHERE user_id=?').all(ownerId).map(r => r.id);
    const otherTakes = store.db.prepare('SELECT id FROM takes WHERE user_id=?').all(other).map(r => r.id);
    assert.equal(ownerTakes.includes(take.id), true);
    assert.equal(ownerTakes.includes(otherTake), false);
    assert.deepEqual(otherTakes, [otherTake]);
    const ownerChats = new Set(store.db.prepare('SELECT id FROM chats WHERE user_id=?').all(ownerId).map(r => r.id));
    const otherChats = new Set(store.db.prepare('SELECT id FROM chats WHERE user_id=?').all(other).map(r => r.id));
    assert.equal(ownerChats.has('chat-b'), false);
    assert.equal(otherChats.has('chat-b'), true);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM ops WHERE take_id=?').get(take.id).n, 0);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('owner password is hashed from APP_PASSWORD_FILE without changing it; secrets stay off stdout', () => {
  const dir = tmp();
  const password = 'keep-current-pw-12';
  const passwordFile = join(dir, 'app-password');
  writeFileSync(passwordFile, `${password}\n`, {encoding: 'utf8', mode: 0o600});
  let store;
  try {
    store = withEnv({
      APP_PASSWORD_FILE: passwordFile,
      APP_PASSWORD: undefined,
      OWNER_EMAIL: 'Diego@diegodella.ar',
    }, () => createStore(dir));
    const row = store.db.prepare('SELECT email, role, password_hash FROM users WHERE id=?').get(store.ownerUserId());
    assert.equal(row.email, normalizeEmail('Diego@diegodella.ar'));
    assert.equal(row.role, 'superadmin');
    assert.equal(verifyPassword(password, row.password_hash), true);
    const check = spawnSync(process.execPath, [resolve('scripts/migrate-check.mjs'), join(dir, 'tesis.sqlite')], {encoding: 'utf8'});
    assert.equal(check.status, 0, check.stderr);
    assert.equal(check.stdout.includes(password), false);
    assert.equal(check.stdout.includes(row.password_hash), false);
    const report = JSON.parse(check.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.ownerHasPasswordHash, true);
    assert.equal(report.userVersion, SCHEMA_USER_VERSION);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('one_pending_order remains per take across users', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const ownerId = store.ownerUserId();
    const other = insertUser(store.db, {email: 'c@example.test'});
    store.db.prepare('INSERT INTO takes(id,data,user_id) VALUES (?,?,?)').run('t-a', '{}', ownerId);
    store.db.prepare('INSERT INTO takes(id,data,user_id) VALUES (?,?,?)').run('t-b', '{}', other);
    const orderSql = `INSERT INTO orders(id,take_id,kind,status,take_version,payload,preview,fingerprint,created_at,user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`;
    store.db.prepare(orderSql).run('oa', 't-a', 'aporte', 'pending', 1, '{}', '{}', 'f', '2026-01-05T00:00:00.000Z', ownerId);
    store.db.prepare(orderSql).run('ob', 't-b', 'aporte', 'pending', 1, '{}', '{}', 'f', '2026-01-05T00:00:00.000Z', other);
    assert.throws(() => store.db.prepare(orderSql).run(
      'oa2', 't-a', 'aporte', 'pending', 1, '{}', '{}', 'f', '2026-01-05T00:00:00.000Z', ownerId,
    ));
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('v11 fixture migrates additively to current schema without touching consumption', () => {
  const dir = tmp();
  let store;
  const path = join(dir, 'tesis.sqlite');
  const db = new DatabaseSync(path);
  db.exec(V8_DDL);
  seedV8Shape(db);
  db.exec('BEGIN IMMEDIATE');
  applyMultiuserMigrations(db, {
    version: 8, stopAt: 11, ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12',
  });
  db.exec('COMMIT');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 11);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_usage'").get(), undefined);
  assert.equal(db.prepare('SELECT calls FROM consumption WHERE day=? AND kind=?').get('2026-01-02', 'chat').calls, 3);
  db.close();
  try {
    store = createStore(dir);
    assert.equal(store.userVersion(), SCHEMA_USER_VERSION);
    const report = inspectMigration(store.db);
    assert.equal(report.ok, true, report.errors.join('; '));
    assert.equal(store.db.prepare('SELECT calls FROM consumption WHERE day=? AND kind=?').get('2026-01-02', 'chat').calls, 3);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM user_usage').get().n, 0);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM user_limits').get().n, 0);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM user_quota').get().n, 0);
    assert.equal(store.db.prepare('SELECT enabled FROM ai_control WHERE id=1').get().enabled, 1);
    const prices = store.modelPrices();
    assert.equal(KNOWN_MODEL_IDS[0] in prices.models, true);
    store.close();
    store = null;
    const again = createStore(dir);
    assert.equal(again.userVersion(), SCHEMA_USER_VERSION);
    assert.equal(again.db.prepare('SELECT COUNT(*) AS n FROM user_usage').get().n, 0);
    assert.equal(again.db.prepare('SELECT COUNT(*) AS n FROM user_quota').get().n, 0);
    again.close();
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('failed v12 rolls back and leaves user_version at 11', () => {
  const dir = tmp();
  const path = join(dir, 'tesis.sqlite');
  const db = new DatabaseSync(path);
  db.exec(V8_DDL);
  seedV8Shape(db);
  db.exec('BEGIN IMMEDIATE');
  applyMultiuserMigrations(db, {
    version: 8, stopAt: 11, ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12',
  });
  db.exec('COMMIT');
  db.exec('CREATE TABLE user_usage (foo TEXT)');
  db.close();
  assert.throws(() => createStore(dir));
  const after = new DatabaseSync(path);
  try {
    assert.equal(after.prepare('PRAGMA user_version').get().user_version, 11);
    assert.equal(after.prepare('SELECT sql FROM sqlite_master WHERE name=?').get('user_usage').sql.includes('foo'), true);
    assert.equal(after.prepare('SELECT calls FROM consumption WHERE day=? AND kind=?').get('2026-01-02', 'chat').calls, 3);
  } finally {
    after.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('v12 fixture migrates additively to current schema without touching user_usage', () => {
  const dir = tmp();
  let store;
  const path = join(dir, 'tesis.sqlite');
  const db = new DatabaseSync(path);
  db.exec(V8_DDL);
  seedV8Shape(db);
  db.exec('BEGIN IMMEDIATE');
  applyMultiuserMigrations(db, {
    version: 8, stopAt: 12, ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12',
  });
  db.exec('COMMIT');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 12);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_limits'").get(), undefined);
  db.prepare('INSERT INTO user_usage(user_id, day, kind, calls, prompt_tokens, completion_tokens, est_cost_micro) VALUES (?,?,?,?,?,?,?)')
    .run(ownerUserId(db), '2026-10-18', 'chat', 2, 10, 4, 0);
  db.close();
  try {
    store = createStore(dir);
    assert.equal(store.userVersion(), SCHEMA_USER_VERSION);
    const report = inspectMigration(store.db);
    assert.equal(report.ok, true, report.errors.join('; '));
    assert.equal(store.db.prepare('SELECT calls FROM user_usage WHERE kind=?').get('chat').calls, 2);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM user_limits').get().n, 0);
    store.close();
    store = null;
    const again = createStore(dir);
    assert.equal(again.userVersion(), SCHEMA_USER_VERSION);
    assert.equal(again.db.prepare('SELECT calls FROM user_usage WHERE kind=?').get('chat').calls, 2);
    again.close();
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('failed v13 rolls back and leaves user_version at 12', () => {
  const dir = tmp();
  const path = join(dir, 'tesis.sqlite');
  const db = new DatabaseSync(path);
  db.exec(V8_DDL);
  seedV8Shape(db);
  db.exec('BEGIN IMMEDIATE');
  applyMultiuserMigrations(db, {
    version: 8, stopAt: 12, ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12',
  });
  db.exec('COMMIT');
  db.exec('CREATE TABLE user_quota (foo TEXT)');
  db.close();
  assert.throws(() => createStore(dir));
  const after = new DatabaseSync(path);
  try {
    assert.equal(after.prepare('PRAGMA user_version').get().user_version, 12);
    assert.equal(after.prepare('SELECT sql FROM sqlite_master WHERE name=?').get('user_quota').sql.includes('foo'), true);
    assert.equal(after.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_usage'").get() != null, true);
  } finally {
    after.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('v13 fixture migrates additively to current schema without touching quotas', () => {
  const dir = tmp();
  let store;
  const path = join(dir, 'tesis.sqlite');
  const db = new DatabaseSync(path);
  db.exec(V8_DDL);
  seedV8Shape(db);
  db.exec('BEGIN IMMEDIATE');
  applyMultiuserMigrations(db, {
    version: 8, stopAt: 13, ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12',
  });
  db.exec('COMMIT');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 13);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_control'").get(), undefined);
  db.prepare('INSERT INTO user_quota(user_id, day, kind, units) VALUES (?,?,?,?)')
    .run(ownerUserId(db), '2026-10-18', 'chat', 4);
  db.close();
  try {
    store = createStore(dir);
    assert.equal(store.userVersion(), SCHEMA_USER_VERSION);
    const report = inspectMigration(store.db);
    assert.equal(report.ok, true, report.errors.join('; '));
    assert.equal(store.db.prepare('SELECT units FROM user_quota WHERE kind=?').get('chat').units, 4);
    assert.equal(store.aiControl().enabled, true);
    assert.equal(store.aiControl().monthlyCapUsd, 20);
    store.close();
    store = null;
    const again = createStore(dir);
    assert.equal(again.userVersion(), SCHEMA_USER_VERSION);
    assert.equal(again.db.prepare('SELECT units FROM user_quota WHERE kind=?').get('chat').units, 4);
    assert.equal(again.db.prepare('SELECT COUNT(*) AS n FROM ai_control').get().n, 1);
    again.close();
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('failed v14 rolls back and leaves user_version at 13', () => {
  const dir = tmp();
  const path = join(dir, 'tesis.sqlite');
  const db = new DatabaseSync(path);
  db.exec(V8_DDL);
  seedV8Shape(db);
  db.exec('BEGIN IMMEDIATE');
  applyMultiuserMigrations(db, {
    version: 8, stopAt: 13, ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12',
  });
  db.exec('COMMIT');
  db.exec('CREATE TABLE ai_control (foo TEXT)');
  db.close();
  assert.throws(() => createStore(dir));
  const after = new DatabaseSync(path);
  try {
    assert.equal(after.prepare('PRAGMA user_version').get().user_version, 13);
    assert.equal(after.prepare('SELECT sql FROM sqlite_master WHERE name=?').get('ai_control').sql.includes('foo'), true);
    assert.equal(after.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_quota'").get() != null, true);
  } finally {
    after.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('v14 real-shaped fixture migrates to current schema preserving counts and is idempotent', () => {
  const dir = tmp();
  let store;
  const path = join(dir, 'tesis.sqlite');
  const db = new DatabaseSync(path);
  db.exec(V8_DDL);
  const seeded = seedV8Shape(db);
  db.exec('BEGIN IMMEDIATE');
  applyMultiuserMigrations(db, {
    version: 8, stopAt: 14, ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12',
  });
  db.exec('COMMIT');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 14);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='auto_policies'").get(), undefined);
  const ownerId = ownerUserId(db);
  db.prepare(`INSERT INTO ops(id,take_id,kind,at,amount,quote_class,quote_eligible,batch_id,idempotency_key,fingerprint,created_at,user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'op-v14', seeded.take.id, 'aporte', '2026-10-19T00:00:00.000Z', 2500, 'missing', 0,
    'batch-v14', 'idem-v14', 'fp-v14', '2026-10-19T00:00:00.000Z', ownerId,
  );
  db.prepare(`INSERT INTO orders(id,take_id,kind,status,take_version,payload,preview,fingerprint,created_at,user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    'ord-v14', seeded.take.id, 'retiro', 'cancelled', 1, '{}', '{}', 'fp-v14o',
    '2026-10-19T00:00:00.000Z', ownerId,
  );
  const before = {
    checksum: opsChecksum(db),
    counts: Object.fromEntries(USER_SCOPED_TABLES.map(table => {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      return [table, n];
    })),
  };
  db.close();
  try {
    store = createStore(dir);
    assert.equal(store.userVersion(), SCHEMA_USER_VERSION);
    const report = inspectMigration(store.db);
    assert.equal(report.ok, true, report.errors.join('; '));
    assert.equal(report.opsChecksum, before.checksum);
    for (const table of USER_SCOPED_TABLES) {
      assert.equal(report.counts[table], before.counts[table], table);
    }
    for (const table of SIMULATED_TABLES) assert.equal(report.simulated[table], 0, table);
    assert.equal(store.db.prepare('SELECT simulated FROM ops WHERE id=?').get('op-v14').simulated, 1);
    assert.equal(store.db.prepare('SELECT simulated FROM orders WHERE id=?').get('ord-v14').simulated, 1);
    for (const table of AUTO_TABLES) {
      assert.equal(store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
    }
    store.close();
    store = null;
    const again = createStore(dir);
    assert.equal(again.userVersion(), SCHEMA_USER_VERSION);
    const second = inspectMigration(again.db);
    assert.equal(second.ok, true, second.errors.join('; '));
    assert.equal(second.opsChecksum, before.checksum);
    assert.deepEqual(second.counts, before.counts);
    again.close();
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('failed v15 rolls back and leaves user_version at 14', () => {
  const dir = tmp();
  const path = join(dir, 'tesis.sqlite');
  const db = new DatabaseSync(path);
  db.exec(V8_DDL);
  seedV8Shape(db);
  db.exec('BEGIN IMMEDIATE');
  applyMultiuserMigrations(db, {
    version: 8, stopAt: 14, ownerEmail: DEFAULT_OWNER_EMAIL, ownerPassword: 'owner-keeps-this-12',
  });
  db.exec('COMMIT');
  db.exec('CREATE TABLE auto_policies (foo TEXT)');
  db.close();
  assert.throws(() => createStore(dir));
  const after = new DatabaseSync(path);
  try {
    assert.equal(after.prepare('PRAGMA user_version').get().user_version, 14);
    assert.equal(after.prepare('SELECT sql FROM sqlite_master WHERE name=?').get('auto_policies').sql.includes('foo'), true);
    assert.equal(after.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='auto_signals'").get(), undefined);
    assert.equal(after.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_control'").get() != null, true);
  } finally {
    after.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

