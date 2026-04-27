# T03 — Add SQLite migrations for tenants, posts, reports, campaigns

**Phase:** 1 — SQLite Schema  
**Status:** completed  
**ADR:** ADR-001  
**Depends on:** T02  
**Blocks:** T04, T05, T06, T07, T08, T09

---

## Goal

Add SQLite migrations that create the four new tables replacing flat-files. Migrations must be additive — existing tables (`integrations`, `integration_clients`, `monitoring_snapshots`, `alerts`, `agent_runs`) are untouched.

---

## Migration file

Create `db/migrations/003_content.sql`:

```sql
-- Tenants (replaces clients/[tenant]/brand.json)
CREATE TABLE IF NOT EXISTS tenants (
  id           TEXT PRIMARY KEY,         -- 'portico', 'bracar-pneus'
  name         TEXT NOT NULL,
  language     TEXT DEFAULT 'pt_BR',
  niche        TEXT,
  location     TEXT,
  primary_persona TEXT,
  tone         TEXT,
  instructions TEXT,
  hashtags     TEXT,                     -- JSON array  e.g. ["#Portico","#PoA"]
  google_ads_id TEXT,
  ads_monitoring TEXT,                   -- JSON object (thresholds from brand.json)
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

-- Posts (replaces clients/[tenant]/posts/*.json)
CREATE TABLE IF NOT EXISTS posts (
  id           TEXT PRIMARY KEY,         -- '2026-04-24_luminotecnico'
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'draft',  -- draft | approved | published
  title        TEXT,
  content      TEXT NOT NULL,
  hashtags     TEXT,                     -- JSON array
  media_type   TEXT,                     -- carousel | image | video | reel
  workflow     TEXT,                     -- JSON object (AI generation provenance)
  media_path   TEXT,                     -- relative path handled by storage adapter
  published_at TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_tenant_status ON posts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_tenant_created ON posts(tenant_id, created_at DESC);

-- Reports (replaces clients/[tenant]/reports/*.md)
CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,              -- 'google-ads-search-2026-04-16'
  type       TEXT NOT NULL,             -- audit | search | weekly | monthly | alert | report
  title      TEXT,
  content    TEXT NOT NULL,             -- full markdown as TEXT
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_tenant_slug ON reports(tenant_id, slug);

-- Campaigns (replaces clients/[tenant]/ads/google/*.json)
CREATE TABLE IF NOT EXISTS campaigns (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,            -- filename without extension
  data        TEXT NOT NULL,            -- full JSON blob
  deployed_at TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_tenant_slug ON campaigns(tenant_id, slug);
```

---

## Steps

1. Create `db/migrations/003_content.sql` with the SQL above
2. Register the migration file in `src/lib/server/db/index.ts` (add to the `MIGRATIONS` array)
3. Start the dev server — migrations run automatically on first `getDb()` call
4. Verify tables exist:

```bash
bun run -e "import { getDb } from './src/lib/server/db/index.ts'; const db = getDb(); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all())"
```

Expected output includes: `tenants`, `posts`, `reports`, `campaigns` alongside existing tables.

---

## Type inference note

The report `type` column must match the detection logic currently in the UI route. Mapping:

| slug contains | type value |
|---|---|
| `audit` | `audit` |
| `search` or `campaign` | `search` |
| `weekly` | `weekly` |
| `monthly` or ends with `YYYY-MM` | `monthly` |
| `alert` | `alert` |
| anything else | `report` |

This mapping will be used in T04 (seed script) to populate the `type` column from existing filenames.
