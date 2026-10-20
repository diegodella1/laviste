/** TD1 · Ajustes page HTML (frontend only). */

import {
  TD_SET_EYEBROW, TD_SET_TITLE, TD_SET_LEAD,
  TD_SEC_FOLLOW, TD_SEC_FOLLOW_LEAD,
  TD_CAD_PATIENT, TD_CAD_PATIENT_SUB, TD_CAD_STANDARD, TD_CAD_STANDARD_SUB,
  TD_CAD_MANUAL, TD_CAD_MANUAL_SUB, TD_CAD_NOTE,
  TD_PAUSE_LABEL, TD_PAUSE_ON, TD_PAUSE_OFF, TD_PAUSE_HINT,
  TD_SEC_RULES, TD_SEC_RULES_LEAD,
  TD_PRESET_TIGHT, TD_PRESET_TIGHT_SUB, TD_PRESET_BAL, TD_PRESET_BAL_SUB,
  TD_PRESET_WIDE, TD_PRESET_WIDE_SUB, TD_PRESET_CUSTOM,
  TD_RULES_PRESET_BLOCKED, TD_RULES_CUSTOM, TD_CAP_LABEL, TD_CAP_HELP,
  TD_DRIFT_LABEL, TD_DRIFT_HELP, TD_ERR_CAP_RANGE, TD_ERR_CAP_BELOW_WEIGHT,
  TD_ERR_DRIFT_RANGE, TD_RULES_SAVE, TD_RULES_AUTO_NOTE,
  TD_AUTO_LIMITS, TD_AUTO_UNDO,
  TD_SEC_INDEX, TD_INDEX_CHOSEN, TD_INDEX_RULE, TD_INDEX_NONE, TD_INDEX_DRAFT,
  TD_SEC_MANAGE, TD_ARCHIVE_BTN, TD_ARCHIVE_BODY, TD_ARCHIVE_SIDE,
  TD_ARCHIVE_CONFIRM, TD_ARCHIVE_CANCEL, TD_ARCHIVED_AT,
} from './copy.mjs';
import {switchHtml} from './auto.mjs';
import {artShortDayMonth} from './format.mjs';
import {takeHref} from './take-route.mjs';

export const CADENCE_OPTIONS = Object.freeze([
  {id: 'patient', label: TD_CAD_PATIENT, sub: TD_CAD_PATIENT_SUB},
  {id: 'standard', label: TD_CAD_STANDARD, sub: TD_CAD_STANDARD_SUB},
  {id: 'manual', label: TD_CAD_MANUAL, sub: TD_CAD_MANUAL_SUB},
]);

export const RULES_PRESETS = Object.freeze([
  {id: 'tight', cap: 20, drift: 3, label: TD_PRESET_TIGHT, sub: TD_PRESET_TIGHT_SUB},
  {id: 'bal', cap: 25, drift: 5, label: TD_PRESET_BAL, sub: TD_PRESET_BAL_SUB},
  {id: 'wide', cap: 25, drift: 10, label: TD_PRESET_WIDE, sub: TD_PRESET_WIDE_SUB},
]);

export function cadenceLabel(id) {
  return CADENCE_OPTIONS.find(o => o.id === id)?.label || id;
}

