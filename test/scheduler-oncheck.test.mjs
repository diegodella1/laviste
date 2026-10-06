import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {createTake, activate, templates, value} from '../lib/engine.mjs';

test('scheduler check syncs fixture quotes and persists history on the same take row', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oncheck-'));
  const key = join(dir, 'master.key');
  writeFileSync(key, '12'.repeat(32));
  let app;
  try {
    app = createApp({
      dataDir: dir,
      password: 'test-password-only',
      masterKeyPath: key,
      apiKey: 'test-key',
      port: 0,
      host: '127.0.0.1',
      quotesLive: false,
      quotesFixture: true,
      researcher: async take => ({
        id: 'review-oncheck',
        takeId: take.id,
        version: take.version,
        at: new Date().toISOString(),
        sources: [],
        events: [],
        attention: 'watch',
        summary: 'Resumen de chequeo de prueba',
        reason: 'Motivo de prueba',
        resolved: false,
        applied: true,
      }),
    });
    await app.quotes.refresh({force: true});

    const take = createTake(templates[0]);
    activate(take, 1_024_000);
    take.title = 'Título conservado en chequeo';
    take.monitoringPaused = false;
    app.store.putTake(take);

    await app.quotes.refresh({force: true});
    const ready = app.store.take(take.id);
    assert.ok(ready.realPricesAt, 'fixture migration should activate real prices');

    const ypfBefore = ready.holdings.find(h => h.ticker === 'YPF').price;
    app.store.db.prepare('UPDATE quote_cache SET price=? WHERE ticker=?').run(ypfBefore * 1.05, 'YPF');

    const historyBefore = ready.history.length;
    const job = app.scheduler.enqueue(ready);
    await app.scheduler.tick();

    const persisted = app.store.take(take.id);
    assert.equal(persisted.title, 'Título conservado en chequeo');
    assert.equal(app.store.job(job.id).status, 'completed');
    assert.ok(persisted.events.some(e => e.type === 'chequeo'));
    assert.equal(persisted.coverage, 'partial');
    assert.equal(app.store.reviews(take.id)[0].summary, 'Resumen de chequeo de prueba');
    assert.ok(persisted.history.length > historyBefore);
    const point = persisted.history.at(-1);
    assert.equal(point.value, value(persisted));
    assert.ok(point.indexRecorded);
    assert.ok(Number.isFinite(point.index));
    assert.ok(persisted.holdings.find(h => h.ticker === 'YPF').price > ypfBefore);
  } finally {
    await app?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('failed news job marks coverage interrupted without pausing monitoring', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oncheck-fail-'));
  const key = join(dir, 'master.key');
  writeFileSync(key, '12'.repeat(32));
  let app;
  try {
    app = createApp({
      dataDir: dir,
      password: 'test-password-only',
      masterKeyPath: key,
      apiKey: 'test-key',
      port: 0,
      host: '127.0.0.1',
      quotesLive: false,
      quotesFixture: true,
      researcher: async () => {
        throw Object.assign(new Error('OpenAI devolvió una respuesta incompleta.'), {status: 502});
      },
    });
    await app.quotes.refresh({force: true});
    const take = createTake(templates[0]);
    activate(take, 1_024_000);
    take.monitoringPaused = false;
    take.settings.cadence = 'standard';
    app.store.putTake(take);

    const job = app.scheduler.enqueue(take, true);
    await app.scheduler.tick();

    const persisted = app.store.take(take.id);
    assert.equal(app.store.job(job.id).status, 'failed');
    assert.equal(persisted.coverage, 'interrupted');
    assert.equal(persisted.monitoringPaused, false);
    assert.ok(persisted.nextCheckAt, 'next check should remain scheduled when monitoring is active');
  } finally {
    await app?.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
