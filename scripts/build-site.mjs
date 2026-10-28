import {icon} from '../public/icons.js';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {iolEnabled} from '../lib/features.mjs';
import {PRACTICE_FOOTER, DEF_SHORT, DEF_LONG} from '../lib/copy.mjs';
import {PRIVACY_PUBLIC_SECTION} from '../public/copy.mjs';
import {formatPrivacyUpdatedAt, PRIVACY_UPDATED_AT} from '../lib/site-date.mjs';

const showIol = iolEnabled();
const privacyUpdated = formatPrivacyUpdatedAt(PRIVACY_UPDATED_AT);

// Static pages keep the public website useful without JavaScript or API credentials.
const eye = '<svg class="eye" viewBox="0 0 64 40" aria-hidden="true"><path d="M2 20C16-3 48-3 62 20 48 43 16 43 2 20Z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="20" r="9" fill="currentColor"/><path d="m48 3 8-3M8 40l8-4" stroke="currentColor" stroke-width="3"/></svg>';
const arrow = icon('arrow');
const brand = `<a class="wordmark" href="/" aria-label="La Viste, inicio"><span class="mark">${eye}</span><span>la viste<span class="period">.</span></span></a>`;
const links = [['/', 'Inicio', 'radar'], ['/como-funciona', 'Cómo funciona', 'layers'], ['/acerca', 'Acerca', 'info']];
const closing = (title) => `<section class="wrap closing-wrap"><div class="closing"><span class="eyebrow">Acceso por invitación · dinero de práctica</span><h2>${title}</h2><p>Si ya tenés acceso, entrá a tu espacio y retomá tus tesis. Si todavía no, pedíselo a quien administra La Viste: no hay registro público.</p><div class="actions"><a class="button inverse btn inverse" href="/app">Entrar a mi espacio ${arrow}</a></div><p class="fine">Precios demorados · no se envían órdenes · el análisis puede equivocarse</p></div></section>`;
const cta = closing('De la idea al seguimiento.');
const ctaHome = closing('Poné a prueba tu primera idea.');
const DEF = DEF_SHORT;
const pulse = (mode = 'full') => `<section class="pulse" data-pulse="${mode}" aria-live="polite"><noscript><p class="pulse-anon">Acá ves tus tesis, los movimientos de hoy y el último chequeo. Es privado: entrá para verlo.</p></noscript></section>`;
const footer = `<footer class="site-footer"><div class="wrap"><div class="footer-top"><div>${brand}<p>Un espacio para pensar, poner a prueba<br>y seguir tus ideas de inversión.</p></div><div class="footer-links"><div><span>Explorá</span><a href="/como-funciona">Cómo funciona</a><a href="/acerca">Acerca de La Viste</a><a href="/preguntas#preguntas">Preguntas frecuentes</a></div><div><span>Tu espacio</span><a href="/app">Ingresar</a><a href="/privacidad">Privacidad y datos</a><a href="/alcance">Alcance del producto</a></div></div></div><div class="footer-bottom"><span>© 2026 La Viste · Una mirada propia.</span><span data-version hidden></span><p class="practice-footer">${PRACTICE_FOOTER}</p></div></div></footer>`;

