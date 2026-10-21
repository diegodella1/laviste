/** Deploy revision of this page (`/r/<sha>/…`) and a one-shot reload if it goes stale. */

export const RELOAD_GUARD_KEY = 'lv_rev_reload';

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

export function reloadOnceForRevision(storage, loc) {
  const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  const target = loc || (typeof location !== 'undefined' ? location : null);
  if (!store || !target) return false;
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

export function syncRevisionFromHealth(health, opts = {}) {
  const pageRev = opts.pageRev ?? pageRevision(opts.document, opts.moduleUrl);
  const serverRev = health?.revision;
  if (revisionMismatch(pageRev, serverRev)) {
    return reloadOnceForRevision(opts.storage, opts.location);
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
    if (!err?.revisionMismatch) reloadOnceForRevision(opts.storage, opts.location);
    throw err;
  }
}