export function joinEsAr(items) {
  const list = (items || []).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  if (list.length === 2) return `${list[0]} y ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}

export function maxTargetWeight(t) {
  const weights = (t?.holdings || []).map(h => Number(h.weight)).filter(Number.isFinite);
  return weights.length ? Math.max(...weights) : 0;
}

export function presetFor(cap, drift) {
  return RULES_PRESETS.find(p => p.cap === Number(cap) && p.drift === Number(drift)) || null;
}

export function presetBlockedTickers(preset, t) {
  return (t?.holdings || []).filter(h => Number(h.weight) > preset.cap).map(h => h.ticker);
}

export function presetBlockedReason(preset, t) {
  const tickers = presetBlockedTickers(preset, t);
  if (!tickers.length) return '';
  return TD_RULES_PRESET_BLOCKED(joinEsAr(tickers), Math.round(maxTargetWeight(t)));
}

export function parseNum(raw) {
  if (typeof raw === 'number') return raw;
  const s = String(raw ?? '').trim().replace(',', '.');
  if (!s) return NaN;
  return Number(s);
}

export function validateCapDrift(cap, drift, maxWeight) {
  const errors = {};
  if (!Number.isFinite(cap) || cap < 10 || cap > 25) errors.cap = TD_ERR_CAP_RANGE;
  else if (cap < maxWeight) errors.cap = TD_ERR_CAP_BELOW_WEIGHT(Math.round(maxWeight));
  if (!Number.isFinite(drift) || drift < 1 || drift > 20) errors.drift = TD_ERR_DRIFT_RANGE;
  return errors;
}

export function settingsPayload(t, patch = {}) {
  return {
    cadence: patch.cadence ?? t.settings.cadence,
    mode: 'ask',
    cap: patch.cap ?? t.settings.cap,
    drift: patch.drift ?? t.settings.drift,
    paused: patch.paused ?? t.settings?.paused ?? false,
    monitoringPaused: patch.monitoringPaused ?? !!t.monitoringPaused,
  };
}

export function archivedAtLabel(t) {
  const iso = t.archivedAt || '';
  return TD_ARCHIVED_AT(iso ? artShortDayMonth(iso) : '');
}

function fieldError(id, message, esc) {
  return `<p class="field-error" id="${esc(id)}" ${message ? '' : 'hidden'}>${esc(message || '')}</p>`;
}

function cadenceCardsHtml(t, esc) {
  const current = t.settings?.cadence || 'standard';
  const cards = CADENCE_OPTIONS.map(opt => {
    const checked = opt.id === current ? ' checked' : '';
    return `<label class="opt cadence-opt"><input type="radio" name="td-cadence" value="${esc(opt.id)}"${checked}><span class="opt-title">${esc(opt.label)}</span><span class="opt-sub">${esc(opt.sub)}</span></label>`;
  }).join('');
  return `<div class="opt-grid" role="radiogroup" aria-label="${esc(TD_SEC_FOLLOW)}">${cards}</div><p class="small muted">${esc(TD_CAD_NOTE)}</p>`;
}

function pauseSwitchHtml(t, esc) {
  return switchHtml({
    checked: !!t.monitoringPaused, disabled: false, action: 'pause-follow', takeId: t.id,
    label: TD_PAUSE_LABEL, hint: TD_PAUSE_HINT, esc,
    onLabel: TD_PAUSE_ON, offLabel: TD_PAUSE_OFF,
  });
}

function followSectionHtml(t, esc) {
  if (t.phase !== 'active') return '';
  return `<section class="sec" id="seguimiento" aria-labelledby="td-follow">
    <h2 id="td-follow" tabindex="-1">${esc(TD_SEC_FOLLOW)}</h2>
    <p class="muted">${esc(TD_SEC_FOLLOW_LEAD)}</p>
    ${cadenceCardsHtml(t, esc)}
    <div class="pause-row">${pauseSwitchHtml(t, esc)}</div>
    <p class="form-alert" id="pause-error" role="alert" hidden></p>
  </section>`;
}

function presetCardsHtml(t, esc) {
  const match = presetFor(t.settings.cap, t.settings.drift);
  const cards = RULES_PRESETS.map(p => {
    const blocked = presetBlockedReason(p, t);
    const checked = !blocked && match?.id === p.id ? ' checked' : '';
    const aria = blocked ? ' aria-disabled="true"' : '';
    const reason = blocked ? `<span class="opt-block">${esc(blocked)}</span>` : '';
    return `<label class="opt preset-opt${blocked ? ' is-disabled' : ''}"${aria}><input type="radio" name="td-preset" value="${esc(p.id)}" data-cap="${p.cap}" data-drift="${p.drift}"${checked}${blocked ? ' data-blocked="1"' : ''}><span class="opt-title">${esc(p.label)}</span><span class="opt-sub">${esc(p.sub)}</span>${reason}</label>`;
  }).join('');
  const custom = match ? '' : `<p class="small muted" id="td-preset-custom">${esc(TD_PRESET_CUSTOM(t.settings.cap, t.settings.drift))}</p>`;
  return `<div class="opt-grid" role="radiogroup" aria-label="${esc(TD_SEC_RULES)}">${cards}</div>${custom}`;
}

function rulesSectionHtml(t, esc) {
  if (t.phase === 'archived') return '';
  const maxW = Math.round(maxTargetWeight(t));
  const match = presetFor(t.settings.cap, t.settings.drift);
  const open = match ? '' : ' open';
  return `<section class="sec" id="reglas" aria-labelledby="td-rules">
    <h2 id="td-rules" tabindex="-1">${esc(TD_SEC_RULES)}</h2>
    <p class="muted">${esc(TD_SEC_RULES_LEAD)}</p>
    <form id="take-settings" data-id="${esc(t.id)}" novalidate>
      ${presetCardsHtml(t, esc)}
      <details class="rules-custom"${open}>
        <summary>${esc(TD_RULES_CUSTOM)}</summary>
        <div class="two-cols">
          <label class="field" for="td-cap">${esc(TD_CAP_LABEL)}
            <input class="input" id="td-cap" name="cap" type="text" inputmode="numeric" value="${esc(t.settings.cap)}" aria-describedby="td-cap-help td-cap-error">
            <span class="small muted" id="td-cap-help">${esc(TD_CAP_HELP(maxW))}</span>
            ${fieldError('td-cap-error', '', esc)}
          </label>
          <label class="field" for="td-drift">${esc(TD_DRIFT_LABEL)}
            <input class="input" id="td-drift" name="drift" type="text" inputmode="numeric" value="${esc(t.settings.drift)}" aria-describedby="td-drift-help td-drift-error">
            <span class="small muted" id="td-drift-help">${esc(TD_DRIFT_HELP)}</span>
            ${fieldError('td-drift-error', '', esc)}
          </label>
        </div>
      </details>
      <button class="btn primary" type="submit">${esc(TD_RULES_SAVE)}</button>
      <p class="small muted">${esc(TD_RULES_AUTO_NOTE)}</p>
    </form>
  </section>`;
}

function autoSectionHtml(autoHtml, esc) {
  if (!autoHtml) return '';
  return `<div class="sec" id="automatico">${autoHtml}<p class="small muted">${esc(TD_AUTO_LIMITS)}</p><p class="small muted">${esc(TD_AUTO_UNDO)}</p></div>`;
}

function indexSectionHtml(t, esc) {
  let body;
  if (t.phase === 'draft') body = `<p>${esc(TD_INDEX_DRAFT)}</p>`;
  else if (!t.benchmarkId) body = `<p>${esc(TD_INDEX_NONE)}</p>`;
  else {
    const label = t.benchmarkLabel || t.benchmarkId;
    body = `<dl class="kv account-dl"><div><dt>${esc(label)}</dt><dd>${esc(TD_INDEX_CHOSEN)}</dd></div></dl><p class="small muted">${esc(TD_INDEX_RULE)}</p>`;
  }
  return `<section class="sec" id="indice" aria-labelledby="td-index">
    <h2 id="td-index" tabindex="-1">${esc(TD_SEC_INDEX)}</h2>
    ${body}
  </section>`;
}

function manageSectionHtml(t, esc) {
  if (t.phase === 'active') {
    return `<section class="sec" id="gestionar" aria-labelledby="td-manage">
      <h2 id="td-manage" tabindex="-1">${esc(TD_SEC_MANAGE)}</h2>
      <button type="button" class="btn danger" data-action="archive" data-id="${esc(t.id)}">${esc(TD_ARCHIVE_BTN)}</button>
    </section>`;
  }
  if (t.phase === 'archived') {
    return `<section class="sec" id="gestionar" aria-labelledby="td-manage">
      <h2 id="td-manage" tabindex="-1">${esc(TD_SEC_MANAGE)}</h2>
      <p>${esc(archivedAtLabel(t))}</p>
    </section>`;
  }
  return '';
}

export function archiveModalHtml({esc, takeId}) {
  return `<p class="modal-copy">${esc(TD_ARCHIVE_BODY)}</p><p class="small muted">${esc(TD_ARCHIVE_SIDE)}</p><p class="form-alert" id="archive-error" role="alert" hidden></p><div class="form-actions"><button class="btn" type="button" data-action="close">${esc(TD_ARCHIVE_CANCEL)}</button><button class="btn danger" type="button" data-action="archive-confirm" data-id="${esc(takeId)}">${esc(TD_ARCHIVE_CONFIRM)}</button></div>`;
}

export function ajustesPageHtml({t, esc, autoHtml}) {
  const back = `<a class="back" href="${takeHref(t.id)}">← ${esc(t.title)}</a>`;
  return `<div class="ajustes-page">
    ${back}
    <div class="page-heading"><div>
      <p class="eyebrow lab">${esc(TD_SET_EYEBROW)}</p>
      <h1 tabindex="-1">${esc(TD_SET_TITLE)}</h1>
      <p class="muted">${esc(TD_SET_LEAD)}</p>
    </div></div>
    ${followSectionHtml(t, esc)}
    ${rulesSectionHtml(t, esc)}
    ${t.phase === 'active' ? autoSectionHtml(autoHtml, esc) : ''}
    ${indexSectionHtml(t, esc)}
    ${manageSectionHtml(t, esc)}
  </div>`;
}

export {TD_ERR_CAP_RANGE, TD_ERR_DRIFT_RANGE, TD_ERR_CAP_BELOW_WEIGHT};
