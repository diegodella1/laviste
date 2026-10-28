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
const brand = `<a class="wordmark" href="/" aria-label="La Viste, inicio">${eye}<span>la viste.</span></a>`;
const links = [['/', 'Inicio', 'radar'], ['/como-funciona', 'Cómo funciona', 'layers'], ['/acerca', 'Acerca de', 'info']];
const cta = `<section class="closing wrap"><div><h2>De la idea al seguimiento.</h2><p class="access-note">${icon('lock')} Acceso por invitación · precios demorados · sin órdenes reales</p></div><a class="button" href="/app">Entrar a mi espacio ${arrow}</a></section>`;
const DEF = DEF_SHORT;
const pulse = (mode = 'full') => `<section class="pulse" data-pulse="${mode}" aria-live="polite"><noscript><p class="pulse-anon">Acá ves tus tesis, los movimientos de hoy y el último chequeo. Es privado: entrá para verlo.</p></noscript></section>`;
const footer = `<footer class="site-footer"><div class="wrap"><div class="footer-top"><div>${brand}<p>Un espacio para pensar, poner a prueba<br>y seguir tus ideas de inversión.</p></div><div class="footer-links"><div><span>Explorá</span><a href="/como-funciona">Cómo funciona</a><a href="/acerca">Acerca de La Viste</a><a href="/preguntas#preguntas">Preguntas frecuentes</a></div><div><span>Tu espacio</span><a href="/app">Ingresar</a><a href="/privacidad">Privacidad y datos</a><a href="/alcance">Alcance del producto</a></div></div></div><div class="footer-bottom"><span>© 2026 La Viste · Una mirada propia.</span><span data-version hidden></span><p class="practice-footer">${PRACTICE_FOOTER}</p></div></div></footer>`;

function page(path, title, description, content, {pulseMode = null, mainClass = '', banner = ''} = {}) {
  const pulseScript = pulseMode ? '<link rel="modulepreload" href="/pulse.js"><link rel="modulepreload" href="/def-short.mjs"><link rel="modulepreload" href="/rev.mjs"><script type="module" src="/pulse.js"></script>' : '';
  const mainAttr = mainClass ? ` class="${mainClass}"` : '';
  return `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#F8FAFC"><meta name="description" content="${description}"><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="https://laviste.diegodella.ar${path}"><meta property="og:locale" content="es_AR"><meta property="og:image" content="https://laviste.diegodella.ar/social-card.png"><meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="https://laviste.diegodella.ar${path}"><title>${title}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/plus-jakarta-sans-700.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/terminal.css"><script src="/site.js" defer></script>${pulseScript}</head><body><a class="skip" href="#contenido">Saltar al contenido</a>${banner}<header class="site-header"><div class="header-inner wrap">${brand}<button class="menu-toggle" aria-expanded="false" aria-controls="site-navigation">Menú +</button><nav class="site-nav" id="site-navigation" aria-label="Navegación principal">${links.map(([href, label, symbol]) => `<a href="${href}"${href === path ? ' aria-current="page"' : ''}>${icon(symbol)}${label}</a>`).join('')}<a class="button" href="/app">${icon('lock')}Mi espacio ${arrow}</a></nav></div></header><main id="contenido"${mainAttr}>${content}</main>${footer}</body></html>\n`;
}

const ethicsBar = `<aside class="landing-bar" aria-label="Marco pedagógico"><div class="wrap landing-bar-inner"><div class="landing-bar-lead"><span class="landing-pill landing-pill-ok"><span class="landing-dot" aria-hidden="true"></span>SIMULADOR PEDAGÓGICO ARS</span><span class="landing-bar-sep" aria-hidden="true">|</span><span class="landing-bar-copy">Precios demorados BYMA / BCBA (15–20 min) · Dinero de práctica · sin órdenes reales</span></div></div></aside>`;

