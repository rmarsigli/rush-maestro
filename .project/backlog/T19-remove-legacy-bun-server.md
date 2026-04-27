# T19 — Remove Legacy Bun Server Code

**Status:** pending  
**Phase:** 7 — Cleanup  
**Estimate:** 4–6 hours  
**Depends on:** T14 (REST API), T17 (Go ads connector), T18 (MCP removed)  
**Unlocks:** clean frontend — pure SPA with no server-side Bun/SQLite code  
**Parallel with:** nothing (touches many frontend files)

---

## Context

Before T14, the SvelteKit frontend acted as a BFF (Backend for Frontend): SvelteKit
server-side endpoints in `frontend/src/routes/api/` proxied to the SQLite layer via
`frontend/src/lib/server/`. T14 migrated the core routes (social, reports, campaigns,
alerts, schedule, settings) to call the Go REST API directly.

However, a large block of legacy code remains:

```
frontend/src/routes/api/           — legacy SvelteKit server endpoints (BFF)
frontend/src/lib/server/           — SQLite data access + Google Ads TypeScript clients
frontend/scripts/                  — Bun CLI scripts (replaced by Go MCP tools)
```

This task removes all of it. Some pages may still call the legacy API routes; those
must be migrated to the Go REST API before the routes can be deleted.

---

## Step 0 — Audit what still uses legacy code

Run these to find live dependencies before deleting anything:

```bash
# Which routes still import from lib/server/
grep -r "from.*lib/server/" frontend/src/routes/ --include="*.ts" --include="*.svelte" -l

# Which routes/pages call /api/* endpoints (legacy BFF routes)
grep -r "fetch.*['\"/]api/" frontend/src/routes/ --include="*.ts" --include="*.svelte" -l

# Which pages import from lib/server directly (unusual for .svelte — check what they import)
grep -r "from.*lib/server/" frontend/src --include="*.svelte"
```

As of the time this task was written, the following files still import from `lib/server/`:

**Legacy API route handlers (BFF layer):**
```
frontend/src/routes/api/posts/[client_id]/[filename]/media/+server.ts
frontend/src/routes/api/posts/[client_id]/[filename]/status/+server.ts
frontend/src/routes/api/posts/[client_id]/import/+server.ts
frontend/src/routes/api/posts/[client_id]/[filename]/+server.ts
frontend/src/routes/api/ads/google/[client_id]/[filename]/status/+server.ts
frontend/src/routes/api/ads/google/[client_id]/[filename]/deploy/+server.ts
frontend/src/routes/api/ads/google/[client_id]/live/[campaign_id]/export/+server.ts
frontend/src/routes/api/ads/google/[client_id]/import/+server.ts
frontend/src/routes/api/auth/google-ads/+server.ts
frontend/src/routes/api/auth/google-ads/callback/+server.ts
```

**Svelte pages importing server code (investigate what is imported):**
```
frontend/src/routes/[tenant]/social/drafts/+page.svelte
frontend/src/routes/[tenant]/social/+page.svelte
frontend/src/routes/[tenant]/ads/google/+page.svelte
frontend/src/routes/[tenant]/ads/google/live/[campaign_id]/+page.svelte
```

---

## Step 1 — Migrate pages off legacy API routes

For each Svelte page that still calls a legacy `/api/` route, replace it with a call
to the corresponding Go REST API endpoint via `frontend/src/lib/api/`.

**API mapping (legacy → Go REST):**

| Legacy SvelteKit route | Go REST equivalent |
|---|---|
| `POST /api/posts/[id]/status` | `PATCH /admin/tenants/{tid}/posts/{id}/status` |
| `POST /api/posts/[id]` (update) | `PUT /admin/tenants/{tid}/posts/{id}` |
| `POST /api/posts/[id]/media` | `POST /api/media/{tenant}/{filename}` |
| `POST /api/posts/import` | *(check if MCP `create_post` is a better fit)* |
| `GET/POST /api/ads/google/[id]/status` | `PATCH /admin/tenants/{tid}/campaigns/{id}/status` |
| `POST /api/ads/google/[id]/deploy` | `POST /admin/tenants/{tid}/campaigns/{id}/deploy` |
| `GET /api/ads/google/[id]/live/*/export` | *(export is local — read campaign JSON from DB)* |
| `POST /api/ads/google/import` | *(import is local — create campaign draft)* |
| `GET /api/auth/google-ads` | `/auth/google-ads/start` (Go OAuth — already wired) |
| `GET /api/auth/google-ads/callback` | `/auth/google-ads/callback` (Go OAuth) |

After migrating each page, verify the feature still works in the browser before
moving to the next.

---

## Step 2 — Delete legacy API route handlers

Once no page calls these routes:

```bash
rm -rf frontend/src/routes/api
```

---

## Step 3 — Delete server-side library files

The `frontend/src/lib/server/` directory contains:

```
db.ts              — SQLite/libSQL setup (obsolete — PostgreSQL via Go)
db/                — SQLite-era query functions (agent-runs, alerts, integrations, monitoring)
campaigns.ts       — campaign helpers
posts.ts           — post helpers
reports.ts         — report helpers
tenants.ts         — tenant helpers
storage.ts         — image storage helpers
integrations.ts    — integration data access (replaced by Go API)
googleAds.ts       — Google Ads TypeScript client
googleAdsClient.ts — Google Ads client factory
googleAdsDetailed.ts — extended Google Ads query helpers
```

Everything in `db/` and `db.ts` is SQLite-era code replaced by Go + PostgreSQL.
The `googleAds*.ts` files are replaced by `backend/internal/connector/googleads/`.

After Step 2 confirms no remaining imports, delete:

```bash
rm -rf frontend/src/lib/server
```

---

## Step 4 — Delete Bun CLI scripts

All scripts in `frontend/scripts/` are replaced by Go MCP tools or Go REST endpoints:

| Script | Replaced by |
|---|---|
| `collect-daily-metrics.ts` | MCP `collect_daily_metrics` |
| `consolidate-monthly.ts` | MCP `consolidate_monthly` |
| `deploy-google-ads.ts` | Go REST `POST /admin/tenants/{id}/campaigns/{cid}/deploy` |
| `publish-social-post.ts` | Go REST `PATCH /admin/tenants/{id}/posts/{pid}/status` |
| `test-ads-connection.ts` | MCP `get_live_metrics` (or integration test endpoint) |
| `test-query*.ts` | ad-hoc debugging scripts — safe to delete |
| `lib/ads.ts` | `backend/internal/connector/googleads/` |

```bash
rm -rf frontend/scripts
```

---

## Step 5 — Remove npm dependencies

```bash
cd frontend && bun remove google-ads-api better-sqlite3 @libsql/client
```

*(Run `bun remove` only for packages that were exclusively used by deleted code.
Check `frontend/package.json` against remaining imports before removing each one.)*

Then rebuild to confirm no broken imports:

```bash
cd frontend && bun run build
```

---

## Step 6 — Update CLAUDE.md

Remove the "Legacy Scripts" section and the `scripts/lib/ads.ts` reference from
`CLAUDE.md`. Update the directory structure to reflect the clean state.

---

## Commit

Split into two commits for clarity:

```
refactor(T19): migrate social and ads pages off legacy SvelteKit API routes
chore(T19): delete frontend/src/routes/api, lib/server, and scripts (all ported to Go)
```
