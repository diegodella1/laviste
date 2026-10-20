import {randomUUID} from 'node:crypto';
import {simulateRebalance, moneyARS, portfolioRuleState} from './portfolio.mjs';
import {chooseBenchmark} from './benchmark.mjs';
import {VERDICT_NO_ACTION} from './copy.mjs';

export const catalog = [
  ['AMD','AMD','Semiconductores',12000],
  ['MSFT','Microsoft','Plataformas',22000],['GOOGL','Alphabet','Plataformas',9000],
  ['AMZN','Amazon','Infraestructura',11000],['TSM','TSMC','Semiconductores',14000],
  ['MELI','Mercado Libre','Comercio',26000],['BABA','Alibaba','Comercio',7000],
  ['VALE','Vale','Materiales',6000],['FCX','Freeport-McMoRan','Materiales',8000],
  ['YPF','YPF','Energía',16000],['PAM','Pampa Energía','Energía',10000],
  ['VIST','Vista Energy','Energía',13000],['GGAL','Grupo Galicia','Finanzas',6500],
  ['KO','Coca-Cola','Consumo',5000],['GLD','SPDR Gold Trust','Oro',15000],
].map(([ticker,name,bucket,price])=>({ticker,name,bucket,price}));
export const money = n => Math.round(n * 100) / 100;
const arsLabel = moneyARS;
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
export function assertNonNegativeBooks(t) {
  assert((t.cash ?? 0) >= 0, 'No hay efectivo suficiente.');
  assert((t.holdings || []).every(h => (h.units ?? 0) >= 0), 'No hay unidades suficientes.');
}
export function activate(t,amount,now=new Date().toISOString()) {
  assert(t.phase==='draft','Esta tesis ya está activa.',409);
  assert(t.holdings.every(h=>h.weight<=t.settings.cap),'Los pesos objetivo superan el límite por posición.');
  assert(Number.isFinite(amount) && amount>=100000 && amount<=100000000,'Ingresá entre $100.000 y $100.000.000 de práctica.');
  const holdings=t.holdings.map(h=>({...h,units:Math.floor(amount*h.weight/100/h.price),entryPrice:h.price,referencePrice:h.price}));
  assert(holdings.every(h=>h.units>0),'El monto no alcanza para todas las posiciones. Aumentalo o reducí la cantidad de instrumentos.');
  t.holdings=holdings; t.cash=money(amount-holdings.reduce((s,h)=>s+h.units*h.price,0));
  t.invested=amount;t.activatedAt=now;t.phase='active';t.status='track';
  const bench=chooseBenchmark(t.holdings);
  t.benchmarkId=bench.id;t.benchmarkLabel=bench.label;t.benchmarkBase=null;
  t.history=[{at:now,value:amount,benchmark:amount}];
  const tickers=t.holdings.map(h=>h.ticker).join(' · ');
  t.events.unshift({id:randomUUID(),at:now,type:'activation',title:'Práctica activada',body:`Compra de práctica con ${arsLabel(amount)} en ARS asignados. Posiciones: ${tickers}. Precios demorados en ARS y unidades enteras; el remanente queda en efectivo. No se enviaron órdenes a un broker.`,source:'Libro de práctica',status:'track',verdict:'none',verdictText:VERDICT_NO_ACTION});
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
  const live=portfolioRuleState(t);
  const ruleCites=live.ruleCites;
  const drift=live.hasDriftBreach;
  const over=live.hasCapBreach;
  if((drift||over)&&t.status==='track') t.status='watch';
  const leadName = t.holdings[0]?.name || t.holdings[0]?.ticker || 'Posición';
  const copy={
    drop:['Caída de demostración',`Escenario de prueba: suba de riesgo país; ${leadName} cae (ej. 8% ilustrativo) frente al precio base. Pasa a Vigilando. No invalida sola la tesis. No se envió ninguna orden.`],
    broken:['Ruptura de demostración','Escenario de prueba: salto cambiario o noticias que contradicen la invalidación guardada. Pasa a Revisar. No se ejecutó ninguna venta.'],
    recovery:['Recuperación de demostración','Escenario de prueba: se resuelve la incertidumbre anterior y las cotizaciones de práctica suben frente a la base. Pasa a En camino. No se envió ninguna orden.'],
    normal:['Volver al punto de partida','Los precios de práctica vuelven a su base. Este reinicio no modifica la cartera guardada ni envía órdenes.'],
    check:['Chequeo de reglas','Se comprobaron cantidades, concentración y desvíos con los últimos precios demorados de práctica. Esta revisión de reglas no incorpora noticias de mercado.']
  };
  const needsAction=over||drift||scenario==='broken'||scenario==='drop';
  const verdict=needsAction&&scenario!=='recovery'&&scenario!=='normal'?'action':'none';
  const verdictText=verdict==='none'?VERDICT_NO_ACTION:scenario==='broken'?'Acción sugerida: revisar la tesis y el plan':'Acción sugerida: revisar concentración o desvíos';
  t.checkedAt=now;t.nextCheckAt=nextCheck(t,now);
  const cite=ruleCites.length?ruleCites.join(' · '):(scenario==='broken'?`Invalidación: “${t.invalidation.slice(0,120)}…”`:null);
  t.events.unshift({id:randomUUID(),at:now,type:scenario==='check'?'chequeo':'scenario',title:scenario==='check'?'Chequeo de reglas':copy[scenario][0],body:copy[scenario][1]+` ${over?'Hay una posición por encima del límite de concentración.':''} ${drift?'Hay desvíos mayores al umbral configurado.':'No hay desvíos mayores al umbral configurado.'} ${t.settings.paused?'Las propuestas están pausadas.':'No se movió dinero.'}`,source:scenario==='check'?'Motor de reglas · precios demorados':'Motor de escenarios · precios de práctica',status:t.status,ruleCite:cite,verdict,verdictText});
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
export function rebalanceToTarget(t, now = new Date().toISOString()) {
  assert(t.phase === 'active', 'Solo podés rebalancear una práctica activa.', 409);
  assert(t.invested > 0, 'Activá la cartera antes de rebalancear.', 409);
  const preview = simulateRebalance(t);
  assert(preview.afterCash >= 0, 'No hay efectivo suficiente para completar el rebalance.', 409);
  const before = {cash: t.cash, holdings: t.holdings.map(h => ({ticker: h.ticker, units: h.units, weight: h.weight}))};
  for (const h of t.holdings) {
    const next = preview.holdingsAfter.find(x => x.ticker === h.ticker);
    h.units = next.units;
  }
  t.cash = preview.afterCash;
  const lines = preview.lines.map(l => l.line);
  const afterTotal = preview.afterTotal;
  const afterWeights = t.holdings.map(h => ({ticker: h.ticker, units: h.units, pct: money((h.units * h.price / afterTotal) * 100)}));
  t.events.unshift({
    id: randomUUID(),
    at: now,
    type: 'rebalance_applied',
    title: 'Rebalance aplicado (práctica)',
    body: lines.join(' · ') || 'Sin cambios de unidades.',
    ruleCite: null,
    verdict: 'none',
    verdictText: VERDICT_NO_ACTION,
    meta: {before, after: {cash: t.cash, holdings: t.holdings.map(h => ({ticker: h.ticker, units: h.units}))}, lines},
  });
  t.events = t.events.slice(0, 150);
  t.history.push({at: now, value: afterTotal, benchmark: t.invested});
  t.history = t.history.slice(-365);
  return {take: t, lines, trades: preview.lines, before, after: {cash: t.cash, total: afterTotal, weights: afterWeights}};
}
function pushBookEvent(t, now, type, title, body, meta = {}) {
  t.events.unshift({
    id: randomUUID(), at: now, type, title, body, source: 'Libro de práctica',
    status: t.status, verdict: 'none', verdictText: VERDICT_NO_ACTION, meta,
  });
  t.events = t.events.slice(0, 150);
  const last = t.history.at(-1);
  const point = {at: now, value: value(t), benchmark: t.invested};
  if (last?.index != null) {
    point.index = last.index;
    if (last.indexRecorded) point.indexRecorded = true;
  }
  t.history.push(point);
  t.history = t.history.slice(-365);
}

function assertActivePractice(t, verb) {
  assert(t.phase === 'active', `Solo podés ${verb} una práctica activa.`, 409);
}

export function previewAporte(t, amount) {
  assertActivePractice(t, 'aportar a');
  assert(Number.isFinite(amount) && amount >= 1 && amount <= 100000000, 'Ingresá un aporte entre $1 y $100.000.000.');
  const add = money(amount);
  return {
    kind: 'aporte', amount: add,
    cashBefore: t.cash, cashAfter: money(t.cash + add),
    investedBefore: t.invested, investedAfter: money(t.invested + add),
    line: `Aporte ${arsLabel(add)}`,
  };
}

/** External cash in. Increases invested capital; never treated as yield. */
export function applyAporte(t, amount, now = new Date().toISOString()) {
  const preview = previewAporte(t, amount);
  t.cash = preview.cashAfter;
  t.invested = preview.investedAfter;
  pushBookEvent(t, now, 'aporte', 'Aporte de práctica', `Ingresaron ${arsLabel(preview.amount)} al efectivo. No cuenta como rendimiento.`, {amount: preview.amount});
  return t;
}

export function previewRetiro(t, amount) {
  assertActivePractice(t, 'retirar de');
  assert(Number.isFinite(amount) && amount >= 1 && amount <= 100000000, 'Ingresá un retiro entre $1 y $100.000.000.');
  const out = money(amount);
  assert(out <= t.cash, 'No hay efectivo suficiente para el retiro.');
  return {
    kind: 'retiro', amount: out,
    cashBefore: t.cash, cashAfter: money(t.cash - out),
    investedBefore: t.invested, investedAfter: money(Math.max(0, t.invested - out)),
    line: `Retiro ${arsLabel(out)}`,
  };
}

/** Explicit cash-out. Decreases invested capital; never treated as a loss. */
export function applyRetiro(t, amount, now = new Date().toISOString()) {
  const preview = previewRetiro(t, amount);
  t.cash = preview.cashAfter;
  t.invested = preview.investedAfter;
  pushBookEvent(t, now, 'retiro', 'Retiro de práctica', `Salieron ${arsLabel(preview.amount)} del efectivo. No cuenta como pérdida.`, {amount: preview.amount});
  return t;
}

export function previewTrade(t, {side, ticker, by, units = null, amount = null} = {}) {
  assertActivePractice(t, 'operar');
  assert(side === 'compra' || side === 'venta', 'Indicá compra o venta.');
  assert(by === 'units' || by === 'amount', 'Elegí monto o cantidad.');
  const h = t.holdings.find(x => x.ticker === ticker);
  assert(h, 'Instrumento inexistente en esta tesis.');
  assert(h.price > 0, 'Falta el precio de práctica.');
  let qty;
  let spent;
  if (by === 'units') {
    assert(Number.isInteger(units) && units >= 1, 'Ingresá una cantidad entera mayor que 0.');
    qty = units;
    spent = money(qty * h.price);
  } else {
    assert(Number.isFinite(amount) && amount >= 1, 'Ingresá un monto válido.');
    qty = Math.floor(amount / h.price);
    assert(qty >= 1, 'El monto no alcanza para una unidad.');
    spent = money(qty * h.price);
  }
  assertNonNegativeBooks(t);
  if (side === 'compra') assert(spent <= t.cash, 'No hay efectivo suficiente.');
  else assert(qty <= h.units, 'No hay unidades suficientes.');
  const cashAfter = money(side === 'compra' ? t.cash - spent : t.cash + spent);
  const unitsAfter = side === 'venta' ? h.units - qty : h.units + qty;
  assert(cashAfter >= 0, 'No hay efectivo suficiente.');
  assert(unitsAfter >= 0, 'No hay unidades suficientes.');
  return {
    kind: 'trade', side, ticker, by, units: qty, amount: spent, price: money(h.price),
    requestedUnits: by === 'units' ? units : null,
    requestedAmount: by === 'amount' ? money(amount) : null,
    leftoverAmount: by === 'amount' ? money(amount - spent) : 0,
    cashBefore: t.cash,
    cashAfter,
    unitsBefore: h.units,
    unitsAfter,
    investedBefore: t.invested, investedAfter: t.invested,
    line: `${side === 'compra' ? 'Compra' : 'Venta'} ${qty} · ${ticker} · ${arsLabel(spent)}`,
  };
}

export function applyTrade(t, intent, now = new Date().toISOString()) {
  const preview = previewTrade(t, intent);
  const h = t.holdings.find(x => x.ticker === preview.ticker);
  h.units = preview.unitsAfter;
  t.cash = preview.cashAfter;
  assertNonNegativeBooks(t);
  pushBookEvent(t, now, 'trade_applied', preview.side === 'compra' ? 'Compra de práctica' : 'Venta de práctica',
    `${preview.line}. No se enviaron órdenes a un broker.`, preview);
  return preview;
}

function normalizeWeightList(t, weights) {
  assert(Array.isArray(weights) && weights.length === t.holdings.length, 'Indicá un peso para cada posición.');
  const seen = new Set();
  return weights.map(row => {
    assert(row && typeof row.ticker === 'string', 'Falta el instrumento.');
    const h = t.holdings.find(x => x.ticker === row.ticker);
    assert(h, `Instrumento inexistente: ${row.ticker}.`);
    assert(!seen.has(row.ticker), 'Hay instrumentos repetidos.');
    seen.add(row.ticker);
    assert(Number.isFinite(row.weight) && row.weight > 0 && row.weight <= t.settings.cap,
      `Cada posición debe tener un peso mayor que 0 y de hasta ${t.settings.cap}%.`);
    return {ticker: row.ticker, weight: money(row.weight), from: h.weight};
  });
}

export function previewTargetWeights(t, weights) {
  assertActivePractice(t, 'editar pesos de');
  const rows = normalizeWeightList(t, weights);
  const total = rows.reduce((s, r) => s + r.weight, 0);
  assert(total >= 30 && total <= 95.00001, 'Las posiciones deben sumar entre 30% y 95%; el resto queda en efectivo.');
  const changed = rows.filter(r => r.from !== r.weight);
  assert(changed.length > 0, 'Los pesos objetivo no cambiaron.');
  const cashTargetAfter = money(100 - total);
  const cashTargetBefore = money(100 - t.holdings.reduce((s, h) => s + h.weight, 0));
  return {
    kind: 'weights',
    holdings: rows,
    changed,
    cashTargetBefore, cashTargetAfter,
    unitsUnchanged: true,
    line: changed.map(r => `${r.ticker} ${r.from}% → ${r.weight}%`).join(' · '),
  };
}

/** Saves target weights only. Units and cash stay put until a later confirmed trade or rebalance. */
export function applyTargetWeights(t, weights, now = new Date().toISOString()) {
  const preview = previewTargetWeights(t, weights);
  for (const row of preview.holdings) {
    t.holdings.find(h => h.ticker === row.ticker).weight = row.weight;
  }
  pushBookEvent(t, now, 'weights_updated', 'Pesos objetivo actualizados',
    `Se guardaron nuevos objetivos (${preview.line}). Las tenencias no se movieron.`,
    {holdings: preview.holdings, cashTargetAfter: preview.cashTargetAfter});
  return preview;
}

/** Draft-only weight edit. No ledger, no activation, no book event. */
export function setDraftWeights(t, weights) {
  assert(t.phase === 'draft', 'Solo podés ajustar a mano un borrador. En una práctica activa usá el libro.', 409);
  const rows = normalizeWeightList(t, weights);
  const total = rows.reduce((s, r) => s + r.weight, 0);
  assert(total >= 30 && total <= 95.00001, 'Las posiciones deben sumar entre 30% y 95%; el resto queda en efectivo.');
  const changed = rows.filter(r => r.from !== r.weight);
  assert(changed.length > 0, 'Los pesos objetivo no cambiaron.');
  for (const row of rows) t.holdings.find(h => h.ticker === row.ticker).weight = row.weight;
  return {holdings: rows, cashTargetAfter: money(100 - total), line: changed.map(r => `${r.ticker} ${r.from}% → ${r.weight}%`).join(' · ')};
}

/** Replace a draft thesis with a validated proposal (chat → borrador). */
export function applyDraftProposal(t, proposal) {
  assert(t.phase === 'draft', 'Solo se actualiza el borrador.', 409);
  const p = validateProposal(proposal);
  t.title = p.title;
  t.thesis = p.thesis;
  t.horizon = p.horizon;
  t.invalidation = p.invalidation;
  t.holdings = p.holdings;
  return t;
}
/** Explicit book fix. Does not invent a market trade or change invested capital. */
export function applyCorrection(t, {cashDelta = 0, ticker = null, unitsDelta = 0} = {}, now = new Date().toISOString()) {
  assert(t.phase === 'active', 'Solo podés corregir una práctica activa.', 409);
  assert(Number.isFinite(cashDelta), 'Delta de efectivo inválido.');
  assert(Number.isInteger(unitsDelta), 'Delta de unidades inválido.');
  assert(cashDelta !== 0 || unitsDelta !== 0, 'La corrección necesita efectivo o unidades.');
  if (ticker) {
    const h = t.holdings.find(x => x.ticker === ticker);
    assert(h, 'Instrumento inexistente en esta tesis.');
    assert(h.units + unitsDelta >= 0, 'La corrección dejaría unidades negativas.');
    h.units += unitsDelta;
  } else {
    assert(unitsDelta === 0, 'Indicá el instrumento para corregir unidades.');
  }
  t.cash = money(t.cash + cashDelta);
  assert(t.cash >= 0, 'La corrección dejaría efectivo negativo.');
  t.history.push({at: now, value: value(t), benchmark: t.invested});
  t.history = t.history.slice(-365);
  return t;
}
const templateHoldings = rows => rows.map(([ticker, weight, reason]) => ({ticker, weight, reason}));
export const templates = [
  {title: 'Energía en Vaca Muerta', thesis: 'Vaca Muerta sostiene la tesis energética.', horizon: '3 a 5 años', invalidation: 'Los proyectos se frenan de forma sostenida y dejan de traducirse en producción o flujo de caja.', holdings: templateHoldings([['YPF', 25, 'Producción e infraestructura en la cuenca.'], ['VIST', 22, 'Shale y crecimiento de hidrocarburos no convencionales.'], ['PAM', 22, 'Generación y participación en la cadena energética.'], ['GGAL', 18, 'Financiamiento de la actividad; vínculo indirecto con la tesis.']])},
  {title: 'Bancos y crédito si baja la inflación', thesis: 'Si baja la inflación, el crédito bancario se reactiva.', horizon: '2 a 4 años', invalidation: 'El crédito se contrae de forma sostenida o los riesgos macro deterioran la calidad de los activos.', holdings: templateHoldings([['GGAL', 25, 'Banco líder en pesos y dólares.'], ['MELI', 25, 'Pagos y servicios financieros en la región.'], ['KO', 20, 'CEDEAR defensivo; menor correlación con el ciclo local.'], ['VALE', 15, 'Materiales; diversificación sectorial en la práctica.']])},
  {title: 'Bonos soberanos (AL30/GD30) y riesgo país', thesis: 'Compresión de riesgo país en AL30/GD30.', horizon: '2 a 4 años', invalidation: 'El riesgo país se reabre de forma sostenida y los activos sensibles al tipo de cambio pierden correlación con la tesis.', holdings: templateHoldings([['GLD', 25, 'Cobertura vía oro CEDEAR; proxy de flight to quality.'], ['GGAL', 25, 'Sensibilidad local al riesgo país y al tipo de cambio.'], ['MELI', 20, 'Liquidez regional en dólares vía CEDEAR.'], ['KO', 15, 'Defensivo vía CEDEAR.']])},
  {title: 'Exportadoras y agro', thesis: 'Exportadoras y agro con mejor saldo comercial.', horizon: '3 a 5 años', invalidation: 'El saldo comercial se deteriora de forma sostenida o caen los precios de commodities clave.', holdings: templateHoldings([['VALE', 25, 'Materiales y exportación vía CEDEAR.'], ['FCX', 22, 'Cobre y materiales; ciclo de commodities.'], ['KO', 20, 'Consumo global vía CEDEAR.'], ['AMZN', 18, 'Infraestructura global vía CEDEAR.']])},
  {title: 'Utilities y normalización tarifaria', thesis: 'Utilities por normalización tarifaria.', horizon: '3 a 5 años', invalidation: 'Las tarifas quedan congeladas o la regulación revierte el ajuste esperado.', holdings: templateHoldings([['PAM', 25, 'Generación y utilities listadas.'], ['YPF', 25, 'Cadena energética local.'], ['GGAL', 20, 'Financiamiento del sector.'], ['KO', 15, 'Defensivo vía CEDEAR.']])},
  {title: 'CEDEARs como cobertura cambiaria', thesis: 'CEDEARs como cobertura cambiaria.', horizon: '3 años', invalidation: 'El riesgo país se concentra y los activos de cobertura dejan de desacoplarse del resto de la cartera.', holdings: templateHoldings([['GLD', 25, 'Oro vía CEDEAR; cobertura frente a shocks.'], ['MELI', 25, 'Liquidez regional en dólares vía CEDEAR.'], ['KO', 25, 'Consumo global vía CEDEAR.'], ['FCX', 15, 'Materiales; diversificación adicional.']])},
  {title: 'Giro pro-mercado en LatAm', thesis: 'Giro pro-mercado en LatAm (el neoliberalismo avanza en la región): bonos argentinos, bancos, energía y CEDEARs regionales.', horizon: '3 a 5 años', invalidation: 'El giro macro regional se revierte y los activos sensibles dejan de responder.', holdings: templateHoldings([['GGAL', 22, 'Bancos locales sensibles al ciclo.'], ['MELI', 22, 'Regional vía CEDEAR.'], ['YPF', 22, 'Energía argentina listada.'], ['VALE', 18, 'Materiales regionales vía CEDEAR.']])},
  {title: 'Normalización macro regional en LatAm', thesis: 'Normalización macro regional / ciclo electoral en LatAm.', horizon: '2 a 4 años', invalidation: 'La volatilidad macro regional se prolonga y los activos diversificados no aportan estabilidad.', holdings: templateHoldings([['MELI', 25, 'Exposición regional vía CEDEAR.'], ['GGAL', 22, 'Finanzas locales.'], ['KO', 20, 'Defensivo global vía CEDEAR.'], ['GLD', 18, 'Cobertura vía oro CEDEAR.']])},
];
const SEED_TEMPLATE_INDEXES = [0, 1, 5];
export function seedTakes() {
  const anchor = Date.now() - 7 * 86400000;
  const atDay = day => new Date(anchor + day * 86400000).toISOString();
  /** Bancos from day 0; Energía and CEDEARs from day 6 (aligned aggregate capital steps). */
  const activationDay = i => (i === 1 ? 0 : 6);
  return SEED_TEMPLATE_INDEXES.map((ti, i) => {
    const p = templates[ti];
    const t = createTake(p);
    const actDay = activationDay(i);
    activate(t, [1000000, 750000, 500000][i], atDay(actDay));
    for (let day = actDay + 1; day <= 6; day++) {
      const rate = [0.007, 0.004, -0.006, 0.012, 0.009, 0.017][day - 1] * (1 - i * .2);
      t.holdings.forEach((h, j) => {
        h.price = money(h.entryPrice * (1 + rate * (1 + j * .14)));
        h.referencePrice = h.price;
      });
      t.history.push({at: atDay(day), value: value(t), benchmark: money(t.invested * (1 + rate * .6))});
    }
    const end = atDay(6);
    if (i === 0) {
      review(t, 'drop', end);
      const lead = t.holdings[0];
      if (lead.units > 2) lead.units -= 2;
      rebalanceToTarget(t, end);
    } else if (i === 1) {
      const ggal = t.holdings.find(h => h.ticker === 'GGAL');
      if (ggal && ggal.units > 1) ggal.units = Math.max(1, Math.floor(ggal.units * 0.55));
      review(t, 'check', end);
      t.realPricesAt = end;
    } else {
      t.holdings.forEach(h => {
        h.price = h.entryPrice;
        h.referencePrice = h.entryPrice;
      });
      review(t, 'check', end);
    }
    return t;
  });
}
