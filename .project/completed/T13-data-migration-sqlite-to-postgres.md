# T13 — Data Migration: SQLite → PostgreSQL + Repository Layer

**Status:** completed — moved to `completed/T13-data-migration-sqlite-to-postgres.md`  
**Phase:** 2 — Data Migration  
**Estimate:** 8–10 hours  
**Depends on:** T11 (Go Foundation)  
**Runs in parallel with:** T12 (Auth) — no shared dependencies  
**Unlocks:** T14 (REST API core), T15 (Integrations Hub)

---

## Context

The current Rush Maestro system stores all data in SQLite at `db/marketing.db`.
This task:

1. Creates PostgreSQL migrations for every existing table (tenants, posts, reports,
   campaigns, metrics, alerts, integrations)
2. Implements the Go repository layer (domain structs + SQLC queries + repository structs)
3. Provides a one-time migration script that reads the live SQLite database and inserts
   all rows into PostgreSQL

The SvelteKit app continues running against SQLite during this entire task — no downtime,
no data loss. The Go API will be pointed at PostgreSQL from day one. Cutover happens when
T14 (REST API) is complete and the SvelteKit frontend is switched to SPA mode.

---

## Existing SQLite schema (reference)

Located at `db/migrations/` in the project root. Tables and their columns:

### tenants
```
id, name, language, niche, location, primary_persona, tone, instructions,
hashtags (JSON), google_ads_id, ads_monitoring (JSON), created_at, updated_at
```

### posts
```
id, tenant_id, status (draft|approved|scheduled|published),
title, content, hashtags (JSON), media_type, workflow (JSON),
media_path, platforms (JSON), scheduled_date, scheduled_time,
published_at, created_at, updated_at
```

### reports
```
id, tenant_id, slug, type (audit|search|weekly|monthly|alert|report),
title, content, created_at
```

### campaigns
```
id, tenant_id, slug, data (JSON), deployed_at, created_at, updated_at
```

### daily_metrics
```
id, tenant_id, date, campaign_id, campaign_name,
impressions, clicks, cost_brl, conversions, cpa_brl,
ctr, search_impression_share, created_at
```

### monthly_summary
```
id, tenant_id, month (YYYY-MM), campaign_id, campaign_name,
impressions, clicks, cost_brl, conversions, avg_cpa_brl, created_at
```

### alert_events
```
id, tenant_id, level (WARN|CRITICAL), type, campaign_id, campaign_name,
message, details (JSON), resolved_at, ignored_at, created_at
```

### integrations
```
id, name, provider, oauth_client_id, oauth_client_secret,
developer_token, login_customer_id, refresh_token,
status (pending|connected|error), error_message, created_at, updated_at
```

### integration_clients
```
integration_id, tenant_id (UNIQUE per tenant — one integration per provider per tenant)
```

### agent_runs
```
id, tenant_id, agent, status, started_at, finished_at, summary, error
```

---

## Step 1 — PostgreSQL migrations

Create each file in `api/migrations/`. Run `go run ./cmd/migrate up` after each group
to validate before moving on.

### migrations/000002_tenants.sql

```sql
-- +goose Up
CREATE TABLE tenants (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    language        TEXT NOT NULL DEFAULT 'pt_BR',
    niche           TEXT,
    location        TEXT,
    primary_persona TEXT,
    tone            TEXT,
    instructions    TEXT,
    hashtags        JSONB NOT NULL DEFAULT '[]',
    google_ads_id   TEXT,
    ads_monitoring  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE IF EXISTS tenants;
```

### migrations/000005_integrations.sql

```sql
-- +goose Up
CREATE TABLE integrations (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    provider             TEXT NOT NULL,
    "group"              TEXT NOT NULL DEFAULT 'other',
    oauth_client_id      TEXT,
    oauth_client_secret  TEXT,
    developer_token      TEXT,
    login_customer_id    TEXT,
    refresh_token        TEXT,
    status               TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'connected', 'error')),
    error_message        TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE integration_tenants (
    integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    PRIMARY KEY (integration_id, tenant_id)
);

-- Enforce: one integration per provider per tenant
CREATE UNIQUE INDEX idx_integration_tenants_provider_tenant
    ON integration_tenants (tenant_id)
    -- This index only constrains 1:1 at the junction level.
    -- Business rule: one active Google Ads integration per tenant.
    -- Enforced in application layer for flexibility.
    ;

CREATE INDEX idx_integrations_provider ON integrations (provider);

-- +goose Down
DROP TABLE IF EXISTS integration_tenants;
DROP TABLE IF EXISTS integrations;
```

