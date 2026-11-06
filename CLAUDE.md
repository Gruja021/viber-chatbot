# CLAUDE.md

## Pregled projekta

Multi-tenant AI chatbot sistem za Viber i Telegram platforme. SaaS rešenje koje omogućava malim i srednjim firmama da imaju AI-powered korisničku podršku putem messaging platformi, sa dinamičkim rutiranjem, CRM integracijom i fallback-om na ljudskog agenta.

**Status:** Implementirano kroz 9 faza — multi-tenant osnova, AI integracija, biznis logika, onboarding automatizacija, Telegram podrška, CI/CD, admin dashboard, agent management, dual conversation modes, per-tenant OpenAI config. Ukupno 630 testova (440 backend + 190 admin).

## Arhitektura

Četvoroslojni mikroservisni sistem:

1. **Messaging Botovi** — po jedan bot po klijentu/tenantu (Viber i/ili Telegram)
2. **Centralni Gateway** — Node.js / Express sa platform-agnostičnim `message-handler.ts` za rutiranje poruka
3. **AI Logika** — OpenAI API sa function calling, multi-database konektori, tenant registry
4. **Integracije** — Chatwoot CRM, Google Sheets, WooCommerce, SQL baze

## Tech stack

- **Backend:** Node.js / Express.js / TypeScript
- **AI:** OpenAI API (function calling)
- **CRM:** Chatwoot Community Edition
- **Messaging:** Viber Bot API + Telegram Bot API (webhooks)
- **Baza:** PostgreSQL za tenant registry
- **Cache:** Redis (conversation cache, agent timeout)
- **Data sources:** Google Sheets API, WooCommerce REST API, SQL konektori
- **Containerization:** Docker / Docker Compose
- **Admin Dashboard:** Angular 19 (standalone components, signals, Material UI)
- **Testing Backend:** Jest (31 suite, 440 testova)
- **Testing Admin:** Karma + Jasmine (16 spec fajlova, 190 testova)
- **CI/CD:** GitHub Actions (build + test + Docker build na svaki push/PR)

## Ključni koncepti

- **Tenant Registry** — centralna tabela sa `tenant_id`, `viber_auth_token`, `telegram_bot_token`, `database_credentials`, `system_prompt`, `openai_api_key`, `openai_model`, `working_hours`, `agent_timeout_seconds`, `session_timeout_hours`
- **Platform Abstraction** — `PlatformMessenger` interfejs sa `sendTextMessage()`, `PlatformSender` za identifikaciju korisnika; ista core logika (AI, handover, radno vreme) radi za oba kanala
- **Webhook Receivers** — `POST /api/viber/webhook/:tenantSlug` i `POST /api/telegram/webhook/:tenantSlug`, rutiraju poruke ka ispravnom tenantu
- **Message Handler** — `message-handler.ts` — platform-agnostičan handler: handover keyword → status checks (human_active/pending_human) → working hours → AI-First ili Human-First mod
- **Database Abstraction Layer** — modularni konektori (GoogleSheetsConnector, WooCommerceConnector, SQLConnector)
- **Dual Conversation Modes** — AI-First (`agent_timeout_seconds=0`: AI odmah odgovara, eskalira na čoveka po potrebi) i Human-First (`agent_timeout_seconds>0`: poruka ide radniku, AI preuzima nakon timeout-a)
- **Conversation Status** — state machine sa statusima: `ai_active`, `pending_human`, `human_active`, `closed`; prelazi se kontrolišu kroz message handler, Chatwoot webhook i agent timeout listener
- **Per-Tenant OpenAI Config** — svaki tenant može imati svoj `openai_api_key` i `openai_model`, sa fallback-om na globalne vrednosti (`env.OPENAI_API_KEY`, `gpt-4o-mini`); API key je write-only (nikad se ne vraća u API response, samo `has_openai_api_key` boolean)
- **AI Escalation** — OpenAI function calling tool `escalate_to_human` koji AI pozove kad ne može da reši pitanje; dodaje se samo kad je Chatwoot konfigurisan
- **Session Reset** — primarno kroz Chatwoot Resolve (status→closed), sigurnosni fallback kroz konfigurabilan `session_timeout_hours` per tenant (default 24h)
- **Agent Management** — upravljanje Chatwoot agentima po tenantu putem proxy API-ja (`GET/POST/DELETE /api/tenants/:id/agents`); agenti žive u Chatwoot-u, bez lokalne `agents` tabele
- **Conversations** — `platform` kolona (`viber` | `telegram`), `platform_user_id`, `platform_user_name` umesto Viber-specifičnih kolona

