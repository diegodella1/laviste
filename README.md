# La Viste

MVP personal: idea → conversación con OpenAI → cartera de práctica → seguimiento de noticias con fuentes. Acceso privado con correo y contraseña. IOL opcional de solo lectura.

Interfaz **Suizo**: fondo blanco, tipografía Instrument Sans, acentos azules, bordes hairline y radios mínimos (superficies planas, controles 2px).

## Uso

1. Abrí https://laviste.diegodella.ar/app e ingresá `Diego@diegodella.ar` con la contraseña de `secrets/app-password`.
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
| Cartera | Dinero de práctica en ARS; precios demorados de BYMA/CEDEARs (data912 en producción, fixtures en tests). Unidades enteras. Sin comisiones, dividendos, órdenes ni rentabilidad real. |
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

### Clave de administración del agente (Pi)

La pantalla **Admin · Agente** (`/app/admin`) y la API `/api/admin/*` requieren la contraseña del espacio y una clave admin separada (mínimo 24 caracteres), montada como archivo de solo lectura en el contenedor:

```sh
umask 077
openssl rand -base64 36 > /home/diego/laviste/secrets/admin_key
chmod 600 /home/diego/laviste/secrets/admin_key
```

En `compose.yaml` la variable es `ADMIN_KEY_FILE: /run/secrets/admin_key` (el directorio `secrets/` del host se monta en `/run/secrets`). Sin ese archivo o con una clave corta, la administración del prompt queda deshabilitada.

## CI/CD automático

Un push a `main` (incluido un merge) dispara **CI / CD**. También puede ejecutarse manualmente desde Actions sobre `main`.

1. El runner privado `laviste-production` hace checkout del commit en su propio directorio, instala dependencias, comprueba sintaxis y páginas generadas, ejecuta tests y los recorridos de navegador.
2. Solo si todo pasa, construye una imagen `laviste:<SHA completo>` desde un archivo Git de ese commit. La prueba previa corre esa misma imagen en un contenedor temporal con base vacía y sin credenciales de producción.
3. Comprueba que el commit sigue siendo la punta de `main`, guarda la configuración e imágenes actuales y crea un backup SQLite.
4. Cambia producción conservando el volumen y los secretos existentes. Verifica salud local, HTTPS público, el SHA servido, login y protecciones de la API sin consumir proveedores.
5. Si falla el cambio o la verificación, restaura automáticamente las imágenes y configuración anteriores. El job queda fallido aunque la recuperación resulte exitosa.

Los despliegues se serializan con `concurrency` de Actions y `flock` local. Un push nuevo no interrumpe una publicación en marcha; los commits ya superados se descartan antes de promoverlos. El environment `production` admite únicamente la rama `main`.

La caché de npm se guarda dentro del checkout de CI y se limita a este proyecto; no se empaqueta la caché compartida del usuario del servidor.

Las PR y los pushes a otras ramas usan `ubuntu-24.04` de GitHub y nunca despliegan. Si GitHub no asigna runner, esas verificaciones quedarán pendientes o fallarán por infraestructura; `main` tiene un runner dedicado y no depende de esa capacidad. El runner local ejecuta código de `main` con el usuario `diego`, por lo que dar permiso de escritura en esa rama también autoriza cambios en este servidor.

Para reconstruir el runner, descargar el paquete ARM64 oficial y verificar su SHA-256, extraerlo en `work/actions-runner/`, ejecutar `node scripts/register-runner.mjs` con `gh` autenticado como administrador y reinstalar `scripts/laviste-runner.service`. El registro no imprime ni persiste el token temporal en el repositorio.

El servicio `laviste-runner.service` arranca con el servidor y se reinicia ante fallos. Su instalación está en `work/actions-runner/`, ignorada por Git. Credenciales OpenAI/IOL, contraseña y clave maestra siguen en el servidor: no se cargan en GitHub Secrets ni en artifacts. Los artifacts de errores contienen únicamente capturas de tests con datos ficticios.

