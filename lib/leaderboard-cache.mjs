/**
 * In-memory generation for the future public leaderboard cache (LB2).
 * LB1 only bumps it on unpublish so a later GET never serves a stale page.
 */
let generation = 0;

export function leaderboardGeneration() {
  return generation;
}

export function bumpLeaderboardGeneration() {
  generation += 1;
  return generation;
}

export function resetLeaderboardGeneration() {
  generation = 0;
  return generation;
}