### migrations/000006_posts.sql

```sql
-- +goose Up
CREATE TABLE posts (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'approved', 'scheduled', 'published')),
    title          TEXT,
    content        TEXT NOT NULL DEFAULT '',
    hashtags       JSONB NOT NULL DEFAULT '[]',
    media_type     TEXT,
    workflow       JSONB,
    media_path     TEXT,
    platforms      JSONB NOT NULL DEFAULT '[]',
    scheduled_date TEXT,
    scheduled_time TEXT,
    published_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_tenant_id ON posts (tenant_id);
CREATE INDEX idx_posts_status    ON posts (status);
CREATE INDEX idx_posts_scheduled ON posts (tenant_id, scheduled_date)
    WHERE status = 'scheduled';

-- +goose Down
DROP TABLE IF EXISTS posts;
```

### migrations/000007_reports.sql

```sql
-- +goose Up
CREATE TABLE reports (
    id         TEXT PRIMARY KEY,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'report'
                   CHECK (type IN ('audit', 'search', 'weekly', 'monthly', 'alert', 'report')),
    title      TEXT,
    content    TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_reports_tenant_id ON reports (tenant_id);

-- +goose Down
DROP TABLE IF EXISTS reports;
```

### migrations/000008_campaigns.sql

```sql
-- +goose Up
CREATE TABLE campaigns (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    deployed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_campaigns_tenant_id ON campaigns (tenant_id);

-- +goose Down
DROP TABLE IF EXISTS campaigns;
```

### migrations/000009_metrics.sql

```sql
-- +goose Up
CREATE TABLE daily_metrics (
    id                    TEXT PRIMARY KEY,
    tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    date                  DATE NOT NULL,
    campaign_id           TEXT NOT NULL,
    campaign_name         TEXT NOT NULL,
    impressions           INTEGER NOT NULL DEFAULT 0,
    clicks                INTEGER NOT NULL DEFAULT 0,
    cost_brl              NUMERIC(10, 2) NOT NULL DEFAULT 0,
    conversions           NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cpa_brl               NUMERIC(10, 2),
    ctr                   NUMERIC(6, 4),
    search_impression_share NUMERIC(6, 4),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, date, campaign_id)
);

CREATE TABLE monthly_summary (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    month         TEXT NOT NULL,             -- format: YYYY-MM
    campaign_id   TEXT NOT NULL,
    campaign_name TEXT NOT NULL,
    impressions   INTEGER NOT NULL DEFAULT 0,
    clicks        INTEGER NOT NULL DEFAULT 0,
    cost_brl      NUMERIC(10, 2) NOT NULL DEFAULT 0,
    conversions   NUMERIC(10, 2) NOT NULL DEFAULT 0,
    avg_cpa_brl   NUMERIC(10, 2),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, month, campaign_id)
);

CREATE INDEX idx_daily_metrics_tenant_date ON daily_metrics (tenant_id, date DESC);
CREATE INDEX idx_monthly_summary_tenant    ON monthly_summary (tenant_id, month DESC);

-- +goose Down
DROP TABLE IF EXISTS monthly_summary;
DROP TABLE IF EXISTS daily_metrics;
```

### migrations/000010_alerts.sql

```sql
-- +goose Up
CREATE TABLE alert_events (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    level         TEXT NOT NULL CHECK (level IN ('WARN', 'CRITICAL')),
    type          TEXT NOT NULL,
    campaign_id   TEXT,
    campaign_name TEXT,
    message       TEXT NOT NULL,
    details       JSONB,
    resolved_at   TIMESTAMPTZ,
    ignored_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_events_tenant    ON alert_events (tenant_id, created_at DESC);
CREATE INDEX idx_alert_events_open      ON alert_events (tenant_id)
    WHERE resolved_at IS NULL AND ignored_at IS NULL;

-- +goose Down
DROP TABLE IF EXISTS alert_events;
```

### migrations/000011_agent_runs.sql

```sql
-- +goose Up
CREATE TABLE agent_runs (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    agent       TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    summary     TEXT,
    error       TEXT
);

CREATE INDEX idx_agent_runs_tenant ON agent_runs (tenant_id, started_at DESC);

-- +goose Down
DROP TABLE IF EXISTS agent_runs;
```

