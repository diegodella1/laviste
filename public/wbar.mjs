/** Weight bar — 30% portfolio width = 120px track (Suizo §7). */
const BAR_W = 120;
const SCALE_MAX = 30;

export function weightBarHtml(actualPct, objPct, capPct) {
  const trackW = (capPct / SCALE_MAX) * BAR_W;
  const actualW = (actualPct / SCALE_MAX) * BAR_W;
  const objL = (objPct / SCALE_MAX) * BAR_W;
  const over = actualPct > capPct + 0.05;
  const overTick = over ? `<i class="wbar-over" style="left:${trackW.toFixed(1)}px"></i>` : '';
  return `<span class="wbar" title="actual ${actualPct}% / obj ${objPct}% / tope ${capPct}%"><i class="wbar-track" style="width:${trackW.toFixed(1)}px"></i><i class="wbar-actual" style="width:${Math.min(actualW, BAR_W).toFixed(1)}px"></i><i class="wbar-obj" style="left:${objL.toFixed(1)}px"></i>${overTick}</span>`;
}

export function weightLegendHtml() {
  return `<div class="wlegend"><span><i class="lg-actual"></i> Actual</span><span><i class="lg-obj"></i> Objetivo</span><span><i class="lg-track"></i> Tope (fin de pista)</span><span><i class="lg-tope"></i> Tope superado</span></div>`;
}
