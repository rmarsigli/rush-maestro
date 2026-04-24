# ADR-001: Migrate to SvelteKit-at-Root + SQLite + MCP

**Status:** Accepted  
**Date:** 2026-04-24  
**Author:** Rafhael Marsigli

---

## Context

The project started as a flat-file CMS (`clients/[tenant]/`) with scripts for Google Ads operations and a SvelteKit UI in `ui/`. As the product grew, three tensions emerged:

1. **UI is now the product, not the dashboard.** The SvelteKit app covers social posts, campaigns, reports, settings, alerts, schedule — it is the core interface. Living in `ui/` as a subdirectory no longer reflects this.

2. **Flat-files don't serve operational data.** SQLite already exists (`lib/db/`) for integrations, monitoring, alerts, agent-runs. The remaining flat-files (posts, brand, reports, campaigns) have the same operational characteristics: they need filtering by status, ordering by date, atomic updates. Flat-files make this harder than it needs to be.

3. **Agents communicate through scripts, not a structured protocol.** Claude Code, Gemini CLI, and VSCode Copilot all support MCP. The current scripts (`deploy-google-ads.ts`, `test-query.ts`) are developer tools, not a protocol that agents and the UI can share. Logic is duplicated.

Additionally, the `lib/db/index.ts` dual-runtime shim (Bun vs Node/better-sqlite3) exists only because the SvelteKit dev server ran under Vite/Node. If SvelteKit runs under Bun directly, this shim is unnecessary.

---

## Decision

### 1. Move SvelteKit to project root

`ui/` moves to root. `src/` is the SvelteKit app. `lib/db/` moves to `src/lib/server/db/`. The project is one Bun process, not a nested package.

### 2. Replace flat-files with SQLite

All `clients/[tenant]/` content migrates to SQLite:

| Was | Now |
|---|---|
| `clients/[tenant]/brand.json` | `tenants` table |
| `clients/[tenant]/posts/*.json` | `posts` table |
| `clients/[tenant]/reports/*.md` | `reports` table (content as TEXT) |
| `clients/[tenant]/ads/google/*.json` | `campaigns` table |

Images stay as local files under `storage/images/[tenant]/` until the storage adapter migration (see §4).

### 3. Storage adapter interface

A `StorageAdapter` interface abstracts all image I/O. Local filesystem is the first implementation. R2/S3 is a future drop-in. No route or tool ever calls `fs` directly for images.

```typescript
interface StorageAdapter {
  put(tenant: string, name: string, data: Buffer, mime: string): Promise<void>
  url(tenant: string, name: string): string
  delete(tenant: string, name: string): Promise<void>
}
```

### 4. MCP server at `/mcp` via SvelteKit

A single Bun process serves both the UI and the MCP server. The MCP endpoint lives at `http://localhost:5173/mcp` (Streamable HTTP transport). A `.mcp.json` at the project root points Claude Code, Gemini CLI, and VSCode to this URL.

The MCP server is only needed when the project is open and the dev server is running — this matches the actual usage pattern.

### 5. Core logic as TypeScript functions; MCP as thin adapter

All business logic lives in `src/lib/server/` as plain TypeScript functions. The MCP server and the SvelteKit routes are both consumers of the same functions. No logic lives inside a tool definition.

```
src/lib/server/tenants.ts     ← CRUD, consumed by routes + MCP
src/lib/server/posts.ts       ← CRUD, consumed by routes + MCP
src/lib/server/reports.ts     ← CRUD, consumed by routes + MCP
src/lib/server/campaigns.ts   ← CRUD, consumed by routes + MCP
src/lib/server/ads.ts         ← Google Ads API, consumed by routes + MCP
src/lib/server/storage.ts     ← storage adapter, consumed by routes + MCP

src/lib/server/mcp/
  server.ts                   ← MCP server instance (StreamableHTTPServerTransport)
  tools/                      ← thin adapters (5–10 lines each)
  resources/                  ← read-only data (posts, brand, reports)
```

### 6. Drop dual-runtime DB shim

With Bun as the sole runtime, `lib/db/index.ts` uses `bun:sqlite` directly. The `better-sqlite3` dependency and runtime detection logic are removed.

---

## Directory Structure (target)

