/**
 * Sparkline PNG sin dependencias (zlib): 192×56 RGBA, CRC válidos, nombre inmutable por hash.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync, crc32} from 'node:zlib';
import {renderSparklinePng, sparklineFileName, sparkTrend, SPARK_COLORS} from '../lib/sparkline-png.mjs';

function chunks(png) {
  const out = [];
  let o = 8;
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    const type = png.subarray(o + 4, o + 8).toString('ascii');
    const data = png.subarray(o + 8, o + 8 + len);
    const crc = png.readUInt32BE(o + 8 + len);
    out.push({type, data, crc, crcOk: (crc32(png.subarray(o + 4, o + 8 + len)) >>> 0) === crc});
    o += 12 + len;
  }
  return out;
}

test('renders a valid 2x RGBA PNG (192×56)', () => {
  const png = renderSparklinePng([0, 0.6, 1.1, 0.2, 0.9, -3.2]);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const cs = chunks(png);
  assert.deepEqual(cs.map(c => c.type), ['IHDR', 'IDAT', 'IEND']);
  assert.ok(cs.every(c => c.crcOk));
  const ihdr = cs[0].data;
  assert.equal(ihdr.readUInt32BE(0), 192);
  assert.equal(ihdr.readUInt32BE(4), 56);
  assert.equal(ihdr[8], 8);
  assert.equal(ihdr[9], 6);
  const raw = inflateSync(cs[1].data);
  assert.equal(raw.length, (192 * 4 + 1) * 56);
});

test('line color follows the rounded week so it always matches «Semana {%}»', () => {
  assert.equal(sparkTrend([0, 1, -3.2]), 'down');
  assert.equal(sparkTrend([0, 1, 2.8]), 'up');
  assert.equal(sparkTrend([0, 0.3, 0.04]), 'flat');
  const raw = inflateSync(chunks(renderSparklinePng([0, -0.5, -1, -2]))[1].data);
  let found = false;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === SPARK_COLORS.down[0] && raw[i + 1] === SPARK_COLORS.down[1] && raw[i + 2] === SPARK_COLORS.down[2] && raw[i + 3] === 255) { found = true; break; }
  }
  assert.ok(found, 'solid down-color pixels present');
});

test('transparent background, deterministic bytes and content-hash file name', () => {
  const a = renderSparklinePng([0, 0.4, 1.02, 1.27, 1.48, -0.21]);
  const b = renderSparklinePng([0, 0.4, 1.02, 1.27, 1.48, -0.21]);
  assert.ok(a.equals(b));
  assert.match(sparklineFileName(a), /^[0-9a-f]{32}\.png$/);
  assert.notEqual(sparklineFileName(a), sparklineFileName(renderSparklinePng([0, 1, 2])));
  const raw = inflateSync(chunks(a)[1].data);
  assert.equal(raw[1 + 3], 0, 'top-left pixel is fully transparent');
});

test('fewer than 3 points → no image (template keeps the text)', () => {
  assert.equal(renderSparklinePng([0, 1]), null);
  assert.equal(renderSparklinePng(null), null);
  assert.equal(sparklineFileName(null), null);
});
