# Migración 2C (esquema v13 → v14)

Kill switch + presupuesto global. No semáforo/scheduler justo (2D). `PRAGMA user_version` pasa de 13 a 14.

## Qué hace

| Versión | Cambio |
|---|---|
| v14 | Tabla `ai_control` de una fila: `enabled` (default 1), `monthly_cap_usd` (default 20, Diego), `daily_cap_usd` opcional, flags de alerta 80 % por mes/día. |

Aditivo e idempotente: `CREATE TABLE IF NOT EXISTS`, `INSERT` de la fila `id=1` solo si no existe. Vacía de uso: no hay backfill.

La suma de gasto es `SUM(user_usage.est_cost_micro)` del mes (y del día, si hay tope diario) en `America/Buenos_Aires`. El chequeo corre **antes** de `reserve()` y de OpenAI.

## Precios en null (hoy)

`settings.modelPrices` sigue con tarifas `null`. No se inventan precios. Mientras no haya una tarifa > 0:

- `est_cost_micro` de las llamadas nuevas sigue en 0
- el presupuesto **no** auto-pausa (el gasto medible es 0)
- el kill switch `ai.enabled` sí corta
- el superadmin ve el aviso persistente «Precios sin cargar: el presupuesto no se puede medir»

## Rollback

Tabla nueva aditiva. La imagen v13 **arranca** sobre la base v14 (ignora `ai_control`). Para volver atrás del todo: snapshot + imagen anterior.

## Verificación

```sh
DATA_DIR=/app/data node scripts/migrate-check.mjs
```

Espera `ok: true`, `userVersion: 14`. El script no imprime hashes ni secretos del vault.
