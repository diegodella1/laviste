# Migración AU1 (esquema v14 → v15)

Automático (práctica): esquema e invariantes. **Sin comportamiento.** No runner, no scheduler, no UI. `PRAGMA user_version` pasa de 14 a 15. Solo dinero simulado.

## Qué hace

| Versión | Cambio |
|---|---|
| v15 | `simulated INTEGER NOT NULL DEFAULT 1 CHECK(simulated=1)` en `ops` y `orders` (ALTER liviano; rebuild solo si este SQLite no aplica el CHECK). Tablas `auto_policies` (por tesis), `auto_signals`, `auto_trades`, cada una con `simulated` CHECK(simulated=1) y `user_id`. Triggers de coherencia `user_id` = `takes.user_id` (mismo patrón que v11). |

Aditivo e idempotente: `ALTER` de columna si falta, `CREATE TABLE/INDEX/TRIGGER IF NOT EXISTS`. Vacía: no hay backfill de políticas ni señales. Las filas existentes de `ops`/`orders` reciben `simulated=1` por DEFAULT; la migración aborta si alguna no pasa el CHECK.

Helpers de store: lectura e insert. El insert de auto_* fuerza `simulated=1`. `insertOp`/`insertOrder` no cambian: el DEFAULT cubre las escrituras actuales.

## Defaults (Diego)

Por tesis, apagado de fábrica:

- `news_trigger=0` (opción aparte; tesis rota no opera)
- 2 ejecuciones/día por tesis, rotación ≤ 50 %, 6/día por usuario
- tesis rota = `reduce_half_then_pause` (`floor(units/2)` y pausa)
- deshacer = contra-operación al precio actual, ventana 72 h
- canary `canary_owner_only=1` (solo owner)

## Rollback

Columnas y tablas nuevas son aditivas. La imagen v14 **arranca** sobre la base v15 (ignora `auto_*` y `simulated`; el DEFAULT 1 no rompe INSERT viejos). Para volver atrás del todo: snapshot + imagen anterior.

## Verificación

```sh
DATA_DIR=/app/data node scripts/migrate-check.mjs
```

Espera `ok: true`, `userVersion: 15`, `simulated.ops/orders = 0` filas distintas de 1. El script no imprime hashes ni secretos del vault.
