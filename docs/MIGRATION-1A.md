# Migración 1A (esquema v9–v11)

Solo esquema. No cambia login, rutas ni `store.forUser` (eso es 1B–1D). `PRAGMA user_version` pasa de 8 a 11.

## Backup obligatorio antes del deploy

La migración es aditiva e idempotente, pero hay que conservar un snapshot **fuera del volumen del Pi** (el servicio `backup` retiene 7 copias en `LAVISTE_RUNTIME_DIR/backups` del mismo disco).

1. Con la app en marcha:
   ```sh
   docker compose exec -T app node scripts/backup.mjs
   ```
2. Copiar el `.sqlite` más nuevo de `backups/` a Magrathea o al entorno de desarrollo (`scp`).
3. Ensayar `createStore` / `scripts/migrate-check.mjs` sobre **esa copia**, no sobre la base viva.
4. Recién ahí mergear/desplegar 1A. El arranque corre `migrateStore` dentro de `BEGIN IMMEDIATE`; si falla, `ROLLBACK` deja `user_version` anterior.

## Qué hace

| Versión | Cambio |
|---|---|
| v9 | Tablas `users`, `sessions`, `audit_log`. Owner `role=superadmin`, email `OWNER_EMAIL` (default `diego@diegodella.ar`, normalizado a minúsculas). `password_hash` scrypt de `APP_PASSWORD(_FILE)` **sin rotar** la contraseña. Id fijo en `meta.ownerUserId`. |
| v10 | `user_id` nullable (`REFERENCES users(id)`, DEFAULT NULL — SQLite no admite DEFAULT no-NULL con FK en ADD COLUMN) en takes/chats/versions/reviews/jobs/ops/orders; backfill al owner; aborta si queda algún NULL. |
| v11 | Índices por `user_id` y triggers `BEFORE INSERT/UPDATE` que abortan `user_id` NULL o hijo cuyo `user_id` no coincide con el de su `take` (el match solo corre si el take existe: tests y el ledger actuales a veces escriben ops antes de persistir la tesis). |

Cuotas (`user_usage` / `user_limits`), invitaciones e idempotency-por-usuario son fases 2/3, no esta PR.

## Rollback

- Restaurar el snapshot del paso 1 y redeploy de la imagen anterior (`RELEASE_TAG` previo).
- Revertir **solo código** sobre la base ya migrada: las columnas nuevas son aditivas. Las lecturas (`SELECT data FROM takes`, etc.) siguen andando. SQLite **no permite** `ADD COLUMN … REFERENCES` con DEFAULT distinto de NULL (verificado en código); `user_id` queda nullable y los triggers abortan INSERT/UPDATE con NULL. La imagen pre-1A **arranca y lee**, pero cualquier escritura que omita `user_id` falla. Si hace falta escribir, restaurar el snapshot + imagen anterior.

## Verificación

```sh
DATA_DIR=/app/data node scripts/migrate-check.mjs
```

Espera `ok: true`, `userVersion: 11`, `nullUserIds.* = 0`, `integrity: ok`, mismo checksum de `ops(id,amount,at)` que antes de migrar. El script no imprime hashes ni secretos del vault.
