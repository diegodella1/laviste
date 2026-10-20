import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createApp} from '../server.mjs';
import {createTake, activate, templates, money, value, previewTrade, applyTrade} from '../lib/engine.mjs';
import {assertBooksMatchTake, recordActivationOps} from '../lib/ops.mjs';
import {hashPassword} from '../lib/password.mjs';
import {createAutoRunner} from '../lib/auto/runner.mjs';
import {autoSimEnabled} from '../lib/features.mjs';
import {AUTO_DEBOUNCE_MS, AUTO_BROKEN_WAIT_MS, AUTO_UNDO_WINDOW_HOURS, REASONS} from '../lib/auto/engine.mjs';
import {usdToMicro} from '../lib/budget.mjs';
import {dayInBuenosAires} from '../lib/usage.mjs';
import {checkSimOnly} from '../scripts/check-sim-only.mjs';

const OPEN = '2026-10-19T15:00:00.000Z'; // Monday 12:00 ART
const CLOSED = '2026-10-17T15:00:00.000Z';
const OWNER_EMAIL = 'diego@diegodella.ar';
const OWNER_PASSWORD = 'test-password-only';
const USER_B_EMAIL = 'b@example.test';
const USER_B_PASSWORD = 'user-b-password-12';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'au3-'));
}

function later(iso, ms) {
  return new Date(Date.parse(iso) + ms).toISOString();
}

function quote(ticker, price, asOf, extra = {}) {
  return {ticker, price, asOf, provider: 'data912', stale: false, available: true, ...extra};
}

function quotesApi(take, asOf = OPEN, overrides = {}) {
  const map = {};
  for (const h of take.holdings) {
    const price = overrides[h.ticker] ?? h.price;
    map[h.ticker] = quote(h.ticker, price, asOf);
  }
  return {
    getCached: ticker => map[ticker] || null,
    isDemo: () => false,
    set(ticker, row) { map[ticker] = row; },
    bumpAsOf(next, priceOverrides = {}) {
      for (const h of take.holdings) {
        const price = priceOverrides[h.ticker] ?? map[h.ticker]?.price ?? h.price;
        map[h.ticker] = quote(h.ticker, price, next);
        h.price = price;
      }
    },
    map,
  };
}

function inflateCap(take, ticker = 'YPF', factor = 1.15) {
  const h = take.holdings.find(row => row.ticker === ticker) || take.holdings[0];
  h.price = money(h.price * factor);
  return h;
}

function enableAuto(store, userId) {
  store.setSetting('autoTrading', {enabled: true, allowUserIds: [userId], marketHolidays: []});
}

function brokenReview(take, over = {}) {
  return {
    id: over.id || randomUUID(),
    takeId: take.id,
    version: take.version,
    applied: true,
    previousAttention: 'watch',
    newAttention: 'review',
    events: [{id: 'e1', title: 'corte', sourceIds: ['src-1']}],
    sourceIds: ['src-1'],
    sources: [{id: 'src-1', url: 'https://example.test/nota', title: 'corte'}],
    reason: 'La tesis quedó en revisión.',
    resolved: false,
    ...over,
  };
}

function world(over = {}) {
  const dir = tmp();
  const store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
  const ownerId = store.ownerUserId();
  const env = over.env || {FEATURE_AUTO_SIM: '1'};
  enableAuto(store, ownerId);
  const scoped = store.forUser(ownerId);
  const take = createTake(over.template || templates[0]);
  activate(take, over.amount || 1_024_000);
  take.realPricesAt = OPEN;
  take.monitoringPaused = false;
  take.scenario = 'normal';
  scoped.putTake(take);
  const quotes = quotesApi(take, OPEN);
  if (over.activationOps !== false) recordActivationOps(scoped, take, quotes);
  if (over.inflate !== false) inflateCap(take, over.ticker || 'YPF', over.factor || 1.15);
  scoped.putTake(take);
  quotes.bumpAsOf(OPEN, Object.fromEntries(take.holdings.map(h => [h.ticker, h.price])));
  scoped.upsertAutoPolicy({
    takeId: take.id, enabled: true, newsTrigger: !!over.newsTrigger, armState: {},
  });
  const clock = {ms: Date.parse(over.now || OPEN)};
  const inject = over.inject || {};
  const runner = createAutoRunner({
    store, quotesApi: quotes, now: () => clock.ms, env, startTimer: false, inject,
  });
  return {
    dir, store, scoped, take, quotes, runner, clock, ownerId, env, inject,
    iso: () => new Date(clock.ms).toISOString(),
    advance(ms) { clock.ms += ms; },
    setIso(iso) { clock.ms = Date.parse(iso); },
    close() {
      runner.close();
      store.close();
      rmSync(dir, {recursive: true, force: true});
    },
  };
}

function booksSnapshot(take) {
  return {
    cash: take.cash,
    invested: take.invested,
    units: Object.fromEntries((take.holdings || []).map(h => [h.ticker, h.units])),
  };
}

function insertPartialRebalanceOps(scoped, take, ticker = 'YPF') {
  const h = take.holdings.find(row => row.ticker === ticker) || take.holdings[0];
  const sold = Math.min(2, Math.max(1, (h.units || 2) - 1));
  const batchId = randomUUID();
  const at = take.activatedAt || OPEN;
  scoped.insertOp({
    id: randomUUID(), takeId: take.id, kind: 'rebalance', at,
    ticker: null, units: null, amount: 0, currency: 'ARS', price: null,
    quoteAsOf: null, quoteProvider: null, quoteClass: 'missing', quoteEligible: 0, quoteStale: 0,
    parentId: null, batchId, idempotencyKey: `ops:rebalance:${take.id}:partial`,
    fingerprint: 'partial-rebalance', note: 'Rebalance parcial',
    meta: {source: 'rebalance'}, createdAt: at,
  });
  scoped.insertOp({
    id: randomUUID(), takeId: take.id, kind: 'venta', at,
    ticker: h.ticker, units: sold, amount: money(sold * h.price), currency: 'ARS', price: h.price,
    quoteAsOf: at, quoteProvider: 'data912', quoteClass: 'delayed', quoteEligible: 1, quoteStale: 0,
    parentId: null, batchId, idempotencyKey: `ops:rebalance:${take.id}:partial:venta:${h.ticker}`,
    fingerprint: 'partial-rebalance', note: `Venta ${h.ticker}`,
    meta: {source: 'rebalance'}, createdAt: at,
  });
  return {ticker: h.ticker, sold};
}