const flowSpark = `<svg class="landing-spark" viewBox="0 0 280 60" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="landingSparkFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#10B981" stop-opacity=".2"/><stop offset="100%" stop-color="#10B981" stop-opacity="0"/></linearGradient></defs><path d="M 0 45 Q 40 40 70 34 T 140 38 T 210 18 T 280 8 L 280 60 L 0 60 Z" fill="url(#landingSparkFill)"></path><path class="landing-spark-line" d="M 0 45 Q 40 40 70 34 T 140 38 T 210 18 T 280 8" fill="none" stroke="#10B981" stroke-linecap="round" stroke-width="2.5"></path></svg>`;

const home = `
<section class="landing-hero wrap">
  <div class="landing-hero-copy">
    <div class="landing-badge"><span class="landing-dot" aria-hidden="true"></span><span>Simulador pedagógico ARS</span><span class="landing-badge-sep" aria-hidden="true">·</span><strong>Dinero de práctica</strong></div>
    <h1>De una idea a una cartera de práctica.</h1>
    <p>Planteá tu tesis en lenguaje simple. La Viste la cruza con noticias y precios demorados y arma una cartera de práctica en ARS — acciones, bonos o CEDEARs a la medida de tu idea. Sin órdenes reales y sin asesoramiento.</p>
    <div class="landing-actions">
      <a class="button" href="/app">Empezar con una tesis ${arrow}</a>
      <a class="button outline" href="/como-funciona">${icon('layers')} Ver cómo funciona</a>
    </div>
    <ul class="landing-micros">
      <li>${icon('check')} Precios BYMA demorados</li>
      <li>${icon('check')} Noticias con fuentes</li>
      <li>${icon('check')} Sin órdenes reales</li>
    </ul>
  </div>
  <div class="landing-flow" aria-label="Ejemplo ilustrativo: de una idea a una cartera de práctica">
    <div class="landing-flow-top">
      <span class="landing-flow-live"><span class="landing-dot" aria-hidden="true"></span>FLUJO ILUSTRATIVO · TESIS #001</span>
      <span class="landing-pill">EJEMPLO</span>
    </div>
    <div class="landing-flow-grid">
      <article class="landing-panel">
        <div class="landing-panel-kicker"><span>01 / TU IDEA</span>${icon('spark')}</div>
        <p class="landing-quote">«La energía en Vaca Muerta va a despegar por el gasoducto y exportaciones.»</p>
        <p class="landing-panel-foot"><span class="landing-dot landing-dot-static" aria-hidden="true"></span>Escrita en lenguaje común</p>
      </article>
      <div class="landing-cross">
        <div class="landing-cross-mark">${icon('radar')}</div>
        <span class="landing-mono">CRUCE PEDAGÓGICO</span>
        <div class="landing-chips">
          <span>Oldelval</span>
          <span>Brent</span>
          <span>BYMA</span>
        </div>
        <span class="landing-cross-note">Noticias + precios demorados</span>
      </div>
      <article class="landing-panel landing-panel-out">
        <div class="landing-panel-head">
          <div>
            <span class="landing-mono">02 / CARTERA DE PRÁCTICA</span>
            <h2>Energía Vaca Muerta</h2>
          </div>
          <p class="landing-panel-note">Canasta ilustrativa<br>sin datos de mercado</p>
        </div>
        <div class="landing-spark-wrap">${flowSpark}</div>
        <div class="landing-tickers">
          <span>YPFD</span>
          <span>VIST</span>
          <span>PAMP</span>
        </div>
      </article>
    </div>
  </div>
</section>
<section class="landing-band" id="pasos">
  <div class="wrap">
    <div class="landing-intro">
      <span class="eyebrow">Tres pasos</span>
      <h2>Tres pasos simples para validar tus ideas.</h2>
      <p>Sin fórmulas complejas ni barreras de entrada. Pensado para entender cómo se mueve el mercado argentino, con precios demorados y dinero de práctica.</p>
    </div>
    <div class="landing-cards landing-cards-3">
      <article class="landing-card">
        <div class="landing-card-top"><span class="landing-step">01</span>${icon('file')}</div>
        <h3>Planteás la tesis</h3>
        <p>Escribís tu corazonada sobre inflación, commodities o tasas en tus propias palabras. La plataforma identifica las variables clave sin pedirte cálculos técnicos.</p>
        <div class="landing-card-example"><span class="landing-mono">EJEMPLO</span><p>«Las exportaciones de crudo van a empujar al sector energético»</p></div>
      </article>
      <article class="landing-card">
        <div class="landing-card-top"><span class="landing-step">02</span>${icon('refresh')}</div>
        <h3>Cruce de noticias y mercado</h3>
        <p>El motor vincula tu argumento con acciones locales o CEDEARs relacionados y detecta eventos periodísticos de medios acreditados que impactan en la hipótesis.</p>
        <div class="landing-card-example landing-card-example-row"><span><span class="landing-dot landing-dot-accent" aria-hidden="true"></span> Medios acreditados</span><span>Precios BYMA demorados</span></div>
      </article>
      <article class="landing-card">
        <div class="landing-card-top"><span class="landing-step">03</span>${icon('chart')}</div>
        <h3>Monitoreo y escenarios</h3>
        <p>Seguís la evolución diaria en pesos de práctica, con alertas cuando algo cambia. Testeás escenarios aislados (caída, ruptura, recuperación) sin modificar la cartera guardada.</p>
        <div class="landing-card-example landing-card-example-ok"><span>Seguimiento pedagógico</span><span>Alertas + escenarios</span></div>
      </article>
    </div>
    <div class="section-end"><a class="text-link" href="/como-funciona">Recorrer el proceso <span aria-hidden="true">→</span></a></div>
  </div>
</section>
<section class="landing-cases wrap">
  <div class="landing-cases-head">
    <div>
      <span class="eyebrow">Casos de práctica</span>
      <h2>Ideas de ejemplo en la plaza local</h2>
    </div>
    <p>Tres canastas ilustrativas para entender el simulador. No son rendimientos reales ni recomendaciones.</p>
  </div>
  <div class="landing-cards landing-cards-3">
    <article class="landing-card">
      <div class="landing-card-meta"><span class="landing-pill">EJEMPLO</span><span class="landing-mono">#ARS-01</span></div>
      <h3>Energía y crudo en Vaca Muerta</h3>
      <p>Desregulación de tarifas y exportaciones a paridad Brent.</p>
      <div class="landing-chips"><span>YPFD</span><span>VIST</span><span>PAMP</span></div>
      <div class="landing-card-foot"><span>Ejemplo ilustrativo</span><a class="text-link" href="/app">Explorar tesis ${arrow}</a></div>
    </article>
    <article class="landing-card">
      <div class="landing-card-meta"><span class="landing-pill landing-pill-accent">EJEMPLO</span><span class="landing-mono">#ARS-02</span></div>
      <h3>Cobertura y deuda soberana</h3>
      <p>Compresión de riesgo país y regularización de la curva.</p>
      <div class="landing-chips"><span>AL30</span><span>GD30</span><span>BPR27</span></div>
      <div class="landing-card-foot"><span>Ejemplo ilustrativo</span><a class="text-link" href="/app">Explorar tesis ${arrow}</a></div>
    </article>
    <article class="landing-card">
      <div class="landing-card-meta"><span class="landing-pill">EJEMPLO</span><span class="landing-mono">#ARS-03</span></div>
      <h3>Tecnología global vía CEDEARs</h3>
      <p>Cobertura cambiaria CCL y ciclo de infraestructura de IA.</p>
      <div class="landing-chips"><span>NVDA</span><span>MSFT</span><span>SPY</span></div>
      <div class="landing-card-foot"><span>Ejemplo ilustrativo</span><a class="text-link" href="/app">Explorar tesis ${arrow}</a></div>
    </article>
  </div>
</section>
<div class="wrap pulse-section">${pulse('full')}</div>
<section class="landing-band" id="transparencia">
  <div class="wrap">
    <div class="landing-intro">
      <span class="eyebrow">Marco de confianza</span>
      <h2>Las cosas claras.</h2>
      <p>Una herramienta para explorar ideas, con sus posibilidades reales y sus límites siempre a la vista.</p>
    </div>
    <div class="landing-cards landing-cards-3">
      <article class="landing-trust">
        <div class="landing-trust-icon landing-trust-icon-ok">${icon('shield')}</div>
        <h3>100% dinero de práctica</h3>
        <p>Sin riesgo real, sin órdenes a un broker. Tu capital nunca está en juego. No es asesoramiento.</p>
      </article>
      <article class="landing-trust">
        <div class="landing-trust-icon landing-trust-icon-accent">${icon('clock')}</div>
        <h3>Precios demorados</h3>
        <p>Cotizaciones de BYMA / CEDEARs en ARS con demora, para fines exclusivamente pedagógicos.</p>
      </article>
      <article class="landing-trust">
        <div class="landing-trust-icon">${icon('search')}</div>
        <h3>Fuentes transparentes</h3>
        <p>Cada alerta guarda el enlace al medio de origen. La cobertura es parcial y el análisis puede equivocarse.</p>
      </article>
    </div>
  </div>
</section>
<section class="section wrap faq-grid" id="preguntas"><div class="faq-intro"><div class="eyebrow">Antes de empezar</div><h2>Preguntas frecuentes</h2><p>Acceso por invitación, precios demorados y un espacio privado. Sin registro público.</p></div><div class="faqs"><details><summary>${icon('shield')}<span>¿La Viste invierte por mí?</span></summary><p>No. Usa dinero de práctica y precios demorados. Permite escenarios y seguimiento de noticias. No envía órdenes ni mueve dinero real. El análisis puede equivocarse.</p></details><details><summary>${icon('lock')}<span>¿Qué necesito para usarla?</span></summary><p>Una cuenta habilitada por quien administra La Viste. Entrás con tu correo y tu contraseña, o con Google. No necesitás una clave de OpenAI ni un broker.</p></details>${showIol ? `<details><summary>${icon('bank')}<span>¿Necesito una cuenta de IOL?</span></summary><p>No. Podés hacer toda la práctica sin IOL. Si lo conectás, La Viste permite consultar saldos, posiciones y cotizaciones de tu cuenta. Esas consultas no modifican tu cartera de práctica.</p></details>` : ''}<details><summary>${icon('search')}<span>¿De dónde salen las noticias?</span></summary><p>Las revisiones combinan las fuentes de noticias que elige quien administra La Viste con la búsqueda web de OpenAI, y guardan el enlace de cada fuente. La cobertura es parcial y la IA puede equivocarse. Podés revisar las fuentes y pausar el seguimiento.</p></details><details><summary>${icon('lock')}<span>¿Puedo crear una cuenta?</span></summary><p>No hay registro público ni suscripciones. Las cuentas las habilita quien administra La Viste, y cada persona tiene su propio espacio. Si ya tenés acceso, entrá desde Mi espacio.</p></details><details><summary>${icon('key')}<span>¿Qué hago si olvido mi contraseña?</span></summary><p>Pedile a quien administra La Viste un enlace para elegir una contraseña nueva. Vence en 24 horas y sirve una sola vez. Si tu cuenta está vinculada a Google, también podés entrar con Google.</p></details></div></section>
<section class="landing-invite wrap" id="espacio">
  <div class="landing-invite-inner">
    <span class="landing-mono landing-invite-kicker">ACCESO POR INVITACIÓN · CERO RIESGO REAL</span>
    <h2>Poné a prueba tu primera idea hoy.</h2>
    <p>Si ya tenés acceso, entrá a tu espacio. Si no, pedíselo a quien administra La Viste. Precios demorados · sin órdenes reales · no es asesoramiento.</p>
    <a class="button light" href="/app">Entrar a mi espacio ${arrow}</a>
  </div>
</section>`;