function page(path, title, description, content, {pulseMode = null, mainClass = '', banner = '', suffix = ''} = {}) {
  const pulseScript = pulseMode ? '<link rel="modulepreload" href="/pulse.js"><link rel="modulepreload" href="/def-short.mjs"><link rel="modulepreload" href="/rev.mjs"><script type="module" src="/pulse.js"></script>' : '';
  const mainAttr = mainClass ? ` class="${mainClass}"` : '';
  return `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#F8FAFC"><meta name="description" content="${description}"><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="https://laviste.diegodella.ar${path}"><meta property="og:locale" content="es_AR"><meta property="og:image" content="https://laviste.diegodella.ar/social-card.png"><meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="https://laviste.diegodella.ar${path}"><title>${title}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/plus-jakarta-sans-700.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/terminal.css"><link rel="stylesheet" href="/prelogin.css"><script src="/site.js" defer></script>${pulseScript}</head><body><a class="skip" href="#contenido">Saltar al contenido</a>${banner}<header class="site-header"><div class="header-inner wrap">${brand}<button class="menu-toggle" aria-expanded="false" aria-controls="site-navigation">Menú +</button><nav class="site-nav" id="site-navigation" aria-label="Navegación principal">${links.map(([href, label]) => `<a href="${href}"${href === path ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a class="button btn primary" href="/app">${icon('lock')}Mi espacio ${arrow}</a></nav></div></header><main id="contenido"${mainAttr}>${content}${suffix}</main>${footer}</body></html>\n`;
}

const ethicsBar = `<aside class="strip" role="note"><div class="wrap"><div class="strip-lead"><span class="chip gain"><span class="dot landing-dot" aria-hidden="true"></span>PRÁCTICA · ARS</span><span>Precios demorados · no se envían órdenes · no es asesoramiento</span></div><div class="r">Sin registro público · acceso por invitación</div></div></aside>`;

const flowSpark = `<svg class="spark" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true"><line class="base" x1="0" y1="30" x2="200" y2="30" stroke="var(--lv-line-strong)" stroke-dasharray="3 4" stroke-width="1"/><path fill="var(--lv-accent-soft)" d="M0 32 C30 30 45 26 70 27 S110 20 135 18 175 12 200 10 V44 H0Z"/><path fill="none" stroke="var(--lv-accent)" stroke-width="2" d="M0 32 C30 30 45 26 70 27 S110 20 135 18 175 12 200 10"/></svg>`;

const home = `
<section class="hero"><div class="glow" aria-hidden="true"></div><div class="wrap">
  <div class="hero-c">
    <div class="badge"><span class="dot landing-dot" aria-hidden="true"></span><span>Práctica de inversión</span><span class="m">·</span><span class="g">Dinero de práctica en ARS</span></div>
    <h1>De una idea a una cartera de práctica.</h1>
    <p class="lead">Contale a La Viste qué ves venir, en tus palabras. A partir de tu tesis analiza mercado, noticias y precios, y arma una cartera de acciones, bonos o CEDEARs para ponerla a prueba con pesos de práctica.</p>
    <div class="actions">
      <a class="button btn primary" href="/app">Empezar con una tesis ${arrow}</a>
      <a class="button outline btn secondary" href="/como-funciona">Ver cómo funciona</a>
    </div>
    <ul class="checks">
      <li>${icon('check')} Precios demorados</li>
      <li>${icon('check')} Noticias con fuentes</li>
      <li>${icon('check')} Sin órdenes reales</li>
    </ul>
  </div>
  <div class="card flow elev" aria-label="Ejemplo ilustrativo: de una idea a una cartera de práctica">
    <div class="flow-top">
      <div class="row"><span class="chip demo">DEMO</span><span class="label">Ejemplo ilustrativo · hipótesis 001</span></div>
      <span class="chip gain"><span class="dot" aria-hidden="true"></span>EN SEGUIMIENTO</span>
    </div>
    <div class="flow-grid">
      <div class="inset idea">
        <div>
          <div class="row label"><span>01 / Tu idea</span><span>${icon('spark')}</span></div>
          <q>Creo que Vaca Muerta puede sostener la producción de energía argentina unos años más.</q>
        </div>
        <div class="note"><span class="dot accent" aria-hidden="true"></span>Escrita en lenguaje común</div>
      </div>
      <div class="cross">
        <div class="hub">${icon('radar')}</div>
        <span class="label">La Viste analiza</span>
        <div class="ticks"><span class="chip">Noticias</span><span class="chip">Precios</span><span class="chip">Supuestos</span></div>
        <span class="note">qué la invalidaría</span>
      </div>
      <div class="inset">
        <div class="row"><div><span class="label">02 / Cartera de práctica</span><h3>Energía en Vaca Muerta</h3></div><span class="chip accent">ARS</span></div>
        <div class="weights"><div><b>YPFD</b><span>35%</span></div><div><b>VIST</b><span>35%</span></div><div><b>PAMP</b><span>30%</span></div></div>
        <div>${flowSpark}</div>
        <div class="note">Curva ilustrativa · sin datos de mercado</div>
      </div>
    </div>
  </div>
</div></section>
<section class="section alt" id="que-hace"><div class="wrap">
  <div class="head-c"><span class="eyebrow">Qué hace La Viste</span><h2>Cuatro cosas. Claras.</h2><p>No te pide saber qué comprar. Te ayuda a pensar una idea, practicarla y ver qué pasa con ella.</p></div>
  <div class="grid g4">
    <article class="card hover"><div class="step-n"><span class="n">01</span>${icon('spark')}</div><h3>De idea a cartera</h3><p>Partís de una tesis. La Viste analiza mercado, noticias y precios, y propone una cartera de acciones, bonos o CEDEARs a la medida. Vos la revisás y decidís si activarla.</p></article>
    <article class="card hover"><div class="step-n"><span class="n">02</span>${icon('layers')}</div><h3>Seguimiento de la tesis</h3><p>Con dinero de práctica en ARS y precios demorados ves cómo se mueve la cartera frente a lo que pensabas que iba a pasar.</p></article>
    <article class="card hover"><div class="step-n"><span class="n">03</span>${icon('radar')}</div><h3>Alertas cuando algo cambia</h3><p>Te avisa si una posición se aleja de su peso, si aparece una noticia relevante o si la idea pasa a «revisar». La decisión siempre es tuya.</p></article>
    <article class="card hover"><div class="step-n"><span class="n">04</span>${icon('branch')}</div><h3>Escenarios para analizar</h3><p>¿Y si cae el crudo? ¿Y si sube el dólar? Probás escenarios aislados sin tocar la cartera guardada.</p><a class="text-link more" href="/como-funciona">Recorrer el proceso <span aria-hidden="true">→</span></a></article>
  </div>
</div></section>
<section class="section"><div class="wrap">
  <div class="head-split"><div><span class="eyebrow">Ideas para practicar</span><h2>Así se ve una tesis armada.</h2></div><p>Tres ejemplos ilustrativos de cómo una idea se traduce en una canasta de práctica. No son recomendaciones ni muestran rendimientos.</p></div>
  <div class="grid g3">
    <article class="card hover tcard"><div><div class="meta"><span class="chip gain"><span class="dot" aria-hidden="true"></span>EN SEGUIMIENTO</span><span class="label">Ejemplo 01</span></div><h3>Energía en Vaca Muerta</h3><p>Producción, regulación y precio internacional del crudo como variables a vigilar.</p><div class="ticks"><span class="tick">YPFD 35%</span><span class="tick">VIST 35%</span><span class="tick">PAMP 30%</span></div></div><div class="foot"><span class="note">${icon('file')}Noticias con fuentes</span><span class="label">Ilustrativo</span></div></article>
    <article class="card hover tcard"><div><div class="meta"><span class="chip watch"><span class="dot watch" aria-hidden="true"></span>EN OBSERVACIÓN</span><span class="label">Ejemplo 02</span></div><h3>Bonos soberanos y riesgo país</h3><p>Qué pasaría con la curva si baja el riesgo país. Qué la invalidaría: un nuevo evento de deuda.</p><div class="ticks"><span class="tick">AL30 50%</span><span class="tick">GD30 50%</span></div></div><div class="foot"><span class="note">${icon('file')}Noticias con fuentes</span><span class="label">Ilustrativo</span></div></article>
    <article class="card hover tcard"><div><div class="meta"><span class="chip accent"><span class="dot accent" aria-hidden="true"></span>BORRADOR</span><span class="label">Ejemplo 03</span></div><h3>Tecnología vía CEDEARs</h3><p>El ciclo de infraestructura de IA, en pesos y con cobertura cambiaria implícita.</p><div class="ticks"><span class="tick">NVDA 40%</span><span class="tick">MSFT 30%</span><span class="tick">SPY 30%</span></div></div><div class="foot"><span class="note">${icon('file')}Noticias con fuentes</span><span class="label">Ilustrativo</span></div></article>
  </div>
  <div class="card pulse-slot">${pulse('full')}</div>
</div></section>
<section class="section alt" id="preguntas"><div class="wrap">
  <div class="head-c"><span class="eyebrow">Antes de empezar</span><h2>Las cosas claras.</h2><p>Una herramienta para explorar ideas, con sus posibilidades y sus límites a la vista.</p></div>
  <div class="grid g3">
    <article class="card trust-card"><div class="icon-tile gain">${icon('shield')}</div><h3>Dinero de práctica</h3><p>Pesos de práctica, no plata real. No se envían órdenes a ningún broker y nada sale de tu bolsillo.</p></article>
    <article class="card trust-card"><div class="icon-tile accent">${icon('clock')}</div><h3>Precios demorados</h3><p>Cotizaciones de mercado en ARS con demora, cuando hay fuente disponible. Sirven para practicar, no para operar.</p></article>
    <article class="card trust-card"><div class="icon-tile">${icon('link')}</div><h3>Fuentes a la vista</h3><p>Cada revisión guarda el enlace de las noticias que usó. La cobertura es parcial y el análisis puede equivocarse.</p></article>
  </div>
  <div class="faq">
    <details><summary>¿La Viste invierte por mí?</summary><p>No. Usa dinero de práctica y precios demorados. Permite escenarios y seguimiento de noticias. No envía órdenes ni mueve dinero real. El análisis puede equivocarse.</p></details>
    <details><summary>¿Qué necesito para usarla?</summary><p>Una cuenta habilitada por quien administra La Viste. Entrás con tu correo y tu contraseña, o con Google. No necesitás una clave de OpenAI ni un broker.</p></details>
    ${showIol ? `<details><summary>¿Necesito una cuenta de IOL?</summary><p>No. Podés hacer toda la práctica sin IOL. Si lo conectás, La Viste permite consultar saldos, posiciones y cotizaciones de tu cuenta. Esas consultas no modifican tu cartera de práctica.</p></details>` : ''}
    <details><summary>¿De dónde salen las noticias?</summary><p>Las revisiones combinan las fuentes de noticias que elige quien administra La Viste con la búsqueda web de OpenAI, y guardan el enlace de cada fuente. La cobertura es parcial y la IA puede equivocarse. Podés revisar las fuentes y pausar el seguimiento.</p></details>
    <details><summary>¿Puedo crear una cuenta?</summary><p>No hay registro público ni suscripciones. Las cuentas las habilita quien administra La Viste, y cada persona tiene su propio espacio. Si ya tenés acceso, entrá desde Mi espacio.</p></details>
    <details><summary>¿Qué hago si olvido mi contraseña?</summary><p>Pedile a quien administra La Viste un enlace para elegir una contraseña nueva. Vence en 24 horas y sirve una sola vez. Si tu cuenta está vinculada a Google, también podés entrar con Google.</p></details>
  </div>
</div></section>
${ctaHome}`;

const how = `
<section class="page-hero"><div class="glow" aria-hidden="true"></div><div class="wrap"><div class="in">
  <span class="eyebrow">El método La Viste</span>
  <h1>Una idea. Una cartera. Un seguimiento.</h1>
  <p class="lead">Cinco pasos para pasar de una corazonada a una hipótesis que se puede poner a prueba. Sin saber qué comprar, sin plata real y con las fuentes a la vista.</p>
  <p class="definition-block">${DEF}</p>
  <nav class="rail" aria-label="Pasos"><a href="#idea"><b>01</b>Idea</a><a href="#propuesta"><b>02</b>Propuesta</a><a href="#practica"><b>03</b>Práctica en ARS</a><a href="#seguimiento"><b>04</b>Seguimiento</a><a href="#escenarios"><b>05</b>Escenarios</a></nav>
</div></div></section>
<div class="wrap">
  <section class="mstep" id="idea"><div class="txt"><div class="num"><b>01</b><span class="eyebrow">La idea</span></div><h2>Empezá por lo que ves.</h2><p>No necesitás saber qué comprar. Una pregunta sobre energía, bancos o cobertura en dólares alcanza para empezar.</p><p>La conversación te devuelve preguntas: ¿qué tendría que pasar?, ¿quiénes podrían beneficiarse?, ¿en qué plazo?, ¿qué estás dando por hecho?</p></div>
    <div class="card elev"><div class="row label"><span>Partí de una idea</span><span class="chip demo">DEMO</span></div>
      <div class="input-like focus">Creo que Vaca Muerta puede sostener la producción argentina unos años más.</div>
      <div class="ticks"><span class="chip">Energía</span><span class="chip">Bancos y tasas</span><span class="chip">CEDEARs de tecnología</span></div>
      <div class="inset"><span class="label">La conversación pregunta</span><ul><li>¿Qué tendría que pasar para que sea cierta?</li><li>¿En qué plazo lo esperás?</li><li>¿Qué te haría cambiar de opinión?</li></ul></div>
    </div>
  </section>
  <section class="mstep flip" id="propuesta"><div class="txt"><div class="num"><b>02</b><span class="eyebrow">La propuesta</span></div><h2>Hacé explícitos tus supuestos.</h2><p>La idea queda escrita como tesis: hipótesis, horizonte y una condición que podría invalidarla. Podés editarla y consultar sus versiones.</p><p>A partir de esa tesis, La Viste analiza mercado, noticias y precios y propone una cartera. Cada posición dice por qué está ahí.</p>
    <ul class="k"><li>${icon('check')}Revisás la propuesta antes de activar nada.</li><li>${icon('check')}Podés pedir cambios en la conversación.</li></ul></div>
    <div class="card elev"><div class="row"><span class="label">Tesis · v1 · ejemplo</span><span class="chip accent"><span class="dot accent" aria-hidden="true"></span>PROPUESTA</span></div>
      <dl class="kv"><dt>Hipótesis</dt><dd>La expansión de Vaca Muerta podría sostener producción e ingresos de las energéticas listadas.</dd><dt>Horizonte</dt><dd>3 a 5 años</dd><dt>La invalida</dt><dd>Cambios regulatorios que frenen inversiones o exportaciones.</dd></dl>
      <div class="pos"><span class="tick">YPFD</span><span class="why">Mayor operadora de la cuenca</span><span class="w">35%</span></div>
      <div class="pos"><span class="tick">VIST</span><span class="why">Productora enfocada en shale</span><span class="w">35%</span></div>
      <div class="pos"><span class="tick">PAMP</span><span class="why">Energía integrada, gas y generación</span><span class="w">30%</span></div>
      <p class="note">Ejemplo explicativo, sin datos de mercado ni recomendación de inversión.</p>
    </div>
  </section>
  <section class="mstep" id="practica"><div class="txt"><div class="num"><b>03</b><span class="eyebrow">La práctica</span></div><h2>Probá antes de comprometer.</h2><p>Elegís un monto de práctica en ARS y la simulación asigna unidades enteras con precios demorados; lo que sobra queda como efectivo.</p><p>Fijás dos reglas simples: un tope por posición y cuánto puede alejarse cada peso antes de avisarte.</p></div>
    <div class="card elev"><span class="label">Activar en práctica · ejemplo</span>
      <label class="field">Monto de práctica<div class="input-like"><span class="mono">$ — ARS</span><span class="chip accent">PRÁCTICA</span></div></label>
      <div class="grid g2"><div class="inset"><span class="label">Tope por posición</span><p class="mono">% máx.</p></div><div class="inset"><span class="label">Aviso de desvío</span><p class="mono">± pp</p></div></div>
      <div class="edu"><b>¿Qué es «desvío en pp»?</b> Puntos porcentuales: si una posición pesaba 35% y hoy pesa 41%, se desvió 6 pp. Es una alerta para revisar, no una orden.</div>
      <button class="button btn primary block" type="button">Activar en práctica</button>
      <p class="note">No es una orden · no se mueve dinero real</p>
    </div>
  </section>
  <section class="mstep flip" id="seguimiento"><div class="txt"><div class="num"><b>04</b><span class="eyebrow">El seguimiento</span></div><h2>Qué cambió — y qué hacer.</h2><p>Las revisiones buscan noticias, guardan sus fuentes y las relacionan con tu tesis. Separan hechos, interpretación e incertidumbre. Elegís frecuencia diaria, semanal o manual.</p><p>Una revisión puede marcar la idea «en observación» o pedirte que la revises. Si sugiere una acción, la confirmás vos.</p></div>
    <div class="card elev"><div class="row"><span class="label">Historial de chequeos · ejemplo</span><button class="button outline btn secondary sm" type="button">Revisar ahora</button></div>
      <div class="tl">
        <div class="ev"><i></i><div><span class="t">CHEQUEO · REGLAS</span><p>Pesos dentro del rango. <span class="chip gain">EN CAMINO</span></p></div></div>
        <div class="ev"><i class="w"></i><div><span class="t">REVISIÓN · NOTICIAS</span><p>Nueva noticia sobre regulación del sector, con su enlace. <span class="chip watch">EN OBSERVACIÓN</span></p></div></div>
        <div class="ev"><i class="r"></i><div><span class="t">ALERTA · DESVÍO</span><p>Una posición superó el aviso de desvío. Te sugerimos revisarla. <span class="chip review">REVISAR</span></p></div></div>
      </div>
      <p class="note">Cobertura: pendiente · parcial · atrasada · interrumpida — siempre visible.</p>
    </div>
  </section>
  <section class="mstep" id="escenarios"><div class="txt"><div class="num"><b>05</b><span class="eyebrow">Los escenarios</span></div><h2>¿Y si…?</h2><p>Probás qué podría pasar con tu cartera ante un cambio de contexto. Los escenarios son aislados: no modifican la cartera guardada.</p><p>Muestran posibles efectos para pensar, no rendimientos esperados.</p></div>
    <div class="card elev"><span class="label">Escenarios de prueba · ejemplo</span>
      <div class="scen">
        <div class="sc"><span>¿Qué pasa si el crudo cae?</span>${icon('spark')}</div>
        <div class="sc"><span>¿Qué pasa si se acelera el tipo de cambio oficial?</span>${icon('spark')}</div>
        <div class="sc"><span>¿Qué pasa ante una recesión local?</span>${icon('spark')}</div>
      </div>
      <p class="note">Caída · ruptura · recuperación — sin tocar lo guardado.</p>
    </div>
  </section>
</div>
<section class="section alt"><div class="wrap"><div class="grid g2">
  <div><span class="eyebrow">Para empezar</span><h2>Tu cuenta, tu espacio.</h2><p class="lead">Entrá con tu correo y tu contraseña, o con Google. No tenés que cargar ninguna clave: el análisis ya está conectado, con un límite diario de mensajes y de revisiones por cuenta.</p>${showIol ? '<p>IOL es opcional. Al conectarlo, podés consultar tu cuenta real en una vista separada de la práctica. La Viste no envía órdenes.</p>' : '<p>La práctica usa precios demorados de mercado en ARS. La Viste no envía órdenes.</p>'}</div>
  <div class="card"><ul class="k checks-list"><li>${icon('check')}Precios demorados de mercado en ARS</li><li>${icon('check')}La Viste no envía órdenes</li><li>${icon('check')}Acceso por invitación</li></ul><div class="actions"><a class="button btn primary" href="/app">Entrar a mi espacio ${arrow}</a><a class="text-link" href="/alcance">Ver alcance <span aria-hidden="true">→</span></a></div></div>
</div><p><a class="text-link" href="/">${icon('arrow')} Volver al inicio</a></p></div></section>
${cta}`;

const about = `
<section class="page-hero"><div class="glow" aria-hidden="true"></div><div class="wrap"><div class="grid g2">
  <div><span class="eyebrow">Acerca de La Viste</span><h1>Análisis a partir de tu tesis.</h1><p class="lead definition-block">${DEF_LONG}</p><p class="lead">Un espacio privado para practicar inversiones con criterio. A partir de tu tesis, La Viste analiza mercado, noticias y precios, arma una cartera de práctica en ARS y la sigue con chequeos y noticias con fuentes. No envía órdenes ni mueve dinero real. El análisis puede equivocarse.</p></div>
  <div class="card elev"><span class="label">En una frase</span><p class="lead">Entrenar el criterio antes de tocar dinero real.</p><div class="ticks"><span class="chip gain"><span class="dot" aria-hidden="true"></span>Práctica en ARS</span><span class="chip accent"><span class="dot accent" aria-hidden="true"></span>Precios demorados</span><span class="chip">Sin órdenes</span></div></div>
</div></div></section>
<section class="section alt"><div class="wrap">
  <div class="head-c"><span class="eyebrow">Las reglas de la práctica</span><h2>Lo que conviene saber.</h2><p>Cuatro límites que no cambian, para que sepas siempre qué estás mirando.</p></div>
  <div class="grid g4">
    <article class="card"><div class="icon-tile gain">${icon('shield')}</div><h3>Dinero de práctica</h3><p>Todo ocurre con pesos de práctica. No se mueve plata real y nada se conecta a tu cuenta bancaria.</p></article>
    <article class="card"><div class="icon-tile accent">${icon('clock')}</div><h3>Precios demorados</h3><p>Cotizaciones en ARS con demora, cuando hay fuente. Alcanzan para aprender; no para operar en el momento.</p></article>
    <article class="card"><div class="icon-tile">${icon('user')}</div><h3>No es asesoramiento</h3><p>La Viste no te dice qué comprar. Te ayuda a ordenar una idea; el criterio y las decisiones son tuyas.</p></article>
    <article class="card"><div class="icon-tile">${icon('lock')}</div><h3>Acceso por invitación</h3><p>No hay registro público ni suscripciones. Cada persona entra con su cuenta a su propio espacio privado.</p></article>
  </div>
</div></section>
<section class="section"><div class="wrap">
  <div class="head-split"><div><span class="eyebrow">Qué es real y qué es simulado</span><h2>Claro desde el inicio.</h2></div></div>
  <div class="grid g3 cmp">
    <article class="card sim"><span class="chip accent"><span class="dot accent" aria-hidden="true"></span>SIMULADO</span><ul><li>${icon('check')}Dinero de práctica en ARS</li><li>${icon('check')}Precios demorados cuando hay fuente</li><li>${icon('check')}Escenarios de prueba aislados</li></ul></article>
    <article class="card real"><span class="chip gain"><span class="dot" aria-hidden="true"></span>REAL</span><ul><li>${icon('check')}Tus palabras, reglas y versiones</li><li>${icon('check')}Noticias con fuentes y fechas</li><li>${icon('check')}Historial de chequeos y revisiones</li></ul></article>
    <article class="card never"><span class="chip review"><span class="dot review" aria-hidden="true"></span>NUNCA</span><ul><li>${icon('close')}Órdenes a un broker</li><li>${icon('close')}Movimiento de dinero real</li><li>${icon('close')}Rebalances sin tu click</li></ul></article>
  </div>
</div></section>
<section class="section alt"><div class="wrap">
  <div class="head-c"><span class="eyebrow">Por qué una tesis</span><h2>Tres ideas detrás del producto.</h2></div>
  <div class="grid g3">
    <article class="card"><div class="icon-tile accent">${icon('history')}</div><span class="label">01 / Memoria</span><h3>El porqué, a mano.</h3><p>Una tesis guarda algo que un precio no cuenta: qué pensabas que iba a pasar. Conservar sus versiones ayuda a reconocer cuándo cambiaste de opinión y por qué.</p></article>
    <article class="card"><div class="icon-tile accent">${icon('search')}</div><span class="label">02 / Curiosidad</span><h3>Preguntas que incomodan.</h3><p>Una buena conversación también busca puntos débiles. La IA sirve para explorar supuestos y organizar información; tu criterio sigue siendo necesario.</p></article>
    <article class="card"><div class="icon-tile accent">${icon('globe')}</div><span class="label">03 / Perspectiva</span><h3>Tiempo para observar.</h3><p>Las noticias tienen sentido cuando se conectan con una pregunta. El seguimiento busca volver a esa pregunta, con fuentes e incertidumbres visibles.</p></article>
  </div>
</div></section>
<section class="section"><div class="wrap"><div class="chapter">
  <div><span class="eyebrow">El proyecto hoy</span><h2>Pequeño a propósito.</h2></div>
  <div class="card"><p>Proyecto de Diego Dell&apos;Agostino, desde Argentina: análisis a partir de tesis, carteras de práctica y seguimiento en un espacio privado.</p><p>El producto está en desarrollo. Hoy no hay registro público, suscripciones ni ejecución de operaciones. La práctica usa dinero de práctica en ARS; cada persona entra con su propia cuenta, y el análisis usa la conexión que configura quien administra La Viste.</p><div class="actions"><a class="text-link" href="/alcance">Qué hace esta versión <span aria-hidden="true">→</span></a><a class="text-link" href="/privacidad">Privacidad y datos <span aria-hidden="true">→</span></a></div></div>
</div></div></section>
${cta}`;

const privacy = `<div class="wrap"><section class="page-hero"><div class="eyebrow">Privacidad y datos</div><h1>Tu espacio,<br>con límites claros.</h1><p>Qué se guarda, qué se envía a los proveedores y qué podés controlar en esta versión.</p></section><div class="legal">
<section><h2>Cuentas individuales</h2><p>Cada persona entra a La Viste con su propia cuenta, ya sea con su correo y una contraseña o con Google. No hay registro público: las cuentas las habilita quien administra La Viste. Las páginas informativas, como esta, son públicas.</p></section>
<section><h2>Tus datos son de tu cuenta</h2><p>Tus tesis, conversaciones, versiones, carteras de práctica, operaciones, revisiones de noticias y preferencias quedan asociadas a tu cuenta. Ninguna otra cuenta puede verlas ni modificarlas, salvo lo que elijas publicar de una tesis (ver «Tesis públicas»).</p><p>Quien administra La Viste no ve tus tesis ni tus conversaciones desde la administración. Lo que ve es tu correo, tu rol, tus límites diarios y tu consumo de análisis (cantidad de pedidos y de tokens). Quien opera el servidor tiene acceso técnico a la base de datos.</p></section>
<section><h2>Si entrás con Google</h2><p>Usamos el acceso con Google solo para reconocerte. Pedimos los permisos básicos de identidad (openid, email y profile). Google nos envía tu correo, si está verificado, tu nombre, tu foto de perfil y un identificador de tu cuenta de Google.</p><p>De todo eso guardamos solo el identificador y la fecha en que vinculaste Google. Tu nombre y tu foto no se guardan. No accedemos a tu correo, a tus contactos, a tus archivos ni a tu calendario, y no conservamos tokens de Google.</p><p>Google no crea cuentas: solo puede entrar quien ya tiene una cuenta habilitada con ese mismo correo. Mientras dura el acceso usamos una cookie temporal de diez minutos.</p></section>
<section><h2>Datos guardados en el servidor</h2><p>De tu cuenta guardamos el correo, un nombre visible (por defecto, lo que está antes de la @ en tu correo), el rol y la contraseña. La contraseña se guarda transformada con scrypt, nunca como texto, así que nadie puede leerla, ni siquiera quien administra La Viste. Si elegís un alias público, también lo guardamos.</p><p>También se guarda lo que creás: conversaciones, tesis, versiones, carteras de práctica, revisiones, preferencias y registros de consumo.</p><p>Hacemos una copia de seguridad de la base por día y conservamos las siete más recientes. Las copias incluyen todos estos datos.</p><p>La conexión con OpenAI la configura quien administra La Viste. Su clave se guarda cifrada en el servidor, y la clave de cifrado se guarda separada de la base de datos.${showIol ? ' La contraseña de IOL se utiliza para obtener sus tokens de conexión y no se conserva en la aplicación.' : ''}</p></section>
<section><h2>Sesiones y cookies</h2><p>Al entrar creamos una sesión y la guardamos en una cookie propia, que solo lee el servidor y que solo funciona en este sitio. La sesión dura hasta doce horas y se renueva mientras usás La Viste. Si cerrás sesión, se borra.</p><p>Podés tener hasta diez sesiones abiertas a la vez; si abrís una más, se cierra la más antigua. Desde Cuenta podés cerrar las sesiones de los otros dispositivos. Cambiar o restablecer la contraseña también las cierra.</p><p>De cada sesión guardamos un hash de la dirección IP y una descripción corta del navegador (user agent), por seguridad.</p><p>Quien administra La Viste usa además una cookie de administración que dura treinta minutos.</p><p>No usamos cookies de marketing ni herramientas de publicidad, y las fuentes tipográficas se sirven desde este mismo sitio.</p></section>
<section><h2>Registro de seguridad</h2><p>Llevamos un registro de los eventos de acceso y de administración: accesos, vinculaciones y rechazos con Google; cambios y restablecimientos de contraseña; cierres de sesión en otros dispositivos; cambios en el control de la IA, y acciones del modo Automático de práctica.</p><p>Cada evento guarda la fecha, la cuenta involucrada y un hash de la dirección IP, nunca contraseñas ni tokens. El registro no se muestra en la aplicación: solo puede verlo quien opera el servidor. Se conserva por 12 meses.</p></section>
<section><h2>Análisis con IA</h2><p>Para conversar, proponer carteras y revisar noticias, La Viste le envía a OpenAI tu mensaje y el contexto necesario de la tesis: título, idea, condición de invalidación, posiciones, montos de práctica y las últimas revisiones aplicadas. No le enviamos tu correo ni tu nombre.</p><p>Le pedimos a OpenAI que no guarde las respuestas en su plataforma. El tratamiento que haga OpenAI depende de sus propias condiciones.</p><p>Para revisar noticias usamos las fuentes que elige quien administra La Viste y la búsqueda web de OpenAI, con los temas y las compañías de la tesis.</p><p>No necesitás una clave de OpenAI propia: el análisis usa la conexión que configura quien administra La Viste. Cada cuenta tiene límites diarios, que se reinician a las 00:00 (hora de Argentina). El análisis puede equivocarse.</p></section>
<section><h2>Conexiones con terceros</h2><p>OpenAI procesa los análisis, como se explica arriba. Google participa solo si entrás con Google. Cloudflare participa en la entrega del sitio mediante el túnel de acceso HTTPS.${showIol ? ' Si conectás IOL, las consultas se envían a sus servicios para obtener saldos, posiciones y cotizaciones.' : ''}</p><p>La Viste usa Cloudflare Web Analytics para medir visitas de forma agregada, sin cookies y sin identificar personas.</p></section>
<section><h2>Tesis públicas</h2><p>${PRIVACY_PUBLIC_SECTION.replace(/^Tesis públicas\.\s*/, '')}</p></section>
<section><h2>Tus controles</h2><p>Desde Cuenta podés cambiar tu contraseña, cerrar sesión en los otros dispositivos y exportar tus tesis, conversaciones, revisiones y operaciones de práctica en un archivo JSON. La exportación no incluye contraseñas ni credenciales.</p><p>Archivar una tesis detiene su seguimiento y conserva su historia.</p><p>Para borrar tu cuenta y sus datos, pedíselo a quien administra La Viste (diego@diegodella.ar). Respondemos dentro de 30 días; el administrador lleva a cabo el borrado. Una vez borrados, pueden seguir hasta siete días en las copias de seguridad, hasta que esas copias se reemplacen.</p></section>
<section><h2>Responsable</h2><p>La Viste es un proyecto de Diego Dell'Agostino, desde Argentina. Para consultas sobre tus datos: diego@diegodella.ar.</p></section>
<p class="fine">Descripción del funcionamiento de la versión actual · Actualizada el ${privacyUpdated}.</p></div></div>`;

const scope = `<div class="wrap legal-page"><section class="page-hero"><div class="eyebrow">Alcance del producto</div><h1>Sabé qué estás<br>poniendo a prueba.</h1><p class="definition-block">${DEF}</p><p>La Viste es una herramienta experimental para explorar y seguir ideas de inversión.</p></section><section class="legal"><h2>Estado de esta versión</h2><p>Datos de mercado: precios demorados de BYMA/CEDEARs en ARS.</p>${pulse('compact')}</section><div class="legal"><section><h2>Qué podés hacer</h2><ul><li>Explorar ideas en una conversación con IA.</li><li>Guardar una tesis, su horizonte y sus criterios de revisión.</li><li>Activar una cartera de práctica con precios demorados y dinero de práctica en ARS.</li><li>Investigar noticias con fuentes y consultar revisiones anteriores.</li>${showIol ? '<li>Conectar IOL para consultar saldos, posiciones y cotizaciones.</li>' : ''}</ul></section><section><h2>Simulación y datos reales</h2><p>Las carteras de práctica no replican una cuenta real. Usan precios demorados de BYMA/CEDEARs en ARS cuando hay cotización; no incorporan comisiones ni dividendos. Los escenarios no son pronósticos ni garantías de rendimiento.</p><p>Las noticias provienen de búsquedas web${showIol ? ' y los datos de IOL de consultas a ese proveedor' : ''}. Pueden ser parciales o estar desactualizados. Las vistas indican la hora de la cotización o de la consulta.</p></section><section><h2>IA y decisiones</h2><p>La IA puede equivocarse, omitir información o interpretar mal una fuente. Revisá los enlaces y el razonamiento. Las propuestas generadas no deben tomarse como asesoramiento financiero personalizado.</p><p>La Viste no envía órdenes de compra o venta, no rebalancea una cuenta real y no administra dinero.</p></section><section><h2>Acceso y límites</h2><p>El acceso es privado: cada persona entra con su propia cuenta, habilitada por quien administra La Viste. No hay registro público ni suscripciones. No necesitás una clave de OpenAI propia. Cada cuenta tiene límites diarios de mensajes y de revisiones de noticias, que se reinician a las 00:00 (hora de Argentina).</p>${showIol ? '<p>IOL es opcional para las consultas de tu cuenta real. Podés explorar el flujo completo de práctica sin conectarlo.</p>' : '<p>La práctica no requiere un broker conectado.</p>'}</section></div></div>${cta}`;



const pages = [
  ['/', 'home.html', 'La Viste · De una idea a una cartera de práctica', 'A partir de tu tesis, La Viste analiza mercado, noticias y precios y arma una cartera de práctica en ARS. Precios demorados. Sin órdenes reales.', home],
  ['/como-funciona', 'how.html', 'Cómo funciona · La Viste', 'De la tesis al análisis de mercado, noticias y precios; cartera de práctica en ARS; reglas, alertas y escenarios.', how],
  ['/acerca', 'about.html', 'Acerca de · La Viste', 'A partir de tu tesis, La Viste analiza mercado, noticias y precios y arma una cartera de práctica en ARS.', about],
  ['/privacidad', 'privacy.html', 'Privacidad y datos · La Viste', 'Conocé cómo se guardan tus datos, qué se comparte con los proveedores y cuáles son tus controles.', privacy],
  ['/alcance', 'scope.html', 'Alcance del producto · La Viste', showIol ? 'Qué permite esta versión de La Viste y cómo distingue práctica simulada, noticias e información de IOL.' : 'Qué permite esta versión de La Viste: práctica con precios demorados, noticias con fuentes y reglas de seguimiento.', scope],
];
const pagePulse = {'/': 'full', '/alcance': 'compact'};
const pageExtras = {
  '/': {mainClass: 'landing', banner: ethicsBar},
  '/como-funciona': {mainClass: 'how-page', banner: ethicsBar},
  '/acerca': {mainClass: 'about-page', banner: ethicsBar},
  '/privacidad': {mainClass: 'legal-page', banner: ethicsBar, suffix: cta},
  '/alcance': {mainClass: 'legal-page', banner: ethicsBar},
};
for (const [path, file, title, description, content] of pages) {
  writeFileSync(fileURLToPath(new URL('../public/' + file, import.meta.url)), page(path, title, description, content, {
    pulseMode: pagePulse[path] || null,
    ...(pageExtras[path] || {}),
  }));
}
console.log(`Generated ${pages.length} public pages.`);
