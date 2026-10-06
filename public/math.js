// Variation on contributed capital: a new deposit is never counted as investment gain.
const ART_TZ = 'America/Argentina/Buenos_Aires';

/** Calendar day in Argentina (for chart buckets aligned with x-axis labels). */
export function artDayKey(at) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ART_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at));
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

function collapsePointsByArtDay(points) {
  const out = [];
  for (const p of points) {
    const key = artDayKey(p.at);
    if (out.length && artDayKey(out[out.length - 1].at) === key) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}
export function portfolioSeries(takes){
  const active=takes.filter(t=>t.phase==='active'||t.phase==='archived');
  const times=[...new Set(active.flatMap(t=>t.history.map(h=>h.at)))].sort();
  const points=times.map(at=>{
    let amount=0,reference=0,indexRef=0,indexBase=0,contributed=0;
    for(const t of active){const p=t.history.filter(h=>h.at<=at).at(-1);if(p){amount+=p.value;reference+=p.benchmark;if(p.indexRecorded){indexRef+=p.index??0;indexBase+=t.invested;}contributed+=t.invested;}}
    return {at,value:contributed?amount/contributed*100:100,benchmark:contributed?reference/contributed*100:100,index:indexBase?indexRef/indexBase*100:null};
  });
  return points.filter((p,i)=>i===0||i===points.length-1||artDayKey(p.at)!==artDayKey(points[i+1].at));
}

/** Aggregate practice series in ARS (valor + capital aportado) for home chart. */
export function portfolioSeriesARS(takes) {
  const active = takes.filter(t => t.phase === 'active');
  if (!active.length) return [];

  const times = [...new Set([
    ...active.flatMap(t => t.history.map(h => h.at)),
    ...active.map(t => t.activatedAt || t.history?.[0]?.at).filter(Boolean),
  ])].sort();

  const points = times.map(at => {
    let amount = 0;
    let contributed = 0;
    let indexRef = 0;
    let indexBase = 0;
    for (const t of active) {
      const since = t.activatedAt || t.history?.[0]?.at;
      if (!since || at < since) continue;
      const p = t.history.filter(h => h.at <= at).at(-1);
      if (!p) continue;
      contributed += t.invested;
      amount += p.value;
      if (p.indexRecorded) {
        indexRef += p.index ?? 0;
        indexBase += t.invested;
      }
    }
    return {
      at,
      value: amount,
      benchmark: contributed,
      index: indexBase ? indexRef / indexBase * 100 : null,
      indexRecorded: indexBase > 0,
    };
  });
  return collapsePointsByArtDay(points);
}
