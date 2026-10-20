/** Hash routes for tesis: canonical `#/tesis/<id>`, alias `#/take/<id>`. */

export const PANEL_ALIAS = {
  news: 'news', novedades: 'news',
  positions: 'positions', posiciones: 'positions',
  idea: 'idea',
};

const AJUSTES_TABS = new Set(['ajustes', 'settings', 'preferencias']);

export function isAjustesTab(tab) {
  return AJUSTES_TABS.has(tab);
}

export function panelFromRoute(tab) {
  if (!tab || isAjustesTab(tab)) return null;
  return PANEL_ALIAS[tab] || null;
}

export function parseTakeParts(hash) {
  const raw = String(hash || '').replace(/^#/, '') || '/';
  const noQuery = raw.split('?')[0];
  const path = noQuery.split('#')[0];
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'tesis') parts[0] = 'take';
  return parts;
}

/** Canonical URL: `#/tesis/<id>` and `#/tesis/<id>/ajustes`. Returns null if already canonical. */
export function canonicalTakeHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;
  const qIdx = raw.indexOf('?');
  const beforeQuery = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const query = qIdx >= 0 ? raw.slice(qIdx) : '';
  const nestedIdx = beforeQuery.indexOf('#');
  const path = nestedIdx >= 0 ? beforeQuery.slice(0, nestedIdx) : beforeQuery;
  const nested = nestedIdx >= 0 ? beforeQuery.slice(nestedIdx) : '';
  const parts = path.split('/').filter(Boolean);
  let changed = false;
  if (parts[0] === 'take') {
    parts[0] = 'tesis';
    changed = true;
  }
  if (parts[0] === 'tesis' && isAjustesTab(parts[2]) && parts[2] !== 'ajustes') {
    parts[2] = 'ajustes';
    changed = true;
  }
  if (!changed) return null;
  return '#/' + parts.join('/') + nested + query;
}

export function takeHref(id, panel, focus) {
  const base = `#/tesis/${id}`;
  if (!panel) return base;
  if (isAjustesTab(panel)) return `${base}/ajustes`;
  const key = PANEL_ALIAS[panel] || panel;
  const extra = focus ? `/${focus}` : '';
  return `${base}/${key}${extra}`;
}

/** Nested section after `#/tesis/<id>/ajustes#reglas` → `reglas`. */
export function nestedHashSection(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return '';
  const qIdx = raw.indexOf('?');
  const beforeQuery = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const nestedIdx = beforeQuery.indexOf('#');
  return nestedIdx >= 0 ? beforeQuery.slice(nestedIdx + 1) : '';
}
