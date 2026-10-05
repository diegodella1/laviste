import { randomUUID } from 'node:crypto';

export const catalog = [
  ['NVDA','NVIDIA','Semiconductores',18000],['AMD','AMD','Semiconductores',12000],
  ['MSFT','Microsoft','Plataformas',22000],['GOOGL','Alphabet','Plataformas',9000],
  ['AMZN','Amazon','Infraestructura',11000],['TSM','TSMC','Semiconductores',14000],
  ['MELI','Mercado Libre','Comercio',26000],['BABA','Alibaba','Comercio',7000],
  ['VALE','Vale','Materiales',6000],['FCX','Freeport-McMoRan','Materiales',8000],
  ['YPF','YPF','Energía',16000],['PAM','Pampa Energía','Energía',10000],
  ['VIST','Vista Energy','Energía',13000],['GGAL','Grupo Galicia','Finanzas',6500],
  ['KO','Coca-Cola','Consumo',5000],['GLD','SPDR Gold Trust','Oro',15000],
].map(([ticker,name,bucket,price])=>({ticker,name,bucket,price}));
export const money = n => Math.round(n*100)/100;
export function assert(condition,message,status=400) { if(!condition) throw Object.assign(new Error(message),{status}); }
export function validateProposal(p) {
  assert(p && typeof p.title==='string' && p.title.trim().length>=3 && p.title.length<=100,'El título debe tener entre 3 y 100 caracteres.');
  for(const key of ['thesis','invalidation','horizon']) assert(typeof p[key]==='string' && p[key].length>0 && p[key].length<=5000,`Falta ${key} o es demasiado largo.`);
  assert(Array.isArray(p.holdings) && p.holdings.length>=2 && p.holdings.length<=10,'La cartera necesita entre 2 y 10 posiciones.');
  const seen=new Set(); let total=0;
  for(const h of p.holdings) {
    assert(catalog.some(c=>c.ticker===h.ticker),'Instrumento fuera del catálogo de demostración.');
    assert(!seen.has(h.ticker),'Hay instrumentos repetidos.'); seen.add(h.ticker);
    assert(Number.isFinite(h.weight) && h.weight>0 && h.weight<=25,'Cada posición debe tener un peso mayor que 0 y de hasta 25%.');
    assert(typeof h.reason==='string' && h.reason.length>0 && h.reason.length<=2000,'Cada posición necesita una explicación.');
    total+=h.weight;
  }
  assert(total>=30 && total<=95.00001,'Las posiciones deben sumar entre 30% y 95%; el resto queda en efectivo.');
  return {title:p.title.trim(),thesis:p.thesis,horizon:p.horizon,invalidation:p.invalidation,holdings:p.holdings.map(h=>({...catalog.find(c=>c.ticker===h.ticker),weight:h.weight,reason:h.reason,units:0}))};
}
export function createTake(proposal) {
  const p=validateProposal(proposal);
  return {id:randomUUID(),...p,phase:'draft',status:'pending',invested:0,cash:0,createdAt:new Date().toISOString(),activatedAt:null,checkedAt:null,nextCheckAt:null,
    version:1,attention:'track',coverage:'pending',monitoringPaused:false,settings:{cadence:'standard',mode:'ask',cap:25,drift:5,paused:false},history:[],events:[],scenario:'normal'};
}
export function value(t) { return money(t.cash+t.holdings.reduce((s,h)=>s+h.units*h.price,0)); }
export function activate(t,amount,now=new Date().toISOString()) {
  assert(t.phase==='draft','Esta tesis ya está activa.',409);
  assert(t.holdings.every(h=>h.weight<=t.settings.cap),'Los pesos objetivo superan el límite por posición.');
  assert(Number.isFinite(amount) && amount>=100000 && amount<=100000000,'Ingresá entre $100.000 y $100.000.000 de práctica.');
  const holdings=t.holdings.map(h=>({...h,units:Math.floor(amount*h.weight/100/h.price),entryPrice:h.price,referencePrice:h.price}));
  assert(holdings.every(h=>h.units>0),'El monto no alcanza para todas las posiciones. Aumentalo o reducí la cantidad de instrumentos.');
  t.holdings=holdings; t.cash=money(amount-holdings.reduce((s,h)=>s+h.units*h.price,0));
  t.invested=amount;t.activatedAt=now;t.phase='active';t.status='track';
  t.history=[{at:now,value:amount,benchmark:amount}];
  t.events.unshift({id:randomUUID(),at:now,type:'activation',title:'Tu idea ya tiene una cartera',body:'Activación simulada con cantidades enteras y precios ficticios. El efectivo incluye el remanente de redondeo. No se enviaron órdenes a un broker.',source:'Libro de práctica',status:'track'});
  t.nextCheckAt=nextCheck(t,now); return t;
}
export function nextCheck(t,now) { if(t.settings.cadence==='manual'||t.monitoringPaused||t.phase==='archived')return null; return new Date(new Date(now).getTime()+(t.settings.cadence==='patient'?7*86400000:t.settings.cadence==='vigilant'?3600000:86400000)).toISOString(); }
export function review(t,scenario='check',now=new Date().toISOString()) {
  assert(t.phase==='active','Activá la cartera para revisarla.');
  assert(['check','normal','drop','broken','recovery'].includes(scenario),'Escenario desconocido.');
  if(scenario!=='check') {
    t.scenario=scenario;
    t.holdings=t.holdings.map((h,i)=>({...h,price:money(h.referencePrice*(scenario==='drop' && i===0?0.92:scenario==='broken'?0.88:scenario==='recovery'?1.015:1))}));
    t.status=scenario==='drop'?'watch':scenario==='broken'?'review':'track';
    t.history.push({at:now,value:value(t),benchmark:t.invested});
  }
  const total=value(t);
  const drift=t.holdings.some(h=>Math.abs(h.units*h.price/total*100-h.weight)>t.settings.drift);
  const over=t.holdings.some(h=>h.units*h.price/total*100>t.settings.cap);
  if((drift||over)&&t.status==='track') t.status='watch';
  const copy={
    drop:['Una caída merece una segunda mirada',`Escenario ficticio: ${t.holdings[0].name} cae 8% frente al precio base de la demo. La caída activa observación, pero por sí sola no invalida la tesis. Antes de cambiar la cartera, hace falta comprobar la causa y su impacto sobre el negocio.`],
    broken:['La tesis necesita una revisión',`Escenario ficticio: aparece evidencia que contradice esta condición: “${t.invalidation}”. Se solicita una revisión de la idea. No se ejecutó ninguna venta.`],
    recovery:['Volvemos a seguir el plan','Escenario ficticio: se resuelve la incertidumbre anterior y las cotizaciones de práctica se sitúan 1,5% sobre la base. La take sale de observación.'],
    normal:['El escenario vuelve al punto de partida','Los precios ficticios vuelven a su base. Este reinicio de escenario no es una operación ni una noticia de mercado.'],
    check:['Revisión del último escenario','Se comprobaron cantidades, concentración y desvíos con los últimos precios de práctica. No hay un proveedor de mercado o noticias conectado: esta revisión no incorpora novedades reales.']
  };
  t.checkedAt=now;t.nextCheckAt=nextCheck(t,now);
  t.events.unshift({id:randomUUID(),at:now,type:scenario==='check'?'check':'scenario',title:copy[scenario][0],body:copy[scenario][1]+` ${over?'Hay una posición por encima del límite de concentración.':''} ${drift?'Hay desvíos mayores al umbral configurado.':'No hay desvíos mayores al umbral configurado.'} ${t.settings.paused?'Las propuestas están pausadas.':'No se movió dinero.'}`,source:'Motor de escenarios · datos ficticios',status:t.status});
  t.events=t.events.slice(0,150); t.history=t.history.slice(-365);return t;
}
export function updateSettings(t,s) {
  assert(['patient','standard','manual'].includes(s.cadence),'Frecuencia inválida.');
  assert(s.mode==='ask','La ejecución autónoma no está disponible en esta versión.');
  assert(Number.isFinite(s.cap)&&s.cap>=10&&s.cap<=25,'El límite debe estar entre 10% y 25%.');
  assert(Number.isFinite(s.drift)&&s.drift>=1&&s.drift<=20,'El desvío debe estar entre 1 y 20 puntos porcentuales.');
  assert(typeof s.paused==='boolean','Pausa inválida.');
  assert(t.holdings.every(h=>h.weight<=s.cap),'El límite no puede ser menor que los pesos objetivo.');
  t.settings={cadence:s.cadence,mode:s.mode,cap:s.cap,drift:s.drift,paused:s.paused};
  if(t.phase==='active')t.nextCheckAt=nextCheck(t,new Date().toISOString());return t;
}
export const templates=[
  {title:'La IA sale de la nube',thesis:'La inteligencia artificial empieza a correr en equipos propios. La demanda se reparte entre chips, fabricación y plataformas que acercan estas herramientas a personas y empresas.',horizon:'3 a 5 años',invalidation:'La demanda de inferencia local no se materializa y la adopción sigue concentrada exclusivamente en servicios remotos.',holdings:[['NVDA',22,'Hardware para ejecutar modelos y desarrollar aplicaciones.'],['AMD',18,'Una alternativa de cómputo para equipos y servidores propios.'],['TSM',20,'Capacidad de fabricación que hace posible esa infraestructura.'],['MSFT',15,'Distribución de herramientas de IA a empresas y usuarios.'],['GOOGL',15,'Modelos y plataformas que pueden facilitar la adopción.']].map(([ticker,weight,reason])=>({ticker,weight,reason}))},
  {title:'Energía que mueve Argentina',thesis:'El desarrollo energético necesita producción, infraestructura y capital. Esta cartera de práctica explora una exposición a empresas vinculadas con esa expansión.',horizon:'3 a 5 años',invalidation:'Los proyectos de expansión se frenan de forma sostenida y dejan de convertirse en producción o ingresos.',holdings:[['YPF',25,'Producción e infraestructura energética.'],['PAM',25,'Generación y participación en la cadena de energía.'],['VIST',25,'Exposición a la producción de hidrocarburos.'],['GGAL',15,'Financiamiento de la actividad económica; vínculo indirecto con la tesis.']].map(([ticker,weight,reason])=>({ticker,weight,reason}))},
  {title:'Una economía más conectada',thesis:'El comercio digital y la infraestructura tecnológica siguen ganando espacio. La idea necesita que la adopción se traduzca en negocios sostenibles, más allá del entusiasmo por el sector.',horizon:'5 años',invalidation:'La adopción se estanca o el crecimiento no se convierte en una mejora sostenible del negocio.',holdings:[['MELI',25,'Comercio y servicios digitales en América Latina.'],['AMZN',25,'Comercio e infraestructura de cómputo.'],['BABA',20,'Plataformas comerciales; exposición geográfica y regulatoria diferente.'],['MSFT',20,'Servicios digitales para empresas.']].map(([ticker,weight,reason])=>({ticker,weight,reason}))}
];
export function seedTakes() {
  return templates.map((p,i)=>{
    const t=createTake(p);activate(t,[1000000,750000,500000][i],new Date(Date.now()-7*86400000).toISOString());
    for(let day=1;day<=6;day++) {
      const rate=[0.007,0.004,-0.006,0.012,0.009,0.017][day-1]*(1-i*.2);
      t.holdings.forEach((h,j)=>{h.price=money(h.entryPrice*(1+rate*(1+j*.14)));h.referencePrice=h.price;});
      t.history.push({at:new Date(Date.now()-(7-day)*86400000).toISOString(),value:value(t),benchmark:money(t.invested*(1+rate*.6))});
    }
    review(t,i===0?'drop':'check');return t;
  });
}
