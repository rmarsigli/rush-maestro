# T14 — REST API Core + SvelteKit SPA Migration

**Status:** completed — moved to `completed/T14-rest-api-core-sveltekit-spa.md`  
**Phase:** 3 — API REST Core  
**Estimate:** 10–12 hours  
**Depends on:** T11, T12, T13  
**Unlocks:** T15 (Integrations Hub), T20 (Workflow RBAC)

---

## Context

This task has two parallel tracks that ship together:

**Track A — Go handlers:** implement the REST endpoints for every existing
SvelteKit server-side route (`+page.server.ts` and `+server.ts` files).

**Track B — SvelteKit SPA:** convert the SvelteKit app from SSR mode to a
pure static SPA. Remove all `+page.server.ts` files and replace DB calls with
`fetch()` to the Go API. Switch to `adapter-static`.

When both tracks are done, the Go API is the only backend. The SvelteKit app
becomes a static bundle served by Go as embedded files.

Do NOT attempt to migrate all pages at once. Work route-by-route: implement the
Go endpoint, convert the SvelteKit page, verify in the browser, then move on.

---

## Track A — Go handlers

### Handler files to create

```
api/internal/api/
  admin_tenants.go
  admin_posts.go
  admin_reports.go
  admin_campaigns.go
  admin_alerts.go
```

All handlers follow the same constructor pattern:

```go
type AdminTenantsHandler struct {
    repo *repository.TenantRepository
}

func NewAdminTenantsHandler(repo *repository.TenantRepository) *AdminTenantsHandler {
    return &AdminTenantsHandler{repo: repo}
}
```

All endpoints require a valid JWT (`AuthenticateAdmin` middleware applied at the
`/admin` router level in `main.go`). Tenant-scoped endpoints require the tenant ID
from the JWT claims or from a URL param — if using a URL param, validate that the
requesting user has access to that tenant via `UserClaims.TenantID`.

---

### admin_tenants.go

```
GET    /admin/tenants           — list all tenants the requesting user has access to
POST   /admin/tenants           — create tenant (requires create:tenant)
GET    /admin/tenants/{id}      — get tenant (requires view:tenant)
PUT    /admin/tenants/{id}      — update tenant (requires update:tenant)
DELETE /admin/tenants/{id}      — delete tenant (requires delete:tenant)
```

**List:** if user has `view-any:tenant`, return all tenants. Otherwise return only
the tenants in `UserClaims` permissions scope (from `user_tenant_roles`).

**Create:** after inserting the tenant, auto-assign the creating user to that tenant
with the `owner` role. Call `rbacRepo.AssignRole(userID, newTenantID, "role_owner")`.

**Response shape (GET /admin/tenants/:id):**
```json
{
  "id": "portico",
  "name": "Grupo Pórtico",
  "language": "pt_BR",
  "niche": "local",
  "location": "Porto Alegre, RS",
  "primary_persona": "...",
  "tone": "...",
  "instructions": "...",
  "hashtags": ["#Portico", "#GrupoPortico"],
  "google_ads_id": "795-509-5597",
  "ads_monitoring": {
    "target_cpa_brl": 150,
    "no_conversion_alert_days": 3,
    "max_cpa_multiplier": 2,
    "min_daily_impressions": 30,
    "budget_underpace_threshold": 0.4
  },
  "created_at": "2026-04-24T16:39:35Z",
  "updated_at": "2026-04-24T16:39:35Z"
}
```

---

### admin_posts.go

```
GET    /admin/tenants/{tenantId}/posts            — list posts (optional ?status= filter)
POST   /admin/tenants/{tenantId}/posts            — create post (requires create:post)
GET    /admin/tenants/{tenantId}/posts/{id}       — get post (requires view:post)
PUT    /admin/tenants/{tenantId}/posts/{id}       — update post content (requires create:post)
PATCH  /admin/tenants/{tenantId}/posts/{id}/status — transition status (permission varies)
DELETE /admin/tenants/{tenantId}/posts/{id}       — delete post (requires delete:post)
```

**Status transition (PATCH /status):**

The permission required depends on the target status:
```go
var transitionPermissions = map[domain.PostStatus]string{
    domain.PostStatusApproved:  "approve:post",
    domain.PostStatusScheduled: "schedule:post",
    domain.PostStatusPublished: "publish:post",
    domain.PostStatusDraft:     "review:post",  // sending back to draft = review
}
```

Validate with `domain.PostStatus.CanTransitionTo(nextStatus)` before writing.
Return 422 if the transition is not valid (e.g., published → draft).

