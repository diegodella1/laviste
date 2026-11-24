/**
 * Dependency-free sparkline PNG renderer for the «Cierre del día» digest.
 * Port of the DesignBot generator (sparklines/make_sparklines.py, 2026-11-16):
 * RGBA transparent, 2x (192×56) shown at 96×28, 2 px line, 2.5 px end dot,
 * dotted baseline at the week's opening value, minimum range ±0.5 pp.
 * Encoded with node:zlib only (no canvas/sharp).
 */

import {deflateSync, crc32} from 'node:zlib';
import {createHash} from 'node:crypto';

export const SPARK_W = 96;
export const SPARK_H = 28;
export const SPARK_SCALE = 2;
const PAD = 3;
const SS = 4; // supersampling per axis
// Same fills as the mock (≥ 3:1 vs #FFFFFF and #1E293B).
export const SPARK_COLORS = Object.freeze({
  up: [5, 150, 105],
  down: [239, 68, 68],
  flat: [100, 116, 139],
});
const BASE_RGBA = [148, 163, 184, 140];

function round1(x) {
  const r = Math.round(x * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

/** Trend from the week rounded to 1 decimal (in % points), so color matches «Semana {%}». */
export function sparkTrend(seriesPct) {
  if (!Array.isArray(seriesPct) || seriesPct.length < 2) return 'flat';
  const w = round1(seriesPct[seriesPct.length - 1] - seriesPct[0]);
  return w === 0 ? 'flat' : (w > 0 ? 'up' : 'down');
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Render a series of cumulative % points (e.g. [0, 0.6, 1.1, 0.2, 0.9, -3.2]) as PNG bytes.
 * @returns {Buffer|null} PNG, or null when the series has fewer than 3 finite points.
 */
export function renderSparklinePng(seriesPct) {
  const series = (seriesPct || []).filter(Number.isFinite);
  if (series.length < 3) return null;
  const W = SPARK_W * SPARK_SCALE;
  const H = SPARK_H * SPARK_SCALE;
  const k = SPARK_SCALE;
  let lo = Math.min(...series);
  let hi = Math.max(...series);
  if (hi - lo < 1.0) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  }
  const pts = series.map((v, i) => [
    (PAD + i * (SPARK_W - 2 * PAD - 2) / (series.length - 1)) * k,
    (PAD + (hi - v) * (SPARK_H - 2 * PAD) / (hi - lo)) * k,
  ]);
  const y0 = pts[0][1];
  const halfLine = 1 * k; // 2 px line
  const dotR = 2.5 * k;
  const [er, eg, eb] = SPARK_COLORS[sparkTrend(series)];
  const [ex, ey] = pts[pts.length - 1];

  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    const rowStart = y * (W * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      let lineCov = 0;
      let baseCov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          let hit = Math.hypot(px - ex, py - ey) <= dotR;
          for (let i = 1; !hit && i < pts.length; i++) {
            if (distToSegment(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= halfLine) hit = true;
          }
          if (hit) lineCov++;
          // dotted baseline: 3 px dash every 6 px (shown px), 1 px tall
          else if (Math.abs(py - y0) <= 0.5 * k && (Math.floor(px / k) % 6) < 3) baseCov++;
        }
      }
      const n = SS * SS;
      const la = lineCov / n;
      const ba = (baseCov / n) * (BASE_RGBA[3] / 255);
      // composite line over baseline (straight alpha)
      const a = la + ba * (1 - la);
      const o = rowStart + 1 + x * 4;
      if (a > 0) {
        raw[o] = Math.round((er * la + BASE_RGBA[0] * ba * (1 - la)) / a);
        raw[o + 1] = Math.round((eg * la + BASE_RGBA[1] * ba * (1 - la)) / a);
        raw[o + 2] = Math.round((eb * la + BASE_RGBA[2] * ba * (1 - la)) / a);
        raw[o + 3] = Math.round(a * 255);
      }
    }
  }
  return encodePng(W, H, raw);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/** Minimal RGBA8 PNG encoder; `raw` already carries one filter byte per row. */
export function encodePng(width, height, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Immutable content-addressed name: no user data, no query params. */
export function sparklineFileName(png) {
  if (!png) return null;
  return `${createHash('sha256').update(png).digest('hex').slice(0, 32)}.png`;
}