const how = `<div class="wrap"><section class="page-hero"><div class="eyebrow">El método La Viste</div><h1>Una idea.<br>Una cartera.<br>Un seguimiento.</h1><p class="definition-block">${DEF}</p><p>De la tesis al análisis de mercado, noticias y precios; cartera de práctica en ARS; reglas, alertas y escenarios.</p></section><section class="chapter"><div><span class="chapter-icon">${icon('chat')}</span><span class="eyebrow">01 / La conversación</span><h2>Empezá por lo que ves.</h2><p>No necesitás saber qué comprar. Una pregunta sobre energía, bancos o cobertura en dólares alcanza para empezar.</p></div><div class="example"><span class="eyebrow">Ejemplo ilustrativo</span><p>«Creo que Vaca Muerta puede sostener la producción argentina unos años más.»</p><div class="example-row"><strong>La conversación abre preguntas</strong><p>¿Qué tendría que pasar? ¿Quiénes podrían beneficiarse? ¿En qué plazo? ¿Qué estás dando por hecho?</p></div></div></section><section class="chapter"><div><span class="chapter-icon">${icon('file')}</span><span class="eyebrow">02 / La tesis</span><h2>Hacé explícitos tus supuestos.</h2><p>La idea queda escrita junto con su horizonte y una condición que podría invalidarla. Podés editarla y consultar sus versiones.</p></div><div class="example"><span class="eyebrow">Explorá una misma idea</span><div class="demo-controls" role="group" aria-label="Partes de una tesis"><button data-example="hypothesis" aria-pressed="true">${icon('file')}Hipótesis</button><button data-example="evidence" aria-pressed="false">${icon('search')}Evidencia</button><button data-example="change" aria-pressed="false">${icon('branch')}Revisión</button></div><div class="demo-result" aria-live="polite"><span class="fine" id="example-label">Hipótesis</span><h3 id="example-title">Una idea que se puede discutir.</h3><p id="example-copy">La expansión de Vaca Muerta podría sostener producción e ingresos de las energéticas listadas. Falta comprobar capex, regulación y precios internacionales.</p></div><p class="fine">Ejemplo explicativo, sin datos de mercado ni recomendación de inversión.</p></div></section><section class="chapter"><div><span class="chapter-icon">${icon('layers')}</span><span class="eyebrow">03 / La práctica</span><h2>Probá antes de comprometer.</h2></div><div><p>La IA propone una composición de cartera que podés revisar antes de activarla. Cada posición incluye su relación con la tesis. Elegís un monto de práctica y la simulación asigna unidades enteras, conservando el resto como efectivo.</p><p>Los precios de práctica son demorados (BYMA/CEDEARs en ARS) cuando hay cotización disponible. Los escenarios de prueba muestran posibles efectos sin alterar tu cartera guardada. No representan rendimientos esperados.</p></div></section><section class="chapter"><div><span class="chapter-icon">${icon('radar')}</span><span class="eyebrow">04 / El seguimiento</span><h2>Qué cambió — y qué hacer.</h2></div><div><p>Las revisiones investigan noticias con búsqueda web, guardan sus fuentes y las relacionan con tu tesis. Distinguen hechos, interpretación e incertidumbre. Podés elegir una frecuencia diaria, semanal o manual.</p><p>Una revisión puede marcar una idea en observación o pedir que la revises. La cobertura tiene su propio estado: pendiente, parcial, atrasada o interrumpida. Incluye «Revisar ahora»; las decisiones siguen siendo tuyas.</p></div></section><section class="chapter"><div><span class="chapter-icon">${icon('lock')}</span><span class="eyebrow">Para empezar</span><h2>Tu cuenta, tu espacio.</h2></div><div><p>Entrá con tu correo y tu contraseña, o con Google. No tenés que cargar ninguna clave: el análisis ya está conectado, con un límite diario de mensajes y de revisiones por cuenta.</p>${showIol ? '<p>IOL es opcional. Al conectarlo, podés consultar tu cuenta real en una vista separada de la práctica. La Viste no envía órdenes.</p>' : '<p>La práctica usa precios demorados de mercado en ARS. La Viste no envía órdenes.</p>'}<div class="hero-actions"><a class="button" href="/app">Entrar a mi espacio ${arrow}</a><a class="text-link" href="/alcance">Ver alcance</a></div></div></section></div>${cta}`;