Body: `{"status": "approved"}` or `{"status": "scheduled", "scheduled_date": "2026-05-01", "scheduled_time": "09:00"}`

**Create post:** generate ID with `domain.NewID()`. Default status is `draft`.

---

### admin_reports.go

```
GET  /admin/tenants/{tenantId}/reports         — list reports (id, slug, type, title, created_at — no content)
POST /admin/tenants/{tenantId}/reports         — create report (requires create:report)
GET  /admin/tenants/{tenantId}/reports/{slug}  — get full report including content (requires view:report)
DELETE /admin/tenants/{tenantId}/reports/{id}  — delete report (requires create:report)
```

**Create:** if `type` is not provided in the body, auto-detect from slug using
`domain.DetectReportType(slug)`.

---

### admin_campaigns.go

```
GET    /admin/tenants/{tenantId}/campaigns          — list campaigns
POST   /admin/tenants/{tenantId}/campaigns          — create/upsert campaign (requires manage:campaign)
GET    /admin/tenants/{tenantId}/campaigns/{slug}   — get campaign with full JSON data
DELETE /admin/tenants/{tenantId}/campaigns/{id}     — delete campaign (requires manage:campaign)
POST   /admin/tenants/{tenantId}/campaigns/{id}/deploy — mark as deployed (requires manage:campaign)
```

---

### admin_alerts.go

```
GET   /admin/tenants/{tenantId}/alerts            — list open alerts (CRITICAL first)
GET   /admin/tenants/{tenantId}/alerts/count      — count of open alerts (for badge)
GET   /admin/tenants/{tenantId}/alerts/history    — all alerts including resolved
POST  /admin/tenants/{tenantId}/alerts/{id}/resolve
POST  /admin/tenants/{tenantId}/alerts/{id}/ignore
```

**Count endpoint** is polled by the UI every 60 seconds for the notification badge.
Response: `{"count": 3}` — no auth overhead should be added here beyond the JWT check.

---

### Wire-up in main.go

```go
tenantRepo    := repository.NewTenantRepository(pool)
postRepo      := repository.NewPostRepository(pool)
reportRepo    := repository.NewReportRepository(pool)
campaignRepo  := repository.NewCampaignRepository(pool)
alertRepo     := repository.NewAlertRepository(pool)

r.Route("/admin", func(r chi.Router) {
    r.Use(middleware.AdminCORS(cfg.AdminCORSOrigins))
    r.Use(middleware.AuthenticateAdmin(jwtSvc))

    // tenants
    th := api.NewAdminTenantsHandler(tenantRepo, rbacRepo)
    r.With(middleware.RequirePermission("view-any:tenant")).Get("/tenants", th.List)
    r.With(middleware.RequirePermission("create:tenant")).Post("/tenants", th.Create)
    r.Route("/tenants/{tenantId}", func(r chi.Router) {
        r.With(middleware.RequirePermission("view:tenant")).Get("/", th.Get)
        r.With(middleware.RequirePermission("update:tenant")).Put("/", th.Update)
        r.With(middleware.RequirePermission("delete:tenant")).Delete("/", th.Delete)

        // posts
        ph := api.NewAdminPostsHandler(postRepo)
        r.Get("/posts", ph.List)
        r.With(middleware.RequirePermission("create:post")).Post("/posts", ph.Create)
        r.Get("/posts/{id}", ph.Get)
        r.Put("/posts/{id}", ph.Update)
        r.Patch("/posts/{id}/status", ph.UpdateStatus) // permission checked inside handler
        r.With(middleware.RequirePermission("delete:post")).Delete("/posts/{id}", ph.Delete)

        // reports
        rh := api.NewAdminReportsHandler(reportRepo)
        r.With(middleware.RequirePermission("view:report")).Get("/reports", rh.List)
        r.With(middleware.RequirePermission("create:report")).Post("/reports", rh.Create)
        r.With(middleware.RequirePermission("view:report")).Get("/reports/{slug}", rh.Get)
        r.With(middleware.RequirePermission("create:report")).Delete("/reports/{id}", rh.Delete)

        // campaigns
        ch := api.NewAdminCampaignsHandler(campaignRepo)
        r.With(middleware.RequirePermission("view:campaign")).Get("/campaigns", ch.List)
        r.With(middleware.RequirePermission("manage:campaign")).Post("/campaigns", ch.Create)
        r.With(middleware.RequirePermission("view:campaign")).Get("/campaigns/{slug}", ch.Get)
        r.With(middleware.RequirePermission("manage:campaign")).Delete("/campaigns/{id}", ch.Delete)
        r.With(middleware.RequirePermission("manage:campaign")).Post("/campaigns/{id}/deploy", ch.Deploy)

        // alerts
        ah := api.NewAdminAlertsHandler(alertRepo)
        r.Get("/alerts", ah.List)
        r.Get("/alerts/count", ah.Count)
        r.Get("/alerts/history", ah.History)
        r.Post("/alerts/{id}/resolve", ah.Resolve)
        r.Post("/alerts/{id}/ignore", ah.Ignore)
    })
})
```

