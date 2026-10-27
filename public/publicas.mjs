/** Tesis públicas UI (LB3). Consumes GET /api/leaderboard* as-is. */

import {switchHtml} from './auto.mjs';
import {
  ALIAS_EDIT_NOTE, ALIAS_HELP, ALIAS_LABEL, ALIAS_PLACEHOLDER, ALIAS_SAVE,
  NAV_PUBLIC, PUB_ANON, PUB_BACK, PUB_BY, PUB_CAPTION, PUB_COL_30D, PUB_COL_ALIAS,
  PUB_COL_INDEX, PUB_COL_INDEX_SUB, PUB_COL_POS, PUB_COL_SINCE, PUB_COL_SINCE_SUB,
  PUB_COL_TAGS, PUB_COL_THESIS, PUB_DETAIL_BACK, PUB_DETAIL_COMPOSITION,
  PUB_DETAIL_GONE, PUB_DISCLAIMER, PUB_EMPTY_BODY, PUB_EMPTY_CTA, PUB_EMPTY_TITLE,
  PUB_ERROR, PUB_EYEBROW, PUB_HOW_BODY, PUB_HOW_ELIGIBILITY, PUB_HOW_SUMMARY,
  PUB_INDEX_VS, PUB_LEAD, PUB_LEGEND_AUTO, PUB_LEGEND_DASH, PUB_LEGEND_INDEX,
  PUB_LEGEND_SINCE, PUB_LOADING_LABEL, PUB_MINE_BEYOND, PUB_MINE_NEW, PUB_MINE_OUT,
  PUB_MINE_RANKED, PUB_MINE_TITLE, PUB_MORE, PUB_NEW_DAYS, PUB_NEW_LEAD,
  PUB_NEW_TITLE, PUB_NORANK_BODY, PUB_NORANK_TITLE, PUB_ONLY_MINE, PUB_OUT_REASON,
  PUB_OUT_TITLE, PUB_RANK_COUNT, PUB_RANK_TITLE, PUB_RETRY, PUB_STALE_BOARD,
  PUB_STALE_ROW, PUB_TAG_AUTO, PUB_TAG_CORRECTION, PUB_TAG_MINE, PUB_TAG_PRACTICE,
  PUB_TITLE, PUB_WINDOW, PUBLIC_CHIP, PUBLIC_CHIP_ARIA, PUBLIC_CONSENT_CANCEL,
  PUBLIC_CONSENT_CHECK, PUBLIC_CONSENT_CONFIRM, PUBLIC_CONSENT_INTRO,
  PUBLIC_CONSENT_ITEMS, PUBLIC_CONSENT_TITLE, PUBLIC_DISABLED_DRAFT,
  PUBLIC_DISABLED_SCENARIO, PUBLIC_PUBLISHED_AS, PUBLIC_SECTION_TITLE,
  PUBLIC_STATUS_NEW, PUBLIC_STATUS_OUT, PUBLIC_STATUS_PROGRESS, PUBLIC_STATUS_RANKED,
  PUBLIC_SWITCH_HINT, PUBLIC_SWITCH_HINT_ON, PUBLIC_SWITCH_LABEL, PUBLIC_SWITCH_OFF,
  PUBLIC_SWITCH_ON, USER_MENU_ALIAS,
} from './copy.mjs';
import {artShortDayMonth, pctInt, pctSigned1, ppSigned1, srSignedPct, srSignedPp} from './format.mjs';
import {clientValidateAlias} from './public-alias.mjs';

const TOP = 50;
const PAGE = 20;

export function publicasUiVisible(state) {
  return !!state?.available;
}

export function windowRange(windowEnd) {
  if (!windowEnd) return {from: '', to: ''};
  const to = artShortDayMonth(windowEnd);
  const [year, month, day] = String(windowEnd).split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return {from: to, to};
  const start = new Date(Date.UTC(year, month - 1, day - 29)).toISOString().slice(0, 10);
  return {from: artShortDayMonth(start), to};
}

export function sortHoldings(holdings) {
  return [...(holdings || [])]
    .filter(row => row && row.ticker)
    .sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0) || String(a.ticker).localeCompare(String(b.ticker)));
}