const about = `<div class="wrap"><section class="about-hero-grid"><div class="page-hero about-hero-copy"><div class="eyebrow">Acerca de La Viste</div><h1>Análisis a partir<br>de tu tesis.</h1><p class="definition-block">${DEF_LONG}</p><p>A partir de tu tesis analiza mercado, noticias y precios, y arma una cartera a la medida. Dinero de práctica en ARS; precios demorados; sin órdenes reales; el análisis puede equivocarse.</p></div><div class="about-pulse-stack">${pulse('full')}<div class="pulse pulse-ghost" aria-hidden="true"><h3>Tu espacio en vivo</h3><p class="pulse-anon">Acá ves tus tesis, los movimientos de hoy y el último chequeo. Es privado: entrá para verlo.</p><a class="button outline" href="/app" tabindex="-1">Entrar a mi espacio ${arrow}</a><p class="fine">Sin sesión · sin números en el panel anónimo.</p></div></div></section><section class="section about-steps-section"><div class="section-head"><div><div class="eyebrow">Cómo funciona</div><h2>Idea → cartera → seguimiento</h2></div></div><div class="steps about-steps"><article class="step"><div class="step-num"><span>01</span>${icon('chat')}</div><h3>Partí de una tesis.</h3><p>Describí lo que ves venir, supuestos, riesgos y qué la invalidaría.</p></article><article class="step"><div class="step-num"><span>02</span>${icon('layers')}</div><h3>Cartera a la medida, en práctica.</h3><p>La Viste analiza mercado, noticias y precios y arma la cartera. Revisás, elegís un monto en ARS y activás. Tope % y desvío ±pp. No es una orden.</p></article><article class="step"><div class="step-num"><span>03</span>${icon('radar')}</div><h3>Seguimiento con evidencia.</h3><p>Chequeos, noticias con fuentes y un veredicto. Si hay acción sugerida, la confirmás vos.</p></article></div></section><section class="section sim-compare-section"><div class="section-head"><div><div class="eyebrow">Qué es real y qué es simulado</div><h2>Claro desde el inicio.</h2></div></div><div class="sim-compare"><article><span class="eyebrow">Simulado</span><ul><li>Dinero de práctica en ARS</li><li>Precios demorados cuando hay fuente</li><li>Escenarios de prueba aislados</li></ul></article><article><span class="eyebrow">Real</span><ul><li>Tus palabras, reglas y versiones</li><li>Noticias con fuentes y fechas</li><li>Historial de chequeos y revisiones</li></ul></article><article><span class="eyebrow">Nunca</span><ul><li>Órdenes a un broker</li><li>Movimiento de dinero real</li><li>Rebalances sin tu click</li></ul></article></div></section><div class="principles"><article><span class="chapter-icon">${icon('history')}</span><span class="eyebrow">01 / Memoria</span><h3>El porqué, a mano.</h3><p>Una tesis guarda algo que un precio no cuenta: qué pensabas que iba a pasar. Conservar sus versiones ayuda a reconocer cuándo cambiaste de opinión y por qué.</p></article><article><span class="chapter-icon">${icon('search')}</span><span class="eyebrow">02 / Curiosidad</span><h3>Preguntas que incomodan.</h3><p>Una buena conversación también busca puntos débiles. La IA sirve para explorar supuestos y organizar información; tu criterio sigue siendo necesario.</p></article><article><span class="chapter-icon">${icon('globe')}</span><span class="eyebrow">03 / Perspectiva</span><h3>Tiempo para observar.</h3><p>Las noticias tienen sentido cuando se conectan con una pregunta. El seguimiento busca volver a esa pregunta, con fuentes e incertidumbres visibles.</p></article></div><section class="chapter"><div><span class="eyebrow">El proyecto hoy</span><h2>Pequeño a propósito.<br>Claro desde el inicio.</h2></div><div><p>Proyecto de Diego Dell&apos;Agostino, desde Argentina. Análisis a partir de tesis, carteras de práctica y seguimiento en un espacio privado.</p><p>El producto está en desarrollo. Hoy no hay registro público, suscripciones ni ejecución de operaciones. La práctica usa dinero de práctica en ARS; cada persona entra con su propia cuenta, y el análisis usa la conexión que configura quien administra La Viste.</p><div class="hero-actions"><a class="text-link" href="/alcance">Qué hace esta versión <span aria-hidden="true">→</span></a></div></div></section></div>${cta}`;

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

