# Implementation: Settings with Tabs + Integrations Hub + SQLite Migration

> Implementation document generated after brainstorm on 2026-04-24.
> Intended for the next agent — contains all decisions, schemas, files, and execution order.

---

## Architecture decisions (do not renegotiate without strong reason)

1. **Integrations live in SQLite** — not in `integrations.json`. Reason: real relations, atomicity on OAuth callback, smaller exposure surface.
2. **Clients and posts migrate to SQLite** — see section 9. The project has grown beyond what flat-file handles well.
3. **Media files stay on the filesystem** — blobs don't belong in SQLite in this context.
4. **MD reports stay on the filesystem** — they are generated documents read as prose; no reason to migrate.
5. **Settings with sub-routes and tab bar** — same pattern as `/social` (Planner/Drafts). Starts with General and Integrations.
6. **A client has at most ONE Google Ads integration** — multiple integrations exist for different GCP projects/MCC accounts, not for the same client.
7. **`.env` migration: manual** — only Pórtico exists in ads, no automation needed.

---

## 1. SQLite Schema — new tables

The DB lives at `db/marketing.db`. Migrations are in `db/migrations/`. The current migration is `001_schema.sql`. Create `002_integrations.sql`:

```sql
-- 002_integrations.sql

CREATE TABLE IF NOT EXISTS integrations (
  id          TEXT PRIMARY KEY,                         -- generated slug: 'agency-google-ads', 'portico-own'
  name        TEXT NOT NULL,                            -- human label: "Agency — Default Account"
  provider    TEXT NOT NULL,                            -- 'google_ads' | 'meta' | 'canva'
  -- OAuth app credentials (entered by the user in the UI)
  oauth_client_id     TEXT,
  oauth_client_secret TEXT,
  -- Provider-specific config
  developer_token     TEXT,                             -- Google Ads: developer token
  login_customer_id   TEXT,                             -- Google Ads: MCC customer ID (no hyphens)
  -- OAuth result
  refresh_token       TEXT,                             -- filled after OAuth
  status      TEXT NOT NULL DEFAULT 'pending',          -- 'pending' | 'connected' | 'error'
  error_message TEXT,                                   -- last error, if any
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Junction: which tenant uses which integration
-- A tenant can have at most ONE integration per provider
-- Enforced via UNIQUE (tenant_id, provider) or via check in the business layer
CREATE TABLE IF NOT EXISTS integration_clients (
  integration_id  TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  tenant_id       TEXT NOT NULL,  -- the client slug (e.g. 'portico')
  PRIMARY KEY (integration_id, tenant_id)
);

-- Index for fast lookup: "which integration uses this tenant?"
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_clients_tenant
  ON integration_clients (tenant_id);
-- UNIQUE enforces "at most one integration per tenant" without needing to check in the app
```

> **Note on plaintext secrets:** For localhost, acceptable — the `db/marketing.db` file is in `.gitignore`. For the future desktop version (Electrobun), move `oauth_client_secret` and `refresh_token` fields to the OS keychain via `safeStorage`. Until then, documented as a limitation.

---

## 2. Data layer — `lib/db/integrations.ts`

Create a new file. **Do not modify `lib/db/index.ts` directly** — that file already has connection logic and monitoring/alerts schema; keep them separate.

```typescript
// lib/db/integrations.ts
import { getDb } from './index';  // reuse existing connection

export type IntegrationProvider = 'google_ads' | 'meta' | 'canva';
export type IntegrationStatus   = 'pending' | 'connected' | 'error';

export interface Integration {
  id: string;
  name: string;
  provider: IntegrationProvider;
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  developer_token: string | null;
  login_customer_id: string | null;
  refresh_token: string | null;
  status: IntegrationStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationWithClients extends Integration {
  clients: string[];  // array of tenant_id
}

// Basic CRUD
export function listIntegrations(): IntegrationWithClients[]
export function getIntegration(id: string): IntegrationWithClients | null
export function getIntegrationForTenant(tenantId: string, provider: IntegrationProvider): Integration | null
export function createIntegration(data: Omit<Integration, 'created_at' | 'updated_at'>): void
export function updateIntegration(id: string, data: Partial<Integration>): void
export function deleteIntegration(id: string): void
export function setIntegrationClients(integrationId: string, tenantIds: string[]): void
export function getCredentialsForTenant(tenantId: string, provider: IntegrationProvider): {
  oauth_client_id: string;
  oauth_client_secret: string;
  developer_token: string;
  login_customer_id: string;
  refresh_token: string;
} | null
```

