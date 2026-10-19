# Migración 2A (esquema v11 → v12)

Solo medición. No cuotas (2B), ni kill switch (2C), ni scheduler justo (2D). `PRAGMA user_version` pasa de 11 a 12.

## Qué hace

| Versión | Cambio |
|---|---|
| v12 | Tabla `user_usage(user_id, day, kind, calls, prompt_tokens, completion_tokens, est_cost_micro)` con `day` en `America/Buenos_Aires` y `kind` ∈ chat/review/research/preview. Índice `(day, user_id)`. Seed aditivo de `settings.modelPrices` **solo** con ids de modelo que ya usa el código (`gpt-5-mini`), precios en `null` (configuración, no tarifas facturadas). |

Aditivo e idempotente: `CREATE TABLE/INDEX IF NOT EXISTS`, `INSERT` de precios solo si la clave no existe. Vacía: no hay backfill desde `consumption` (ese contador sigue global en UTC, como hoy).

La migración es barata (DDL + un `INSERT` de settings). Corre en el `BEGIN IMMEDIATE` de `migrateStore`.

## Rollback

Las columnas/tablas nuevas son aditivas. La imagen v11 **arranca** sobre la base v12 (ignora `user_usage`). Para volver atrás del todo: snapshot + imagen anterior.

## Verificación

```sh
DATA_DIR=/app/data node scripts/migrate-check.mjs
```

Espera `ok: true`, `userVersion: 12`. El script no imprime hashes ni secretos del vault.