---

## Step 2 — SQLC queries

### internal/repository/queries/tenants.sql

```sql
-- name: ListTenants :many
SELECT * FROM tenants ORDER BY name;

-- name: GetTenantByID :one
SELECT * FROM tenants WHERE id = $1 LIMIT 1;

-- name: CreateTenant :exec
INSERT INTO tenants (id, name, language, niche, location, primary_persona, tone, instructions, hashtags, google_ads_id, ads_monitoring)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);

-- name: UpdateTenant :exec
UPDATE tenants
SET name = $2, language = $3, niche = $4, location = $5,
    primary_persona = $6, tone = $7, instructions = $8,
    hashtags = $9, google_ads_id = $10, ads_monitoring = $11,
    updated_at = NOW()
WHERE id = $1;

-- name: DeleteTenant :exec
DELETE FROM tenants WHERE id = $1;
```

### internal/repository/queries/posts.sql

```sql
-- name: ListPosts :many
SELECT * FROM posts WHERE tenant_id = $1
ORDER BY created_at DESC;

-- name: ListPostsByStatus :many
SELECT * FROM posts WHERE tenant_id = $1 AND status = $2
ORDER BY created_at DESC;

-- name: GetPostByID :one
SELECT * FROM posts WHERE id = $1 LIMIT 1;

-- name: CreatePost :exec
INSERT INTO posts (id, tenant_id, status, title, content, hashtags, media_type, workflow, media_path, platforms, scheduled_date, scheduled_time)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);

-- name: UpdatePostStatus :exec
UPDATE posts
SET status = $2, published_at = $3, updated_at = NOW()
WHERE id = $1;

-- name: UpdatePost :exec
UPDATE posts
SET title = $2, content = $3, hashtags = $4, media_type = $5,
    platforms = $6, scheduled_date = $7, scheduled_time = $8,
    workflow = $9, updated_at = NOW()
WHERE id = $1;

-- name: DeletePost :exec
DELETE FROM posts WHERE id = $1;

-- name: ListScheduledPosts :many
SELECT * FROM posts
WHERE tenant_id = $1 AND status = 'scheduled'
  AND scheduled_date IS NOT NULL
ORDER BY scheduled_date, scheduled_time;
```

### internal/repository/queries/reports.sql

```sql
-- name: ListReports :many
SELECT id, tenant_id, slug, type, title, created_at
FROM reports WHERE tenant_id = $1
ORDER BY created_at DESC;

-- name: GetReportBySlug :one
SELECT * FROM reports WHERE tenant_id = $1 AND slug = $2 LIMIT 1;

-- name: GetReportByID :one
SELECT * FROM reports WHERE id = $1 LIMIT 1;

-- name: CreateReport :exec
INSERT INTO reports (id, tenant_id, slug, type, title, content)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: DeleteReport :exec
DELETE FROM reports WHERE id = $1;
```

### internal/repository/queries/campaigns.sql

```sql
-- name: ListCampaigns :many
SELECT * FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC;

-- name: GetCampaignBySlug :one
SELECT * FROM campaigns WHERE tenant_id = $1 AND slug = $2 LIMIT 1;

-- name: UpsertCampaign :exec
INSERT INTO campaigns (id, tenant_id, slug, data)
VALUES ($1, $2, $3, $4)
ON CONFLICT (tenant_id, slug) DO UPDATE
SET data = EXCLUDED.data, updated_at = NOW();

-- name: MarkCampaignDeployed :exec
UPDATE campaigns SET deployed_at = NOW(), updated_at = NOW() WHERE id = $1;

-- name: DeleteCampaign :exec
DELETE FROM campaigns WHERE id = $1;
```

### internal/repository/queries/metrics.sql

