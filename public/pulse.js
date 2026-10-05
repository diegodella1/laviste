import {movementsToday, artTime} from '/timeline.mjs';
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

  const anon = `<p class="pulse-anon">Acá ves tus tesis activas, los movimientos de hoy y el último chequeo. Es privado: entrá para verlo.</p><a class="button" href="/app">Entrar a mi espacio →</a>`;
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
      pulse.innerHTML = '<p>Tu espacio está listo. Todavía no hay tesis.</p><a class="button" href="/app#/new">Explorar mi idea →</a>';
      return;
    }
    const moves = movementsToday(state.takes, state.reviews || [], state.jobs || []);
    const amount = active.reduce((sum, t) => sum + t.cash + t.holdings.reduce((s, h) => s + h.units * h.price, 0), 0);
    pulse.innerHTML = `<h3>Tu espacio ahora</h3><p class="pulse-meta">Tesis activas · ${active.length} · ${money(amount)}</p><p class="pulse-meta">Hoy · ${moves.length} movimientos</p><a class="button" href="/app#/">Abrir mi espacio →</a>`;
  } catch {
    pulse.innerHTML = '<p>No pudimos consultar tu espacio ahora.</p>';
  }
}

boot();