## Admin Dashboard (`admin/`)

Angular 19 SPA za upravljanje tenantima. Standalone komponente, signal-based state, Material UI.

- **Auth:** Token-based (localStorage), `authGuard` na zaštićenim rutama, `authInterceptor` za Bearer header
- **Stranice:** Login, Dashboard (system health + tenant overview), Tenant CRUD (list/detail/form), Agent Management, 404
- **Servisi:** `AuthService` (signals), `TenantService` (HTTP CRUD), `AgentService` (Chatwoot agent CRUD), `authInterceptor` (funkcionalni)
- **Testiranje:** Karma + Jasmine, 16 spec fajlova, 190 testova
  - `npm test` — interaktivno (Chrome)
  - `npm run test:ci` — CI mode (ChromeHeadless, single run)
- **Test pattern:** `provideRouter([])` za RouterLink, `fixture.debugElement.injector.get(MatSnackBar)` za component-level providers

## Konvencije koda

- Tabele u bazi: `snake_case`
- Konektori: `PascalCase` sa sufiksom "Connector"
- API endpointi: `kebab-case` (npr. `/api/viber/webhook`, `/api/telegram/webhook`)
- Tenant identifikatori: UUID ili slug format
- Platform kolone: `platform` (`viber` | `telegram`), `platform_user_id`, `platform_message_id`
- SQL konektori ograničeni na `SELECT` upite (read-only)
- Svi tenant-specifični podaci u registry-ju, nikad hardkodirani

## Razvojne faze

| Faza | Opis                                                                            | Status |
| ---- | ------------------------------------------------------------------------------- | ------ |
| 1    | Multi-tenant osnova — tenant store, webhook receiver, Chatwoot setup            | ✅     |
| 2    | AI integracija — OpenAI, database abstraction, anti-halucinacija pravila        | ✅     |
| 3    | Biznis logika — radno vreme, human handover mehanizam, agent timeout            | ✅     |
| 4    | Onboarding automatizacija — setup klijenta za < 30 min, health checks, Docker  | ✅     |
| 5    | Telegram podrška — platform-agnostična arhitektura, Telegram Bot API            | ✅     |
| 6    | CI/CD — GitHub Actions pipeline (build, test, Docker verify)                    | ✅     |
| 7    | Admin Dashboard — Angular 19 SPA sa CRUD, health checks, unit testovi (130)     | ✅     |
| 8    | Agent Management — konfigurabilan timeout, agent CRUD API, admin UI             | ✅     |
| 9    | Dual Conversation Modes — AI-First / Human-First, session reset, escalation tool | ✅     |

## Važne napomene

- **Tenant izolacija je kritična** — poruke firme A ne smeju nikad stići do firme B
- **Platform izolacija** — conversations su unique po `(tenant_id, platform, platform_user_id)`, isti korisnik na Viberu i Telegramu su odvojene konverzacije
- **Anti-halucinacija** — striktni system prompts koji sprečavaju AI da izmišlja cene/podatke
- **Radno vreme** — tokom radnog vremena rutiranje zavisi od moda (AI-First: AI odmah, Human-First: radnik pa AI fallback), van radnog vremena AI odgovara u oba moda
- **Media podrška** — trenutno samo tekst; slike, PDF, video i audio se ignorišu (planirano za buduću fazu)
- **Lead capture** — tiho logovanje korisničkih upita u pozadini
- **Telegram je besplatan** — Viber botovi koštaju 115 EUR/mesečno, Telegram je besplatna alternativa za development i testiranje

## Rules

- **NEVER modify code without explicit user approval.** Always describe the proposed changes first and ask for confirmation before applying any edits to the codebase.
