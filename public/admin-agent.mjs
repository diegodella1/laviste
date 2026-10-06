import {PRACTICE_FOOTER} from './copy.mjs';

const DRAFT_KEY = 'lvAdminAgentDraft';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

let savedBody = '';
let editorBody = '';
let dirty = false;
let payload = null;
let loading = true;
let loadError = '';
let saving = false;
let previewState = 'idle';
let previewMessage = '';
let previewProposal = null;
let previewError = '';
let sampleId = 'vaca';
let customThesis = '';
let sessionAdmin = {enabled: false, unlocked: false};
let unlockError = '';
let leaveProceed = null;
let pendingSaveAfterWarnings = false;
let openModalRef = () => {};

const PREVIEW_HOURLY_LIMIT_MSG = 'Llegaste al límite de pruebas de esta hora. Probá de nuevo más tarde.';

const samples = [
  ['vaca', 'Vaca Muerta / energía'],
  ['bonos', 'Bonos AL30/GD30 · compresión de riesgo país'],
  ['latam', 'Giro pro-mercado en LatAm'],
  ['custom', 'Personalizada'],
];

export function isAdminAgentRoute(parts) {
  return parts?.[0] === 'admin' && parts?.[1] === 'agente';
}

export function adminAgentDirty() {
  return dirty;
}

