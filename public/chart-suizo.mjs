import {moneyCompactArsAxis, moneyCompactM, uniqueArsAxisLabels, money, signedMoney, artShortDayMonth} from './format.mjs';
import {artChartDayLabel} from './timeline.mjs';
import {chartAriaSummary} from './chart-copy.mjs';

export const CHART_END_VALOR = 'Valor';
export const CHART_END_APORTADO = 'Aportado';
export const X_TICK_MAX_DESKTOP = 8;
export const X_TICK_MAX_MOBILE = 4;

export const CHART_PAD_L = 76;
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
    padL: width < 360 ? 60 : CHART_PAD_L,
    padR: showEnd ? CHART_PAD_R_WIDE : CHART_PAD_R_COMPACT,
    padT: CHART_PAD_T,
    padB: CHART_PAD_B,
  };
}

function xTickMax(width) {
  return width < 640 ? X_TICK_MAX_MOBILE : X_TICK_MAX_DESKTOP;
}

function capTickCount(idx, maxTicks) {
  if (idx.length <= maxTicks) return idx;
  if (maxTicks <= 1) return [idx[0]];
  const out = [];
  for (let k = 0; k < maxTicks; k++) {
    const i = Math.round(k * (idx.length - 1) / (maxTicks - 1));
    const v = idx[i];
    if (!out.includes(v)) out.push(v);
  }
  if (out[0] !== idx[0]) out[0] = idx[0];
  if (out[out.length - 1] !== idx[idx.length - 1]) out[out.length - 1] = idx[idx.length - 1];
  return out;
}

