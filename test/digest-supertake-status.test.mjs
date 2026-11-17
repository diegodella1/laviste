/**
 * «Cierre del día»: estados En camino / Para vigilar / En riesgo con los umbrales aprobados
 * por Diego (−3 % tesis / −5 % activo) y la histéresis de §9.1.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  computeThesisStatus,
  DIGEST_STATUS_THRESHOLDS,
  DIGEST_SUPERTAKE_PROPOSALS,
  reasonCodeFor,
} from '../lib/digest-supertake.mjs';

test('approved thresholds are −3 % thesis and −5 % asset', () => {
  assert.equal(DIGEST_STATUS_THRESHOLDS.thesisPct, -0.03);
  assert.equal(DIGEST_STATUS_THRESHOLDS.assetPct, -0.05);
});

test('En camino by default, and strong rallies never change the status', () => {
  assert.equal(computeThesisStatus({dayPct: 0.001, weekPct: 0.01, minAssetDayPct: 0.002}), 'ok');
  assert.equal(computeThesisStatus({dayPct: 0.06, weekPct: 0.09, minAssetDayPct: 0.08}), 'ok');
  assert.equal(computeThesisStatus({}), 'ok');
});

test('Para vigilar at thesis day ≤ −3 %, thesis week ≤ −3 % or asset ≤ −5 %', () => {
  assert.equal(computeThesisStatus({dayPct: -0.03, weekPct: 0}), 'watch');
  assert.equal(computeThesisStatus({dayPct: -0.029, weekPct: 0}), 'ok');
  assert.equal(computeThesisStatus({dayPct: 0, weekPct: -0.031}), 'watch');
  assert.equal(computeThesisStatus({dayPct: -0.01, weekPct: 0, minAssetDayPct: -0.05}), 'watch');
  assert.equal(computeThesisStatus({dayPct: -0.01, weekPct: 0, minAssetDayPct: -0.049}), 'ok');
});

test('En riesgo (proposal a) when thesis −3 % AND asset −5 % on the same day', () => {
  assert.equal(DIGEST_SUPERTAKE_PROPOSALS.riskCriterion, 'thesis_and_asset');
  assert.equal(computeThesisStatus({dayPct: -0.03, weekPct: -0.01, minAssetDayPct: -0.05}), 'risk');
  assert.equal(computeThesisStatus({dayPct: -0.01, weekPct: -0.04, minAssetDayPct: -0.06}), 'risk');
  assert.equal(computeThesisStatus({dayPct: -0.029, weekPct: -0.02, minAssetDayPct: -0.06}), 'watch');
});

test('En riesgo when the app already marks the thesis «Revisar»', () => {
  assert.equal(computeThesisStatus({dayPct: 0.01, weekPct: 0.01, appReview: true}), 'risk');
});

test('the risk criterion is swappable without touching callers', () => {
  const proposals = {...DIGEST_SUPERTAKE_PROPOSALS, riskCriterion: 'app_review_only'};
  assert.equal(computeThesisStatus({dayPct: -0.05, minAssetDayPct: -0.08}, {proposals}), 'watch');
  assert.equal(computeThesisStatus({appReview: true}, {proposals}), 'risk');
});

test('hysteresis: watch only returns to En camino with week ≥ −1 % and day ≥ 0', () => {
  assert.equal(computeThesisStatus({dayPct: 0.002, weekPct: -0.015, prev: 'watch'}), 'watch');
  assert.equal(computeThesisStatus({dayPct: -0.001, weekPct: 0.02, prev: 'watch'}), 'watch');
  assert.equal(computeThesisStatus({dayPct: 0.004, weekPct: -0.01, prev: 'watch'}), 'ok');
  assert.equal(computeThesisStatus({dayPct: 0.01, weekPct: null, prev: 'watch'}), 'watch');
});

test('hysteresis: leaving En riesgo steps down to Para vigilar first', () => {
  assert.equal(computeThesisStatus({dayPct: 0.02, weekPct: 0.03, prev: 'risk'}), 'watch');
});

test('reason codes drive the explanation closer', () => {
  assert.equal(reasonCodeFor('watch', 'ok'), 'noise');
  assert.equal(reasonCodeFor('ok', 'watch'), 'recovery');
  assert.equal(reasonCodeFor('risk', 'watch'), 'risk');
  assert.equal(reasonCodeFor('watch', 'risk'), 'risk_easing');
  assert.equal(reasonCodeFor('ok', 'ok'), null);
});
