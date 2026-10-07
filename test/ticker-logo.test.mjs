import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  normalizeTicker,
  tickerInitials,
  tickerColor,
  tickerLogoSvg,
  tickerMarkHtml,
  tickerIdHtml,
} from '../public/ticker-logo.mjs';
import {createApp} from '../server.mjs';
import {catalog} from '../lib/engine.mjs';

test('catalog tickers get initials, color, and mark fallback', () => {
  for (const row of catalog) {
    const initials = tickerInitials(row.ticker, row.name);
    assert.ok(initials.length >= 2 && initials.length <= 4, row.ticker);
    assert.match(tickerColor(row.ticker), /^#[0-9A-F]{6}$/);
    const html = tickerIdHtml(row.ticker, row.name);
    assert.ok(html.includes('ticker-mark'), row.ticker);
    assert.ok(html.includes('ticker-fallback'), row.ticker);
    assert.ok(html.includes(`/logos/${row.ticker}.svg`), row.ticker);
    assert.ok(html.includes(`class="ticker">${row.ticker}<`), row.ticker);
    const svg = tickerLogoSvg(row.ticker, row.name);
    assert.ok(svg.includes(initials));
    assert.ok(svg.includes('rx="2"'));
  }
});

test('unknown ticker uses initials fallback and hashed color', () => {
  assert.equal(normalizeTicker(' ko '), 'KO');
  assert.equal(tickerInitials('GOOGL'), 'GOO');
  assert.equal(tickerInitials('', 'Pampa Energía'), 'PE');
  const html = tickerMarkHtml('ZZZZ');
  assert.ok(html.includes('ZZZZ'));
  assert.ok(html.includes('ticker-fallback'));
  assert.ok(!html.includes('onerror='), 'no inline handlers (CSP)');
});

test('GET /logos/{TICKER}.svg is self-hosted SVG', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'laviste-logo-'));
  const app = createApp({dataDir: dir, password: 'logo-test-password', apiKey: '', port: 0, host: '127.0.0.1', secure: false, origin: ''});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    const res = await fetch(base + '/logos/YPF.svg');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /image\/svg\+xml/);
    const body = await res.text();
    assert.ok(body.includes('<svg'));
    assert.ok(body.includes('YPF'));
    assert.equal((await fetch(base + '/logos/not valid.svg')).status, 404);
    const mod = await fetch(base + '/ticker-logo.mjs');
    assert.equal(mod.status, 200);
  } finally {
    await app.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
