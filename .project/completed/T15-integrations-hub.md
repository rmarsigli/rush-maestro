# T15 — Integrations Hub

**Status:** completed — moved to `completed/T15-integrations-hub.md`  
**Phase:** 4 — Integrations  
**Estimate:** 8–10 hours  
**Depends on:** T11, T13 (migrations + repo layer)  
**Runs in parallel with:** T14 (no shared files)  
**Unlocks:** T16 (MCP), T17 (Google Ads + R2), T18 (LLM), T19 (Meta)

---

## Context

The current integrations page at `/settings/integrations` handles only Google Ads via a
flat form. The new hub is redesigned as a Coolify-style card grid where each provider is
a card with its logo, status badge, and a "Configure" button that opens a setup modal.

The architecture uses a **provider registry**: each provider (Google Ads, Meta, R2, Claude, etc.)
registers an `IntegrationSchema` struct that describes its display metadata and configuration
fields. The UI renders forms dynamically from this schema — no hardcoded forms per provider.
Adding a new provider is a single Go file + registration line.

Integrations are **repeatable**: multiple instances of the same provider can exist
(e.g., two Google Ads integrations for different MCC accounts). Each integration can be
assigned to one or more tenants.

---

## Files to create

```
api/
  internal/
    connector/
      registry.go           — provider registration + lookup
      schema.go             — IntegrationSchema, FieldSchema types
      googleads/
        schema.go           — registers Google Ads schema
      meta/
        schema.go           — registers Meta schema (stub for now)
      storage/
        schema.go           — registers R2 + S3 schemas
      llm/
        schema.go           — registers Claude, OpenAI, Groq, Gemini schemas
      email/
        schema.go           — registers Brevo, Sendible schemas
      monitoring/
        schema.go           — registers Sentry schema
    api/
      admin_integrations.go  — CRUD + OAuth initiation handler
      oauth_googleads.go     — Google Ads OAuth flow (port from TypeScript)
  migrations/
    000014_add_fk_user_tenant_roles.sql  — deferred FK from T12+T13
```

---

## Step 1 — Provider schema types

### internal/connector/schema.go

```go
package connector

// FieldType controls how the UI renders each configuration field.
type FieldType string

const (
    FieldTypeText     FieldType = "text"
    FieldTypePassword FieldType = "password"  // masked, toggle visibility
    FieldTypeSelect   FieldType = "select"
    FieldTypeURL      FieldType = "url"
    FieldTypeNumber   FieldType = "number"
)

type FieldSchema struct {
    Key         string    // maps to Integration.config or .credentials JSON key
    Label       string    // display label
    Placeholder string
    Type        FieldType
    Required    bool
    HelpText    string    // shown below the field
    Options     []SelectOption  // only for FieldTypeSelect
}

type SelectOption struct {
    Label string
    Value string
}

// IntegrationSchema describes everything the UI needs to render
// the setup card and configuration modal for a provider.
// Register providers with RegisterProvider() — do not instantiate directly.
type IntegrationSchema struct {
    Provider    domain.IntegrationProvider
    Group       domain.IntegrationGroup
    DisplayName string
    Description string
    LogoSVG     string  // inline SVG string for the card logo

    // ConfigFields are non-secret fields shown in the setup form
    // and visible in the integrations list (e.g., customer ID, bucket name).
    ConfigFields []FieldSchema

    // CredentialFields are secret fields (API keys, client secrets).
    // Values are masked in the UI after save; shown only when editing.
    CredentialFields []FieldSchema

    // OAuthFlow: if true, the "Connect" button initiates an OAuth redirect
    // instead of a form submit. The UI shows a "Connect via OAuth" button.
    OAuthFlow bool

    // OAuthStartPath is the Go API path that initiates the OAuth redirect.
    // Example: "/auth/google-ads/start"
    OAuthStartPath string

    // TestConnection is called when the user clicks "Test Connection".
    // Receives the saved integration from DB, returns nil on success.
    TestConnection func(ctx context.Context, integration *domain.Integration) error
}
```

### internal/connector/registry.go