function incompleteLedgerWorld(over = {}) {
  const ctx = world({...over, activationOps: false});
  insertPartialRebalanceOps(ctx.scoped, ctx.scoped.take(ctx.take.id), over.ticker || 'YPF');
  return ctx;
}

function confirmPrice(ctx) {
  const first = ctx.runner.onSynced(ctx.take.id);
  const pending = (first?.signals || []).filter(s => s.status === 'pending');
  const t2 = later(ctx.iso(), AUTO_DEBOUNCE_MS);
  ctx.setIso(t2);
  ctx.quotes.bumpAsOf(t2);
  ctx.scoped.putTake(ctx.scoped.take(ctx.take.id));
  const live = ctx.scoped.take(ctx.take.id);
  for (const h of live.holdings) {
    const q = ctx.quotes.getCached(h.ticker);
    if (q?.price) h.price = q.price;
  }
  ctx.scoped.putTake(live);
  const second = ctx.runner.onSynced(ctx.take.id);
  return {first, second, pending};
}

test('FEATURE_AUTO_SIM defaults off', () => {
  assert.equal(autoSimEnabled({}), false);
  assert.equal(autoSimEnabled({FEATURE_AUTO_SIM: '0'}), false);
});

test('price trigger executes through the order pipeline and dedups the same signal', () => {
  const ctx = world();
  try {
    const {first, second} = confirmPrice(ctx);
    assert.equal(first.signals[0].status, 'pending');
    assert.ok(second.results?.some(r => r.ok), JSON.stringify(second));
    const trades = ctx.scoped.autoTradesForTake(ctx.take.id);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].kind, 'cap');
    assert.equal(trades[0].status, 'executed');
    const ops = ctx.scoped.opsForTake(ctx.take.id);
    const autoOps = ops.filter(o => o.meta?.source === 'auto');
    assert.ok(autoOps.length >= 1);
    assert.equal(autoOps[0].meta.simulated, true);
    const orders = ctx.scoped.ordersForTake(ctx.take.id);
    assert.ok(orders.some(o => o.status === 'confirmed'));
    const take = ctx.scoped.take(ctx.take.id);
    assert.ok(take.events.some(e => e.type === 'auto_trade' && /No se enviaron órdenes a un broker/.test(e.body)));
    assert.equal(take.events.some(e => /aplicado automáticamente/i.test(e.body || '')), false);
    const audits = ctx.store.listAuditLog({action: 'auto.trade'});
    assert.ok(audits.length >= 1);

    const again = ctx.runner.onSynced(ctx.take.id);
    assert.equal(ctx.scoped.autoTradesForTake(ctx.take.id).length, 1);
    assert.equal(again.results?.some(r => r.ok) || false, false);
    const signals = ctx.scoped.autoSignalsForTake(ctx.take.id).filter(s => s.status === 'executed');
    assert.equal(signals.length, 1);
  } finally {
    ctx.close();
  }
});

test('limits 2/tesis, 6/user and 50% turnover skip; undo does not consume 2/6', () => {
  const ctx = world();
  try {
    const day = '2026-10-19';
    const takeId = ctx.take.id;
    const aged = later(OPEN, -5 * 3600 * 1000);
    for (let i = 0; i < 2; i++) {
      ctx.scoped.insertAutoTrade({
        id: randomUUID(), takeId, kind: 'cap', day, status: 'executed',
        executedAt: aged, amount: 10_000, meta: {takeValueAtOpen: 1_024_000, ticker: 'YPF'},
      });
    }
    const {second} = confirmPrice(ctx);
    assert.ok(second.signals?.some(s => s.status === 'confirmed') || second.results?.some(r => !r.ok));
    const after = ctx.scoped.autoTradesForTake(takeId).filter(t => t.kind === 'cap' || t.kind === 'drift' || t.kind === 'broken');
    assert.equal(after.length, 2);
    const skipped = ctx.scoped.autoSignalsForTake(takeId);
    assert.ok(skipped.some(s => s.skipReason === REASONS.LIMITE_TESIS), JSON.stringify(skipped));

    const ctx6 = world();
    try {
      const other = createTake(templates[1]);
      activate(other, 1_024_000);
      other.realPricesAt = OPEN;
      ctx6.scoped.putTake(other);
      for (let i = 0; i < 6; i++) {
        ctx6.scoped.insertAutoTrade({
          id: randomUUID(), takeId: other.id, kind: 'drift', day, status: 'executed',
          executedAt: later(OPEN, -5 * 3600 * 1000), amount: 1_000, meta: {takeValueAtOpen: 1_024_000},
        });
      }
      confirmPrice(ctx6);
      assert.equal(ctx6.scoped.autoTradesForTake(ctx6.take.id).length, 0);
      assert.ok(ctx6.scoped.autoSignalsForTake(ctx6.take.id).some(s => s.skipReason === REASONS.LIMITE_USUARIO));
    } finally {
      ctx6.close();
    }

    const ctxT = world();
    try {
      ctxT.scoped.insertAutoTrade({
        id: randomUUID(), takeId: ctxT.take.id, kind: 'cap', day, status: 'executed',
        executedAt: later(OPEN, -5 * 3600 * 1000), amount: 600_000, meta: {takeValueAtOpen: 1_024_000},
      });
      confirmPrice(ctxT);
      assert.ok(ctxT.scoped.autoSignalsForTake(ctxT.take.id).some(s => s.skipReason === REASONS.ROTACION_DIARIA));
    } finally {
      ctxT.close();
    }
  } finally {
    ctx.close();
  }
});

