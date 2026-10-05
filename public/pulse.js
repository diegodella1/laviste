import {movementsToday, artTime, artClock} from '/timeline.mjs';
import {money} from '/format.mjs';

const DEF = 'La Viste convierte tus ideas en carteras con dinero de práctica (ARS) y las sigue con chequeos de reglas y noticias con fuentes. No envía órdenes.';

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
  const versionEl = document.querySelector('[data-version]');
  try {
    const health = await fetch('/api/health');
    const h = await health.json();
    if (versionEl && h.revision && h.revision !== 'development') versionEl.textContent = `Versión publicada · ${h.revision.slice(0, 7)}`;
  } catch {}

  document.querySelectorAll('.definition-block').forEach(el => {
    if (!el.textContent.trim()) el.textContent = DEF;
  });

  const pulse = document.querySelector('[data-pulse]');
  if (!pulse) return;

  const anon = `<h3>Tu espacio en vivo</h3><p class="pulse-anon">Acá ves tus tesis activas, los movimientos de hoy y el último chequeo. Es privado: entrá para verlo.</p><a class="button" href="/app">Entrar a mi espacio →</a>`;
  pulse.innerHTML = `<p class="pulse-loading">Consultando tu espacio…</p>`;

  try {
    const session = await fetch('/api/session', {credentials: 'same-origin'});
    const s = await session.json();
    if (!s.authenticated) {
      pulse.innerHTML = anon;
      return;
    }
    const state = await (await fetch('/api/state', {credentials: 'same-origin'})).json();
    const active = state.takes.filter(t => t.phase === 'active');
    if (!active.length) {
      pulse.innerHTML = '<h3>Tu espacio ahora</h3><p class="pulse-anon">Tu espacio está listo. Todavía no hay tesis activas.</p><a class="button" href="/app#/new">Explorar mi idea →</a>';
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
      .map(([k, l]) => `<span class="pulse-pill ${k}">${l} · ${counts[k] || 0}</span>`).join('');
    const moveList = moves.slice(0, 3).map(m => `<li><span class="pulse-move-time">${artClock(m.at)}</span><span>${esc(m.title)}</span></li>`).join('') || '<li><span>—</span><span>Sin movimientos hoy</span></li>';
    const last = moves[0];
    pulse.innerHTML = `<div class="pulse-live"><span class="eyebrow">En vivo en tu espacio · con sesión</span><h3>Tu espacio ahora</h3><p class="pulse-meta">Dinero de práctica · ARS ${money(amount).replace(/\s/g, ' ')}</p><div class="pulse-pills">${pills}</div><p class="pulse-meta">Tesis activas · ${active.length}</p><ul class="pulse-moves">${moveList}</ul><p class="pulse-meta">${last ? `Último chequeo ${artTime(last.at)}` : 'Sin chequeos hoy'}</p><a class="button" href="/app#/">Abrir mi espacio →</a></div>`;
  } catch {
    pulse.innerHTML = '<p>No pudimos consultar tu espacio ahora.</p>';
  }
}

boot();
