import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyQuote, snapshotUsedPrice, withEligibility, QUOTE_CLASSES} from '../lib/quote-eligibility.mjs';

test('delayed providers are eligible; demo catalog and missing are not', () => {
  assert.equal(classifyQuote({price: 100, provider: 'data912'}).eligible, true);
  assert.equal(classifyQuote({price: 100, provider: 'data912'}).quoteClass, QUOTE_CLASSES.delayed);
  assert.equal(classifyQuote({price: 100, provider: 'yahoo'}).eligible, true);
  assert.equal(classifyQuote({price: 100, provider: 'fixture'}).eligible, true);
  assert.equal(classifyQuote({price: 100, provider: 'demo'}).eligible, false);
  assert.equal(classifyQuote({price: 100, provider: 'demo'}).quoteClass, QUOTE_CLASSES.demo);
  assert.equal(classifyQuote({price: 100, provider: 'catalog'}).eligible, false);
  assert.equal(classifyQuote(null).quoteClass, QUOTE_CLASSES.missing);
  assert.equal(classifyQuote({price: 0, provider: 'data912'}).quoteClass, QUOTE_CLASSES.missing);
});

test('snapshotUsedPrice never labels a catalog fill as delayed', () => {
  const quotes = {getCached: () => null};
  const snap = snapshotUsedPrice(quotes, 'GGAL', 6500);
  assert.equal(snap.quoteClass, QUOTE_CLASSES.catalog);
  assert.equal(snap.eligible, false);
  assert.equal(snap.provider, 'catalog');
  assert.equal(snap.price, 6500);
});

test('delayed cache attaches only when the used price matches', () => {
  const quotes = {getCached: () => ({price: 6500, provider: 'data912', asOf: '2026-10-06T17:00:00.000Z', stale: false})};
  const match = snapshotUsedPrice(quotes, 'GGAL', 6500);
  assert.equal(match.quoteClass, QUOTE_CLASSES.delayed);
  assert.equal(match.eligible, true);
  const mismatch = snapshotUsedPrice(quotes, 'GGAL', 999);
  assert.equal(mismatch.quoteClass, QUOTE_CLASSES.catalog);
  assert.equal(mismatch.eligible, false);
  assert.equal(mismatch.price, 999);
});

test('withEligibility does not invent a price for a missing ticker', () => {
  const view = withEligibility({ticker: 'GGAL'});
  assert.equal(view.available, false);
  assert.equal(view.price, null);
  assert.equal(view.quoteClass, QUOTE_CLASSES.missing);
  assert.equal(view.eligible, false);
});