```go
package connector

import (
    "fmt"
    "sync"

    "github.com/rush-maestro/rush-maestro/internal/domain"
)

var (
    mu       sync.RWMutex
    registry = map[domain.IntegrationProvider]*IntegrationSchema{}
)

// RegisterProvider adds a provider schema to the global registry.
// Called from each provider's init() function.
func RegisterProvider(s *IntegrationSchema) {
    mu.Lock()
    defer mu.Unlock()
    registry[s.Provider] = s
}

// GetProvider retrieves a registered provider schema.
func GetProvider(p domain.IntegrationProvider) (*IntegrationSchema, error) {
    mu.RLock()
    defer mu.RUnlock()
    s, ok := registry[p]
    if !ok {
        return nil, fmt.Errorf("unknown provider: %s", p)
    }
    return s, nil
}

// ListProviders returns all registered provider schemas, grouped.
func ListProviders() []*IntegrationSchema {
    mu.RLock()
    defer mu.RUnlock()
    out := make([]*IntegrationSchema, 0, len(registry))
    for _, s := range registry {
        out = append(out, s)
    }
    return out
}
```

---

## Step 2 — Provider schemas (one file per provider)

Each file calls `connector.RegisterProvider()` in an `init()` function.
The `cmd/server/main.go` imports each schema package with `_` to trigger registration:

```go
// cmd/server/main.go
import (
    _ "github.com/rush-maestro/rush-maestro/internal/connector/googleads"
    _ "github.com/rush-maestro/rush-maestro/internal/connector/meta"
    _ "github.com/rush-maestro/rush-maestro/internal/connector/storage"
    _ "github.com/rush-maestro/rush-maestro/internal/connector/llm"
    _ "github.com/rush-maestro/rush-maestro/internal/connector/email"
    _ "github.com/rush-maestro/rush-maestro/internal/connector/monitoring"
)
```

### internal/connector/googleads/schema.go

```go
package googleads

import "github.com/rush-maestro/rush-maestro/internal/connector"
import "github.com/rush-maestro/rush-maestro/internal/domain"

func init() {
    connector.RegisterProvider(&connector.IntegrationSchema{
        Provider:    domain.ProviderGoogleAds,
        Group:       domain.GroupAds,
        DisplayName: "Google Ads",
        Description: "Manage campaigns, budgets, and keywords via the Google Ads API.",
        LogoSVG:     googleAdsLogoSVG,
        ConfigFields: []connector.FieldSchema{
            {Key: "developer_token",    Label: "Developer Token",         Type: connector.FieldTypePassword, Required: true,
             HelpText: "Found in Google Ads → Tools → API Center."},
            {Key: "login_customer_id",  Label: "MCC Customer ID",         Type: connector.FieldTypeText,
             HelpText: "Your manager account ID (123-456-7890). Leave blank if using a direct account."},
        },
        CredentialFields: []connector.FieldSchema{
            {Key: "oauth_client_id",     Label: "OAuth Client ID",     Type: connector.FieldTypeText,     Required: true},
            {Key: "oauth_client_secret", Label: "OAuth Client Secret", Type: connector.FieldTypePassword, Required: true},
        },
        OAuthFlow:      true,
        OAuthStartPath: "/auth/google-ads/start",
        TestConnection: testGoogleAdsConnection,
    })
}

const googleAdsLogoSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Google Ads logo SVG --></svg>`

func testGoogleAdsConnection(ctx context.Context, i *domain.Integration) error {
    // Attempt a minimal API call (e.g., list accessible customers)
    // using i.GoogleAdsCredentials(). Return nil on success.
    return nil // implement in T17 when the Google Ads connector is built
}
```

### Schemas to stub (implement TestConnection in their respective connector tasks)

Create these with `TestConnection: nil` (or a no-op) for now:

| File | Provider | Group | OAuth | Config fields |
|---|---|---|---|---|
| `meta/schema.go` | `meta` | `social_media` | yes | App ID |
| `storage/schema.go` | `r2`, `s3` | `media` | no | bucket, region, endpoint |
| `llm/schema.go` | `claude`, `openai`, `groq`, `gemini` | `llm` | no | API key, model |
| `email/schema.go` | `brevo`, `sendible` | `email` | no | API key, from email |
| `monitoring/schema.go` | `sentry` | `monitoring` | no | DSN |

---

## Step 3 — deferred FK migration

Now that both T12 (users + RBAC) and T13 (tenants) are complete, add the FK:

### migrations/000014_add_fk_user_tenant_roles.sql

```sql
-- +goose Up
ALTER TABLE user_tenant_roles
    ADD CONSTRAINT fk_user_tenant_roles_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- +goose Down
