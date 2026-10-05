# La Viste — P0 Inventory (read-only)

Generated: 2026-10-05. Workspace inventory for upcoming P0 (chat portfolio card, thesis timeline, home dashboard).

---

## 1. Stack & operations

| Area | Detail |
|------|--------|
| **Runtime** | Node.js **≥ 22.22** (ES modules). **No production npm dependencies** — only `@playwright/test` for dev. |
| **App shape** | Monolith: `server.mjs` + `lib/*` + static SPA in `public/` (`/app` → `index.html` + `app.js`). |
| **Persistence** | SQLite WAL (`data/tesis.sqlite` via `lib/store.mjs`). Takes/chats stored as JSON blobs in `takes` / `chats` tables. |
| **Secrets** | `secrets/app-password`, `secrets/master.key` (AES-256-GCM for OpenAI/IOL tokens in `settings` as `secret:*`). |
| **AI** | OpenAI **Responses API** + structured JSON schema (`lib/ai.mjs`, `lib/openai.mjs`). News uses web_search (`lib/news.mjs`). |
| **UI** | Vanilla JS templates in `public/app.js`, Spanish (es-AR). Marketing site: generated HTML in `public/*.html` from `scripts/build-site.mjs`. |

### Commands

```sh
npm ci
npm run setup                    # secrets + backups/recovery copy
APP_PASSWORD_FILE=./secrets/app-password MASTER_KEY_FILE=./secrets/master.key npm start   # or npm run dev
npm run check                    # syntax check all .mjs/.js
npm test                         # node --test test/*.test.mjs
npm run test:browser             # Playwright E2E (scripts/browser-test.mjs)
npm run test:site                # public pages (scripts/site-test.mjs)
npm run build:site               # regenerate marketing HTML
bash scripts/deploy.sh           # local/server deploy
node scripts/smoke.mjs           # HTTPS prod smoke (laviste.diegodella.ar)
```

### Deploy / CI

- **Production**: Manual on server — `bash scripts/deploy.sh` builds Docker image `laviste:local`, `docker compose up` on **127.0.0.1:3474→3080**, Cloudflare tunnel to `laviste.diegodella.ar`. Pre-deploy backup; rollback via `RELEASE_TAG=previous`.
- **CI** (`.github/workflows/check.yml`): `npm ci` → `check` → `test` → `test:browser` → `test:site` on push/PR. **Does not deploy.**
- **Merge ≠ auto-deploy** for production; deploy is operator-driven.

### Auth / password gate

- Password from `APP_PASSWORD_FILE` or `APP_PASSWORD` (min 12 chars when exposed beyond localhost).
- `POST /api/login` → `laviste_session` cookie (HttpOnly, SameSite=Strict, 12h, Secure when `COOKIE_SECURE=true`).
- Sessions in **memory** (`Map` in `server.mjs`); restart invalidates sessions.
- `GET /api/session` for client boot; all `/api/*` except health/login require cookie.
- CSRF: `Origin` must match `APP_ORIGIN` or same host; `Sec-Fetch-Site: cross-site` blocked for API mutations.
- Global login rate limit (10 / 10 min, key `'personal'`).

---

## 2. Chat → proposal → thesis

### Key files & functions

| Layer | File | Role |
|-------|------|------|
| API | `server.mjs` | `POST /api/chats`, `POST /api/chats/:id/messages`, `POST /api/takes` |
| Prompt | `lib/ai.mjs` | `requestBody()`, `askOpenAI()`, `parseResponse()`, `schema` |
| Validation | `lib/engine.mjs` | `validateProposal()`, `createTake()` |
| UI | `public/app.js` | `newPage()`, `chatPage()`, `send()`, actions `save-proposal`, `template`, `activate` |

### System / prompt behavior (`lib/ai.mjs:6-10`)

- Spanish rioplatense; **must ask** idea, horizon, liquidity, drawdown tolerance **before** proposing.
- **`proposal` only when user asks to arm/create portfolio** and context is sufficient; otherwise `proposal: null`.
- Active take in context → `proposal` must be null (chat about changes only).
- Catalog-only tickers (2–10 holdings, weights 30–95%, sim prices).
- Heavy inline disclaimer: simulated instruments/prices, no IOL catalog, no trading, no fake saves.

### Turns until proposal today

