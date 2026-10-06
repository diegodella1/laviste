export const AGENT_PROMPT_BODY_MAX = 48000;
export const AGENT_PROMPT_NOTE_MAX = 120;

export const DEFAULT_AGENT_INSTRUCTIONS = `Sos La Viste, acompañante y analista de inversión para práctica en Argentina y Latinoamérica. Español rioplatense, claro, sin tono gurú. Buscá contraargumentos; podés decir que una idea no es invertible.

El dinero es de práctica en pesos argentinos (ARS); las cotizaciones son demoradas; no se envían órdenes ni operás en nombre del usuario. No brindás asesoramiento financiero personalizado ni promesas de rendimiento.

No digas que operaste ni guardaste nada en la aplicación. No repitas el disclaimer legal en cada mensaje (la UI ya lo muestra).

Cuando armes una propuesta, devolvé el campo proposal con instrumentos solo del catálogo simulado, entre 2 y 10 posiciones, pesos hasta 25% por posición y un total entre 30% y 95%. Incluí horizonte e invalidación concreta.

Nunca inventes cotizaciones, fechas ni fuentes.`;

export const SAMPLE_THESIS = {
  vaca: 'Vaca Muerta sostiene la tesis energética.',
  bonos: 'Compresión de riesgo país en AL30/GD30.',
  latam: 'Giro pro-mercado en LatAm (el neoliberalismo avanza en la región): bonos argentinos, bancos, energía y CEDEARs regionales.',
};

/** Themed practice proposals for admin «Probar» mocks (Argentina / LatAm; no cloud-AI demo). */
export const SAMPLE_PREVIEW_PROPOSALS = {
  vaca: {
    title: 'Energía que mueve Argentina',
    thesis: 'Vaca Muerta y la cadena energética local pueden capturar inversión e infraestructura en los próximos años.',
    horizon: '3 a 5 años',
    invalidation: 'Los proyectos de expansión se frenan y dejan de convertirse en producción o flujo.',
    holdings: [
      {ticker: 'YPF', weight: 25, reason: 'Producción e infraestructura en Vaca Muerta.'},
      {ticker: 'PAM', weight: 25, reason: 'Generación y transmisión ligadas al desarrollo energético.'},
      {ticker: 'VIST', weight: 25, reason: 'Hidrocarburos no convencionales y exportación.'},
      {ticker: 'GGAL', weight: 15, reason: 'Financiamiento de la actividad económica local.'},
    ],
  },
  bonos: {
    title: 'Compresión de riesgo país',
    thesis: 'Una mejora sostenida del riesgo país favorece activos locales y exposición en pesos.',
    horizon: '1 a 2 años',
    invalidation: 'Los spreads vuelven a ampliarse y el carry local deja de compensar.',
    holdings: [
      {ticker: 'GGAL', weight: 25, reason: 'Sensibilidad al riesgo país y liquidez bancaria local.'},
      {ticker: 'YPF', weight: 22, reason: 'Activo argentino con flujos ligados al dólar energético.'},
      {ticker: 'PAM', weight: 20, reason: 'Infraestructura regulada en pesos.'},
      {ticker: 'VIST', weight: 18, reason: 'Exportación y cobertura parcial en dólares.'},
    ],
  },
  latam: {
    title: 'Giro pro-mercado en LatAm',
    thesis: 'Reformas y apertura en la región favorecen bancos, energía y plataformas con escala regional.',
    horizon: '3 a 5 años',
    invalidation: 'El ciclo político revierte reformas y el riesgo soberano vuelve a dominar.',
    holdings: [
      {ticker: 'MELI', weight: 25, reason: 'Comercio y servicios digitales en la región.'},
      {ticker: 'GGAL', weight: 22, reason: 'Banca argentina con lectura regional.'},
      {ticker: 'YPF', weight: 20, reason: 'Energía local con vínculo exportador.'},
      {ticker: 'VALE', weight: 18, reason: 'Materiales y ciclo global vinculado a LatAm.'},
    ],
  },
};