```sql
-- name: UpsertDailyMetrics :exec
INSERT INTO daily_metrics (id, tenant_id, date, campaign_id, campaign_name,
    impressions, clicks, cost_brl, conversions, cpa_brl, ctr, search_impression_share)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
ON CONFLICT (tenant_id, date, campaign_id) DO UPDATE
SET impressions = EXCLUDED.impressions,
    clicks = EXCLUDED.clicks,
    cost_brl = EXCLUDED.cost_brl,
    conversions = EXCLUDED.conversions,
    cpa_brl = EXCLUDED.cpa_brl,
    ctr = EXCLUDED.ctr,
    search_impression_share = EXCLUDED.search_impression_share;

-- name: GetMetricsHistory :many
SELECT * FROM daily_metrics
WHERE tenant_id = $1
  AND date >= NOW() - ($2 || ' days')::interval
ORDER BY date DESC;

-- name: UpsertMonthlySummary :exec
INSERT INTO monthly_summary (id, tenant_id, month, campaign_id, campaign_name,
    impressions, clicks, cost_brl, conversions, avg_cpa_brl)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (tenant_id, month, campaign_id) DO UPDATE
SET impressions = EXCLUDED.impressions,
    clicks = EXCLUDED.clicks,
    cost_brl = EXCLUDED.cost_brl,
    conversions = EXCLUDED.conversions,
    avg_cpa_brl = EXCLUDED.avg_cpa_brl;

-- name: GetMonthlySummary :many
SELECT * FROM monthly_summary
WHERE tenant_id = $1
ORDER BY month DESC
LIMIT $2;
```

### internal/repository/queries/alerts.sql

```sql
-- name: ListOpenAlerts :many
SELECT * FROM alert_events
WHERE tenant_id = $1
  AND resolved_at IS NULL AND ignored_at IS NULL
ORDER BY
    CASE level WHEN 'CRITICAL' THEN 0 ELSE 1 END,
    created_at DESC;

-- name: CountOpenAlerts :one
SELECT COUNT(*) FROM alert_events
WHERE tenant_id = $1
  AND resolved_at IS NULL AND ignored_at IS NULL;

-- name: CreateAlert :exec
INSERT INTO alert_events (id, tenant_id, level, type, campaign_id, campaign_name, message, details)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: ResolveAlert :exec
UPDATE alert_events SET resolved_at = NOW() WHERE id = $1;

-- name: IgnoreAlert :exec
UPDATE alert_events SET ignored_at = NOW() WHERE id = $1;

-- name: ListAlertHistory :many
SELECT * FROM alert_events
WHERE tenant_id = $1
ORDER BY created_at DESC
LIMIT $2;
```

### internal/repository/queries/integrations.sql

```sql
-- name: ListIntegrations :many
SELECT i.*,
       array_agg(it.tenant_id) FILTER (WHERE it.tenant_id IS NOT NULL) AS tenant_ids
FROM integrations i
LEFT JOIN integration_tenants it ON it.integration_id = i.id
GROUP BY i.id
ORDER BY i.name;

-- name: GetIntegrationByID :one
SELECT * FROM integrations WHERE id = $1 LIMIT 1;

-- name: GetIntegrationForTenant :one
SELECT i.* FROM integrations i
JOIN integration_tenants it ON it.integration_id = i.id
WHERE it.tenant_id = $1 AND i.provider = $2
  AND i.status = 'connected'
LIMIT 1;

-- name: CreateIntegration :exec
INSERT INTO integrations (id, name, provider, "group", oauth_client_id, oauth_client_secret,
    developer_token, login_customer_id, status)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: UpdateIntegration :exec
UPDATE integrations
SET name = $2, oauth_client_id = $3, oauth_client_secret = $4,
    developer_token = $5, login_customer_id = $6, refresh_token = $7,
    status = $8, error_message = $9, updated_at = NOW()
WHERE id = $1;

-- name: DeleteIntegration :exec
DELETE FROM integrations WHERE id = $1;

-- name: SetIntegrationTenants :exec
-- Step 1: delete existing
DELETE FROM integration_tenants WHERE integration_id = $1;
-- Step 2: insert new (caller must call this once per tenant_id)
-- Use a separate InsertIntegrationTenant query for the inserts.

-- name: InsertIntegrationTenant :exec
INSERT INTO integration_tenants (integration_id, tenant_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;
```

After writing all SQL files, regenerate SQLC:
```bash
cd /home/rafhael/www/html/marketing/api
go run github.com/sqlc-dev/sqlc/cmd/sqlc@latest generate
```

---

## Step 3 — Domain structs

### internal/domain/tenant.go