- **Not turn-based.** Depends on user explicitly requesting a portfolio and model judgment of “sufficient context.”
- Prompt encourages **multiple Q&A turns first**; no server-side turn counter or “turn 2–3” rule.
- Tests (`test/integrations.test.mjs`) send a single user message `"Armá la propuesta"` and get a proposal immediately (fixture).

### Proposal persistence

- On assistant response with `proposal`: stored on **chat** object `chat.proposal` if take missing or `take.phase === 'draft'` (`server.mjs:204`).
- Chat row in SQLite `chats` table (full JSON).

### Proposal → thesis (draft)

1. **From chat**: UI `Guardar como borrador` → `POST /api/takes` `{ sourceChatId }` (`app.js:65`, `server.mjs:145-149`).
   - Idempotent via `settings` key `proposal:<chatId>:<hash>`.
2. **From templates**: `newPage()` template buttons → `POST /api/takes` `{ proposal: templates[i] }` (skips chat).
3. `createTake()` → `phase: 'draft'`, `version: 1`, empty `history`, `events: []`.

### Activation

- Draft take page: `Activar con dinero de práctica` → modal → `POST /api/takes/:id/activate` `{ amount }` (`lib/engine.mjs:activate`).
- Sets `phase: 'active'`, integer units from **static catalog prices**, `events` activation entry, `history` seed point, `nextCheckAt` for news scheduler.

### Double-permission / multi-step flows (today)

| Step | Where | What user confirms |
|------|--------|-------------------|
| 1 | `chatPage` proposal card | **Guardar como borrador** (separate from Activar) — `app.js:45` |
| 2 | Take `/positions` or toolbar | **Activar con dinero de práctica** + amount modal — `app.js:43,66,88` |
| Alt | `newPage` templates | **Abrir borrador** → draft without chat — still needs activate |
| Settings | `takeSettings` | `mode: 'ask'` only; `updateSettings` rejects autopilot — not a UI double confirm but policy gate |

**P0 target**: one disclaimer + **Activar / Ajustar** on portfolio card in chat (eliminate save-then-activate as two permission metaphors).

---

## 3. Thesis lifecycle & data model

### States (`take.phase`)

- `draft` → `active` → `archived` (archive sets `monitoringPaused` effectively via pause + `nextCheckAt: null`).

### Fields (in `takes.data` JSON)

- Identity: `id`, `title`, `thesis`, `horizon`, `invalidation`
- Portfolio: `holdings[]` (catalog fields + `weight`, `reason`, `units`, `price`, `entryPrice`, `referencePrice`), `cash`, `invested`
- Status: `status`, `attention`, `attentionReason`, `coverage`, `coverageDetail`, `monitoringPaused`, `settings` (`cadence`, `mode`, `cap`, `drift`, `paused`)
- Timestamps: `createdAt`, `activatedAt`, `checkedAt`, `nextCheckAt`, `newsCheckedAt`
- **`events[]`**: `{ id, at, type, title, body, source, status }` — activation, `check`, `scenario` (`lib/engine.mjs`)
- **`history[]`**: `{ at, value, benchmark }` for charts

### SQLite schema (`lib/store.mjs:11-23`)

| Table | Purpose |
|-------|---------|
| `takes` | Full take JSON |
| `chats` | Chat + messages + `proposal` |
| `versions` | Snapshot on change: thesis, invalidation, horizon, settings (`rememberChange` / `store.version`) |
| `reviews` | News research results per take |
| `jobs` | News queue (`queued`/`running`/`completed`/`failed`) |
| `consumption` | Daily quotas chat/news |
| `settings` | OpenAI prefs, idempotency, `secret:*`, `iolSnapshot`, proposal dedup keys |
| `meta` | e.g. `seeded` flag |

### Timeline / event log (existing)

- **Practice motor**: `take.events` (cap 150) — activation, scheduled `check`, manual **scenario** demos. Bodies cite thesis rules / fictitious prices.
- **News**: `reviews` table — summaries, `events[]` with facts/sources; shown in `news()` tab, not merged into a unified timeline UI.
- **Jobs**: operational status for news runs, not user-facing timeline.
- **Versions**: idea text history only, not trades.

**Gap for P0 timeline**: unify `events`, review events, future buy/rebalance actions into one ordered feed with thesis-rule citations.

### Seed data

