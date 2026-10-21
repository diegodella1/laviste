import {DEF_SHORT} from './def-short.mjs';
import {importOrReload, syncRevisionFromHealth} from './rev.mjs';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

function effectiveAttention(t, items) {
  const severity = {track: 0, watch: 1, review: 2};
  let att = t.attention || 'track';
  const chequeo = items.find(i => i.type === 'chequeo' && i.verdict === 'action');
  if (chequeo?.ruleCite && /(> tope|Desvío)/.test(chequeo.ruleCite) && severity.watch > severity[att]) att = 'watch';
  return att;
}

async function boot() {
  document.querySelectorAll('.definition-block').forEach(el => {
    if (!el.textContent.trim()) el.textContent = DEF_SHORT;
  });

  const versionEl = document.querySelector('[data-version]');
  const pulse = document.querySelector('[data-pulse]');
  const healthP = fetch('/api/health').then(r => r.json()).catch(() => null);
  const sessionP = pulse
    ? fetch('/api/session', {credentials: 'same-origin'}).then(r => r.json()).catch(() => null)
    : Promise.resolve(null);

  if (pulse) pulse.innerHTML = `<p class="pulse-loading">Consultando tu espacio…</p>`;

  const [h, s] = await Promise.all([healthP, sessionP]);
  if (versionEl && h?.revision && h.revision !== 'development') {
    versionEl.textContent = `Versión publicada · ${h.revision.slice(0, 7)}`;
  }
  syncRevisionFromHealth(h);

  const anon = `<h3>Tu espacio en vivo</h3><p class="pulse-anon">Acá ves tus tesis, los movimientos de hoy y el último chequeo. Es privado: entrá para verlo.</p><a class="button" href="/app">Entrar a mi espacio →</a>`;
  if (!pulse) return;

  try {
    if (!s?.authenticated) {
      pulse.innerHTML = anon;
      return;
    }
    const [{movementsToday, artTime, artClock}, {money}] = await Promise.all([
      importOrReload('./timeline.mjs'),
      importOrReload('./format.mjs'),
    ]);
    const state = await (await fetch('/api/state', {credentials: 'same-origin'})).json();
    const active = state.takes.filter(t => t.phase === 'active');
    if (!active.length) {
      pulse.innerHTML = '<h3>Tu espacio ahora</h3><p class="pulse-anon">Tu espacio está listo. Todavía no hay tesis.</p><a class="button" href="/app#/new">Nueva tesis →</a>';
      return;
    }
    const moves = movementsToday(state.takes, state.reviews || [], state.jobs || []);
    const amount = active.reduce((sum, t) => sum + t.cash + t.holdings.reduce((s, h) => s + h.units * h.price, 0), 0);
    const counts = {track: 0, watch: 0, review: 0};
    for (const t of active) {
      const att = effectiveAttention(t, []);
      counts[att] = (counts[att] || 0) + 1;
    }
    const pills = [['track', 'En camino'], ['watch', 'Vigilando'], ['review', 'Revisar']]
      .map(([k, l]) => `<span class="status-mark ${k}">● ${l} · ${counts[k] || 0}</span>`).join(' ');
    const moveLabel = m => esc(m.item?.title || m.takeTitle || 'Movimiento');
    const moveList = moves.slice(0, 3).map(m => `<li><span class="pulse-move-desc">${moveLabel(m)}</span><span class="pulse-move-time">${artClock(m.at)}</span></li>`).join('') || '<li><span class="pulse-move-desc">Sin movimientos hoy</span><span class="pulse-move-time">—</span></li>';
    const last = moves[0];
    pulse.innerHTML = `<div class="pulse-live"><span class="eyebrow">En vivo en tu espacio · con sesión</span><h3>Tu espacio ahora</h3><p class="pulse-meta">Dinero de práctica · ARS ${money(amount).replace(/\s/g, ' ')}</p><div class="pulse-pills">${pills}</div><p class="pulse-meta">Tesis activas · ${active.length}</p><p class="pulse-moves-label">Movimientos de hoy</p><ul class="pulse-moves">${moveList}</ul><p class="pulse-meta">${last ? `Último chequeo ${artTime(last.at)}` : 'Sin chequeos hoy'}</p><a class="button" href="/app#/">Abrir mi espacio →</a></div>`;
  } catch {
    pulse.innerHTML = '<p>No pudimos consultar tu espacio ahora.</p>';
  }
}

boot();