```go
package domain

import (
	"encoding/json"
	"time"
)

type AdsMonitoringConfig struct {
	TargetCPABRL              float64 `json:"target_cpa_brl"`
	NoConversionAlertDays     int     `json:"no_conversion_alert_days"`
	MaxCPAMultiplier          float64 `json:"max_cpa_multiplier"`
	MinDailyImpressions       int     `json:"min_daily_impressions"`
	BudgetUnderpaceThreshold  float64 `json:"budget_underpace_threshold"`
}

type Tenant struct {
	ID             string
	Name           string
	Language       string
	Niche          *string
	Location       *string
	PrimaryPersona *string
	Tone           *string
	Instructions   *string
	Hashtags       []string
	GoogleAdsID    *string
	AdsMonitoring  *AdsMonitoringConfig
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (t *Tenant) HashtagsJSON() ([]byte, error)        { return json.Marshal(t.Hashtags) }
func (t *Tenant) AdsMonitoringJSON() ([]byte, error)   { return json.Marshal(t.AdsMonitoring) }
```

### internal/domain/post.go

```go
package domain

import "time"

type PostStatus string
const (
	PostStatusDraft     PostStatus = "draft"
	PostStatusApproved  PostStatus = "approved"
	PostStatusScheduled PostStatus = "scheduled"
	PostStatusPublished PostStatus = "published"
)

// ValidTransitions defines allowed status changes.
// Key = current status, Value = allowed next statuses.
var ValidTransitions = map[PostStatus][]PostStatus{
	PostStatusDraft:     {PostStatusApproved},
	PostStatusApproved:  {PostStatusDraft, PostStatusScheduled, PostStatusPublished},
	PostStatusScheduled: {PostStatusApproved, PostStatusPublished},
	PostStatusPublished: {},
}

func (s PostStatus) CanTransitionTo(next PostStatus) bool {
	for _, allowed := range ValidTransitions[s] {
		if allowed == next {
			return true
		}
	}
	return false
}

type PostWorkflow struct {
	Strategy *struct { Framework string `json:"framework"`; Reasoning string `json:"reasoning"` } `json:"strategy,omitempty"`
	Clarity  *struct { Changes string `json:"changes"` } `json:"clarity,omitempty"`
	Impact   *struct { Changes string `json:"changes"` } `json:"impact,omitempty"`
}

type Post struct {
	ID            string
	TenantID      string
	Status        PostStatus
	Title         *string
	Content       string
	Hashtags      []string
	MediaType     *string
	Workflow      *PostWorkflow
	MediaPath     *string
	Platforms     []string
	ScheduledDate *string
	ScheduledTime *string
	PublishedAt   *time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
```

### internal/domain/report.go

```go
package domain

import "time"

type ReportType string
const (
	ReportTypeAudit   ReportType = "audit"
	ReportTypeSearch  ReportType = "search"
	ReportTypeWeekly  ReportType = "weekly"
	ReportTypeMonthly ReportType = "monthly"
	ReportTypeAlert   ReportType = "alert"
	ReportTypeReport  ReportType = "report"
)

// DetectReportType infers the report type from its slug.
func DetectReportType(slug string) ReportType {
	switch {
	case contains(slug, "audit"):
		return ReportTypeAudit
	case contains(slug, "search") || contains(slug, "campaign"):
		return ReportTypeSearch
	case contains(slug, "weekly"):
		return ReportTypeWeekly
	case contains(slug, "monthly") || matchesYYYYMM(slug):
		return ReportTypeMonthly
	case contains(slug, "alert"):
		return ReportTypeAlert
	default:
		return ReportTypeReport
	}
}

type Report struct {
	ID        string
	TenantID  string
	Slug      string
	Type      ReportType
	Title     *string
	Content   string
	CreatedAt time.Time
}
```

### internal/domain/integration.go