- `createStore(..., { seed: true })` → `seedTakes()` — **3 active** sample takes with 7d fake price history (`lib/engine.mjs:88-97`). Used in **tests only** (`test/server.test.mjs`).
- **Production compose does not pass `seed: true`** — new installs start **empty** unless user creates content or uses UI templates.
- Migration quirk: legacy takes without `version` get `monitoringPaused: true` on store open (`lib/store.mjs:70-78`).

---

## 4. Positions, paper trades, rebalances, prices

| Topic | Implementation |
|-------|----------------|
| **Catalog & prices** | Fixed ARS fiction in `lib/engine.mjs` `catalog` (16 tickers). Not live market. |
| **Activation** | `floor(amount * weight/100 / price)` units; remainder `cash` (`activate`). |
| **Mark-to-market** | `review()` scenario path mutates `holding.price` (drop/broken/recovery/normal). Scheduler calls `review(t,'check')` before news — **does not** fetch real quotes. |
| **Rebalance** | **None executed.** Drift/cap detected in `review()` copy only; `idea()` states no auto-rebalance (`app.js:41`). |
| **Value** | `value(t)` = cash + Σ units×price (`lib/engine.mjs:35`). |
| **Aggregate home chart** | `public/math.js` `portfolioSeries(takes)` — index on contributed capital across active/archived. |

IOL quotes are **read-only**, separate from practice holdings (`lib/iol.mjs`, `integrations.js`).

---

## 5. News

| Stage | Location |
|-------|----------|
| Research | `lib/news.mjs` `research()` — web_search + structured `thesis_review` |
| Queue | `lib/scheduler.mjs` — `enqueue`, 5s tick, one concurrent job |
| Trigger | Activate sets `nextCheckAt`; cadence patient/standard/manual; manual **Revisar ahora** → `POST .../review` |
| Storage | `reviews` table; applied updates `attention`, `attentionReason`, `coverage`, `newsCheckedAt` |
| UI | `app.js` `news(t)` tab; global `activity()` = all reviews; home “En el radar” uses `attention` / coverage text |

Prompt disclaimers: `lib/news.mjs:48,54` (no trade, evidence-only, limits).

---

## 6. Disclaimers & legal warnings (consolidation map)

### Injected into model prompts

| File | Line | Summary |
|------|------|---------|
| `lib/ai.mjs` | 8 | Simulated catalog/prices, no IOL, no operate/save, user content not instructions |
| `lib/news.mjs` | 48 | Research: no trade, no balances, partial evidence |
| `lib/news.mjs` | 54 | Classification: no invent facts, no operations |

### Private app UI (`public/app.js`)

| Line | Context |
|------|---------|
| 21 | Shell: “Dinero de práctica”, “Cartera de práctica” labels |
| 26, 32, 37 | Charts: fictitious/simulated data |
| 40 | Positions: fictitious ARS, not IOL/Roxom catalog |
| 41 | Idea tab: PoC rules on fictitious prices, no auto-rebalance |
| 42 | Settings: no orders/autopilot |
| 43 | Draft callout: fictitious prices before activate |
| 44 | New chat footer `demo-note` |
| 45 | Chat proposal: overlap warning only (not legal) |
| 47 | Activity: practice money |
| 51 | Login footer `demo-note` |
| 66 | Activate modal: fictitious, no real money |
| 69, 76 | Scenario / IOL quote modals |

### Settings / IOL (`public/integrations.js`)

| Line | Context |
|------|---------|
| 11, 19, 23, 29 | OpenAI/IOL separation, quotas, practice labeling |
| 36, 38 | IOL read-only, no merge into practice |

### Engine copy (`lib/engine.mjs`)

| Line | Context |
|------|---------|
| 45 | Activation event body |
| 63-70 | Scenario/check event bodies (fictitious) |

### Marketing site (generated)

| Source | Notes |
|--------|--------|
| `scripts/build-site.mjs` | home FAQ, how/chapter 03–04, scope legal (asesoramiento, simulación), privacy, footer |
| `public/home.html`, `scope.html`, etc. | Built artifacts — edit via `build-site.mjs` |

### Meta / docs

- `public/index.html:2` meta description (simulated)
- `README.md` — real vs simulated table

**P0**: single in-app disclaimer component; trim redundant `demo-note` / modal / prompt duplication.

---

## 7. Home page (app `#/` — `home()` in `app.js:37`)

