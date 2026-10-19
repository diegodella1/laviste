import {PRACTICE_FOOTER, friendlyApiError} from './copy.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export const FUENTES_COPY = {
  nav: 'Admin · Fuentes',
  eyebrow: 'Admin',
  h1: 'Fuentes',
  lead: 'Feeds RSS base para el monitoreo de noticias. El agente puede buscar algo más si hace falta.',
  warnBase: 'Estas fuentes alimentan el seguimiento; no cambian el chat del agente.',
  warnStore: 'Solo se usan títulos, links y snippets cortos — no se republica el artículo completo.',
  warnSsrf: 'Las URLs pasan controles de seguridad (https, sin redes privadas).',
  add: 'Agregar fuente',
  empty: 'Todavía no hay fuentes. Agregá un feed RSS o Atom para empezar.',
  colLabel: 'Nombre',
  colUrl: 'URL',
  colStatus: 'Estado',
  colLast: 'Última prueba',
  enabledOn: 'Activa',
  enabledOff: 'Pausada',
  lastNever: 'Nunca probado',
  lastOk: 'OK · {datetime} ART',
  lastErr: 'Error · {datetime} ART',
  edit: 'Editar',
  delete: 'Eliminar',
  formCreateTitle: 'Nueva fuente',
  formEditTitle: 'Editar fuente',
  formLabel: 'Nombre',
  formUrl: 'URL del feed',
  formUrlPh: 'https://ejemplo.com/feed.xml',
  formSave: 'Guardar',
  formCancel: 'Cancelar',
  formUrlInvalid: 'Usá una URL https válida.',
  probe: 'Probar feed',
  probeLoading: 'Probando feed…',
  probeOk: 'Feed OK · {n} ítems',
  probeEmpty: 'El feed respondió pero no hay ítems legibles.',
  probeError: 'No se pudo probar el feed. {detalle}',
  probeLatency: '{ms} ms',
  deleteTitle: '¿Eliminar esta fuente?',
  deleteBody: 'Se saca de la lista. Las revisiones ya guardadas no se borran.',
  deleteConfirm: 'Eliminar',
  deleteKeep: 'Conservar',
  unlockLead: 'Desbloqueá con la clave de administración para gestionar las fuentes.',
  unlockKey: 'Clave admin',
  unlockCta: 'Desbloquear',
  disabled: 'La administración no está configurada en este servidor (falta ADMIN_KEY_FILE válido).',
  settingsLink: 'Fuentes de noticias →',
  retry: 'Reintentar',
  loadError: 'No se pudo cargar la lista de fuentes.',
};

const C = FUENTES_COPY;

let sessionAdmin = {enabled: false, unlocked: false};
let loading = true;
let loadError = '';
let feeds = [];
let togglingId = '';
let probingId = '';
let saving = false;
let setAdminSession = () => {};
let openModalRef = () => {};
let renderRef = () => {};
let toastRef = () => {};
let bound = false;

export function isAdminFuentesRoute(parts) {
  return parts?.[0] === 'admin' && parts?.[1] === 'fuentes';
}

export function updateAdminFuentesSession(session) {
  sessionAdmin = session?.admin || sessionAdmin;
}

export function validHttpsFeedUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && !url.username && !url.password && !!url.hostname && String(value).trim().length <= 2048;
  } catch {
    return false;
  }
}

function artDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function relativeEs(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const delta = Date.now() - t;
  const abs = Math.abs(delta);
  const sign = delta >= 0 ? -1 : 1;
  const rtf = new Intl.RelativeTimeFormat('es-AR', {numeric: 'always'});
  if (abs < 60_000) return rtf.format(sign * Math.round(abs / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(sign * Math.round(abs / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(sign * Math.round(abs / 3_600_000), 'hour');
  return rtf.format(sign * Math.round(abs / 86_400_000), 'day');
}

function lastLabel(feed) {
  if (feed.lastError) return C.lastErr.replace('{datetime}', artDateTime(feed.lastProbeAt || feed.updatedAt));
  if (feed.lastOkAt) return C.lastOk.replace('{datetime}', artDateTime(feed.lastOkAt));
  return C.lastNever;
}

function sortFeeds(list) {
  return [...list].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(b.id).localeCompare(String(a.id)));
}

function heading(extra = '') {
  return `<div class="page-heading"><div class="eyebrow">${esc(C.eyebrow)}</div><h1 tabindex="-1">${esc(C.h1)}</h1>${extra}</div>`;
}

export function renderAdminFuentes() {
  if (!sessionAdmin.enabled) {
    return `<section class="admin-fuentes admin-fuentes-disabled">${heading()}<p class="callout error">${esc(C.disabled)}</p></section>`;
  }
  if (!sessionAdmin.unlocked) {
    return `<section class="admin-fuentes admin-fuentes-locked">${heading(`<p>${esc(C.unlockLead)}</p>`)}
      <form id="admin-fuentes-unlock" class="admin-unlock"><label class="field">${esc(C.unlockKey)}<input class="input" type="password" name="key" autocomplete="off" required></label>
      <button class="btn primary" type="submit">${esc(C.unlockCta)}</button></form>
      <p class="login-error" id="admin-fuentes-unlock-error" hidden></p></section>`;
  }
  if (loading) {
    return `<section class="admin-fuentes" aria-busy="true">${heading()}<div class="admin-fuentes-skeleton"><div class="sk"></div><div class="sk"></div><div class="sk lg"></div></div></section>`;
  }
  if (loadError) {
    return `<section class="admin-fuentes"><p class="callout error">${esc(loadError)}</p><button class="btn" type="button" data-fuentes-action="reload">${esc(C.retry)}</button></section>`;
  }
  const rows = sortFeeds(feeds);
  const body = rows.length ? `<div class="fuentes-table-wrap"><table class="fuentes-table"><thead><tr>
      <th>${esc(C.colLabel)}</th><th>${esc(C.colUrl)}</th><th>${esc(C.colStatus)}</th><th>${esc(C.colLast)}</th><th></th>
    </tr></thead><tbody>${rows.map(feedRow).join('')}</tbody></table></div>
    <div class="fuentes-cards">${rows.map(feedCard).join('')}</div>`
    : `<div class="fuentes-empty"><p>${esc(C.empty)}</p><button type="button" class="btn primary" data-fuentes-action="add">${esc(C.add)}</button></div>`;
  return `<section class="admin-fuentes">${heading(`<p>${esc(C.lead)}</p>`)}
    <div class="callout amber admin-warnings"><ul>
      <li>${esc(C.warnBase)}</li>
      <li>${esc(C.warnStore)}</li>
      <li>${esc(C.warnSsrf)}</li>
    </ul></div>
    ${rows.length ? `<div class="fuentes-toolbar"><button type="button" class="btn primary" data-fuentes-action="add">${esc(C.add)}</button></div>` : ''}
    ${body}
    <p class="practice-footer" role="contentinfo">${PRACTICE_FOOTER}</p>
  </section>`;
}

function statusMark(feed) {
  const on = !!feed.enabled;
  const label = on ? C.enabledOn : C.enabledOff;
  return `<span class="status-mark ${on ? 'feed-on' : 'feed-off'}">● ${esc(label)}</span>`;
}

function rowActions(feed) {
  const busy = probingId === feed.id || togglingId === feed.id;
  const probeLabel = probingId === feed.id ? C.probeLoading : C.probe;
  return `<div class="fuentes-actions">
    <button type="button" class="btn" data-fuentes-action="probe" data-id="${esc(feed.id)}" ${busy ? 'disabled' : ''}>${esc(probeLabel)}</button>
    <button type="button" class="btn" data-fuentes-action="edit" data-id="${esc(feed.id)}">${esc(C.edit)}</button>
    <button type="button" class="btn admin-danger-outline" data-fuentes-action="delete" data-id="${esc(feed.id)}">${esc(C.delete)}</button>
  </div>`;
}

function feedRow(feed) {
  const on = !!feed.enabled;
  return `<tr class="fuentes-row">
    <td><strong>${esc(feed.label)}</strong></td>
    <td class="fuentes-url"><span title="${esc(feed.url)}">${esc(feed.url)}</span></td>
    <td><button type="button" class="feed-toggle" role="switch" aria-checked="${on ? 'true' : 'false'}" data-fuentes-action="toggle" data-id="${esc(feed.id)}" ${togglingId === feed.id ? 'disabled' : ''}>${statusMark(feed)}</button></td>
    <td class="small muted">${esc(lastLabel(feed))}</td>
    <td>${rowActions(feed)}</td>
  </tr>`;
}

function feedCard(feed) {
  const on = !!feed.enabled;
  return `<article class="fuentes-card">
    <h2>${esc(feed.label)}</h2>
    <p class="fuentes-url">${esc(feed.url)}</p>
    <button type="button" class="feed-toggle" role="switch" aria-checked="${on ? 'true' : 'false'}" data-fuentes-action="toggle" data-id="${esc(feed.id)}" ${togglingId === feed.id ? 'disabled' : ''}>${statusMark(feed)}</button>
    <p class="small muted">${esc(lastLabel(feed))}</p>
    ${rowActions(feed)}
  </article>`;
}

function isFetchTimeout(err) {
  if (!err) return false;
  if (err.name === 'TimeoutError') return true;
  if (err.name === 'AbortError') return /timeout/i.test(String(err.message || ''));
  return false;
}

async function adminFetch(path, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  const {timeoutMs: _drop, ...fetchOpts} = options;
  let response;
  try {
    response = await fetch('/api' + path, {
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json', ...(fetchOpts.headers || {})},
      signal: AbortSignal.timeout(timeoutMs),
      ...fetchOpts,
    });
  } catch (err) {
    if (isFetchTimeout(err)) throw Object.assign(new Error('El servidor no respondió a tiempo.'), {name: 'TimeoutError'});
    throw err;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Error'), {status: response.status});
  return data;
}

function probeHtml(data) {
  if (data?.ok === false) return `<div class="callout error" role="alert">${esc(C.probeError.replace('{detalle}', data.detail || ''))}</div>`;
  if (!data?.itemCount) return `<div class="callout amber">${esc(C.probeEmpty)}</div>`;
  const latency = data.latencyMs != null ? `<p class="small muted">${esc(C.probeLatency.replace('{ms}', String(data.latencyMs)))}</p>` : '';
  const items = (data.items || []).map(item => {
    const when = item.publishedAt ? `<span class="small muted">${esc(relativeEs(item.publishedAt))}</span>` : '';
    const link = item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>` : esc(item.title);
    return `<li>${link} ${when}</li>`;
  }).join('');
  return `<div class="fuentes-probe-ok"><p>${esc(C.probeOk.replace('{n}', String(data.itemCount)))}</p>${latency}<ul>${items}</ul></div>`;
}

function formHtml(feed) {
  const label = feed?.label || '';
  const url = feed?.url || '';
  const probeOk = validHttpsFeedUrl(url);
  return `<form id="fuentes-form" data-id="${esc(feed?.id || '')}">
    <label class="field">${esc(C.formLabel)}<input class="input" name="label" maxlength="80" required value="${esc(label)}"></label>
    <label class="field">${esc(C.formUrl)}<input class="input" name="url" maxlength="2048" placeholder="${esc(C.formUrlPh)}" required value="${esc(url)}"></label>
    <p id="fuentes-form-error" class="login-error" hidden></p>
    <div id="fuentes-probe-well" class="admin-preview-well" aria-live="polite"></div>
    <div class="form-actions">
      <button type="button" class="btn" data-fuentes-action="form-cancel">${esc(C.formCancel)}</button>
      <button type="button" class="btn" data-fuentes-action="form-probe" ${probeOk ? '' : 'disabled'}>${esc(C.probe)}</button>
      <button type="submit" class="btn primary" ${saving ? 'disabled' : ''}>${esc(C.formSave)}</button>
    </div>
  </form>`;
}

function openForm(feed) {
  const title = feed ? C.formEditTitle : C.formCreateTitle;
  openModalRef(title, formHtml(feed));
}

function formFields() {
  const form = document.getElementById('fuentes-form');
  if (!form) return null;
  const data = Object.fromEntries(new FormData(form));
  return {id: form.dataset.id || '', label: String(data.label || '').trim(), url: String(data.url || '').trim()};
}

function showFormError(message) {
  const el = document.getElementById('fuentes-form-error');
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

async function persistForm() {
  const fields = formFields();
  if (!fields) return;
  if (!fields.label) { showFormError('Indicá un nombre.'); return; }
  if (!validHttpsFeedUrl(fields.url)) { showFormError(C.formUrlInvalid); return; }
  saving = true;
  const body = JSON.stringify({label: fields.label, url: fields.url});
  try {
    if (fields.id) await adminFetch(`/admin/feeds/${fields.id}`, {method: 'PATCH', body});
    else await adminFetch('/admin/feeds', {method: 'POST', body});
    document.getElementById('modal')?.close();
    await loadAdminFuentes({admin: sessionAdmin, quiet: true});
    toastRef(fields.id ? 'Fuente guardada.' : 'Fuente agregada.');
    renderRef();
  } catch (err) {
    showFormError(err.message);
  } finally {
    saving = false;
  }
}

export async function loadAdminFuentes(session = {}, {quiet = false} = {}) {
  sessionAdmin = session?.admin || sessionAdmin;
  if (!sessionAdmin.enabled || !sessionAdmin.unlocked) {
    loading = false;
    return;
  }
  if (!quiet) {
    loading = true;
    loadError = '';
  }
  try {
    const payload = await adminFetch('/admin/feeds');
    feeds = payload.feeds || [];
    loadError = '';
  } catch (err) {
    loadError = C.loadError;
    if (err.status === 401) loadError = err.message;
  } finally {
    loading = false;
  }
}

export function bindAdminFuentes({render, toast, openModal, onUnlock}) {
  renderRef = render;
  toastRef = toast;
  openModalRef = openModal;
  setAdminSession = onUnlock || (() => {});
  if (bound) return;
  bound = true;
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
}

async function onClick(e) {
  const btn = e.target.closest('[data-fuentes-action]');
  if (!btn) return;
  const action = btn.dataset.fuentesAction;
  const id = btn.dataset.id;
  try {
    if (action === 'reload') { await loadAdminFuentes({admin: sessionAdmin}); renderRef(); return; }
    if (action === 'add') { openForm(null); return; }
    if (action === 'edit') { openForm(feeds.find(f => f.id === id)); return; }
    if (action === 'form-cancel') { document.getElementById('modal')?.close(); return; }
    if (action === 'delete') {
      openModalRef(
        C.deleteTitle,
        `<p class="modal-copy">${esc(C.deleteBody)}</p><div class="form-actions"><button type="button" class="btn" data-action="close">${esc(C.deleteKeep)}</button><button type="button" class="btn primary admin-danger" data-fuentes-action="delete-confirm" data-id="${esc(id)}">${esc(C.deleteConfirm)}</button></div>`,
        btn,
      );
      return;
    }
    if (action === 'delete-confirm') {
      document.getElementById('modal')?.close();
      await adminFetch(`/admin/feeds/${id}`, {method: 'DELETE', body: '{}'});
      feeds = feeds.filter(f => f.id !== id);
      toastRef('Fuente eliminada.');
      renderRef();
      return;
    }
    if (action === 'toggle') {
      const feed = feeds.find(f => f.id === id);
      if (!feed) return;
      togglingId = id;
      renderRef();
      try {
        const saved = await adminFetch(`/admin/feeds/${id}`, {method: 'PATCH', body: JSON.stringify({enabled: !feed.enabled})});
        feeds = sortFeeds(feeds.map(f => f.id === id ? saved : f));
        toastRef('Estado actualizado.');
      } finally {
        togglingId = '';
        renderRef();
      }
      return;
    }
    if (action === 'probe') {
      probingId = id;
      renderRef();
      try {
        const data = await adminFetch(`/admin/feeds/${id}/probe`, {method: 'POST', body: '{}', timeoutMs: 20000});
        if (data.feed) feeds = sortFeeds(feeds.map(f => f.id === id ? data.feed : f));
        openModalRef(C.probe, probeHtml(data));
      } catch (err) {
        openModalRef(C.probe, `<div class="callout error" role="alert">${esc(C.probeError.replace('{detalle}', err.message))}</div>`);
      } finally {
        probingId = '';
        renderRef();
      }
      return;
    }
    if (action === 'form-probe') {
      const fields = formFields();
      const well = document.getElementById('fuentes-probe-well');
      if (!fields || !well) return;
      if (!validHttpsFeedUrl(fields.url)) { showFormError(C.formUrlInvalid); return; }
      well.innerHTML = `<p class="processing" aria-live="polite">${esc(C.probeLoading)}</p>`;
      btn.disabled = true;
      try {
        const data = await adminFetch('/admin/feeds/probe', {method: 'POST', body: JSON.stringify({url: fields.url}), timeoutMs: 20000});
        well.innerHTML = probeHtml(data);
      } catch (err) {
        well.innerHTML = `<div class="callout error" role="alert">${esc(C.probeError.replace('{detalle}', err.message))}</div>`;
      } finally {
        btn.disabled = !validHttpsFeedUrl(formFields()?.url);
      }
    }
  } catch (err) {
    togglingId = '';
    probingId = '';
    toastRef(friendlyApiError(err, {superadmin: true}));
    renderRef();
  }
}

function onInput(e) {
  if (e.target?.name !== 'url' || e.target.closest('#fuentes-form') == null) return;
  const probe = document.querySelector('[data-fuentes-action="form-probe"]');
  if (probe) probe.disabled = !validHttpsFeedUrl(e.target.value);
  const err = document.getElementById('fuentes-form-error');
  if (err && !err.hidden && validHttpsFeedUrl(e.target.value)) err.hidden = true;
}

async function onSubmit(e) {
  if (e.target.id === 'fuentes-form') {
    e.preventDefault();
    await persistForm();
    return;
  }
  if (e.target.id !== 'admin-fuentes-unlock') return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const errEl = document.getElementById('admin-fuentes-unlock-error');
  try {
    await adminFetch('/admin/login', {method: 'POST', body: JSON.stringify({key: data.key})});
    sessionAdmin = {...sessionAdmin, unlocked: true};
    setAdminSession(sessionAdmin);
    await loadAdminFuentes({admin: sessionAdmin});
    renderRef();
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.hidden = false; }
  }
}
