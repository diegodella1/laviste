import {processOutbox} from './email.mjs';
import {emailEnabled} from './features.mjs';
import {flushPendingAlerts} from './email-alerts.mjs';

/**
 * Email worker: processes outbox at regular intervals.
 * Only runs if FEATURE_EMAIL is enabled.
 * Also flushes pending alert groups.
 */
export function createEmailWorker(store, {
  intervalMs = 60000,
  env = process.env,
  fetcher = fetch,
  startTimer = true,
  now = Date.now,
} = {}) {
  let timer = null;
  let running = false;

  async function tick() {
    if (running || !emailEnabled(env)) return;
    running = true;

    try {
      const apiKey = env.RESEND_API_KEY;
      if (!apiKey) {
        return;
      }

      const flushResult = flushPendingAlerts(store.db, {now});
      if (flushResult.flushed > 0) {
        console.log(JSON.stringify({
          event: 'email_alerts_flushed',
          flushed: flushResult.flushed,
        }));
      }

      const result = await processOutbox(store.db, {
        apiKey,
        fetcher,
        limit: 10,
        now,
        env,
      });

      if (result.processed > 0) {
        console.log(JSON.stringify({
          event: 'email_worker_tick',
          ...result,
        }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: 'email_worker_error',
        error: error.message,
      }));
    } finally {
      running = false;
    }
  }

  function start() {
    if (!emailEnabled(env)) return;
    if (timer) return;
    timer = setInterval(tick, intervalMs);
    timer.unref();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  if (startTimer) start();

  return {
    start,
    stop,
    tick,
    isRunning: () => running,
  };
}
