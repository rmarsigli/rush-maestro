# T07 — Migrate all UI routes from flat-files to SQLite functions

**Phase:** 3 — UI Migration  
**Status:** pending  
**ADR:** ADR-001  
**Depends on:** T05, T06  
**Blocks:** T13 (flat-file cleanup)

---

## Goal

Replace all `fs.readFile`/`fs.readdir` flat-file reads in SvelteKit routes with calls to the data layer functions from T05. After this task, the UI reads only from SQLite.

---

## Routes to update

Work through these in order (least risky to most):

### 1. `/` root page — tenant list
**File:** `src/routes/+page.server.ts`  
**Was:** reads `clients/` directory with `fs.readdir`, loads each `brand.json`  
**Now:** calls `listTenants()` from `src/lib/server/tenants.ts`

---

### 2. `/[tenant]` layout — tenant context
**File:** `src/routes/[tenant]/+layout.server.ts`  
**Was:** reads `clients/[tenant]/brand.json`  
**Now:** calls `getTenant(params.tenant)`, throws 404 if null

---

### 3. `/[tenant]/social` — post list
**File:** `src/routes/[tenant]/social/+page.server.ts`  
**Was:** reads `clients/[tenant]/posts/*.json`, parses each  
**Now:** calls `listPosts(params.tenant)` — returns all statuses, sorted by `created_at DESC`

---

### 4. `/[tenant]/social/[filename]` — individual post
**File:** `src/routes/[tenant]/social/[filename]/+page.server.ts`  
**Was:** reads `clients/[tenant]/posts/[filename].json`  
**Now:** calls `getPost(params.filename)`, throws 404 if null

---

### 5. `/[tenant]/social/drafts` — draft list
**File:** `src/routes/[tenant]/social/drafts/+page.server.ts`  
**Was:** filters posts by `status === 'draft'` from filesystem  
**Now:** calls `listPosts(params.tenant, 'draft')`

---

### 6. `/[tenant]/reports` — report list
**File:** `src/routes/[tenant]/reports/+page.server.ts`  
**Was:** reads `clients/[tenant]/reports/*.md`, extracts metadata from filename  
**Now:** calls `listReports(params.tenant)` — `type` already stored in DB

---

### 7. `/[tenant]/reports/[slug]` — individual report
**File:** `src/routes/[tenant]/reports/[slug]/+page.server.ts`  
**Was:** reads `clients/[tenant]/reports/[slug].md`  
**Now:** calls `getReport(params.tenant, params.slug)`, throws 404 if null  
The report `type` → badge color mapping moves to the Svelte component (or stays in the route as a pure function of `report.type`).

---

### 8. `/[tenant]/ads/google` — campaign list
**File:** `src/routes/[tenant]/ads/google/+page.server.ts`  
**Was:** reads `clients/[tenant]/ads/google/*.json`  
**Now:** calls `listCampaigns(params.tenant)`

---

### 9. `/[tenant]/ads/google/[filename]` — individual campaign
**File:** `src/routes/[tenant]/ads/google/[filename]/+page.server.ts`  
**Was:** reads `clients/[tenant]/ads/google/[filename].json`  
**Now:** calls `getCampaign(params.tenant, params.filename)`, throws 404 if null

---

### 10. `/[tenant]/settings/general`
**File:** `src/routes/[tenant]/settings/general/+page.server.ts`  
**Was:** reads/writes `clients/[tenant]/brand.json`  
**Now:** `load` calls `getTenant`, `actions` call `updateTenant`

---

### API routes

| Route | Change |
|---|---|
| `api/posts/[client_id]/[filename]/status` | Call `updatePostStatus` instead of writing JSON file |
| `api/posts/[client_id]/import` | Call `createPost` instead of writing to filesystem |
| `api/ads/google/[client_id]/[filename]/deploy` | Call `markDeployed` instead of updating file |
| `api/ads/google/[client_id]/import` | Call `upsertCampaign` instead of writing file |
| `api/ads/google/[client_id]/live/[campaign_id]/export` | Call `upsertCampaign` for the imported live data |

---

## Strategy per file

For each file:
1. Remove `import { readFile, readdir, writeFile } from 'node:fs/promises'`
2. Add import from `@/lib/server/{tenants,posts,reports,campaigns}`
3. Replace fs operation with function call
4. Keep the same return shape so Svelte components need zero changes
5. Test the route in the browser before moving to the next

---

## Type compatibility

The existing UI types in `src/lib/server/db.ts` (e.g., `Post`, `Brand`, `GoogleAdCampaign`) may conflict or overlap with the new types from T05. Reconcile: the T05 types are authoritative. Remove or alias the old types, update component props where needed.

---

## Verify after each route

After updating each route, navigate to it in the browser and confirm:
- Data loads correctly
- All existing functionality (status changes, approve/reject, etc.) still works
- No TypeScript errors (`bun run check`)