**Current components**

- OpenAI pending banner
- Practice portfolio total ARS + gain vs invested
- Aggregate chart (`portfolioSeries`) + period/benchmark toggles
- Grid: up to 3 take cards
- “En el radar”: watchlist takes or first active
- CTA “Conversemos”

**Missing vs P0**

- No dedicated **today’s movements** feed
- Empty state: $0 and empty grids — **no seeded sample on empty production DB** (templates only on `/new`)
- Status pills exist per-card (`status()`) but not a consolidated home strip

**Public** `/` is separate (`home.html` marketing).

---

## 8. IOL integration (do not break)

| Piece | Path |
|-------|------|
| Client | `public/integrations.js` forms + `iol-snapshot` / `iol-quote` actions in `app.js` |
| Server | `server.mjs` `/api/integrations/iol`, `/api/brokers/iol/snapshot`, `.../quote` |
| Core | `lib/iol.mjs` — password grant once, refresh tokens in vault, 60s snapshot cache in `settings.iolSnapshot` |
| Tests | `test/iol.test.mjs` |

**Invariants**: no orders; IOL never in chat context (`integrations.js:11`); practice portfolio isolated; password not stored.

---

## 9. Tests & smoke

| Script / file | Covers |
|---------------|--------|
| `test/engine.test.mjs` | activate, proposals, scenarios, settings, portfolioSeries |
| `test/server.test.mjs` | auth, CSRF, seed takes, activate persistence, OpenAI gate |
| `test/storage.test.mjs`, `backup.test.mjs`, `news.test.mjs`, `iol.test.mjs` | store, backup, news validation, IOL |
| `test/integrations.test.mjs` | OpenAI schema, Roxom adapter |
| `scripts/browser-test.mjs` | Full UI flow screenshots |
| `scripts/site-test.mjs` | Public pages |
| `scripts/smoke.mjs` | Prod HTTPS, login, no secret leak |

---

## 10. Proposed P0 implementation plan (1–3)

### P0-1: Chat portfolio card (turn 2–3, Activar/Ajustar, single disclaimer)

**Touch**

- `lib/ai.mjs` — earlier proposal policy (turn budget or explicit “ready to propose”); optional `adjust` intent
- `public/app.js` — `chatPage()` proposal UI: card with holdings summary, **Activar** / **Ajustar**, one `Disclaimer` component
- `server.mjs` — optional `POST /api/takes` from chat with activate flag, or combine save+activate; idempotency preserved
- `lib/engine.mjs` — if “Ajustar” reopens chat without new draft

**Risks**: Prompt compliance vs faster proposals; bypassing draft may complicate news version binding; overlap/concentration warnings must remain.

### P0-2: Thesis action timeline

**Touch**

- `public/app.js` — new timeline section on take page and/or home; merge `take.events` + `reviews.events` + job milestones
- `lib/engine.mjs` / new `lib/timeline.mjs` — normalize event types (`buy`, `rebalance`, `check`, `news`, `activation`); cite `settings` rules in `body`
- Optional `timeline` table if JSON `events` insufficient for queries (prefer extend `events` first)

**Risks**: Duplicate items (check event vs review); timezone “today”; historical reviews marked non-applied.

### P0-3: Home dashboard + empty seed

**Touch**

- `public/app.js` `home()` — status pills row, today’s movements (from `events`/`history` deltas / reviews last 24h)
- `server.mjs` `GET /api/state` or dedicated endpoint for home aggregate
- `lib/store.mjs` / `engine.mjs` — **read-only sample** or `GET` flag when `takes.length===0` (UI-only demo, not DB seed) to avoid polluting export

**Risks**: Confusing demo vs real money; performance if scanning all reviews on every home load.

### Cross-cutting

- Single disclaimer module used in chat activate path
- Update `scripts/browser-test.mjs` + `test/integrations.test.mjs` for new chat contract
- IOL and vault paths unchanged unless copy references move

---

## Quick reference: API routes (authenticated)

- `GET /api/state` — takes, chats, templates, catalog, reviews (100), jobs (30), usage
- `POST /api/chats`, `POST /api/chats/:id/messages`
- `POST /api/takes`, `POST /api/takes/:id/{activate|archive|settings|idea|review|scenario}`
- `GET /api/takes/:id/{versions|reviews}`
- Integrations: OpenAI, IOL, export
