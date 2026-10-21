import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
export const HTML_NO_CACHE = 'no-cache';
export const HTML_HOME_CACHE = 'private, no-cache';
export const STATE_CACHE = 'private, no-cache';

const VERSIONED_PREFIX = /^\/r\/([^/]+)(\/.*)?$/;

/** Entry module + CSS rewritten in served index.html / home.html. Disk files stay unversioned. */
export const VERSIONED_HTML_FILES = ['index.html', 'home.html'];
export const VERSIONED_HTML_ASSETS = [
  '/app.js', '/pulse.js', '/site.js',
  '/brand.css', '/styles.css', '/app-theme.css', '/site.css', '/terminal.css',
];

/** Same revision `/api/health` already exposes: RELEASE_SHA, else development. */
export function deployRevision(env = process.env, override) {
  if (override != null && String(override)) return String(override);
  return env.RELEASE_SHA || 'development';
}

/** Real deploys only. Missing SHA or `development` must never get immutable. */
export function isDeployRevision(revision) {
  const rev = String(revision || '');
  return rev.length > 0 && rev !== 'development';
}

export function contentEtag(bytes) {
  return `"${createHash('sha256').update(bytes).digest('hex')}"`;
}

/** Bind the validator to the session owner so two users never share an ETag. */
export function stateEtag(userId, body) {
  return contentEtag(Buffer.concat([
    Buffer.from(String(userId)),
    Buffer.from([0]),
    Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  ]));
}

export function httpDate(ms) {
  return new Date(ms).toUTCString();
}

function etagTokenList(header) {
  return String(header).split(',').map(part => part.trim()).filter(Boolean);
}

export function etagMatches(req, etag) {
  const raw = req?.headers?.['if-none-match'];
  if (!raw || !etag) return false;
  return etagTokenList(raw).some(token => {
    if (token === '*') return true;
    const strong = token.startsWith('W/') ? token.slice(2).trim() : token;
    return strong === etag;
  });
}

export function ifUnmodifiedByDate(req, mtimeMs) {
  const raw = req?.headers?.['if-modified-since'];
  if (!raw || mtimeMs == null) return false;
  const since = Date.parse(raw);
  if (Number.isNaN(since)) return false;
  return Math.floor(mtimeMs / 1000) <= Math.floor(since / 1000);
}

/** If-None-Match wins when both validators are present (RFC 9110). */
export function notModified(req, {etag, mtimeMs} = {}) {
  if (req?.headers?.['if-none-match']) return etagMatches(req, etag);
  return ifUnmodifiedByDate(req, mtimeMs);
}

export function parseAssetRequest(pathname, revision) {
  const raw = pathname || '/';
  const match = String(raw).match(VERSIONED_PREFIX);
  if (!match) return {path: raw, versioned: false, prefixed: false, pathRev: ''};
  const pathRev = match[1];
  const path = match[2] || '/';
  const versioned = isDeployRevision(revision) && pathRev === revision;
  return {path, versioned, prefixed: true, pathRev};
}

/**
 * Immutable only for `/r/<current RELEASE_SHA>/…` and for fonts.
 * Fonts are immutable only because a changed font is shipped under a new filename.
 * Unversioned .js/.mjs/.css stay no-cache + ETag so a deploy cannot mix app.js with copy.mjs.
 */
export function staticCacheControl({
  html = false, home = false, versioned = false, font = false, allowImmutable = false,
} = {}) {
  if (html) return home ? HTML_HOME_CACHE : HTML_NO_CACHE;
  if (allowImmutable && (versioned || font)) return IMMUTABLE_CACHE;
  return HTML_NO_CACHE;
}

export function rewriteVersionedHtml(html, revision) {
  if (!isDeployRevision(revision)) return String(html);
  const prefix = `/r/${revision}`;
  let out = String(html);
  for (const asset of VERSIONED_HTML_ASSETS) {
    out = out.replaceAll(`href="${asset}"`, `href="${prefix}${asset}"`);
    out = out.replaceAll(`src="${asset}"`, `src="${prefix}${asset}"`);
  }
  return out;
}

export function applyHtmlRevision(cache, revision) {
  const next = new Map(cache);
  if (!isDeployRevision(revision)) return next;
  for (const file of VERSIONED_HTML_FILES) {
    const raw = cache.get(file);
    if (!raw) throw new Error(`Static file missing at startup: ${file}`);
    const body = Buffer.from(rewriteVersionedHtml(raw.body.toString('utf8'), revision));
    next.set(file, {body, etag: contentEtag(body), lastModified: raw.lastModified, mtimeMs: raw.mtimeMs});
  }
  return next;
}

/** Fails fast if a listed static file is missing — the process must not start half-served. */
export function loadStaticAssets(publicDir, assets) {
  const cache = new Map();
  for (const file of new Set(Object.values(assets))) {
    const full = resolve(publicDir, file);
    let body;
    let mtimeMs;
    try {
      body = readFileSync(full);
      ({mtimeMs} = statSync(full));
    } catch {
      throw new Error(`Static file missing at startup: ${file}`);
    }
    cache.set(file, {body, etag: contentEtag(body), lastModified: httpDate(mtimeMs), mtimeMs});
  }
  return cache;
}
