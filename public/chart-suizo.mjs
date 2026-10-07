import {moneyCompactArsAxis, moneyCompactM} from './format.mjs';
import {artChartDayLabel} from './timeline.mjs';

export const CHART_PAD_L = 52;
export const CHART_PAD_R_WIDE = 92;
export const CHART_PAD_R_COMPACT = 28;
export const CHART_PAD_T = 14;
export const CHART_PAD_B = 28;
export const X_TICK_MIN_PX = 56;
export const CHART_END_LABEL_MIN_PX = 640;

/** End labels (“Valor” / “Capital aportado”) only when the plot is wide enough. */
export function chartShowEndLabels(width) {
  return width >= CHART_END_LABEL_MIN_PX;
}

/** Padding for a given host width. Compact right pad on 360/390 so labels stay inside. */
export function chartPads(width, {endLabels} = {}) {
  const showEnd = endLabels ?? chartShowEndLabels(width);
  return {
    padL: width < 360 ? 48 : CHART_PAD_L,
    padR: showEnd ? CHART_PAD_R_WIDE : CHART_PAD_R_COMPACT,
    padT: CHART_PAD_T,
    padB: CHART_PAD_B,
  };
}

/** Pick X-axis label indices with at least minGapPx between label centers. */
export function pickXTickIndices(n, plotWidthPx, minGapPx = X_TICK_MIN_PX, padLeft = CHART_PAD_L, padRight = CHART_PAD_R_COMPACT) {
  if (n <= 1) return [0];
  const plotW = plotWidthPx - padLeft - padRight;
  const X = i => padLeft + (i / (n - 1)) * plotW;
  const out = [0];
  let lastX = X(0);
  for (let i = 1; i < n - 1; i++) {
    const x = X(i);
    if (x - lastX >= minGapPx) {
      out.push(i);
      lastX = x;
    }
  }
  const last = n - 1;
  const xLast = X(last);
  if (out[out.length - 1] !== last) {
    if (xLast - lastX < minGapPx && out.length > 1) out[out.length - 1] = last;
    else out.push(last);
  }
  return out;
}

function formatY(v, valueScale) {
  return valueScale === 'index' ? moneyCompactM(v) : moneyCompactArsAxis(v);
}

/** Y-axis domain for Suizo charts: padded around visible value + capital, not pinned at $0 when series sit in a band. */
export function computeChartYExtents(vals, valueScale = 'ars', paddingRatio = 0.1) {
  if (!vals.length) return {ymin: 0, ymax: 1};
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  let ymin = rawMin;
  let ymax = rawMax;
  const span = ymax - ymin;
  const floorPad = valueScale === 'index' ? 0.5 : Math.max(rawMax * 0.002, 1000);
  const pad = Math.max(span * paddingRatio, floorPad);
  ymin -= pad;
  ymax += pad;
  if (ymax <= ymin) ymax = ymin + floorPad * 2;
  if (valueScale === 'ars' && ymin < 0 && rawMin >= 0) {
    if (rawMin <= rawMax * 0.08) ymin = 0;
  }
  return {ymin, ymax};
}

