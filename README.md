# La Viste

MVP personal: idea → conversación con OpenAI → cartera de práctica → seguimiento de noticias con fuentes. Acceso privado con contraseña. IOL opcional de solo lectura.

## Uso

1. Abrí https://laviste.diegodella.ar/app e ingresá la contraseña de `secrets/app-password`.
2. En **Configuración**, cargá tu clave OpenAI. Guardá y probá conversación y búsqueda web.
3. Conversá una idea, guardá la propuesta y activá dinero de práctica. OpenAI es obligatorio para crear y activar.
4. Las noticias se revisan al activar y luego diariamente. **Revisar ahora** inicia un trabajo en segundo plano. Podés elegir frecuencia semanal o manual, pausar o archivar.
5. Opcional: conectá IOL con una cuenta que tenga API habilitada. La contraseña se intercambia por tokens y no se persiste. Consultá saldos, posiciones argentinas y cotizaciones; no hay órdenes.

Las cuotas iniciales son 30 intentos de chat/pruebas y 10 revisiones de noticias por día UTC, compartidas por este espacio. Cada revisión admite hasta dos llamadas de modelo y dos búsquedas. Las pruebas, los intentos fallidos y los reintentos consumen cuota. Las cuotas no son un límite monetario del proveedor.

## Qué es real y qué es simulado

| Componente | Comportamiento |
|---|---|
| Conversación | OpenAI real, Responses con salida estructurada; no se inventan respuestas si falta clave. |
| Noticias | Búsqueda web real con OpenAI; fuentes, fecha disponible, inferencia y cobertura parcial visibles. No promete vigilancia exhaustiva. |
| Cartera | Unidades enteras y precios ficticios en ARS. Sin comisiones, dividendos, órdenes ni historial de rentabilidad real. |
| Escenarios | Vista aislada de demostración; no altera cartera guardada ni estado basado en noticias. |
| IOL | Saldos, posiciones y cotizaciones reales de consulta, separados de la práctica y de las búsquedas web. |

Sin IOL funciona todo el recorrido de práctica y seguimiento. Sin OpenAI permanece disponible configuración y lectura de datos existentes; no funcionan nuevas conversaciones, creaciones, activaciones ni búsquedas. Una respuesta de IA no equivale a guardar, invertir ni operar. Los enlaces de fuentes validan procedencia, no garantizan que una interpretación del modelo sea correcta.

## Desarrollo

Requiere Node 22.22.0+ y, para navegador, Chromium. Sin dependencias npm de producción.

```sh
npm ci
npm run setup
APP_PASSWORD_FILE=./secrets/app-password MASTER_KEY_FILE=./secrets/master.key npm start
npm run check
npm test
npm run test:browser
npm run test:site
```

Abrir http://127.0.0.1:3080. Para otro puerto usar `PORT=3475`. El test de navegador usa `/usr/bin/chromium`; puede configurarse `CHROMIUM_PATH` o `PLAYWRIGHT_USE_BUNDLED=true` después de `npx playwright install chromium`. Sus proveedores son fixtures y nunca consumen APIs reales.

## Despliegue

```sh
npm ci
npm run setup
bash scripts/deploy.sh
```

El script usa el constructor clásico en este equipo por un fallo de BuildKit; se puede seleccionar `DOCKER_BUILDKIT=1` cuando esté corregido.

Compose `laviste`: aplicación en `127.0.0.1:3474`, contenedor no root, raíz de solo lectura, volumen `laviste_laviste-data`. El túnel Cloudflare existente debe dirigir `laviste.diegodella.ar` a ese puerto. Cookies seguras; `APP_ORIGIN` fija el origen aceptado. No se necesita editar código ni reiniciar al cargar APIs.

Los secretos generados están en `secrets/`, permisos 0600. La clave maestra AES-256-GCM es independiente de SQLite; perderla impide recuperar las credenciales cifradas. Nunca subir secretos, `.env`, bases, ZIPs originales o backups a Git. El repositorio es privado y GitHub Actions ejecuta verificaciones con proveedores de prueba.

## Backups y recuperación

