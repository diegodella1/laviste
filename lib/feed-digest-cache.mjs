/** In-memory RSS digest cache (Fase 2 / PR 2D). Shared across users; short TTL. */

export const FEED_DIGEST_TTL_MS = 120_000;

function feedKey(config) {
  const raw = typeof config.listNewsFeeds === 'function'
    ? config.listNewsFeeds({enabled: true})
    : (config.feeds || []);
  const urls = (Array.isArray(raw) ? raw : [])
    .filter(feed => feed && feed.enabled !== false && feed.url)
    .map(feed => String(feed.url))
    .sort();
  return urls.join('|') || '(none)';
}

/**
 * Cache condensed RSS digests only (titles, links, snippets).
 * Never store research/classification — those stay per take / per user.
 */
export function createFeedDigestCache({
  ttlMs = FEED_DIGEST_TTL_MS,
  load,
  now = () => Date.now(),
} = {}) {
  if (typeof load !== 'function') throw new Error('createFeedDigestCache: load required');
  const ttl = Math.max(1000, Number(ttlMs) || FEED_DIGEST_TTL_MS);
  let entry = null;
  let inflight = null;
  let hits = 0;
  let misses = 0;

  async function get(config, {now: at} = {}) {
    const t = at != null ? (typeof at === 'number' ? at : Date.parse(at)) : now();
    const key = feedKey(config);
    if (entry && entry.key === key && (t - entry.at) < ttl) {
      hits += 1;
      return structuredClone(entry.digest);
    }
    if (inflight && inflight.key === key) {
      const digest = await inflight.promise;
      hits += 1;
      return structuredClone(digest);
    }
    misses += 1;
    const pending = Promise.resolve()
      .then(() => load(config, {now: at ?? new Date(t).toISOString()}))
      .then(digest => {
        entry = {key, at: t, digest};
        inflight = null;
        return digest;
      })
      .catch(error => {
        inflight = null;
        throw error;
      });
    inflight = {key, promise: pending};
    const digest = await pending;
    return structuredClone(digest);
  }

  function reset() {
    entry = null;
    inflight = null;
    hits = 0;
    misses = 0;
  }

  function snapshot() {
    return {
      ttlMs: ttl,
      hits,
      misses,
      key: entry?.key || null,
      at: entry?.at || null,
      inflight: !!inflight,
    };
  }

  return {get, reset, snapshot, ttlMs: ttl};
}
