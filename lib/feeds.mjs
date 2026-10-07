import {lookup as dnsLookup} from 'node:dns/promises';
import {BlockList, isIP} from 'node:net';
import {assert} from './engine.mjs';

export const FEED_LABEL_MAX = 80;
export const FEED_URL_MAX = 2048;
export const FEED_FETCH_TIMEOUT_MS = 12_000;
export const FEED_MAX_BYTES = 512 * 1024;
export const FEED_MAX_REDIRECTS = 4;
export const FEED_PROBE_ITEMS = 5;
export const FEED_PARSE_ITEMS = 40;
export const FEED_SNIPPET_MAX = 280;
export const FEED_DNS_TIMEOUT_MS = 4_000;

const HTTPS_MSG = 'Usá una URL https válida.';
const BLOCKED_MSG = 'La URL no está permitida.';

const blockedNets = new BlockList();
blockedNets.addSubnet('0.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('10.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('100.64.0.0', 10, 'ipv4');
blockedNets.addSubnet('127.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('169.254.0.0', 16, 'ipv4');
blockedNets.addSubnet('172.16.0.0', 12, 'ipv4');
blockedNets.addSubnet('192.0.0.0', 24, 'ipv4');
blockedNets.addSubnet('192.0.2.0', 24, 'ipv4');
blockedNets.addSubnet('192.168.0.0', 16, 'ipv4');
blockedNets.addSubnet('198.18.0.0', 15, 'ipv4');
blockedNets.addSubnet('198.51.100.0', 24, 'ipv4');
blockedNets.addSubnet('203.0.113.0', 24, 'ipv4');
blockedNets.addSubnet('224.0.0.0', 4, 'ipv4');
blockedNets.addSubnet('240.0.0.0', 4, 'ipv4');
blockedNets.addAddress('255.255.255.255', 'ipv4');
blockedNets.addAddress('::', 'ipv6');
blockedNets.addAddress('::1', 'ipv6');
blockedNets.addSubnet('fc00::', 7, 'ipv6');
blockedNets.addSubnet('fe80::', 10, 'ipv6');
blockedNets.addSubnet('ff00::', 8, 'ipv6');
blockedNets.addSubnet('2001:db8::', 32, 'ipv6');

const BLOCKED_HOSTS = new Set([
  'localhost', 'metadata', 'metadata.google.internal',
  'host.docker.internal', 'host.containers.internal',
  'kubernetes.default', 'kubernetes.default.svc',
]);

function fail(message, status = 400, code = 'feed') {
  throw Object.assign(new Error(message), {status, code});
}

function hostOf(url) {
  return String(url.hostname || '').replace(/^\[|\]$/g, '');
}

function unwrapMappedIPv4(address) {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

export function isBlockedIp(address) {
  const mapped = unwrapMappedIPv4(address);
  if (mapped) return isBlockedIp(mapped);
  const family = isIP(address);
  if (family === 4) return blockedNets.check(address, 'ipv4');
  if (family === 6) return blockedNets.check(address, 'ipv6');
  return true;
}

export function isBlockedHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (isIP(host)) return isBlockedIp(host);
  return false;
}

export function assertFeedUrl(value) {
  assert(typeof value === 'string', HTTPS_MSG, 400);
  const trimmed = value.trim();
  assert(trimmed.length > 0 && trimmed.length <= FEED_URL_MAX, HTTPS_MSG, 400);
  assert(!/^\s*javascript:/i.test(trimmed) && !/^\s*data:/i.test(trimmed) && !/^\s*file:/i.test(trimmed), HTTPS_MSG, 400);
  let url;
  try { url = new URL(trimmed); }
  catch { fail(HTTPS_MSG); }
  assert(url.protocol === 'https:', HTTPS_MSG, 400);
  assert(!url.username && !url.password, HTTPS_MSG, 400);
  const host = hostOf(url);
  assert(host.length > 0, HTTPS_MSG, 400);
  assert(!isBlockedHostname(host), BLOCKED_MSG, 400);
  return url;
}

async function lookupAddresses(host, lookupFn) {
  try {
    const found = await Promise.race([
      lookupFn(host, {all: true, verbatim: true}),
      new Promise((_, reject) => setTimeout(() => reject(new Error('dns')), FEED_DNS_TIMEOUT_MS)),
    ]);
    return Array.isArray(found) ? found : [found];
  } catch {
    fail('No se pudo resolver la URL.');
  }
}

export async function assertPublicFeedUrl(value, {lookupFn = dnsLookup} = {}) {
  const url = assertFeedUrl(value);
  const host = hostOf(url);
  if (isIP(host)) {
    assert(!isBlockedIp(host), BLOCKED_MSG, 400);
    return url;
  }
  const addresses = await lookupAddresses(host, lookupFn);
  assert(addresses.length, 'No se pudo resolver la URL.', 400);
  for (const row of addresses) {
    assert(!isBlockedIp(row.address || row), BLOCKED_MSG, 400);
  }
  return url;
}

export function validateFeedFields(data, {partial = false} = {}) {
  const out = {};
  if (!partial || 'label' in data) {
    assert(typeof data.label === 'string', 'Indicá un nombre.', 400);
    const label = data.label.trim();
    assert(label.length >= 1 && label.length <= FEED_LABEL_MAX, `El nombre debe tener entre 1 y ${FEED_LABEL_MAX} caracteres.`, 400);
    out.label = label;
  }
  if (!partial || 'url' in data) {
    out.url = assertFeedUrl(data.url).href;
  }
  if (!partial) out.enabled = data.enabled === undefined ? true : data.enabled;
  else if ('enabled' in data) out.enabled = data.enabled;
  if ('enabled' in out) assert(typeof out.enabled === 'boolean', 'Estado inválido.', 400);
  return out;
}

export function filterEnabledFeeds(feeds) {
  return (feeds || []).filter(feed => feed.enabled);
}

function headerGet(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

async function readCappedBody(res, maxBytes) {
  const declared = Number(headerGet(res.headers, 'content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) fail('El feed es demasiado grande.', 400, 'size');
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        reader.cancel().catch(() => {});
        fail('El feed es demasiado grande.', 400, 'size');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) fail('El feed es demasiado grande.', 400, 'size');
  return buf.toString('utf8');
}

function resolveRedirect(from, location) {
  assert(typeof location === 'string' && location.trim(), BLOCKED_MSG, 400);
  let next;
  try { next = new URL(location, from); }
  catch { fail(BLOCKED_MSG); }
  return assertFeedUrl(next.href);
}

export function decodeXmlEntities(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function safeChar(code) {
  if (!Number.isInteger(code) || code < 32 && code !== 9 && code !== 10 && code !== 13) return '';
  if (code > 0x10ffff) return '';
  try { return String.fromCodePoint(code); }
  catch { return ''; }
}

export function stripXmlTags(value) {
  return decodeXmlEntities(String(value ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function tagInner(block, names) {
  for (const name of names) {
    const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}\\s*>`, 'i');
    const match = block.match(re);
    if (match) return match[1];
  }
  return '';
}

function firstAttr(block, tag, attr) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b([^>]*)\\/?>`, 'gi');
  let match;
  let fallback = '';
  while ((match = re.exec(block))) {
    const attrs = match[1] || '';
    const value = attrs.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
    if (!value) continue;
    if (/rel\s*=\s*["']alternate["']/i.test(attrs) || !/\brel\s*=/i.test(attrs)) return value;
    fallback ||= value;
  }
  return fallback;
}

function itemLink(block) {
  const href = firstAttr(block, 'link', 'href');
  if (href) return decodeXmlEntities(href).trim();
  const rss = stripXmlTags(tagInner(block, ['link']));
  if (rss) return rss;
  return stripXmlTags(tagInner(block, ['guid', 'id']));
}

function itemDate(block) {
  const raw = stripXmlTags(tagInner(block, ['pubDate', 'published', 'updated', 'date']));
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : raw;
}

function snippetOf(block) {
  const raw = tagInner(block, ['description', 'summary', 'content', 'subtitle']);
  const text = stripXmlTags(raw);
  if (!text) return '';
  return text.length > FEED_SNIPPET_MAX ? text.slice(0, FEED_SNIPPET_MAX - 1) + '…' : text;
}

function blocksOf(xml, tag) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}\\s*>`, 'gi');
  return [...xml.matchAll(re)].map(match => match[1]);
}

function normalizeItem(block) {
  const title = stripXmlTags(tagInner(block, ['title'])) || 'Sin título';
  const url = itemLink(block);
  let safe = null;
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') safe = parsed.href;
    } catch { /* drop non-http links */ }
  }
  return {
    title: title.slice(0, 300),
    url: safe,
    publishedAt: itemDate(block),
    snippet: snippetOf(block),
  };
}

export function parseFeedXml(xml) {
  const text = String(xml || '');
  assert(text.trim().length > 0, 'No se pudo leer el feed.', 422);
  const feedTitle = stripXmlTags(tagInner(text, ['title'])) || '';
  const rawItems = [...blocksOf(text, 'item'), ...blocksOf(text, 'entry')].slice(0, FEED_PARSE_ITEMS);
  const items = rawItems.map(normalizeItem);
  const dated = items.filter(item => item.publishedAt && Number.isFinite(Date.parse(item.publishedAt)));
  if (dated.length === items.length && items.length > 1) {
    items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }
  return {feedTitle, items, itemCount: items.length};
}

function redirectStatus(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function requestOnce(fetcher, url, headers, timeoutMs) {
  return fetcher(url.href, {
    method: 'GET',
    redirect: 'manual',
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function fetchFeedXml(urlValue, options = {}) {
  const fetcher = options.fetcher || fetch;
  const lookupFn = options.lookupFn || dnsLookup;
  const timeoutMs = options.timeoutMs ?? FEED_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? FEED_MAX_BYTES;
  let url = await assertPublicFeedUrl(urlValue, {lookupFn});
  const headers = {
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
    'User-Agent': 'LaViste/0.2 (+https://laviste.diegodella.ar)',
  };
  if (options.etag) headers['If-None-Match'] = options.etag;
  if (options.lastModified) headers['If-Modified-Since'] = options.lastModified;
  let hops = 0;
  while (true) {
    let res;
    try { res = await requestOnce(fetcher, url, headers, timeoutMs); }
    catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') fail('El servidor no respondió a tiempo.', 504, 'timeout');
      fail('No se pudo leer el feed.', 502, 'fetch');
    }
    if (redirectStatus(res.status)) {
      hops += 1;
      assert(hops <= FEED_MAX_REDIRECTS, 'Demasiadas redirecciones.', 400);
      url = await assertPublicFeedUrl(resolveRedirect(url, headerGet(res.headers, 'location')).href, {lookupFn});
      continue;
    }
    if (res.status === 304) {
      return {notModified: true, status: 304, etag: headerGet(res.headers, 'etag'), lastModified: headerGet(res.headers, 'last-modified'), xml: '', items: [], itemCount: 0};
    }
    if (!res.ok) fail(`El feed respondió HTTP ${res.status}.`, 502, 'http');
    const xml = await readCappedBody(res, maxBytes);
    const parsed = parseFeedXml(xml);
    return {
      notModified: false,
      status: res.status,
      etag: headerGet(res.headers, 'etag'),
      lastModified: headerGet(res.headers, 'last-modified'),
      xml,
      ...parsed,
    };
  }
}

export async function probeFeed(urlValue, options = {}) {
  const started = Date.now();
  const result = await fetchFeedXml(urlValue, options);
  const items = (result.items || []).slice(0, options.limit ?? FEED_PROBE_ITEMS);
  return {
    ok: true,
    feedTitle: result.feedTitle || '',
    itemCount: result.itemCount || 0,
    items,
    latencyMs: Date.now() - started,
    etag: result.etag || null,
    lastModified: result.lastModified || null,
    notModified: !!result.notModified,
  };
}