export function splitBoardItems(items) {
  const ranked = [];
  const nuevas = [];
  const fuera = [];
  const overflow = [];
  for (const item of items || []) {
    if (item?.note === 'correccion') fuera.push(item);
    else if (item?.ranked && Number.isFinite(item.position)) ranked.push(item);
    else if (!item?.ranked) nuevas.push(item);
    else overflow.push(item);
  }
  return {ranked, nuevas, fuera, overflow};
}

export function mineEntries({takes = [], items = [], mineSummary = null} = {}) {
  const map = new Map();
  for (const item of items) {
    if (item?.mine && item.publicId) map.set(item.publicId, item);
  }
  if (mineSummary?.publicId && !map.has(mineSummary.publicId)) {
    const take = takes.find(t => t.publicId === mineSummary.publicId);
    map.set(mineSummary.publicId, {
      publicId: mineSummary.publicId,
      title: take?.title || '',
      ranked: !!mineSummary.ranked,
      position: mineSummary.position,
      note: mineSummary.ranked ? null : 'nueva',
      mine: true,
    });
  }
  for (const take of takes) {
    if (!take?.isPublic || !take.publicId || take.phase !== 'active') continue;
    if (map.has(take.publicId)) continue;
    map.set(take.publicId, {
      publicId: take.publicId,
      title: take.title,
      ranked: false,
      position: null,
      mine: true,
      beyond: true,
    });
  }
  return [...map.values()];
}

export function moreCount(rankedLen, nextPage) {
  if (!nextPage || rankedLen >= TOP) return 0;
  return PAGE;
}

function signedHtml(n, kind, esc) {
  const vis = kind === 'pp' ? ppSigned1(n) : pctSigned1(n);
  const sr = kind === 'pp' ? srSignedPp(n) : srSignedPct(n);
  return `<span class="num lb-num" aria-hidden="true">${esc(vis)}</span><span class="sr-only">${esc(sr)}</span>`;
}

function vsIndex(item) {
  if (!Number.isFinite(item?.pct30d) || !Number.isFinite(item?.bench30d)) return null;
  return item.pct30d - item.bench30d;
}

function aliasOf(item) {
  return item?.alias || PUB_ANON;
}

function holdingsLine(item, esc) {
  const rows = sortHoldings(item?.holdings);
  if (!rows.length) return '';
  return `<p class="lb-tickers">${rows.map(h => `<span><b>${esc(h.ticker)}</b> ${esc(pctInt(h.weight))}</span>`).join(' ')}</p>`;
}

function tagsHtml(item, {mineChip = true} = {}, esc) {
  const bits = [`<span class="chip-s lb-tag">${esc(PUB_TAG_PRACTICE)}</span>`];
  if (item?.autoLabel) bits.push(`<span class="chip-s lb-tag">${esc(PUB_TAG_AUTO)}</span>`);
  if (item?.note === 'correccion') bits.push(`<span class="chip-s lb-tag">${esc(PUB_TAG_CORRECTION)}</span>`);
  if (mineChip && item?.mine) {
    bits.push(`<span class="chip-s lb-tag lb-mine-chip">${esc(PUB_TAG_MINE)}</span>`);
  }
  return `<div class="lb-tags">${bits.join('')}</div>`;
}

function staleNote(item, esc) {
  if (!item?.rowStale) return '';
  return `<p class="lb-stale small">${esc(PUB_STALE_ROW)}</p>`;
}

function titleLink(item, esc) {
  return `<a class="lb-title" href="#/publicas/${esc(item.publicId)}">${esc(item.title)}</a>`;
}