---

## Track B — SvelteKit SPA migration

### Step B1 — Switch to adapter-static

In `svelte.config.js` (project root):

```js
import adapter from '@sveltejs/adapter-static'

export default {
  kit: {
    adapter: adapter({
      pages: 'dist',
      assets: 'dist',
      fallback: '200.html',  // SPA fallback — Go serves this for all unknown routes
      precompress: false,
    }),
    alias: {
      '$lib': 'src/lib',
    }
  }
}
```

Install the adapter:
```bash
bun add -d @sveltejs/adapter-static
```

### Step B2 — Create API client layer

Create `src/lib/api/client.ts` — base fetch wrapper:

```typescript
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

let accessToken: string | null = null

export function setToken(token: string) { accessToken = token }
export function clearToken() { accessToken = null }

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',  // for refresh token cookie
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401) {
    // attempt token refresh
    const refreshed = await tryRefresh()
    if (refreshed) {
      return apiFetch(path, options)  // retry once
    }
    // redirect to login
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message ?? 'Request failed')
  }

  return res.json()
}

async function tryRefresh(): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) return false
  const data = await res.json()
  setToken(data.access_token)
  return true
}
```

Create `src/lib/api/tenants.ts`, `src/lib/api/posts.ts`, `src/lib/api/reports.ts`, etc.
Each file exports typed functions:

```typescript
// src/lib/api/tenants.ts
import { apiFetch } from './client'
import type { Tenant } from '$lib/types'

export const getTenants = () =>
  apiFetch<Tenant[]>('/admin/tenants')

export const getTenant = (id: string) =>
  apiFetch<Tenant>(`/admin/tenants/${id}`)

export const updateTenant = (id: string, data: Partial<Tenant>) =>
  apiFetch<Tenant>(`/admin/tenants/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
```

### Step B3 — Migration order (route by route)

Convert in this order. After each route: run `bun run check` and verify in the browser.

**1. Root page — tenant list**

Delete `src/routes/+page.server.ts`.  
Convert `src/routes/+page.ts`:
```typescript
// +page.ts (runs in browser)
import { getTenants } from '$lib/api/tenants'
export const load = () => ({ tenants: getTenants() })
```
`+page.svelte` stays unchanged — it already receives `data.tenants`.

**2. `[tenant]` layout**

Delete `src/routes/[tenant]/+layout.server.ts`.  
Create `src/routes/[tenant]/+layout.ts`:
```typescript
import { getTenant } from '$lib/api/tenants'
import { error } from '@sveltejs/kit'
export const load = async ({ params }) => {
  const tenant = await getTenant(params.tenant).catch(() => null)
  if (!tenant) error(404, 'Tenant not found')
  return { tenant }
}
```

**3. Social posts list** — `[tenant]/social/+page.ts` → `apiFetch('/admin/tenants/{id}/posts')`  
**4. Social post detail** — `[tenant]/social/[filename]/+page.ts`  
**5. Social drafts** — `[tenant]/social/drafts/+page.ts`  
**6. Schedule/planner** — `[tenant]/schedule/+page.ts`  
**7. Reports list** — `[tenant]/reports/+page.ts`  
**8. Report detail** — `[tenant]/reports/[slug]/+page.ts`  
**9. Campaigns list** — `[tenant]/ads/google/+page.ts`  
**10. Campaign detail** — `[tenant]/ads/google/[filename]/+page.ts`  
**11. Alerts** — `[tenant]/alerts/+page.ts`  
**12. Settings general** — `[tenant]/settings/general/+page.ts`  
**13. Settings integrations** — `/settings/integrations/+page.ts`  

### Step B4 — Auth state in SvelteKit

Create `src/lib/stores/auth.ts` (Svelte 5 runes):

```typescript
// Stores access token in memory (not localStorage — security).
// Refresh token lives in HttpOnly cookie managed by the Go API.

let _token = $state<string | null>(null)
let _user  = $state<User | null>(null)

