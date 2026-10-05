# Tesis

## Documento de requisitos de producto

**Versión 1.0 · 5 de octubre de 2026 · Estado: propuesta de producto para revisar y construir.**

Tesis convierte una idea sobre el mundo en una hipótesis de inversión explícita, una cartera comprensible y un seguimiento que explica qué cambió y por qué importa. Su público inicial son personas de Argentina que están entre empezar a invertir y tener una primera cartera, y necesitan criterio, contexto y continuidad.

Este PRD reúne lo conversado, las capturas aportadas de Supertake, el PoC construido y la documentación pública consultada. Define la visión, los requisitos, las etapas, las pruebas y las decisiones pendientes. Es una base de trabajo para producto, diseño, ingeniería y potenciales socios; no prueba demanda, rentabilidad ni autorización para ofrecer el servicio.

**La recomendación de producto es validar primero el ciclo completo de conversación, cartera de práctica y seguimiento.** OpenAI será el proveedor inicial de inferencia; la Raspberry Pi 5 de 8 GB alojará la demostración personal. El diseño deberá permitir varios brokers, pero la primera validación no depende de operar dinero real. La propuesta comercial inicial es suscripción, con una posible evolución hacia distribución mediante brokers o fintechs.

### Cómo interpretar este documento

| Etiqueta | Significado |
|---|---|
| Decisión del usuario | Preferencia expresada en la conversación. |
| Implementado | Existe en el código del PoC revisado; puede requerir configuración. |
| Observado | Visible en capturas o recorridos anteriores de Supertake; no demuestra su arquitectura interna. |
| Propuesto | Requisito o decisión recomendada en este PRD; todavía no aprobada ni necesariamente implementada. |
| Hipótesis | Supuesto comercial o de comportamiento que requiere evidencia. |
| Pendiente de verificación | Depende de credenciales, contrato, asesoramiento especializado o prueba en el entorno de destino. |

Los requisitos futuros se escriben en términos de lo que el producto debe hacer. No deben leerse como una descripción de las capacidades actuales. Los objetivos numéricos son metas propuestas para experimentar, salvo indicación expresa.

### Índice

