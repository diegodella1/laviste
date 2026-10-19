/**
 * AU3 runner: wires the AU2 pure engine to SQLite I/O.
 * Simulated money only. Writes go through createPendingOrder → confirmPendingOrder.
 */

import {randomUUID} from 'node:crypto';
import {assert, money, value} from '../engine.mjs';
import {booksFromOps, quotesApiFromService} from '../ops.mjs';
import {createPendingOrder, confirmPendingOrder} from '../orders.mjs';
import {adminOf, scopeForTake} from '../store-access.mjs';
import {holdingDerived} from '../portfolio.mjs';
import {formatCapMotivo, formatDriftMotivo} from '../thesis-state.mjs';
import {VERDICT_NO_ACTION} from '../copy.mjs';
import {AUTO_EVENT_REVERSED_TITLE} from '../../public/copy.mjs';
import {SIMULATED_ONLY} from './sim-only.mjs';
import {evaluateAuto, applyQuotesToTake, autoDay, REASONS} from './engine.mjs';
import {autoFeatureOn, autoAllowedForUser, readAutoTrading} from './flags.mjs';

export const AUTO_TICK_MS = 60_000;
const LEDGER_PAUSE = 'error_libro';
const RETRYABLE = new Set([
  REASONS.MERCADO_CERRADO, REASONS.FERIADO, REASONS.COTIZACION_VIEJA,
  REASONS.COTIZACION_FALTANTE, REASONS.COTIZACION_NO_ELEGIBLE, REASONS.PRECIO_NO_SINCRONIZADO,
  REASONS.ORDEN_MANUAL_PENDIENTE, REASONS.IA_EN_PAUSA, REASONS.VERSION_CAMBIADA,
]);
const SOFT_SUPPRESS = new Set([REASONS.USUARIO_SUSPENDIDO, REASONS.IA_EN_PAUSA, REASONS.CANARY_NO_OWNER]);

function nowDate(nowFn) {
  const n = nowFn();
  return n instanceof Date ? n : new Date(n);
}

function asQuotesApi(quotesApi) {
  if (quotesApi && typeof quotesApi.getCached === 'function') return quotesApi;
  return quotesApiFromService(quotesApi);
}

function overlayBooks(take, ops) {
  if (!ops?.length) return take;
  const books = booksFromOps(ops);
  return {
    ...take,
    cash: books.cash,
    invested: books.invested,
    holdings: (take.holdings || []).map(h => ({
      ...h,
      units: books.units[h.ticker] != null ? books.units[h.ticker] : h.units,
    })),
  };
}

function applyLivePrices(take, quotesApi) {
  return applyQuotesToTake(take, quotesApi);
}

function quoteStamp(quotesApi, ticker) {
  const row = typeof quotesApi?.getCached === 'function' ? quotesApi.getCached(ticker) : null;
  if (!row) return null;
  return {provider: row.provider || null, asOf: row.asOf || null};
}

function expectedDelta(legs) {
  const units = {};
  let cash = 0;
  for (const leg of legs || []) {
    if (leg.side === 'venta') {
      cash += Number(leg.amount) || 0;
      units[leg.ticker] = (units[leg.ticker] || 0) - (leg.units || 0);
    } else {
      cash -= Number(leg.amount) || 0;
      units[leg.ticker] = (units[leg.ticker] || 0) + (leg.units || 0);
    }
  }
  return {cash: money(cash), units};
}

function deltasMatch(actual, expected) {
  if (money(actual.cash) !== money(expected.cash)) return false;
  const keys = new Set([...Object.keys(actual.units || {}), ...Object.keys(expected.units || {})]);
  for (const ticker of keys) {
    if ((actual.units[ticker] || 0) !== (expected.units[ticker] || 0)) return false;
  }
  return true;
}

function bumpTake(scoped, take) {
  take.version = (take.version || 1) + 1;
  scoped.version(take);
  scoped.putTake(take);
}

function motivoFor(signal, take) {
  const h = (take.holdings || []).find(row => row.ticker === signal.ticker);
  if (signal.kind === 'cap' && h) {
    const d = holdingDerived(take, h);
    return formatCapMotivo(signal.ticker, d.actual, d.cap);
  }
  if (signal.kind === 'drift' && h) {
    const d = holdingDerived(take, h);
    return formatDriftMotivo(signal.ticker, d.dev, d.drift);
  }
  return take.attentionReason || 'Tesis marcada para revisar.';
}