export const auth = {
  get token() { return _token },
  get user()  { return _user },
  get isAuthenticated() { return _token !== null },
  setToken(t: string) { _token = t },
  setUser(u: User)    { _user = u },
  clear() { _token = null; _user = null },
}
```

Create `src/routes/login/+page.svelte` — login form that calls `POST /auth/login`,
stores the access token in `auth.setToken()`, and redirects to `/`.

Create `src/routes/setup/+page.svelte` — first-run form that calls `POST /setup`.
This page is shown only when `GET /health` returns `setup_required: true`.

Create `src/hooks.client.ts` — on app load, attempt `POST /auth/refresh` to restore
session from the HttpOnly cookie without requiring the user to log in again.

### Step B5 — Go serves the SPA

Add to `cmd/server/main.go`:

```go
import "embed"

//go:embed all:ui/dist
var uiFS embed.FS

// After all API routes:
uiHandler := http.FileServer(http.FS(uiFS))
r.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    // Try the exact path first; fall back to 200.html for SPA routing
    path := "ui/dist" + r.URL.Path
    if _, err := uiFS.Open(path); err != nil {
        r.URL.Path = "/"
        // serve 200.html
        http.ServeFileFS(w, r, uiFS, "ui/dist/200.html")
        return
    }
    uiHandler.ServeHTTP(w, r)
}))
```

Update `Makefile`:
```makefile
build:
    cd .. && bun run build      # build SvelteKit SPA into ui/dist/
    go build -o bin/server ./cmd/server  # embeds ui/dist
```

The `//go:embed` directive embeds the SvelteKit output at compile time.
During development, keep running `bun run dev` (port 5173) alongside `air` (port 8080).
The SvelteKit dev server proxies API calls — configure in `vite.config.ts`:

```typescript
server: {
  proxy: {
    '/admin': 'http://localhost:8080',
    '/auth':  'http://localhost:8080',
    '/setup': 'http://localhost:8080',
    '/health':'http://localhost:8080',
    '/mcp':   'http://localhost:8080',
  }
}
```

---

## Step C — Remove obsolete server-side code

After all routes are converted and verified:

1. Delete all `+page.server.ts` files
2. Delete all `+server.ts` files under `src/routes/api/` — their logic moves to Go handlers
3. Remove `bun:sqlite` imports from all remaining files
4. Remove `src/lib/server/db/` directory (SQLite data layer — replaced by Go)
5. Run `bun run check` — must pass with zero errors

**Exception:** keep `src/lib/server/mcp/` temporarily until T16 (MCP in Go) is complete.
Keep `src/lib/server/googleAds*.ts` temporarily until T17 (Go connectors) is complete.

---

## i18n strings

Add to `api/internal/i18n/locales/en.json`:
```json
{
  "error.tenant_not_found": "Tenant not found.",
  "error.post_not_found": "Post not found.",
  "error.invalid_status_transition": "Cannot transition from {{from}} to {{to}}.",
  "error.report_slug_taken": "A report with this slug already exists for this tenant.",
  "post.status.draft": "Draft",
  "post.status.approved": "Approved",
  "post.status.scheduled": "Scheduled",
  "post.status.published": "Published"
}
```

Add corresponding entries in `pt_BR.json`.

---

## Completion criteria

- [ ] `go build ./...` passes
- [ ] All 5 handler files compile without errors
- [ ] `GET /admin/tenants` returns tenant list with valid JWT
- [ ] `GET /admin/tenants` returns 401 without token
- [ ] `PATCH /admin/tenants/{id}/posts/{postId}/status` with `{"status":"approved"}` returns 200
- [ ] `PATCH` with invalid transition (e.g., published → draft) returns 422
- [ ] `GET /admin/tenants/{id}/alerts/count` returns `{"count": N}`
- [ ] SvelteKit `bun run check` passes after removing all `+page.server.ts` files
- [ ] `bun run build` produces `dist/` with `200.html`
- [ ] `GET http://localhost:8080/` serves the SvelteKit SPA
- [ ] Navigating directly to `http://localhost:8080/portico/social` returns 200 (SPA fallback works)
- [ ] Login flow works end-to-end: form → POST /auth/login → token stored → redirect to /

---

## References

- Existing SvelteKit routes: `src/routes/`
- Existing TypeScript data layer (reference for field names): `src/lib/server/`
- rush-cms-v2 handler pattern: `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/internal/api/`
- Roadmap: `.project/tasks/README.md`
- Previous tasks: T11, T12, T13
- Next task: T15 — Integrations Hub
