/**
 * In-memory public leaderboard cache.
 * Keyed by (page, generation). Unpublish / alias / recompute bump generation.
 */

export const LEADERBOARD_CACHE_TTL_MS = 60_000;

let generation = 0;
const pages = new Map();

export function leaderboardGeneration() {
  return generation;
}

export function bumpLeaderboardGeneration() {
  generation += 1;
  pages.clear();
  return generation;
}

export function resetLeaderboardGeneration() {
  generation = 0;
  pages.clear();
  return generation;
}

export function leaderboardCacheKey(page, gen = generation) {
  return `${Number(page) || 1}:${gen}`;
}

export function getLeaderboardPageCache(page, {now = Date.now(), ttlMs = LEADERBOARD_CACHE_TTL_MS} = {}) {
  const key = leaderboardCacheKey(page);
  const hit = pages.get(key);
  if (!hit) return null;
  if ((Number(now) - hit.at) >= ttlMs) {
    pages.delete(key);
    return null;
  }
  return structuredClone(hit.payload);
}

export function setLeaderboardPageCache(page, payload, {now = Date.now()} = {}) {
  pages.set(leaderboardCacheKey(page), {at: Number(now), payload: structuredClone(payload)});
}

export function clearLeaderboardPageCache() {
  pages.clear();
}
