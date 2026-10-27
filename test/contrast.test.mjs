import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const AA = 4.5;
const brand = readFileSync('public/brand.css', 'utf8');
const theme = readFileSync('public/app-theme.css', 'utf8');
const site = readFileSync('public/site.css', 'utf8');

function token(name) {
  const m = brand.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `token --${name}`);
  return m[1].toUpperCase();
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return {r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255};
}

function mixSrgb(fgHex, pct, bgHex) {
  const a = hexRgb(fgHex);
  const b = hexRgb(bgHex);
  const t = pct / 100;
  return {
    r: Math.round(a.r * t + b.r * (1 - t)),
    g: Math.round(a.g * t + b.g * (1 - t)),
    b: Math.round(a.b * t + b.b * (1 - t)),
  };
}

function luminance({r, g, b}) {
  const lin = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(fg, bg) {
  const a = typeof fg === 'string' ? hexRgb(fg) : fg;
  const b = typeof bg === 'string' ? hexRgb(bg) : bg;
  const L1 = luminance(a);
  const L2 = luminance(b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

test('B3 leftover pills and /acerca eyebrow meet AA 4.5', () => {
  const reviewText = token('lv-review-text');
  const lossText = token('lv-loss-text');
  const lossSoft = token('lv-loss-soft');
  const watch = token('lv-watch');
  const watchText = token('lv-watch-text');
  const surface = token('lv-surface');
  const accentText = token('lv-accent-text');
  const paper = token('lv-paper');

  assert.equal(reviewText, '#B91C1C');
  assert.equal(lossText, '#B91C1C');
  assert.equal(watch, '#D97706');
  assert.equal(watchText, '#B45309');
  assert.equal(token('lv-review'), '#EF4444');
  assert.equal(token('lv-loss'), '#EF4444');
  assert.equal(token('lv-accent'), '#3B82F6');

  const watchTint = mixSrgb(watch, 10, surface);
  const cases = [
    ['.chip-s.review', reviewText, lossSoft],
    ['.thesis-list-gain.negative', lossText, lossSoft],
    ['.chip-s.watch', watchText, watchTint],
    ['.chapter .eyebrow', accentText, paper],
  ];
  for (const [name, fg, bg] of cases) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= AA, `${name} ${fg} on ${typeof bg === 'string' ? bg : `rgb(${bg.r},${bg.g},${bg.b})`} is ${ratio.toFixed(2)}:1`);
  }

  assert.match(theme, /\.status(?:-mark)?\.watch[\s\S]{0,180}color:\s*var\(--lv-watch-text\)/);
  assert.match(theme, /\.chip\.watch[\s\S]{0,80}color:\s*var\(--lv-watch-text\)/);
  assert.match(theme, /\.verdict-chip\.action\s*\{\s*color:\s*var\(--lv-watch-text\)/);
  assert.match(theme, /\.pos-chip\.watch\s*\{\s*color:\s*var\(--lv-watch-text\)/);
  assert.match(theme, /\.chip-s\.watch\s*\{\s*color:\s*var\(--lv-watch-text\)/);
  assert.match(site, /\.chapter \.eyebrow\{color:var\(--lv-accent-text\)\}/);
});