```
/ (root)
  src/
    routes/
      [tenant]/
        social/
        ads/google/
        reports/
        alerts/
        schedule/
        settings/
      api/
      settings/
      mcp/                    ← MCP endpoint (+server.ts)
    lib/
      server/
        db/                   ← SQLite modules (was lib/db/)
          index.ts
          tenants.ts
          posts.ts
          reports.ts
          campaigns.ts
          integrations.ts
          monitoring.ts
          alerts.ts
          agent-runs.ts
        mcp/
          server.ts
          tools/
          resources/
        tenants.ts            ← business logic
        posts.ts
        reports.ts
        campaigns.ts
        ads.ts
        storage.ts
      components/             ← UI components
  storage/
    images/                   ← local image files (gitignored)
  db/
    marketing.db
    migrations/
  scripts/                    ← thin debug wrappers only
  .mcp.json                   ← MCP client config (committed)
  package.json
  svelte.config.js
  vite.config.ts
```

---

## SQLite Schema

### New migrations to add

```sql
-- tenants (replaces clients/[tenant]/brand.json)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT DEFAULT 'pt_BR',
  niche TEXT,
  location TEXT,
  primary_persona TEXT,
  tone TEXT,
  instructions TEXT,
  hashtags TEXT,           -- JSON array
  google_ads_id TEXT,
  ads_monitoring TEXT,     -- JSON object
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- posts (replaces clients/[tenant]/posts/*.json)
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT,
  content TEXT NOT NULL,
  hashtags TEXT,           -- JSON array
  media_type TEXT,
  workflow TEXT,           -- JSON object (AI provenance)
  media_path TEXT,         -- relative to storage adapter
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_tenant_status ON posts(tenant_id, status);

-- reports (replaces clients/[tenant]/reports/*.md)
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  type TEXT NOT NULL,      -- audit/search/weekly/monthly/alert/report
  title TEXT,
  content TEXT NOT NULL,   -- full markdown as TEXT
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id, created_at DESC);

-- campaigns (replaces clients/[tenant]/ads/google/*.json)
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  data TEXT NOT NULL,      -- full JSON blob
  deployed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## MCP Tools (target)

| Tool | Action |
|---|---|
| `list_tenants` | List all clients |
| `get_tenant` | Brand, persona, ads config |
| `create_tenant` | New client |
| `list_posts` | Filter by tenant + status |
| `get_post` | Full post with workflow |
| `create_post` | New draft |
| `update_post_status` | draft → approved → published |
| `list_reports` | Filter by tenant + type |
| `get_report` | Full markdown content |
| `create_report` | Save new report |
| `list_campaigns` | Local campaigns for tenant |
| `deploy_campaign` | Push JSON to Google Ads API |
| `get_live_metrics` | Query live campaign from API |
| `check_alerts` | Run monitoring checks |

## MCP Resources (target)

| Resource URI | Content |
|---|---|
| `tenant://{id}/brand` | Brand config + persona |
| `tenant://{id}/posts` | Post list with status |
| `tenant://{id}/reports/{slug}` | Full report markdown |

---

## Migration Plan

1. Move SvelteKit to root (structural only, no logic changes)
2. Drop dual-runtime shim, use `bun:sqlite` directly
3. Add SQLite migrations for new tables
4. Write `scripts/migrate-flat-to-sqlite.ts` seed script
5. Implement `src/lib/server/{tenants,posts,reports,campaigns}.ts`
6. Define storage adapter interface + local implementation
7. Update all `+page.server.ts` and API routes to use new functions
8. Implement MCP server at `src/routes/mcp/+server.ts`
9. Implement MCP tools + resources
10. Add `.mcp.json`
11. Run seed script, verify data integrity
12. Remove flat-file read paths and `clients/` content (keep `storage/images/`)
13. Update `CLAUDE.md` and `scripts/`

---

## Consequences

**Positive:**
- Single Bun process, single port, zero subprocess management
- Agents and UI share the same TypeScript functions — no duplicated logic
- SQLite enables filtering, ordering, FTS on reports, atomic updates
- Storage abstraction makes R2/S3 migration a one-file swap
- MCP resources allow agents to browse data without explicit tool calls
- No more dual-runtime shim

**Negative / Risks:**
- Large structural change — many files move simultaneously
- All UI routes need to be updated (15+ `+page.server.ts` files)
- Data migration script must be verified before removing flat-files
- SvelteKit restart drops MCP connection (clients reconnect automatically — minor)

**Unchanged:**
- `clients/[tenant]/media/` stays as local files (until R2 migration)
- Conventional Commits, no-secrets-in-commits policy
- Google Ads "confirm before live changes" rule
- `scripts/` as debug utilities