const scope = `<div class="wrap"><section class="page-hero"><div class="eyebrow">Alcance del producto</div><h1>Sabé qué estás<br>poniendo a prueba.</h1><p class="definition-block">${DEF}</p><p>La Viste es una herramienta experimental para explorar y seguir ideas de inversión.</p></section><section class="legal"><h2>Estado de esta versión</h2><p>Datos de mercado: precios demorados de BYMA/CEDEARs en ARS.</p>${pulse('compact')}</section><div class="legal"><section><h2>Qué podés hacer</h2><ul><li>Explorar ideas en una conversación con IA.</li><li>Guardar una tesis, su horizonte y sus criterios de revisión.</li><li>Activar una cartera de práctica con precios demorados y dinero de práctica en ARS.</li><li>Investigar noticias con fuentes y consultar revisiones anteriores.</li>${showIol ? '<li>Conectar IOL para consultar saldos, posiciones y cotizaciones.</li>' : ''}</ul></section><section><h2>Simulación y datos reales</h2><p>Las carteras de práctica no replican una cuenta real. Usan precios demorados de BYMA/CEDEARs en ARS cuando hay cotización; no incorporan comisiones ni dividendos. Los escenarios no son pronósticos ni garantías de rendimiento.</p><p>Las noticias provienen de búsquedas web${showIol ? ' y los datos de IOL de consultas a ese proveedor' : ''}. Pueden ser parciales o estar desactualizados. Las vistas indican la hora de la cotización o de la consulta.</p></section><section><h2>IA y decisiones</h2><p>La IA puede equivocarse, omitir información o interpretar mal una fuente. Revisá los enlaces y el razonamiento. Las propuestas generadas no deben tomarse como asesoramiento financiero personalizado.</p><p>La Viste no envía órdenes de compra o venta, no rebalancea una cuenta real y no administra dinero.</p></section><section><h2>Acceso y límites</h2><p>El acceso es privado: cada persona entra con su propia cuenta, habilitada por quien administra La Viste. No hay registro público ni suscripciones. No necesitás una clave de OpenAI propia. Cada cuenta tiene límites diarios de mensajes y de revisiones de noticias, que se reinician a las 00:00 (hora de Argentina).</p>${showIol ? '<p>IOL es opcional para las consultas de tu cuenta real. Podés explorar el flujo completo de práctica sin conectarlo.</p>' : '<p>La práctica no requiere un broker conectado.</p>'}</section></div></div>${cta}`;

