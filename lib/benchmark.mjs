/** Benchmark selection and index-level series for practice takes. */

export const BENCHMARKS = {
  /** Merval: solo Yahoo `^MERV` en fuentes gratuitas probadas; data912 no publica el índice. */
  MERV: {id: 'MERV', label: 'Índice Merval', yahoo: '^MERV'},
  SPY_AR: {id: 'SPY_AR', label: 'CEDEAR SPY (S&P 500)', data912: 'SPY', yahoo: 'SPY.BA'},
};

const LOCAL_BYMA = new Set(['YPF', 'PAM', 'VIST', 'GGAL']);

/** One benchmark per take from asset mix (BYMA locals → Merval; otherwise SPY CEDEAR). */
export function chooseBenchmark(holdings) {
  const weight = ticker => holdings.find(h => h.ticker === ticker)?.weight || 0;
  const localWeight = [...LOCAL_BYMA].reduce((s, t) => s + weight(t), 0);
  const total = holdings.reduce((s, h) => s + h.weight, 0) || 100;
  const localShare = localWeight / total;
  return localShare >= 0.5 ? BENCHMARKS.MERV : BENCHMARKS.SPY_AR;
}

export function indexLevelAt(benchmark, price, basePrice, scaleAmount) {
  if (!basePrice || !price || !scaleAmount) return scaleAmount;
  return Math.round(scaleAmount * (price / basePrice) * 100) / 100;
}

/** Portfolio value used to scale the index line (invested at start, or value at lazy anchor). */
export function indexScaleForTake(take) {
  return take.indexAnchorValue ?? take.invested;
}
