# Marketing CMS

Local marketing management system for multiple clients. Combines a hybrid flat-file + SQLite architecture, AI-assisted content generation, Google Ads API integration, and a SvelteKit web UI for review and operations.

## Architecture

The system uses two storage layers with distinct responsibilities:

| Layer | What goes here | Examples |
|---|---|---|
| **Flat-file** (JSON / MD) | Editorial content created by agents, reviewed by humans | Posts, ad campaigns, reports, brand config |
| **SQLite** (`db/marketing.db`) | Operational / time-series data generated automatically | Daily metrics, alerts, script execution logs |

This separation keeps content versionable and human-editable while allowing efficient accumulation and querying of monitoring data.

## Stack

- **Runtime:** Bun
- **UI:** SvelteKit (Svelte 5 runes) + Tailwind v4
- **Google Ads:** `google-ads-api` v23
- **Database:** SQLite via `better-sqlite3` (Node.js SSR) / `bun:sqlite` (Bun scripts) — same API, runtime-detected
- **Markdown:** `marked` v18 (server-side, for reports)
- **AI agents:** Claude Code sub-agents (`.claude/agents/`)

## Directory Structure

```
.
├── clients/[tenant]/          # gitignored — client data
│   ├── brand.json             # Name, niche, Google Ads ID, monitoring thresholds
│   ├── posts/                 # Social media posts (JSON + media)
│   ├── ads/google/            # Google Ads campaign drafts (JSON)
│   └── reports/               # Audit and performance reports (MD)
│
├── db/
│   ├── marketing.db           # Central SQLite database (gitignored)
│   └── migrations/
│       └── 001_schema.sql     # Schema — runs automatically on first connection
│
├── lib/db/                    # Database access layer (shared by scripts and UI)
│   ├── index.ts               # Singleton connection + auto-migrate
│   ├── monitoring.ts          # daily_metrics, monthly_summary
│   ├── alerts.ts              # alert_events (WARN + CRITICAL)
│   └── agent-runs.ts          # Execution log for all scripts
│
├── scripts/
│   ├── lib/ads.ts             # Shared Google Ads client factory
│   ├── collect-daily-metrics.ts   # Daily Google Ads data collection + alert generation
│   ├── consolidate-monthly.ts     # Monthly aggregation from daily data
│   ├── deploy-google-ads.ts       # Deploy approved campaign JSON to Google Ads API
│   └── publish-social-post.ts     # Publish approved post via Meta Graph API
│
├── ui/                        # SvelteKit web UI
│   └── src/routes/[tenant]/
│       ├── social/            # Post management (Kanban / Cards / List views)
│       ├── ads/google/        # Campaign management + live API metrics
│       ├── alerts/            # Alerts inbox (CRITICAL / WARN)
│       ├── reports/           # Markdown report viewer
│       └── settings/          # Client settings
│
├── .claude/
│   └── agents/                # AI agent persona definitions
│
└── docs/                      # Technical documentation
```

## Features

### Social Media
- Create posts via form or raw JSON import
- Kanban, Cards, and List views with localStorage persistence
- Attach media (images/video) per post
- Draft → Approved workflow
- Publish via Meta Graph API (`scripts/publish-social-post.ts`)

### Google Ads
- Manage campaign drafts locally as JSON
- Deploy approved campaigns to Google Ads API (creates budget, campaign, ad groups, keywords, RSAs — all PAUSED for review)
- Live campaign metrics pulled directly from the API
- Historical data export for agent analysis

### Monitoring & Alerts
- Daily automated collection via `scripts/collect-daily-metrics.ts`
- Threshold-based alerts: no-conversion streak, high CPA, budget underpace, low impressions
- Alerts inbox in the UI with resolve/ignore workflow
- Full execution history in SQLite

### Reports
- Markdown reports in `clients/[tenant]/reports/`
- Auto-detected types (audit, search, weekly, monthly, alert) with distinct color coding
- Browser print-to-PDF support

## AI Agents

| Agent | Responsibility |
|---|---|
| `social-media-copy-creator` | Generates structured JSON posts aligned to client brand and tone |
| `social-media-planner` | Creates 30-day content calendars |
| `google-ads-creator` | Builds deploy-ready Google Ads JSON (campaign + ad groups + RSAs) |
| `monitoring` | Daily metrics collection and alert interpretation |
| `weekly-report` | Generates weekly performance reports from SQLite data |
| `creative-analyst` | Reads MD reports and produces executive summaries |

## Scripts

All scripts run from the project root with `bun run`. Bun loads `.env` automatically.

```bash
# Google Ads — testing
bun run scripts/test-ads-connection.ts <customer-id>
bun run scripts/test-query.ts <customer-id> <campaign-id>

# Monitoring
bun run scripts/collect-daily-metrics.ts <tenant>          # defaults to yesterday
bun run scripts/collect-daily-metrics.ts <tenant> 2026-04-15  # specific date
bun run scripts/consolidate-monthly.ts <tenant>            # current month

# Deployment
bun run scripts/deploy-google-ads.ts clients/<tenant>/ads/google/<campaign>.json
bun run scripts/publish-social-post.ts <tenant> <post>.json
```

## Daily Monitoring — Crontab Setup

```bash
crontab -e
```

```
3 7 * * * cd /path/to/marketing && bun run scripts/collect-daily-metrics.ts portico >> /tmp/ads-monitor.log 2>&1
```

Add one line per active tenant. No AI tokens consumed — pure Bun + Google Ads API.

## Environment Variables

Copy `.env.example` to `.env` at the project root and fill in your credentials. See `docs/getting-started.md` for the full setup guide.

## Documentation

- [`docs/getting-started.md`](docs/getting-started.md) — environment setup, first run, adding clients
- [`docs/google-ads-workflow.md`](docs/google-ads-workflow.md) — campaign lifecycle from draft to live monitoring
- [`docs/monitoring-system.md`](docs/monitoring-system.md) — database schema, alert logic, scheduling
