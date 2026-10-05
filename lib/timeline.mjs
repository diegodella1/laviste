/** Unified thesis timeline from take events, reviews, and jobs (server + tests). */

const attentionLabel = {track: 'En camino', watch: 'Vigilando', review: 'Revisar'};

export function artDayKey(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(d);
  const get = t => parts.find(p => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function artTime(iso) {
  return new Date(iso).toLocaleString('es-AR', {timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
}

function inferType(event) {
  if (event.type) return event.type;
  if (event.title?.toLowerCase().includes('activ')) return 'activation';
  if (event.title?.toLowerCase().includes('rebalance')) return 'rebalance_applied';
  return 'chequeo';
}

function reviewToTimeline(review) {
  const items = [];
  if (review.applied && review.previousAttention && review.newAttention && review.previousAttention !== review.newAttention) {
    items.push({
      at: review.at,
      type: 'attention',
      title: `Pasó a ${attentionLabel[review.newAttention] || review.newAttention}`,
      body: review.reason || '',
      verdict: review.newAttention === 'track' ? 'none' : 'action',
      verdictText: review.newAttention === 'track' ? 'No necesitás hacer nada' : `Acción sugerida: ${review.reason || 'revisar la tesis'}`,
      reviewId: review.id,
    });
  }
  items.push({
    at: review.at,
    type: 'news',
    title: 'Revisión de noticias',
    body: review.summary,
    ruleCite: review.reason,
    verdict: review.attention === 'track' && !review.resolved ? 'none' : 'action',
    verdictText: review.attention === 'track' && !review.resolved ? 'No necesitás hacer nada' : `Acción sugerida: ${review.reason}`,
    reviewId: review.id,
    evidence: review.events,
    sources: review.sources,
    applied: review.applied,
  });
  return items;
}

export function buildTimeline(take, reviews = [], jobs = []) {
  if (!take) return {items: [], verdict: null};
  const items = [];
  for (const e of take.events || []) {
    items.push({
      at: e.at,
      type: inferType(e),
      title: e.title,
      body: e.body,
      ruleCite: e.ruleCite,
      verdict: e.verdict,
      verdictText: e.verdictText,
      source: e.source,
      status: e.status,
    });
  }
  const reviewIds = new Set();
  for (const r of reviews.filter(rv => rv.takeId === take.id)) {
    for (const item of reviewToTimeline(r)) {
      if (item.type === 'news' && reviewIds.has(r.id)) continue;
      if (item.type === 'news') reviewIds.add(r.id);
      items.push(item);
    }
  }
  for (const j of jobs.filter(j => j.takeId === take.id && j.status === 'failed' && j.finishedAt)) {
    items.push({at: j.finishedAt, type: 'news', title: 'Seguimiento interrumpido', body: j.error || 'No se pudo completar la revisión.', verdict: 'action', verdictText: 'Acción sugerida: reintentar la revisión'});
  }
  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.type}:${item.at}:${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  const latestChequeo = deduped.find(i => i.type === 'chequeo' || (i.type === 'scenario' && i.verdict));
  return {items: deduped, verdict: latestChequeo?.verdictText ? {text: latestChequeo.verdictText, kind: latestChequeo.verdict} : null};
}

export function movementsToday(allTakes, allReviews, jobs = []) {
  const today = artDayKey(new Date().toISOString());
  const rows = [];
  for (const t of allTakes) {
    const {items} = buildTimeline(t, allReviews.filter(r => r.takeId === t.id), jobs);
    for (const item of items) {
      if (artDayKey(item.at) !== today) continue;
      rows.push({at: item.at, takeId: t.id, takeTitle: t.title, item});
    }
  }
  rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return rows.slice(0, 12);
}
