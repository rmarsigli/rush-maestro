# Maestro — Migrate to Web App

Transform the current system into a SaaS product for performance marketing agencies.

---

## Premise

What exists today proves the concept: automatic metrics collection, intelligent alerts,
AI-generated reports. The differentiator is not the dashboard — it's the AI integrated into the
operational workflow. Tools like Data Studio and Reportei show data. Maestro acts on it.

---

## Proposed Stack

```
Frontend:  SvelteKit (existing, adapt)
Backend:   Go (REST API + collection workers)
Database:  PostgreSQL (direct migration from current SQLite schema)
Auth:      Google OAuth2 (resolves the Google Ads authorization flow)
AI:        Anthropic API (on-demand reports + alerts with analysis)
Scheduler: internal (gocron) — configurable via UI per tenant
```

---

## Why Go for the backend

- Internal scheduler with `gocron` — no manual crontab, configurable via UI
- Worker pool for parallel collection of N tenants via goroutines
- `golang.org/x/oauth2` handles Google Ads refresh token automatically
- Performance and low infrastructure cost in production

---

## Architecture

```
UI (SvelteKit) ──→ REST API (Go) ──→ PostgreSQL
                         │
                         ├──→ Google Ads API  (worker pool, per tenant)
                         ├──→ Meta Graph API  (worker pool, per tenant)
                         ├──→ Anthropic API   (reports + alert analysis)
                         └──→ Mailer          (automatic report delivery)
```

---

## What changes vs. the current system

| Today (local)                        | Web App                                         |
|--------------------------------------|-------------------------------------------------|
| Manual crontab in WSL                | Scheduler configurable in UI per tenant          |
| `.env` with manual credentials       | OAuth2 — agency authorizes via UI               |
| Report generated manually            | Generated automatically + sent by email          |
| One tenant (Pórtico)                 | Multi-tenant isolated with API key/JWT auth      |
| Local Claude Code                    | Anthropic API called by Go backend               |
| Gitignored SQLite                    | Managed PostgreSQL                              |

---

## Product Differentiators

**Automatic executive report** — every Monday, the agency's client receives
an email with a week's analysis written in executive language, not in a table.
AI-generated with real campaign data. No manual work from the agency.

**Alerts with analysis** — not just "CPA rose 40%", but "CPA rose because the
Apartment Renovation ad group lost impression share — suggestion: increase bid by $0.30".

**Inline approval** — agency proposes a campaign adjustment via UI, client approves
with one click, system executes via API. No more back-and-forth messaging.

---

## Business Model

**B2B2C** — sell to the agency, which uses it as a differentiator with their clients.

- Higher ticket than direct B2C
- Lower churn (agency doesn't cancel a tool they use with active clients)
- No need for huge volume to be profitable

**Price reference:** Reportei charges ~$30/tenant/month without AI.
With the current value proposition: $80–120/tenant/month or per-agency plan (N tenants included).

---

## Risks not to underestimate

**OAuth onboarding** — each new agency client needs to authorize Google Ads access.
The technical flow is solved; the operational friction (convincing the client
to click the button) needs to be smooth.

**AI quality at scale** — a report generated for 50 tenants needs a review
or approval mechanism before sending to the end client.
A bad report delivered automatically is worse than no report.

**Support** — when a campaign performs poorly, the client calls the agency, the agency
calls you. Define SLA and responsibility limits before launching.

---

## Suggested go-to-market

1. **Use internally** — mature the product with existing clients (already in progress)
2. **Closed beta** — 2–3 partner agencies, no cost, with close support
3. **Validate pricing** — understand what the agency actually values before scaling
4. **Public launch** — only after achieving positive NPS and churn < 5% in beta

---

## Migrating the current schema

The SQLite schema is already well-modeled. Direct migration to PostgreSQL:

```sql
-- daily_metrics, monthly_summary, alert_events, agent_runs
-- Add: tenant_id (FK), user_id, created_by
-- Add: accounts table (agencies) and users
-- Add: oauth_tokens table (Google Ads per tenant)
-- Add: schedules table (cron configuration per tenant)
```

---

## Next steps (when ready to proceed)

- [ ] Define whether it's a public SaaS, white-label, or internal product
- [ ] Prototype the OAuth onboarding flow with a partner agency
- [ ] Decide on hosting (Railway, Fly.io, own VPS)
- [ ] Estimate infrastructure cost for 10 / 50 / 200 tenants
- [ ] Define a report review mechanism before automatic delivery