test('stale quote or closed market skips the confirmed price signal', () => {
  const stale = world();
  try {
    stale.runner.onSynced(stale.take.id);
    const t2 = later(OPEN, AUTO_DEBOUNCE_MS);
    stale.setIso(t2);
    stale.quotes.bumpAsOf(t2);
    const hot = stale.quotes.getCached('YPF') || stale.quotes.getCached(stale.take.holdings[0].ticker);
    stale.quotes.set(hot.ticker, {...hot, stale: true, asOf: t2});
    stale.runner.onSynced(stale.take.id);
    assert.equal(stale.scoped.autoTradesForTake(stale.take.id).length, 0);
    const sigs = stale.scoped.autoSignalsForTake(stale.take.id);
    assert.ok(sigs.some(s => s.skipReason === REASONS.COTIZACION_VIEJA || s.status === 'pending'), JSON.stringify(sigs));
  } finally {
    stale.close();
  }

  const closed = world({now: CLOSED, inflate: true});
  try {
    closed.quotes.bumpAsOf(CLOSED);
    const out = closed.runner.onSynced(closed.take.id);
    assert.equal(closed.scoped.autoTradesForTake(closed.take.id).length, 0);
    assert.ok((out?.blocks || []).some(b => b.reason === REASONS.MERCADO_CERRADO) || (out?.signals || []).length === 0);
  } finally {
    closed.close();
  }
});

test('news trigger is off by default; broken halves then pauses', () => {
  const off = world({inflate: false});
  try {
    off.scoped.putReview(brokenReview(off.take));
    const out = off.runner.onReview(off.take.id);
    assert.equal(off.scoped.autoTradesForTake(off.take.id).length, 0);
    assert.ok((out?.blocks || []).some(b => b.reason === REASONS.NEWS_TRIGGER_APAGADO) || !(out?.signals || []).some(s => s.kind === 'broken'));
  } finally {
    off.close();
  }

  const on = world({inflate: false, newsTrigger: true});
  try {
    const before = on.scoped.take(on.take.id).holdings.map(h => ({ticker: h.ticker, units: h.units}));
    on.scoped.putReview(brokenReview(on.take));
    const pending = on.runner.onReview(on.take.id);
    assert.equal(pending.signals.find(s => s.kind === 'broken')?.status, 'pending', JSON.stringify(pending.signals));
    assert.equal(on.scoped.autoTradesForTake(on.take.id).length, 0);
    on.advance(AUTO_BROKEN_WAIT_MS);
    on.quotes.bumpAsOf(on.iso());
    on.runner.tick();
    const trades = on.scoped.autoTradesForTake(on.take.id).filter(t => t.kind === 'broken');
    assert.equal(trades.length, 1, JSON.stringify(on.scoped.autoTradesForTake(on.take.id)));
    const after = on.scoped.take(on.take.id);
    for (const row of before) {
      const h = after.holdings.find(x => x.ticker === row.ticker);
      assert.equal(h.units, Math.floor(row.units / 2) + (row.units % 2));
    }
    assert.equal(on.scoped.autoPolicy(on.take.id).pausedReason, 'tesis_rota');
    on.scoped.putReview(brokenReview(on.take, {id: randomUUID()}));
    on.runner.onReview(on.take.id);
    assert.equal(on.scoped.autoTradesForTake(on.take.id).filter(t => t.kind === 'broken').length, 1);
  } finally {
    on.close();
  }
});

test('kill-switch matrix: paused AI blocks news not price; suspension blocks everything', () => {
  const ctx = world({newsTrigger: true, inflate: false});
  try {
    ctx.store.setAiControl({enabled: false}, {updatedBy: ctx.ownerId});
    assert.equal(ctx.store.isAiPaused(), true);
    assert.equal(ctx.store.budgetState().pauseReason, 'disabled');
    inflateCap(ctx.take);
    ctx.scoped.putTake(ctx.take);
    ctx.quotes.bumpAsOf(OPEN, Object.fromEntries(ctx.take.holdings.map(h => [h.ticker, h.price])));
    const {second} = confirmPrice(ctx);
    assert.ok(second.results?.some(r => r.ok), 'price trigger must run while AI is paused');

    ctx.scoped.putReview(brokenReview(ctx.take));
    ctx.runner.onReview(ctx.take.id);
    ctx.advance(AUTO_BROKEN_WAIT_MS);
    ctx.quotes.bumpAsOf(ctx.iso());
    ctx.runner.tick();
    const kinds = ctx.scoped.autoTradesForTake(ctx.take.id).map(t => t.kind);
    assert.equal(kinds.includes('broken'), false);
    assert.ok(ctx.scoped.autoSignalsForTake(ctx.take.id).some(s => s.kind === 'broken' && (s.skipReason === REASONS.IA_EN_PAUSA || s.status === 'pending' || s.status === 'confirmed')));
  } finally {
    ctx.close();
  }

  for (const pause of ['budget_day', 'budget_month']) {
    const ctxB = world({newsTrigger: true, inflate: false});
    try {
      ctxB.store.setModelPrices({models: {'gpt-5-mini': {promptUsdPerMTok: 1, completionUsdPerMTok: 1}}});
      ctxB.store.setAiControl({
        enabled: true,
        dailyCapUsd: pause === 'budget_day' ? 1 : null,
        monthlyCapUsd: 20,
      });
      ctxB.store.db.prepare(`INSERT INTO user_usage(user_id, day, kind, calls, prompt_tokens, completion_tokens, est_cost_micro)
        VALUES (?,?,?,?,?,?,?)`).run(
        ctxB.ownerId, dayInBuenosAires(new Date(OPEN)), 'chat', 1, 0, 0,
        pause === 'budget_day' ? usdToMicro(1) : usdToMicro(20),
      );
      const state = ctxB.store.budgetState({now: new Date(OPEN)});
      assert.equal(state.paused, true, pause);
      assert.equal(state.pauseReason, pause);
      inflateCap(ctxB.take);
      ctxB.scoped.putTake(ctxB.take);
      ctxB.quotes.bumpAsOf(OPEN, Object.fromEntries(ctxB.take.holdings.map(h => [h.ticker, h.price])));
      const priced = confirmPrice(ctxB);
      assert.ok(priced.second.results?.some(r => r.ok), pause);
    } finally {
      ctxB.close();
    }
  }

  const sus = world();
  try {
    sus.runner.onSynced(sus.take.id);
    sus.store.db.prepare('UPDATE users SET status=? WHERE id=?').run('suspended', sus.ownerId);
    const t2 = later(OPEN, AUTO_DEBOUNCE_MS);
    sus.setIso(t2);
    sus.quotes.bumpAsOf(t2);
    const out = sus.runner.onSynced(sus.take.id);
    assert.equal(sus.scoped.autoTradesForTake(sus.take.id).length, 0);
    assert.equal(out.reason, REASONS.USUARIO_SUSPENDIDO);
    assert.ok(sus.store.admin.autoSignalsForTake(sus.take.id).some(s => s.skipReason === REASONS.USUARIO_SUSPENDIDO));
  } finally {
    sus.close();
  }
});

