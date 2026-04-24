-- Tenants (replaces clients/[tenant]/brand.json)
CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  language        TEXT DEFAULT 'pt_BR',
  niche           TEXT,
  location        TEXT,
  primary_persona TEXT,
  tone            TEXT,
  instructions    TEXT,
  hashtags        TEXT,          -- JSON array
  google_ads_id   TEXT,
  ads_monitoring  TEXT,          -- JSON object
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- Posts (replaces clients/[tenant]/posts/*.json)
CREATE TABLE IF NOT EXISTS posts (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'draft',
  title        TEXT,
  content      TEXT NOT NULL,
  hashtags     TEXT,             -- JSON array
  media_type   TEXT,
  workflow     TEXT,             -- JSON object (AI generation provenance)
  media_path   TEXT,
  published_at TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_tenant_status  ON posts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_tenant_created ON posts(tenant_id, created_at DESC);

-- Reports (replaces clients/[tenant]/reports/*.md)
CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  type       TEXT NOT NULL,      -- audit | search | weekly | monthly | alert | report
  title      TEXT,
  content    TEXT NOT NULL,      -- full markdown
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_tenant            ON reports(tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_tenant_slug ON reports(tenant_id, slug);

-- Campaigns (replaces clients/[tenant]/ads/google/*.json)
CREATE TABLE IF NOT EXISTS campaigns (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  data        TEXT NOT NULL,     -- full JSON blob
  deployed_at TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant           ON campaigns(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_tenant_slug ON campaigns(tenant_id, slug);
