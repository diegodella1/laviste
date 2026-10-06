# Tesis — PoC personal para Raspberry Pi

> **Nota histórica:** este documento describe la PoC original (tema oscuro, copy y flujos de demo). La app actual usa tema Suizo, precios demorados BYMA/CEDEARs en ARS y copy de práctica sin «activar simulación» ni la plantilla «La IA sale de la nube».

Experiencia inspirada en Supertake: conversar una idea, guardar una propuesta, activar una cartera de práctica y seguir su tesis. Identidad independiente; sin afiliación con Supertake, IOL o Roxom.

## Qué funciona

- Inicio, takes, posiciones, tesis editable, preferencias y actividad.
- Conversación real con OpenAI Responses API y respuestas estructuradas. El servidor valida los instrumentos y pesos antes de aceptar una propuesta.
- Historial de conversaciones y carteras en SQLite (disco del servidor).
- Activación con unidades enteras, efectivo remanente y cálculos en el servidor.
- Escenarios reproducibles: caída, contradicción de tesis, recuperación y vuelta a la base.
- Revisión periódica de reglas, con registro de estado y próxima ejecución. El servidor recupera una revisión vencida al reiniciar; no reproduce todas las revisiones omitidas.
- Contraseña para acceso por red, cookies HttpOnly, control de origen, límite diario de llamadas IA y exportación JSON.
- Adaptador Roxom de **consulta**: catálogo y saldos, autenticación RSA-SHA256, sandbox por defecto y decimales conservados como texto. Necesita credenciales para verificarlo contra Roxom.

## Qué está simulado o pendiente

Los precios, referencias de activos, historias y eventos de las takes son ficticios, expresados en ARS solo para la demo. No verifican la disponibilidad de CEDEARs ni de instrumentos en un broker. No incluyen comisiones, dividendos, splits, impuestos ni costos de ejecución. El gráfico del inicio mide variación sobre aportes; los depósitos no se contabilizan como ganancia. Su referencia comparativa también es ficticia.

El chat es IA real cuando se configura una clave. No tiene búsqueda web, noticias en vivo ni cotizaciones actuales. Si no hay clave, no genera respuestas falsas: se puede explorar mediante plantillas. Las revisiones periódicas comprueban reglas sobre el último escenario y no llaman a OpenAI.

No hay operaciones reales ni piloto automático, integración IOL, gestión multiusuario, backtesting, feed social o enlaces públicos. Los ejemplos son hipótesis ilustrativas, no recomendaciones. La PoC es un espacio personal; antes de ofrecerla como servicio hace falta trabajo adicional en datos, identidad, observabilidad y encuadre del servicio.

## Arranque local

Requiere Node.js 22.15 o superior de la rama 22, o Node 24. No hay dependencias npm de producción ni paso de compilación. Node 22 puede mostrar un aviso experimental por `node:sqlite`.

```sh
cp .env.example .env
# Editar .env y configurar OPENAI_API_KEY. No subirlo a Git ni compartirlo.
npm start
```

Abrir http://127.0.0.1:3080. En Windows, usar `Copy-Item .env.example .env`.

`OPENAI_MODEL=gpt-5-mini` es configurable. La clave debe tener acceso al modelo y facturación disponible. Una suscripción a ChatGPT no es una clave API. Las conversaciones y el contexto de la take se envían a OpenAI, usando `store:false`; el historial local permanece en SQLite. El límite diario cuenta intentos, incluso si el proveedor falla; se reinicia a las 00:00 UTC. No es un tope monetario: configurar también un presupuesto en el proyecto de OpenAI.

## Raspberry Pi 5 — Docker

Usar un sistema operativo de 64 bits y Docker con Compose ya instalado. La imagen oficial de Node admite ARM64. El Dockerfile y Compose están preparados para Raspberry, pero el build debe verificarse en ese equipo.

1. Copiar esta carpeta a la Raspberry.
2. Copiar `.env.example` a `.env`.
3. Configurar `OPENAI_API_KEY` y `APP_PASSWORD` (al menos 12 caracteres).
4. Ejecutar:

```sh
mkdir -p secrets
docker compose up -d --build
docker compose logs --tail=30
```

Por defecto solo publica en localhost de la Raspberry. Desde tu PC podés abrir un túnel:

```sh
ssh -L 3080:127.0.0.1:3080 usuario@raspberrypi.local
```

Después abrir http://127.0.0.1:3080 en tu PC. Si ese puerto ya lo ocupa la demo local, usar `-L 3081:127.0.0.1:3080` y abrir el puerto 3081.

