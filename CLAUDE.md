# CLAUDE.md

## Pregled projekta

Multi-tenant AI chatbot sistem za Viber platformu. SaaS rešenje koje omogućava malim i srednjim firmama da imaju AI-powered korisničku podršku putem Vibera, sa dinamičkim rutiranjem, CRM integracijom i fallback-om na ljudskog agenta.

**Status:** Faza planiranja — postoji samo dokumentacija (`requirements.txt`), kod još nije implementiran.

## Arhitektura

Četvoroslojni mikroservisni sistem:

1. **Viber Botovi** — po jedan bot po klijentu/tenantu
2. **Centralni Gateway** — Node.js (+ opciono n8n) za rutiranje poruka
3. **AI Logika** — OpenAI/Claude API sa function calling, multi-database konektori, tenant registry
4. **Integracije** — Chatwoot CRM, Google Sheets, WooCommerce, SQL baze

## Tech stack (planirani)

- **Backend:** Node.js / Express.js
- **AI:** OpenAI API ili Claude API (function calling)
- **CRM:** Chatwoot Community Edition
- **Messaging:** Viber Bot API (webhooks)
- **Baza:** PostgreSQL/MySQL za tenant registry
- **Data sources:** Google Sheets API, WooCommerce REST API, SQL konektori
- **Opciono:** n8n za workflow automatizaciju

## Ključni koncepti

- **Tenant Registry** — centralna tabela sa `tenant_id`, `viber_token`, `database_credentials`, `system_prompt`, `working_hours`
- **Webhook Receiver** — jedan endpoint (`POST /api/viber/webhook`) koji rutira poruke ka ispravnom tenantu
- **Database Abstraction Layer** — modularni konektori (GoogleSheetsConnector, WooCommerceConnector, SQLConnector)
- **Handover mehanizam** — eskalacija na ljudskog agenta putem Chatwoot-a

## Konvencije koda

- Tabele u bazi: `snake_case`
- Konektori: `PascalCase` sa sufiksom "Connector"
- API endpointi: `kebab-case` (npr. `/api/viber/webhook`)
- Tenant identifikatori: UUID ili slug format
- SQL konektori ograničeni na `SELECT` upite (read-only)
- Svi tenant-specifični podaci u registry-ju, nikad hardkodirani

## Razvojne faze

| Faza | Opis                                                                            |
| ---- | ------------------------------------------------------------------------------- |
| 1    | Multi-tenant osnova — tenant store, webhook receiver, Chatwoot setup            |
| 2    | AI integracija — OpenAI/Claude, database abstraction, anti-halucinacija pravila |
| 3    | Biznis logika — radno vreme, human handover mehanizam                           |
| 4    | Onboarding automatizacija — setup klijenta za < 30 min                          |

## Važne napomene

- **Tenant izolacija je kritična** — poruke firme A ne smeju nikad stići do firme B
- **Anti-halucinacija** — striktni system prompts koji sprečavaju AI da izmišlja cene/podatke
- **Radno vreme** — tokom radnog vremena rutiranje na ljude, van radnog vremena AI fallback
- **Lead capture** — tiho logovanje korisničkih upita u pozadini

## Rules

- **NEVER modify code without explicit user approval.** Always describe the proposed changes first and ask for confirmation before applying any edits to the codebase.