export function previewProposalForThesis(thesis) {
  const text = String(thesis ?? '').trim();
  for (const [id, sample] of Object.entries(SAMPLE_THESIS)) {
    if (text === sample) return SAMPLE_PREVIEW_PROPOSALS[id];
  }
  return {
    title: 'Tesis de práctica Argentina',
    thesis: text.slice(0, 500) || 'Exploración de una tesis local.',
    horizon: '2 a 4 años',
    invalidation: 'Los supuestos macro o sectoriales dejan de cumplirse.',
    holdings: [
      {ticker: 'GGAL', weight: 25, reason: 'Exposición al sistema financiero local.'},
      {ticker: 'YPF', weight: 25, reason: 'Activo representativo de energía argentina.'},
      {ticker: 'PAM', weight: 20, reason: 'Infraestructura regulada.'},
    ],
  };
}

const REQUIRED = [
  {id: 'practice', test: b => /práctica/i.test(b) || /no\s+.*orden/i.test(b)},
  {id: 'no_save_fiction', test: b => /no digas que operaste/i.test(b) || /no\s+guardaste/i.test(b)},
  {id: 'catalog', test: b => /catálogo/i.test(b)},
  {id: 'proposal_field', test: b => /proposal/i.test(b)},
  {id: 'weights', test: b => /25%/.test(b) && (/30/.test(b) || /95/.test(b) || /pesos/i.test(b))},
  {id: 'es', test: b => /español/i.test(b) || /rioplatense/i.test(b)},
  {id: 'identity', test: b => /la viste/i.test(b)},
];

const WARNINGS = [
  {id: 'disclaimer_ui', test: b => /disclaimer/i.test(b) || /ui ya lo muestra/i.test(b)},
  {id: 'contra', test: b => /contrargumento/i.test(b) || /no es invertible/i.test(b)},
  {id: 'horizon', test: b => /horizonte/i.test(b) || /invalidación/i.test(b)},
  {id: 'short', test: b => b.length >= 400},
  {id: 'huge', test: b => b.length <= 20000},
];

const ERROR_LABELS = {
  practice: 'práctica / sin órdenes',
  no_save_fiction: 'no fingir operaciones ni guardados',
  catalog: 'catálogo',
  proposal_field: 'campo proposal',
  weights: 'límites de pesos (25%, 30–95%)',
  es: 'español rioplatense',
  identity: 'identidad La Viste',
};

const WARN_LABELS = {
  disclaimer_ui: 'recordatorio del disclaimer en la UI',
  contra: 'contraargumentos o ideas no invertibles',
  horizon: 'horizonte o invalidación',
  short: 'prompt muy corto (<400 caracteres)',
  huge: 'prompt muy largo (>20.000 caracteres)',
};

export function validateAgentPromptBody(body) {
  const text = String(body ?? '').trim();
  const errors = [];
  const warnings = [];
  if (!text) errors.push({id: 'empty', message: 'El prompt no puede estar vacío.'});
  if (text.length > AGENT_PROMPT_BODY_MAX) errors.push({id: 'max', message: `Máximo ${AGENT_PROMPT_BODY_MAX} caracteres.`});
  const lower = text.toLowerCase();
  for (const rule of REQUIRED) {
    if (!rule.test(lower)) errors.push({id: rule.id, message: ERROR_LABELS[rule.id]});
  }
  for (const rule of WARNINGS) {
    if (!rule.test(lower)) warnings.push({id: rule.id, message: WARN_LABELS[rule.id]});
  }
  return {ok: errors.length === 0, errors, warnings};
}

export function getActiveAgentInstructions(store) {
  const pointer = store.setting('agentPrompt');
  if (pointer?.activeId) {
    const row = store.agentPromptVersionById(pointer.activeId);
    if (row) return {body: row.body, isDefault: false, version: row, pointer};
  }
  return {body: DEFAULT_AGENT_INSTRUCTIONS, isDefault: true, version: null, pointer: null};
}

export function lineDiffStats(a, b) {
  const left = String(a).split('\n');
  const right = String(b).split('\n');
  const setB = new Set(right);
  const setA = new Set(left);
  const added = right.filter(line => !setA.has(line)).length;
  const removed = left.filter(line => !setB.has(line)).length;
  return {added, removed};
}
