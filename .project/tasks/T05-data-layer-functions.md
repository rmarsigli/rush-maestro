# T05 — Implement core TypeScript data layer functions

**Phase:** 2 — Data Layer  
**Status:** pending  
**ADR:** ADR-001  
**Depends on:** T03  
**Blocks:** T06, T07, T08, T09 (UI routes), T10 (MCP tools)

---

## Goal

Create the TypeScript functions in `src/lib/server/` that the UI routes and MCP tools will both call. These replace all direct `fs.readFile`/`fs.readdir` calls and the ad-hoc flat-file logic scattered across `+page.server.ts` files.

No route or MCP tool should ever query SQLite directly — they call these functions.

---

## Files to create

### `src/lib/server/tenants.ts`

```typescript
export interface Tenant {
  id: string
  name: string
  language: string
  niche: string | null
  location: string | null
  primary_persona: string | null
  tone: string | null
  instructions: string | null
  hashtags: string[]
  google_ads_id: string | null
  ads_monitoring: AdsMonitoringConfig | null
  created_at: string
  updated_at: string
}

export interface AdsMonitoringConfig {
  target_cpa_brl: number
  no_conversion_alert_days: number
  max_cpa_multiplier: number
  min_daily_impressions: number
  budget_underpace_threshold: number
}

export function listTenants(): Tenant[]
export function getTenant(id: string): Tenant | null
export function createTenant(data: Omit<Tenant, 'created_at' | 'updated_at'>): void
export function updateTenant(id: string, data: Partial<Omit<Tenant, 'id' | 'created_at'>>): void
export function deleteTenant(id: string): void
```

JSON columns (`hashtags`, `ads_monitoring`) must be parsed on read and stringified on write. Handle `null` gracefully — `hashtags` defaults to `[]`.

---

### `src/lib/server/posts.ts`

```typescript
export type PostStatus = 'draft' | 'approved' | 'published'
export type MediaType = 'carousel' | 'image' | 'video' | 'reel'

export interface Post {
  id: string
  tenant_id: string
  status: PostStatus
  title: string | null
  content: string
  hashtags: string[]
  media_type: MediaType | null
  workflow: PostWorkflow | null
  media_path: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface PostWorkflow {
  strategy?: { framework: string; reasoning: string }
  clarity?: { changes: string }
  impact?: { changes: string }
}

export function listPosts(tenantId: string, status?: PostStatus): Post[]
export function getPost(id: string): Post | null
export function createPost(data: Omit<Post, 'created_at' | 'updated_at'>): void
export function updatePost(id: string, data: Partial<Omit<Post, 'id' | 'tenant_id' | 'created_at'>>): void
export function updatePostStatus(id: string, status: PostStatus, publishedAt?: string): void
export function deletePost(id: string): void
```

---

### `src/lib/server/reports.ts`

```typescript
export type ReportType = 'audit' | 'search' | 'weekly' | 'monthly' | 'alert' | 'report'

export interface Report {
  id: string
  tenant_id: string
  slug: string
  type: ReportType
  title: string | null
  content: string
  created_at: string
}

export function listReports(tenantId: string): Report[]
export function getReport(tenantId: string, slug: string): Report | null
export function createReport(data: Omit<Report, 'id' | 'created_at'> & { id?: string }): void
export function deleteReport(id: string): void

export function detectReportType(slug: string): ReportType  // shared util
```

The `detectReportType` function centralizes the slug → type logic that is currently duplicated in the UI route.

---

### `src/lib/server/campaigns.ts`

```typescript
export interface Campaign {
  id: string
  tenant_id: string
  slug: string
  data: Record<string, unknown>  // parsed JSON
  deployed_at: string | null
  created_at: string
  updated_at: string
}

export function listCampaigns(tenantId: string): Campaign[]
export function getCampaign(tenantId: string, slug: string): Campaign | null
export function upsertCampaign(tenantId: string, slug: string, data: Record<string, unknown>): void
export function markDeployed(id: string): void
export function deleteCampaign(id: string): void
```

---

## Implementation notes

- All functions are synchronous (SQLite is synchronous in Bun)
- JSON columns: always `JSON.parse` on read, `JSON.stringify` on write
- `updated_at`: set to `datetime('now')` on every write via SQL, not in TypeScript
- No `any` types — use `unknown` and narrow where needed
- Export types from each file so routes and MCP tools import types from the same source

---

## Verify

Write a quick test script (delete after):
```bash
bun run -e "
import { listTenants, getTenant } from './src/lib/server/tenants.ts'
console.log(listTenants())
console.log(getTenant('portico'))
"
```
