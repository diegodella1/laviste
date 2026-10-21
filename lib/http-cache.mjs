import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
export const SHORT_REVALIDATE_CACHE = 'public, max-age=60, must-revalidate';
export const HTML_NO_CACHE = 'no-cache';
export const HTML_HOME_CACHE = 'private, no-cache';
export const STATE_CACHE = 'private, no-cache';

const VERSIONED_PREFIX = /^\/r\/([^/]+)(\/.*)?$/;

/** Same revision `/api/health` already exposes: RELEASE_SHA, else development. */
export function deployRevision(env = process.env, override) {
  if (override != null && String(override)) return String(override);
  return env.RELEASE_SHA || 'development';
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

export function parseAssetRequest(pathname, searchParams, revision) {
  let path = pathname || '/';
  const queryRev = searchParams?.get?.('v') || '';
  let pathRev = '';
  const match = String(path).match(VERSIONED_PREFIX);
  if (match) {
    pathRev = match[1];
    path = match[2] || '/';
  }
  const versioned = Boolean(revision) && (queryRev === revision || pathRev === revision);
  return {path, versioned, queryRev, pathRev};
}

export function staticCacheControl({html = false, home = false, versioned = false, woff2 = false} = {}) {
  if (html) return home ? HTML_HOME_CACHE : HTML_NO_CACHE;
  if (versioned || woff2) return IMMUTABLE_CACHE;
  return SHORT_REVALIDATE_CACHE;
}

export function loadStaticAssets(publicDir, assets) {
  const cache = new Map();
  for (const file of new Set(Object.values(assets))) {
    const full = resolve(publicDir, file);
    const body = readFileSync(full);
    const {mtimeMs} = statSync(full);
    cache.set(file, {body, etag: contentEtag(body), lastModified: httpDate(mtimeMs), mtimeMs});
  }
  return cache;
}