```go
package domain

import "time"

type IntegrationProvider string
const (
	ProviderGoogleAds IntegrationProvider = "google_ads"
	ProviderMeta      IntegrationProvider = "meta"
	ProviderR2        IntegrationProvider = "r2"
	ProviderS3        IntegrationProvider = "s3"
	ProviderClaude    IntegrationProvider = "claude"
	ProviderOpenAI    IntegrationProvider = "openai"
	ProviderGroq      IntegrationProvider = "groq"
	ProviderGemini    IntegrationProvider = "gemini"
	ProviderBrevo     IntegrationProvider = "brevo"
	ProviderSendible  IntegrationProvider = "sendible"
	ProviderSentry    IntegrationProvider = "sentry"
)

type IntegrationGroup string
const (
	GroupAds         IntegrationGroup = "ads"
	GroupSocialMedia IntegrationGroup = "social_media"
	GroupMedia       IntegrationGroup = "media"
	GroupLLM         IntegrationGroup = "llm"
	GroupEmail       IntegrationGroup = "email"
	GroupMonitoring  IntegrationGroup = "monitoring"
)

type IntegrationStatus string
const (
	StatusPending   IntegrationStatus = "pending"
	StatusConnected IntegrationStatus = "connected"
	StatusError     IntegrationStatus = "error"
)

type Integration struct {
	ID                string
	Name              string
	Provider          IntegrationProvider
	Group             IntegrationGroup
	OAuthClientID     *string
	OAuthClientSecret *string
	DeveloperToken    *string
	LoginCustomerID   *string
	RefreshToken      *string
	Status            IntegrationStatus
	ErrorMessage      *string
	TenantIDs         []string  // populated by ListIntegrations join
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// GoogleAdsCredentials extracts typed credentials for the Google Ads connector.
func (i *Integration) GoogleAdsCredentials() *GoogleAdsCreds {
	if i.Provider != ProviderGoogleAds || i.Status != StatusConnected {
		return nil
	}
	if i.OAuthClientID == nil || i.OAuthClientSecret == nil ||
		i.DeveloperToken == nil || i.RefreshToken == nil {
		return nil
	}
	return &GoogleAdsCreds{
		ClientID:        *i.OAuthClientID,
		ClientSecret:    *i.OAuthClientSecret,
		DeveloperToken:  *i.DeveloperToken,
		LoginCustomerID: strDeref(i.LoginCustomerID),
		RefreshToken:    *i.RefreshToken,
	}
}

type GoogleAdsCreds struct {
	ClientID        string
	ClientSecret    string
	DeveloperToken  string
	LoginCustomerID string
	RefreshToken    string
}

func strDeref(s *string) string {
	if s == nil { return "" }
	return *s
}
```

---

## Step 4 — Repository implementations

Create one repository file per domain entity. Each follows the same pattern:

```go
type TenantRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewTenantRepository(pool *pgxpool.Pool) *TenantRepository { ... }

// Methods mirror the SQLC query names:
func (r *TenantRepository) List(ctx) ([]*domain.Tenant, error)
func (r *TenantRepository) GetByID(ctx, id string) (*domain.Tenant, error)
func (r *TenantRepository) Create(ctx, t *domain.Tenant) error
func (r *TenantRepository) Update(ctx, t *domain.Tenant) error
func (r *TenantRepository) Delete(ctx, id string) error
```

Create these files:
- `internal/repository/tenant.go`
- `internal/repository/post.go`
- `internal/repository/report.go`
- `internal/repository/campaign.go`
- `internal/repository/metrics.go`
- `internal/repository/alert.go`
- `internal/repository/integration.go`

**JSON column handling pattern** (same in every repo that has JSONB):
```go
// Reading JSONB into a Go slice:
var hashtags []string
if err := json.Unmarshal(row.Hashtags, &hashtags); err != nil {
    hashtags = []string{}
}

// Writing Go slice to JSONB:
hashtagsJSON, err := json.Marshal(t.Hashtags)
if err != nil { return err }
// pass hashtagsJSON as the param
```

---

## Step 5 — One-time SQLite → PostgreSQL migration script

Create `scripts/migrate-to-postgres.ts` at the project root.
This is a Bun script — it reads the existing SQLite and inserts into PostgreSQL.