function rankTable(items, {caption, labelledBy}, esc) {
  const head = `<tr>
    <th scope="col">${esc(PUB_COL_POS)}</th>
    <th scope="col">${esc(PUB_COL_THESIS)}</th>
    <th scope="col">${esc(PUB_COL_ALIAS)}</th>
    <th scope="col" aria-sort="descending">${esc(PUB_COL_30D)} <span aria-hidden="true">↓</span></th>
    <th scope="col">${esc(PUB_COL_SINCE)}<span class="lb-sub">${esc(PUB_COL_SINCE_SUB)}</span></th>
    <th scope="col">${esc(PUB_COL_INDEX)}<span class="lb-sub">${esc(PUB_COL_INDEX_SUB)}</span></th>
    <th scope="col">${esc(PUB_COL_TAGS)}</th>
  </tr>`;
  const rows = items.map(item => {
    const pp = vsIndex(item);
    const bench = item.benchLabel ? `<span class="lb-sub">${esc(PUB_INDEX_VS(item.benchLabel))}</span>` : '';
    const mine = item.mine ? ' lb-mine' : '';
    return `<tr class="lb-row${mine}">
      <td class="num"><span class="sr-only">Puesto ${esc(item.position)}</span><span aria-hidden="true">${esc(item.position)}</span></td>
      <th scope="row">${titleLink(item, esc)}${item.mine ? `<span class="chip-s lb-tag lb-mine-chip">${esc(PUB_TAG_MINE)}</span>` : ''}${holdingsLine(item, esc)}${staleNote(item, esc)}</th>
      <td class="lb-alias">${esc(aliasOf(item))}</td>
      <td>${signedHtml(item.pct30d, 'pct', esc)}</td>
      <td>${signedHtml(item.pctSince, 'pct', esc)}</td>
      <td>${signedHtml(pp, 'pp', esc)}${bench}</td>
      <td>${tagsHtml(item, {mineChip: false}, esc)}</td>
    </tr>`;
  }).join('');
  return `<div class="lb-table-wrap"><table class="lb-table" aria-labelledby="${esc(labelledBy)}" aria-describedby="pub-legend">
    <caption class="sr-only">${esc(caption)}</caption>
    <thead>${head}</thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function rankCards(items, labelledBy, esc) {
  const lis = items.map(item => {
    const pp = vsIndex(item);
    const bench = item.benchLabel || 'índice';
    const secondary = `Desde el inicio ${pctSigned1(item.pctSince)} · ${PUB_INDEX_VS(bench)} ${ppSigned1(pp)}`;
    const mine = item.mine ? ' lb-mine' : '';
    return `<li class="lb-card${mine}">
      <div class="lb-card-top"><span class="lb-pos num" aria-hidden="true">${esc(item.position)}</span>${titleLink(item, esc)}</div>
      <p class="lb-by">${esc(PUB_BY(aliasOf(item)))}${item.mine ? ` <span class="chip-s lb-tag lb-mine-chip">${esc(PUB_TAG_MINE)}</span>` : ''}</p>
      <p class="lb-card-lab">${esc(PUB_COL_30D)}</p>
      <p class="lb-card-30">${signedHtml(item.pct30d, 'pct', esc)}</p>
      <p class="lb-card-sec" aria-hidden="true">${esc(secondary)}</p>
      <p class="sr-only">${esc(secondary)}</p>
      ${holdingsLine(item, esc)}${staleNote(item, esc)}${tagsHtml(item, {mineChip: false}, esc)}
    </li>`;
  }).join('');
  return `<ol class="lb-cards" aria-labelledby="${esc(labelledBy)}">${lis}</ol>`;
}

function sideTable(items, {kind, labelledBy}, esc) {
  const rows = items.map(item => {
    const extra = kind === 'fuera'
      ? esc(PUB_OUT_REASON)
      : esc(PUB_NEW_DAYS(item.daysActive || 0));
    return `<tr class="lb-row${item.mine ? ' lb-mine' : ''}">
      <th scope="row">${titleLink(item, esc)}${holdingsLine(item, esc)}</th>
      <td class="lb-alias">${esc(aliasOf(item))}</td>
      <td>${signedHtml(item.pctSince, 'pct', esc)}</td>
      <td>${extra}</td>
    </tr>`;
  }).join('');
  return `<div class="lb-table-wrap"><table class="lb-table lb-table-side" aria-labelledby="${esc(labelledBy)}">
    <thead><tr><th scope="col">${esc(PUB_COL_THESIS)}</th><th scope="col">${esc(PUB_COL_ALIAS)}</th><th scope="col">${esc(PUB_COL_SINCE)}</th><th scope="col">${kind === 'fuera' ? esc(PUB_OUT_REASON) : esc(PUB_NEW_DAYS(0).replace(/ .*/, ''))}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function sideCards(items, {kind, labelledBy}, esc) {
  const lis = items.map(item => {
    const extra = kind === 'fuera' ? PUB_OUT_REASON : PUB_NEW_DAYS(item.daysActive || 0);
    return `<li class="lb-card${item.mine ? ' lb-mine' : ''}">
      ${titleLink(item, esc)}
      <p class="lb-by">${esc(PUB_BY(aliasOf(item)))}${item.mine ? ` <span class="chip-s lb-tag lb-mine-chip">${esc(PUB_TAG_MINE)}</span>` : ''}</p>
      <p class="lb-card-sec">Desde el inicio ${signedHtml(item.pctSince, 'pct', esc)} · ${esc(extra)}</p>
      ${holdingsLine(item, esc)}${tagsHtml(item, {}, esc)}
    </li>`;
  }).join('');
  return `<ul class="lb-cards" aria-labelledby="${esc(labelledBy)}">${lis}</ul>`;
}

function disclaimerHtml(esc) {
  return `<p class="disclaimer pub-disclaimer"><strong>Práctica simulada.</strong> ${esc(PUB_DISCLAIMER.replace('Práctica simulada. ', ''))}</p>`;
}

function legendHtml(esc) {
  return `<div class="pub-legend" id="pub-legend">
    <p>${esc(PUB_LEGEND_SINCE)}</p>
    <p>${esc(PUB_LEGEND_INDEX)}</p>
    <p>${esc(PUB_LEGEND_DASH)}</p>
    <p>${esc(PUB_LEGEND_AUTO)}</p>
  </div>`;
}

function mineBlock(entries, totalRanked, esc) {
  if (!entries.length) return '';
  const lines = entries.map(item => {
    let status = PUB_MINE_NEW;
    if (item.beyond || (item.ranked && !item.position)) status = PUB_MINE_BEYOND;
    else if (item.note === 'correccion') status = PUB_MINE_OUT;
    else if (item.ranked && item.position) status = PUB_MINE_RANKED(item.position, totalRanked || item.position);
    const title = item.title
      ? `<a class="lnk" href="#/publicas/${esc(item.publicId)}">${esc(item.title)}</a>`
      : esc(item.publicId);
    return `<li>${title} · ${esc(status)}</li>`;
  }).join('');
  return `<section class="pub-mine" id="mias" tabindex="-1">
    <h2 class="pub-mine-title">${esc(PUB_MINE_TITLE)}</h2>
    <ul>${lines}</ul>
    <p><button type="button" class="lnk touch-44" data-action="alias-edit">${esc(USER_MENU_ALIAS)}</button></p>
  </section>`;
}

function skeletonHtml(esc) {
  const rows = Array.from({length: 8}, () => '<div class="sk lb-sk"></div>').join('');
  return `<div class="lb-skeleton" aria-busy="true" aria-label="${esc(PUB_LOADING_LABEL)}">${rows}</div>`;
}

export function publicListPageHtml({
  list, loading, error, takes = [], moreK = 0, onlyMine = false, esc,
} = {}) {
  const items = list?.items || [];
  const {ranked, nuevas, fuera} = splitBoardItems(items);
  const win = windowRange(list?.windowEnd);
  const totalRanked = ranked.length;
  const stale = (items.some(i => i.stale) || false) && list?.windowEnd;
  const header = `<div class="page-heading"><p class="eyebrow">${esc(PUB_EYEBROW)}</p>
    <h1 tabindex="-1">${esc(PUB_TITLE)}</h1>
    <p class="muted">${esc(PUB_LEAD)}</p>
    ${list?.windowEnd ? `<p class="small muted">${esc(PUB_WINDOW(win.from, win.to))}</p>` : ''}
  </div>${disclaimerHtml(esc)}`;
  if (error) {
    return `${header}<div class="callout error" role="alert">${esc(PUB_ERROR)}</div>
      <button type="button" class="btn" data-action="pub-retry">${esc(PUB_RETRY)}</button>`;
  }
  if (loading && !list) return `${header}<h2 id="pub-rank">${esc(PUB_RANK_TITLE)}</h2>${skeletonHtml(esc)}`;
  if (!items.length) {
    return `${header}<div class="pub-empty"><h2>${esc(PUB_EMPTY_TITLE)}</h2><p>${esc(PUB_EMPTY_BODY)}</p>
      <a class="btn" href="#/takes">${esc(PUB_EMPTY_CTA)}</a></div>`;
  }
  const mine = mineBlock(mineEntries({takes, items, mineSummary: list?.mineSummary}), list?.totalRanked || totalRanked, esc);
  const how = `<details class="how"><summary>${esc(PUB_HOW_SUMMARY)}</summary>
    <p>${esc(PUB_HOW_BODY(win.to || ''))}</p><p>${esc(PUB_HOW_ELIGIBILITY)}</p></details>`;
  const rankBody = ranked.length
    ? `${rankTable(ranked, {caption: PUB_CAPTION(win.from, win.to), labelledBy: 'pub-rank'}, esc)}
       ${rankCards(ranked, 'pub-rank', esc)}`
    : `<p><strong>${esc(PUB_NORANK_TITLE)}</strong></p><p>${esc(PUB_NORANK_BODY)}</p>`;
  const more = moreK
    ? `<button type="button" class="btn" data-action="pub-more">${esc(PUB_MORE(moreK))}</button>
       <p class="sr-only" aria-live="polite" id="pub-more-live"></p>`
    : '';
  const nuevasBlock = nuevas.length
    ? `<h2 id="pub-new">${esc(PUB_NEW_TITLE)}</h2><p class="muted">${esc(PUB_NEW_LEAD)}</p>
       ${sideTable(nuevas, {kind: 'nuevas', labelledBy: 'pub-new'}, esc)}
       ${sideCards(nuevas, {kind: 'nuevas', labelledBy: 'pub-new'}, esc)}`
    : '';
  const fueraBlock = fuera.length
    ? `<h2 id="pub-out">${esc(PUB_OUT_TITLE)}</h2>
       ${sideTable(fuera, {kind: 'fuera', labelledBy: 'pub-out'}, esc)}
       ${sideCards(fuera, {kind: 'fuera', labelledBy: 'pub-out'}, esc)}`
    : '';
  const only = onlyMine ? `<p class="muted">${esc(PUB_ONLY_MINE)}</p>` : '';
  const staleBanner = stale
    ? `<div class="callout amber" role="status">${esc(PUB_STALE_BOARD(win.to))}</div>`
    : '';
  return `${header}${mine}
    <div class="pub-rank-head"><h2 id="pub-rank">${esc(PUB_RANK_TITLE)}</h2>
      <p class="small muted">${esc(PUB_RANK_COUNT(totalRanked))}</p>${how}</div>
    ${staleBanner}${rankBody}${more}${only}${legendHtml(esc)}${nuevasBlock}${fueraBlock}`;
}

function compositionHtml(item, esc) {
  const rows = sortHoldings(item?.holdings);
  if (!rows.length) return '';
  const bar = rows.map(h => `<span class="pub-comp-seg" style="flex:${Math.max(Number(h.weight) || 0, 0)}" title="${esc(h.ticker)} ${esc(pctInt(h.weight))}"></span>`).join('');
  const table = rows.map(h => `<tr><th scope="row">${esc(h.ticker)}</th><td>${esc(pctInt(h.weight))}</td></tr>`).join('');
  return `<section><h2>${esc(PUB_DETAIL_COMPOSITION)}</h2>
    <div class="pub-comp-bar" role="img" aria-label="${esc(PUB_DETAIL_COMPOSITION)}">${bar}</div>
    <table class="pub-comp-table"><thead><tr><th scope="col">Ticker</th><th scope="col">Peso objetivo</th></tr></thead>
    <tbody>${table}</tbody></table></section>`;
}

export function publicDetailPageHtml({item, gone, error, loading, esc} = {}) {
  const back = `<a class="back touch-44" href="#/publicas">${esc(PUB_DETAIL_BACK)}</a>`;
  if (loading) {
    return `${back}<div class="page-heading"><h1 tabindex="-1">${esc(NAV_PUBLIC)}</h1></div>${disclaimerHtml(esc)}${skeletonHtml(esc)}`;
  }
  if (gone || (!item && !error)) {
    return `${back}<div class="page-heading"><h1 tabindex="-1">${esc(PUB_DETAIL_GONE)}</h1></div>
      ${disclaimerHtml(esc)}<p><a class="lnk touch-44" href="#/publicas">${esc(PUB_BACK)}</a></p>`;
  }
  if (error) {
    return `${back}${disclaimerHtml(esc)}<div class="callout error" role="alert">${esc(PUB_ERROR)}</div>
      <button type="button" class="btn" data-action="pub-retry">${esc(PUB_RETRY)}</button>`;
  }
  const win = windowRange(item.windowEnd);
  const pp = vsIndex(item);
  const bench = item.benchLabel ? PUB_INDEX_VS(item.benchLabel) : PUB_COL_INDEX;
  return `${back}<div class="page-heading">
      <h1 tabindex="-1">${esc(item.title)}</h1>
      <p class="muted">${esc(PUB_BY(aliasOf(item)))}</p>
      ${tagsHtml(item, {}, esc)}
    </div>${disclaimerHtml(esc)}
    ${item.windowEnd ? `<p class="small muted">${esc(PUB_WINDOW(win.from, win.to))}</p>` : ''}
    <dl class="pub-metrics">
      <div><dt>${esc(PUB_COL_30D)}</dt><dd>${signedHtml(item.pct30d, 'pct', esc)}</dd></div>
      <div><dt>${esc(PUB_COL_SINCE)}</dt><dd>${signedHtml(item.pctSince, 'pct', esc)}</dd></div>
      <div><dt>${esc(bench)}</dt><dd>${signedHtml(pp, 'pp', esc)}</dd></div>
    </dl>
    ${compositionHtml(item, esc)}`;
}

export function publicChipHtml({esc}) {
  return `<span class="chip-s auto-chip public-chip" aria-label="${esc(PUBLIC_CHIP_ARIA)}">${esc(PUBLIC_CHIP)}</span>`;
}

export function publicSwitchSectionHtml({
  take, progress, alias, busy, available, esc,
} = {}) {
  if (!available || take?.phase === 'archived') return '';
  const draft = take?.phase === 'draft';
  const scenario = take?.scenario && take.scenario !== 'normal';
  const locked = draft || scenario;
  const on = !!take?.isPublic && !locked;
  const hint = on ? PUBLIC_SWITCH_HINT_ON : PUBLIC_SWITCH_HINT;
  let status = '';
  if (locked) status = draft ? PUBLIC_DISABLED_DRAFT : PUBLIC_DISABLED_SCENARIO;
  else if (on && progress?.note === 'correccion') status = PUBLIC_STATUS_OUT;
  else if (on && progress?.ranked) status = PUBLIC_STATUS_RANKED(progress.position, progress.total);
  else if (on) {
    status = PUBLIC_STATUS_NEW;
    if (Number.isFinite(progress?.daysActive) && Number.isFinite(progress?.marksInWindow)) {
      status += ' ' + PUBLIC_STATUS_PROGRESS(progress.daysActive, progress.marksInWindow);
    }
    if (alias) status += ` ${PUBLIC_PUBLISHED_AS(alias)}`;
  }
  const link = on && progress?.ranked
    ? ` <a class="lnk" href="#/publicas">${esc(PUB_BACK)}</a>`
    : (on ? ` <button type="button" class="lnk" data-action="alias-edit">${esc(USER_MENU_ALIAS)}</button>` : '');
  return `<section class="settings-section sec" id="visibilidad" aria-labelledby="td-public">
    <h2 id="td-public">${esc(PUBLIC_SECTION_TITLE)}</h2>
    ${switchHtml({
      checked: on, disabled: busy || locked, focusableDisabled: locked && !busy,
      busy, action: 'public-toggle', takeId: take.id, label: PUBLIC_SWITCH_LABEL,
      hint, esc, onLabel: PUBLIC_SWITCH_ON, offLabel: PUBLIC_SWITCH_OFF,
    })}
    ${status ? `<p class="small muted public-status">${esc(status)}${link}</p>` : ''}
  </section>`;
}

export function publicConsentHtml({needAlias, aliasValue = '', esc}) {
  const alias = needAlias
    ? `<label class="field" for="public-alias">${esc(ALIAS_LABEL)}
        <input class="input" id="public-alias" name="alias" type="text" maxlength="24" autocomplete="nickname" placeholder="${esc(ALIAS_PLACEHOLDER)}" value="${esc(aliasValue)}" aria-describedby="alias-help">
        <p class="small muted" id="alias-help">${esc(ALIAS_HELP)}</p>
        <p class="f-err" id="alias-err" hidden></p>
      </label>`
    : '';
  const items = PUBLIC_CONSENT_ITEMS.map(t => `<li>${esc(t)}</li>`).join('');
  return `<p class="modal-copy">${esc(PUBLIC_CONSENT_INTRO)}</p>${alias}
    <ul id="public-consent-list">${items}</ul>
    <form id="public-consent-form" novalidate>
      <label class="check-label"><input type="checkbox" name="consent" value="1" aria-describedby="public-consent-list"> ${esc(PUBLIC_CONSENT_CHECK)}</label>
      <div class="form-actions">
        <button class="btn" type="button" data-action="close">${esc(PUBLIC_CONSENT_CANCEL)}</button>
        <button class="btn primary" type="submit" disabled>${esc(PUBLIC_CONSENT_CONFIRM)}</button>
      </div>
    </form>`;
}

export function publicAliasModalHtml({value = '', esc}) {
  return `<form id="public-alias-form" novalidate>
    <label class="field" for="alias-input">${esc(ALIAS_LABEL)}
      <input class="input" id="alias-input" name="alias" type="text" maxlength="24" autocomplete="nickname" placeholder="${esc(ALIAS_PLACEHOLDER)}" value="${esc(value)}" aria-describedby="alias-help">
    </label>
    <p class="small muted" id="alias-help">${esc(ALIAS_HELP)}</p>
    <p class="small muted">${esc(ALIAS_EDIT_NOTE)}</p>
    <p class="f-err" id="alias-err" hidden></p>
    <div class="form-actions">
      <button class="btn" type="button" data-action="close">${esc(PUBLIC_CONSENT_CANCEL)}</button>
      <button class="btn primary" type="submit">${esc(ALIAS_SAVE)}</button>
    </div>
  </form>`;
}

export function setAliasFieldError(input, message, {fromServer = false} = {}) {
  if (!input) return;
  const err = document.getElementById('alias-err');
  const help = document.getElementById('alias-help');
  if (!err) return;
  if (message) {
    err.hidden = false;
    err.textContent = message;
    if (fromServer) err.setAttribute('role', 'alert');
    else err.removeAttribute('role');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', [help?.id, err.id].filter(Boolean).join(' '));
  } else {
    err.hidden = true;
    err.textContent = '';
    err.removeAttribute('role');
    input.removeAttribute('aria-invalid');
    if (help) input.setAttribute('aria-describedby', help.id);
  }
}

export function syncConsentSubmit(form, {email} = {}) {
  if (!form) return false;
  const box = form.querySelector('input[name="consent"]');
  const submit = form.querySelector('button[type="submit"]');
  const aliasInput = form.querySelector('#public-alias');
  const aliasOk = !aliasInput || clientValidateAlias(aliasInput.value, {email}).ok;
  const ok = !!box?.checked && aliasOk;
  if (submit) submit.disabled = !ok;
  return ok;
}

export {PUBLIC_CONSENT_TITLE, clientValidateAlias};
