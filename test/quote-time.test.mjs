import test from 'node:test';
import assert from 'node:assert/strict';
import {isMarketOpen, lastSessionCloseIso, resolveQuoteAsOf} from '../lib/quote-time.mjs';

test('resolveQuoteAsOf uses Yahoo market time when present', () => {
  const sec = Math.floor(Date.parse('2026-10-06T14:00:00-03:00') / 1000);
  const asOf = resolveQuoteAsOf({providerMarketTimeSec: sec, fetchedAt: new Date('2026-10-06T20:06:00-03:00')});
  assert.equal(asOf, new Date(sec * 1000).toISOString());
});

test('resolveQuoteAsOf outside session uses last close, not fetch clock', () => {
  const fetchedAt = new Date('2026-10-06T20:06:00-03:00');
  assert.equal(isMarketOpen(fetchedAt), false);
  const asOf = resolveQuoteAsOf({fetchedAt});
  assert.notEqual(asOf, fetchedAt.toISOString());
  const close = lastSessionCloseIso(fetchedAt);
  assert.equal(asOf, close);
  assert.equal(new Date(asOf).getUTCHours(), 20);
});