function artStamp(iso) {
  if (!iso) return 'Aún no hay ediciones: se usa el predeterminado del código.';
  return new Date(iso).toLocaleString('es-AR', {timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) + ' ART';
}

function tokenEstimate(text) {
  return Math.ceil(String(text).length / 4);
}

function lineDiff(a, b) {
  const left = String(a).split('\n');
  const right = String(b).split('\n');
  const setB = new Set(right);
  const setA = new Set(left);
  return {added: right.filter(line => !setA.has(line)).length, removed: left.filter(line => !setB.has(line)).length};
}

function setEditor(text) {
  editorBody = text;
  dirty = editorBody !== savedBody;
  try { sessionStorage.setItem(DRAFT_KEY, editorBody); } catch {}
}

function restoreDraft() {
  try {
    const draft = sessionStorage.getItem(DRAFT_KEY);
    if (draft && sessionAdmin.unlocked) setEditor(draft);
  } catch {}
}

export function renderAdminAgent({aiConfigured}) {
  if (!sessionAdmin.enabled) {
    return `<section class="admin-agent admin-agent-disabled"><div class="page-heading"><div class="eyebrow">Admin</div><h1 tabindex="-1">Agente</h1></div><p class="callout error">La administración del prompt no está configurada en este servidor (falta ADMIN_KEY_FILE válido).</p></section>`;
  }
  if (!sessionAdmin.unlocked) {
    return `<section class="admin-agent admin-agent-locked"><div class="page-heading"><div class="eyebrow">Admin</div><h1 tabindex="-1">Agente</h1><p>Desbloqueá con la clave de administración para editar el prompt.</p></div><form id="admin-unlock" class="admin-unlock"><label class="field">Clave admin<input class="input" type="password" name="key" autocomplete="off" required></label><button class="btn primary" type="submit">Desbloquear</button></form><p class="login-error" id="admin-unlock-error" hidden></p></section>`;
  }
  if (loading) return `<section class="admin-agent" aria-busy="true"><div class="page-heading"><div class="eyebrow">Admin</div><h1 tabindex="-1">Agente</h1></div><div class="admin-agent-skeleton"><div class="sk lg"></div><div class="sk"></div></div></section>`;
  if (loadError) return `<section class="admin-agent"><p class="callout error">${esc(loadError)}</p><button class="btn" type="button" data-admin-action="reload">Reintentar</button></section>`;

  const active = payload?.active;
  const meta = active?.createdAt ? `Última edición: ${artStamp(active.createdAt)} · ${esc(active.who || 'admin')}` : 'Aún no hay ediciones: se usa el predeterminado del código.';
  const chars = editorBody.length;
  const nearMax = chars > 45000;
  const noVersions = !(payload?.versions?.length);
  const unchangedDefault = !dirty && noVersions && (active?.isDefault ?? true);
  const pill = dirty
    ? '<span class="admin-pill admin-pill-dirty">Sin guardar</span>'
    : unchangedDefault
      ? '<span class="admin-pill admin-pill-clean">Sin cambios</span>'
      : '<span class="admin-pill admin-pill-clean">Guardado</span>';

  const history = (payload?.versions || []).map(v => `<li class="admin-version" role="listitem"><div class="admin-version-head"><strong>v${v.version}</strong> · ${artStamp(v.createdAt)}${v.isActive ? ' · <span class="pill">Actual</span>' : ''}</div><div class="small muted">${esc((v.note || '').slice(0, 80))}${(v.note || '').length > 80 ? '…' : ''} · admin</div><div class="form-actions">${v.isActive ? '' : `<button type="button" class="btn" data-admin-action="restore" data-version-id="${esc(v.id)}" data-version-num="${v.version}">Restaurar</button>`}<button type="button" class="btn" data-admin-action="diff" data-version-id="${esc(v.id)}" data-version-num="${v.version}">Diff</button></div></li>`).join('') || '<li class="muted">Sin versiones guardadas todavía.</li>';

  const previewBody = previewState === 'loading' ? '<p class="processing" aria-live="polite">Analizando con el borrador…</p>'
    : previewState === 'error' ? `<div class="callout error" role="alert">${esc(previewError)}</div>`
    : previewState === 'success' ? renderPreviewCard(previewProposal, previewMessage)
    : '<p class="muted admin-preview-empty">Ejecutá una prueba para ver la cartera de ejemplo.</p>';

  const customField = sampleId === 'custom' ? `<label class="field">Tesis personalizada<textarea id="admin-custom-thesis" class="input admin-mono" rows="4" maxlength="4000" placeholder="Escribí una tesis breve (Argentina o macro LatAm).">${esc(customThesis)}</textarea></label>` : '';

  return `<section class="admin-agent"><div class="page-heading"><div class="eyebrow">Admin</div><h1 tabindex="-1">Agente</h1><p>Prompt de sistema que, a partir de una tesis, analiza contexto y propone una cartera de práctica.</p><p class="small muted">${meta}</p></div>
  <div class="callout amber admin-warnings"><ul><li>Los cambios afectan todos los análisis futuros.</li><li>Las tesis y conversaciones existentes no se re-analizan.</li><li>El prompt debe conservar las reglas de formato de salida exigidas por el schema (propuesta JSON, catálogo, pesos).</li><li>Debe preservarse el comportamiento de práctica: sin órdenes, sin fingir guardados, disclaimer en la UI.</li></ul></div>
  <div class="admin-agent-grid">
    <div class="admin-editor-panel">
      <label class="field" for="admin-prompt-body">Prompt de sistema</label>
      <textarea id="admin-prompt-body" class="input admin-mono admin-prompt-editor" spellcheck="false" aria-label="Prompt de sistema del agente" maxlength="48000">${esc(editorBody)}</textarea>
      <p class="small muted admin-helper">El servidor agrega el catálogo y el contexto de la conversación en cada llamada. No hace falta pegar el JSON del catálogo aquí.</p>
      <div class="admin-editor-foot"><span class="${nearMax ? 'negative' : 'muted'}">${chars.toLocaleString('es-AR')} caracteres · ≈ ${tokenEstimate(editorBody).toLocaleString('es-AR')} tokens (estimación)</span>${pill}</div>
      <p id="admin-validation-error" class="login-error" hidden role="alert"></p>
      <div class="form-actions admin-editor-actions${dirty ? ' admin-editor-actions-dirty' : ''}"><button type="button" class="btn" data-admin-action="cancel" ${dirty ? '' : 'disabled'}>Cancelar</button><button type="button" class="btn primary" data-admin-action="save" ${dirty && !saving ? '' : 'disabled'}>${saving ? 'Guardando…' : 'Guardar'}</button></div>
      <button type="button" class="btn admin-reset" data-admin-action="reset">Restablecer predeterminado</button>
      <details class="admin-locked"><summary>Bloque fijo del servidor (no editable)</summary><pre class="admin-mono admin-locked-pre">${esc(payload?.lockedSuffix || '')}</pre></details>
    </div>
    <div class="admin-side-panel">
      <section><h2>Historial</h2><ul class="admin-history" role="list">${history}</ul></section>
      <section class="admin-probar"><h2>Probar</h2><p class="small muted">Ejecuta el borrador actual contra una tesis de ejemplo. No crea tesis ni conversaciones.</p>
        ${!aiConfigured ? '<p class="callout amber">Cargá tu clave OpenAI en <a href="#/settings">Configuración</a> para probar.</p>' : ''}
        <fieldset class="admin-samples">${samples.map(([id, label]) => `<label class="check-label"><input type="radio" name="admin-sample" value="${id}" ${sampleId === id ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</fieldset>
        ${customField}
        <button type="button" class="btn primary" data-admin-action="preview" ${aiConfigured ? '' : 'disabled'}>Probar con borrador</button>
        <div class="admin-preview-well" aria-live="polite">${previewBody}</div>
      </section>
    </div>
  </div>
  <p class="practice-footer" role="contentinfo">${PRACTICE_FOOTER}</p>
  </section>`;
}

function renderPreviewCard(proposal, message) {
  if (!proposal) {
    return `<div class="admin-preview-card"><span class="pill">Vista previa · no guardada</span><p>${esc(message)}</p><span class="pill">Sin cartera aún</span></div>`;
  }
  const sum = proposal.holdings.reduce((s, h) => s + h.weight, 0);
  const cash = 100 - sum;
  return `<div class="admin-preview-card portfolio-card"><div class="portfolio-card-head"><div><span class="eyebrow">Propuesta</span><h2>${esc(proposal.title)}</h2><p class="portfolio-thesis">${esc(proposal.thesis)}</p><span class="pill">${esc(proposal.horizon)}</span><div class="small muted">${proposal.holdings.length} posiciones · ${cash.toFixed(0)}% efectivo</div></div><span class="pill">Vista previa · no guardada</span></div><div class="portfolio-holdings">${proposal.holdings.map(h => `<div class="portfolio-hold"><strong>${esc(h.ticker)}</strong> · ${h.weight}%<p class="small muted">${esc(h.reason)}</p></div>`).join('')}</div><p class="small muted">${esc(message)}</p></div>`;
}

function isFetchTimeout(err) {
  if (!err) return false;
  if (err.name === 'TimeoutError') return true;
  if (err.name === 'AbortError') {
    const reason = err.cause ?? err;
    if (reason?.name === 'TimeoutError') return true;
    if (err.timedOut === true) return true;
    return /timeout/i.test(String(reason?.message || err.message || ''));
  }
  return false;
}

async function adminFetch(path, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120000;
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
    if (isFetchTimeout(err)) throw Object.assign(new Error('El proveedor tardó demasiado.'), {name: 'TimeoutError', timedOut: true});
    throw err;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Error'), {status: response.status});
  return data;
}

function previewErrorMessage(err) {
  if (err.status === 429) {
    if (/cuota/i.test(err.message)) return 'Cuota diaria de chat agotada.';
    if (/última hora|pruebas en la/i.test(err.message)) return PREVIEW_HOURLY_LIMIT_MSG;
    return 'Hay una solicitud IA en curso. Esperá un momento.';
  }
  if (err.status === 503) return 'Cargá tu clave OpenAI en Configuración para probar.';
  if (isFetchTimeout(err)) return 'El proveedor tardó demasiado. Reintentá.';
  return `No se pudo completar la prueba. ${err.message}`;
}

export function promptAdminLeave(openModal, onProceed) {
  if (!dirty) {
    onProceed();
    return;
  }
  leaveProceed = onProceed;
  const trigger = document.activeElement;
  openModal(
    'Hay cambios sin guardar',
    `<p class="modal-copy">Si salís ahora, se pierden los cambios del editor.</p><div class="form-actions"><button type="button" class="btn" data-admin-action="leave-cancel">Seguir editando</button><button type="button" class="btn primary" data-admin-action="leave-discard">Descartar cambios</button></div>`,
    trigger,
  );
}

function openSaveNoteModal(openModal, trigger) {
  openModal(
    'Nota de versión',
    `<form id="admin-save-note" class="admin-save-note"><label class="field">Nota (opcional)<input class="input" type="text" name="note" maxlength="120" placeholder="Ej. Ajuste de tono rioplatense"></label><div class="form-actions"><button type="button" class="btn" data-admin-action="save-note-cancel">Cancelar</button><button type="submit" class="btn primary">Guardar</button></div></form>`,
    trigger,
  );
  document.getElementById('admin-save-note')?.querySelector('input[name=note]')?.focus();
}

async function persistSave(note, {toast}) {
  saving = true;
  render();
  await adminFetch('/admin/agent-prompt', {method: 'PUT', body: JSON.stringify({body: editorBody, note, force: true})});
  await loadAdminAgent({admin: sessionAdmin});
  toast(`Prompt guardado · v${payload.active?.version || ''}`);
  try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
  saving = false;
  pendingSaveAfterWarnings = false;
  render();
}

export async function loadAdminAgent(session) {
  sessionAdmin = session?.admin || sessionAdmin;
  if (!sessionAdmin.enabled || !sessionAdmin.unlocked) {
    loading = false;
    restoreDraft();
    return;
  }
  loading = true;
  loadError = '';
  try {
    payload = await adminFetch('/admin/agent-prompt');
    savedBody = payload.active?.body || payload.defaultBody || '';
    const draft = sessionStorage.getItem(DRAFT_KEY);
    editorBody = draft && draft !== savedBody ? draft : savedBody;
    dirty = editorBody !== savedBody;
  } catch (err) {
    loadError = err.message;
  } finally {
    loading = false;
  }
}

export function updateAdminSession(session) {
  sessionAdmin = session?.admin || sessionAdmin;
}

export function bindAdminAgent({render, toast, openModal, onNavigate}) {
  openModalRef = openModal;
  const root = document.getElementById('app');
  if (!root) return;

  root.addEventListener('click', async e => {
    const btn = e.target.closest('[data-admin-action]');
    if (!btn) return;
    const action = btn.dataset.adminAction;
    try {
      if (action === 'reload') { await loadAdminAgent({admin: sessionAdmin}); render(); return; }
      if (action === 'cancel') { setEditor(savedBody); render(); return; }
      if (action === 'save') {
        const validation = await adminFetch('/admin/agent-prompt/validate', {method: 'POST', body: JSON.stringify({body: editorBody})});
        const errEl = document.getElementById('admin-validation-error');
        if (!validation.ok) {
          if (errEl) { errEl.textContent = `Faltan instrucciones obligatorias: ${validation.errors.map(item => item.message || item).join(', ')}.`; errEl.hidden = false; }
          return;
        }
        if (errEl) errEl.hidden = true;
        if (validation.warnings?.length) {
          pendingSaveAfterWarnings = true;
          openModal(
            'Advertencias en el prompt',
            `<p class="modal-copy">Advertencia: ${esc(validation.warnings.map(w => w.message || w).join(', '))}. ¿Guardar de todos modos?</p><div class="form-actions"><button type="button" class="btn" data-admin-action="save-warn-cancel">Cancelar</button><button type="button" class="btn primary" data-admin-action="save-warn-confirm">Guardar de todos modos</button></div>`,
            btn,
          );
          return;
        }
        openSaveNoteModal(openModal, btn);
      }
      if (action === 'save-warn-cancel') {
        pendingSaveAfterWarnings = false;
        document.getElementById('modal')?.close();
      }
      if (action === 'save-warn-confirm') {
        document.getElementById('modal')?.close();
        openSaveNoteModal(openModal, btn);
      }
      if (action === 'save-note-cancel') document.getElementById('modal')?.close();
      if (action === 'leave-cancel') {
        leaveProceed = null;
        document.getElementById('modal')?.close();
      }
      if (action === 'leave-discard') {
        document.getElementById('modal')?.close();
        setEditor(savedBody);
        dirty = false;
        const proceed = leaveProceed;
        leaveProceed = null;
        proceed?.();
      }
      if (action === 'reset') {
        openModal('¿Restablecer el prompt de fábrica?', `<p class="modal-copy">Se crea una versión nueva con el texto predeterminado del código. El historial no se borra.</p><div class="form-actions"><button class="btn" data-admin-action="reset-cancel">Conservar actual</button><button class="btn primary admin-danger" data-admin-action="reset-confirm">Restablecer</button></div>`);
      }
      if (action === 'reset-cancel') { document.getElementById('modal')?.close(); }
      if (action === 'reset-confirm') {
        document.getElementById('modal')?.close();
        await adminFetch('/admin/agent-prompt/reset', {method: 'POST', body: JSON.stringify({confirm: true})});
        await loadAdminAgent({admin: sessionAdmin});
        toast('Predeterminado restaurado.');
        render();
      }
      if (action === 'restore') {
        const num = btn.dataset.versionNum;
        const versionId = btn.dataset.versionId;
        openModal(
          '¿Restaurar esta versión?',
          `<p class="modal-copy">Se publica una versión nueva con ese texto. La historia anterior permanece.</p><div class="form-actions"><button type="button" class="btn" data-admin-action="restore-cancel">Cancelar</button><button type="button" class="btn primary" data-admin-action="restore-confirm" data-version-id="${esc(versionId)}" data-version-num="${esc(num)}">Restaurar</button></div>`,
          btn,
        );
      }
      if (action === 'restore-cancel') document.getElementById('modal')?.close();
      if (action === 'restore-confirm') {
        document.getElementById('modal')?.close();
        const num = btn.dataset.versionNum;
        await adminFetch('/admin/agent-prompt/restore', {method: 'POST', body: JSON.stringify({versionId: btn.dataset.versionId, note: `Restaurado desde v${num}`})});
        await loadAdminAgent({admin: sessionAdmin});
        toast('Versión restaurada.');
        render();
      }
      if (action === 'diff') {
        const row = await adminFetch(`/admin/agent-prompt/versions/${btn.dataset.versionId}`);
        const stats = lineDiff(editorBody, row.body);
        openModal(`Diff · v${btn.dataset.versionNum} vs actual`, `<p class="small muted">Cambios: +${stats.added} / −${stats.removed} líneas</p><pre class="admin-mono admin-diff-pre">${esc(row.body)}</pre><button class="btn" data-admin-action="close-modal">Cerrar</button>`);
      }
      if (action === 'close-modal') document.getElementById('modal')?.close();
      if (action === 'preview') {
        previewState = 'loading'; previewError = ''; render();
        const thesis = sampleId === 'custom' ? (document.getElementById('admin-custom-thesis')?.value || customThesis).trim() : undefined;
        try {
          const validation = await adminFetch('/admin/agent-prompt/validate', {method: 'POST', body: JSON.stringify({body: editorBody})});
          if (!validation.ok) throw new Error(`Faltan instrucciones obligatorias: ${validation.errors.map(item => item.message || item).join(', ')}.`);
          const result = await adminFetch('/admin/agent-prompt/preview', {method: 'POST', body: JSON.stringify({body: editorBody, sampleId, thesis})});
          previewMessage = result.message;
          previewProposal = result.proposal;
          previewState = 'success';
        } catch (err) {
          previewState = 'error';
          previewError = previewErrorMessage(err);
        }
        render();
      }
    } catch (err) {
      saving = false;
      toast(err.message);
      render();
    }
  });

  root.addEventListener('input', e => {
    if (e.target.id === 'admin-prompt-body') setEditor(e.target.value);
    if (e.target.id === 'admin-custom-thesis') customThesis = e.target.value;
    if (e.target.id === 'admin-prompt-body' || e.target.id === 'admin-custom-thesis') render();
  });

  root.addEventListener('change', e => {
    if (e.target.name === 'admin-sample') { sampleId = e.target.value; render(); }
  });

  root.addEventListener('keydown', e => {
    const onAdmin = isAdminAgentRoute((location.hash.slice(1) || '/').split('/').filter(Boolean));
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && onAdmin) {
      e.preventDefault();
      root.querySelector('[data-admin-action="save"]')?.click();
    }
    if (e.key === 'Escape' && e.target.id === 'admin-prompt-body' && dirty && onAdmin && !document.getElementById('modal')?.open) {
      e.preventDefault();
      promptAdminLeave(openModalRef, () => {});
    }
  });

  root.addEventListener('submit', async e => {
    if (e.target.id === 'admin-save-note') {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      document.getElementById('modal')?.close();
      try {
        await persistSave(typeof data.note === 'string' ? data.note.trim() : '', {toast});
      } catch (err) {
        saving = false;
        toast(err.message);
        render();
      }
      return;
    }
    if (e.target.id !== 'admin-unlock') return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const errEl = document.getElementById('admin-unlock-error');
    try {
      await adminFetch('/admin/login', {method: 'POST', body: JSON.stringify({key: data.key})});
      sessionAdmin = {...sessionAdmin, unlocked: true};
      unlockError = '';
      await loadAdminAgent({admin: sessionAdmin});
      render();
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.hidden = false; }
    }
  });

  window.addEventListener('beforeunload', e => {
    if (dirty && isAdminAgentRoute((location.hash.slice(1) || '/').split('/').filter(Boolean))) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

}
