import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const appJs = readFileSync('public/app.js', 'utf8');
const chartJs = readFileSync('public/chart-suizo.mjs', 'utf8');
const siteCss = readFileSync('public/site.css', 'utf8');
const themeCss = readFileSync('public/app-theme.css', 'utf8');
const cacheJs = readFileSync('lib/http-cache.mjs', 'utf8');
const serverJs = readFileSync('server.mjs', 'utf8');

function fnBody(src, name) {
  const start = src.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} missing`);
  const next = src.slice(start + 1).search(/\nfunction |\nasync function |\nexport function /);
  return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
}

test('revalidate fetches /state and /auto/trades in parallel', () => {
  const body = fnBody(appJs, 'revalidate');
  assert.match(body, /Promise\.all\(/);
  assert.match(body, /api\('\/state'\)/);
  assert.match(body, /apiOptional\('\/auto\/trades'\)/);
  assert.doesNotMatch(body, /const next = await api\('\/state'\);\s*await loadAutoState/);
  assert.doesNotMatch(body, /\/leaderboard/);
  assert.match(body, /state = next;/);
  assert.match(body, /void probePublicas\(\)/);
  assert.ok(body.indexOf('state = next') < body.indexOf('void probePublicas()'));
});

test('hashchange skips revalidate when last /state is fresh; visibility throttle stays', () => {
  assert.match(appJs, /const HASH_REVALIDATE_MS = 15000/);
  assert.match(appJs, /function stateIsFresh/);
  assert.match(appJs, /!stateIsFresh\(\)\) revalidate\(\{quiet: false\}\)/);
  assert.match(appJs, /visibilitychange/);
  assert.match(appJs, /Date\.now\(\) - visThrottle > HASH_REVALIDATE_MS/);
  const hashBlock = appJs.slice(appJs.indexOf("window.addEventListener('hashchange'"));
  assert.match(hashBlock, /stateLoaded && !isAdminChrome\(page, id\) && !stateIsFresh\(\)/);
  assert.doesNotMatch(
    hashBlock.slice(0, 2500),
    /if \(stateLoaded && !isAdminChrome\(page, id\)\) revalidate/,
  );
});

test('loadAppState paints a loading shell then one full render after data', () => {
  const body = fnBody(appJs, 'loadAppState');
  assert.match(body, /paintLoadingShell\(\)/);
  assert.match(body, /await revalidate\(\{quiet\}\)/);
  assert.match(body, /if \(!loadFailed\) stateLoaded = true/);
  assert.match(body, /render\(\)/);
  assert.doesNotMatch(body, /render\(\);\s*await revalidate/);
  assert.match(appJs, /function paintLoadingShell/);
  assert.match(appJs, /watchChartHosts\(\)/);
});

test('scheduleChartPaint is a single rAF pass with scoped observers', () => {
  assert.match(chartJs, /export function watchChartHosts/);
  assert.match(chartJs, /export function scheduleChartPaint/);
  assert.match(chartJs, /requestAnimationFrame/);
  assert.match(chartJs, /new ResizeObserver/);
  assert.match(chartJs, /getElementById\('app'\)/);
  assert.match(chartJs, /observe\(root, \{childList: true\}\)/);
  assert.doesNotMatch(chartJs, /observe\(document\.documentElement/);
  assert.doesNotMatch(chartJs, /subtree:\s*true/);
  assert.doesNotMatch(chartJs, /setTimeout\(paintAllCharts/);
  assert.doesNotMatch(chartJs, /setTimeout\(\(\) => \{[\s\S]*paintAllCharts/);
});

test('session views reserve min-height for pulse and chart-host', () => {
  assert.match(siteCss, /\.pulse\[data-pulse\]\{[^}]*min-height:\s*220px/);
  assert.match(themeCss, /\.chart-host\s*\{[^}]*min-height:\s*230px/s);
});

test('P1 /api/state ETag and /r/ versioning stay intact', () => {
  assert.match(cacheJs, /export function stateEtag/);
  assert.match(cacheJs, /STATE_CACHE/);
  assert.match(cacheJs, /`\/r\/\$\{revision\}`/);
  assert.match(serverJs, /stateEtag/);
  assert.match(serverJs, /notModified/);
  assert.match(serverJs, /parseAssetRequest/);
  assert.match(serverJs, /writeHead\(304/);
  assert.doesNotMatch(appJs, /\/api\/state['"].*trades/);
});
