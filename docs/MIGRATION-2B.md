# Migración 2B (esquema v12 → v13)

Cuotas y rate limits por usuario. No kill switch (2C) ni semáforo/scheduler justo (2D). `PRAGMA user_version` pasa de 12 a 13.

## Qué hace

| Versión | Cambio |
|---|---|
| v13 | Tabla `user_limits` (override por usuario, columnas nullable = hereda el default). Tabla `user_quota(user_id, day, kind, units)` con `kind` ∈ chat/news/tokens y `day` en `America/Buenos_Aires`. Índice `(day, user_id)`. |

Aditivo e idempotente: `CREATE TABLE/INDEX IF NOT EXISTS`. Vacía: no hay backfill.

La reserva atómica es `INSERT OR IGNORE` + `UPDATE … SET units=units+n WHERE units+n<=limit`. Si la llamada IA falla, se hace `release` (resta). Los tokens se reservan por adelantado (`4000`, el `max_output_tokens` ya usado en `lib/openai.mjs`) y se reconcilian al uso real.

## Defaults (Diego) y superadmin

Por usuario, día calendario `America/Buenos_Aires`:

- 20 mensajes de chat / día
- 5 revisiones de noticias / día
- 100 000 tokens / día (prompt + completion)
- 3 tesis activas con monitoreo (se aplica al activar o al despausar seguimiento)
- 10 pedidos IA / minuto
- Tope de conversación: **100 mensajes** (el `chat.messages.length<100` que ya existía) y 4000 caracteres por mensaje. No es cuota diaria: responde 400 y pide abrir una nueva.

**Superadmin queda exento** de cuotas diarias, tesis en seguimiento y req/min. El tope de 100 mensajes por chat sí aplica. El override por usuario lo carga un superadmin con step-up (`PUT /api/admin/limits/:userId`). UI mínima en Admin · Agente.

`consumption` global (UTC) se sigue incrementando en éxitos para el kill switch de 2C; ya no es la traba por usuario.

## Rollback

Tablas nuevas aditivas. La imagen v12 **arranca** sobre la base v13 (ignora `user_limits` / `user_quota`). Para volver atrás del todo: snapshot + imagen anterior.

## Verificación

```sh
DATA_DIR=/app/data node scripts/migrate-check.mjs
```

Espera `ok: true`, `userVersion: 13`. El script no imprime hashes ni secretos del vault.