The `getCredentialsForTenant` function is the primary one — used by `googleAds.ts` and `googleAdsDetailed.ts` instead of `env.*`.

---

## 3. Migrating code that reads `env.GOOGLE_ADS_*`

### 3a. `ui/src/lib/server/googleAds.ts`

Replace the section that reads env vars:

```typescript
// BEFORE
const clientId        = env.GOOGLE_ADS_CLIENT_ID;
const clientSecret    = env.GOOGLE_ADS_CLIENT_SECRET;
const developerToken  = env.GOOGLE_ADS_DEVELOPER_TOKEN;
const refreshToken    = env.GOOGLE_ADS_REFRESH_TOKEN;
const loginCustomerId = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '');

// AFTER
import { getCredentialsForTenant } from '$lib/server/db/integrations';  // server-side wrapper

const creds = getCredentialsForTenant(tenantId, 'google_ads');
if (!creds) throw new Error(`No Google Ads integration configured for ${tenantId}`);
const { oauth_client_id: clientId, oauth_client_secret: clientSecret,
        developer_token: developerToken, refresh_token: refreshToken,
        login_customer_id: loginCustomerId } = creds;
```

### 3b. `ui/src/lib/server/googleAdsDetailed.ts`

Same change. Receives `tenantId` as a parameter (probably already receives it via context).

### 3c. `scripts/lib/ads.ts`

Scripts run outside SvelteKit. They need direct access to SQLite:

```typescript
// scripts/lib/ads.ts — add helper function
import { Database } from 'bun:sqlite';
import path from 'node:path';

function getGoogleAdsCreds(tenantId: string) {
  const db = new Database(path.resolve('./db/marketing.db'));
  const row = db.query(`
    SELECT i.* FROM integrations i
    JOIN integration_clients ic ON ic.integration_id = i.id
    WHERE ic.tenant_id = ? AND i.provider = 'google_ads' AND i.status = 'connected'
    LIMIT 1
  `).get(tenantId) as any;
  db.close();
  return row;
}
```

In scripts that currently pass customer_id via CLI, add a `--tenant` flag for lookup:
```bash
bun run scripts/deploy-google-ads.ts clients/portico/ads/google/camp.json --tenant portico
```

> **Fallback:** If `--tenant` is not passed, try reading from `.env` as today (backward compat during the transition).

---

## 4. OAuth flow — changes

### 4a. `ui/src/routes/api/auth/google-ads/+server.ts`

Accept `integration_id` as a query param. Fetch credentials from DB instead of `.env`:

```typescript
// GET /api/auth/google-ads?integration_id=portico-own
export const GET: RequestHandler = async ({ url }) => {
  const integrationId = url.searchParams.get('integration_id');
  if (!integrationId) return new Response('integration_id required', { status: 400 });

  const integration = getIntegration(integrationId);  // from lib/db/integrations
  if (!integration?.oauth_client_id || !integration?.oauth_client_secret) {
    return new Response('Integration credentials not configured', { status: 400 });
  }

  // Embed integration_id in OAuth state so the callback knows which integration to update
  const state = Buffer.from(JSON.stringify({ integration_id: integrationId })).toString('base64');

  const authUrl = buildGoogleOAuthUrl({
    clientId: integration.oauth_client_id,
    redirectUri: `${origin}/api/auth/google-ads/callback`,
    state,
  });

  return redirect(302, authUrl);
};
```

### 4b. `ui/src/routes/api/auth/google-ads/callback/+server.ts`

Extract `integration_id` from `state`, update `refresh_token` in the DB instead of writing to `.env`:

```typescript
export const GET: RequestHandler = async ({ url }) => {
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const { integration_id } = JSON.parse(Buffer.from(state!, 'base64').toString());
  const integration = getIntegration(integration_id);

  const tokens = await exchangeCodeForTokens(code!, {
    clientId: integration.oauth_client_id!,
    clientSecret: integration.oauth_client_secret!,
    redirectUri: `${origin}/api/auth/google-ads/callback`,
  });

  updateIntegration(integration_id, {
    refresh_token: tokens.refresh_token,
    status: 'connected',
    updated_at: new Date().toISOString(),
  });

  // Redirect back to settings/integrations with a success message
  return redirect(302, '/settings/integrations?connected=true');
  // OR to the tenant that started the flow, if we know which one
};
```