test('undo at the live price, partial, 72h edge, without consuming 2/6', () => {
  const ctx = world({template: templates[6], ticker: 'GGAL', factor: 1.3});
  try {
    confirmPrice(ctx);
    const trade = ctx.scoped.autoTradesForTake(ctx.take.id)[0];
    assert.ok(trade);
    const origLeg = trade.meta.legs[0];
    const livePrice = money(origLeg.price * 1.1);
    const ticker = origLeg.ticker;
    const take = ctx.scoped.take(ctx.take.id);
    take.holdings.find(h => h.ticker === ticker).price = livePrice;
    ctx.quotes.set(ticker, quote(ticker, livePrice, ctx.iso()));
    ctx.scoped.putTake(take);

    const exact = later(trade.executedAt, AUTO_UNDO_WINDOW_HOURS * 3600 * 1000);
    ctx.setIso(exact);
    ctx.quotes.bumpAsOf(exact, {[ticker]: livePrice});
    const pv = ctx.runner.previewUndo(ctx.scoped, trade.id);
    assert.equal(pv.ok, true, pv.reason);
    const preview = ctx.runner.undoTrade(ctx.scoped, trade.id, {
      version: ctx.scoped.take(ctx.take.id).version, fingerprint: pv.fingerprint,
    });
    assert.equal(preview.replay, false);
    assert.equal(preview.trade.kind, 'undo');
    const undoOps = ctx.scoped.opsForTake(ctx.take.id).filter(o => o.meta?.source === 'auto-undo');
    assert.ok(undoOps.length >= 1);
    assert.equal(undoOps[0].price, livePrice);
    const execs = ctx.scoped.autoTradesForTake(ctx.take.id).filter(t => t.kind !== 'undo');
    assert.equal(execs.length, 1);
    assert.ok(['reversed', 'partially_reversed'].includes(ctx.scoped.autoTrade(trade.id).status));
  } finally {
    ctx.close();
  }

  const partial = world({template: templates[6], ticker: 'GGAL', factor: 1.3});
  try {
    confirmPrice(partial);
    const trade = partial.scoped.autoTradesForTake(partial.take.id)[0];
    const origLeg = trade.meta.legs[0];
    const take = partial.scoped.take(partial.take.id);
    const pv = partial.runner.previewUndo(partial.scoped, trade.id);
    assert.equal(pv.ok, true, pv.reason);
    assert.equal(pv.partial, true);
    const out = partial.runner.undoTrade(partial.scoped, trade.id, {
      version: take.version, fingerprint: pv.fingerprint,
    });
    assert.equal(out.preview.partial, true);
    assert.ok(out.preview.filled[0].units < origLeg.units);
    assert.equal(partial.scoped.autoTrade(trade.id).status, 'partially_reversed');
    assert.equal(partial.scoped.autoTradesForTake(take.id).filter(t => t.kind !== 'undo').length, 1);
  } finally {
    partial.close();
  }

  const late = world({template: templates[6], ticker: 'GGAL', factor: 1.3});
  try {
    confirmPrice(late);
    const trade = late.scoped.autoTradesForTake(late.take.id)[0];
    late.setIso(later(trade.executedAt, AUTO_UNDO_WINDOW_HOURS * 3600 * 1000 + 1));
    late.quotes.bumpAsOf(late.iso());
    assert.throws(
      () => late.runner.undoTrade(late.scoped, trade.id, {version: late.scoped.take(late.take.id).version}),
      err => err.status === 410 && err.code === REASONS.VENTANA_DESHACER_VENCIDA,
    );
  } finally {
    late.close();
  }
});

test('incomplete pre-ledger take pauses a tick with error_libro and leaves books untouched', () => {
  const ctx = incompleteLedgerWorld();
  try {
    const before = booksSnapshot(ctx.scoped.take(ctx.take.id));
    const out = ctx.runner.onSynced(ctx.take.id);
    assert.equal(out.reason, 'error_libro');
    const live = ctx.scoped.take(ctx.take.id);
    assert.deepEqual(booksSnapshot(live), before);
    assert.equal(ctx.scoped.autoTradesForTake(ctx.take.id).length, 0);
    assert.equal(ctx.scoped.autoPolicy(ctx.take.id).pausedReason, 'error_libro');
    assert.ok(ctx.store.listAuditLog({action: 'auto.pause'}).some(a => a.meta.reason === 'error_libro'));
    ctx.advance(AUTO_DEBOUNCE_MS);
    ctx.quotes.bumpAsOf(ctx.iso());
    const again = ctx.runner.onSynced(ctx.take.id);
    assert.equal(again.reason, 'error_libro');
    assert.deepEqual(booksSnapshot(ctx.scoped.take(ctx.take.id)), before);
  } finally {
    ctx.close();
  }
});

