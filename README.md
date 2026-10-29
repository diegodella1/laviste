# La Viste

[![CI / CD](https://github.com/diegodella1/laviste/actions/workflows/check.yml/badge.svg)](https://github.com/diegodella1/laviste/actions/workflows/check.yml)
![Node](https://img.shields.io/badge/node-22.22.0%2B-brightgreen)

**🌐 English** | **🇦🇷 Español**

---

## What is La Viste? | ¿Qué es La Viste?

**EN:** La Viste is an educational investment simulator for the Argentine market. Create investment theses through AI-powered conversation, track simulated portfolios with **practice money** (not real), monitor relevant news automatically, and learn investment strategies in a risk-free environment. Multi-user platform with Clarity & Growth fintech design.

**ES:** La Viste es un simulador educativo de inversiones para el mercado argentino. Creá tesis de inversión mediante conversación con IA, seguí carteras simuladas con **dinero de práctica** (no real), monitoreá noticias relevantes automáticamente y aprendé estrategias de inversión en un entorno sin riesgo. Plataforma multiusuario con diseño fintech Clarity & Growth.

🌐 **Live site:** [https://laviste.diegodella.ar](https://laviste.diegodella.ar)

---

## ✨ Key Features | Características principales

### 🤖 AI-Powered Thesis Creation | Creación de tesis con IA
- **EN:** Natural conversation with OpenAI to develop investment ideas and generate structured proposals
- **ES:** Conversación natural con OpenAI para desarrollar ideas de inversión y generar propuestas estructuradas

### 📊 Simulated Portfolio Tracking | Seguimiento de cartera simulada
- **EN:** Practice money (ARS) portfolio with delayed public market prices from data912 and Yahoo Finance `.BA` tickers. No real money, commissions, dividends, or actual orders.
- **ES:** Cartera de dinero de práctica (ARS) con precios públicos demorados de data912 y tickers `.BA` de Yahoo Finance. Sin dinero real, comisiones, dividendos ni órdenes reales.

### 📰 Automated News Monitoring | Monitoreo automático de noticias
- **EN:** Web search with OpenAI to track thesis-relevant news, sources, and coverage. Daily, weekly, or manual frequency with background job processing.
- **ES:** Búsqueda web con OpenAI para rastrear noticias relevantes a la tesis, fuentes y cobertura. Frecuencia diaria, semanal o manual con procesamiento de trabajos en segundo plano.

### 👥 Multi-User Support | Soporte multiusuario
- **EN:** User roles (superadmin, regular), daily quotas (20 chat messages, 5 news reviews, 100k tokens, 3 active monitored theses), login via email/password or optional Google OAuth
- **ES:** Roles de usuario (superadmin, regular), cuotas diarias (20 mensajes de chat, 5 revisiones de noticias, 100k tokens, 3 tesis activas monitoreadas), login por email/contraseña o Google OAuth opcional

### 🎨 Clarity & Growth Design System | Sistema de diseño Clarity & Growth
- **EN:** Modern fintech UI with canvas `#F8FAFC`, white cards, Plus Jakarta Sans / Inter / JetBrains Mono fonts, electric blue accents, 8/16px radii, ambient shadows
- **ES:** Interfaz fintech moderna con canvas `#F8FAFC`, tarjetas blancas, fuentes Plus Jakarta Sans / Inter / JetBrains Mono, acentos azul eléctrico, radios 8/16px, sombras ambient

---

## 🛠 Tech Stack | Stack tecnológico

| Component | Technology |
|-----------|-----------|
| **Runtime** | Node.js 22.22.0+ |
| **Database** | SQLite (WAL mode) |
| **AI Provider** | OpenAI (Structured Outputs + Web Search) |
| **Market Data** | Delayed public prices: data912, Yahoo Finance `.BA` tickers |
| **Auth** | Session-based (12h TTL), optional Google OAuth |
| **Security** | AES-256-GCM encrypted credentials, CSP, origin restrictions, rate limiting |
| **Deployment** | Docker Compose (self-hosted Raspberry Pi) |
| **CI/CD** | GitHub Actions (self-hosted runner + ubuntu-24.04) |
| **Testing** | Node test runner, Playwright browser tests |

**Production dependencies:** None (zero npm runtime dependencies)  
**Dev dependencies:** `@playwright/test` only

---

## 🚀 Local Development | Desarrollo local

**Requirements | Requisitos:** Node 22.22.0+, Chromium (for browser tests | para tests de navegador)

```bash
# Install dependencies | Instalar dependencias
npm ci

# Setup database and secrets | Configurar base de datos y secretos
npm run setup

# Start server | Iniciar servidor
APP_PASSWORD_FILE=./secrets/app-password MASTER_KEY_FILE=./secrets/master.key npm start
# Server runs on http://127.0.0.1:3080 (use PORT=3475 to change)

# Run checks | Ejecutar verificaciones
npm run check

# Run tests | Ejecutar tests
npm test
npm run test:browser
npm run test:site

# Build static site pages | Construir páginas estáticas del sitio
npm run build:site
```

**Browser tests** use `/usr/bin/chromium` by default. Configure with `CHROMIUM_PATH` or `PLAYWRIGHT_USE_BUNDLED=true` after `npx playwright install chromium`.

**Tests de navegador** usan `/usr/bin/chromium` por defecto. Configurar con `CHROMIUM_PATH` o `PLAYWRIGHT_USE_BUNDLED=true` después de `npx playwright install chromium`.

---

## 🏗 Architecture | Arquitectura

**EN:**
- **Monolith:** Node + SQLite WAL, persistent job queue with one concurrent investigator
- **Session management:** 12-hour sessions stored in SQLite (hashed tokens), survives restarts
- **Security:** Encrypted credentials in SQLite, origin restrictions, CSP, login rate limiting, persistent daily quotas
- **Job processing:** News review tied to thesis version; if thesis changes during search, result becomes historical and recovery is scheduled
- **Resilience:** Restart interruptions are logged; missing reviews are never invented; source failures don't erase previous alerts

**ES:**
- **Monolito:** Node + SQLite WAL, cola de trabajos persistente con un investigador concurrente
- **Gestión de sesiones:** Sesiones de 12 horas almacenadas en SQLite (tokens hasheados), sobreviven reinicios
- **Seguridad:** Credenciales cifradas en SQLite, restricciones de origen, CSP, límite de intentos de login, cuotas diarias persistentes
- **Procesamiento de trabajos:** Revisión de noticias ligada a versión de tesis; si la tesis cambia durante la búsqueda, el resultado queda histórico y se programa recuperación
- **Resiliencia:** Las interrupciones por reinicio se registran; nunca se inventan revisiones perdidas; las fallas de fuente no borran alertas previas

---

## 📚 Documentation | Documentación

**EN:**
- **Product Requirements:** `PRD-Tesis.md`
- **Original POC:** `docs/POC-original.md`
- **Phase 0 Audit:** `docs/PRD-CODE-AUDIT-PHASE0.md`
- **Migrations:** `docs/MIGRATION-*.md` (schema evolution, multi-user, quotas, features)
- **Public pages:** `/` (home), `/como-funciona` (how it works), `/acerca` (about), `/privacidad` (privacy), `/alcance` (scope)
- **Private app:** `/app` (authenticated users only)

**ES:**
- **Requisitos del producto:** `PRD-Tesis.md`
- **POC original:** `docs/POC-original.md`
- **Auditoría Phase 0:** `docs/PRD-CODE-AUDIT-PHASE0.md`
- **Migraciones:** `docs/MIGRATION-*.md` (evolución de esquema, multiusuario, cuotas, funcionalidades)
- **Páginas públicas:** `/` (inicio), `/como-funciona` (cómo funciona), `/acerca` (acerca de), `/privacidad` (privacidad), `/alcance` (alcance)
- **Aplicación privada:** `/app` (solo usuarios autenticados)

---

## 🔒 What's Real vs. Simulated | Qué es real y qué es simulado

| Component | Behavior | Comportamiento |
|-----------|----------|----------------|
| **Conversation / Conversación** | ✅ Real OpenAI with Structured Outputs | ✅ OpenAI real con Structured Outputs |
| **News / Noticias** | ✅ Real web search with OpenAI | ✅ Búsqueda web real con OpenAI |
| **Portfolio / Cartera** | ⚠️ Practice money (ARS), delayed public market prices | ⚠️ Dinero de práctica (ARS), precios públicos de mercado demorados |
| **Orders / Órdenes** | ❌ No real trading, no commissions, no dividends | ❌ Sin operaciones reales, sin comisiones, sin dividendos |
| **Scenarios / Escenarios** | ⚠️ Isolated demo view; doesn't alter saved portfolio | ⚠️ Vista demo aislada; no altera cartera guardada |

---

## 🚢 Deployment | Despliegue

**EN:**
Production runs on a self-hosted Raspberry Pi with Docker Compose. Automated CI/CD pipeline via GitHub Actions:

1. **Test job** (GitHub-hosted ubuntu-24.04): syntax checks, unit tests, browser tests, site generation verification
2. **Deploy job** (self-hosted ARM64 runner on production host): builds Docker image from exact commit SHA, stages in temporary container, creates SQLite backup, swaps production with health checks, automatic rollback on failure

Deployment serialized with Actions `concurrency` and local `flock`. Only `main` branch deploys to production.

**ES:**
La producción corre en un Raspberry Pi autohospedado con Docker Compose. Pipeline de CI/CD automatizado vía GitHub Actions:

1. **Job de test** (ubuntu-24.04 de GitHub): verificaciones de sintaxis, tests unitarios, tests de navegador, verificación de generación del sitio
2. **Job de deploy** (runner ARM64 autohospedado en host de producción): construye imagen Docker desde SHA de commit exacto, prueba en contenedor temporal, crea backup SQLite, intercambia producción con verificaciones de salud, rollback automático ante fallo

Despliegue serializado con `concurrency` de Actions y `flock` local. Solo la rama `main` despliega a producción.

---

## 🧪 Testing | Pruebas

**EN:**
- **Unit tests:** `npm test` — business logic, engine, quotas, security
- **Browser tests:** `npm run test:browser` — authenticated flows, UI interactions (Playwright)
- **Site tests:** `npm run test:site` — public pages, mobile menu, FAQ, responsive views (1440/390/360px)
- **Smoke tests:** `scripts/smoke.mjs` — HTTPS, login, cookies, OpenAI blocking, exposed file checks
- **Lighthouse CI:** `.github/workflows/perf.yml` — performance, accessibility, best practices

All tests run on every push/PR. Fixtures used for OpenAI and market data during automated tests; real credentials required for authenticated provider tests.

**ES:**
- **Tests unitarios:** `npm test` — lógica de negocio, motor, cuotas, seguridad
- **Tests de navegador:** `npm run test:browser` — flujos autenticados, interacciones UI (Playwright)
- **Tests de sitio:** `npm run test:site` — páginas públicas, menú móvil, FAQ, vistas responsive (1440/390/360px)
- **Tests de smoke:** `scripts/smoke.mjs` — HTTPS, login, cookies, bloqueo OpenAI, verificación de archivos expuestos
- **Lighthouse CI:** `.github/workflows/perf.yml` — rendimiento, accesibilidad, mejores prácticas

Todos los tests corren en cada push/PR. Se usan fixtures para OpenAI/IOL durante tests automáticos; se requieren credenciales reales para tests autenticados de proveedores.

---

## 📖 API References | Referencias de API

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Web Search](https://developers.openai.com/api/docs/guides/tools-web-search)
- [data912 Market Data](https://data912.finanzas.com/)
- [Yahoo Finance](https://finance.yahoo.com/)

---

## 📝 License | Licencia

**EN:** This project does not currently have an open-source license. All rights reserved by the repository owner.

**ES:** Este proyecto actualmente no tiene una licencia de código abierto. Todos los derechos reservados por el propietario del repositorio.

---

## 🤝 Contributing | Contribuciones

**EN:** This is a public repository. Contributions are managed and reviewed by the repository owner. Feel free to report issues or suggest improvements.

**ES:** Este es un repositorio público. Las contribuciones son gestionadas y revisadas por el propietario del repositorio. Reportá problemas o sugerí mejoras.

---

## 📧 Contact | Contacto

**Diego Della** — [https://laviste.diegodella.ar](https://laviste.diegodella.ar)

---

**💡 Disclaimer | Aviso importante:**

**EN:** La Viste is an educational simulation tool. It does not provide financial advice, does not execute real trades, and uses practice money only. Always consult qualified financial professionals before making real investment decisions.

**ES:** La Viste es una herramienta de simulación educativa. No proporciona asesoramiento financiero, no ejecuta operaciones reales y usa solo dinero de práctica. Siempre consultá profesionales financieros calificados antes de tomar decisiones de inversión reales.