const pages = [
  ['/', 'home.html', 'La Viste · De una idea a una cartera de práctica', 'A partir de tu tesis, La Viste analiza mercado, noticias y precios y arma una cartera de práctica en ARS. Precios demorados. Sin órdenes reales.', home],
  ['/como-funciona', 'how.html', 'Cómo funciona · La Viste', 'De la tesis al análisis de mercado, noticias y precios; cartera de práctica en ARS; reglas, alertas y escenarios.', how],
  ['/acerca', 'about.html', 'Acerca de · La Viste', 'A partir de tu tesis, La Viste analiza mercado, noticias y precios y arma una cartera de práctica en ARS.', about],
  ['/privacidad', 'privacy.html', 'Privacidad y datos · La Viste', 'Conocé cómo se guardan tus datos, qué se comparte con los proveedores y cuáles son tus controles.', privacy],
  ['/alcance', 'scope.html', 'Alcance del producto · La Viste', showIol ? 'Qué permite esta versión de La Viste y cómo distingue práctica simulada, noticias e información de IOL.' : 'Qué permite esta versión de La Viste: práctica con precios demorados, noticias con fuentes y reglas de seguimiento.', scope],
];
const pagePulse = {'/': 'full', '/como-funciona': 'compact', '/acerca': 'full', '/alcance': 'compact'};
const pageExtras = {
  '/': {mainClass: 'landing', banner: ethicsBar},
};
for (const [path, file, title, description, content] of pages) {
  writeFileSync(fileURLToPath(new URL('../public/' + file, import.meta.url)), page(path, title, description, content, {
    pulseMode: pagePulse[path] || null,
    ...(pageExtras[path] || {}),
  }));
}
console.log(`Generated ${pages.length} public pages.`);
