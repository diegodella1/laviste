# Migración GL1 (esquema v15 → v16)

Login con Google (OIDC authorization code + PKCE). `PRAGMA user_version` pasa de 15 a 16. No crea usuarios.

## Qué hace

| Versión | Cambio |
|---|---|
| v16 | `users.google_sub TEXT`, `users.google_linked_at TEXT`, índice único parcial `users_google_sub` (`WHERE google_sub IS NOT NULL`). |

Aditivo e idempotente: `PRAGMA table_info` antes de cada `ALTER`, `CREATE UNIQUE INDEX IF NOT EXISTS`. Vacío: nadie queda vinculado hasta el primer login Google con email verificado.

El `sub` de Google es el identificador estable. El email solo sirve para el primer vínculo (case-insensitive; `users.email` ya está en minúsculas).

## Rollback

Columnas e índice nuevos son aditivos. La imagen v15 **arranca** sobre la base v16 (ignora `google_sub` / `google_linked_at`; el login por contraseña no las toca). Para volver atrás del todo: snapshot + imagen anterior.

## Secretos

`GOOGLE_CLIENT_ID_FILE` y `GOOGLE_CLIENT_SECRET_FILE` apuntan a `/run/secrets/google_client_id` y `/run/secrets/google_client_secret`. Si los archivos faltan o no se pueden leer, Google queda deshabilitado: `/api/auth/google/*` responde 404, el botón no aparece y el server arranca. El contenedor *candidate* de `release.mjs` no monta secretos.

`GOOGLE_ALLOW_SUPERADMIN` ausente o distinto de `1`/`true`/`yes` bloquea el login Google del owner/superadmin (sigue la contraseña).

Nunca loguear el secreto, el `code` ni los tokens. Google puede borrar un cliente OAuth sin uso a los 6 meses; se restaura desde el mismo cliente (Add secret) dentro de 30 días.

## Verificación

```sh
DATA_DIR=/app/data node scripts/migrate-check.mjs
```

Espera `ok: true`, `userVersion: 16`. El script no imprime hashes, secretos del vault ni tokens de Google.