test('incomplete pre-ledger take pauses undo with error_libro and leaves books untouched', () => {
  const ctx = incompleteLedgerWorld();
  try {
    const before = booksSnapshot(ctx.scoped.take(ctx.take.id));
    const tradeId = randomUUID();
    ctx.scoped.insertAutoTrade({
      id: tradeId,
      takeId: ctx.take.id,
      kind: 'cap',
      day: '2026-10-19',
      status: 'executed',
      executedAt: OPEN,
      amount: 12_000,
      meta: {
        source: 'auto', simulated: true, ticker: 'YPF',
        legs: [{side: 'venta', ticker: 'YPF', units: 2, price: 16_000, amount: 32_000}],
      },
    });
    const preview = ctx.runner.previewUndo(ctx.scoped, tradeId);
    assert.equal(preview.ok, false);
    assert.equal(preview.reason, 'error_libro');
    assert.equal(ctx.scoped.autoPolicy(ctx.take.id).pausedReason, null);
    assert.equal(ctx.store.listAuditLog({action: 'auto.pause'}).length, 0);
    assert.throws(
      () => ctx.runner.undoTrade(ctx.scoped, tradeId, {version: ctx.scoped.take(ctx.take.id).version, fingerprint: 'x'}),
      err => err.code === 'error_libro',
    );
    const live = ctx.scoped.take(ctx.take.id);
    assert.deepEqual(booksSnapshot(live), before);
    assert.equal(ctx.scoped.autoTradesForTake(ctx.take.id).filter(t => t.kind === 'undo').length, 0);
    assert.equal(ctx.scoped.autoPolicy(ctx.take.id).pausedReason, 'error_libro');
    assert.ok(ctx.store.listAuditLog({action: 'auto.pause'}).some(a => a.meta.reason === 'error_libro'));
  } finally {
    ctx.close();
  }
});

test('units never go negative in preview, apply or a matching-ledger auto trade', () => {
  const t = createTake(templates[0]);
  activate(t, 1_024_000);
  const h = t.holdings[0];
  assert.throws(() => previewTrade(t, {side: 'venta', ticker: h.ticker, by: 'units', units: h.units + 1}), /unidades/);
  h.units = -1;
  assert.throws(() => previewTrade(t, {side: 'compra', ticker: h.ticker, by: 'units', units: 1}), /unidades/);
  const t2 = createTake(templates[0]);
  activate(t2, 1_024_000);
  t2.cash = -10;
  assert.throws(() => previewTrade(t2, {side: 'venta', ticker: t2.holdings[0].ticker, by: 'units', units: 1}), /efectivo/);
  const t3 = createTake(templates[0]);
  activate(t3, 1_024_000);
  applyTrade(t3, {side: 'venta', ticker: t3.holdings[0].ticker, by: 'units', units: 1});
  assert.ok(t3.holdings.every(row => row.units >= 0));
  assert.ok(t3.cash >= 0);

  const ctx = world();
  try {
    const {second} = confirmPrice(ctx);
    assert.ok(second.results?.some(r => r.ok), JSON.stringify(second));
    const take = ctx.scoped.take(ctx.take.id);
    assert.ok(take.holdings.every(row => row.units >= 0));
    assert.ok(take.cash >= 0);
    assertBooksMatchTake(ctx.scoped.opsForTake(take.id), take);
  } finally {
    ctx.close();
  }
});

test('happy path still trades when the ledger matches the saved take', () => {
  const ctx = world();
  try {
    const seeded = ctx.scoped.take(ctx.take.id);
    seeded.history.push({
      at: OPEN, value: value(seeded), benchmark: seeded.invested,
      index: seeded.invested, indexRecorded: true,
    });
    ctx.scoped.putTake(seeded);
    const {second} = confirmPrice(ctx);
    assert.ok(second.results?.some(r => r.ok), JSON.stringify(second));
    const take = ctx.scoped.take(ctx.take.id);
    assert.equal(ctx.scoped.autoTradesForTake(take.id).length, 1);
    assertBooksMatchTake(ctx.scoped.opsForTake(take.id), take);
    const last = take.history.at(-1);
    assert.equal(last.benchmark, take.invested);
    assert.notEqual(last.benchmark, 0);
    assert.equal(last.index, seeded.invested);
    assert.equal(last.indexRecorded, true);
    assert.ok(take.holdings.every(row => row.units >= 0));
    assert.ok(take.cash >= 0);
  } finally {
    ctx.close();
  }
});

test('injected ledger failure ROLLBACKs and pauses the tesis', () => {
  const ctx = world({inject: {failLedger: true}});
  try {
    const before = ctx.scoped.opsForTake(ctx.take.id).map(o => o.id);
    confirmPrice(ctx);
    const after = ctx.scoped.opsForTake(ctx.take.id).map(o => o.id);
    assert.deepEqual(after, before);
    assert.equal(ctx.scoped.autoTradesForTake(ctx.take.id).length, 0);
    assert.equal(ctx.scoped.autoPolicy(ctx.take.id).pausedReason, 'error_libro');
    assert.ok(ctx.store.listAuditLog({action: 'auto.pause'}).some(a => a.meta.reason === 'error_libro'));
  } finally {
    ctx.close();
  }
});

test('feature flag off: runner is a no-op', () => {
  const ctx = world({env: {FEATURE_AUTO_SIM: '0'}});
  try {
    const out = ctx.runner.onSynced(ctx.take.id);
    assert.equal(out, null);
    ctx.advance(AUTO_DEBOUNCE_MS);
    ctx.runner.tick();
    assert.equal(ctx.scoped.autoTradesForTake(ctx.take.id).length, 0);
  } finally {
    ctx.close();
  }
});

