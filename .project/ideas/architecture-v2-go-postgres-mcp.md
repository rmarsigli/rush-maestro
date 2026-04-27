# Architecture V2 — Go + PostgreSQL + Public MCP + Multi-Connector

Natural evolution of the current project (SvelteKit + SQLite + local MCP) into a multi-tenant platform with a robust backend, extensible integrations, and AI via UI.

---

## Overview

```
┌─────────────────────────────────────────────────────┐
│  SvelteKit UI (pure SPA)                            │
│  fetch() → Go API  |  SSE for AI streaming          │
└──────────────┬──────────────────────────────────────┘
               │ REST / JSON
┌──────────────▼──────────────────────────────────────┐
│  Go API  (chi/fiber)                                │
│  ├── /api/*         — CRUD, uploads, deploys        │
│  ├── /mcp           — MCP Streamable HTTP (public)  │
│  ├── /ai/*          — multi-provider proxy          │
│  └── workers        — metrics collection, sync, backup │
└──────────────┬──────────────────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
  PostgreSQL        R2 / S3
  (content +        (images,
   metrics)          backups)
               │
┌──────────────▼──────────────────────────────────────┐
│  Python service  (optional, localhost:8001)          │
│  RAG · embeddings · advanced orchestrations         │
└─────────────────────────────────────────────────────┘
```

---

## Stack

| Layer | Technology | Rationale |
|---|---|---|
| Build | Make | Orchestrates all services with simple targets |
| UI | SvelteKit (SPA) | Keeps what exists, removes SSR, becomes pure SPA |
| API | Go (chi or fiber) | Performance, single binary, great for workers |
| DB | PostgreSQL | JSONB, full-text search, pg_cron, pgvector |
| Object storage | Cloudflare R2 | Zero egress, S3-compatible API |
| AI | Groq / OpenAI / Claude / Gemini | Multi-provider via single interface |
| RAG | Python (FastAPI + pgvector) | Unmatched ecosystem for embeddings |
| MCP | Go (public HTTP endpoint) | Serves IDE, terminal, and cloud agents |

---

## Makefile — main targets

```makefile
make dev        # start all services (Go API + SvelteKit + Python)
make build      # production build
make migrate    # run Postgres migrations
make seed       # initial seed
make test       # test Go + UI
make deploy     # build + push Docker images
```

---

## Go API — internal structure

```
api/
  cmd/server/main.go
  internal/
    handler/        — HTTP handlers per domain
    service/        — business logic
    connector/      — external integrations
      googleads/
      meta/
      canva/
      linkedin/
    ai/             — multi-provider abstraction
    mcp/            — MCP server
    worker/         — background jobs
    storage/        — R2/S3 abstraction
  db/
    migrations/     — versioned SQL (golang-migrate)
    queries/        — sqlc or pgx directly
```

### Connector Interface

```go
type Connector interface {
    Name() string
    Publish(ctx context.Context, post Post) error
    GetMetrics(ctx context.Context, params MetricParams) (Metrics, error)
}
```

Each tenant configures which connectors to activate. Google Ads, Meta, Canva Export, LinkedIn, TikTok implement this interface.

### AI Provider Interface

```go
type AIProvider interface {
    Complete(ctx context.Context, prompt string, opts Options) (string, error)
    Stream(ctx context.Context, prompt string, opts Options) (<-chan string, error)
}
```

| Provider | Ideal use |
|---|---|
| Groq (Llama 4) | Fast drafts, short responses |
| Claude | Reports, quality review, analysis |
| Gemini | Multimodal (post image analysis) |
| OpenAI | Embeddings for RAG |

Tenant chooses default provider per task type.

---

## PostgreSQL — main schema

Same structure as the current SQLite, plus:

```sql
-- Full-text search support for posts and reports
ALTER TABLE posts ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title,'') || ' ' || content)
  ) STORED;

-- JSONB for workflow and ads data with efficient querying
-- workflow->>'strategy' works directly

-- pgvector for embeddings (RAG)
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE reports ADD COLUMN embedding vector(1536);
```

---

## Public MCP

The `/mcp` endpoint moves from SvelteKit to the Go API. With that:

- **Auth:** API key per tenant (`Bearer sk-tenant-xxx`) in the header
- **Multi-device:** local Claude Code, remote IDE, cloud agent — all point to the same URL
- **URL:** `https://mcp.yourtool.com/[tenant]?key=xxx` or `http://localhost:8080/mcp` for local dev

`.mcp.json` continues to work, only the URL changes:
```json
{
  "mcpServers": {
    "marketing": {
      "type": "http",
      "url": "http://localhost:8080/mcp",
      "headers": { "Authorization": "Bearer sk-dev-xxx" }
    }
  }
}
```

The T09 tools (list_tenants, create_post, etc.) migrate 1:1 to Go MCP.

---

## R2 / S3

```
Bucket: marketing-media
  [tenant]/posts/[filename]     — post images
  [tenant]/campaigns/[filename] — campaign assets

Bucket: marketing-backups
  [YYYY-MM-DD]/postgres.dump.gz — automatic daily backup (Go worker)
```

The backup worker runs via `pg_dump | gzip | upload_to_r2` scheduled with `time.AfterFunc` or Go's internal cron.

---

## Python (optional — only when needed)

Lightweight FastAPI service, called via HTTP by Go:

```
ml/
  main.py
  routes/
    rag.py        — semantic search on reports and posts
    embed.py      — generate embeddings (OpenAI text-embedding-3-small)
  requirements.txt
```

Concrete use cases:
- "Show reports similar to this one" (embedding search on reports)
- "Which campaigns worked for this type of product?" (history + semantic query)
- Complex multi-step orchestrations (LangGraph, CrewAI) if needed

**When to add:** only when the volume of reports/posts justifies semantic search (>200 reports or >1000 posts). Before that, full-text search in Postgres is sufficient.

---

## Canva

The Canva API allows programmatic design creation from templates. Use case: the agent generates post copy → Canva API fills in the visual template → returns the generated asset URL. Still limited in real automation (2025), but worth monitoring. Implement only when the API matures.

---

## Repository structure

```
/
  Makefile
  docker-compose.yml    — local dev (Postgres, MinIO for R2 mock)
  .mcp.json
  api/                  — Go
  ui/                   — SvelteKit
  ml/                   — Python (optional)
  db/
    migrations/         — SQL (golang-migrate)
  infra/
    Dockerfile.api
    Dockerfile.ui
    terraform/          — prod infra (optional)
```

---

## Migrating from the current project

1. Keep SvelteKit UI intact — just remove `+page.server.ts` and migrate to `fetch()`
2. Go API replicates the endpoints that exist in `src/routes/api/`
3. Postgres schema = current SQLite + extensions (tsvector, vector, JSONB)
4. MCP tools T09 migrate 1:1 to Go
5. Scripts (`collect-daily-metrics`, `deploy-google-ads`) become Go workers
6. Python: add when there is a concrete use case

---

## What NOT to do prematurely

- Public multi-tenancy (full auth/RBAC) — only if it becomes a SaaS
- Canva API — wait for maturity
- Python/RAG — only after content volume justifies it
- Kubernetes — Docker Compose handles solo/small team product scale
