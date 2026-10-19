import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createStore} from '../lib/store.mjs';
import {createTake, templates} from '../lib/engine.mjs';
import {SIMULATED_ONLY, simulatedBit} from '../lib/auto/sim-only.mjs';
import {
  AUTO_NEWS_TRIGGER_DEFAULT, AUTO_MAX_TRADES_DAY, AUTO_MAX_TURNOVER_PCT,
  AUTO_MAX_TRADES_DAY_USER, AUTO_BROKEN_ACTION, AUTO_UNDO_AT,
  AUTO_UNDO_WINDOW_HOURS, AUTO_CANARY_OWNER_ONLY_DEFAULT,
} from '../lib/auto/constants.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'au1-'));
}

function insertUser(db, {id = randomUUID(), email}) {
  db.prepare(`INSERT INTO users(id,email,display_name,role,status,password_hash,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(id, email, 'Other', 'user', 'active', '', new Date().toISOString());
  return id;
}

function simError(fn) {
  assert.throws(fn, /CHECK constraint failed/);
}

test('SIMULATED_ONLY is frozen true and simulatedBit is 1', () => {
  assert.equal(SIMULATED_ONLY.value, true);
  assert.equal(Object.isFrozen(SIMULATED_ONLY), true);
  assert.equal(simulatedBit(), 1);
});

test('CHECK rejects simulated=0 on ops, orders and auto tables', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const ownerId = store.ownerUserId();
    const take = createTake(templates[0]);
    store.putTake(take);

    simError(() => store.db.prepare(`INSERT INTO ops(
      id,take_id,kind,at,amount,quote_class,quote_eligible,batch_id,idempotency_key,fingerprint,created_at,user_id,simulated
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'op-real', take.id, 'aporte', '2026-10-19T12:00:00.000Z', 1, 'missing', 0, 'b', 'k-real', 'f',
      '2026-10-19T12:00:00.000Z', ownerId, 0,
    ));
    simError(() => store.db.prepare(`INSERT INTO orders(
      id,take_id,kind,status,take_version,payload,preview,fingerprint,created_at,user_id,simulated
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      'ord-real', take.id, 'aporte', 'cancelled', 1, '{}', '{}', 'f',
      '2026-10-19T12:00:00.000Z', ownerId, 0,
    ));
    simError(() => store.db.prepare(`INSERT INTO auto_policies(
      take_id,user_id,updated_at,simulated
    ) VALUES (?,?,?,?)`).run(take.id, ownerId, '2026-10-19T12:00:00.000Z', 0));
    simError(() => store.db.prepare(`INSERT INTO auto_signals(
      id,take_id,user_id,kind,signature,status,detected_at,updated_at,simulated
    ) VALUES (?,?,?,?,?,?,?,?,?)`).run(
      'sig-real', take.id, ownerId, 'cap', 'sig', 'pending',
      '2026-10-19T12:00:00.000Z', '2026-10-19T12:00:00.000Z', 0,
    ));
    simError(() => store.db.prepare(`INSERT INTO auto_trades(
      id,take_id,user_id,kind,day,status,executed_at,created_at,simulated
    ) VALUES (?,?,?,?,?,?,?,?,?)`).run(
      'tr-real', take.id, ownerId, 'cap', '2026-10-19', 'executed',
      '2026-10-19T12:00:00.000Z', '2026-10-19T12:00:00.000Z', 0,
    ));

    store.insertOp({
      id: 'op-ok', takeId: take.id, kind: 'aporte', at: '2026-10-19T12:00:00.000Z',
      ticker: null, units: null, amount: 1, currency: 'ARS', price: null,
      quoteAsOf: null, quoteProvider: null, quoteClass: 'missing', quoteEligible: 0, quoteStale: 0,
      parentId: null, batchId: 'b-ok', idempotencyKey: 'k-ok', fingerprint: 'f', note: '', meta: {},
      createdAt: '2026-10-19T12:00:00.000Z',
    });
    assert.equal(store.db.prepare('SELECT simulated FROM ops WHERE id=?').get('op-ok').simulated, 1);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('auto user_id triggers reject a cross-user mismatch', () => {
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
      () => store.db.prepare(`INSERT INTO auto_policies(take_id,user_id,updated_at) VALUES (?,?,?)`)
        .run(take.id, other, '2026-10-19T12:00:00.000Z'),
      /must match takes\.user_id/,
    );
    assert.throws(
      () => store.db.prepare(`INSERT INTO auto_signals(
        id,take_id,user_id,kind,signature,status,detected_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?)`).run(
        'sig-x', take.id, other, 'drift', 's', 'pending',
        '2026-10-19T12:00:00.000Z', '2026-10-19T12:00:00.000Z',
      ),
      /must match takes\.user_id/,
    );
    assert.throws(
      () => store.db.prepare(`INSERT INTO auto_trades(
        id,take_id,user_id,kind,day,status,executed_at,created_at
      ) VALUES (?,?,?,?,?,?,?,?)`).run(
        'tr-x', take.id, other, 'undo', '2026-10-19', 'executed',
        '2026-10-19T12:00:00.000Z', '2026-10-19T12:00:00.000Z',
      ),
      /must match takes\.user_id/,
    );
    assert.throws(
      () => store.db.prepare(`INSERT INTO auto_policies(take_id,user_id,updated_at) VALUES (?,?,?)`)
        .run('missing-take', null, '2026-10-19T12:00:00.000Z'),
      /auto_policies\.user_id is required/,
    );

    const policy = store.insertAutoPolicy({takeId: take.id});
    assert.equal(policy.userId, ownerId);
    assert.equal(policy.enabled, false);
    assert.equal(policy.simulated, true);
    assert.equal(policy.newsTrigger, !!AUTO_NEWS_TRIGGER_DEFAULT);
    assert.equal(policy.maxTradesDay, AUTO_MAX_TRADES_DAY);
    assert.equal(policy.maxTurnoverPct, AUTO_MAX_TURNOVER_PCT);
    assert.equal(policy.maxTradesDayUser, AUTO_MAX_TRADES_DAY_USER);
    assert.equal(policy.brokenAction, AUTO_BROKEN_ACTION);
    assert.equal(policy.undoAt, AUTO_UNDO_AT);
    assert.equal(policy.undoWindowHours, AUTO_UNDO_WINDOW_HOURS);
    assert.equal(policy.canaryOwnerOnly, !!AUTO_CANARY_OWNER_ONLY_DEFAULT);

    const scopedOther = store.forUser(other);
    assert.equal(scopedOther.autoPolicy(take.id), null);
    assert.throws(() => scopedOther.insertAutoPolicy({takeId: take.id}), /No encontramos esa tesis/);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('auto store helpers are read/insert only and scoped', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const take = createTake(templates[1]);
    store.putTake(take);
    store.insertAutoPolicy({takeId: take.id, enabled: false});
    const signal = store.insertAutoSignal({
      id: 'sig-1', takeId: take.id, kind: 'cap', ticker: 'GGAL', signature: 'cap|GGAL|0',
      status: 'pending', detectedAt: '2026-10-19T12:00:00.000Z',
    });
    const trade = store.insertAutoTrade({
      id: 'tr-1', takeId: take.id, signalId: signal.id, kind: 'cap', day: '2026-10-19',
      status: 'executed', executedAt: '2026-10-19T12:00:00.000Z', amount: 100,
    });
    assert.equal(store.autoSignal('sig-1').simulated, true);
    assert.equal(store.autoTrade('tr-1').simulated, true);
    assert.equal(store.autoSignalsForTake(take.id).length, 1);
    assert.equal(store.autoTradesForTake(take.id)[0].id, trade.id);
    assert.equal(store.enabledAutoPolicies().length, 0);
    assert.equal(typeof store.updateAutoPolicy, 'undefined');
    assert.equal(typeof store.updateAutoSignal, 'undefined');
    assert.equal(typeof store.updateAutoTrade, 'undefined');
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('migrate-check reports v15 without secrets', () => {
  const dir = tmp();
  let store;
  try {
    store = createStore(dir);
    const check = spawnSync(process.execPath, [resolve('scripts/migrate-check.mjs'), join(dir, 'tesis.sqlite')], {encoding: 'utf8'});
    assert.equal(check.status, 0, check.stderr);
    const report = JSON.parse(check.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.userVersion, 15);
    assert.equal(report.simulated.ops, 0);
    assert.equal(report.simulated.auto_policies, 0);
    assert.equal(check.stdout.includes('scrypt$'), false);
    assert.equal(report.ownerHasPasswordHash, false);
  } finally {
    store?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
