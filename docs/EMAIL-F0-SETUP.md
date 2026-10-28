# Email Alerts F0 - Setup Guide

## Overview

Esta guía documenta la configuración manual necesaria para activar **Email Alerts F0** en producción. F0 es la fundación (foundation) que incluye:

- ✅ Verificación de email
- ✅ Preferencias de usuario (trades ON si tiene Automático; news OFF por defecto)
- ✅ Lista de supresión (bounce/complaint/unsubscribe)
- ✅ Límite diario de 5 emails/usuario
- ✅ Outbox + worker que envía con Resend API (HTTP fetch nativo, sin npm)
- ✅ Headers `List-Unsubscribe` en cada mensaje
- ✅ Copy educativo en español: dinero simulado, no asesoramiento
- ✅ Migrations: v19 crea `email_outbox`, `email_prefs`, `email_suppressions`, `email_verification_tokens`, `email_daily_counts`

**F0 NO incluye** (F1):
- Emails automáticos de trade/pausa agrupados ~15min
- Digest diario ~18:00 ART con movimientos + RSS keywords de cartera
- Ventana de silencio 22–08 ART

---

## 1. DNS Configuration

### Domain: `laviste.diegodella.ar`

Para que Resend pueda enviar desde `alertas@laviste.diegodella.ar`, configurá estos registros DNS:

#### SPF (TXT record)
```
Type: TXT
Host: @ (or laviste.diegodella.ar)
Value: v=spf1 include:amazonses.com include:_spf.resend.com ~all
```

#### DKIM (CNAME records)
Resend te dará 3 CNAMEs específicos después de agregar el dominio en su dashboard. Ejemplo:

```
Type: CNAME
Host: resend._domainkey
Value: resend._domainkey.resend.com

Type: CNAME
Host: resend2._domainkey
Value: resend2._domainkey.resend.com

Type: CNAME
Host: resend3._domainkey
Value: resend3._domainkey.resend.com
```

#### DMARC (TXT record)
```
Type: TXT
Host: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:diego@diegodella.ar
```

**Nota:** Los valores exactos de DKIM dependen de tu cuenta Resend. Verificá en el dashboard de Resend bajo **Domains → laviste.diegodella.ar → DNS Records**.

---

## 2. Resend Setup

