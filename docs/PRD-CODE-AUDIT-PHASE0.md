# La Viste — Phase 0 audit: PRD ↔ código

**Fecha:** 2026-10-07  
**Base:** `dfe0aff4f7c12867a62bed4d5fa185c6bcfe7b61` (`main`, PR #17)  
**Alcance:** documentación. Cero cambios de producto, runtime, CSS, servidor, DB o config.  
**Objetivo:** mapear el PRD vigente contra el código actual, declarar Entrega A (núcleo manual) y estacionar el resto.

---

## 1. Fuentes (autoridad)

| Prioridad | Documento | Uso en este audit |
|-----------|-----------|-------------------|
| **1 · PRD vigente** | [`PRD-Tesis.md`](../PRD-Tesis.md) (v1.0, 2026-10-07 en repo; contenido 5 oct 2026) | Requisitos RF01–RF35, etapas E0–E5, modelo de tesis, motor de seguimiento, carteras, brokers, plan de entrega. |
| **2 · Contrato del MVP** | [`README.md`](../README.md) | Qué declara el producto hoy (práctica + noticias + precios demorados; IOL opcional/dormido; Suizo). |
| **3 · Inventario de código** | [`docs/P0-INVENTORY.md`](P0-INVENTORY.md) (2026-10-05) | Mapa de archivos/rutas **previo** a P0–P2. Varias filas están desactualizadas (ver §6). Se usa como pista, no como verdad del tip. |
| **4 · PoC histórica** | [`docs/POC-original.md`](POC-original.md) | Línea base del PoC (precios ficticios, sin noticias, IOL futuro). Superada por el README y el código. |

El PRD describe el producto *objetivo* y etiqueta el PoC de entonces. El código en este tip ya cubre más que el §7 del PRD (noticias reales, cotizaciones demoradas, rebalanceo manual, timeline, home observatorio, IOL detrás de flag). Este documento mide **código actual** vs **PRD**, no vs el PoC de octubre 5.

---

## 2. Cómo leer el estado

| Estado | Significado |
|--------|-------------|
| **shipped** | Recorrido usable en UI + persistencia/API. Puede tener límites de PoC (catálogo fijo, un usuario, dinero de práctica). |
| **partial** | Existe una pieza material, pero falta un criterio de aceptación del PRD o está incompleto. |
| **missing** | No hay superficie ni API que cubra el requisito *dentro de Entrega A*. |

**Entrega A (núcleo manual / shipped core):** ciclo *idea → conversación → propuesta → práctica → seguimiento de reglas y noticias → decisión del usuario (mantener / rebalancear / archivar)*. Permiso fijo `ask`. Sin órdenes a broker, sin autopiloto, sin TWR/fiscal.

Todo lo demás está en **§5 PARK**.

---

## 3. Matriz Entrega A

Citas de código del tip `dfe0aff`. Rutas de app: hash SPA bajo `/app` (`public/app.js` `route()` / `render()`).

### 3.1 Conversación y propuesta

| ID | Capacidad PRD | Estado | Código / UI |
|----|---------------|--------|-------------|
| A1 | Chat con proveedor real; sin clave no se fabrica respuesta (**RF06**, E0 P0) | **shipped** | `POST /api/chats/:id/messages` + `aiRequired()` (`server.mjs`); `lib/ai.mjs` `askOpenAI` / schema; UI `#/new`, `#/chat/:id` (`newPage`, `chatPage`, `send`). Banner OpenAI en home. |
| A2 | Clarificar idea (hipótesis, horizonte, invalidación) antes de proponer (**RF07**) | **partial** | Prompt: `lib/prompts.mjs` `chatLockedSuffix` (hasta 2 aclaraciones) + `lib/agent-prompt.mjs`. Servidor: `mustPropose` tras 2 turnos (`server.mjs`). **No** hay perfil estructurado obligatorio ni rechazo si faltan campos más allá de `validateProposal`. |
| A3 | Contrastar hipótesis: contraargumento e incertidumbre (**RF08**) | **partial** | Instrucciones del analista piden contraargumentos (`DEFAULT_AGENT_INSTRUCTIONS`). Schema de propuesta **no** exige contraargumento. Tests de prompt avisan; no bloquean persistencia. |
| A4 | Respetar catálogo; rechazar instrumentos inválidos (**RF09**) | **shipped** | `lib/engine.mjs` `validateProposal` + `catalog` (15 tickers); `lib/ai.mjs` `parseResponse` valida antes de devolver. |
| A5 | Conclusión no invertible: guardar idea sin inventar cartera (**RF10**) | **partial** | El modelo *puede* decirlo (`agent-prompt.mjs`). `POST /api/takes` **exige** propuesta válida 2–10 holdings. No hay tesis-sin-cartera persistida. |
| A6 | Separar propuesta y activación (**RF11**) | **shipped** | Chat no activa. Card `portfolioCard`: **Activar práctica** / **Ajustar** (`app.js`). Activar: modal monto → `POST /api/takes/:id/activate`. Ajustar: `adjusting: true` en mensajes. |
| A7 | Memoria útil al retomar (**RF12**) | **partial** | Últimos 24 mensajes + contexto de take/reviews (`server.mjs` chat). Sin memoria resumida versionada. |
| A8 | Reintentar mensaje fallido sin perder texto (**RF13**) | **missing** | El dock usa `<textarea>` no persistido. Error de API no guarda borrador. |
| A9 | Explorar sin broker ni dinero real (**RF03**); plantillas | **shipped** | `#/new` chips; `templates` en `engine.mjs`; `data-action="template"` → `POST /api/takes`. Home vacío: `homeEmptySeed()` (DEMO UI, no seed de DB). |
| A10 | Política de propuesta en 2–3 turnos (inventario P0-1) | **shipped** | `mustPropose` / `assistantTurns` (`server.mjs`, `prompts.mjs`). Tests: `test/integrations.test.mjs`, `test/p0.test.mjs`. |

### 3.2 Cartera de práctica

| ID | Capacidad PRD | Estado | Código / UI |
|----|---------------|--------|-------------|
| A11 | Activación: capital = posiciones + efectivo; unidades enteras (**RF14**) | **shipped** | `lib/engine.mjs` `activate`; quotes al activar (`prepareHoldingsQuotesForActivation`, `tryStampRealPricesAtActivation` en `server.mjs` / `lib/quote-migration.mjs`). UI modal `activate-form`. Rango ARS 100 000–100 000 000. |
| A12 | Política coherente: concentración, universo, mínimo (**RF15**) | **partial** | `cap` vs pesos en `activate` / `updateSettings`. Universo = catálogo fijo. Mínimo = ≥1 unidad por posición. No hay liquidez/lotes/costos ni perfil de usuario cruzado. Cadencia `vigilant` existe en `nextCheck` pero **no** en el select de Preferencias. |
| A13 | Exposición explicada: mecanismo, vínculo, riesgo (**RF16**) | **partial** | `holding.reason` + `bucket` + UI `porQueRow` (`public/por-que.mjs`, tab Posiciones). Faltan campos PRD: mecanismo, directo/indirecto, riesgo principal como datos. |
| A14 | Libro de movimientos: aportes, retiros, operaciones ≠ rendimiento (**RF17**) | **partial** | Eventos `activation`, `rebalance_applied`, `chequeo`, `scenario`, `rules`, `real_prices` en `take.events` (cap 150). **No** hay aportes/retiros posteriores ni ledger reconstruible aparte de events + `history[]`. |
| A15 | Versionado de edición material (**RF19**) | **partial** | `store.version` + `rememberChange` en idea, settings, create, rebalance (`lib/store.mjs`, `server.mjs`). Snapshot: thesis, invalidation, horizon, settings. **No** holdings/cash. UI: `data-action="versions"`. |
| A16 | Archivar seguimiento ≠ liquidar (**RF20**) | **partial** | `POST /api/takes/:id/archive` → `phase:'archived'`, pausa monitoreo. No hay «cerrar práctica» / devolver capital. |
| A17 | Pantalla Posiciones: objetivo, tenencia, desvío, moneda | **shipped** | `#/take/:id/positions` → `positions()`; `holdingDerived` / `portfolioRuleState` (`lib/portfolio.mjs`); tabla + lista móvil. |
| A18 | Rebalanceo mecánico **manual** (confirmar antes de aplicar) | **shipped** | Preview `simulateRebalance`; CTA `apply-rebalance`; modal; `POST /api/takes/:id/rebalance` con `version`. Tests: `test/rebalance.test.mjs`. Copy: no se envían órdenes. |
| A19 | Mark-to-market con precios demorados BYMA/CEDEAR | **shipped** | `lib/quotes.mjs` (data912 → Yahoo), `quote-time.mjs`, cache SQLite. UI `quoteMetaNote()`. README: fixtures en tests. |
| A20 | Escenarios de demo rotulados, sin persistir cartera | **shipped** | `POST /api/takes/:id/scenario` clona y no guarda (`server.mjs`). UI `data-action="scenario"` / `apply-scenario`. `review()` escenarios en motor para preview. |

### 3.3 Seguimiento, noticias, estados

| ID | Capacidad PRD | Estado | Código / UI |
|----|---------------|--------|-------------|
| A21 | Revisión programada; última/próxima; reinicio no duplica ni inventa huecos (**RF21**) | **shipped** | `lib/scheduler.mjs`: jobs, 1 concurrente, jobs `running` → `failed` + `coverage:'interrupted'` al boot; `nextCheck`. Cadencias UI: patient 7d / standard 24h / manual. `Revisar ahora` → `POST .../review`. |
| A22 | Atención con causa (track / watch / review) (**RF22**, §11) | **partial** | Campos `attention` + `attentionReason`; news `applyResearch`; reglas `review('check')` y live `effectiveAttention`. Escenarios de preview pueden *mostrar* transiciones. Salida de «vigilando» no replica el evaluador de evidencia del PRD (no basta un rebote: parcialmente cubierto en news `resolved`). |
| A23 | Cobertura independiente de atención (**RF23**) | **partial** | `coverage`: `pending` / `partial` / `stale` / `interrupted` + callout en `timelineView`. Éxito de news **siempre** deja `partial` (`news.mjs`); no existe `updated`. UI no usa color solo: texto de cobertura. |
| A24 | Novedad contextual con fuentes o marca de escenario (**RF24**, §12) | **shipped** | `lib/news.mjs` `research` (web_search + schema `thesis_review`); `buildTimeline` mezcla events + reviews + jobs fallidos (`lib/timeline.mjs`). Tab **Novedades** `timelineView`. Actividad `#/activity` = `movementsToday`. |
| A25 | No actuar como resultado válido (**RF26**) | **shipped** | `VERDICT_NO_ACTION` (`public/copy.mjs`); `verdict:'none'` en chequeos/rebalance; UI `verdict ok`. |
| A26 | Timeline unificada de tesis (P0-2 del inventario) | **shipped** | `buildTimeline` + `eventPorQue`. Home no incrusta el feed completo: cuenta **Hoy** → `#/activity`. |
| A27 | Frecuencia + pausa de seguimiento (no autopilot) | **shipped** | `takeSettings`: cadence + `monitoringPaused`. Submit fuerza `mode:'ask'` (`app.js`). `updateSettings` rechaza otro mode (`engine.mjs`). Despausar exige OpenAI. |

### 3.4 Experiencia (pantallas §9)

| ID | Capacidad PRD | Estado | Código / UI |
|----|---------------|--------|-------------|
| A28 | Inicio: tesis, estado, evolución, novedades del día | **shipped** | `home()`: total práctica, pills En camino/Vigilando/Revisar, último chequeo, capital aportado, Hoy, chart `portfolioSeriesARS` (`public/math.js` + `chart-suizo.mjs`). |
| A29 | Nueva tesis + conversación | **shipped** | `#/new` → `POST /api/chats` + primer mensaje. Dock en take: `take-ask` abre/continúa chat ligado. |
| A30 | Empty state sin contaminar DB | **shipped** | `homeEmptySeed` / `homeDemoSample` (solo UI). Producción Compose no pasa `seed: true`. |
| A31 | Consentimiento / práctica vs real (**RF04**) | **partial** | `PRACTICE_FOOTER` (`public/copy.mjs`) en shell, login, sitio. Modales y `demo-note` duplican. Páginas `/alcance`, `/privacidad` (`scripts/build-site.mjs`). No hay consentimiento versionado ni texto de *qué se envía a OpenAI* en el flujo de chat (sí en README/alcance). |
| A32 | Español rioplatense, sin urgencia de operar (§9.3) | **shipped** | Copy Suizo en `copy.mjs`, prompts, site. Tests `test/copy-banned.test.mjs`. |
| A33 | 360 px + no solo color + a11y (§9.3, §17.4) | **partial** | Browser/site tests 390/360. Status marks con texto. Sin auditoría WCAG 2.2 AA. |

### 3.5 Plataforma E0 (demo personal)

| ID | Capacidad PRD | Estado | Código / UI |
|----|---------------|--------|-------------|
| A34 | Persistencia SQLite WAL; survives restart | **shipped** | `lib/store.mjs` (`takes`, `chats`, `versions`, `reviews`, `jobs`, `quote_cache`, …). |
| A35 | Acceso acotado, CSRF/origen, cuotas, secretos en servidor (E0 §18) | **shipped** | Login cookie `laviste_session`; Origin / `Sec-Fetch-Site`; vault AES-256-GCM (`lib/vault.mjs`); cuotas `consumption`; un `aiBusy` global. Un password compartido (no RF01). |
| A36 | Exportar datos (**RF32** parte export) | **partial** | `GET /api/export` + UI Configuración. **No** hay eliminar cuenta/datos ni plazos de retención en producto. |
| A37 | Backup operativo | **partial** | `scripts/backup.mjs`, servicio Compose, README restore. No hay restore desde la UI ni ensayo automatizado de restauración en CI. |
| A38 | Instrucciones del agente editables (ops; no RF) | **shipped** | `/app#/admin/agente`, `/api/admin/agent-prompt*` (`lib/agent-prompt.mjs`, `public/admin-agent.mjs`). |
| A39 | Sitio público de alcance e identidad | **shipped** | `/`, `/como-funciona`, `/acerca`, `/privacidad`, `/alcance`. SPA privada `/app`. |
| A40 | Comparación vs índice (no TWR) | **partial** | `lib/benchmark.mjs` + serie `index` en history/chart. Método: capital aportado / índice de práctica — **no** TWR (§13.3). |

### 3.6 Conteos Entrega A

| Estado | Cantidad | IDs |
|--------|----------|-----|
| **shipped** | **23** | A1, A4, A6, A9, A10, A11, A17, A18, A19, A20, A21, A24, A25, A26, A27, A28, A29, A30, A32, A34, A35, A38, A39 |
| **partial** | **16** | A2, A3, A5, A7, A12, A13, A14, A15, A16, A22, A23, A31, A33, A36, A37, A40 |
| **missing** | **1** | A8 |
| **Total** | **40** | |

Lectura: el ciclo manual **corre de punta a punta**. Los huecos de Entrega A son sobre todo *calidad de modelo de tesis*, *libro/versiones*, *cobertura nombrada* y *reintento de chat* — no la ausencia del producto.

---

## 4. Recorrido Entrega A (mapa rápido)

```
#/new  →  POST /api/chats + /messages  →  #/chat/:id (proposal card)
                                              ├─ Ajustar (adjusting)
                                              └─ Activar práctica
                                                    POST /api/takes {sourceChatId}
                                                    POST /api/takes/:id/activate
                                                         ↓
                                              #/take/:id/news  (timeline + cobertura + rebalance CTA)
                                              #/take/:id/positions
                                              #/take/:id/idea
                                              #/take/:id/settings  (cadence, pause, cap, drift, archive)
                                              POST .../review  |  scheduler tick
                                              POST .../rebalance  (manual)
#/            home observatorio
#/activity    movimientos de hoy (ART)
#/settings    OpenAI, export, logout
```

---

## 5. PARK (fuera de Entrega A)

No implementar en las fases inmediatas del núcleo manual. El código legado que exista se deja **dormido** o de solo lectura.

### 5.1 Entrega B

Siguiente *slice* de producto (piloto / E1 restante), **no** parte de este audit ni de Entrega A:

- Identidad individual y aislamiento (**RF01**, **RF05**)
- Perfil estructurado: horizonte/objetivo/liquidez/experiencia como datos (**RF02**)
- Consolidación de exposición entre tesis (**RF18**)
- Notificaciones por canal, horario, deduplicación (**RF25**)
- Aceleración temporal de frecuencia al pasar a «vigilando» (**RF27**)
- Eliminar datos y política de retención completa (**RF32** resto)
- Memoria de tesis más allá de 24 mensajes; idea persistible sin cartera (cierre de A5/A7 si se trata como B)
- Instrumentación de métricas de producto (§23) y experimentos E01–E07
- Cuotas/planes comerciales (**RF33**, E2)

### 5.2 Automático (auto mode)

PRD: permiso **ejecutar** / piloto automático como etapa **independiente** (E5, §14.6, decisión 1.3).

- `settings.mode` distinto de `'ask'` — **rechazado** en `updateSettings` y hardcodeado en UI
- Autopilot, mandato, rotación máxima, corte operativo
- Rebalanceo o compras **sin** confirmación explícita
- Cadencia `vigilant` como “siempre mirando / operando” (el motor tiene 1 h en `nextCheck`; no es un modo automático)

### 5.3 Integraciones de broker

Consulta y ejecución **no** forman el núcleo manual. Código actual:

| Broker | Código | Exposición |
|--------|--------|------------|
| **IOL** | `lib/iol.mjs`, rutas `/api/integrations/iol`, `/api/brokers/iol/*` | **Dormido** salvo `FEATURE_IOL` (`lib/features.mjs`). Read-only; no mezcla con práctica. Tests: `test/iol-feature.test.mjs`. |
| **Roxom** | `lib/roxom.mjs` | Solo librería + `test/integrations.test.mjs`. **Sin** rutas ni UI (README: adaptador histórico). |
| Órdenes / conciliación | **RF29–RF31**, §14.5 | **missing** (park). |

Tampoco: catálogo operable de broker, reconciliación de saldos, One-Click Trade, Mercado Pago.

### 5.4 TWR / fiscal

PRD §13.3–13.5 y §25.4.

- Rentabilidad ponderada por tiempo (TWR) y money-weighted
- Libro fiscal, impuestos, inflación, tipo de cambio documentado para “ganarle al mercado”
- Comisiones, dividendos, splits, costos de ejecución
- Backtest histórico de la canasta actual (§13.4 — explícitamente fuera de E0)

El chart actual (`portfolioSeries` / `portfolioSeriesARS`) es **variación sobre capital aportado**; un depósito no cuenta como ganancia. Eso **no** es TWR.

### 5.5 Otras partidas PRD a estacionar

Del plan §25.4, etapas E2–E5 y RF restantes:

| Tema | PRD |
|------|-----|
| Servicio comercial / suscripción / cobro | E2, §21 |
| Ejecución asistida de órdenes | E3 |
| Distribución institucional, roles, auditoría de socios | E4, **RF35** |
| Compartir tesis / enlace público | **RF34** |
| Multiusuario, PostgreSQL, 1.000 usuarios, SLA | §16–17 |
| IA local / modelo propio | §15.7 |
| App nativa, red social, ranking de rentabilidad, marketplace | §25.4 |
| Derivados complejos, apalancamiento | §3.2 |
| Encuadre CNV / asesoramiento como producto ofrecido | §19 (el MVP personal se rotula práctica; no cierra el análisis legal) |

---

## 6. Inventario P0 vs tip (desactualizado)

`docs/P0-INVENTORY.md` describe el repo **antes** de P0/P1/P1.1/P2. No reescribirlo aquí; para el audit, estas filas del inventario **ya no aplican**:

| Inventario (2026-10-05) | Tip `dfe0aff` |
|-------------------------|---------------|
| Guardar como borrador + Activar en dos metáforas | Solo **Activar práctica** / **Ajustar** en el chat |
| Rebalance «none executed» | `POST /api/takes/:id/rebalance` + UI |
| Precios solo catálogo ficticio | Cotizaciones demoradas + fallback demo |
| Home sin pills ni movimientos del día | `home()` + `#/activity` |
| Timeline no unificada | `lib/timeline.mjs` en Novedades |
| CI no despliega | README: push a `main` sí dispara CD en runner propio |

---

## 7. Fases siguientes (punteros; no implementar)

Derivadas de **huecos Entrega A**, no de PARK.

| Fase | Puntero | Huecos que ataca |
|------|---------|------------------|
| **1** | Cerrar el único *missing* y los partials de conversación | A8 reintento de mensaje; A2/A3 captura estructurada mínima (horizonte/invalidación/contra) **sin** inflar el schema a Entrega B; A5 idea no invertible persistible. |
| **2** | Libro y versiones del núcleo manual | A14 events → movimientos nombrados (activate/rebalance ya existen); A15 incluir holdings en snapshot; A16 copy que archive ≠ liquidar. |
| **3** | Seguimiento honesto | A22/A23: cobertura `updated` vs `partial`; criterio de salida de watch; exponer `nextCheckAt` con más claridad; no introducir TWR ni notificaciones. |
| **4** | Endurecer Entrega A | A31 un solo disclaimer in-app; A33 a11y en flujos; A36/A37 export+backup como “definición de terminado” E0; set de evals de IA (§24.3) sobre el contrato actual. |

Entrega B, automático, brokers y TWR/fiscal **siguen en PARK** después de estas fases.

---

## 8. Límites de este documento

- No se ejecutó la app ni se redeployó. El mapeo es lectura de código + tests en el tip citado.
- El §7 del PRD (“estado del PoC”) está **históricamente correcto** y **operativamente obsoleto**; usar esta matriz para el estado 2026-10-07.
- “Shipped” no implica autorización comercial, CNV, ni datos licenciados de noticias más allá de web_search de OpenAI.