/** Pick X-axis label indices with at least minGapPx between label centers. */
export function pickXTickIndices(n, plotWidthPx, minGapPx = X_TICK_MIN_PX, padLeft = CHART_PAD_L, padRight = CHART_PAD_R_COMPACT, maxTicks = Infinity) {
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
  return capTickCount(out, maxTicks);
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
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--lv-accent').trim() || '#3B82F6';
  const mutedText = getComputedStyle(document.documentElement).getPropertyValue('--lv-muted').trim() || '#475569';
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--lv-muted-2').trim() || '#94A3B8';
  const line = getComputedStyle(document.documentElement).getPropertyValue('--lv-line').trim() || '#E2E8F0';
  const gridSteps = 4;
  const parts = [];
  parts.push(`<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible" role="img" aria-label="${label}">`);
  const yValues = [];
  for (let g = 0; g <= gridSteps; g++) yValues.push(ymin + ((ymax - ymin) * g) / gridSteps);
  const yTickLabels = valueScale === 'index'
    ? yValues.map(v => formatY(v, valueScale))
    : uniqueArsAxisLabels(yValues);
  for (let g = 0; g <= gridSteps; g++) {
    const gv = yValues[g];
    const yy = Y(gv);
    parts.push(`<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${padL + plotW}" y2="${yy.toFixed(1)}" stroke="${line}" stroke-width="1"/>`);
    const lab = yTickLabels[g];
    parts.push(`<text class="tick" x="0" y="${(yy + 4).toFixed(1)}" text-anchor="start" fill="${mutedText}">${lab}</text>`);
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
  const baseY = (padT + plotH).toFixed(1);
  const area = `${X(0).toFixed(1)},${baseY} ${ptsV} ${X(n - 1).toFixed(1)},${baseY}`;
  parts.push(`<polygon class="chart-area" points="${area}" fill="${accent}" fill-opacity="0.06"/>`);
  parts.push(`<polyline fill="none" stroke="${accent}" stroke-width="2" points="${ptsV}"/>`);
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
  if (showEnd) {
    if (capitalEnd != null && capitalEnd > 0 && Math.abs(ey - Y(capitalEnd)) < 22) {
      cLabY = Y(capitalEnd) + 18;
      vLabY = ey - 8;
    }
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--lv-ink').trim() || '#0F172A';
    parts.push(`<text class="end-label valor" x="${(ex + 10).toFixed(1)}" y="${vLabY.toFixed(1)}" fill="${ink}" font-weight="600">${CHART_END_VALOR}</text>`);
    if (capital != null || compareKey) {
      parts.push(`<text class="end-label capital" x="${(ex + 10).toFixed(1)}" y="${cLabY.toFixed(1)}" fill="${mutedText}">${CHART_END_APORTADO}</text>`);
    }
  }
  const tickIdx = pickXTickIndices(n, w, X_TICK_MIN_PX, padL, padR, xTickMax(w));
  const seenLab = new Set();
  for (const i of tickIdx) {
    const lab = artChartDayLabel(history[i].at);
    if (seenLab.has(lab)) continue;
    seenLab.add(lab);
    parts.push(`<text class="tick" x="${X(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" fill="${mutedText}">${lab}</text>`);
  }
  parts.push('</svg>');
  const summary = chartAriaSummary(history);
  host.innerHTML = `<figure class="chart-figure"><div class="chart-svg-wrap">${parts.join('')}</div><figcaption class="visually-hidden">${summary}</figcaption><div class="chart-guide" hidden></div><div class="chart-tip" hidden></div></figure>`;
  host.dataset.lastValue = String(Math.round(history[n - 1].value));
  host.dataset.yTicks = yTickLabels.join('|');
  host.dataset.valueScale = valueScale;
  host.dataset.endLabels = showEnd ? '1' : '0';
  host.dataset.pad = `${padL},${padR}`;
  bindChartCursor(host, {history, capital, X, Y, padL, padR, padT, plotW, plotH, n, w, h});
}

function bindChartCursor(host, {history, capital, X, Y, padL, plotW, n}) {
  const svg = host.querySelector('svg');
  const tip = host.querySelector('.chart-tip');
  const guide = host.querySelector('.chart-guide');
  if (!svg || !tip || !guide) return;
  const hide = () => {
    tip.hidden = true;
    guide.hidden = true;
  };
  const showAt = i => {
    const p = history[i];
    if (!p) return hide();
    const x = X(i);
    const y = Y(p.value);
    const contributed = Number.isFinite(Number(p.benchmark)) ? Number(p.benchmark) : capital;
    const diff = Number.isFinite(contributed) ? p.value - contributed : null;
    const diffBit = diff == null ? '' : ` · ${signedMoney(diff)} vs. aportado`;
    tip.hidden = false;
    guide.hidden = false;
    guide.style.left = `${x}px`;
    tip.style.left = `${Math.min(Math.max(8, x - 70), host.clientWidth - 160)}px`;
    tip.style.top = `${Math.max(8, y - 48)}px`;
    tip.innerHTML = `<b>${artShortDayMonth(p.at)}</b><span>${money(p.value)}</span>${diffBit ? `<span>${diffBit}</span>` : ''}`;
  };
  const indexFromEvent = ev => {
    const r = svg.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const t = (x - padL) / plotW;
    return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
  };
  svg.addEventListener('pointermove', ev => showAt(indexFromEvent(ev)));
  svg.addEventListener('pointerdown', ev => showAt(indexFromEvent(ev)));
  svg.addEventListener('pointerleave', hide);
}

let paintRaf = 0;
let chartRO = null;
let chartMO = null;

export function paintAllCharts() {
  document.querySelectorAll('.chart-host[data-ready="1"]').forEach(host => {
    try {
      const data = JSON.parse(host.getAttribute('data-chart') || '{}');
      drawChartHost(host, data);
    } catch {}
  });
}

export function watchChartHosts() {
  if (typeof ResizeObserver === 'undefined') return;
  if (!chartRO) chartRO = new ResizeObserver(() => scheduleChartPaint());
  document.querySelectorAll('.chart-host[data-ready="1"]').forEach(el => {
    if (!el.dataset.ro) {
      el.dataset.ro = '1';
      chartRO.observe(el);
    }
  });
}

export function scheduleChartPaint() {
  if (paintRaf) return;
  paintRaf = requestAnimationFrame(() => {
    paintRaf = 0;
    watchChartHosts();
    paintAllCharts();
  });
}

function bindAppObserver() {
  const root = document.getElementById('app');
  if (!root || chartMO) return;
  chartMO = new MutationObserver(watchChartHosts);
  chartMO.observe(root, {childList: true});
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', scheduleChartPaint);
  bindAppObserver();
  watchChartHosts();
}
