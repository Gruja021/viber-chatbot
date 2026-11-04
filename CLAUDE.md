# CLAUDE.md

## Pregled projekta

Multi-tenant AI chatbot sistem za Viber i Telegram platforme. SaaS rešenje koje omogućava malim i srednjim firmama da imaju AI-powered korisničku podršku putem messaging platformi, sa dinamičkim rutiranjem, CRM integracijom i fallback-om na ljudskog agenta.

**Status:** Implementirano kroz 5 faza — multi-tenant osnova, AI integracija, biznis logika, onboarding automatizacija, Telegram podrška. Docker containerization, smoke testovi i GitHub Actions CI/CD.

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
- **Testing:** Jest (31 suite, 346+ testova)
- **CI/CD:** GitHub Actions (build + test + Docker build na svaki push/PR)

## Ključni koncepti

- **Tenant Registry** — centralna tabela sa `tenant_id`, `viber_auth_token`, `telegram_bot_token`, `database_credentials`, `system_prompt`, `working_hours`
- **Platform Abstraction** — `PlatformMessenger` interfejs sa `sendTextMessage()`, `PlatformSender` za identifikaciju korisnika; ista core logika (AI, handover, radno vreme) radi za oba kanala
- **Webhook Receivers** — `POST /api/viber/webhook/:tenantSlug` i `POST /api/telegram/webhook/:tenantSlug`, rutiraju poruke ka ispravnom tenantu
- **Message Handler** — `message-handler.ts` — platform-agnostičan handler: handover keyword → handover mode → working hours → AI fallback
- **Database Abstraction Layer** — modularni konektori (GoogleSheetsConnector, WooCommerceConnector, SQLConnector)
- **Handover mehanizam** — eskalacija na ljudskog agenta putem Chatwoot-a, sa 3-minutnim agent timeout-om i AI fallback-om
- **Conversations** — `platform` kolona (`viber` | `telegram`), `platform_user_id`, `platform_user_name` umesto Viber-specifičnih kolona

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

## Važne napomene

- **Tenant izolacija je kritična** — poruke firme A ne smeju nikad stići do firme B
- **Platform izolacija** — conversations su unique po `(tenant_id, platform, platform_user_id)`, isti korisnik na Viberu i Telegramu su odvojene konverzacije
- **Anti-halucinacija** — striktni system prompts koji sprečavaju AI da izmišlja cene/podatke
- **Radno vreme** — tokom radnog vremena rutiranje na ljude (sa 3-min timeout), van radnog vremena AI fallback
- **Lead capture** — tiho logovanje korisničkih upita u pozadini
- **Telegram je besplatan** — Viber botovi koštaju 115 EUR/mesečno, Telegram je besplatna alternativa za development i testiranje

## Rules

- **NEVER modify code without explicit user approval.** Always describe the proposed changes first and ask for confirmation before applying any edits to the codebase.