```typescript
// scripts/migrate-to-postgres.ts
// Usage: bun run scripts/migrate-to-postgres.ts
// Requires: DATABASE_URL env var pointing to the target PostgreSQL instance.
//
// This script is idempotent: uses INSERT ... ON CONFLICT DO NOTHING for all tables.
// Safe to run multiple times during development.

import { Database } from 'bun:sqlite'
import { Client } from 'pg'  // bun add pg @types/pg
import path from 'node:path'

const sqlite = new Database(path.resolve('./db/marketing.db'))
const pg = new Client({ connectionString: process.env.DATABASE_URL })
await pg.connect()

console.log('Starting migration: SQLite → PostgreSQL')

// --- tenants ---
const tenants = sqlite.query('SELECT * FROM tenants').all() as any[]
for (const t of tenants) {
  await pg.query(
    `INSERT INTO tenants (id, name, language, niche, location, primary_persona, tone,
      instructions, hashtags, google_ads_id, ads_monitoring, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO NOTHING`,
    [t.id, t.name, t.language, t.niche, t.location, t.primary_persona, t.tone,
     t.instructions, t.hashtags ?? '[]', t.google_ads_id, t.ads_monitoring,
     t.created_at, t.updated_at]
  )
}
console.log(`  tenants: ${tenants.length} rows`)

// --- integrations ---
const integrations = sqlite.query('SELECT * FROM integrations').all() as any[]
for (const i of integrations) {
  await pg.query(
    `INSERT INTO integrations (id, name, provider, "group", oauth_client_id, oauth_client_secret,
      developer_token, login_customer_id, refresh_token, status, error_message, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO NOTHING`,
    [i.id, i.name, i.provider, i.group ?? 'ads', i.oauth_client_id, i.oauth_client_secret,
     i.developer_token, i.login_customer_id, i.refresh_token, i.status,
     i.error_message, i.created_at, i.updated_at]
  )
}
console.log(`  integrations: ${integrations.length} rows`)

// --- integration_clients → integration_tenants ---
const ic = sqlite.query('SELECT * FROM integration_clients').all() as any[]
for (const row of ic) {
  await pg.query(
    `INSERT INTO integration_tenants (integration_id, tenant_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [row.integration_id, row.tenant_id]
  )
}
console.log(`  integration_tenants: ${ic.length} rows`)

// --- posts ---
const posts = sqlite.query('SELECT * FROM posts').all() as any[]
for (const p of posts) {
  await pg.query(
    `INSERT INTO posts (id, tenant_id, status, title, content, hashtags, media_type,
      workflow, media_path, platforms, scheduled_date, scheduled_time, published_at,
      created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (id) DO NOTHING`,
    [p.id, p.tenant_id, p.status, p.title, p.content, p.hashtags ?? '[]',
     p.media_type, p.workflow, p.media_path, p.platforms ?? '[]',
     p.scheduled_date, p.scheduled_time, p.published_at, p.created_at, p.updated_at]
  )
}
console.log(`  posts: ${posts.length} rows`)

// --- reports ---
const reports = sqlite.query('SELECT * FROM reports').all() as any[]
for (const r of reports) {
  await pg.query(
    `INSERT INTO reports (id, tenant_id, slug, type, title, content, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id, slug) DO NOTHING`,
    [r.id, r.tenant_id, r.slug, r.type, r.title, r.content, r.created_at]
  )
}
console.log(`  reports: ${reports.length} rows`)

// --- campaigns ---
const campaigns = sqlite.query('SELECT * FROM campaigns').all() as any[]
for (const c of campaigns) {
  await pg.query(
    `INSERT INTO campaigns (id, tenant_id, slug, data, deployed_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id, slug) DO NOTHING`,
    [c.id, c.tenant_id, c.slug, c.data ?? '{}', c.deployed_at, c.created_at, c.updated_at]
  )
}
console.log(`  campaigns: ${campaigns.length} rows`)

// --- daily_metrics ---
const metrics = sqlite.query('SELECT * FROM daily_metrics').all() as any[]
for (const m of metrics) {
  await pg.query(
    `INSERT INTO daily_metrics (id, tenant_id, date, campaign_id, campaign_name,
      impressions, clicks, cost_brl, conversions, cpa_brl, ctr, search_impression_share, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (tenant_id, date, campaign_id) DO NOTHING`,
    [m.id, m.tenant_id, m.date, m.campaign_id, m.campaign_name,
     m.impressions, m.clicks, m.cost_brl, m.conversions, m.cpa_brl,
     m.ctr, m.search_impression_share, m.created_at]
  )
}
console.log(`  daily_metrics: ${metrics.length} rows`)

// --- monthly_summary ---
const monthly = sqlite.query('SELECT * FROM monthly_summary').all() as any[]
for (const m of monthly) {
  await pg.query(
    `INSERT INTO monthly_summary (id, tenant_id, month, campaign_id, campaign_name,
      impressions, clicks, cost_brl, conversions, avg_cpa_brl, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (tenant_id, month, campaign_id) DO NOTHING`,
    [m.id, m.tenant_id, m.month, m.campaign_id, m.campaign_name,
     m.impressions, m.clicks, m.cost_brl, m.conversions, m.avg_cpa_brl, m.created_at]
  )
}
console.log(`  monthly_summary: ${monthly.length} rows`)

// --- alert_events ---
const alerts = sqlite.query('SELECT * FROM alert_events').all() as any[]
for (const a of alerts) {
  await pg.query(
    `INSERT INTO alert_events (id, tenant_id, level, type, campaign_id, campaign_name,
      message, details, resolved_at, ignored_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING`,
    [a.id, a.tenant_id, a.level, a.type, a.campaign_id, a.campaign_name,
     a.message, a.details, a.resolved_at, a.ignored_at, a.created_at]
  )
}
console.log(`  alert_events: ${alerts.length} rows`)

await pg.end()
sqlite.close()
console.log('Migration complete.')
```

Run it:
```bash
DATABASE_URL="postgres://maestro:maestro@localhost:5432/rush_maestro" \
  bun run scripts/migrate-to-postgres.ts
```

---

## Step 6 — Verification

```bash
# Count rows in PostgreSQL and compare to SQLite
psql $DATABASE_URL -c "
SELECT 'tenants' as tbl, count(*) FROM tenants
UNION ALL SELECT 'posts', count(*) FROM posts
UNION ALL SELECT 'reports', count(*) FROM reports
UNION ALL SELECT 'campaigns', count(*) FROM campaigns
UNION ALL SELECT 'daily_metrics', count(*) FROM daily_metrics
UNION ALL SELECT 'alert_events', count(*) FROM alert_events
UNION ALL SELECT 'integrations', count(*) FROM integrations;
"
```

Compare to SQLite:
```bash
sqlite3 db/marketing.db "
SELECT 'tenants', count(*) FROM tenants;
SELECT 'posts', count(*) FROM posts;
SELECT 'reports', count(*) FROM reports;
SELECT 'campaigns', count(*) FROM campaigns;
SELECT 'daily_metrics', count(*) FROM daily_metrics;
SELECT 'alert_events', count(*) FROM alert_events;
SELECT 'integrations', count(*) FROM integrations;
"
```

Counts must match.

Spot-check: verify a known tenant and one of its posts came through correctly:
```bash
psql $DATABASE_URL -c "SELECT id, name, google_ads_id FROM tenants;"
psql $DATABASE_URL -c "SELECT id, status, title FROM posts WHERE tenant_id = 'portico' LIMIT 5;"
psql $DATABASE_URL -c "SELECT id, status, refresh_token IS NOT NULL as has_token FROM integrations;"
```

---

## What NOT to do in this task

- Do not modify the existing SQLite database or any TypeScript files
- Do not switch the SvelteKit app to use PostgreSQL yet (that's T14)
- Do not delete `db/marketing.db` — keep it as source of truth until T14 is complete
- Do not add FK constraint from `user_tenant_roles.tenant_id` to `tenants.id` yet —
  the RBAC migration (T12) runs before the tenants migration, and Goose runs migrations
  in numeric order. Add this FK in a dedicated migration `000014_add_fk_user_tenant_roles.sql`
  after both T12 and T13 are complete.
- Do not implement the `bun add pg` requirement in any production code — this is a
  one-time migration script that runs locally and is deleted after use.

---

## Completion criteria

- [x] `go run ./cmd/migrate up` applies all 9 new migrations without error
- [x] `go run ./cmd/migrate status` shows all migrations as Applied
- [x] `go build ./...` passes with zero errors
- [x] `go vet ./...` passes
- [x] Migration script runs successfully: `bun run scripts/migrate-to-postgres.ts`
- [x] Row counts in PostgreSQL match SQLite for all tables
- [x] Spot-check: `portico` tenant exists in PostgreSQL with correct `google_ads_id`
- [x] Spot-check: at least one `connected` integration exists with non-null `refresh_token`
- [x] Migration script deleted after verification: `rm scripts/migrate-to-postgres.ts`

---

## References

- Existing SQLite schema: `/home/rafhael/www/html/marketing/db/migrations/`
- Existing TypeScript domain types: `/home/rafhael/www/html/marketing/src/lib/server/`
- rush-cms-v2 repository pattern: `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/internal/repository/`
- rush-cms-v2 SQLC config: `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/sqlc.yaml`
- Roadmap: `/home/rafhael/www/html/marketing/.project/tasks/README.md`
- Previous task: T11 — Go Foundation
- Parallel task: T12 — Auth + First-Run
- Next task: T14 — REST API Core + SvelteKit SPA
