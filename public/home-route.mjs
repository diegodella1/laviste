/** Authenticated SPA home. Public `/` redirects here when a session exists. */
export const PANEL_HOME = '/app';
export const PANEL_HOME_HASH = '#/';

export function publicHomeRedirectLocation(pathname, hasSession) {
  return pathname === '/' && !!hasSession ? PANEL_HOME : null;
}

/**
 * Same-origin in-app next after login. Returns a hash (`#/...`) or null.
 * Rejects protocol-relative URLs, other origins, and non-panel paths.
 */
export function safePanelNext(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (value.startsWith('#/')) return value;
  if (value === '#' || value === PANEL_HOME_HASH) return PANEL_HOME_HASH;
  if (value === PANEL_HOME || value === `${PANEL_HOME}/` || value === `${PANEL_HOME}#`) return PANEL_HOME_HASH;
  if (value.startsWith(`${PANEL_HOME}#/`)) return value.slice(PANEL_HOME.length);
  return null;
}