export function drawChartHost(host, {history, capital, compareKey = null, label = 'Evolución', valueScale = 'ars', flatCapital = false}) {
  if (!host || !history?.length || history.length < 2) return;
  const h = parseInt(host.getAttribute('data-h') || '230', 10);
  const w = Math.max(280, Math.floor(host.clientWidth || host.parentElement?.clientWidth || 640));
  const showEnd = chartShowEndLabels(w);
  const {padL, padR, padT, padB} = chartPads(w, {endLabels: showEnd});
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const vals = history.flatMap(p => {
    if (compareKey === 'index') return [p.value, p.index ?? p.benchmark];
    if (compareKey === 'benchmark' && !flatCapital) return [p.value, p.benchmark ?? capital];
    return [p.value];
  });
  if (capital != null) vals.push(capital);
  const {ymin, ymax} = computeChartYExtents(vals, valueScale, 0.1);
  const n = history.length;
  const X = i => padL + (i / (n - 1)) * plotW;
  const Y = v => padT + (1 - (v - ymin) / (ymax - ymin)) * plotH;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--lv-accent').trim() || '#1F3FD1';
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--lv-muted-2').trim() || '#737373';
  const line = getComputedStyle(document.documentElement).getPropertyValue('--lv-line').trim() || '#E5E5E5';
  const gridSteps = 4;
  const parts = [];
  parts.push(`<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible" role="img" aria-label="${label}">`);
  const yTickLabels = [];
  for (let g = 0; g <= gridSteps; g++) {
    const gv = ymin + ((ymax - ymin) * g) / gridSteps;
    const yy = Y(gv);
    parts.push(`<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${padL + plotW}" y2="${yy.toFixed(1)}" stroke="${line}" stroke-width="1"/>`);
    const lab = formatY(gv, valueScale);
    yTickLabels.push(lab);
    parts.push(`<text class="tick" x="${padL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" fill="${muted}">${lab}</text>`);
  }
  if (compareKey === 'benchmark' && capital != null && flatCapital) {
    const yCap = Y(capital);
    parts.push(
      `<line x1="${padL}" y1="${yCap.toFixed(1)}" x2="${(padL + plotW).toFixed(1)}" y2="${yCap.toFixed(1)}" stroke="${muted}" stroke-width="1.35" stroke-dasharray="4 3.5"/>`
    );
  } else if (compareKey === 'index') {
    const ptsC = history.map((p, i) => `${X(i).toFixed(1)},${Y(p.index ?? p.benchmark ?? capital).toFixed(1)}`).join(' ');
    parts.push(`<polyline fill="none" stroke="${muted}" stroke-width="1.35" stroke-dasharray="4 3.5" points="${ptsC}"/>`);
  } else if (compareKey === 'benchmark' && capital == null) {
    const ptsC = history.map((p, i) => `${X(i).toFixed(1)},${Y(p.benchmark).toFixed(1)}`).join(' ');
    parts.push(`<polyline fill="none" stroke="${muted}" stroke-width="1.35" stroke-dasharray="4 3.5" points="${ptsC}"/>`);
  } else if (compareKey === 'benchmark' && !flatCapital) {
    const stepPts = [];
    for (let i = 0; i < history.length; i++) {
      const yVal = history[i].benchmark ?? capital;
      if (i > 0) stepPts.push(`${X(i).toFixed(1)},${Y(history[i - 1].benchmark ?? capital).toFixed(1)}`);
      stepPts.push(`${X(i).toFixed(1)},${Y(yVal).toFixed(1)}`);
    }
    parts.push(`<polyline fill="none" stroke="${muted}" stroke-width="1.35" stroke-dasharray="4 3.5" points="${stepPts.join(' ')}"/>`);
  }
  const ptsV = history.map((p, i) => `${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
  parts.push(`<polyline fill="none" stroke="${accent}" stroke-width="1.85" points="${ptsV}"/>`);
  const ex = X(n - 1);
  const ey = Y(history[n - 1].value);
  parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="2.75" fill="${accent}"/>`);
  const capitalEnd = compareKey === 'benchmark' && !flatCapital
    ? Math.max(capital ?? 0, history[n - 1].benchmark ?? 0)
    : capital;
  let cLabY = capitalEnd != null && capitalEnd > 0 ? Y(capitalEnd) + 4 : ey + 16;
  let vLabY = ey + 4;
  if (capitalEnd != null && capitalEnd > 0 && Math.abs(ey - Y(capitalEnd)) < 16) {
    cLabY = Y(capitalEnd) + 16;
    vLabY = ey - 4;
  }
  const endTooClose = capitalEnd != null && capitalEnd > 0 && Math.abs(ey - Y(capitalEnd)) < 22;
  if (showEnd && !endTooClose) {
    parts.push(`<text class="end-label valor" x="${(ex + 10).toFixed(1)}" y="${vLabY.toFixed(1)}" fill="${accent}">Valor</text>`);
    if (capital != null || compareKey) {
      parts.push(`<text class="end-label capital" x="${(ex + 10).toFixed(1)}" y="${cLabY.toFixed(1)}" fill="${muted}">Capital aportado</text>`);
    }
  }
  const tickIdx = pickXTickIndices(n, w, X_TICK_MIN_PX, padL, padR);
  const seenLab = new Set();
  for (const i of tickIdx) {
    const lab = artChartDayLabel(history[i].at);
    if (seenLab.has(lab)) continue;
    seenLab.add(lab);
    parts.push(`<text class="tick" x="${X(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" fill="${muted}">${lab}</text>`);
  }
  parts.push('</svg>');
  host.innerHTML = parts.join('');
  host.dataset.lastValue = String(Math.round(history[n - 1].value));
  host.dataset.yTicks = yTickLabels.join('|');
  host.dataset.valueScale = valueScale;
  host.dataset.endLabels = showEnd ? '1' : '0';
  host.dataset.pad = `${padL},${padR}`;
}

let resizeTimer;
export function paintAllCharts() {
  document.querySelectorAll('.chart-host[data-ready="1"]').forEach(host => {
    try {
      const data = JSON.parse(host.getAttribute('data-chart') || '{}');
      drawChartHost(host, data);
    } catch {}
  });
}

export function scheduleChartPaint() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    paintAllCharts();
    requestAnimationFrame(() => {
      paintAllCharts();
      setTimeout(paintAllCharts, 120);
    });
  }, 0);
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', scheduleChartPaint);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => scheduleChartPaint());
    const watch = () => {
      document.querySelectorAll('.chart-host[data-ready="1"]').forEach(el => {
        if (!el.dataset.ro) {
          el.dataset.ro = '1';
          ro.observe(el);
        }
      });
    };
    watch();
    new MutationObserver(watch).observe(document.documentElement, {childList: true, subtree: true});
  }
}
