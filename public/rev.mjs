/** Deploy revision of this page (`/r/<sha>/…`) and a one-shot reload if it goes stale. */

export const RELOAD_GUARD_KEY = 'lv_rev_reload';
export const CHUNK_RELOAD_KEY = 'lv_chunk_reload';

export function pageRevision(doc = typeof document !== 'undefined' ? document : null, moduleUrl = import.meta.url) {
  const src = doc?.querySelector?.('script[type="module"][src]')?.getAttribute('src') || '';
  const fromHtml = String(src).match(/\/r\/([^/]+)\//);
  if (fromHtml) return fromHtml[1];
  const fromMod = String(moduleUrl).match(/\/r\/([^/]+)\//);
  return fromMod ? fromMod[1] : '';
}

export function revisionMismatch(pageRev, serverRev) {
  if (!pageRev || !serverRev) return false;
  if (serverRev === 'development') return false;
  return pageRev !== serverRev;
}

export function formFieldsDirty(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc?.querySelectorAll) return false;
  for (const el of doc.querySelectorAll('input, textarea, select')) {
    const type = String(el.type || '').toLowerCase();
    if (el.disabled || ['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(type)) continue;
    if (type === 'checkbox' || type === 'radio') {
      if (el.checked !== el.defaultChecked) return true;
      continue;
    }
    if (String(el.value ?? '') !== String(el.defaultValue ?? '')) return true;
  }
  return false;
}

let deferredRevisionReload = false;

export function resetDeferredRevisionReload() {
  deferredRevisionReload = false;
}

function scheduleDeferredRevisionReload(storage, loc, opts = {}) {
  if (deferredRevisionReload) return;
  deferredRevisionReload = true;
  const retry = () => {
    if (formFieldsDirty(opts.document)) return;
    deferredRevisionReload = false;
    reloadOnceForRevision(storage, loc, opts);
  };
  const navRetry = () => {
    deferredRevisionReload = false;
    reloadOnceForRevision(storage, loc, opts);
  };
  const target = opts.eventTarget ?? (typeof window !== 'undefined' ? window : null);
  target?.addEventListener?.('hashchange', navRetry, {once: true});
  target?.addEventListener?.('popstate', navRetry, {once: true});
  const idle = opts.requestIdleCallback
    ?? (typeof requestIdleCallback === 'function'
      ? cb => requestIdleCallback(() => cb())
      : cb => setTimeout(cb, 0));
  idle(() => retry());
  const doc = opts.document ?? (typeof document !== 'undefined' ? document : null);
  doc?.addEventListener?.('input', retry, true);
  doc?.addEventListener?.('change', retry, true);
}

export function reloadOnceForRevision(storage, loc, opts = {}) {
  const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  const target = loc || (typeof location !== 'undefined' ? location : null);
  if (!store || !target) return false;
  if (opts.dirty === true || (opts.dirty !== false && formFieldsDirty(opts.document))) {
    scheduleDeferredRevisionReload(storage, loc, opts);
    return false;
  }
  try {
    if (store.getItem(RELOAD_GUARD_KEY) === '1') return false;
    store.setItem(RELOAD_GUARD_KEY, '1');
  } catch {
    return false;
  }
  target.reload();
  return true;
}

export function clearRevisionReloadGuard(storage) {
  const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (!store) return;
  try { store.removeItem(RELOAD_GUARD_KEY); } catch {}
}

function chunkGuardValue(opts = {}) {
  return (opts.pageRev ?? pageRevision(opts.document, opts.moduleUrl)) || 'dev';
}

export function reloadOnceForChunk(storage, loc, opts = {}) {
  const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  const target = loc || (typeof location !== 'undefined' ? location : null);
  if (!store || !target) return false;
  const pageRev = chunkGuardValue(opts);
  try {
    if (store.getItem(CHUNK_RELOAD_KEY) === pageRev) return false;
    store.setItem(CHUNK_RELOAD_KEY, pageRev);
  } catch {
    return false;
  }
  target.reload();
  return true;
}

export function clearChunkReloadGuard(storage) {
  const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (!store) return;
  try { store.removeItem(CHUNK_RELOAD_KEY); } catch {}
}

export function syncRevisionFromHealth(health, opts = {}) {
  const pageRev = opts.pageRev ?? pageRevision(opts.document, opts.moduleUrl);
  const serverRev = health?.revision;
  if (revisionMismatch(pageRev, serverRev)) {
    return reloadOnceForRevision(opts.storage, opts.location, opts);
  }
  if (pageRev && serverRev && pageRev === serverRev) {
    clearRevisionReloadGuard(opts.storage);
  }
  return false;
}

function readHealth(opts = {}) {
  if (opts.health !== undefined) return Promise.resolve(opts.health);
  if (typeof fetch !== 'function') return Promise.resolve(null);
  return fetch('/api/health').then(r => r.json()).catch(() => null);
}

export async function importOrReload(specifier, opts = {}) {
  const healthP = readHealth(opts);
  try {
    const mod = await import(specifier);
    const health = await healthP;
    if (health && syncRevisionFromHealth(health, opts)) {
      throw Object.assign(new Error('revision mismatch'), {revisionMismatch: true});
    }
    return mod;
  } catch (err) {
    if (err?.revisionMismatch) throw err;
    const health = await healthP.catch(() => null);
    const pageRev = opts.pageRev ?? pageRevision(opts.document, opts.moduleUrl);
    if (health && revisionMismatch(pageRev, health.revision)) {
      reloadOnceForRevision(opts.storage, opts.location, {...opts, pageRev});
    } else {
      reloadOnceForChunk(opts.storage, opts.location, {...opts, pageRev});
    }
    throw err;
  }
}
