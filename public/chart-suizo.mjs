import {moneyCompactArsAxis, moneyCompactM} from './format.mjs';

const padL = 52;
const padR = 68;
const padT = 14;
const padB = 28;

function dayMonthTick(at) {
  const d = new Date(at);
  const day = d.toLocaleDateString('es-AR', {
    day: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
  const mon = d
    .toLocaleDateString('es-AR', {month: 'short', timeZone: 'America/Argentina/Buenos_Aires'})
    .replace('.', '');
  return `${day} ${mon}`;
}

function formatY(v, valueScale) {
  return valueScale === 'index' ? moneyCompactM(v) : moneyCompactArsAxis(v);
}

export function drawChartHost(host, {history, capital, compareKey = null, label = 'Evolución', valueScale = 'ars', flatCapital = false}) {
  if (!host || !history?.length || history.length < 2) return;
  const h = parseInt(host.getAttribute('data-h') || '230', 10);
  const w = Math.max(280, Math.floor(host.clientWidth || host.parentElement?.clientWidth || 640));
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const vals = history.flatMap(p => {
    if (compareKey === 'index') return [p.value, p.index ?? p.benchmark];
    if (compareKey === 'benchmark' && !flatCapital) return [p.value, p.benchmark ?? capital];
    return [p.value];
  });
  if (capital != null) vals.push(capital);
  let ymin = Math.min(...vals);
  let ymax = Math.max(...vals);
  const pad = Math.max((ymax - ymin) * 0.08, ymax * 0.002, valueScale === 'index' ? 0.5 : 1000);
  ymin -= pad;
  ymax += pad;
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
  if (compareKey === 'benchmark' && capital != null && (flatCapital || valueScale === 'ars')) {
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
  }
  const ptsV = history.map((p, i) => `${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
  parts.push(`<polyline fill="none" stroke="${accent}" stroke-width="1.85" points="${ptsV}"/>`);
  const ex = X(n - 1);
  const ey = Y(history[n - 1].value);
  parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="2.75" fill="${accent}"/>`);
  let cLabY = capital != null ? Y(capital) + 4 : ey + 16;
  let vLabY = ey + 4;
  if (capital != null && Math.abs(ey - Y(capital)) < 16) {
    cLabY = Y(capital) + 16;
    vLabY = ey - 4;
  }
  parts.push(`<text class="end-label valor" x="${(ex + 10).toFixed(1)}" y="${vLabY.toFixed(1)}" fill="${accent}">Valor</text>`);
  if (capital != null || compareKey) {
    parts.push(`<text class="end-label capital" x="${(ex + 10).toFixed(1)}" y="${cLabY.toFixed(1)}" fill="${muted}">Capital</text>`);
  }
  const tickIdx = [0, Math.floor((n - 1) / 5), Math.floor((2 * (n - 1)) / 5), Math.floor((3 * (n - 1)) / 5), Math.floor((4 * (n - 1)) / 5), n - 1];
  const seenX = new Set();
  for (const i of tickIdx) {
    const lab = dayMonthTick(history[i].at);
    if (seenX.has(lab)) continue;
    seenX.add(lab);
    parts.push(`<text class="tick" x="${X(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" fill="${muted}">${lab}</text>`);
  }
  parts.push('</svg>');
  host.innerHTML = parts.join('');
  host.dataset.lastValue = String(Math.round(history[n - 1].value));
  host.dataset.yTicks = yTickLabels.join('|');
  host.dataset.valueScale = valueScale;
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