test('contract: runner reads the real isAiPaused / budgetState API', () => {
  const dir = tmp();
  const store = createStore(dir, {ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD});
  try {
    assert.equal(typeof store.isAiPaused, 'function');
    assert.equal(typeof store.budgetState, 'function');
    assert.equal(store.isAiPaused(), false);
    store.setAiControl({enabled: false}, {updatedBy: store.ownerUserId()});
    assert.equal(store.isAiPaused(), true);
    assert.equal(store.budgetState().pauseReason, 'disabled');
    store.setAiControl({enabled: true}, {updatedBy: store.ownerUserId()});
    store.setModelPrices({models: {'gpt-5-mini': {promptUsdPerMTok: 2, completionUsdPerMTok: 2}}});
    store.setAiControl({monthlyCapUsd: 20, dailyCapUsd: 1});
    store.db.prepare(`INSERT INTO user_usage(user_id, day, kind, calls, prompt_tokens, completion_tokens, est_cost_micro)
      VALUES (?,?,?,?,?,?,?)`).run(store.ownerUserId(), dayInBuenosAires(), 'chat', 1, 0, 0, usdToMicro(1));
    const day = store.budgetState();
    assert.equal(day.paused, true);
    assert.equal(day.pauseReason, 'budget_day');
    store.db.prepare('DELETE FROM user_usage').run();
    store.setAiControl({monthlyCapUsd: 20, dailyCapUsd: null});
    store.db.prepare(`INSERT INTO user_usage(user_id, day, kind, calls, prompt_tokens, completion_tokens, est_cost_micro)
      VALUES (?,?,?,?,?,?,?)`).run(store.ownerUserId(), dayInBuenosAires(), 'chat', 1, 0, 0, usdToMicro(20));
    const month = store.budgetState();
    assert.equal(month.paused, true);
    assert.equal(month.pauseReason, 'budget_month');
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('check-sim-only stays green with the runner', () => {
  const report = checkSimOnly(process.cwd());
  assert.equal(report.ok, true, report.errors.join('\n'));
});

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

function cookiePair(res) {
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

async function login(base, email, password) {
  const res = await fetch(base + '/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password}),
  });
  assert.equal(res.status, 200, await res.text());
  return {Cookie: cookiePair(res), 'Content-Type': 'application/json'};
}

test('canary 404 for non-owner; feature/global off 404; GET/PUT /auto', async () => {
  const dir = tmp();
  const env = {FEATURE_AUTO_SIM: '1'};
  const app = createApp({
    dataDir: dir, password: OWNER_PASSWORD, ownerEmail: OWNER_EMAIL,
    port: 0, host: '127.0.0.1', quotesLive: false, autoStartTimer: false, env,
  });
  try {
    const userB = app.store.createUser({email: USER_B_EMAIL, passwordHash: hashPassword(USER_B_PASSWORD)});
    const ownerId = app.store.ownerUserId();
    app.store.setSetting('autoTrading', {enabled: true, allowUserIds: [ownerId]});
    const take = createTake(templates[0]);
    activate(take, 1_024_000);
    take.monitoringPaused = false;
    app.store.forUser(ownerId).putTake(take);
    const base = await listen(app);
    const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const headersB = await login(base, USER_B_EMAIL, USER_B_PASSWORD);

    const denied = await fetch(base + `/api/takes/${take.id}/auto`, {headers: headersB});
    assert.equal(denied.status, 404);
    const tradesB = await fetch(base + '/api/auto/trades', {headers: headersB});
    assert.equal(tradesB.status, 404);
    const undoB = await fetch(base + '/api/auto/trades/nope/undo', {
      method: 'POST', headers: headersB, body: JSON.stringify({version: 1}),
    });
    assert.equal(undoB.status, 404);

    const got = await fetch(base + `/api/takes/${take.id}/auto`, {headers: headersA});
    assert.equal(got.status, 200, await got.clone().text());
    const put = await fetch(base + `/api/takes/${take.id}/auto`, {
      method: 'PUT', headers: headersA,
      body: JSON.stringify({enabled: true, consentVersion: 'v1', version: take.version}),
    });
    const putText = await put.text();
    assert.equal(put.status, 200, putText);
    const policy = JSON.parse(putText);
    assert.equal(policy.policy.enabled, true);

    const listed = await fetch(base + '/api/auto/trades', {headers: headersA});
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.ok(listedBody.policies);
    assert.equal(listedBody.policies[take.id]?.enabled, true);

    const previewB = await fetch(base + '/api/auto/trades/nope/undo/preview', {headers: headersB});
    assert.equal(previewB.status, 404);

    app.store.setSetting('autoTrading', {enabled: false, allowUserIds: [ownerId]});
    const off = await fetch(base + `/api/takes/${take.id}/auto`, {headers: headersA});
    assert.equal(off.status, 404);

    void userB;
  } finally {
    await app.close();
    rmSync(dir, {recursive: true, force: true});
  }

  const dirOff = tmp();
  const appOff = createApp({
    dataDir: dirOff, password: OWNER_PASSWORD, ownerEmail: OWNER_EMAIL,
    port: 0, host: '127.0.0.1', quotesLive: false, autoStartTimer: false,
    env: {FEATURE_AUTO_SIM: '0'},
  });
  try {
    const ownerId = appOff.store.ownerUserId();
    appOff.store.setSetting('autoTrading', {enabled: true, allowUserIds: [ownerId]});
    const take = createTake(templates[0]);
    activate(take, 1_024_000);
    appOff.store.forUser(ownerId).putTake(take);
    const base = await listen(appOff);
    const headersA = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const res = await fetch(base + `/api/takes/${take.id}/auto`, {headers: headersA});
    assert.equal(res.status, 404);
  } finally {
    await appOff.close();
    rmSync(dirOff, {recursive: true, force: true});
  }
});

test('PUT /auto newsTrigger with enabled:true still requires consentVersion', async () => {
  const dir = tmp();
  const env = {FEATURE_AUTO_SIM: '1'};
  const app = createApp({
    dataDir: dir, password: OWNER_PASSWORD, ownerEmail: OWNER_EMAIL,
    port: 0, host: '127.0.0.1', quotesLive: false, autoStartTimer: false, env,
  });
  try {
    const ownerId = app.store.ownerUserId();
    app.store.setSetting('autoTrading', {enabled: true, allowUserIds: [ownerId]});
    const take = createTake(templates[0]);
    activate(take, 1_024_000);
    take.monitoringPaused = false;
    const scoped = app.store.forUser(ownerId);
    scoped.putTake(take);
    scoped.upsertAutoPolicy({
      takeId: take.id, enabled: true, newsTrigger: false,
      consentVersion: 'auto-practice-v1', armState: {},
    });
    const base = await listen(app);
    const headers = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const missing = await fetch(base + `/api/takes/${take.id}/auto`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        enabled: true, newsTrigger: true, newsConsentVersion: 'auto-news-v1', version: take.version,
      }),
    });
    const missingBody = await missing.json();
    assert.equal(missing.status, 400, JSON.stringify(missingBody));
    assert.match(missingBody.error || '', /Confirmá el consentimiento\./);

    const on = await fetch(base + `/api/takes/${take.id}/auto`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        enabled: true, newsTrigger: true, consentVersion: 'auto-practice-v1',
        newsConsentVersion: 'auto-news-v1', version: take.version,
      }),
    });
    const onBody = await on.json();
    assert.equal(on.status, 200, JSON.stringify(onBody));
    assert.equal(onBody.policy.newsTrigger, true);
    assert.equal(onBody.policy.enabled, true);
    assert.equal(onBody.policy.consentVersion, 'auto-practice-v1');

    const off = await fetch(base + `/api/takes/${take.id}/auto`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        enabled: true, newsTrigger: false, consentVersion: 'auto-practice-v1', version: take.version,
      }),
    });
    const offBody = await off.json();
    assert.equal(off.status, 200, JSON.stringify(offBody));
    assert.equal(offBody.policy.newsTrigger, false);
    assert.equal(offBody.policy.enabled, true);
  } finally {
    await app.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('news PUT while paused keeps tesis_rota; off→on still clears it', async () => {
  const dir = tmp();
  const env = {FEATURE_AUTO_SIM: '1'};
  const app = createApp({
    dataDir: dir, password: OWNER_PASSWORD, ownerEmail: OWNER_EMAIL,
    port: 0, host: '127.0.0.1', quotesLive: false, autoStartTimer: false, env,
  });
  try {
    const ownerId = app.store.ownerUserId();
    app.store.setSetting('autoTrading', {enabled: true, allowUserIds: [ownerId]});
    const take = createTake(templates[0]);
    activate(take, 1_024_000);
    take.monitoringPaused = false;
    const scoped = app.store.forUser(ownerId);
    scoped.putTake(take);
    scoped.upsertAutoPolicy({
      takeId: take.id, enabled: true, newsTrigger: false,
      consentVersion: 'auto-practice-v1', pausedReason: 'tesis_rota', armState: {},
    });
    const base = await listen(app);
    const headers = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const newsOn = await fetch(base + `/api/takes/${take.id}/auto`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        enabled: true, newsTrigger: true, consentVersion: 'auto-practice-v1',
        newsConsentVersion: 'auto-news-v1', version: take.version,
      }),
    });
    const newsOnBody = await newsOn.json();
    assert.equal(newsOn.status, 200, JSON.stringify(newsOnBody));
    assert.equal(newsOnBody.policy.newsTrigger, true);
    assert.equal(newsOnBody.policy.enabled, true);
    assert.equal(newsOnBody.policy.pausedReason, 'tesis_rota');
    assert.equal(scoped.autoPolicy(take.id).pausedReason, 'tesis_rota');

    const newsOff = await fetch(base + `/api/takes/${take.id}/auto`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        enabled: true, newsTrigger: false, consentVersion: 'auto-practice-v1', version: take.version,
      }),
    });
    const newsOffBody = await newsOff.json();
    assert.equal(newsOff.status, 200, JSON.stringify(newsOffBody));
    assert.equal(newsOffBody.policy.newsTrigger, false);
    assert.equal(newsOffBody.policy.enabled, true);
    assert.equal(newsOffBody.policy.pausedReason, 'tesis_rota');
    assert.equal(scoped.autoPolicy(take.id).pausedReason, 'tesis_rota');

    const turnOff = await fetch(base + `/api/takes/${take.id}/auto`, {
      method: 'PUT', headers,
      body: JSON.stringify({enabled: false, version: take.version}),
    });
    const turnOffBody = await turnOff.json();
    assert.equal(turnOff.status, 200, JSON.stringify(turnOffBody));
    assert.equal(turnOffBody.policy.enabled, false);
    assert.equal(turnOffBody.policy.pausedReason, 'tesis_rota');

    const resume = await fetch(base + `/api/takes/${take.id}/auto`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        enabled: true, newsTrigger: false, consentVersion: 'auto-practice-v1', version: take.version,
      }),
    });
    const resumeBody = await resume.json();
    assert.equal(resume.status, 200, JSON.stringify(resumeBody));
    assert.equal(resumeBody.policy.enabled, true);
    assert.equal(resumeBody.policy.pausedReason, null);
    assert.equal(scoped.autoPolicy(take.id).pausedReason, null);
  } finally {
    await app.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('undo preview GET; POST without fingerprint is 400; stale fingerprint is 409', () => {
  const ctx = world({template: templates[6], ticker: 'GGAL', factor: 1.3});
  try {
    confirmPrice(ctx);
    const trade = ctx.scoped.autoTradesForTake(ctx.take.id)[0];
    const version = ctx.scoped.take(ctx.take.id).version;
    const beforeTrades = ctx.scoped.autoTradesForTake(ctx.take.id).map(row => [row.id, row.status, row.undoTradeId]);
    const beforeVersion = ctx.scoped.take(ctx.take.id).version;
    const beforeOps = ctx.scoped.opsForTake(ctx.take.id).map(o => o.id);
    const pv = ctx.runner.previewUndo(ctx.scoped, trade.id);
    assert.equal(pv.ok, true, pv.reason);
    assert.ok(pv.fingerprint);
    assert.ok(pv.line);
    assert.match(pv.line, /u\. de /);
    assert.deepEqual(
      ctx.scoped.autoTradesForTake(ctx.take.id).map(row => [row.id, row.status, row.undoTradeId]),
      beforeTrades,
    );
    assert.equal(ctx.scoped.take(ctx.take.id).version, beforeVersion);
    assert.deepEqual(ctx.scoped.opsForTake(ctx.take.id).map(o => o.id), beforeOps);
    assert.throws(
      () => ctx.runner.undoTrade(ctx.scoped, trade.id, {version}),
      err => err.status === 400 && /vista previa/i.test(err.message),
    );
    assert.throws(
      () => ctx.runner.undoTrade(ctx.scoped, trade.id, {version, fingerprint: 'stale-fingerprint'}),
      err => err.status === 409 && /ya no coincide/i.test(err.message),
    );
  } finally {
    ctx.close();
  }
});

test('GET undo preview on a mismatched take writes nothing', async () => {
  const dir = tmp();
  const env = {FEATURE_AUTO_SIM: '1'};
  const app = createApp({
    dataDir: dir, password: OWNER_PASSWORD, ownerEmail: OWNER_EMAIL,
    port: 0, host: '127.0.0.1', quotesLive: false, quotesFixture: true,
    autoStartTimer: false, env, quotesMarketOpen: () => true,
  });
  try {
    const ownerId = app.store.ownerUserId();
    app.store.setSetting('autoTrading', {enabled: true, allowUserIds: [ownerId]});
    const scoped = app.store.forUser(ownerId);
    const take = createTake(templates[0]);
    activate(take, 1_024_000);
    take.monitoringPaused = false;
    take.realPricesAt = new Date().toISOString();
    scoped.putTake(take);
    scoped.upsertAutoPolicy({takeId: take.id, enabled: true, newsTrigger: false, armState: {}});
    const tradeId = 'http-undo-mismatch-1';
    scoped.insertAutoTrade({
      id: tradeId,
      takeId: take.id,
      kind: 'cap',
      day: '2026-10-19',
      status: 'executed',
      executedAt: new Date().toISOString(),
      amount: 12000,
      meta: {source: 'auto', simulated: true, ticker: 'YPF', legs: [{side: 'venta', ticker: 'YPF', units: 10, price: 1200}]},
    });
    const base = await listen(app);
    const headers = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const pausedBefore = scoped.autoPolicy(take.id)?.pausedReason ?? null;
    const auditsBefore = app.store.listAuditLog({limit: 200}).length;
    const previewRes = await fetch(base + `/api/auto/trades/${tradeId}/undo/preview`, {headers});
    const preview = await previewRes.json();
    assert.equal(previewRes.status, 200, JSON.stringify(preview));
    assert.equal(preview.ok, false);
    assert.equal(preview.reason, 'error_libro');
    assert.equal(scoped.autoPolicy(take.id)?.pausedReason ?? null, pausedBefore);
    assert.equal(app.store.listAuditLog({limit: 200}).length, auditsBefore);
  } finally {
    await app.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('HTTP undo preview and fingerprint contract', async () => {
  const dir = tmp();
  const env = {FEATURE_AUTO_SIM: '1'};
  const app = createApp({
    dataDir: dir, password: OWNER_PASSWORD, ownerEmail: OWNER_EMAIL,
    port: 0, host: '127.0.0.1', quotesLive: false, quotesFixture: true,
    autoStartTimer: false, env, quotesMarketOpen: () => true,
  });
  try {
    const ownerId = app.store.ownerUserId();
    app.store.setSetting('autoTrading', {enabled: true, allowUserIds: [ownerId]});
    const scoped = app.store.forUser(ownerId);
    const take = createTake(templates[0]);
    activate(take, 1_024_000);
    take.monitoringPaused = false;
    take.realPricesAt = new Date().toISOString();
    scoped.putTake(take);
    recordActivationOps(scoped, take, {getCached: () => null});
    scoped.upsertAutoPolicy({takeId: take.id, enabled: true, newsTrigger: false, armState: {}});
    const tradeId = 'http-undo-tr-1';
    scoped.insertAutoTrade({
      id: tradeId,
      takeId: take.id,
      kind: 'cap',
      day: '2026-10-19',
      status: 'executed',
      executedAt: new Date().toISOString(),
      amount: 12000,
      meta: {source: 'auto', simulated: true, ticker: 'YPF', legs: [{side: 'venta', ticker: 'YPF', units: 10, price: 1200}]},
    });
    const base = await listen(app);
    const headers = await login(base, OWNER_EMAIL, OWNER_PASSWORD);
    const beforeTrades = scoped.autoTrades().map(row => [row.id, row.status, row.undoTradeId]);
    const beforeVersion = scoped.take(take.id).version;
    const beforeOps = scoped.opsForTake(take.id).map(o => o.id);
    const previewRes = await fetch(base + `/api/auto/trades/${tradeId}/undo/preview`, {headers});
    const preview = await previewRes.json();
    assert.equal(previewRes.status, 200, JSON.stringify(preview));
    assert.equal(typeof preview.ok, 'boolean');
    assert.ok(['line', 'legs', 'pnl', 'partial', 'fingerprint', 'reason'].every(k => k in preview));
    assert.deepEqual(scoped.autoTrades().map(row => [row.id, row.status, row.undoTradeId]), beforeTrades);
    assert.equal(scoped.take(take.id).version, beforeVersion);
    assert.deepEqual(scoped.opsForTake(take.id).map(o => o.id), beforeOps);

    const noFp = await fetch(base + `/api/auto/trades/${tradeId}/undo`, {
      method: 'POST', headers, body: JSON.stringify({version: take.version}),
    });
    const noFpBody = await noFp.json();
    if (preview.ok) {
      assert.equal(noFp.status, 400, JSON.stringify(noFpBody));
      const stale = await fetch(base + `/api/auto/trades/${tradeId}/undo`, {
        method: 'POST', headers,
        body: JSON.stringify({version: take.version, fingerprint: 'stale-fingerprint'}),
      });
      const staleBody = await stale.json();
      assert.equal(stale.status, 409, JSON.stringify(staleBody));
      assert.match(staleBody.error || '', /ya no coincide/i);
    } else {
      assert.ok(preview.reason, JSON.stringify(preview));
      assert.ok([409, 410].includes(noFp.status), JSON.stringify(noFpBody));
    }
  } finally {
    await app.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