Para uso en una LAN privada, configurar `BIND_ADDRESS` con la IP privada de la Pi antes de iniciar Compose. Para acceso por Internet usar un proxy HTTPS y `COOKIE_SECURE=true`; esta PoC no constituye una plataforma multiusuario lista para exposición pública.

Los datos sobreviven a reinicios en el volumen `tesis-data`. No ejecutar `docker compose down -v` si se quieren conservar. Se pueden exportar las takes y conversaciones desde Configuración; la exportación no incluye un importador. Para backup completo, detener el servicio y respaldar el volumen SQLite antes de actualizar.

## Raspberry sin Docker

Con Node 22.15+ instalado, usar `npm start` en esta carpeta. Para LAN configurar `HOST` con la IP privada y `APP_PASSWORD`; usar un supervisor del sistema para mantener el proceso después de cerrar SSH. El directorio `data/` contiene la base y sus archivos WAL, y debe conservarse. Para backup, detener el proceso y copiar todo `data/`.

## Roxom junto a IOL

Roxom es un adaptador independiente. Configuración opcional:

```dotenv
ROXOM_ENV=sandbox
ROXOM_API_KEY=tu_api_key_de_sandbox
ROXOM_PRIVATE_KEY_PATH=/app/secrets/roxom.pem
```

En Docker colocar la clave PKCS#8 RSA-2048 en `secrets/roxom.pem`, legible por UID 1000 y no por otros usuarios. En arranque sin Docker usar la ruta real del archivo. No pegar claves en el chat. Reiniciar y usar Configuración → Consultar Roxom. Se solicita `unit=btc`; las cantidades se muestran en sus unidades originales y nunca se suman a ARS.

Se implementaron únicamente GET `/v1/market/instruments` y `/v1/accounts/balance`, firmando exactamente método y ruta con query. No existen rutas de órdenes, retiros o apalancamiento en este adaptador. El catálogo recibido conserva `instrumentType`; no se asume que un futuro equivale a una acción o que One-Click Trade esté disponible por esta API.

La portada de documentación enfatiza perpetuos mientras el catálogo enumera tipos adicionales. Antes de construir carteras operables con Roxom hay que comprobar catálogo y capacidades reales de la cuenta, endpoint de ejecución de One-Click Trade, límites y derechos de integración. No se ha verificado una cuenta real ni sandbox sin credenciales.

IOL permanece como integración futura, no como conexión ficticia. Cada broker deberá aportar instrumentos con proveedor, mercado, identificador, clase, moneda, reglas de cantidad y permisos. Un mismo ticker no es suficiente para identificar un producto entre brokers.

## Desarrollo y comprobaciones

```sh
npm run check
npm test
npm run dev
```

Las pruebas usan bases temporales, respuestas OpenAI controladas y claves RSA generadas en memoria; no gastan tokens ni conectan cuentas. La verificación real de OpenAI y Roxom requiere configurar las credenciales propias y probar desde el entorno de destino.

Verificación de entrega: 12 pruebas automáticas aprobadas en Windows con Node 22.15.1; recorrido de navegador verificado para creación, activación, caída y guardado de frecuencia; vista móvil de 390 px sin desborde horizontal. Docker/ARM64 no se ejecutó en este equipo. Las APIs externas no se probaron con credenciales reales.

## Recorrido de demostración

1. Abrir Inicio y elegir una plantilla de tesis de ejemplo (p. ej. energía o bancos).
2. Comparar Novedades, Posiciones y La idea.
3. Probar escenario → Evidencia contraria. Ver el estado «Revisar tesis» y el evento guardado.
4. Probar recuperación, guardar preferencias y recargar la página.
5. Nueva take → elegir plantilla → revisar posiciones → activar práctica.
6. Con clave OpenAI: conversar sobre una hipótesis, responder preguntas de contexto y pedir una propuesta de práctica. Guardarla como borrador y activarla manualmente.

## Fuentes de implementación

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [OpenAI GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini)
- [Roxom: autenticación](https://docs.roxom.com/api-reference/authentication)
- [Roxom: instrumentos](https://docs.roxom.com/api-reference/market/trading-instruments)
- [Roxom: saldos](https://docs.roxom.com/api-reference/accounts/get-account-balance)
- [Roxom: One-Click Trade](https://docs.roxom.com/help-center/one-click-trade/what-is-one-click-trade-what-assets-are-available)

Documentación consultada el 5 de octubre de 2026. Los conectores deben revalidarse si cambia la API.