ALTER TABLE user_tenant_roles
    DROP CONSTRAINT IF EXISTS fk_user_tenant_roles_tenant;
```

---

## Step 4 — SQLC queries (already created in T13, verify they exist)

The queries in `internal/repository/queries/integrations.sql` from T13 cover all
needed operations. If T13 is not yet complete, copy those queries now.

Regenerate after confirming:
```bash
go run github.com/sqlc-dev/sqlc/cmd/sqlc@latest generate
```

---

## Step 5 — admin_integrations.go handler

```
GET    /admin/integrations                        — list all integrations + available provider schemas
POST   /admin/integrations                        — create integration
GET    /admin/integrations/{id}                   — get integration (credentials masked)
PUT    /admin/integrations/{id}                   — update integration
DELETE /admin/integrations/{id}                   — delete integration (requires manage:integrations)
POST   /admin/integrations/{id}/test              — test connection
PUT    /admin/integrations/{id}/tenants           — update tenant assignments
GET    /admin/integrations/providers              — list all registered provider schemas (for UI)
```

All routes require `manage:integrations` permission except GET routes (which require `view:tenant`).

**GET /admin/integrations** response shape:
```json
{
  "integrations": [
    {
      "id": "...",
      "name": "Agency — Default Account",
      "provider": "google_ads",
      "group": "ads",
      "status": "connected",
      "error_message": null,
      "tenant_ids": ["portico"],
      "config": {
        "developer_token": "***",
        "login_customer_id": "123-456-7890"
      },
      "has_credentials": true,
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "providers": [
    {
      "provider": "google_ads",
      "group": "ads",
      "display_name": "Google Ads",
      "description": "...",
      "logo_svg": "...",
      "config_fields": [...],
      "credential_fields": [...],
      "oauth_flow": true,
      "oauth_start_path": "/auth/google-ads/start"
    }
  ]
}
```

**Credential masking rule:** Never return raw credential values from any GET endpoint.
For password/secret fields: return `"***"` if a value is set, `null` if not.
Only the `TestConnection` and OAuth flow functions access the raw values server-side.

**PUT /admin/integrations/{id}:** credential fields with value `"***"` must NOT
overwrite the stored value — skip those fields during update. Only update fields
where the client sent a non-masked value.

**POST /admin/integrations/{id}/test:** calls `IntegrationSchema.TestConnection`.
Returns `{"ok": true}` or `{"ok": false, "error": "..."}`.
Updates `integration.status` and `integration.error_message` based on result.

---

## Step 6 — Google Ads OAuth flow (port from TypeScript)

The existing TypeScript OAuth lives in:
- `src/routes/api/auth/google-ads/+server.ts` — initiates redirect
- `src/routes/api/auth/google-ads/callback/+server.ts` — handles callback, saves token

Port to Go in `api/internal/api/oauth_googleads.go`:

```go
// GET /auth/google-ads/start?integration_id=xxx
// Reads OAuth client ID/secret from the integration record,
// builds the Google OAuth2 authorization URL, redirects.
func (h *OAuthGoogleAdsHandler) Start(w http.ResponseWriter, r *http.Request) {
    integrationID := r.URL.Query().Get("integration_id")
    integration, err := h.integrationRepo.GetByID(r.Context(), integrationID)
    // validate: must have oauth_client_id and oauth_client_secret

    state := encodeState(OAuthState{
        IntegrationID: integrationID,
        ReturnTo:      "/settings/integrations",
    })

    authURL := buildGoogleOAuthURL(GoogleOAuthParams{
        ClientID:    *integration.OAuthClientID,
        RedirectURI: h.baseURL + "/auth/google-ads/callback",
        Scopes:      []string{"https://www.googleapis.com/auth/adwords"},
        State:       state,
        AccessType:  "offline",
        Prompt:      "consent",  // forces refresh_token to be issued
    })

    http.Redirect(w, r, authURL, http.StatusFound)
}

// GET /auth/google-ads/callback
// Exchanges the authorization code for tokens,
// saves refresh_token in the integration record.
func (h *OAuthGoogleAdsHandler) Callback(w http.ResponseWriter, r *http.Request) {
    code  := r.URL.Query().Get("code")
    state := decodeState(r.URL.Query().Get("state"))

    integration, err := h.integrationRepo.GetByID(r.Context(), state.IntegrationID)
    // validate integration exists and has credentials

    tokens, err := exchangeGoogleCode(r.Context(), ExchangeParams{
        Code:         code,
        ClientID:     *integration.OAuthClientID,
        ClientSecret: *integration.OAuthClientSecret,
        RedirectURI:  h.baseURL + "/auth/google-ads/callback",
    })
    if err != nil {
        h.integrationRepo.UpdateStatus(r.Context(), state.IntegrationID, "error", err.Error())
        http.Redirect(w, r, state.ReturnTo+"?error=oauth_failed", http.StatusFound)
        return
    }

    h.integrationRepo.UpdateCredentials(r.Context(), state.IntegrationID, tokens.RefreshToken)
    h.integrationRepo.UpdateStatus(r.Context(), state.IntegrationID, "connected", "")
    http.Redirect(w, r, state.ReturnTo+"?connected=true", http.StatusFound)
}
```

**Helper functions to implement:**
- `buildGoogleOAuthURL(params) string` — constructs the OAuth authorization URL
- `exchangeGoogleCode(ctx, params) (*TokenResponse, error)` — POST to token endpoint
- `encodeState / decodeState` — base64 JSON encode/decode of the state struct

Use Go's `net/http` client for the token exchange — no external OAuth library needed.
Google's token endpoint: `https://oauth2.googleapis.com/token`

Register in `main.go`:
```go
oauthHandler := api.NewOAuthGoogleAdsHandler(integrationRepo, cfg.BaseURL)
r.Get("/auth/google-ads/start", oauthHandler.Start)
r.Get("/auth/google-ads/callback", oauthHandler.Callback)
```

Add `BASE_URL` to config (e.g., `http://localhost:8080` in dev, `https://yourdomain.com` in prod).

---

## Step 7 — SvelteKit integrations UI

Replace `src/routes/settings/integrations/+page.svelte` with the new card-based UI.

### Data loading

Convert `+page.server.ts` → `+page.ts`:
```typescript
import { apiFetch } from '$lib/api/client'

export const load = async () => {
  const data = await apiFetch<IntegrationsPageData>('/admin/integrations')
  return data  // { integrations, providers }
}
```

### Page layout (card grid)

Group cards by `provider.group`. Order: Ads → Social Media → Media → LLM → Email → Monitoring.

For each group:
```svelte
<section>
  <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
    {groupLabel(group)}
  </h2>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each providersInGroup as provider}
      <!-- Existing integrations for this provider -->
      {#each integrationsForProvider(provider.provider) as integration}
        <IntegrationCard {integration} {provider} on:edit on:delete on:test />
      {/each}
      <!-- "Add" card -->
      <AddIntegrationCard {provider} on:add />
    {/each}
  </div>
</section>
```

### IntegrationCard component

Shows:
- Provider logo (SVG from schema)
- Integration name
- Status badge: `● Connected` (green) / `○ Pending` (gray) / `⚠ Error` (red)
- Assigned tenants: chips with tenant names
- Action buttons: Edit · Test · Delete
- If OAuth + pending/error: "Connect →" button → opens `provider.oauth_start_path?integration_id=id`

### AddIntegrationCard component

A dashed-border card with the provider logo and a "+" icon.
Clicking opens the setup modal for a new integration.

### Setup modal (bits-ui Dialog)

Fields rendered dynamically from `provider.config_fields` + `provider.credential_fields`:

```svelte
{#each [...provider.configFields, ...provider.credentialFields] as field}
  <label>
    {field.label}
    {#if field.type === 'password'}
      <PasswordInput bind:value={form[field.key]} required={field.required} />
    {:else}
      <input type="text" bind:value={form[field.key]} required={field.required} />
    {/if}
    {#if field.helpText}
      <p class="text-xs text-slate-500">{field.helpText}</p>
    {/if}
  </label>
{/each}

<!-- Tenant assignment -->
<MultiSelect
  label="Assign to clients"
  options={tenants.map(t => ({ label: t.name, value: t.id }))}
  bind:selected={form.tenantIds}
/>

{#if provider.oauthFlow}
  <p class="text-sm text-slate-500">
    After saving credentials, click "Connect →" to authorize via OAuth.
  </p>
{/if}
```

On submit: `POST /admin/integrations` with `{ name, provider, config: {...}, credentials: {...}, tenant_ids: [...] }`.

After creation, if `provider.oauth_flow === true`, immediately redirect to `provider.oauth_start_path?integration_id=newId`.

### Tenant selector in modal

The modal includes a MultiSelect for assigning tenants. The UI enforces the rule
"one connected integration per provider per tenant" by greying out tenants that
already have a connected integration for that provider.

---

## Step 8 — Remove obsolete settings code

After this task is complete:

- Remove `google_ads_id` field from `src/routes/[tenant]/settings/general/` UI
  (the Google Ads customer ID is now part of the integration config, not the tenant)
- Remove the old `src/routes/[tenant]/settings/integrations/` route
  (integrations are now at the global `/settings/integrations`)
- Update the navigation to point to `/settings/integrations` for the integrations hub

---

## i18n strings

Add to `en.json`:
```json
{
  "integrations.title": "Integrations",
  "integrations.group.ads": "Advertising",
  "integrations.group.social_media": "Social Media",
  "integrations.group.media": "Media & Storage",
  "integrations.group.llm": "AI Providers",
  "integrations.group.email": "Email",
  "integrations.group.monitoring": "Monitoring",
  "integrations.status.connected": "Connected",
  "integrations.status.pending": "Not connected",
  "integrations.status.error": "Error",
  "integrations.add": "Add {{provider}}",
  "integrations.test_success": "Connection successful.",
  "integrations.test_failed": "Connection failed: {{error}}",
  "integrations.oauth_required": "Save credentials first, then click Connect to authorize.",
  "error.integration_not_found": "Integration not found.",
  "error.provider_not_registered": "Unknown provider: {{provider}}."
}
```

Add corresponding entries in `pt_BR.json`.

---

## Completion criteria

- [ ] `go build ./...` passes
- [ ] `GET /admin/integrations/providers` returns all registered providers (Google Ads + stubs)
- [ ] `POST /admin/integrations` creates a new integration record
- [ ] `GET /admin/integrations` returns credentials masked as `"***"`
- [ ] `PUT /admin/integrations/{id}` with `"***"` values does NOT overwrite stored secrets
- [ ] `GET /auth/google-ads/start?integration_id=xxx` redirects to Google OAuth URL
- [ ] `GET /auth/google-ads/callback` with valid code saves refresh token + sets status `connected`
- [ ] `POST /admin/integrations/{id}/test` returns `{"ok": true/false}`
- [ ] SvelteKit UI shows card grid grouped by provider group
- [ ] New integration modal renders fields from provider schema dynamically
- [ ] OAuth "Connect →" button redirects to the correct OAuth start URL
- [ ] Tenant assignment MultiSelect works and saves to `integration_tenants`
- [ ] `bun run check` passes with zero errors

---

## References

- Current TypeScript OAuth: `src/routes/api/auth/google-ads/+server.ts` and `callback/+server.ts`
- Current integrations page: `src/routes/settings/integrations/+page.svelte`
- Current integration repo: `src/lib/server/db/integrations.ts`
- Coolify integrations UI (reference for card style): https://coolify.io (visual reference only)
- Roadmap: `.project/tasks/README.md`
- Previous tasks: T11, T12, T13
- Parallel task: T14 — REST API Core
- Next tasks: T16 (MCP), T17 (Google Ads connector), T18 (LLM), T19 (Meta)