- [1 Resumen ejecutivo y decisiones](#1-resumen-ejecutivo-y-decisiones)
- [2 Problema y oportunidad](#2-problema-y-oportunidad)
- [3 Usuarios y trabajos a resolver](#3-usuarios-y-trabajos-a-resolver)
- [4 Referencia de Supertake](#4-referencia-de-supertake)
- [5 Propuesta de valor y principios](#5-propuesta-de-valor-y-principios)
- [6 Alcance por etapa](#6-alcance-por-etapa)
- [7 Estado real del PoC](#7-estado-real-del-poc)
- [8 Modelo de la tesis](#8-modelo-de-la-tesis)
- [9 Experiencia y navegación](#9-experiencia-y-navegación)
- [10 Requisitos funcionales](#10-requisitos-funcionales)
- [11 Motor de seguimiento](#11-motor-de-seguimiento)
- [12 Noticias y evidencia](#12-noticias-y-evidencia)
- [13 Carteras y medición](#13-carteras-y-medición)
- [14 Brokers y ejecución](#14-brokers-y-ejecución)
- [15 Arquitectura e inteligencia artificial](#15-arquitectura-e-inteligencia-artificial)
- [16 Datos y contratos](#16-datos-y-contratos)
- [17 Infraestructura y capacidad](#17-infraestructura-y-capacidad)
- [18 Seguridad y privacidad](#18-seguridad-y-privacidad)
- [19 Encuadre del servicio](#19-encuadre-del-servicio)
- [20 Mercado y posicionamiento](#20-mercado-y-posicionamiento)
- [21 Modelo de negocio y costos](#21-modelo-de-negocio-y-costos)
- [22 Distribución y oportunidad empresarial](#22-distribución-y-oportunidad-empresarial)
- [23 Métricas y experimentos](#23-métricas-y-experimentos)
- [24 Calidad y criterios de aceptación](#24-calidad-y-criterios-de-aceptación)
- [25 Plan de entrega](#25-plan-de-entrega)
- [26 Riesgos y decisiones abiertas](#26-riesgos-y-decisiones-abiertas)
- [27 Demostración y ejemplos](#27-demostración-y-ejemplos)
- [28 Fuentes y trazabilidad](#28-fuentes-y-trazabilidad)

## 1 Resumen ejecutivo y decisiones

### 1.1 Qué se quiere construir

Una aplicación donde una persona pueda decir «creo que va a pasar esto», conversar para precisar su idea, entender qué negocios podrían estar expuestos, construir una cartera de práctica y recibir seguimiento contextual. Con integraciones y condiciones adicionales, esa misma experiencia podrá conectarse con una cuenta de inversión.

La unidad central es la **tesis**, no el mensaje ni el ticker. Una tesis conserva el razonamiento, sus límites, la cartera asociada, las condiciones de revisión y la evidencia acumulada. El usuario debe poder volver meses después y entender qué creía, qué ocurrió y por qué cambió o mantuvo el plan.

### 1.2 Decisiones ya expresadas

| Tema | Decisión o intención |
|---|---|
| Público | Principiantes e inversores iniciales; democratizar el acceso a invertir y comprender una cartera. |
| Referencia | Reproducir el flujo y las capacidades relevantes de Supertake como punto de partida. Tesis tendrá identidad propia. |
| Primera infraestructura | Raspberry Pi 5 con 8 GB para demo o PoC personal. |
| IA inicial | Conectar OpenAI desde el comienzo. |
| IA propia o local | Interés exploratorio; no reemplaza la elección inicial de OpenAI. |
| Brokers | Considerar IOL y Roxom; posibilidad de convivir, sin exclusividad decidida. |
| Seguimiento | Incluir novedades vinculadas con la tesis y estados como «mirando de cerca». |
| Gratuito | Más limitado que el uso de demostración una vez lanzado el producto. |
| Ambición | Explorar una empresa propia y una posible oferta para brokers o fintechs. |

### 1.3 Decisiones propuestas

- Priorizar la comprensión del usuario y la calidad del seguimiento antes de conectar órdenes reales.
- Mantener una separación visible entre simulación, datos reales de consulta y ejecución real.
- Usar un motor de reglas para cantidades, límites y permisos; reservar al modelo la conversación, síntesis e interpretación.
- Admitir que una idea puede no tener una expresión invertible adecuada.
- Empezar con un universo acotado, verificable y sin apalancamiento para el segmento inicial.
- No cobrar en función de cuántas veces opera la persona como modelo inicial.
- Construir conectores por capacidad, para que una limitación de un broker no determine todo el producto.
- Tratar el piloto automático como una etapa posterior e independiente.

### 1.4 Qué demostraría valor

Que alguien pueda formular una tesis con menos confusión, entender la relación entre sus activos y esa tesis, y volver por un seguimiento útil. Un prototipo visualmente parecido a Supertake demuestra capacidad de implementación. Para demostrar producto hacen falta usuarios que comprendan, regresen y eventualmente paguen o un socio que contrate un piloto.

## 2 Problema y oportunidad

### 2.1 Problema principal

La experiencia que Tesis intenta resolver comienza antes de una orden. La persona tiene una intuición —sobre tecnología, energía, consumo o geopolítica—, pero le cuesta convertirla en criterios concretos. Una lista de activos no resuelve qué está comprando, cuánto depende de una misma variable ni qué evidencia haría cambiar de opinión.

Después de comprar, aparece otro problema: las noticias llegan desordenadas y la variación de precio se confunde con la validez de la idea. El usuario puede reaccionar de más a un movimiento o ignorar un cambio importante del negocio. Tesis propone conservar el contexto inicial para comparar las novedades contra él.

Estos problemas son hipótesis surgidas de la conversación y de la referencia analizada. Deben comprobarse mediante entrevistas y uso; no se dispone todavía de investigación representativa del mercado argentino.

### 2.2 Barreras que se busca reducir

| Barrera | Respuesta propuesta |
|---|---|
| No saber por dónde empezar | Conversación guiada y ejemplos sin exigir conocer tickers. |
| No entender un instrumento | Explicación breve de qué es, cómo se vincula con la idea y qué riesgos introduce. |
| Confundir narrativa con negocio | Cadena causal explícita y contraargumentos. |
| No conocer el monto necesario | Simulación con unidades, lotes, costos y efectivo disponible. |
| Sentir que hay que mirar todo el día | Revisiones programadas y avisos por relevancia. |
| No recordar el motivo de una posición | Razonamiento persistente por posición y versión de tesis. |
| Tener información fragmentada | Novedades, cartera y decisiones en un mismo lugar. |

### 2.3 Límites de la promesa

Tesis no debe prometer acertar el mercado, eliminar pérdidas, encontrar siempre una inversión o convertir noticias en señales fiables de compra. Democratizar significa reducir barreras de comprensión y acceso, incluyendo poder decidir no invertir en una idea determinada.

## 3 Usuarios y trabajos a resolver

### 3.1 Segmentos iniciales

**Persona que empieza.** Tiene ahorros disponibles para explorar, pero no entiende bien los instrumentos. Necesita un recorrido corto, lenguaje familiar y ayuda para distinguir una práctica de una inversión real. El éxito es comprender el plan y sus límites, no completar muchas operaciones.

**Inversor inicial con cuenta.** Ya usó un broker o compró algunos activos, pero le falta una visión coherente. Necesita entender exposición, diversificación, cambios y noticias relevantes. Es candidato al futuro modo de consulta de cartera real.

**Usuario con ideas temáticas.** Sigue tecnología, política o industrias y quiere expresar una hipótesis. Puede tener conocimientos de un tema sin conocimientos financieros equivalentes. Es un buen segmento para probar el flujo conversacional, pero no debe sesgar todo el producto hacia carteras temáticas complejas.

**Socio institucional futuro.** Un broker, fintech o equipo de asesores que busca mejorar activación, comprensión y seguimiento. Tiene necesidades de trazabilidad, identidad, límites y soporte que no existen en una demo personal.

### 3.2 Fuera del foco inicial

Operadores de alta frecuencia, trading intradiario, estrategias apalancadas, derivados complejos, tesorerías institucionales y gestión patrimonial integral. Tampoco se propone una red social de señales como punto de entrada.

### 3.3 Trabajos a resolver

| Situación | Trabajo del usuario | Resultado observable |
|---|---|---|
| Tengo una idea | Convertirla en una hipótesis concreta | Puede explicar qué espera que pase y en qué plazo. |
| Quiero explorar una cartera | Entender cómo podría expresarse esa idea | Puede justificar las posiciones y reconocer los vínculos indirectos. |
| Tengo poco capital para esa composición | Evaluar si es viable | Ve alternativas o un rechazo explicado; no una cartera imposible. |
| Apareció una noticia | Entender si afecta mi razonamiento | Distingue hechos, interpretación y dudas. |
| El precio cayó | Decidir si hace falta revisar | Ve la causa del estado y no recibe una venta automática por defecto. |
| Cambió mi idea | Actualizar el plan sin borrar el pasado | Puede comparar versiones y consecuencias. |
| No quiero estar pendiente | Delegar observación dentro de límites | Conoce última revisión, próxima revisión y cobertura. |

## 4 Referencia de Supertake

### 4.1 Lo observado

Las capturas muestran conversación que precisa una idea geopolítica y la transforma en una estrategia; separación entre chats, borradores y takes activas; posiciones agrupadas en categorías; explicación por activo; pesos y efectivo; reglas de seguimiento; práctica y conexión a brokerage; visibilidad pública o privada; y actividad narrativa sobre novedades.

También se observan dos controles separados: autonomía de ejecución —«Autopilot» o «Ask me first»— y frecuencia —«Patient», «Standard», «Vigilant»—. Otra evidencia aportada por el usuario describe el paso a un estado de mayor atención. Esto inspira separar estado, frecuencia y permiso en Tesis.

En una captura, el gráfico previo a la activación se describe como una simulación histórica con los pesos actuales. Ese gráfico no demuestra el rendimiento de decisiones históricas del agente. Otra captura muestra el resultado desde la activación. Tesis debe conservar esta distinción.

### 4.2 Lo que no sabemos

Las capturas no permiten conocer el proveedor de modelos de Supertake, sus prompts, infraestructura, frecuencia real de cada proceso, fuentes y licencias de noticias, costos, contratos de brokers, reglas completas de autopiloto ni modelo de ingresos. La indicación «Free beta» no prueba que el negocio final sea suscripción o comisión.

No se pudo recuperar la portada de Supertake durante la consulta web de esta edición. La referencia de producto se basa en el material aportado y en observaciones previas de esta conversación, no en una auditoría técnica o contractual.

### 4.3 Qué trasladar y qué adaptar

| Referencia | Adaptación en Tesis |
|---|---|
| Conversación sobre una opinión | Conversación en español rioplatense con hipótesis y contraargumentos. |
| Canasta vinculada con una idea | Universo habilitado por el proveedor y restricciones del usuario. |
| Monitoreo persistente | Evidencia, reglas, cobertura y registro de revisiones. |
| Narrativa de novedades | Resumen con fuentes y explicación de impacto concreto. |
| Estado de mayor atención | Motivo, entrada, salida y próxima revisión visibles. |
| Activación de cartera | Práctica primero; ejecución real como flujo independiente. |
| Enlace público | Posterior, voluntario y sin revelar saldos ni cuenta. |
| Clasificación de resultados | Diferida: evitar incentivar riesgo o comparar períodos incompatibles. |

## 5 Propuesta de valor y principios

**Propuesta de valor:** «Convertí una idea en un plan de inversión que puedas entender y seguir».

El diferencial buscado está en la continuidad entre idea, instrumentos, evidencia y decisiones. Usar un modelo externo no impide construir un producto propio. Si Tesis solo envía un prompt y muestra texto, su diferenciación será débil. Si conserva un modelo de la tesis, valida carteras, organiza evidencia y mantiene un seguimiento confiable, el valor existe fuera del proveedor de IA.

### 5.1 Principios de producto

1. **Comprensión antes que conversión.** El usuario debe poder explicar lo que está activando.
2. **Evidencia antes que relato.** Una historia convincente necesita mecanismos y hechos verificables.
3. **Precio y tesis son señales distintas.** Una caída puede justificar atención sin invalidar la idea.
4. **No actuar es un resultado válido.** Las revisiones no necesitan producir operaciones.
5. **La autonomía es explícita.** Observar, proponer y ejecutar son permisos diferentes.
6. **La incertidumbre se muestra.** No se convierte una falta de datos en tranquilidad artificial.
7. **La cuenta permanece en el proveedor.** La propuesta inicial no incluye custodia propia ni retiros.
8. **La simplicidad no oculta consecuencias.** Cantidades, costos, moneda y tipo de producto deben ser visibles cuando importan.
9. **Los límites se aplican en código.** Un archivo de instrucciones del agente no reemplaza controles.
10. **La privacidad es el valor inicial.** Compartir una tesis será optativo y revocable.

## 6 Alcance por etapa

Las etapas definen entregables verificables. No son fechas comprometidas ni autorización para activar capacidades adicionales.

| Etapa | Propósito | Incluye | No incluye |
|---|---|---|---|
| E0 PoC personal | Mostrar el ciclo básico | Plantillas, chat configurado, práctica, escenarios, persistencia, Pi | Servicio multiusuario, noticias reales, órdenes reales |
| E1 Piloto privado | Validar valor con usuarios invitados | Identidad, datos verificables, seguimiento real, evidencia, métricas, operación de soporte | Ejecución autónoma, exposición pública masiva |
| E2 Servicio comercial inicial | Cobrar por seguimiento que funciona | Suscripción, límites de plan, fuentes contratadas, controles operativos, soporte, posible consulta de broker | Asumir que cualquier conector permite operar |
| E3 Ejecución asistida | Convertir propuestas aprobadas en órdenes | Un proveedor validado, permisos, reconciliación, costos, confirmación | Autopiloto general y trading complejo |
| E4 Distribución institucional | Ofrecer Tesis mediante socios | Integración de identidad, administración, auditoría, acuerdos de servicio | Instalación idéntica de la PoC personal |
| E5 Autonomía acotada | Evaluar ejecución bajo mandato específico | Políticas, límites, revocación, supervisión y encuadre aprobados | Discreción ilimitada de un modelo |

La consulta de broker puede anticiparse como experimento técnico dentro de E0 o E1, siempre que no se confunda con una cartera integrada, reconciliada y operable.

## 7 Estado real del PoC

### 7.1 Base construida

El proyecto local se llama `tesis-poc`, versión `0.1.0`. Usa Node.js, HTML, CSS y JavaScript, con SQLite en el servidor y sin dependencias npm de producción. Hay Dockerfile y Compose preparados para despliegue. El servidor local fue detenido a pedido del usuario; redactar este PRD no lo vuelve a iniciar.

| Capacidad | Estado verificado en el código | Límite |
|---|---|---|
| Inicio y navegación | Implementado | Aplicación personal, sin espacios por usuario. |
| Conversaciones | Implementado con OpenAI Responses y salida estructurada | Requiere clave; no se verificó una respuesta real con credenciales en la entrega. |
| Plantillas | Tres propuestas de ejemplo | Historias e instrumentos de demostración. |
| Creación de borrador | Validación del servidor | Catálogo fijo de 16 referencias; no catálogo de broker. |
| Activación de práctica | Cantidades enteras y remanente de efectivo | Precios ficticios en ARS; sin gastos ni eventos corporativos. |
| Seguimiento | Reglas periódicas y escenarios | No incorpora noticias ni precios reales; no llama al modelo. |
| Estados | Seguimiento, observación y revisión | Los escenarios fuerzan parte de las transiciones. |
| Edición de idea | Permite actualizar tesis e invalidación | Sobrescribe texto; no tiene historial de versiones. |
| Preferencias | Cadencia, concentración, desvío y pausa de propuestas | Solo modo de consulta antes de actuar. |
| Persistencia | SQLite con WAL | Registros JSON; sin aislamiento multiusuario. |
| Protección de acceso | Contraseña cuando se expone en red y sesiones | Contraseña compartida; no identidad comercial. |
| Exportación | JSON de takes y chats | No hay importador ni recuperación desde la interfaz. |
| Roxom | Consulta de catálogo y saldos firmada | No probada con credenciales; no órdenes ni posiciones integradas. |
| IOL | No implementado | Integración futura. |
| Evaluación | Entrega anterior registra 12 pruebas aprobadas y recorrido de navegador | Sin validación Docker ARM64 ni prueba de carga de 1.000 usuarios. |

### 7.2 Límites de la implementación actual

Cada propuesta admite de 2 a 10 posiciones, peso individual mayor que cero y de hasta 25%, y una inversión agregada de 30% a 95%; el resto es efectivo. La activación acepta de ARS 100.000 a ARS 100.000.000 de práctica y exige al menos una unidad de cada posición. Esos montos son límites técnicos de la demo, no mínimos de mercado ni una decisión comercial para democratizar el acceso.

Las cadencias actuales son siete días, veinticuatro horas y una hora. Un temporizador revisa vencimientos cada minuto. No hay escucha continua de noticias ni aceleración automática por cambios de estado. Después de una interrupción, procesa una revisión vencida y calcula la próxima; no reconstruye todas las revisiones omitidas.

Hay un máximo de 100 takes y 200 chats en toda la instalación. Cada conversación admite hasta 100 mensajes persistidos y cada mensaje de usuario hasta 4.000 caracteres. Al modelo se envían los últimos 24 mensajes más un contexto limitado de la take. La aplicación permite una sola respuesta de IA en curso para toda la instalación y, por defecto, 30 intentos diarios. Esto es una protección del PoC, no una arquitectura para 1.000 usuarios.

### 7.3 Brechas de producto detectadas

- Se puede configurar una concentración inferior al peso objetivo existente sin resolver esa incompatibilidad. El próximo producto debe validar políticas y propuesta conjuntamente.
- Editar una tesis activa no conserva versiones; falta impedir que el pasado parezca haber seguido siempre la idea nueva.
- La pausa actual afecta el mensaje sobre propuestas, pero no detiene el temporizador de revisión. La interfaz futura deberá nombrar exactamente qué se pausa.
- El estado de recuperación proviene de un escenario; no existe un evaluador real de evidencia suficiente para salir de observación.
- El gráfico agregado evita tratar nuevas activaciones como beneficio, pero no implementa rentabilidad ponderada por tiempo ni una contabilidad completa de aportes y retiros.
- Un prompt solicita horizonte, liquidez y tolerancia a caídas, pero esos campos no constituyen hoy un perfil estructurado obligatorio.
- Los errores de proveedor no tienen todavía una recuperación conversacional sofisticada ni cola por usuario.

Estas brechas no bloquean una demostración identificada como tal. Sí delimitan lo que falta para un piloto con usuarios y datos reales.

## 8 Modelo de la tesis

### 8.1 Definición

Una tesis es un objeto persistente y versionado que vincula una hipótesis con una posible exposición financiera y sus condiciones de seguimiento. «Take» es el nombre usado por la referencia; en la interfaz de Tesis se propone usar «tesis» y «cartera» según corresponda.

### 8.2 Contenido mínimo propuesto

| Campo | Pregunta que responde |
|---|---|
| Título y resumen | ¿Qué idea estamos explorando? |
| Hipótesis | ¿Qué cambio esperamos observar? |
| Mecanismo | ¿Cómo pasa ese cambio a afectar negocios o flujos económicos? |
| Horizonte | ¿En qué plazo debería materializarse? |
| Supuestos | ¿Qué cosas deben seguir siendo ciertas? |
| Evidencia a favor y en contra | ¿Qué sabemos y qué no? |
| Invalidación | ¿Qué hechos concretos harían revisar o abandonar la idea? |
| Catalizadores y observables | ¿Qué hitos vamos a mirar? |
| Universo permitido | ¿Qué se puede considerar para este usuario y proveedor? |
| Cartera objetivo | ¿Qué exposición representa la idea y con qué pesos? |
| Vínculo por posición | ¿Es exposición directa, indirecta o una aproximación? |
| Límites | ¿Cuánto riesgo de concentración, liquidez y costo se acepta? |
| Seguimiento | ¿Con qué frecuencia y cobertura se revisa? |
| Permisos | ¿Puede observar, proponer o ejecutar? |
| Historial | ¿Qué cambió, cuándo, por quién y por qué? |

### 8.3 Una tesis no equivale a toda la cartera personal

El usuario puede tener varias tesis con posiciones repetidas. La suma debe mostrar exposición consolidada por emisor, sector, país, moneda y factores disponibles. Dos tesis diferentes pueden representar esencialmente la misma apuesta.

Debe distinguirse capital asignado a una tesis, tenencia efectiva en el broker y asignación virtual de una misma tenencia entre tesis. La asignación virtual no crea activos ni duplica el saldo. Para E1 se recomienda un libro de práctica independiente por tesis y consolidación de exposición; la asignación de posiciones reales entre varias tesis exige un modelo posterior explícito.

### 8.4 Versionado

Cambiar pesos, invalidaciones o razonamiento material genera una nueva versión con autor y motivo. Una propuesta referencia la versión que la originó. La aprobación pierde validez si cambia materialmente el plan, el precio permitido o la cuenta. La aplicación conserva la versión anterior para explicar decisiones y medir resultados sin reescribir el historial.

## 9 Experiencia y navegación

### 9.1 Recorrido principal

**Idea → conversación → hipótesis revisable → propuesta → práctica → seguimiento → decisión informada.**

1. El usuario escribe una idea o elige un ejemplo.
2. Tesis pregunta lo necesario, identifica supuestos y plantea una objeción relevante.
3. Explica qué partes son observables y cuáles especulativas.
4. Si el usuario pide una cartera, propone una composición viable dentro del universo permitido.
5. Muestra posiciones, pesos, efectivo, mecanismos y límites antes de activar.
6. El usuario activa una práctica con un monto elegido.
7. La pantalla indica qué se está siguiendo, última revisión y próxima revisión.
8. Una novedad puede generar información, observación o una propuesta de cambio.
9. El usuario conversa sobre esa novedad y decide mantener, modificar o archivar la tesis.

### 9.2 Estructura de pantallas

| Pantalla | Contenido principal | Acción principal |
|---|---|---|
| Inicio | Tesis activas, estado, evolución, novedades relevantes | Crear una tesis o abrir una que requiere revisión. |
| Nueva tesis | Entrada libre, ejemplos y preguntas progresivas | Conversar. |
| Conversación | Contexto, respuestas, fuentes y propuesta asociada | Revisar propuesta. |
| Borrador | Idea, posiciones, pesos, efectivo y condiciones | Activar práctica. |
| Tesis activa | Resumen, estado, resultado, última y próxima revisión | Entender novedades o revisar plan. |
| Novedades | Eventos con relación a la tesis y evidencia | Abrir detalle o conversar sobre un evento. |
| Posiciones | Objetivo, tenencia, desvío, moneda, explicación | Comprender exposición. |
| La idea | Hipótesis, supuestos, invalidación y versiones | Proponer una revisión de tesis. |
| Preferencias | Frecuencia, límites, notificaciones y permisos | Guardar política coherente. |
| Conexiones | Proveedor, entorno, permisos y actualización | Conectar o revocar acceso. |
| Cuenta y plan | Uso, suscripción, privacidad y exportación | Administrar acceso y datos. |

### 9.3 Reglas de lenguaje y diseño

Usar español rioplatense claro, sin infantilizar. Explicar «CEDEAR», «desvío», «liquidez» o «rebalanceo» en el contexto donde aparecen. Evitar tono de gurú, urgencia artificial, felicitaciones por asumir riesgo y afirmaciones de certeza sobre el futuro.

La información técnica de proveedores y modelos vive en configuración o diagnóstico. Las decisiones del usuario se expresan como «qué estás explorando», «qué cambió», «qué falta comprobar» y «qué podés hacer».

La interfaz debe funcionar desde 360 px de ancho, con teclado y lectores de pantalla. Estados y rendimientos no deben depender solo del color. Los gráficos necesitan resumen textual, moneda, período y método. Animaciones y avisos no deben dificultar la lectura ni estimular operar.

### 9.4 Estados vacíos y errores

Sin clave de IA: mostrar el motivo y permitir explorar plantillas identificadas. Sin datos recientes: mostrar la última fecha fiable y el estado de cobertura. Sin instrumentos adecuados: explicar la imposibilidad y conservar la tesis como idea. Sin capital suficiente: mostrar el faltante y alternativas de simplificación. Ante error de broker: conservar el último estado conocido con su antigüedad, sin inferir que una orden falló o se ejecutó.

## 10 Requisitos funcionales

**Prioridad P0:** indispensable para la etapa indicada. **P1:** importante después de cubrir P0. **P2:** posterior o experimental. La prioridad se aplica dentro de la etapa y no convierte un requisito de E3 en trabajo inmediato de E0.

### 10.1 Identidad y contexto del usuario

| ID | Etapa y prioridad | Requisito | Criterio de aceptación |
|---|---|---|---|
| RF01 | E1 P0 | Cuenta individual y aislamiento | Un usuario no puede leer ni modificar recursos de otro, aun con su identificador. |
| RF02 | E1 P0 | Contexto estructurado | Registrar horizonte, objetivo, moneda, liquidez y experiencia; indicar campos faltantes. |
| RF03 | E1 P0 | Experiencia inicial progresiva | Se puede explorar sin conectar un broker ni transferir dinero. |
| RF04 | E1 P0 | Alcance y consentimiento | El usuario entiende qué datos se envían a la IA y distingue práctica de cuenta real. |
| RF05 | E2 P1 | Cambios de perfil | Una modificación material pide revisar planes incompatibles y conserva el historial. |

### 10.2 Conversación y construcción de propuesta

| ID | Etapa y prioridad | Requisito | Criterio de aceptación |
|---|---|---|---|
| RF06 | E0 P0 | Chat con proveedor real | Sin configuración no simula una respuesta del modelo. |
| RF07 | E1 P0 | Clarificar una idea | Antes de proponer hay hipótesis, horizonte e invalidación explícitos. |
| RF08 | E1 P0 | Contrastar la hipótesis | La propuesta incluye al menos un contraargumento material y una incertidumbre. |
| RF09 | E1 P0 | Respetar el catálogo | El servidor rechaza instrumentos no habilitados, duplicados o mal identificados. |
| RF10 | E1 P0 | Aceptar una conclusión no invertible | Guarda la idea y explica por qué no genera cartera sin inventar sustitutos. |
| RF11 | E1 P0 | Separar propuesta y activación | Conversar o aceptar una explicación no activa práctica ni orden real. |
| RF12 | E1 P1 | Memoria útil | Al retomar, conserva supuestos y decisiones relevantes sin depender solo de los últimos mensajes. |
| RF13 | E1 P1 | Guardar borrador del mensaje fallido | El usuario puede reintentar sin perder su texto ni duplicar efectos. |

### 10.3 Cartera y práctica

| ID | Etapa y prioridad | Requisito | Criterio de aceptación |
|---|---|---|---|
| RF14 | E0 P0 | Activación de práctica | Capital asignado equivale a posiciones más efectivo dentro de la precisión definida. |
| RF15 | E1 P0 | Compatibilidad de política | Ningún objetivo viola concentración, universo, monto mínimo o restricciones elegidas. |
| RF16 | E1 P0 | Exposición explicada | Cada posición tiene mecanismo, grado de vínculo y principal riesgo. |
| RF17 | E1 P0 | Libro de movimientos | Aportes, retiros y operaciones quedan registrados; no se confunden con rendimiento. |
| RF18 | E1 P1 | Consolidación | Una posición repetida aparece una sola vez en el total económico, sumando su exposición. |
| RF19 | E1 P0 | Versiones | Una edición material genera una versión nueva y preserva los eventos anteriores. |
| RF20 | E1 P1 | Archivo y salida | Archivar seguimiento no liquida tenencias; cerrar práctica queda explícitamente separado. |

### 10.4 Seguimiento y comunicación

| ID | Etapa y prioridad | Requisito | Criterio de aceptación |
|---|---|---|---|
| RF21 | E0 P0 | Revisión programada | Se conoce última revisión y próxima fecha; un reinicio no duplica eventos. |
| RF22 | E1 P0 | Estado con causa | Cada entrada y salida de observación tiene regla o evidencia, fecha y explicación. |
| RF23 | E1 P0 | Cobertura independiente | Falta de datos no aparece como «todo sigue bien». |
| RF24 | E1 P0 | Evento contextual | Cada novedad explica vínculo con la tesis y aporta fuentes o se marca como escenario. |
| RF25 | E1 P1 | Notificaciones | Preferencias por canal, nivel y horario; deduplicación y registro de entrega. |
| RF26 | E1 P0 | No actuar como resultado | Una revisión puede concluir mantener y explicar por qué. |
| RF27 | E1 P1 | Aceleración controlada | Un cambio de frecuencia temporal tiene tope, vencimiento y motivo visibles. |

### 10.5 Conexiones y control

| ID | Etapa y prioridad | Requisito | Criterio de aceptación |
|---|---|---|---|
| RF28 | E1 P0 si hay conexión | Consulta de broker | Cuenta, entorno, moneda y fecha identificados; ningún endpoint de ejecución queda habilitado. |
| RF29 | E3 P0 | Previsualización de órdenes | Cantidad, producto, cuenta, moneda, costos y límites se aprueban antes de enviar. |
| RF30 | E3 P0 | Reconciliación | Un timeout lleva a estado desconocido y consulta posterior, sin reenvío ciego. |
| RF31 | E3 P0 | Revocación | Revocar bloquea nuevas órdenes y aclara el estado de las ya enviadas. |
| RF32 | E1 P0 | Exportar y eliminar | El usuario obtiene sus datos y conoce plazos y excepciones de retención aplicables. |
| RF33 | E2 P0 | Planes y cuotas | El producto explica consumo y límites antes de bloquear una acción. |
| RF34 | E2 P2 | Compartir tesis | Publicación optativa, sin saldos ni identificadores de cuenta, con revocación del enlace. |
| RF35 | E4 P0 | Operación del socio | Roles, auditoría y límites por organización, sin acceso cruzado entre socios. |

## 11 Motor de seguimiento

### 11.1 Cuatro dimensiones independientes

| Dimensión | Valores propuestos | Qué representa |
|---|---|---|
| Ciclo de vida | Borrador, activa, archivada | Si la tesis está lista y bajo seguimiento. |
| Atención | En seguimiento, mirando de cerca, revisar tesis | Qué exige la información disponible. |
| Cobertura | Actualizada, parcial, atrasada, interrumpida | Qué tan reciente y completa es la observación. |
| Permiso | Observar, proponer, ejecutar dentro de un mandato | Qué acciones puede realizar Tesis. |

La frecuencia base es una política adicional. Una tesis puede estar activa, mirando de cerca, con cobertura parcial y permiso de proponer. Reducir todo a un único indicador verde o rojo ocultaría información relevante.

### 11.2 Significado de los estados de atención

**En seguimiento.** La información disponible no supera los criterios de atención definidos. No significa que la tesis sea correcta ni que la cartera sea segura.

**Mirando de cerca.** Apareció un movimiento, evento o desvío relevante cuya consecuencia necesita aclararse. Debe mostrar qué se está investigando y qué evidencia permitiría resolverlo. No implica una venta ni que el sistema haya obtenido datos que todavía no tiene.

**Revisar tesis.** Hay evidencia suficientemente relevante contra un supuesto material, una incompatibilidad con las preferencias del usuario o un cambio estructural que exige reconsiderar el plan. Puede generarse una propuesta de revisión; no una modificación silenciosa.

### 11.3 Transiciones propuestas

| Origen y destino | Disparador | Condición de salida o revisión | Acción permitida en E1 |
|---|---|---|---|
| Seguimiento → mirando de cerca | Movimiento fuera de umbral, concentración, evento material o evidencia incierta | Investigar causa y relevancia | Registrar evento y priorizar una revisión. |
| Seguimiento → revisar tesis | Evidencia material contra una invalidación definida | Evaluación sustentada y respuesta del usuario | Explicar contradicción y proponer revisión. |
| Mirando de cerca → seguimiento | Se resolvió la incertidumbre con evidencia suficiente | Motivo documentado; no basta una suba de precio | Publicar resolución. |
| Mirando de cerca → revisar tesis | La investigación confirma impacto estructural | Referencia a supuesto afectado | Proponer cambios de tesis o cartera. |
| Revisar tesis → seguimiento | Nueva versión aceptada o contradicción resuelta | Guardar justificación y versión | Retomar política válida. |
| Cualquiera → cobertura atrasada | Fuente vencida o proceso fallido | Restauración verificada | Avisar limitación y bloquear conclusiones dependientes. |

La última fila modifica cobertura, no borra el estado de atención. Un evento crítico abierto debe seguir visible durante una caída del proveedor.

### 11.4 Reglas deterministas y juicio del modelo

El motor calcula pesos, exposición, variaciones y desvíos. Por ejemplo, pasar de un peso objetivo de 20% a 26% representa un desvío de 6 puntos porcentuales, no de 6%. Los umbrales deben declarar unidad, ventana y precio de referencia.

El modelo puede explicar causas o clasificar evidencia. No puede inventar una medición ni cambiar límites por su cuenta. Toda recomendación de cambio de estado debe incluir referencias y pasar validadores. Las transiciones importantes necesitan criterios que puedan reproducirse con la información disponible en ese momento.

Los valores vistos en Supertake —como movimientos diarios o concentración de 25%— y los umbrales actuales de la demo son ejemplos, no parámetros universalmente adecuados. Se propone comenzar con políticas conservadoras de producto y calibrarlas con datos y revisión especializada, por clase de instrumento.

### 11.5 Frecuencia y monitoreo por eventos

La experiencia de «siempre está mirando» se implementa con procesos programados y eventos; no necesita un modelo generando texto sin interrupción. La arquitectura propuesta combina captura compartida de datos, reglas de bajo costo y llamadas al modelo cuando hay una novedad relevante o corresponde un resumen.

| Perfil | Revisión narrativa base propuesta | Detección de eventos |
|---|---|---|
| Paciente | Semanal | Reglas sobre la cadencia de datos disponible; no espera necesariamente al resumen. |
| Estándar | Diaria | Mismo mecanismo de eventos, según cobertura contratada. |
| Vigilante | Más frecuente, por definir y presupuestar | Límites explícitos; no equivale a un servicio intradiario garantizado. |

En E1 se propone que «mirando de cerca» pueda aumentar temporalmente la prioridad o frecuencia, con un presupuesto máximo y fecha de reevaluación. Ese comportamiento no está implementado y no se deduce automáticamente de la interfaz de Supertake.

### 11.6 Evitar ruido y oscilación

Usar deduplicación, agrupación de fuentes, un período mínimo entre avisos equivalentes y criterios de salida distintos de los de entrada cuando corresponda. Un precio que cruza repetidamente un umbral no debe generar decenas de mensajes. Una noticia más reciente no es necesariamente evidencia nueva.

La próxima revisión se calcula considerando zona horaria, sesiones de mercado y disponibilidad de fuentes. Si se pierde una ventana, se registra el atraso y se realiza una revisión de recuperación. No se inventan revisiones históricas para completar el registro.

### 11.7 Contrato de una revisión

Una revisión guarda identificador, tesis y versión, ventana temporal, fuentes consultadas, datos faltantes, resultados de reglas, hechos relevantes, interpretación, estado anterior y nuevo, decisión de mantener o proponer, costo y próxima revisión. La explicación visible puede ser breve, pero el registro debe permitir reconstruirla.

## 12 Noticias y evidencia

### 12.1 Qué debe producir el feed

El feed responde «qué cambió para mi idea», no solo «qué pasó con mis tickers». Debe incorporar hechos sobre compañías, industrias, países, regulación, competidores y cadenas de suministro cuando exista un vínculo explícito con la tesis.

Un evento contiene: título neutral; fecha del hecho y publicación; fuente; hecho resumido; supuesto o posición afectada; impacto estimado; evidencia contraria si existe; incertidumbre; cambio de atención, si lo hubo; y acción o decisión de no actuar.

### 12.2 Proceso propuesto

1. Recibir fuentes autorizadas y registrar procedencia y tiempo.
2. Normalizar entidades, símbolos, idioma y tipo de evento.
3. Detectar duplicados, republicaciones y correcciones.
4. Vincular el evento con posiciones, supuestos o temas monitorizados.
5. Puntuar materialidad mediante reglas y clasificación; conservar el motivo.
6. Elaborar una interpretación con referencias recuperables.
7. Validar que cada afirmación material tenga respaldo y no contradiga los datos.
8. Decidir si guardar sin notificar, incluir en resumen o generar aviso prioritario.

Los pasos 1 a 5 pueden reutilizarse entre muchas tesis. La interpretación personal puede requerir contexto particular; compartir el análisis público no implica compartir datos privados entre usuarios.

### 12.3 Calidad y derechos de uso

El proveedor de noticias sigue pendiente. Antes de contratar deben compararse cobertura argentina y global, idiomas, retraso, identificadores, correcciones, archivos históricos, costos y derechos de uso en un producto comercial. Acceder a una página o API no concede automáticamente derechos para almacenar y redistribuir todo su contenido.

Se priorizan documentos primarios cuando existan: comunicaciones de empresas, resultados, reguladores y mercados. Las fuentes periodísticas agregan contexto, pero se deben reconocer contradicciones y no convertir rumores en hechos confirmados. Un resumen debe enlazar la evidencia y evitar reproducir extensamente contenido protegido.

### 12.4 Reglas editoriales

- Separar hecho, inferencia e hipótesis con lenguaje visible.
- No atribuir una caída a una noticia solo por coincidencia temporal.
- No usar porcentajes de «confianza» si no se calibraron; preferir categorías de evidencia.
- No afirmar «no ocurrió nada» cuando solo se consultaron algunas fuentes.
- Ante una corrección, actualizar el evento conservando el cambio y revisar decisiones afectadas.
- Tratar el contenido externo como datos: un artículo no puede ordenar al agente cambiar políticas o llamar al broker.

## 13 Carteras y medición

### 13.1 Construcción de una composición

La cartera debe surgir de una cadena explicable: hipótesis → mecanismo económico → exposición buscada → instrumento disponible. Un vínculo indirecto se identifica como tal. Si faltan instrumentos adecuados, se propone seguir la idea sin cartera o se explica la aproximación y sus límites.

No se deben rellenar posiciones para alcanzar una cantidad estética. La cantidad final depende de capital, lotes, liquidez, costos y concentración. Una canasta de empresas del mismo factor no se presenta como diversificada solo porque tiene varios nombres.

### 13.2 Invariantes de cálculo

| Regla | Comportamiento requerido |
|---|---|
| Pesos objetivo | Posiciones más efectivo suman 100% según precisión definida. |
| Cantidades | Respetan paso, lote, mínimo y capacidad del instrumento. |
| Monedas | Toda cantidad tiene unidad; no se suman ARS, USD, BTC o sats sin conversión explícita. |
| Asequibilidad | Incluye costos estimados y fondos disponibles antes de proponer compra. |
| Precisión | Usar enteros de unidad mínima o decimales exactos para dinero y cantidades reales. |
| Efectivo | Diferenciar disponible, comprometido y pendiente de liquidación cuando el broker lo provea. |
| Conciliación | El libro interno y la cuenta externa pueden discrepar; la diferencia debe quedar visible. |

El PoC actual redondea dinero a dos decimales con números JavaScript y usa unidades enteras. Es suficiente para sus escenarios ficticios; no define la contabilidad de BTC ni una implementación apta para ejecución real.

### 13.3 Rendimiento y comparaciones

Para una posición sin flujos, la variación simple es `precio_final / precio_inicial - 1`. Para una cartera real, el resultado debe incorporar transacciones, costos, distribuciones y eventos corporativos. Los aportes y retiros son flujos externos, no ganancias ni pérdidas.

Para E1 se propone un libro de movimientos y dos métricas claramente nombradas: resultado monetario neto y rentabilidad del período con un método documentado. Cuando haya flujos, se usará rentabilidad ponderada por tiempo para comparar gestión y, si se agrega una medida personal ponderada por dinero, se explicará la diferencia. Las fórmulas deberán probarse con ejemplos conocidos y casos de flujos en varias fechas.

Toda comparación requiere período, moneda, fuente y benchmark apropiados. Si se presenta rendimiento en ARS, USD o BTC, se conserva el tipo de cambio aplicado y su fecha. Una medida ajustada por inflación necesita una serie y metodología explícitas. No se llamará «ganarle al mercado» a comparar contra una referencia ficticia o de otra moneda.

### 13.4 Simulación histórica

Una canasta creada hoy con datos históricos se rotula como simulación con selección actual; no es el historial real de un agente. Un backtest posterior debe documentar universo disponible en cada fecha, reglas, gastos, rebalanceos y tratamiento de sesgos de anticipación y supervivencia. Queda fuera de E0 y no es requisito para validar el seguimiento en E1.

### 13.5 Rebalanceo y cambios

Separar propuesta estratégica —cambiar pesos por nueva evidencia— de corrección mecánica —volver a pesos acordados—. Antes de proponer una operación, comprobar si el beneficio esperado de corregir un desvío justifica costos, tamaño mínimo y restricciones. El modelo puede explicar; el cálculo y los límites corresponden al motor.

## 14 Brokers y ejecución

### 14.1 Arquitectura por capacidades

Cada proveedor declara capacidades verificadas, por entorno y cuenta: catálogo, precios, saldos, posiciones, historial, cotización previa, órdenes, cancelación, eventos y permisos. Una capacidad no implementada o no habilitada no se muestra como disponible.

El núcleo no debe depender de los endpoints de un broker. Un adaptador traduce sus identificadores, cantidades, calendarios y errores al modelo de Tesis. Un instrumento debe identificarse por proveedor, mercado, identificador nativo, tipo y moneda; un ticker por sí solo no alcanza.

### 14.2 IOL

IOL dispone de documentación pública de API, acceso mediante tokens y un proceso de habilitación. Su página diferencia el servicio real de un entorno sandbox separado. La disponibilidad técnica no confirma condiciones de integración comercial, límites para múltiples usuarios ni permisos sobre redistribución de datos. [Fuente IOL](https://api.invertironline.com/Help).

**Estado de Tesis:** no hay conector IOL implementado. **Propuesta:** validar primero autenticación y consultas en el entorno adecuado; luego catálogo operable, saldos, posiciones y conciliación; solo después considerar órdenes. Confirmar con el proveedor los mecanismos de autorización y evitar diseñar el producto alrededor de recolectar contraseñas del broker.

### 14.3 Roxom

La documentación de Roxom publica producción y sandbox y destaca perpetuos GOLD-BTC y USDT-BTC en su introducción. Su catálogo admite varios tipos de instrumento y unidades BTC o sats. Esto exige comprobar qué instrumentos están realmente disponibles para la cuenta y por qué API. [Introducción](https://docs.roxom.com/api-reference), [catálogo](https://docs.roxom.com/api-reference/market/trading-instruments).

El conector existente firma consultas con RSA-SHA256 y realiza únicamente `GET /v1/market/instruments?unit=btc` y `GET /v1/accounts/balance?unit=btc`. Preserva decimales como texto y muestra el entorno. No trae posiciones a una cartera de Tesis, no envía órdenes y no se verificó con credenciales. [Autenticación](https://docs.roxom.com/api-reference/authentication), [saldos](https://docs.roxom.com/api-reference/accounts/get-account-balance).

La existencia de One-Click Trade en el producto de Roxom no demuestra que la API pública revisada permita implementar ese mismo flujo. Hay que confirmar endpoint, productos, derechos económicos, custodia, disponibilidad territorial y condiciones de integración. [Descripción de One-Click Trade](https://docs.roxom.com/help-center/one-click-trade/what-is-one-click-trade-what-assets-are-available).

### 14.4 Usar uno o ambos

Se propone mantener ambos como opciones sin forzar equivalencia. Para el segmento inicial argentino, la elección debe depender del universo de inversión apropiado, monedas, mecanismos de fondeo, permisos y experiencia del usuario. Un perpetuo denominado en BTC no sustituye silenciosamente una exposición accionaria simple.

Roxom puede servir como primer experimento de consulta porque ya existe un adaptador. Eso no convierte automáticamente a Roxom en el primer proveedor de ejecución ni elimina el análisis de IOL. El orden de integración comercial queda pendiente de pruebas y acuerdos.

### 14.5 Flujo futuro de una orden

`Propuesta → validación → cotización y costos → aprobación específica → envío → confirmación del broker → conciliación`.

Estados mínimos: borrador, pendiente de aprobación, aprobada, enviada, aceptada, parcialmente ejecutada, ejecutada, rechazada, cancelación solicitada, cancelada y resultado desconocido. «Enviada» no equivale a «comprada». Una solicitud de cancelación puede competir con una ejecución y necesita confirmación del proveedor.

Cada intención necesita identificador e idempotencia. Tras un timeout, consultar primero el estado remoto; no repetir ciegamente una compra. En una canasta, distintas órdenes pueden tener resultados diferentes: debe mostrarse la ejecución parcial y el efectivo remanente. No se debe deshacer lo ya ejecutado mediante operaciones compensatorias automáticas sin una política autorizada.

### 14.6 Aprobación y autonomía

La aprobación debe estar vinculada a una cuenta, instrumentos, cantidades, límites de precio o deslizamiento, costos, versión y vencimiento. Cambios materiales requieren renovar aprobación. La interfaz debe distinguir «guardar», «activar práctica», «aprobar propuesta» y «enviar órdenes».

El futuro autopiloto requiere un mandato verificable y revocable, límites monetarios y temporales, universo permitido, máximo de rotación, horarios, controles independientes y un mecanismo de corte. No se habilita solo porque el usuario seleccione una frecuencia alta ni porque el modelo afirme que hay una oportunidad.

## 15 Arquitectura e inteligencia artificial

### 15.1 Arquitectura actual

`Navegador → servidor Node.js → SQLite`.

El servidor conversa con OpenAI cuando el usuario envía un mensaje y consulta Roxom cuando se solicita expresamente. El temporizador revisa reglas de práctica dentro del mismo proceso. No existe una infraestructura distribuida, un servicio de noticias ni un agente autónomo que investiga permanentemente.

### 15.2 Arquitectura objetivo del piloto

| Componente | Responsabilidad |
|---|---|
| Interfaz | Conversación, explicación, cartera, estados y aprobaciones. |
| API de aplicación | Identidad, permisos, validación, persistencia y coordinación. |
| Motor de cartera | Cantidades, costos, reglas, exposición y métricas. |
| Servicio de IA | Construir contexto, invocar modelos y validar respuestas. |
| Ingesta de datos | Precios, noticias, catálogos y actualizaciones de cuentas. |
| Planificador y cola | Trabajos persistentes, reintentos limitados, prioridad y cuotas. |
| Base de datos | Usuarios, tesis versionadas, movimientos y auditoría. |
| Adaptadores | Contratos específicos de cada broker o fuente. |
| Observabilidad | Salud, frescura, latencia, costo y errores. |

No es obligatorio separar todos estos componentes en servicios distintos. Un monolito modular con trabajadores separados puede conservar simplicidad y facilitar operación. La separación importante es de responsabilidades y permisos.

### 15.3 Qué hace el modelo

Conversar; extraer hipótesis y restricciones; plantear preguntas; explicar mecanismos; buscar contraargumentos; interpretar evidencia recuperada; proponer composiciones dentro del universo autorizado; y redactar actualizaciones.

### 15.4 Qué controla el software

Identidad, instrumentos permitidos, cantidades, sumas, precisión, disponibilidad de fondos, cuotas, agenda, políticas, permisos, transición validada de estados, registro de decisiones, idempotencia y estado de órdenes. El acceso al proveedor queda detrás de funciones acotadas, no de una terminal general entregada al modelo.

### 15.5 OpenAI como primera implementación

**Decisión del usuario:** usar OpenAI desde el principio. El código usa Responses API con un esquema de respuesta que contiene mensaje y propuesta opcional. El modelo configurado por defecto es `gpt-5-mini`; es una opción de la implementación actual, no una garantía de disponibilidad futura ni un compromiso permanente.

El producto debe permitir cambiar modelo, registrar versión de instrucciones y medir calidad antes de desplegar un cambio. Las claves permanecen en el servidor. `store:false` es un parámetro del pedido actual; no debe presentarse como una garantía universal de retención cero por parte del proveedor. Las condiciones aplicables se verifican para la cuenta y el servicio utilizados.

### 15.6 Requisitos de calidad de IA

- Salida estructurada validada antes de persistir una propuesta.
- Contexto recuperado con identificadores de fuente, fecha y estado de datos.
- Respuesta explícita cuando falta información o una herramienta falla.
- Fuentes verificables para hechos actuales; sin citas inventadas.
- Evaluación de sesgo de confirmación: no convertir todas las ideas del usuario en oportunidades.
- Conservación de la voz del usuario sin interpretar convicciones políticas como perfil financiero.
- Protección contra instrucciones maliciosas dentro de noticias, archivos o respuestas del broker.
- Registro de la explicación sustentada y de los datos utilizados; no hace falta almacenar razonamiento interno privado del modelo.

### 15.7 IA local como alternativa posterior

Alojar la aplicación en la Raspberry no equivale a ejecutar allí el modelo. El interés por IA local se mantiene como línea de evaluación: privacidad, independencia, latencia, costos y capacidad de adaptación. Antes de migrar habría que evaluar licencia del modelo, calidad en español, contexto, herramientas, salida estructurada, memoria requerida, velocidad, concurrencia, actualizaciones y operación.

No se fija aquí una GPU, un tamaño de modelo ni un costo de hardware: depende de un benchmark con los casos reales de Tesis. La Pi 5 de 8 GB no se considera capacidad de inferencia acreditada para servir 1.000 usuarios. Tampoco se propone entrenar un modelo fundacional para validar el producto. La independencia inicial se construye mediante datos propios bien organizados, evaluación y contratos de modelo reemplazables.

## 16 Datos y contratos

### 16.1 Entidades propuestas

| Entidad | Datos esenciales | Regla |
|---|---|---|
| Usuario | Identidad, idioma, zona horaria, plan y preferencias | Aislamiento por usuario y organización. |
| Perfil de exploración | Objetivo, horizonte, liquidez y restricciones | Versionado y minimización de datos. |
| Tesis | Propietario, título, ciclo, atención y cobertura | Estado actual con referencias a versiones. |
| Versión de tesis | Hipótesis, supuestos, invalidaciones y política | Inmutable una vez publicada. |
| Conversación | Participantes, mensajes y vínculo a tesis | Acceso privado y retención definida. |
| Instrumento | Proveedor, mercado, identificador, tipo, moneda, lotes | Sin equivalencia por ticker únicamente. |
| Cartera objetivo | Versión, instrumentos, pesos y efectivo | Valida contra política y catálogo. |
| Cuenta conectada | Proveedor, entorno, permisos y referencia al secreto | Nunca contiene la clave en una respuesta al cliente. |
| Movimiento | Cuenta, moneda, cantidad, tipo y fecha | Fuente para reconstruir saldos y resultados. |
| Evidencia | URL o identificador, autor, fechas, entidades y derecho de uso | Correcciones y procedencia conservadas. |
| Revisión | Ventana, reglas, evidencias, resultado y siguiente ejecución | Reproducible e idempotente. |
| Propuesta | Motivo, cambios, costos, versión y vencimiento | No equivale a una orden. |
| Orden y ejecución | Identificadores interno y remoto, estados y cantidades | Estados conciliados con el proveedor. |
| Notificación | Evento, canal, destinatario y entrega | Deduplicación. |
| Consumo | Usuario, operación, modelo, tokens y costo estimado | Base para presupuestos y cuotas. |

### 16.2 Contratos mínimos

Una respuesta del modelo debe distinguir mensaje, preguntas pendientes, evidencia usada y propuesta opcional. Una propuesta de cartera incluye versión de tesis, instrumentos identificados, pesos, mecanismo por posición, supuestos y advertencias concretas sobre datos faltantes. El servidor determina si puede avanzar.

Una lectura de broker incluye `provider`, `environment`, `account_id`, `as_of`, monedas y capacidades. Una cotización incluye fuente, marca temporal, tipo de precio, moneda y retraso conocido. Un evento de seguimiento incluye claves de deduplicación y la versión evaluada.

Los contratos se versionan. Una respuesta de proveedor inesperada produce error explícito y datos en cuarentena; no se acepta un saldo de cero por un campo ausente.

### 16.3 Persistencia y migración

SQLite es la base actual. Antes de ampliar el servicio, agregar migraciones versionadas, respaldos automáticos y prueba de restauración. Para múltiples instancias o mayor concurrencia, evaluar PostgreSQL y una cola persistente según mediciones; no cambiar por una cifra de usuarios registrados aislada.

El almacenamiento actual sobrescribe objetos JSON completos. Las entidades críticas futuras necesitan transacciones y control de concurrencia por versión, especialmente aprobaciones, movimiento de efectivo y estados de órdenes. No usar el texto del chat como fuente contable.

## 17 Infraestructura y capacidad

### 17.1 Objetivo de la Raspberry

La Raspberry Pi 5 de 8 GB es el destino elegido para una demo personal con inferencia externa. La expectativa es alojar interfaz, API, SQLite, planificador y consultas acotadas. Todavía hace falta medir arranque, memoria, persistencia, reinicios y rendimiento en el dispositivo real.

Propuesta operativa para el PoC: sistema de 64 bits, almacenamiento fiable, refrigeración adecuada, conectividad estable, supervisión de proceso y respaldo fuera del equipo. Priorizar SSD si está disponible. Son recomendaciones de implementación a validar, no componentes ya instalados ni garantías de continuidad.

### 17.2 Qué significa 1.000 usuarios

Mil registrados, mil activos diarios y mil solicitudes simultáneas son escenarios distintos. El límite inicial probablemente incluya proveedor de IA, datos y diseño de concurrencia, además del hardware. El bloqueo global de IA y los límites globales actuales deben reemplazarse antes de un piloto multiusuario.

**Escenario ilustrativo de dimensionamiento, no previsión de demanda:** 1.000 cuentas, 100 usuarios activos diarios, 6 turnos de IA por activo y 300 usuarios con seguimiento, cada uno con 2 tesis. Eso produce 600 respuestas de chat diarias y, si se revisa cada tesis una vez al día, 600 revisiones lógicas diarias. Una revisión lógica no tiene por qué consumir una llamada de modelo.

Si las 600 respuestas se distribuyen en diez horas, el promedio es un pedido por minuto. Con 15 segundos de duración media, la concurrencia media sería 0,25 pedidos, pero las ráfagas pueden ser mucho mayores. La prueba debe medir ráfagas y percentiles, no solo promedios. Esas duraciones y distribuciones son supuestos para diseñar el ensayo.

### 17.3 Prueba de capacidad propuesta

Medir por separado navegación y lecturas, escrituras, chat con proveedor simulado, chat con proveedor real y trabajos de seguimiento. Probar concurrencia creciente —por ejemplo 1, 5, 10 y 25 sesiones activas—, crecimiento de base, reinicio durante trabajo y caída de proveedor. No se afirma que la Pi alcance esos niveles hasta probarlos.

Registrar CPU, RAM, disco, bloqueos SQLite, tamaño de cola, latencia y errores. Definir un tope de admisión para el piloto según el primer recurso limitante. Si las colas no se recuperan o la disponibilidad doméstica interfiere con el uso, mover API y trabajadores a infraestructura administrada; no ocultar la degradación tras más tiempo de espera.

### 17.4 Objetivos no funcionales propuestos

| Área | Objetivo inicial | Cómo comprobarlo |
|---|---|---|
| Navegación | p95 de lecturas propias menor a 1 segundo bajo carga acordada | Prueba con volumen y concurrencia documentados. |
| Chat | Confirmación de recepción menor a 1 segundo; estado visible durante espera | Pruebas con latencia y errores del proveedor. |
| Respuesta de IA | Meta p95 menor a 30 segundos para casos de prueba normales | Benchmark; no SLA prometido antes de medir. |
| Seguimiento | 95% de trabajos completados dentro de 15 minutos de su agenda en piloto | Métrica sobre trabajos elegibles, con fallas contabilizadas. |
| Disponibilidad | Meta 99,5% mensual para un piloto alojado con ese compromiso | Medición externa; la demo doméstica no ofrece SLA. |
| Recuperación | Piloto: pérdida máxima objetivo de 24 horas y recuperación en 4 horas | Ensayo de restauración; ejecución real exigirá revisar ambos límites. |
| Accesibilidad | Meta WCAG 2.2 AA en flujos principales | Auditoría automática y recorrido manual. |
| Costo | Presupuesto y cola por usuario y por trabajo | Medición de tokens, datos y recursos. |

### 17.5 Despliegue y salida de fallos

El despliegue debe verificar configuración sin imprimir secretos, aplicar migraciones con respaldo, ejecutar comprobación de salud y permitir volver a la versión anterior. El paquete actual incluye instrucciones y Compose, pero no ha sido verificado en ARM64.

Una caída de IA permite leer cartera y novedades existentes. Una caída de noticias conserva historial y cambia cobertura. Una caída de broker bloquea nuevas acciones dependientes y activa conciliación. Una caída del equipo interrumpe seguimiento: al volver, se informa la brecha de cobertura.

## 18 Seguridad y privacidad

### 18.1 Amenazas relevantes

Acceso a carteras ajenas; fuga de claves; mensajes o noticias que intentan inducir acciones; duplicación de órdenes; interpretación de información vieja como actual; abuso de llamadas de IA; exposición accidental de una tesis; y pérdida de datos al actualizar o apagar el equipo.

### 18.2 Requisitos por etapa

| Etapa | Controles requeridos |
|---|---|
| E0 | Secretos en servidor, acceso acotado, no publicar archivos de configuración, backup y rotulación de práctica. |
| E1 | Identidad individual, autorización por recurso, cifrado en tránsito, gestión de sesiones, cuotas, logs sin secretos y restauración probada. |
| E2 | Política de retención, gestión de incidentes, revisión de dependencias, control de acceso operativo y evaluación de proveedores. |
| E3 | Credenciales de mínimo privilegio, separación consulta y ejecución, aprobaciones verificables, idempotencia, conciliación y corte de operaciones. |
| E4 | Aislamiento institucional, roles, auditoría de administradores, acuerdos de acceso y pruebas con el socio. |

Tesis no necesita permisos de retiro para su propuesta inicial. Las claves nunca aparecen en el chat, el navegador, los enlaces compartidos ni los registros de diagnóstico. Las herramientas accesibles al modelo deben recibir únicamente el contexto necesario.

### 18.3 Datos especialmente delicados en esta experiencia

El chat geopolítico puede contener opiniones políticas. No convertirlas en etiquetas personales para marketing, segmentación comercial ni perfil de riesgo. Registrar la hipótesis económica que el usuario desea explorar, minimizando inferencias sobre sus convicciones.

La Ley 25.326 contempla protección de datos personales y define categorías sensibles, entre ellas opiniones políticas. La política de Tesis deberá revisar bases de tratamiento, información al titular, acceso, rectificación, supresión y transferencias aplicables con asesoramiento especializado. [Texto legal consultado](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/texto).

### 18.4 Retención propuesta

Conservar versiones y evidencia mientras la tesis esté activa y durante el período definido para el servicio. Permitir exportación y solicitar eliminación. Los plazos exactos se decidirán según finalidad y obligaciones aplicables; no prometer borrado inmediato de registros cuya retención sea exigida. La eliminación en una copia de respaldo puede tener una ventana distinta que debe explicarse.

No usar conversaciones privadas para entrenamiento, publicación o investigación externa por defecto. Cualquier uso adicional necesita una base y una comunicación específicas.

## 19 Encuadre del servicio

### 19.1 Distinción que afecta el producto

La Resolución General CNV 1002/2024 distingue información y análisis generales de recomendaciones personalizadas vinculadas a las circunstancias del cliente, y regula actividades de asesoramiento y vinculación. Por eso, la frase «es una conversación» o la decisión final del usuario no bastan para concluir que Tesis queda fuera de un régimen regulado. Esta es una señal para analizar el diseño concreto, no un dictamen sobre Tesis. [Texto de la resolución](https://www.boletinoficial.gob.ar/pdf/aviso/primera/307566/20250507).

El documento consultado está fechado en mayo de 2024 aunque la ruta del archivo incluya otra fecha. Antes de ofrecer el servicio se debe verificar normativa consolidada y modificaciones vigentes, alcance territorial y clasificación de cada producto.

### 19.2 Matriz de decisiones propuesta

| Modalidad | Qué debe aclararse antes de ofrecerla |
|---|---|
| Demo personal ficticia | Que los activos, precios y eventos de ejemplo no se presentan como servicios de inversión operativos. |
| Información general | Fuentes, derechos de uso, publicidad y ausencia de personalización encubierta. |
| Cartera sugerida según persona | Encuadre de recomendación personalizada, perfiles, responsabilidad y habilitaciones o socio autorizado. |
| Derivación a broker | Condiciones de vinculación, incentivos, comunicaciones y permisos. |
| Envío de órdenes aprobadas | Autorización, responsabilidades, identidad, registros y contrato con proveedor. |
| Gestión autónoma | Mandato, límites, supervisión, revocación y categoría habilitada. |
| Productos tokenizados o derivados | Naturaleza jurídica y económica, acceso territorial, divulgación y reglas específicas. |

### 19.3 Puertas de salida al mercado

Antes de E1 externo: describir exactamente qué recibe el usuario, revisar privacidad y encuadre del piloto y confirmar derechos de datos. Antes de E2: resolver contratación, publicidad, cobro y responsabilidades. Antes de E3: validar contrato de broker, autorizaciones y operación. Antes de E5: evaluación separada de administración delegada.

Trabajar con un socio regulado puede facilitar distribución y responsabilidades definidas, pero no transfiere automáticamente toda obligación al socio. La asignación contractual debe reflejar lo que cada parte efectivamente hace.

## 20 Mercado y posicionamiento

### 20.1 Hipótesis de mercado

Existe una oportunidad si suficientes personas valoran convertir sus ideas en planes entendibles y mantenerlos bajo seguimiento, y si pagarían por ese acompañamiento o una institución lo financiaría por mejorar su experiencia de clientes. La oportunidad no se deduce del entusiasmo con la demo.

No se dispone de una estimación validada de mercado total, demanda pagadora, costo de adquisición ni competencia exhaustiva. Este PRD evita convertir el número de cuentas de inversión de un país en usuarios potenciales directos: cuentas, personas únicas, activos y clientes dispuestos a pagar son magnitudes distintas.

### 20.2 Alternativas que compiten por el mismo trabajo

La siguiente es una comparación conceptual de categorías, no una auditoría de productos específicos ni un inventario de funciones actuales.

| Alternativa | Trabajo que suele resolver | Espacio que Tesis debe probar |
|---|---|---|
| Chat generalista | Explicar y conversar | Mantener cartera, evidencia, límites y continuidad verificable. |
| Broker o aplicación de inversión | Acceder a instrumentos y operar | Ayudar a entender una idea y seguir su evolución. |
| Asesor humano | Acompañar decisiones con contexto | Complementar trabajo repetitivo y acceso; no suponer reemplazo universal. |
| Medios, newsletters y analistas | Proveer información e interpretación | Conectar novedades con los supuestos particulares de una tesis. |
| Carteras modelo | Ofrecer una composición predefinida | Hacer explícito qué representa y cuándo revisar. |
| Planilla personal | Registrar posiciones y cálculos | Reducir esfuerzo de actualización y preservar razones y evidencia. |
| Comunidades y creadores | Descubrir ideas y pertenecer | Contrastar hipótesis y evitar seguir señales sin comprensión. |

### 20.3 Posicionamiento propuesto

Tesis se posiciona inicialmente como acompañamiento para construir y seguir carteras comprensibles. No lidera con «IA que gana al mercado» ni «trading automático». La persona debería elegirlo por ahorrar trabajo de interpretación y tener un plan que puede revisar.

Argentina es el primer contexto de diseño: idioma, instrumentos disponibles, monedas, capital accesible y hábitos que deben investigarse. No se asume que localizar consiste solo en traducir textos o cambiar dólares por pesos.

### 20.4 Qué podría ser defendible

El modelo externo es reemplazable. Las capacidades potencialmente defendibles son: un buen modelo de tesis y sus cambios; relación estructurada entre hipótesis y evidencia; evaluaciones de calidad; catálogos y adaptadores confiables; conciliación; experiencia de explicación; distribución y confianza.

El historial privado de un usuario puede mejorar continuidad para ese usuario. No debe describirse como un activo comercial libremente explotable. Tampoco se presume que acumular más texto genere automáticamente una ventaja competitiva.

### 20.5 Investigación pendiente

Entrevistar usuarios con y sin broker, observar cómo interpretan una caída, conocer cuánto tiempo dedican a noticias, qué ya pagan y qué dejarían de usar. Analizar competidores con una matriz fechada de capacidades, precios y segmentos antes de fijar posicionamiento comercial definitivo.

Para estimar mercado, construir de abajo hacia arriba: canal accesible → personas únicas elegibles → activación → retención → conversión → ingreso neto. Usar datos de pilotos y socios, no únicamente cifras generales de inclusión financiera.

## 21 Modelo de negocio y costos

### 21.1 Recomendación inicial

**Hipótesis preferida: suscripción por seguimiento y herramientas.** Alinea el ingreso con un servicio continuo y permite que «no hacer nada» sea una buena conclusión. No se ha fijado precio ni moneda de facturación.

Cobrar por operación o recibir ingresos por derivación podría evaluarse con contratos y divulgación de incentivos. No se presupone una participación en comisiones de IOL, Roxom o Supertake. Una dependencia de volumen operado puede entrar en tensión con el objetivo de evitar movimientos innecesarios.

### 21.2 Planes propuestos para experimentar

| Plan | Alcance tentativo | Límites y condición |
|---|---|---|
| Exploración gratuita | Una tesis de práctica, conversación limitada y una frecuencia baja de resumen | Cuotas visibles; no simular vigilancia continua. |
| Personal pago | Varias tesis, más conversación, evidencia y seguimiento más frecuente | Número de tesis y presupuesto de IA acotados y publicados. |
| Avanzado posterior | Más capacidad, consolidación y herramientas adicionales | Solo después de probar que hay una necesidad distinta. |
| Institucional | Piloto y luego licencia, usuarios activos o uso contratado | Implementación, datos, soporte y responsabilidad definidos por acuerdo. |

Los límites exactos requieren medir costo y valor. Como punto de experimentación, el gratuito puede permitir una tesis y una cantidad mensual reducida de turnos; el pago, entre tres y cinco tesis. Son hipótesis de empaquetado, no condiciones aprobadas.

Al bajar de plan, el usuario elige qué tesis conservar activas y puede exportar el resto. No se borra su historia ni se sugiere vender posiciones para cumplir una cuota. Los avisos operativos sobre una falla o falta de cobertura deben seguir siendo visibles; el producto no puede aparentar que sigue un plan cuyo seguimiento suspendió.

### 21.3 Qué cuesta servir a un usuario

Costos de IA para conversación e interpretación; precios y noticias con sus licencias; almacenamiento, cómputo y red; monitoreo y backups; correo u otros canales; soporte; procesamiento de pagos; integraciones; y obligaciones de operación. El costo de hardware de la Pi no representa el costo total del servicio.

La suscripción de ChatGPT del desarrollador no es el costo de API de todos los usuarios de Tesis. Se debe presupuestar la cuenta de API utilizada por la aplicación y asignar consumo por función.

### 21.4 Fórmula de costos

`Costo IA = Σ(tokens de entrada × tarifa de entrada + tokens de salida × tarifa de salida + herramientas facturadas)`.

`Costo de servicio = IA + datos + infraestructura + canales + soporte atribuible + pagos + otros costos variables`.

`Margen de contribución = ingreso neto de impuestos y devoluciones − costos variables de servir a los usuarios`.

La facturación del proveedor y el cálculo por tokens son la referencia. Un costo promedio por respuesta solo sirve para proyectar una vez medido. La longitud del historial, herramientas y cantidad de fuentes pueden cambiarlo mucho.

### 21.5 Ejemplo de sensibilidad económica

**Todos los precios de esta tabla son supuestos de cálculo inventados para evaluar sensibilidad. No son tarifas actuales de OpenAI ni cotizaciones de infraestructura.** Se usa el escenario de la sección 17: 18.000 respuestas de chat al mes, 18.000 revisiones lógicas, y solo 25% de esas revisiones llama al modelo, es decir, 4.500 interpretaciones.

| Concepto mensual | Costo bajo supuesto | Costo medio supuesto | Costo alto supuesto |
|---|---:|---:|---:|
| Costo por respuesta de chat | USD 0,002 | USD 0,010 | USD 0,030 |
| Costo por interpretación de revisión | USD 0,005 | USD 0,020 | USD 0,060 |
| 18.000 respuestas de chat | USD 36,00 | USD 180,00 | USD 540,00 |
| 4.500 interpretaciones | USD 22,50 | USD 90,00 | USD 270,00 |
| Subtotal IA | USD 58,50 | USD 270,00 | USD 810,00 |
| Reserva ilustrativa de datos e infraestructura | USD 100,00 | USD 100,00 | USD 100,00 |
| Subtotal parcial mensual | USD 158,50 | USD 370,00 | USD 910,00 |

Si, también como supuesto, 100 de esas 1.000 cuentas pagaran USD 8 mensuales, el ingreso bruto sería USD 800. Restando únicamente los subtotales parciales quedarían USD 641,50, USD 430 o una pérdida de USD 110. **Eso no es beneficio ni margen final:** faltan pagos, soporte, impuestos aplicables, adquisición, desarrollo y otros gastos; además, uso y conversión pueden cambiar juntos.

La conclusión de diseño es medir el consumo, reutilizar información pública, evitar llamadas sin novedad y poner cuotas comprensibles. El precio y los planes se decidirán con datos de uso y disposición de pago. No se concluye que el negocio sea rentable a partir de este ejemplo.

### 21.6 Política de uso de IA

Presupuesto por usuario, por tarea y global; tamaño máximo de contexto; resumen de memoria con trazabilidad; caché de análisis públicos cuando los derechos lo permitan; modelos diferenciados según tarea y calidad; reintentos limitados; y alertas de costo anormal. Al alcanzar una cuota, explicar qué sigue disponible y cuándo se renueva.

No confundir límite de intentos con límite monetario. El PoC cuenta intentos diarios, incluso fallidos, y registra tokens de respuestas correctas; eso no garantiza un techo exacto de gasto externo.

## 22 Distribución y oportunidad empresarial

### 22.1 Dos caminos compatibles

**Producto directo:** comenzar con un grupo acotado que valore conversación y seguimiento, aprender sobre uso, y probar una suscripción. Requiere distribución propia, soporte y resolver confianza y encuadre del servicio.

**Producto mediante instituciones:** ofrecer a un broker o fintech una experiencia integrada que ayude a sus clientes a entender propuestas y seguir planes. Requiere identidad, integración, métricas, controles y responsabilidad definida. No es simplemente venderles el código de la demo.

### 22.2 Qué podría interesar a IOL o una fintech

Hipótesis a validar con cada institución: mejor activación de clientes; continuidad después de la primera compra; menos consultas repetitivas; mejor comprensión; y una experiencia diferenciada. El efecto sobre activos, depósitos, retención o soporte debe medirse en un piloto. No se atribuye interés actual a IOL, Mercado Pago, Roxom ni otra empresa.

Mercado Pago aparece como posible interlocutor por la ambición expresada, no como integración disponible ni comprador probable. Sus necesidades, catálogo, procesos y condiciones tendrían que investigarse por separado.

### 22.3 Oferta de piloto institucional propuesta

Un universo limitado, usuarios invitados, alcance sin ejecución autónoma, un período y objetivo acordados, métricas contra una línea base y criterios de salida. Entregables: experiencia funcional, integración de lectura si aplica, evidencia de comprensión, tiempos de uso, retención, fallos y costos por usuario.

El contrato debe aclarar quién aporta datos, autoriza instrumentos, atiende consultas, gestiona incidentes, aprueba contenido y conserva registros. El piloto debe tener presupuesto y un responsable institucional con capacidad de decidir; una reunión positiva no equivale a una oportunidad comercial validada.

### 22.4 Venta de producto o adquisición

Una licencia, una integración paga, una asociación y una adquisición son resultados distintos. El PoC ayuda a mostrar una experiencia; una compra de empresa dependería además de tracción, equipo, propiedad intelectual, contratos, operación y encaje estratégico. El plan de Tesis no debe depender de que una empresa específica lo compre.

### 22.5 Distribución inicial propuesta

Primero, demostraciones personales e invitaciones controladas. Luego, contenido educativo basado en cómo pensar una tesis y revisar evidencia, evitando promesas de rentabilidad. Explorar colaboración con profesionales o instituciones bajo condiciones adecuadas. El enlace público de tesis y las referencias entre usuarios se incorporan cuando privacidad y metodología estén resueltas.

## 23 Métricas y experimentos

### 23.1 Métrica principal propuesta

**Tesis activas comprendidas con seguimiento útil durante el mes.** Para contar una tesis debe estar activa, tener al menos una revisión válida con cobertura suficiente y una interacción de comprensión o utilidad: abrir evidencia, responder una pregunta de entendimiento o marcar una actualización como útil. No basta generar automáticamente un resumen.

La comprensión se verifica por muestra y por momentos del flujo; no se infiere únicamente de tiempo de pantalla. No se pretende medirla perfectamente con un solo clic.

### 23.2 Métricas de producto

| Métrica | Definición propuesta | Uso |
|---|---|---|
| Activación | Usuarios que activan una práctica válida / usuarios que empiezan el recorrido | Detectar fricción inicial. |
| Tiempo a primera tesis | Mediana y p90 desde inicio hasta borrador comprensible | Evaluar complejidad. |
| Comprensión | Personas que explican hipótesis, riesgo y diferencia práctica/real | Verificar que la experiencia enseña. |
| Retención semanal | Activados que vuelven y hacen una acción significativa en semana posterior | Medir continuidad. |
| Utilidad de novedades | Revisiones evaluadas como útiles / revisiones evaluadas | Mejorar relevancia, reportando tamaño de muestra. |
| Ruido | Avisos repetidos o irrelevantes / avisos revisados por muestra | Evitar fatiga. |
| Cobertura | Revisiones válidas y puntuales / revisiones programadas | Medir calidad operativa. |
| Conversión paga | Usuarios elegibles que pagan / usuarios elegibles expuestos a la oferta | Evaluar monetización. |
| Costo por activo | Costo atribuible / usuarios activos | Controlar economía. |
| Propuestas inválidas | Propuestas rechazadas por validadores / propuestas generadas | Evaluar modelo y catálogo. |

### 23.3 Métricas de protección

Cero órdenes no autorizadas; cero acceso cruzado a datos en pruebas; cero citas fabricadas en casos críticos de aceptación; porcentaje de datos atrasados correctamente rotulados; tasa de duplicados; número de incidentes de conciliación; y porcentaje de usuarios que confunde simulación con dinero real.

No usar volumen de operaciones, tiempo pegado a cotizaciones o rendimiento reciente como única medida de éxito. Pueden subir mientras empeora la calidad de decisiones.

### 23.4 Instrumentación mínima

Eventos sugeridos: `onboarding_started`, `context_completed`, `thesis_draft_created`, `proposal_viewed`, `practice_activated`, `review_completed`, `evidence_opened`, `attention_changed`, `review_marked_useful`, `broker_read_connected`, `plan_limit_reached` y `subscription_started`.

Registrar identificadores pseudónimos, etapa, versión y tiempo. No enviar contenido completo de chats, opiniones políticas, saldos ni credenciales a herramientas de analítica por defecto. Definir cohortes con fechas y separar cuentas internas, demos y usuarios reales.

### 23.5 Experimentos propuestos

| Experimento | Diseño | Evidencia esperada | Qué cambiaría si falla |
|---|---|---|---|
| E01 Problema | 12 a 15 entrevistas repartidas entre principiantes e inversores iniciales | Necesidad recurrente expresada con ejemplos propios | Replantear segmento o trabajo principal. |
| E02 Comprensión | 12 pruebas moderadas con el PoC | Al menos 9 distinguen práctica de real y explican hipótesis e invalidación | Simplificar lenguaje y recorrido. |
| E03 Activación | Mismo grupo, sin guía sobre cada clic | Al menos 8 activan una práctica coherente | Reducir pasos o complejidad de propuesta. |
| E04 Seguimiento | Invitar a los activados a usar un piloto durante dos semanas | Al menos la mitad vuelve en la segunda semana y relata una novedad útil | Revisar relevancia y frecuencia antes de sumar funciones. |
| E05 Disposición a pagar | Oferta concreta después de experimentar valor | Compromisos de pago o compra efectiva, no solo respuestas favorables | Revisar precio, plan o segmento. |
| E06 Institucional | Entrevistas y demo a responsables adecuados | Un problema con dueño, presupuesto y alcance de piloto | No priorizar integración a medida sin oportunidad verificable. |
| E07 Capacidad | Carga escalonada y escenarios de fallos en Pi | Límites y costos medidos | Reducir admisión o mover infraestructura. |

Estos umbrales son puertas de aprendizaje propuestas para muestras pequeñas. No establecen significancia estadística ni prueban ajuste producto mercado. Registrar abandono y motivos, no solo a quienes completan.

## 24 Calidad y criterios de aceptación

### 24.1 Estrategia de pruebas

Probar lógica financiera con resultados conocidos; contratos de proveedores con respuestas controladas; integración con credenciales de prueba cuando existan; flujo completo en navegador; evaluación de IA con un conjunto versionado; y recuperación ante fallos. Los tests de ejemplo no reemplazan la verificación de permisos y datos en cada proveedor.

La entrega anterior registra 12 pruebas automáticas aprobadas en Windows y un recorrido de creación, activación, caída y guardado de frecuencia. Este PRD se basa en esa evidencia y en lectura del código; no afirma haber repetido las pruebas ni haber levantado el servidor durante su redacción.

### 24.2 Matriz de aceptación

| Caso | Requisitos relacionados | Resultado esperado |
|---|---|---|
| Usuario empieza sin broker | RF03, RF06, RF11 | Puede conversar o usar plantilla y activar solo práctica. |
| Falta clave OpenAI | RF06 | Mensaje claro; no respuesta falsa atribuida a IA. |
| Idea no invertible | RF07 a RF10 | Conserva idea, explica límites y no inventa activo. |
| Instrumento fuera de catálogo | RF09, RF15 | Rechazo antes de guardar o activar. |
| Política de concentración incompatible | RF15 | No se aprueba una composición que viola la política elegida. |
| Capital insuficiente | RF14, RF15 | Explica inviabilidad; no crea unidades ni efectivo negativos. |
| Activación repetida | RF14 | Una sola activación; segundo intento sin duplicación. |
| Aporte posterior | RF17 | Aumenta capital sin registrarse como ganancia. |
| Misma posición en dos tesis | RF18 | Consolidación sin duplicación económica. |
| Cambio de tesis | RF19 | Nueva versión; pasado preservado. |
| Precio cae, supuestos intactos | RF22, RF26 | Puede pasar a observación, sin venta automática. |
| Evidencia contradice invalidación | RF22, RF24 | Solicita revisar con fuente y supuesto identificado. |
| Rebote sin evidencia resolutiva | RF22 | No sale de observación solo por subir el precio. |
| Fuente caída | RF23 | Cobertura atrasada, sin falso mensaje tranquilizador. |
| Noticia repetida | RF24, RF25 | Un evento consolidado; no múltiples avisos equivalentes. |
| Reinicio con trabajos vencidos | RF21 | Recuperación sin duplicación; brecha registrada. |
| Pausa de propuestas | RF25, RF27 | Semántica visible; no confundir con pausa de observación. |
| Acceso a ID ajeno | RF01 | Rechazo y ausencia de filtración en respuesta. |
| Datos de Roxom en BTC | RF28 | Conserva unidad y tipo; no suma al total ARS sin conversión. |
| Timeout de orden | RF29, RF30 | Estado desconocido y conciliación, sin compra duplicada. |
| Canasta parcialmente ejecutada | RF30 | Muestra cada resultado y efectivo; no informa éxito total. |
| Revocación | RF31 | No se admiten nuevas acciones; se revisan las ya enviadas. |
| Baja de plan | RF32, RF33 | Explica suspensión de seguimiento y conserva exportación. |
| Publicación de tesis | RF34 | Solo datos autorizados y posibilidad de revocar. |

### 24.3 Evaluación de IA

Crear al menos 30 casos versionados como punto de partida: ideas vagas, geopolítica, contradicción, información insuficiente, fechas viejas, noticia falsa, producto no disponible, confusión de monedas, petición de operar, contexto truncado e instrucciones maliciosas en una fuente.

Evaluar comprensión de intención, fidelidad a fuentes, capacidad de contraargumentar, corrección del formato, respeto de límites, lenguaje y abstención adecuada. Las fallas críticas —inventar ejecución, ignorar permisos o fabricar evidencia material— bloquean el despliegue del cambio aunque el promedio sea bueno.

### 24.4 Definición de terminado por etapa

**E0:** demo corre en Pi, persiste después de reiniciar, chat real configurado y probado, escenarios rotulados, recorrido completo y backup restaurable. La conexión de lectura de Roxom puede ser un extra técnico; no es imprescindible para mostrar valor.

**E1:** identidad e aislamiento; evidencia real con derechos claros; seguimiento con estado y cobertura; métricas; pruebas de IA; recuperación y costo medidos; revisión del alcance del piloto. Usuarios invitados entienden qué funciona y qué no.

**E2:** disposición de pago demostrada, cobro y límites completos, soporte, operación y marco de servicio resueltos. La rentabilidad de la cartera no se usa como sustituto de estas condiciones.

**E3:** autorización y contratos; flujo de órdenes probado en el entorno adecuado; contabilidad y conciliación; incidentes y corte operativo ensayados. Solo se habilitan las capacidades verificadas.

## 25 Plan de entrega

### 25.1 Secuencia recomendada

| Bloque | Resultado | Dependencias | Puerta de salida |
|---|---|---|---|
| B0 Congelar base del PoC | Código y documentación versionados | Proyecto actual | Se distingue base entregada de trabajo nuevo. |
| B1 Desplegar demo en Pi | Instalación reproducible, IA configurada y backup | Acceso al equipo y credenciales propias | Recorrido E0 completo y restauración probada. |
| B2 Probar experiencia | Hallazgos de entrevistas y usabilidad | Demo utilizable | Entender si la propuesta se comprende. |
| B3 Modelar continuidad | Versiones, políticas coherentes, libro y estados separados | Hallazgos B2 | Cambios auditables y métricas correctas. |
| B4 Incorporar evidencia | Fuente seleccionada, ingesta y feed contextual | Derechos de uso y evaluación | Actualizaciones verificables, sin noticias inventadas. |
| B5 Abrir piloto privado | Identidad, cuotas, observabilidad y soporte | B3, B4 y alcance revisado | Usuarios regresan por seguimiento útil. |
| B6 Evaluar monetización | Oferta concreta y datos de costo | Uso sostenido | Señales de pago o piloto institucional contratado. |
| B7 Profundizar broker | Un conector de lectura robusto y conciliado | Acceso y acuerdo del proveedor | Información de cuenta confiable. |
| B8 Evaluar ejecución | Propuestas y órdenes aprobadas | Contratos, permisos y pruebas | Criterios E3 completos. |

B7 puede explorarse técnicamente antes, sin desplazar la validación de experiencia. No es necesario implementar dos brokers completos para comprobar si la gente quiere Tesis.

### 25.2 Próximo bloque de implementación concreto

1. Crear repositorio del proyecto y documentar configuración de destino sin secretos.
2. Copiar la base a la Raspberry y verificar Node o Docker ARM64.
3. Configurar OpenAI en el servidor y probar una conversación real y errores de cuota.
4. Verificar persistencia, reinicio y restauración de respaldo.
5. Corregir incompatibilidad entre concentración permitida y pesos objetivo.
6. Aclarar pausa de propuestas, cadencia y cobertura en la interfaz.
7. Agregar versionado de cambios de tesis antes de introducir evidencia real.
8. Preparar un guion y formulario de observación para pruebas de usuarios.

Estos pasos son planificación. El servidor sigue detenido y este documento no despliega ni conecta cuentas.

### 25.3 Responsabilidades a asignar

| Función | Responsabilidad |
|---|---|
| Producto | Alcance, investigación, prioridades y criterios de éxito. |
| Diseño | Claridad, comprensión, accesibilidad y recorrido. |
| Ingeniería | Implementación, pruebas, datos, conectores y operación. |
| Especialista de dominio | Revisar razonamientos, instrumentos, métricas y límites. |
| Asesoramiento legal y privacidad | Determinar encuadre y condiciones para cada etapa. |
| Socio proveedor | Confirmar API, permisos, datos y responsabilidades. |
| Soporte | Atender fallos, dudas y solicitudes de datos. |

Al principio una persona puede cubrir varias funciones. Antes de servicio comercial las responsabilidades deben tener un dueño real; no se supone que un agente de IA las asuma todas.

### 25.4 Lo que se posterga deliberadamente

Entrenar un modelo propio, inferencia local a escala, aplicación móvil nativa, red social, ranking de rentabilidad, marketplace de estrategias, múltiples brokers con órdenes simultáneas, backtesting completo, optimización fiscal, derivados complejos y autopiloto general. Se reconsideran si la evidencia de usuarios o socios lo justifica.

## 26 Riesgos y decisiones abiertas

### 26.1 Registro de riesgos

| Riesgo | Consecuencia | Mitigación propuesta |
|---|---|---|
| Narrativa convincente sin fundamento | Confianza injustificada | Evidencia, contraargumentos, abstención y evaluación. |
| Confusión práctica y real | Expectativas falsas o acciones equivocadas | Rotulación persistente y flujos separados. |
| Catálogo incorrecto | Propuesta imposible o producto inadecuado | Identidad completa, capacidades verificadas y validación. |
| Noticias irrelevantes | Fatiga y abandono | Materialidad, deduplicación y feedback. |
| Falta de noticias interpretada como calma | Decisión con información incompleta | Estado de cobertura independiente. |
| Riesgo concentrado entre tesis | Diversificación aparente | Consolidación por emisor y factores. |
| Monedas y productos mezclados | Rendimiento y exposición erróneos | Unidades explícitas y conversión trazable. |
| Proveedor externo falla | Interrupción de experiencia | Degradación controlada y reintentos acotados. |
| Gasto de IA excesivo | Servicio económicamente inviable | Cuotas, medición y disparadores selectivos. |
| Capacidad doméstica insuficiente | Revisiones atrasadas | Pruebas, admisión acotada y plan de migración. |
| Actividad regulada no resuelta | Lanzamiento inviable o exposición legal | Revisar funciones reales antes de comercializar. |
| Órdenes duplicadas o parciales | Pérdidas o exposición no deseada | Idempotencia, conciliación y controles de aprobación. |
| Exposición de datos | Pérdida de confianza y responsabilidades | Aislamiento, mínimos permisos y privacidad por defecto. |
| Demasiadas funciones antes de validar | Mucho desarrollo sin demanda | Etapas y puertas de aprendizaje. |

### 26.2 Decisiones pendientes por prioridad

| Decisión | Propuesta inicial | Cuándo resolver |
|---|---|---|
| Segmento de entrada | Principiante con interés concreto e inversor inicial | Antes de reclutar entrevistas. |
| Universo del piloto | Pequeño, verificable y sin apalancamiento | Antes de datos reales. |
| Fuente de precios | Comparar calidad, demora y derechos | Antes de E1. |
| Fuente de noticias | Primarias y agregador con condiciones adecuadas | Antes de E1. |
| Primer broker robusto | Elegir por adecuación y acceso, no por facilidad aislada | Antes de B7. |
| Relación con Roxom | Consulta inicial; ejecución según capacidades confirmadas | Después de prueba autenticada. |
| Precio y moneda | Sin precio decidido; probar oferta concreta | Tras uso sostenido. |
| Gratuito | Una tesis y consumo acotado como experimento | Antes de E2. |
| Límites de seguimiento | Publicar cadencia y cobertura por plan | Antes del piloto externo. |
| Encuadre del servicio | Determinar por función, no por disclaimer | Antes de ofrecer personalización externamente. |
| Escala de infraestructura | Medir Pi y concurrencia; migrar si corresponde | Antes de ampliar usuarios. |
| Compartir públicamente | Privado por defecto; enlace opcional posterior | Después de privacidad y metodología. |
| Modelo local | Evaluar solo con razón económica o de privacidad medible | Después de validar producto. |

### 26.3 Criterios para detener o cambiar de rumbo

Si los usuarios no entienden la diferencia entre idea, instrumento y práctica, simplificar antes de agregar integración. Si no vuelven por el seguimiento, no asumir que las órdenes automáticas resolverán la falta de valor. Si los datos licenciados y el soporte hacen inviable el precio aceptado, cambiar alcance o canal. Si un proveedor solo permite productos inadecuados para el público, cambiar proveedor o mantener esa idea sin ejecución.

## 27 Demostración y ejemplos

### 27.1 Guion de una demo de diez minutos

| Tiempo orientativo | Qué mostrar | Qué debe entender quien mira |
|---|---|---|
| Minutos 0 a 2 | Una idea expresada en lenguaje común | Se puede empezar sin conocer tickers. |
| Minutos 2 a 4 | Preguntas, contraargumento e invalidación | La IA ayuda a precisar y cuestionar. |
| Minutos 4 a 6 | Propuesta y activación de práctica | Cada posición tiene una razón; práctica no es dinero real. |
| Minutos 6 a 8 | Escenario de caída y estado de observación | Caer no significa automáticamente vender. |
| Minutos 8 a 9 | Evidencia contraria simulada y revisión | Se puede cuestionar el plan original. |
| Minutos 9 a 10 | Historial, preferencias y próximos pasos | El valor está en la continuidad y el control. |

En el PoC actual todos los eventos de escenario se presentan como ficticios. Si se muestra Roxom, hacerlo como consulta independiente, con entorno y moneda visibles. No anunciar que una cartera se compró ni que una noticia se detectó en vivo.

### 27.2 Conversación ilustrativa del producto objetivo

**Usuario:** «Creo que la IA va a correr cada vez más en equipos propios y no solo en la nube».

**Tesis:** «Podemos explorar esa idea. ¿Imaginás adopción en hogares, empresas o ambos? También importa en qué plazo esperás verla y cuándo podrías necesitar el dinero. Una objeción es que los modelos más exigentes pueden seguir favoreciendo servicios remotos».

Después de aclarar el contexto, Tesis debe separar fabricación, hardware, distribución y aplicaciones, y explicar que el éxito tecnológico no garantiza rentabilidad de una acción. Puede generar una propuesta de práctica dentro del catálogo o concluir que la exposición disponible representa mal la idea.

### 27.3 Actualización ilustrativa

**Escenario ficticio para especificar tono, no noticia real:** «Pasamos a mirar de cerca esta tesis. Una de las posiciones cayó 8% en el escenario de prueba. Todavía no hay evidencia nueva que contradiga la adopción que estamos siguiendo. Vamos a revisar si el movimiento responde a un cambio del negocio o a otro factor. No se realizó ninguna operación».

En el producto con noticias reales, el equivalente debe enlazar las fuentes, identificar su fecha y aclarar exactamente qué datos sostienen cada afirmación. El porcentaje de un escenario nunca se publica como cotización real.

### 27.4 Preguntas que debe poder responder el usuario

¿Cuál es mi idea? ¿Por qué están estas posiciones? ¿Qué parte de la idea no cubre la cartera? ¿Qué me haría cambiar de opinión? ¿Qué sabe Tesis hoy y qué le falta? ¿Cuándo revisó por última vez? ¿Qué permiso tiene? ¿Qué ocurrirá si no respondo? ¿Qué costos y riesgos introduce pasar a una cuenta real?

## 28 Fuentes y trazabilidad

### 28.1 Evidencia de la conversación

Las decisiones de público, Raspberry Pi 5 de 8 GB, OpenAI inicial, interés por IA local, límites del gratuito, IOL/Roxom y posibilidad institucional provienen de pedidos del usuario. No se reinterpretan como decisiones cerradas sobre precios, permisos de operación, exclusividad de broker o arquitectura definitiva.

Las capturas de Supertake aportan el chat de «China Builds the South», el plan, pesos y categorías, activación de práctica, preferencias de autonomía y frecuencia y un feed de novedades de otra tesis. No se presupone que todas las capturas representen la misma cartera ni el mismo momento. El enlace compartido fue `https://supertake.com/t/uBZsLJtzU_Y?ref=share`; no se lo usó como prueba de arquitectura o ingresos.

### 28.2 Evidencia del PoC

| Archivo dentro de `outputs/tesis` | Qué respalda |
|---|---|
| `README.md` | Alcance declarado, limitaciones, instalación y verificación de la entrega. |
| `package.json` | Versión, scripts y requisito de Node. |
| `server.mjs` | Rutas, autenticación, límites globales, temporizador y coordinación. |
| `lib/engine.mjs` | Catálogo fijo, validación, cantidades, escenarios, cadencias y preferencias. |
| `lib/ai.mjs` | Prompt, esquema, contexto, proveedor y manejo de errores. |
| `lib/roxom.mjs` | Consultas firmadas, entorno y preservación de decimales. |
| `lib/store.mjs` | Tablas SQLite, persistencia y consumo diario. |
| `public/math.js` | Índice agregado sobre capital aportado, sin metodología completa de flujos. |
| `test/` | Casos de lógica, contratos y servidor incluidos en la entrega. |
| `Dockerfile` y `compose.yaml` | Preparación de despliegue, todavía sin validación en la Raspberry. |

### 28.3 Fuentes públicas consultadas

Consulta para esta edición: 5 de octubre de 2026. Las fuentes respaldan las afirmaciones específicas citadas; no certifican la integración comercial de Tesis ni sustituyen pruebas autenticadas.

| Fuente | Alcance de la evidencia |
|---|---|
| [IOL API](https://api.invertironline.com/Help) | Habilitación, tokens y distinción entre entorno real y sandbox. |
| [Roxom API](https://docs.roxom.com/api-reference) | Entornos y productos destacados en la introducción. |
| [Roxom autenticación](https://docs.roxom.com/api-reference/authentication) | Mecanismo de firma para acceso a la API. |
| [Roxom instrumentos](https://docs.roxom.com/api-reference/market/trading-instruments) | Contrato del catálogo, tipos y unidades. |
| [Roxom saldos](https://docs.roxom.com/api-reference/accounts/get-account-balance) | Contrato de consulta de saldos. |
| [Roxom One Click Trade](https://docs.roxom.com/help-center/one-click-trade/what-is-one-click-trade-what-assets-are-available) | Descripción del producto; no confirma un endpoint de ejecución para Tesis. |
| [CNV Resolución General 1002 de 2024](https://www.boletinoficial.gob.ar/pdf/aviso/primera/307566/20250507) | Distinción entre asesoramiento y contenido general; requiere revisión normativa consolidada. |
| [Ley 25326](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/texto) | Marco de datos personales y definición de datos sensibles. |

### 28.4 Qué este documento no verifica

No verifica facturación o arquitectura de Supertake; tamaño del mercado pagador; interés de compra de IOL o Mercado Pago; precios contratables de datos; condiciones comerciales de brokers; disponibilidad de instrumentos en una cuenta concreta; desempeño financiero futuro; capacidad de la Raspberry bajo carga; ni una conclusión jurídica definitiva.

### 28.5 Registro de decisiones para continuar

Cada decisión posterior deberá registrar fecha, responsable, alternativa elegida, evidencia, consecuencias y secciones afectadas. Las modificaciones a alcance comercial, instrumentos, ejecución, fuentes, precios o privacidad requieren revisar sus dependencias. El PRD es la base vigente de especificación; el código, las pruebas y los acuerdos determinarán qué capacidades se pueden declarar efectivamente disponibles.