> **Note:** The final redirect should go back to the integrations screen. If we need to know the tenant, include it in `state` as well.

---

## 5. Settings — route structure

### Routes to create

```
ui/src/routes/[tenant]/settings/
  +layout.svelte          ← tab bar: General | Integrations
  +layout.server.ts       ← load brand + integrations (pass to sub-routes)
  +page.server.ts         ← redirect to /general
  general/
    +page.svelte          ← brand info (what was in settings/+page.svelte before)
    +page.server.ts       ← load + saveBrand action
  integrations/
    +page.svelte          ← integration list + add/edit/delete
    +page.server.ts       ← load integrations, actions: create, update, delete, setClients
```

### `settings/+layout.svelte`

Same pattern as `social/+layout.svelte`. Horizontal tab bar at the top of the content area:

```svelte
<script>
  const tabs = [
    { href: `/${data.tenant}/settings/general`,      label: 'General' },
    { href: `/${data.tenant}/settings/integrations`, label: 'Integrations' },
  ];
</script>

<!-- Tab bar consistent with the rest of the app -->
<div class="border-b border-slate-200 dark:border-slate-800">
  <nav class="flex gap-1 px-4 sm:px-6">
    {#each tabs as tab}
      <a href={tab.href} class="px-4 py-3 text-sm font-medium border-b-2 transition-colors
        {currentPath.startsWith(tab.href)
          ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
          : 'border-transparent text-slate-500 hover:text-slate-700'}">
        {tab.label}
      </a>
    {/each}
  </nav>
</div>

<div class="flex-1 overflow-y-auto">
  {@render children()}
</div>
```

### `settings/+page.server.ts` (redirect)

```typescript
import { redirect } from '@sveltejs/kit';
export const load = async ({ params }) => {
  redirect(302, `/${params.tenant}/settings/general`);
};
```

---

## 6. Integrations page — UX and components

### `settings/integrations/+page.server.ts`

```typescript
export const load: PageServerLoad = async ({ params }) => {
  const integrations = listIntegrations();  // from lib/db/integrations
  const clients = await getClients();       // from lib/server/db
  return { tenant: params.tenant, integrations, clients };
};

export const actions: Actions = {
  create: async ({ request }) => {
    // Receives: name, provider, oauth_client_id, oauth_client_secret, developer_token, login_customer_id
    // Generates id = nanoid() or slug from name
    // Creates integration with status 'pending'
  },
  update: async ({ request }) => {
    // Receives: id + fields to update
  },
  delete: async ({ request }) => {
    // Receives: id
    // ON DELETE CASCADE cleans up integration_clients
  },
  setClients: async ({ request }) => {
    // Receives: integration_id, client_ids[] (array of selected tenants)
    // Calls setIntegrationClients(id, clientIds)
    // Ensures no tenant ends up in two integrations for the same provider
  },
};
```

### `settings/integrations/+page.svelte` — visual structure

```
[ + Add Google Ads Integration ]

┌──────────────────────────────────────────────────────────────┐
│ 🎯  Agency — Default Account                  ● Connected   │
│     MCC: 123-456-7890 · developer token: ✓                  │
│     Clients: Bracar Tires · Pórtico · +1                    │
│                           [Edit]  [Re-auth]  [Delete]       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ 🎯  Pórtico — Own Account                 ○ Not connected   │
│     Client ID: ✓ · Secret: ✓ · No refresh token            │
│     Clients: Pórtico                                        │
│                              [Edit]  [Connect →]  [Delete]  │
└──────────────────────────────────────────────────────────────┘
```

**"Add / Edit Integration" Modal** (bits-ui Dialog):
- Name (text input)
- Provider (Select — Google Ads only for now, disabled)
- OAuth Client ID (text input)
- OAuth Client Secret (password input — toggle visibility)
- Developer Token (text input)
- Login / MCC Customer ID (text input, format 123-456-7890)
- Assigned clients (MultiSelect — lists all available tenants)
- "Save" button → calls `create` or `update` action
- If status is already 'connected', show badge and "Re-authorize" button

**"Connect →" / "Re-auth" button:**
- Opens `/api/auth/google-ads?integration_id=xxx` in a new tab or redirect
- After callback, redirects back and the page shows updated status

---

## 7. Change in `lib/db/index.ts` — load new migration

The current file loads `001_schema.sql`. It needs to also load `002_integrations.sql`:

```typescript
// lib/db/index.ts — in the initialization function
const migrations = [
  path.resolve(__dir, '../../db/migrations/001_schema.sql'),
  path.resolve(__dir, '../../db/migrations/002_integrations.sql'),
];

for (const migration of migrations) {
  try {
    const sql = readFileSync(migration, 'utf-8');
    db.exec(sql);
  } catch (e) {
    // migration already applied (IF NOT EXISTS ensures idempotency)
  }
}
```

---

## 8. Server-side wrapper for SvelteKit

SvelteKit runs in the `ui/` context but `lib/db/integrations.ts` is at the root. Create a re-export at `ui/src/lib/server/integrations.ts`:

```typescript
// ui/src/lib/server/integrations.ts
// Re-exports the shared lib for use within SvelteKit server context
export {
  listIntegrations,
  getIntegration,
  getIntegrationForTenant,
  getCredentialsForTenant,
  createIntegration,
  updateIntegration,
  deleteIntegration,
  setIntegrationClients,
  type Integration,
  type IntegrationWithClients,
} from '../../../../lib/db/integrations';
```

Verify that the path alias `$lib/server/integrations` resolves correctly. If `tsconfig.json` already resolves `../../../../lib/db/` this path works (it already works for `$lib/server/db.ts`).

---

## 9. Migrating Clients and Posts to SQLite (major decision)

### Recommendation: migrate in two phases

**Phase 1 (together with integrations):** Create `clients` and `posts` tables in SQLite, but **keep flat-file reads** with a sync function. The UI keeps working; agents keep generating JSON files. A sync job (`sync-to-db`) imports the files into the DB.

**Phase 2 (later):** API routes write directly to the DB, flat-files become optional/readonly.

### Schema for Phase 1 — `003_clients_posts.sql`

```sql
-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id          TEXT PRIMARY KEY,         -- slug: 'portico', 'bracar-pneus'
  name        TEXT NOT NULL,
  niche       TEXT,
  google_ads_id TEXT,
  brand_json  TEXT,                     -- full JSON from brand.json (extensible)
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,         -- e.g. '2026-04-01_my-post'
  client_id     TEXT NOT NULL REFERENCES clients(id),
  filename      TEXT NOT NULL,            -- 'my-post.json'
  status        TEXT NOT NULL,            -- 'draft' | 'approved' | 'scheduled' | 'published'
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  hashtags      TEXT,                     -- JSON array: '["#tag1","#tag2"]'
  media_type    TEXT,
  platform      TEXT,                     -- JSON array of PostPlatform
  scheduled_date TEXT,
  scheduled_time TEXT,
  media_files   TEXT,                     -- JSON array of filenames
  workflow      TEXT,                     -- JSON of agent workflow
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_client_id ON posts (client_id);
CREATE INDEX IF NOT EXISTS idx_posts_status    ON posts (status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts (scheduled_date);
```

### Sync script — `scripts/sync-clients-to-db.ts`

Single script that reads flat-files and populates the DB. Run manually after implementing the tables:

```bash
bun run scripts/sync-clients-to-db.ts
```

Logic: `INSERT OR REPLACE INTO clients ...` and `INSERT OR REPLACE INTO posts ...`. Idempotent — can run multiple times.

### Change in `lib/db/index.ts` / `ui/src/lib/server/db.ts`

After migration:
- `getClients()` → `SELECT * FROM clients`
- `getClientPosts(clientId)` → `SELECT * FROM posts WHERE client_id = ?`
- Keep write functions (`createPost`, `updatePost`, `deletePost`) pointing to the DB

The API routes `+server.ts` that currently do `fs.writeFile` / `fs.unlink` would need to update the DB instead of the filesystem. **This is the most labor-intensive part** — each mutation endpoint needs an update.

> **Suggestion:** Implement integrations (phases 1–8 above) first, validate, then address the clients/posts migration separately. They are independent changes.

---

## 10. Files to create / modify — complete checklist

