# Rush Maestro — Context for Claude Code

Local marketing management system with multi-tenant support. Combines a CMS with SQLite, AI-assisted content generation, Google Ads API integration, and an MCP server as the single communication layer for all agents.

## Stack

- **Runtime:** Bun
- **UI:** SvelteKit (Svelte 5 runes) + Tailwind v4 + `@tailwindcss/typography`
- **Database:** SQLite via `bun:sqlite` at `db/marketing.db`
- **MCP:** `@modelcontextprotocol/sdk` — Streamable HTTP at `POST /mcp`
- **Google Ads:** `google-ads-api` npm package (v23)
- **Markdown:** `marked` v18 (server-side, for reports)
- **Storage:** SQLite for content; images at `storage/images/[tenant]/`
- **Credentials:** Google Ads OAuth stored in the `integrations` table (not `.env`)

## Agent Communication — MCP Only

**All agents interact with this system exclusively through MCP tools.** There are no agent `.md` files, no flat-file workflows, no direct script invocations from agents. The MCP server at `http://localhost:5173/mcp` is the only interface.

This design supports both CLI agents (Claude Code, Gemini CLI) and a future UI with LLM API connectors — every operation that a model can trigger goes through a typed, versioned tool.

## Clients

Each client is a record in the `tenants` table. Create with `create_tenant` MCP tool.
Google Ads credentials live in the `integrations` table (provider `google_ads`).
Real IDs, tracking tags and URLs **never** go in committed files.

## Directory Structure

```
src/
  routes/
    [tenant]/
      social/         — social post management (draft / approved / scheduled / published)
      ads/google/     — Google Ads campaigns (local draft + live API)
      reports/        — report listing and viewing (MD rendered as prose)
      alerts/         — monitoring alert inbox
      schedule/       — content planner calendar
    mcp/              — MCP endpoint (POST /mcp, GET /mcp, DELETE /mcp)
    api/              — internal REST endpoints
    settings/         — integrations, tenant settings

  lib/server/
    tenants.ts           — tenant CRUD
    posts.ts             — social post CRUD
    reports.ts           — report CRUD
    campaigns.ts         — Google Ads local campaign CRUD
    googleAds.ts         — live campaign query via API
    googleAdsDetailed.ts — detailed metrics + history
    googleAdsClient.ts   — shared Google Ads customer factory (reads creds from integrations)
    storage.ts           — image read/write in storage/images/
    integrations.ts      — re-exports from db/integrations
    mcp/
      server.ts          — createServer() — registers all tools and resources
      tools/
        content.ts       — tenants, posts, reports, campaigns, alerts
        ads.ts           — Google Ads read + write operations
        monitoring.ts    — metrics collection, consolidation, history
      resources/
        tenants.ts       — tenant:// resources
    db/
      index.ts           — getDb(), automatic migrations
      monitoring.ts      — daily_metrics + monthly_summary CRUD
      alerts.ts          — alert_events (WARN/CRITICAL)
      agent-runs.ts      — agent execution log
      integrations.ts    — OAuth integrations CRUD

scripts/              — system-level utilities (cron, deployment, diagnostics)
  lib/ads.ts          — script-side Google Ads client (reads creds from integrations)
  collect-daily-metrics.ts  — cron wrapper for collect_daily_metrics logic
  consolidate-monthly.ts    — cron wrapper for consolidate_monthly logic
  deploy-google-ads.ts      — deploy approved campaign JSON to live Google Ads
  publish-social-post.ts    — publish posts via Meta Graph API
  test-ads-connection.ts    — verify Google Ads API connection
  test-query*.ts            — diagnostic queries

storage/images/[tenant]/   — post images (served at /api/media/[tenant]/[filename])
db/marketing.db            — SQLite database (auto-generated, gitignored)
.mcp.json                  — MCP config (auto-detected by Claude Code and Gemini CLI)
```

## MCP Tools Reference

### Content

| Tool | Description |
|---|---|
| `list_tenants` | List all clients |
| `get_tenant` | Brand config for a client |
| `create_tenant` | Create new client |
| `update_tenant` | Edit brand config |
| `list_posts` | Posts for a client (filter by status) |
| `get_post` | Individual post with workflow |
| `create_post` | Create new draft |
| `update_post_status` | Status transition (draft → approved → scheduled → published) |
| `delete_post` | Delete post |
| `list_reports` | Reports for a client |
| `get_report` | Full markdown content of a report |
| `create_report` | Save new report |
| `list_campaigns` | Local campaign drafts for a client |
| `get_campaign` | Full JSON of a local campaign |
| `check_alerts` | Open monitoring alerts (WARN/CRITICAL) |

### Google Ads — Read