El servicio `backup` crea una copia SQLite consistente al iniciar y cada 24 horas; conserva siete en `backups/`. Se puede forzar otra con:

```sh
docker compose exec -T app node scripts/backup.mjs
```

La instalación deja una copia protegida de las claves iniciales en `backups/recovery/`, separada de los archivos SQLite. Copiar también `secrets/` a un destino privado independiente y actualizar esa copia si se rotan claves. El respaldo local no protege contra pérdida del disco completo. La exportación web conserva tesis, conversaciones, versiones y revisiones; no incluye credenciales ni constituye un restaurador completo.

Para restaurar: detener app y backup, conservar una copia del volumen actual, sustituir `tesis.sqlite` por el respaldo elegido y quitar sus WAL/SHM anteriores con el servicio detenido, asegurar propietario UID 1000, recuperar `secrets/` correspondiente y levantar Compose. Ensayar primero en un volumen aislado. No ejecutar `docker compose down -v` sobre producción.

Comprobación de publicación: `node scripts/smoke.mjs` verifica HTTPS, login, cookies, bloqueo sin OpenAI y ausencia de archivos privados expuestos, sin consumir APIs.

Las actualizaciones respaldan datos y conservan la imagen anterior como `laviste:previous`. Para volver a ella: `RELEASE_TAG=previous docker compose up -d --no-build --wait`. Las migraciones actuales son aditivas; ante una migración futura incompatible también habrá que restaurar el respaldo previo.

## Arquitectura y límites

Monolito Node + SQLite WAL. Cola persistente con un investigador concurrente. Trabajo ligado a versión: si la tesis cambia durante la búsqueda, el resultado queda histórico y se programa recuperación. Reinicios registran interrupciones; nunca inventan revisiones perdidas. Una falla de fuente no borra una alerta anterior.

Claves cifradas en SQLite; tokens IOL renovados en el servidor; sesiones de 12 horas en memoria (reiniciar exige nuevo login). Restricción de origen, CSP, límite global de login y cuotas persistentes. No hay registro público ni aislamiento multiusuario. El chat recibe tesis e informes recientes, nunca credenciales IOL.

Documentación original: `PRD-Tesis.md`, `docs/POC-original.md`. El PRD incluye etapas futuras; no todas forman parte de este MVP. Roxom queda como adaptador histórico sin controles expuestos en esta entrega.

## Referencias verificadas

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Web Search](https://developers.openai.com/api/docs/guides/tools-web-search)
- [IOL autenticación](https://api.invertironline.com/Help/Autenticacion)
- [IOL contrato Swagger v2](https://api.invertironline.com/v2/swagger)

Las pruebas autenticadas contra OpenAI e IOL requieren las credenciales del propietario. Hasta cargarlas, los tests automáticos verifican contratos con fixtures, no disponibilidad de la cuenta externa.

## Sitio e identidad

La portada pública está en `/`, el método en `/como-funciona`, la presentación en `/acerca` y los detalles del producto en `/privacidad` y `/alcance`. El espacio privado vive en `/app`; los antiguos enlaces `/#/...` se redirigen a esa ruta.

Las páginas estáticas se generan con `npm run build:site` desde `scripts/build-site.mjs` y se versionan en `public/`. Al cambiar el contenido, regenerarlas antes del despliegue. `brand.css` comparte Space Grotesk, IBM Plex Mono y DM Sans, con una paleta oscura de acentos menta y cian entre el sitio y la aplicación; las fuentes son locales con licencia OFL incluida. `site.css` define la estructura pública, `terminal.css` el observatorio visual y `app-theme.css` la terminal privada. `icons.js` reúne la iconografía SVG compartida; los símbolos acompañan etiquetas de texto. El radar de portada es ilustrativo y su movimiento respeta la preferencia de movimiento reducido.

`npm run test:site` verifica las cinco páginas, menú móvil, preguntas frecuentes, ejemplo interactivo, enlaces y acceso protegido. Captura vistas de 1440, 390 y 360 píxeles en `work/`. `GENERATE_SOCIAL=1 npm run test:site` regenera además la imagen para compartir.