### Create (new)
- [ ] `db/migrations/002_integrations.sql` — integrations table schema
- [ ] `db/migrations/003_clients_posts.sql` — clients + posts schema (phase 2)
- [ ] `lib/db/integrations.ts` — integration CRUD
- [ ] `ui/src/lib/server/integrations.ts` — re-export for SvelteKit
- [ ] `ui/src/routes/[tenant]/settings/+layout.svelte` — tab bar
- [ ] `ui/src/routes/[tenant]/settings/+layout.server.ts` — shared load
- [ ] `ui/src/routes/[tenant]/settings/+page.server.ts` — redirect to /general
- [ ] `ui/src/routes/[tenant]/settings/general/+page.svelte` — brand info (move from settings/)
- [ ] `ui/src/routes/[tenant]/settings/general/+page.server.ts` — load + saveBrand action
- [ ] `ui/src/routes/[tenant]/settings/integrations/+page.svelte` — integrations hub
- [ ] `ui/src/routes/[tenant]/settings/integrations/+page.server.ts` — load + actions

### Modify (existing)
- [ ] `lib/db/index.ts` — load new migration on initialization
- [ ] `ui/src/lib/server/googleAds.ts` — replace `env.*` with `getCredentialsForTenant`
- [ ] `ui/src/lib/server/googleAdsDetailed.ts` — same
- [ ] `ui/src/routes/api/auth/google-ads/+server.ts` — accept `integration_id`, fetch creds from DB
- [ ] `ui/src/routes/api/auth/google-ads/callback/+server.ts` — write token to DB via `updateIntegration`
- [ ] `ui/src/routes/[tenant]/settings/+page.svelte` — remove (content goes to /general)
- [ ] `ui/src/routes/[tenant]/settings/+page.server.ts` — become redirect

### Optional (phase 2 — clients/posts migration)
- [ ] `scripts/sync-clients-to-db.ts` — sync flat-file → DB
- [ ] `lib/db/index.ts` — rewrite `getClients()` and `getClientPosts()` for SQLite
- [ ] `ui/src/lib/server/db.ts` — update all write functions
- [ ] Each post/client mutation `+server.ts` — point to DB

---

## 11. Recommended implementation order

```
1. db/migrations/002_integrations.sql
2. lib/db/integrations.ts  (pure CRUD, testable)
3. ui/src/lib/server/integrations.ts  (re-export)
4. lib/db/index.ts  (load new migration)
5. ui/src/routes/api/auth/google-ads/ (both endpoints)
6. ui/src/routes/[tenant]/settings/ restructure into sub-routes
7. settings/general/ (move current content)
8. settings/integrations/ (main page + actions)
9. ui/src/lib/server/googleAds.ts + googleAdsDetailed.ts (replace env with DB)
10. Test complete OAuth flow (add integration → connect → use in ads page)
11. [Phase 2] db/migrations/003_clients_posts.sql + sync script + migrate reads
```

---

## 12. Reference context for the next agent

### Project stack
- Runtime: Bun (native bun:sqlite)
- UI: SvelteKit 2 + Svelte 5 runes + Tailwind v4
- UI Components: bits-ui v2 (Dialog, DropdownMenu, Popover, Tooltip already in use)
- DB: SQLite at `db/marketing.db`, connection in `lib/db/index.ts`
- No ORM — direct SQL queries with `bun:sqlite`

### Existing code patterns
- Svelte 5: `$props()`, `$state()`, `$derived()`, `$effect()` — no legacy stores
- SvelteKit form actions for server-side mutations
- `import { Dialog, DropdownMenu, Popover, Tooltip } from 'bits-ui'` on the client
- `import { cn } from '$lib/utils'` for class merging
- Types in `lib/db/index.ts` (Brand, Post, PostWithMeta) and `ui/src/lib/server/db.ts`
- No `any` — strict typing
- No `dotenv.config()` — Bun injects `.env` automatically

### `lib/db/index.ts` — how to use the connection
```typescript
// Exports getDb() which returns the singleton instance
// Already initializes the schema on first access
import { getDb } from './index';
const db = getDb();
const rows = db.query('SELECT * FROM integrations').all();
```

### Current settings files
- `ui/src/routes/[tenant]/settings/+page.svelte` — brand info form (already exists)
- `ui/src/routes/[tenant]/settings/+page.server.ts` — load + saveBrand action (already exists)
- These two files need to be moved to `settings/general/`

### Current Google Ads env vars (reference for migration)
```
GOOGLE_ADS_CLIENT_ID        → integrations.oauth_client_id
GOOGLE_ADS_CLIENT_SECRET    → integrations.oauth_client_secret
GOOGLE_ADS_DEVELOPER_TOKEN  → integrations.developer_token
GOOGLE_ADS_REFRESH_TOKEN    → integrations.refresh_token
GOOGLE_ADS_LOGIN_CUSTOMER_ID → integrations.login_customer_id
```