function pushAutoEvent(take, {type, title, body, meta}) {
  take.events = take.events || [];
  take.events.unshift({
    id: randomUUID(),
    at: new Date().toISOString(),
    type,
    title,
    body,
    source: 'Automático (práctica) · motor de reglas',
    status: take.status,
    verdict: 'none',
    verdictText: VERDICT_NO_ACTION,
    meta: meta || {},
  });
  take.events = take.events.slice(0, 150);
}

function executeLegs(scoped, take, legs, {keyPrefix, quotesApi, extraMeta}) {
  const ops = [];
  const orders = [];
  for (const leg of legs) {
    const suffix = legs.length === 1 ? '' : `:${leg.ticker}`;
    const createKey = `${keyPrefix}${suffix}`;
    const created = createPendingOrder(scoped, take, {
      kind: 'trade', side: leg.side, ticker: leg.ticker, by: 'units', units: leg.units,
    }, createKey);
    const confirmed = confirmPendingOrder(
      scoped, take, created.order.id, asQuotesApi(quotesApi), `${createKey}:confirm`, extraMeta,
    );
    orders.push(confirmed.order);
    ops.push(...(confirmed.ops || []));
  }
  return {ops, orders};
}

function shouldExecute(signal, source) {
  if (signal.status !== 'confirmed') return false;
  if (source === 'news') return false;
  if (source === 'price' && signal.kind === 'broken') return false;
  return true;
}

/**
 * @param {object} opts
 * @param {object} opts.store
 * @param {object} opts.quotesApi getCached / isDemo
 * @param {() => Date|number} [opts.now]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {boolean} [opts.startTimer]
 * @param {object} [opts.inject] test hooks ({failLedger})
 */