| Tool | Description |
|---|---|
| `get_live_metrics` | Live campaign metrics from Google Ads API |
| `get_campaign_criteria` | Negative keywords, ad schedule, location/device criteria |
| `get_search_terms` | Search terms report (last N days) |
| `get_ad_groups` | Ad groups with metrics |

### Google Ads — Write

| Tool | Description |
|---|---|
| `add_negative_keywords` | Add negative keywords at campaign level |
| `update_campaign_budget` | Update daily budget (in BRL) |
| `set_weekday_schedule` | Add Mon–Fri schedule — ads don't serve Sat/Sun |
| `add_ad_group_keywords` | Add keywords to an ad group |
| `add_campaign_extensions` | Create and link callout + sitelink assets |
| `set_campaign_status` | Pause or enable a campaign |

### Monitoring

| Tool | Description |
|---|---|
| `collect_daily_metrics` | Fetch metrics from Google Ads API → store in SQLite + generate alerts |
| `consolidate_monthly` | Aggregate daily → monthly summary in SQLite |
| `get_metrics_history` | Read stored daily metrics (last N days) from SQLite |
| `get_monthly_summary` | Read consolidated monthly data from SQLite |

### Resources

| URI | Description |
|---|---|
| `tenant://list` | List all tenants |
| `tenant://{id}/brand` | Brand config |
| `tenant://{id}/posts` | All posts |
| `tenant://{id}/reports` | Report list |
| `tenant://{id}/reports/{slug}` | Report markdown content |

## Scripts

Scripts are system-level only — for cron jobs, deployment, and diagnostics. Agents do not call scripts directly; they use MCP tools.

```bash
bun run scripts/collect-daily-metrics.ts <tenant> [YYYY-MM-DD]
bun run scripts/consolidate-monthly.ts <tenant> [YYYY-MM]
bun run scripts/deploy-google-ads.ts <path-to-campaign.json> <tenant_id>
bun run scripts/publish-social-post.ts <tenant_id> <post_id>
bun run scripts/test-ads-connection.ts <customer-id>
bun run scripts/test-query.ts <customer-id> <campaign-id>
```

**Temporary analysis scripts** go at the project root and are deleted after use.

### scripts/lib/ads.ts

Every script that accesses Google Ads imports from here (reads OAuth creds from `integrations` table). Never instantiate `GoogleAdsApi` directly in scripts.

```typescript
import { getCustomer, enums, micros, fromMicros } from './scripts/lib/ads.ts';
const c = getCustomer('123-456-7890');
```

Server-side code (MCP tools, loaders) uses `src/lib/server/googleAdsClient.ts` instead.

## UI Types and Conventions

Strict typing throughout — no `any` in production code. Core types:

- `src/lib/server/tenants.ts` → `Tenant`, `AdsMonitoringConfig`
- `src/lib/server/posts.ts` → `Post`, `PostStatus`, `MediaType`, `PostWorkflow`
- `src/lib/server/reports.ts` → `Report`, `ReportType`
- `src/lib/server/campaigns.ts` → `Campaign`
- `src/lib/server/googleAds.ts` → `LiveCampaign`
- `src/lib/server/googleAdsDetailed.ts` → `DetailedCampaign`, `CampaignAdGroup`, `AdGroupMetrics`, `HistoryEntry`
- `src/lib/server/db.ts` → `PostWithMeta`, `PostPlatform`, `GoogleAdCampaignWithMeta`

## Reports

Reports are SQLite records with markdown content. Slug naming drives the UI badge color:

| Slug pattern | Type | Color |
|---|---|---|
| `audit` | Audit | amber |
| `search` / `campaign` | Search Campaign | blue |
| `weekly` | Weekly | emerald |
| `monthly` / ends with `YYYY-MM` | Monthly | violet |
| `alert` | Alert | red |
| others | Report | slate |

Naming conventions: `google-ads-audit-YYYY-MM-DD`, `google-ads-YYYY-MM`, `google-ads-search-YYYY-MM-DD`.

Route `/[tenant]/reports/[slug]` renders MD as prose with "Download PDF" (`window.print()`).

## Operational Rules — Google Ads

**Never modify live campaigns autonomously.** Required workflow:

1. Analysis → run freely via read tools
2. Draft changes → generate, show to user, wait for approval
3. Execute mutation → describe the action, wait for explicit confirmation, then call write tool
4. Verify → query after execution to confirm the change took effect

## General Conventions

- SQLite is the source of truth for all content
- `db/marketing.db` is gitignored — auto-generated by `getDb()`
- Commits follow Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`
- Client IDs, campaign IDs and tracking tags never go in committed files
- Svelte components use `untrack()` for `$state` initialized from `$props` + `$effect` for sync
