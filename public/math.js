// Variation on contributed capital: a new deposit is never counted as investment gain.
export function portfolioSeries(takes){
  const active=takes.filter(t=>t.phase==='active'||t.phase==='archived');
  const times=[...new Set(active.flatMap(t=>t.history.map(h=>h.at)))].sort();
  const points=times.map(at=>{
    let amount=0,reference=0,indexRef=0,contributed=0;
    for(const t of active){const p=t.history.filter(h=>h.at<=at).at(-1);if(p){amount+=p.value;reference+=p.benchmark;indexRef+=p.index??p.benchmark;contributed+=t.invested;}}
    return {at,value:contributed?amount/contributed*100:100,benchmark:contributed?reference/contributed*100:100,index:contributed?indexRef/contributed*100:100};
  });
  return points.filter((p,i)=>i===0||i===points.length-1||p.at.slice(0,10)!==points[i+1].at.slice(0,10));
}
