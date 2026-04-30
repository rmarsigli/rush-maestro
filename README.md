# Rush Maestro

Local marketing management system with multi-tenant support. Combines a CMS, Google Ads integration, AI-assisted content generation, and an MCP server as the single interface for all AI agents.

## Stack

- **Backend:** Go (chi router, pgx/v5, goose migrations) — `backend/`
- **UI:** SvelteKit (Svelte 5 runes) + Tailwind v4 + `adapter-static` — `frontend/`
- **Database:** PostgreSQL at `rush_maestro` via pgx
- **MCP:** Go Streamable HTTP at `POST /mcp`
- **Google Ads:** Go connector via `google.golang.org/api/ads`
- **Credentials:** Google Ads OAuth stored in the `integrations` table

## Architecture

PostgreSQL is the single source of truth. The MCP server is the single interface for all AI agents — no flat-file workflows, no agent `.md` personas.

```
Go Backend (port 8181)
  └── /admin/*        — REST API (tenants, posts, campaigns, reports)
  └── /auth/*         — OAuth flows
  └── /mcp            — MCP endpoint (Streamable HTTP)
  └── internal/connector/googleads/  — live Google Ads API

SvelteKit SPA (port 5173, dev)
  └── src/routes/[tenant]/*      — pages (static adapter, pure client-side)
  └── src/lib/api/               — Go REST API client
```

## Features

**Social** — drafts, content planner calendar, status workflow (draft → approved → scheduled → published), media upload, Meta Graph API publishing

**Google Ads** — local campaign drafts, deploy to Google Ads API, live metrics, negative keywords, budget management, ad scheduling, extensions

**Monitoring** — daily metrics collection, threshold alerts (CPA, conversions, impression share, budget pacing), WARN/CRITICAL inbox with resolve/ignore

**Reports** — markdown reports in PostgreSQL, auto-typed by slug (audit, search, weekly, monthly), browser print-to-PDF

**MCP** — 29 tools + 5 resources over Streamable HTTP at `http://localhost:5173/mcp`

## MCP Tools

See [`docs/mcp.md`](docs/mcp.md) for full reference.

**Content:** `list_tenants` · `get_tenant` · `create_tenant` · `update_tenant` · `list_posts` · `get_post` · `create_post` · `update_post_status` · `delete_post` · `list_reports` · `get_report` · `create_report` · `list_campaigns` · `get_campaign` · `check_alerts`

**Google Ads — Read:** `get_live_metrics` · `get_campaign_criteria` · `get_search_terms` · `get_ad_groups`

**Google Ads — Write:** `add_negative_keywords` · `update_campaign_budget` · `set_weekday_schedule` · `add_ad_group_keywords` · `add_campaign_extensions` · `set_campaign_status`

**Monitoring:** `collect_daily_metrics` · `consolidate_monthly` · `get_metrics_history` · `get_monthly_summary`

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env      # configure DATABASE_URL, GOOGLE_ADS_* if needed
go run ./cmd/server
```

### Frontend

```bash
cd frontend
bun install
bun run dev                # proxied to Go API at localhost:8181
```

Google Ads credentials are configured via **Settings → Integrations** in the UI (OAuth flow). No manual `.env` needed for Google Ads.

## Environment Variables

Only a subset of functionality requires `.env`. Bun loads it automatically.

```
META_PAGE_ACCESS_TOKEN=
META_PAGE_ID=
META_INSTAGRAM_ACCOUNT_ID=
MEDIA_PUBLIC_BASE_URL=     # tunnel URL for Meta media uploads
FINAL_URL=                 # landing page for Google Ads deploy
```

## Crontab

```
3 7 * * * cd /path/to/rush-maestro/backend && go run ./cmd/scripts collect-daily-metrics <tenant> >> /tmp/ads.log 2>&1
```

---

Architecture notes and future plans: [`.project/notes/`](.project/notes/)
