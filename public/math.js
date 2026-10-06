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

function atMs(at) {
  const ms = typeof at === 'number' ? at : Date.parse(at);
  return Number.isFinite(ms) ? ms : NaN;
}

function compareAt(a, b) {
  return atMs(a) - atMs(b);
}

/** Sum of invested capital for active takes (matches home stat + aggregate chart). */
export function aggregateInvestedCapital(takes) {
  return takes
    .filter(t => t.phase === 'active')
    .reduce((s, t) => s + (t.invested || 0), 0);
}

function trimLeadingEmptyAggregatePoints(points) {
  let i = 0;
  while (i < points.length - 1 && points[i].benchmark === 0 && points[i].value === 0) i++;
  return i ? points.slice(i) : points;
}

/** Drop pre-activation days that still plot at $0 while capital is already on the chart. */
function trimLeadingZeroValueDays(points) {
  let i = 0;
  while (i < points.length - 1 && points[i].value === 0) i++;
  return i ? points.slice(i) : points;
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

  const sinceFor = t => t.activatedAt || t.history?.[0]?.at || null;

  const times = [...new Set([
    ...active.flatMap(t => {
      const since = sinceFor(t);
      if (!since) return t.history.map(h => h.at);
      return t.history.filter(h => compareAt(h.at, since) >= 0).map(h => h.at);
    }),
    ...active.map(sinceFor).filter(Boolean),
  ])].sort((a, b) => compareAt(a, b));

  const points = times.map(at => {
    let amount = 0;
    let contributed = 0;
    let indexRef = 0;
    let indexBase = 0;
    for (const t of active) {
      const since = sinceFor(t);
      if (!since || compareAt(at, since) < 0) continue;
      const p = t.history.filter(h => compareAt(h.at, at) <= 0).at(-1);
      if (!p) {
        if ((t.invested || 0) > 0 && compareAt(at, since) >= 0) contributed += t.invested;
        continue;
      }
      contributed += t.invested || 0;
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
  let out = collapsePointsByArtDay(points);
  out = trimLeadingZeroValueDays(trimLeadingEmptyAggregatePoints(out));
  const capital = aggregateInvestedCapital(takes);
  if (out.length && capital > 0 && out[out.length - 1].benchmark < capital) {
    out[out.length - 1] = {...out[out.length - 1], benchmark: capital};
  }
  return out;
}
