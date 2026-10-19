/**
 * Automático is simulated money only. No broker, no fetch, no real orders.
 * A real-money ledger path requires a visible schema migration.
 */
export const SIMULATED_ONLY = Object.freeze({value: true});

export function simulatedBit() {
  if (SIMULATED_ONLY.value !== true) {
    throw new Error('Automático writes simulated money only.');
  }
  return 1;
}