1. **Cuenta Resend:**
   - Creá una cuenta en [https://resend.com](https://resend.com) si no tenés.
   - Plan Free: 3,000 emails/mes, suficiente para canary owner-only (~1 usuario × 5 emails/día × 30 días = 150/mes).

2. **Dominio Verificado:**
   - En el dashboard de Resend: **Domains → Add Domain**.
   - Ingresá `laviste.diegodella.ar`.
   - Seguí las instrucciones para agregar los registros DNS (SPF, DKIM, DMARC).
   - Esperá la verificación (puede tardar hasta 48hs, usualmente < 1h).

3. **API Key:**
   - En **API Keys → Create API Key**.
   - Copiá la clave (comienza con `re_...`).
   - Guardala en el servidor como variable de entorno (ver siguiente sección).

---

## 3. Environment Variables

### En el servidor (producción), agregá:

```bash
# Email Alerts F0
FEATURE_EMAIL=1
RESEND_API_KEY=re_...tu_clave_aqui...
```

**Importante:**
- `FEATURE_EMAIL=0` (o ausente) → feature deshabilitado, no envía nada.
- `RESEND_API_KEY` ausente → worker no crashea, solo loggea error y no envía.

### Cómo setear en Docker/Pi:

Si usás `compose.yaml` (producción):
```yaml
environment:
  FEATURE_EMAIL: "1"
  RESEND_API_KEY: "re_...tu_clave..."
```

O con archivo `.env` en el servidor (recomendado para secretos):
```bash
echo "FEATURE_EMAIL=1" >> .env
echo "RESEND_API_KEY=re_..." >> .env
chmod 600 .env
```

---

## 4. Testing Email Flow (Local)

### 4.1. Verificación de email

1. **Usuario debe verificar su email antes de recibir alertas:**
   - POST `/api/me/email/request-verification`
   - El usuario recibe un email con un link de verificación.
   - Hacé clic en el link o llamá POST `/api/email/verify` con `{token: "..."}`.

2. **Verificá que el usuario tenga `email_verified = 1`:**
   ```sql
   SELECT email, email_verified FROM users WHERE id = 'user-id';
   ```

### 4.2. Envío manual (dev/test)

Podés encolar un mensaje de prueba en la DB directamente:

```javascript
// En node REPL o script
import {createStore} from './lib/store.mjs';
import {enqueueEmail} from './lib/email.mjs';

const store = createStore('./data');
const userId = store.ownerUserId();

enqueueEmail(store.db, {
  userId,
  template: 'test',
  toEmail: 'tu-email@example.com',
  subject: 'Prueba La Viste',
  bodyText: 'Esto es una prueba de email alert.\n\nEste mensaje es educativo y simulado. No constituye asesoramiento financiero.\nLa Viste es un simulador con dinero de práctica, no real.',
  bodyHtml: null,
  meta: {},
});

store.close();
```

Luego esperá a que el worker (1 min tick) procese el outbox, o correlo manualmente:

```javascript
import {processOutbox} from './lib/email.mjs';
await processOutbox(store.db, {apiKey: process.env.RESEND_API_KEY, env: process.env});
```

---

## 5. Canary / Owner-Only

**F0 por defecto NO tiene canary automático en código**, pero podés habilitarlo con lógica adicional:

1. Seteá `FEATURE_EMAIL=1` **solo en producción** (no en staging/dev).
2. En F1, podés agregar una columna `email_beta_enabled` en `users` y solo enviar si `user.role === 'superadmin' || user.email_beta_enabled`.

Para owner-only (1 semana):
- No expongas el UI de "Activar email alerts" a usuarios regulares.
- Solo el superadmin (owner) puede acceder a `/api/me/email/prefs`.
- Después de 1 semana, removés el guard y todos los usuarios ven la opción.

---

## 6. Preferencias de Email

### Defaults (F0):
- **trades_enabled**: `1` si el usuario tiene una tesis con `auto_policy.enabled = 1`; `0` en caso contrario.
- **news_enabled**: `0` (off por defecto).
- **threshold_asset_pct**: `5.0` (±5% cambio en un activo).
- **threshold_portfolio_pct**: `3.0` (±3% cambio en cartera total).

### API:
- **GET** `/api/me/email/prefs` → devuelve prefs del usuario.
- **PUT** `/api/me/email/prefs` con body JSON: `{tradesEnabled: true, newsEnabled: false, thresholdAssetPct: 10.0}`.

---

## 7. Suppression List

Usuarios pueden "darse de baja" manualmente:
- **POST** `/api/email/unsubscribe` con `{email: "user@example.com"}` → agrega a `email_suppressions` con reason `unsubscribe`.
- Bounce/complaint: en F1, conectás webhook de Resend para agregar automáticamente.

Worker respeta `email_suppressions` antes de enviar.

---

## 8. Rate Limit: 5 emails/día/usuario

El worker (`lib/email-worker.mjs`) corre cada 1 minuto y procesa outbox:
- Consulta `email_daily_counts` para el día actual.
- Si `count >= 5`, marca el email como `failed` con reason `Daily limit reached`.

**F1** agrupará trades/pausas en ~15min para reducir volumen.

---

## 9. Monitoring & Logs

El worker loggea eventos:
```json
{
  "event": "email_worker_tick",
  "processed": 2,
  "sent": 1,
  "skipped": 0,
  "failed": 1
}
```

**Errores comunes:**
- `Email not verified` → usuario no verificó su email.
- `Suppressed: bounce` → email rebotó, está en lista de supresión.
- `Daily limit reached (5)` → usuario alcanzó el límite diario.
- `RESEND_API_KEY not configured` → falta la key en env.

---

## 10. Checklist Pre-Producción

- [ ] DNS: SPF, DKIM (3 CNAMEs), DMARC configurados en `laviste.diegodella.ar`.
- [ ] Resend: dominio verificado (status "Verified" en dashboard).
- [ ] Resend: API key generada y guardada como `RESEND_API_KEY` en servidor.
- [ ] Env vars: `FEATURE_EMAIL=1` y `RESEND_API_KEY=re_...` seteadas.
- [ ] Migrations: corridas hasta v19 (`PRAGMA user_version` = 19).
- [ ] Tests: `npm test -- test/email-f0.test.mjs` pasa.
- [ ] UI (opcional): agregar pantalla en `/app#/cuenta/email` para ver/editar prefs y verificar email.
- [ ] Smoke test: enviar 1 email de prueba a tu propio email verificado.

---

## 11. Files Touched (F0)

### New Files:
- `lib/email.mjs` — core email logic (enqueue, send, verify, prefs, suppression, rate limit).
- `lib/email-worker.mjs` — background worker que procesa outbox cada 1 min.
- `test/email-f0.test.mjs` — tests completos para F0.
- `docs/EMAIL-F0-SETUP.md` — esta guía.

### Modified Files:
- `lib/migrations/multiuser.mjs` — migration v19 (email tables, `users.email_verified`).
- `lib/features.mjs` — `emailEnabled()` flag.
- `server.mjs` — API routes: `/api/me/email/prefs`, `/api/me/email/request-verification`, `/api/email/verify`, `/api/email/unsubscribe`.
- `.env.example` — documentación de `FEATURE_EMAIL` y `RESEND_API_KEY`.

### Migration user_version: 18 → 19

Run `npm start` para aplicar automáticamente. O manualmente:
```bash
node -e "
import {createStore} from './lib/store.mjs';
const store = createStore('./data');
console.log('user_version:', store.userVersion());
store.close();
"
```

---

## 12. F1 Scope (Out of F0)

**No implementado en este PR:**
- Auto trade/pause event emails (agrupados ~15min).
- Daily digest ~18:00 ART (movimientos + RSS keywords).
- Silence window 22–08 ART.
- Webhook de Resend para bounce/complaint automático.
- UI completo en `/app#/cuenta/email`.

**F1 será un PR separado** después de verificar F0 en producción ~1 semana.

---

## Support

Cualquier duda o problema, abrí un issue en el repo o contactá a Diego directamente.

**Email F0 Foundation:** ✅ Listo para deploy con feature flag off por defecto.
