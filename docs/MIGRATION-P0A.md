# Migración P0A · schema v17 (`password_resets`)

Aditiva e idempotente. `PRAGMA user_version` pasa de 16 a **17**.

## Tabla

```sql
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  source     TEXT NOT NULL CHECK(source IN ('admin','cli')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);
CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id);
```

El token en claro nunca se guarda: solo `sha256` (`hashToken`). Un token nuevo invalida los anteriores sin usar de esa cuenta. Las filas usadas o vencidas se purgan a los 7 días junto con `purgeExpired`.

`audit_log` se conserva 12 meses. `purgeAuditLog` borra filas con `at` anterior a esa ventana. Corre desde el mismo tick de `auth.purgeExpired` (cada 60 s en el server, con un tope de una vez por día). Es idempotente y no registra el contenido de las filas. El índice `audit_log_at` ya existe desde v9; no hace falta otro.

`source='email'` queda para el flujo futuro de reset self-serve. Un reset admin/CLI **nunca** deja `password_hash=''` (D5): `bootstrapOwnerPassword` rellenaría el hash vacío del owner al reiniciar.

## En el Pi

1. Backup: `docker compose exec -T app node scripts/backup.mjs`
2. Deploy de la imagen con este schema
3. `DATA_DIR=/app/data node scripts/migrate-check.mjs`

Correr la migración dos veces no falla. Rollback: restaurar el snapshot y redeployar la imagen anterior.

Nunca imprime hashes, tokens ni contraseñas.