Estado y recuperación:

- Actions muestra tests y despliegue como jobs separados: https://github.com/diegodella1/laviste/actions
- `GET /api/health` informa `revision`, el commit publicado.
- `work/deploy/current.json` registra la última publicación verificada y las rutas de configuración para recuperación.
- `work/releases/<SHA>/` conserva el código utilizado. El checkout de desarrollo no se modifica al publicar.
- `systemctl status laviste-runner.service` y `journalctl -u laviste-runner.service` permiten diagnosticar el runner.
- Para volver manualmente, usar `docker compose --file <previousConfig de current.json> up -d --no-build --pull never --wait` bajo el mismo lock `work/deploy/production.lock`, y verificar salud/HTTPS. No borrar el volumen de datos.

El rollback automático revierte aplicación y configuración; no restaura la base porque las migraciones actuales son aditivas. Una migración destructiva futura necesita un procedimiento de restauración específico antes de publicarse. El script `scripts/deploy.sh` queda como alternativa manual local; el camino normal es push a `main`.

Referencia de instalación: [servicio del runner oficial de GitHub](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application).

## Backups y recuperación

Antes de publicar la migración de esquema v9–v11 (multiusuario 1A) hay que forzar un snapshot y copiarlo **fuera del volumen**. Pasos: `docs/MIGRATION-1A.md`. El servicio `backup` crea una copia SQLite consistente al iniciar y cada 24 horas; conserva siete en `backups/`. Se puede forzar otra con:

```sh
docker compose exec -T app node scripts/backup.mjs
```

La instalación deja una copia protegida de las claves iniciales en `backups/recovery/`, separada de los archivos SQLite. Copiar también `secrets/` a un destino privado independiente y actualizar esa copia si se rotan claves. El respaldo local no protege contra pérdida del disco completo. La exportación web conserva tesis, conversaciones, versiones y revisiones; no incluye credenciales ni constituye un restaurador completo.

Para restaurar: detener app y backup, conservar una copia del volumen actual, sustituir `tesis.sqlite` por el respaldo elegido y quitar sus WAL/SHM anteriores con el servicio detenido, asegurar propietario UID 1000, recuperar `secrets/` correspondiente y levantar Compose. Ensayar primero en un volumen aislado. No ejecutar `docker compose down -v` sobre producción.

Comprobación de publicación: `node scripts/smoke.mjs` verifica HTTPS, login, cookies, bloqueo sin OpenAI y ausencia de archivos privados expuestos, sin consumir APIs.

Las actualizaciones respaldan datos y conservan la imagen anterior como `laviste:previous`. Para volver a ella: `RELEASE_TAG=previous docker compose up -d --no-build --wait`. Las migraciones actuales son aditivas; ante una migración futura incompatible también habrá que restaurar el respaldo previo.

## Arquitectura y límites

Monolito Node + SQLite WAL. Cola persistente con un investigador concurrente. Trabajo ligado a versión: si la tesis cambia durante la búsqueda, el resultado queda histórico y se programa recuperación. Reinicios registran interrupciones; nunca inventan revisiones perdidas. Una falla de fuente no borra una alerta anterior.

Claves cifradas en SQLite; tokens IOL renovados en el servidor; sesiones de 12 horas en SQLite (el token se guarda hasheado; sobreviven un reinicio). Restricción de origen, CSP, límite de login por correo+IP y cuotas persistentes. No hay registro público ni aislamiento de rutas todavía. El chat recibe tesis e informes recientes, nunca credenciales IOL.

Documentación original: `PRD-Tesis.md`, `docs/POC-original.md`. Auditoría PRD↔código (Phase 0): `docs/PRD-CODE-AUDIT-PHASE0.md`. El PRD incluye etapas futuras; no todas forman parte de este MVP. Roxom queda como adaptador histórico sin controles expuestos en esta entrega.

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