export function createAutoRunner({
  store, quotesApi, now = () => Date.now(), env = process.env, startTimer = false, inject = {},
} = {}) {
  assert(SIMULATED_ONLY.value === true, 'Automático writes simulated money only.');
  assert(!arguments[0]?.fetcher, 'createAutoRunner does not accept fetcher.');
  assert(!arguments[0]?.vault, 'createAutoRunner does not accept vault.');
  assert(!arguments[0]?.config?.apiKey, 'createAutoRunner does not accept config.apiKey.');
  assert(store && quotesApi, 'createAutoRunner requires store and quotesApi.');

  const admin = adminOf(store);
  let busy = false;
  let stopped = false;

  function clock() {
    return nowDate(now);
  }

  function audit(scoped, action, target, meta) {
    const writer = scoped?.writeAudit || admin.writeAudit;
    writer?.({
      actorUserId: scoped?.userId || null,
      action,
      target: target || 'auto',
      meta: meta || {},
    });
  }

  function pausePolicy(scoped, takeId, reason, extra = {}) {
    scoped.updateAutoPolicy(takeId, {pausedReason: reason});
    audit(scoped, 'auto.pause', takeId, {reason, ...extra});
  }

  function guardInput(scoped, take, policy, signal, sized) {
    const userId = scoped.userId || policy.userId;
    const autoTrading = readAutoTrading(store);
    const at = clock();
    return {
      take,
      policy,
      quotes: quotesApi,
      now: at,
      user: {id: userId, status: 'active'},
      ownerUserId: admin.ownerUserId?.() || store.ownerUserId?.(),
      autoTrading,
      featureAutoSim: true,
      isDemo: typeof quotesApi.isDemo === 'function' ? quotesApi.isDemo() : !!quotesApi.isDemo,
      holidays: autoTrading.marketHolidays,
      recentAutoTrades: [
        ...(typeof scoped.autoTrades === 'function' ? scoped.autoTrades({limit: 50}) : []),
      ],
      pendingManualOrder: scoped.pendingOrderForTake(take.id),
      takeVersionAtDetect: signal?.meta?.takeVersion,
      ai: typeof admin.budgetState === 'function' ? admin.budgetState() : {paused: false},
      kind: signal?.kind,
      signal,
      sized,
      takeValueAtOpen: value(take),
    };
  }

  function persistSignal(scoped, take, signal) {
    const meta = {...(signal.meta || {}), takeVersion: signal.meta?.takeVersion ?? take.version};
    const existing = scoped.autoSignalBySignature(take.id, signal.signature);
    const row = scoped.upsertAutoSignal({
      id: existing?.id || randomUUID(),
      takeId: take.id,
      kind: signal.kind,
      ticker: signal.ticker,
      signature: signal.signature,
      armEpoch: signal.armEpoch,
      status: signal.status,
      skipReason: signal.reason || null,
      sourceReviewId: signal.sourceReviewId,
      quoteAsOf: signal.quoteAsOf,
      detectedAt: signal.detectedAt || existing?.detectedAt,
      expiresAt: signal.expiresAt,
      meta,
    });
    if ((signal.status === 'expired' || signal.status === 'skipped' || signal.status === 'suppressed')
      && existing?.status !== signal.status) {
      audit(scoped, 'auto.skip', row.id, {reason: signal.reason, kind: signal.kind, takeId: take.id});
    }
    return row;
  }

  function markSkip(scoped, row, reason) {
    if (!row) return;
    const status = SOFT_SUPPRESS.has(reason) ? 'suppressed' : (RETRYABLE.has(reason) ? row.status : 'skipped');
    const keep = RETRYABLE.has(reason) ? (row.status === 'executed' ? 'executed' : 'confirmed') : status;
    const nextStatus = RETRYABLE.has(reason) ? (row.status === 'pending' ? 'pending' : keep) : status;
    if (row.skipReason === reason && row.status === nextStatus) return;
    scoped.updateAutoSignal(row.id, {status: nextStatus, skipReason: reason});
    audit(scoped, 'auto.skip', row.id, {reason, takeId: row.takeId, kind: row.kind});
  }

  function runConfirmed(scoped, take, policy, signalRow, source) {
    const signal = {
      kind: signalRow.kind,
      ticker: signalRow.ticker,
      armEpoch: signalRow.armEpoch,
      sourceReviewId: signalRow.sourceReviewId,
      signature: signalRow.signature,
      status: 'confirmed',
      meta: signalRow.meta || {},
    };
    const decision = evaluateAuto({intent: 'execute', signal, ...guardInput(scoped, take, policy, signal)});
    if (!decision.ok) {
      markSkip(scoped, signalRow, decision.reason);
      return {ok: false, reason: decision.reason};
    }
    const legs = decision.sized.legs || [];
    const takeValueAtOpen = value(take);
    const beforeIds = new Set(scoped.opsForTake(take.id).map(op => op.id));
    const extraMeta = {source: 'auto', simulated: true};
    const {ops, orders} = executeLegs(scoped, take, legs, {
      keyPrefix: `auto:${signalRow.id}`,
      quotesApi,
      extraMeta,
    });
    const fresh = scoped.opsForTake(take.id).filter(op => !beforeIds.has(op.id));
    const delta = booksFromOps(fresh);
    if (inject.failLedger || !deltasMatch(delta, expectedDelta(legs))) {
      throw Object.assign(new Error('El libro no coincide con la vista previa de Automático.'), {
        status: 500, code: LEDGER_PAUSE,
      });
    }
    const at = clock().toISOString();
    const trade = scoped.insertAutoTrade({
      id: randomUUID(),
      takeId: take.id,
      signalId: signalRow.id,
      kind: signal.kind,
      day: autoDay(clock()),
      status: 'executed',
      orderId: orders[0]?.id || null,
      batchId: ops[0]?.batchId || null,
      executedAt: at,
      amount: decision.sized.amount,
      meta: {
        source: 'auto',
        simulated: true,
        ticker: signal.ticker,
        legs,
        takeValueAtOpen,
        orderIds: orders.map(o => o.id),
      },
    });
    scoped.updateAutoSignal(signalRow.id, {status: 'executed', skipReason: null, meta: signalRow.meta});
    const line = legs.map(l => l.line).filter(Boolean).join(' · ') || 'Operación de práctica';
    pushAutoEvent(take, {
      type: 'auto_trade',
      title: `${legs[0]?.side === 'compra' ? 'Compra' : 'Venta'} de práctica · Automático`,
      body: `${line}. Motivo: ${motivoFor(signal, take)}. No se enviaron órdenes a un broker.`,
      meta: {
        autoTradeId: trade.id, signal: {kind: signal.kind, ticker: signal.ticker},
        undoable: true, source: source || 'tick',
        quote: quoteStamp(quotesApi, signal.ticker),
      },
    });
    if (decision.pauseAfter) {
      scoped.updateAutoPolicy(take.id, {
        pausedReason: decision.pauseAfter,
        armState: policy.armState,
      });
      audit(scoped, 'auto.pause', take.id, {reason: decision.pauseAfter});
    }
    bumpTake(scoped, take);
    audit(scoped, 'auto.trade', trade.id, {
      takeId: take.id, kind: signal.kind, ticker: signal.ticker, amount: trade.amount, simulated: true,
    });
    return {ok: true, trade, ops, orders};
  }

  function latestReview(scoped, takeId) {
    const rows = scoped.reviews(takeId) || [];
    return rows[0] || null;
  }

  function processTake(takeId, {source = 'tick'} = {}) {
    if (stopped || busy || !autoFeatureOn(store, env)) return null;
    busy = true;
    try {
      return processTakeUnlocked(takeId, source);
    } finally {
      busy = false;
    }
  }

  function processTakeUnlocked(takeId, source) {
    const policyRow = admin.autoPolicy(takeId);
    if (!policyRow?.enabled) return null;

    const scoped = scopeForTake(store, takeId);
    if (!scoped) {
      const pending = admin.autoSignalsForTake(takeId).filter(s => s.status === 'pending' || s.status === 'confirmed');
      for (const row of pending) {
        admin.updateAutoSignal(row.id, {status: 'suppressed', skipReason: REASONS.USUARIO_SUSPENDIDO});
        audit(admin, 'auto.skip', row.id, {reason: REASONS.USUARIO_SUSPENDIDO, takeId});
      }
      return {ok: false, reason: REASONS.USUARIO_SUSPENDIDO};
    }
    if (!autoAllowedForUser(store, scoped.userId, env)) return {ok: false, reason: REASONS.CANARY_NO_OWNER};

    const policy = scoped.autoPolicy(takeId) || policyRow;
    if (!policy.enabled) return null;
    if (policy.pausedReason === LEDGER_PAUSE) return {ok: false, reason: LEDGER_PAUSE};

    let take = scoped.take(takeId);
    if (!take) return null;
    take = overlayBooks(take, scoped.opsForTake(takeId));
    take = applyLivePrices(take, quotesApi);

    const at = clock();
    const derived = evaluateAuto({
      intent: 'derive',
      take,
      quotes: quotesApi,
      latestReview: latestReview(scoped, takeId),
      armState: policy.armState,
      now: at,
      policy,
      pendingSignals: scoped.autoSignalsForTake(takeId)
        .filter(s => s.status === 'pending' || s.status === 'confirmed'),
      recentAutoTrades: scoped.autoTradesForTake(takeId),
      holidays: readAutoTrading(store).marketHolidays,
    });

    const results = [];
    try {
      scoped.transaction(() => {
        const live = scoped.take(takeId);
        if (!live) return;
        const working = applyLivePrices(overlayBooks(live, scoped.opsForTake(takeId)), quotesApi);
        scoped.updateAutoPolicy(takeId, {armState: derived.nextArmState});
        for (const signal of derived.signals || []) {
          const row = persistSignal(scoped, working, signal);
          if (row.status === 'executed') continue;
          if (!shouldExecute(signal, source)) continue;
          const out = runConfirmed(scoped, working, {...policy, armState: derived.nextArmState}, row, source);
          results.push(out);
        }
      });
    } catch (error) {
      if (error?.code === LEDGER_PAUSE) {
        scoped.transaction(() => pausePolicy(scoped, takeId, LEDGER_PAUSE, {detail: error.message}));
        return {ok: false, reason: LEDGER_PAUSE, rolledBack: true};
      }
      throw error;
    }
    return {ok: true, results, signals: derived.signals, blocks: derived.blocks};
  }

  function onSynced(takeId) {
    return processTake(takeId, {source: 'price'});
  }

  function onReview(takeId) {
    return processTake(takeId, {source: 'news'});
  }

  function tick() {
    if (stopped || !autoFeatureOn(store, env)) return;
    for (const policy of admin.enabledAutoPolicies()) {
      try {
        processTake(policy.takeId, {source: 'tick'});
      } catch (error) {
        if (error?.code !== LEDGER_PAUSE) {
          console.error(JSON.stringify({event: 'auto_tick_failed', takeId: policy.takeId, type: error?.name}));
        }
      }
    }
  }

  function loadUndoContext(scoped, tradeId, {version} = {}) {
    assert(autoFeatureOn(store, env), 'No encontrado.', 404);
    assert(scoped?.userId && autoAllowedForUser(store, scoped.userId, env), 'No encontrado.', 404);
    const trade = scoped.autoTrade(tradeId);
    assert(trade, 'No encontramos esa operación.', 404);
    let take = scoped.take(trade.takeId);
    assert(take, 'No encontramos esa tesis.', 404);
    if (version != null) {
      assert(Number.isInteger(version) && version === take.version, 'La tesis cambió. Actualizá la vista e intentá de nuevo.', 409);
    }
    const existingUndo = (scoped.autoTradesForTake(take.id) || []).find(row => row.kind === 'undo' && row.reversesId === tradeId);
    take = applyLivePrices(overlayBooks(take, scoped.opsForTake(take.id)), quotesApi);
    const policy = scoped.autoPolicy(take.id);
    assert(policy, 'Automático no está configurado en esta tesis.', 404);
    const decision = evaluateAuto({
      intent: 'undo',
      trade,
      ...guardInput(scoped, take, policy, {kind: 'undo', ticker: trade.meta?.ticker}),
    });
    return {trade, take, policy, existingUndo, decision};
  }

  function previewUndo(scoped, tradeId, opts = {}) {
    const {existingUndo, decision} = loadUndoContext(scoped, tradeId, opts);
    if (existingUndo) {
      return {
        ok: false, line: '', legs: [], pnl: 0, partial: false, fingerprint: null,
        reason: REASONS.YA_DESHECHO,
      };
    }
    return {
      ok: !!decision.ok,
      line: decision.line || '',
      legs: decision.filled || [],
      pnl: decision.pnl ?? 0,
      partial: !!decision.partial,
      fingerprint: decision.fingerprint || null,
      reason: decision.reason || null,
    };
  }

  function undoTrade(scoped, tradeId, {version, fingerprint} = {}) {
    const {trade, take, existingUndo, decision} = loadUndoContext(scoped, tradeId, {version});
    if (existingUndo) return {replay: true, trade: existingUndo};
    if (!decision.ok) {
      const status = decision.reason === REASONS.VENTANA_DESHACER_VENCIDA ? 410 : 409;
      throw Object.assign(new Error(decision.reason || 'No se pudo deshacer.'), {status, code: decision.reason});
    }
    assert(fingerprint, 'Armá la vista previa antes de deshacer.', 400);
    if (fingerprint !== decision.fingerprint) {
      throw Object.assign(new Error('La vista previa ya no coincide. Armala de nuevo.'), {status: 409});
    }
    const legs = decision.filled || [];
    let result;
    try {
      scoped.transaction(() => {
        const live = applyLivePrices(overlayBooks(scoped.take(take.id), scoped.opsForTake(take.id)), quotesApi);
        const beforeIds = new Set(scoped.opsForTake(live.id).map(op => op.id));
        const extraMeta = {source: 'auto-undo', simulated: true, reverses: tradeId};
        const {ops, orders} = executeLegs(scoped, live, legs, {
          keyPrefix: `auto-undo:${tradeId}`,
          quotesApi,
          extraMeta,
        });
        const fresh = scoped.opsForTake(live.id).filter(op => !beforeIds.has(op.id));
        if (inject.failLedger || !deltasMatch(booksFromOps(fresh), expectedDelta(legs))) {
          throw Object.assign(new Error('El libro no coincide con la vista previa de Automático.'), {
            status: 500, code: LEDGER_PAUSE,
          });
        }
        const at = clock().toISOString();
        const undoRow = scoped.insertAutoTrade({
          id: randomUUID(),
          takeId: live.id,
          signalId: null,
          kind: 'undo',
          day: autoDay(clock()),
          status: 'executed',
          orderId: orders[0]?.id || null,
          batchId: ops[0]?.batchId || null,
          reversesId: tradeId,
          executedAt: at,
          amount: decision.amount,
          meta: {
            source: 'auto-undo', simulated: true, reverses: tradeId, legs, pnl: decision.pnl, partial: decision.partial,
          },
        });
        scoped.updateAutoTrade(tradeId, {
          status: decision.partial ? 'partially_reversed' : 'reversed',
          undoTradeId: undoRow.id,
        });
        pushAutoEvent(live, {
          type: 'auto_trade_reversed',
          title: AUTO_EVENT_REVERSED_TITLE,
          body: `${decision.line}. No se enviaron órdenes a un broker.`,
          meta: {autoTradeId: undoRow.id, reverses: tradeId, pnl: decision.pnl, partial: decision.partial},
        });
        bumpTake(scoped, live);
        audit(scoped, 'auto.undo', undoRow.id, {
          takeId: live.id, reverses: tradeId, pnl: decision.pnl, partial: decision.partial, simulated: true,
        });
        result = {replay: false, trade: undoRow, take: live, ops, preview: decision};
      });
    } catch (error) {
      if (error?.code === LEDGER_PAUSE) {
        scoped.transaction(() => pausePolicy(scoped, take.id, LEDGER_PAUSE));
      }
      throw error;
    }
    return result;
  }

  const timer = startTimer ? setInterval(() => {
    try { tick(); } catch { /* keep last */ }
  }, AUTO_TICK_MS) : null;
  timer?.unref?.();

  return {
    onSynced,
    onReview,
    tick,
    processTake,
    previewUndo,
    undoTrade,
    close() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
