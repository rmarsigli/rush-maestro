# T17 — Google Ads Connector in Go

**Status:** completed  
**Phase:** 6 — Connectors  
**Estimate:** 8–10 hours  
**Depends on:** T15 (integrations table + repo), T16 (MCP server with stubs)  
**Unlocks:** T18 (LLM connector), T19 (Meta connector)

---

## Context

T16 registered all 29 MCP tools but left 12 of them as stubs:

- Ads read: `get_live_metrics`, `get_campaign_criteria`, `get_search_terms`, `get_ad_groups`
- Ads write: `add_negative_keywords`, `update_campaign_budget`, `set_weekday_schedule`,
  `add_ad_group_keywords`, `add_campaign_extensions`, `set_campaign_status`
- Monitoring write: `collect_daily_metrics`, `consolidate_monthly`

This task fills in all 12 stubs by implementing the Google Ads connector in Go,
then updates `.mcp.json` so Claude Code points to the Go MCP instead of TypeScript.

**Source of truth for porting:** the TypeScript implementation in
`frontend/src/lib/server/mcp/tools/ads.ts` and `monitoring.ts`. This document
contains every GAQL query, field mapping, alert threshold, and mutation payload
extracted from those files — an agent implementing T17 does not need to read them.

**`consolidate_monthly` does NOT call Google Ads API.** It reads from `daily_metrics`
in PostgreSQL and writes to `monthly_summary`. It can be fully implemented without
any Google Ads credentials.

---

## Google Ads REST API — what you need to know

The TypeScript `google-ads-api` npm package wraps the Google Ads REST gateway.
In Go, call the same REST endpoints directly with `net/http`.

### Base URL and version

```
https://googleads.googleapis.com/v18
```

Store as a package-level constant:
```go
const adsAPIBase = "https://googleads.googleapis.com/v18"
const adsAPIVersion = "v18"
```

### Authentication

Every request needs three headers:
```
Authorization: Bearer <access_token>
developer-token: <developer_token>
login-customer-id: <login_customer_id_without_dashes>  // only if using MCC
```

The `access_token` is obtained by exchanging the `refresh_token`:

```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id=<>&client_secret=<>&refresh_token=<>&grant_type=refresh_token
```

Response: `{ "access_token": "ya29...", "expires_in": 3600, "token_type": "Bearer" }`

The access token is valid for 1 hour. Cache it per integration ID for the duration
of a single tool call (no persistent caching needed for now — each MCP tool call
gets a fresh token if not cached).

### GAQL queries

```
POST https://googleads.googleapis.com/v18/customers/{customer_id}/googleAds:search
Authorization: Bearer <access_token>
developer-token: <developer_token>
login-customer-id: <mcc_id>   // omit if direct account
Content-Type: application/json

{ "query": "SELECT campaign.id, campaign.name FROM campaign" }
```

Response:
```json
{
  "results": [
    { "campaign": { "resourceName": "customers/123/campaigns/456", "id": "456", "name": "Campanha 1" } }
  ],
  "nextPageToken": "..."
}
```

**Pagination:** if `nextPageToken` is present, repeat the request with `pageToken` in
the request body. Collect all pages. Most queries return < 100 rows; implement
pagination defensively with a loop limit of 20 pages.

The `customer_id` in the URL is the numeric ID **without dashes**:
`795-509-5597` → `7955095597`

### Mutations

Each resource type has its own endpoint:

```
POST /v18/customers/{id}/campaigns:mutate
POST /v18/customers/{id}/campaignBudgets:mutate
POST /v18/customers/{id}/campaignCriteria:mutate
POST /v18/customers/{id}/adGroupCriteria:mutate
POST /v18/customers/{id}/assets:mutate
POST /v18/customers/{id}/campaignAssets:mutate
```

Request body:
```json
{
  "operations": [
    { "create": { <resource_fields> } },
    { "update": { "resourceName": "customers/123/campaigns/456", <fields> }, "updateMask": "status" }
  ]
}
```

Response:
```json
{
  "results": [
    { "resourceName": "customers/123/campaigns/456" }
  ]
}
```

### Resource name pattern

All resources follow: `customers/{customer_id_no_dashes}/{resourceType}/{id}`

Examples:
```
customers/7955095597/campaigns/1234567890
customers/7955095597/campaignBudgets/9876543210
customers/7955095597/adGroups/1111111111
customers/7955095597/campaignCriteria/1234567890~criterion_id
```

---

## Credential lookup pattern

Every tool needs credentials. The pattern is:

1. Get `tenant` by ID → extract `tenant.GoogleAdsID` (customer account to query)
2. Get `integration` for tenant+provider via `integrationRepo.GetForTenant(ctx, tenantID, "google_ads")`
3. Call `integration.GoogleAdsCredentials()` → returns `*domain.GoogleAdsCreds`

The `domain.GoogleAdsCreds` struct (already in `internal/domain/integration.go`):
```go
type GoogleAdsCreds struct {
    ClientID        string
    ClientSecret    string
    DeveloperToken  string
    LoginCustomerID string  // empty string if direct account (not MCC)
    RefreshToken    string
}
```

The connector factory receives both the tenant (for `google_ads_id`) and the credentials.

---

## Files to create

```
backend/internal/connector/googleads/
  client.go      — GoogleAdsClient: token refresh + HTTP requests
  query.go       — Query(gaql) → []map[string]any, paginates automatically
  mutate.go      — Mutate(endpoint, operations) → []string (resource names)
  campaigns.go   — read operations: GetLiveMetrics, GetCriteria, GetSearchTerms, GetAdGroups
  mutations.go   — write operations: AddNegativeKeywords, UpdateBudget, SetWeekdaySchedule,
                    AddAdGroupKeywords, AddExtensions, SetCampaignStatus
  collect.go     — CollectDailyMetrics (replaces collect_daily_metrics stub)
  consolidate.go — ConsolidateMonthly (replaces consolidate_monthly stub, no API call)
```

Update these files:
```
backend/internal/mcp/tools/ads.go           — replace stubs with real implementations
backend/internal/mcp/tools/monitoring.go    — replace collect/consolidate stubs
backend/internal/repository/agent_run.go    — add Log() method
backend/.mcp.json (project root)            — update URL to Go backend
```

No new migrations needed. No changes to the frontend.

---

## Step 1 — Google Ads client

### `internal/connector/googleads/client.go`

```go
package googleads

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/rush-maestro/rush-maestro/internal/domain"
)

const adsAPIBase = "https://googleads.googleapis.com/v18"

type Client struct {
	creds      domain.GoogleAdsCreds
	customerID string // numeric, no dashes, e.g. "7955095597"

	mu          sync.Mutex
	accessToken string
	tokenExpiry time.Time
}

// NewClient creates a Google Ads client for a specific customer account.
// customerID is the account to query (e.g. "795-509-5597" — dashes are stripped).
// creds contains OAuth credentials obtained from the integrations table.
func NewClient(customerID string, creds domain.GoogleAdsCreds) *Client {
	return &Client{
		creds:      creds,
		customerID: strings.ReplaceAll(customerID, "-", ""),
	}
}

// accessTokenFresh returns a valid access token, refreshing if expired.
func (c *Client) accessTokenFresh(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.accessToken != "" && time.Now().Before(c.tokenExpiry.Add(-30*time.Second)) {
		return c.accessToken, nil
	}
	return c.refresh(ctx)
}

func (c *Client) refresh(ctx context.Context) (string, error) {
	body := url.Values{
		"client_id":     {c.creds.ClientID},
		"client_secret": {c.creds.ClientSecret},
		"refresh_token": {c.creds.RefreshToken},
		"grant_type":    {"refresh_token"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://oauth2.googleapis.com/token",
		strings.NewReader(body.Encode()),
	)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("token refresh: %w", err)
	}
	defer resp.Body.Close()

	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("token decode: %w", err)
	}
	if tok.Error != "" {
		return "", fmt.Errorf("token error: %s — %s", tok.Error, tok.ErrorDesc)
	}
	c.accessToken = tok.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(tok.ExpiresIn) * time.Second)
	return c.accessToken, nil
}

// headers builds the required headers for every Google Ads API call.
func (c *Client) headers(ctx context.Context) (http.Header, error) {
	token, err := c.accessTokenFresh(ctx)
	if err != nil {
		return nil, err
	}
	h := http.Header{}
	h.Set("Authorization", "Bearer "+token)
	h.Set("developer-token", c.creds.DeveloperToken)
	h.Set("Content-Type", "application/json")
	if c.creds.LoginCustomerID != "" {
		h.Set("login-customer-id", strings.ReplaceAll(c.creds.LoginCustomerID, "-", ""))
	}
	return h, nil
}

// do executes an authenticated HTTP request and returns the response body.
func (c *Client) do(ctx context.Context, method, path string, body io.Reader) ([]byte, error) {
	headers, err := c.headers(ctx)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, adsAPIBase+path, body)
	if err != nil {
		return nil, err
	}
	req.Header = headers

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("google ads api: %w", err)
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("google ads api %d: %s", resp.StatusCode, string(b))
	}
	return b, nil
}
```

---

## Step 2 — GAQL query executor

### `internal/connector/googleads/query.go`

```go
package googleads

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
)

// QueryResult is a single row from a GAQL search response.
// Fields are nested maps mirroring the GAQL selector path.
// e.g. row["campaign"]["id"] = "456"
type QueryResult map[string]any

// Query executes a GAQL query and returns all rows, automatically paginating.
// Collects up to 20 pages (safety limit).
func (c *Client) Query(ctx context.Context, gaql string) ([]QueryResult, error) {
	var all []QueryResult
	var pageToken string

	for page := 0; page < 20; page++ {
		payload := map[string]any{"query": gaql}
		if pageToken != "" {
			payload["pageToken"] = pageToken
		}

		body, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}

		data, err := c.do(ctx, "POST",
			fmt.Sprintf("/customers/%s/googleAds:search", c.customerID),
			bytes.NewReader(body),
		)
		if err != nil {
			return nil, err
		}

		var resp struct {
			Results       []QueryResult `json:"results"`
			NextPageToken string        `json:"nextPageToken"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return nil, fmt.Errorf("query parse: %w", err)
		}

		all = append(all, resp.Results...)
		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}
	return all, nil
}

// str safely extracts a string value from a nested map using dot-path notation.
// Example: str(row, "campaign", "id") → "456"
func str(row QueryResult, keys ...string) string {
	var cur any = map[string]any(row)
	for _, k := range keys {
		m, ok := cur.(map[string]any)
		if !ok {
			return ""
		}
		cur = m[k]
	}
	if cur == nil {
		return ""
	}
	switch v := cur.(type) {
	case string:
		return v
	case float64:
		return fmt.Sprintf("%.0f", v)
	default:
		return fmt.Sprintf("%v", v)
	}
}

// num safely extracts a float64 from a nested map.
func num(row QueryResult, keys ...string) float64 {
	var cur any = map[string]any(row)
	for _, k := range keys {
		m, ok := cur.(map[string]any)
		if !ok {
			return 0
		}
		cur = m[k]
	}
	switch v := cur.(type) {
	case float64:
		return v
	case string:
		var f float64
		fmt.Sscanf(v, "%f", &f)
		return f
	}
	return 0
}

// fromMicros converts micros to BRL float.
func fromMicros(m float64) float64 { return m / 1_000_000 }

// micros converts BRL float to micros int64.
func micros(brl float64) int64 { return int64(brl * 1_000_000) }
```

---

## Step 3 — Mutation executor

### `internal/connector/googleads/mutate.go`

```go
package googleads

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
)

// MutateResponse contains the resource names of created/updated resources.
type MutateResponse struct {
	Results []struct {
		ResourceName string `json:"resourceName"`
	} `json:"results"`
	MutateOperationResponses []map[string]any `json:"mutateOperationResponses"` // for batch mutate
}

// Mutate sends operations to a resource-specific mutate endpoint.
// endpoint example: "/customers/123/campaignCriteria:mutate"
// operations: slice of maps with "create", "update", or "remove" keys.
func (c *Client) Mutate(ctx context.Context, endpoint string, operations []map[string]any) (*MutateResponse, error) {
	payload := map[string]any{"operations": operations}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	data, err := c.do(ctx, "POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	var resp MutateResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("mutate parse: %w", err)
	}
	return &resp, nil
}

// BatchMutate sends a single googleAds:mutate request with mixed resource types.
// Used for add_campaign_extensions which needs to create assets + link them in one call.
func (c *Client) BatchMutate(ctx context.Context, mutateOps []map[string]any) (*MutateResponse, error) {
	payload := map[string]any{"mutateOperations": mutateOps}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	data, err := c.do(ctx, "POST",
		fmt.Sprintf("/customers/%s/googleAds:mutate", c.customerID),
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}

	var resp MutateResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("batch mutate parse: %w", err)
	}
	return &resp, nil
}

// rn builds a resource name string.
// rn("campaigns", id) → "customers/7955095597/campaigns/456"
func (c *Client) rn(resourceType, id string) string {
	return fmt.Sprintf("customers/%s/%s/%s", c.customerID, resourceType, id)
}
```

---

## Step 4 — Read operations

### `internal/connector/googleads/campaigns.go`

Implement five read functions. Each runs one or more GAQL queries and maps rows
to clean structs returned to the MCP tool handlers.

#### `GetLiveMetrics(ctx) ([]CampaignMetric, error)`

GAQL (exact, from TypeScript):
```sql
SELECT campaign.id, campaign.name, campaign.status,
       metrics.impressions, metrics.clicks, metrics.cost_micros
FROM campaign
WHERE campaign.status != 'REMOVED'
ORDER BY campaign.name
LIMIT 50
```

Return struct:
```go
type CampaignMetric struct {
    ID          string `json:"id"`
    Name        string `json:"name"`
    Status      string `json:"status"`
    Impressions string `json:"impressions"`
    Clicks      string `json:"clicks"`
    Cost        string `json:"cost"` // "R$123.45"
}
```

Mapping:
```go
CampaignMetric{
    ID:          str(row, "campaign", "id"),
    Name:        str(row, "campaign", "name"),
    Status:      mapCampaignStatus(str(row, "campaign", "status")),
    Impressions: str(row, "metrics", "impressions"),
    Clicks:      str(row, "metrics", "clicks"),
    Cost:        fmt.Sprintf("%.2f", fromMicros(num(row, "metrics", "costMicros"))),
}
```

**Note on field names:** The REST API uses camelCase in JSON responses
(`costMicros`, not `cost_micros`). The GAQL selector uses snake_case for field names,
but the JSON response uses camelCase for the field values within each resource object.
Use `str(row, "metrics", "costMicros")` not `"cost_micros"`.

Status mapping:
```go
func mapCampaignStatus(raw string) string {
    switch raw {
    case "2", "ENABLED":  return "ENABLED"
    case "3", "PAUSED":   return "PAUSED"
    case "4", "REMOVED":  return "REMOVED"
    default:              return raw
    }
}
```

#### `GetCriteria(ctx, campaignID string) ([]map[string]any, error)`

GAQL (exact):
```sql
SELECT
    campaign_criterion.criterion_id,
    campaign_criterion.type,
    campaign_criterion.negative,
    campaign_criterion.bid_modifier,
    campaign_criterion.keyword.text,
    campaign_criterion.keyword.match_type,
    campaign_criterion.ad_schedule.day_of_week,
    campaign_criterion.ad_schedule.start_hour,
    campaign_criterion.ad_schedule.end_hour,
    campaign_criterion.location.geo_target_constant,
    campaign_criterion.device.type
FROM campaign_criterion
WHERE campaign.id = %s
```

Use `fmt.Sprintf` to embed `campaignID` in the GAQL string.
Return `[]map[string]any` — extract the `"campaignCriterion"` key from each row.

#### `GetSearchTerms(ctx, campaignID string, days int) ([]SearchTerm, error)`

GAQL:
```sql
SELECT
    search_term_view.search_term,
    search_term_view.status,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions
FROM search_term_view
WHERE campaign.id = %s
  AND segments.date >= "%s"
ORDER BY metrics.impressions DESC
LIMIT 100
```

Date calculation: `time.Now().AddDate(0, 0, -days).Format("20060102")` (YYYYMMDD, no dashes).

Return struct:
```go
type SearchTerm struct {
    Term        string  `json:"term"`
    Status      string  `json:"status"`
    Impressions float64 `json:"impressions"`
    Clicks      float64 `json:"clicks"`
    Cost        string  `json:"cost"` // "R$12.34"
    Conversions float64 `json:"conversions"`
}
```

#### `GetAdGroups(ctx, campaignID string, days int) ([]AdGroupRow, error)`

GAQL:
```sql
SELECT
    ad_group.id,
    ad_group.name,
    ad_group.status,
    ad_group.resource_name,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions
FROM ad_group
WHERE campaign.id = %s
  AND segments.date >= "%s"
ORDER BY metrics.impressions DESC
```

Return struct:
```go
type AdGroupRow struct {
    ID           string  `json:"id"`
    Name         string  `json:"name"`
    Status       string  `json:"status"`
    ResourceName string  `json:"resource_name"`
    Impressions  float64 `json:"impressions"`
    Clicks       float64 `json:"clicks"`
    Cost         string  `json:"cost"`
    Conversions  float64 `json:"conversions"`
}
```

---

## Step 5 — Write operations

### `internal/connector/googleads/mutations.go`

#### `AddNegativeKeywords(ctx, campaignID string, keywords []string, matchType string) (int, error)`

Match type enum mapping (REST API uses string enum names):
```go
var keywordMatchType = map[string]string{
    "broad":  "BROAD",
    "phrase": "PHRASE",
    "exact":  "EXACT",
}
```

Operations (one per keyword):
```go
map[string]any{
    "create": map[string]any{
        "campaign": c.rn("campaigns", campaignID),
        "negative": true,
        "keyword": map[string]any{
            "text":      text,
            "matchType": keywordMatchType[matchType],
        },
    },
}
```

Endpoint: `/customers/{id}/campaignCriteria:mutate`

#### `UpdateBudget(ctx, budgetID string, amountBRL float64) error`

Operation:
```go
map[string]any{
    "update": map[string]any{
        "resourceName": c.rn("campaignBudgets", budgetID),
        "amountMicros": micros(amountBRL),
    },
    "updateMask": "amount_micros",
}
```

Endpoint: `/customers/{id}/campaignBudgets:mutate`

#### `SetWeekdaySchedule(ctx, campaignID string) (int, error)`

Five operations (Monday–Friday), each:
```go
map[string]any{
    "create": map[string]any{
        "campaign": c.rn("campaigns", campaignID),
        "adSchedule": map[string]any{
            "dayOfWeek":   day,   // "MONDAY", "TUESDAY", etc.
            "startHour":   0,
            "startMinute": "ZERO",
            "endHour":     24,
            "endMinute":   "ZERO",
        },
    },
}
```

Days: `[]string{"MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"}`
Endpoint: `/customers/{id}/campaignCriteria:mutate`

#### `AddAdGroupKeywords(ctx, adGroupResourceName string, keywords []AdGroupKeyword) (int, error)`

```go
type AdGroupKeyword struct {
    Text      string
    MatchType string // "broad", "phrase", "exact"
}
```

Operations:
```go
map[string]any{
    "create": map[string]any{
        "adGroup": adGroupResourceName,
        "status":  "ENABLED",
        "keyword": map[string]any{
            "text":      kw.Text,
            "matchType": keywordMatchType[kw.MatchType],
        },
    },
}
```

Endpoint: `/customers/{id}/adGroupCriteria:mutate`

#### `AddExtensions(ctx, campaignID string, callouts []string, sitelinks []Sitelink) (int, int, error)`

```go
type Sitelink struct {
    Text  string
    Desc1 string
    Desc2 string
    URL   string
}
```

**Two-phase operation using `BatchMutate`:**

Phase 1 — create assets:
```go
// Callout asset
map[string]any{
    "assetOperation": map[string]any{
        "create": map[string]any{
            "calloutAsset": map[string]any{"calloutText": text},
        },
    },
}

// Sitelink asset
map[string]any{
    "assetOperation": map[string]any{
        "create": map[string]any{
            "finalUrls":    []string{sl.URL},
            "sitelinkAsset": map[string]any{
                "linkText":     sl.Text,
                "description1": sl.Desc1,
                "description2": sl.Desc2,
            },
        },
    },
}
```

Phase 2 — link assets to campaign:
```go
// After phase 1, extract resourceNames from MutateOperationResponses
// Then for each resourceName:
map[string]any{
    "campaignAssetOperation": map[string]any{
        "create": map[string]any{
            "campaign":  c.rn("campaigns", campaignID),
            "asset":     assetResourceName,
            "fieldType": "CALLOUT",  // or "SITELINK"
        },
    },
}
```

**Note on BatchMutate response:** `MutateOperationResponses` is a list of objects
where each has a key like `"assetResult"`, `"campaignAssetResult"`, etc.
Extract `resourceName` from `assetResult.resourceName`.

#### `SetCampaignStatus(ctx, campaignID, status string) error`

Status values: `"ENABLED"` or `"PAUSED"` (passed directly as strings).

Operation:
```go
map[string]any{
    "update": map[string]any{
        "resourceName": c.rn("campaigns", campaignID),
        "status":       status,
    },
    "updateMask": "status",
}
```

Endpoint: `/customers/{id}/campaigns:mutate`

---

## Step 6 — `collect_daily_metrics`

### `internal/connector/googleads/collect.go`

This is the most complex function. Port exactly from `monitoring.ts`.

```go
package googleads

import (
	"context"
	"fmt"
	"time"

	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/repository"
)

// MonitoringDefaults are applied when the tenant has no ads_monitoring config.
var MonitoringDefaults = domain.AdsMonitoringConfig{
	TargetCPABRL:             100.0,
	NoConversionAlertDays:    3,
	MaxCPAMultiplier:         1.5,
	MinDailyImpressions:      50,
	BudgetUnderpaceThreshold: 0.5,
}

type CollectResult struct {
	Date               string               `json:"date"`
	CampaignsProcessed int                  `json:"campaigns_processed"`
	Summary            []CampaignCollectRow `json:"summary"`
}

type CampaignCollectRow struct {
	Campaign    string   `json:"campaign"`
	Cost        string   `json:"cost"`
	Conversions float64  `json:"conversions"`
	Alerts      []string `json:"alerts"`
}

// CollectDailyMetrics fetches Google Ads metrics for targetDate and stores them
// in PostgreSQL. Generates alerts for WARN/CRITICAL conditions.
// Equivalent to the TypeScript collect_daily_metrics MCP tool.
func CollectDailyMetrics(
	ctx context.Context,
	client *Client,
	tenant *domain.Tenant,
	targetDate string, // YYYY-MM-DD
	metricsRepo *repository.MetricsRepository,
	alertRepo *repository.AlertRepository,
	agentRunRepo *repository.AgentRunRepository,
) (*CollectResult, error) {
	cfg := MonitoringDefaults
	if tenant.AdsMonitoring != nil {
		// merge: override defaults with tenant config
		if tenant.AdsMonitoring.TargetCPABRL > 0 { cfg.TargetCPABRL = tenant.AdsMonitoring.TargetCPABRL }
		if tenant.AdsMonitoring.NoConversionAlertDays > 0 { cfg.NoConversionAlertDays = tenant.AdsMonitoring.NoConversionAlertDays }
		if tenant.AdsMonitoring.MaxCPAMultiplier > 0 { cfg.MaxCPAMultiplier = tenant.AdsMonitoring.MaxCPAMultiplier }
		if tenant.AdsMonitoring.MinDailyImpressions > 0 { cfg.MinDailyImpressions = tenant.AdsMonitoring.MinDailyImpressions }
		if tenant.AdsMonitoring.BudgetUnderpaceThreshold > 0 { cfg.BudgetUnderpaceThreshold = tenant.AdsMonitoring.BudgetUnderpaceThreshold }
	}

	// ── Query 1: all non-removed campaigns (no date filter — always returns rows) ──
	campaignsRaw, err := client.Query(ctx, `
		SELECT campaign.id, campaign.name, campaign.status,
		       campaign.serving_status, campaign_budget.amount_micros
		FROM campaign WHERE campaign.status != 'REMOVED'
	`)
	if err != nil { return nil, err }

	// ── Query 2: metrics for targetDate ──
	metricsRaw, err := client.Query(ctx, fmt.Sprintf(`
		SELECT campaign.id, metrics.impressions, metrics.clicks,
		       metrics.cost_micros, metrics.conversions
		FROM campaign
		WHERE campaign.status != 'REMOVED' AND segments.date = '%s'
	`, targetDate))
	if err != nil { return nil, err }

	// Build lookup map: campaign_id → metrics row
	metricsById := map[string]QueryResult{}
	for _, row := range metricsRaw {
		id := str(row, "campaign", "id")
		metricsById[id] = row
	}

	var summary []CampaignCollectRow
	parsedDate, _ := time.Parse("2006-01-02", targetDate)

	for _, camp := range campaignsRaw {
		campaignID   := str(camp, "campaign", "id")
		campaignName := str(camp, "campaign", "name")
		budgetMicros := num(camp, "campaignBudget", "amountMicros")
		campaignStatus := str(camp, "campaign", "status")

		m := metricsById[campaignID]
		impressions := num(m, "metrics", "impressions")
		clicks      := num(m, "metrics", "clicks")
		costMicros  := num(m, "metrics", "costMicros")
		conversions := num(m, "metrics", "conversions")

		// ── Query 3: last 7 days history for conversion streak ──
		historyRaw, _ := client.Query(ctx, fmt.Sprintf(`
			SELECT segments.date, campaign.status, campaign.serving_status,
			       metrics.impressions, metrics.conversions
			FROM campaign
			WHERE campaign.id = %s AND segments.date DURING LAST_7_DAYS
			ORDER BY segments.date DESC
		`, campaignID))

		// ── Alert logic ──
		var alerts []string

		if mapCampaignStatus(campaignStatus) == "ENABLED" {
			// no_conversions_streak: count consecutive ENABLED days with no conversions
			streak := 0
			for _, h := range historyRaw {
				if mapCampaignStatus(str(h, "campaign", "status")) == "ENABLED" &&
					num(h, "metrics", "impressions") > 0 {
					if num(h, "metrics", "conversions") > 0 { break }
					streak++
				}
			}
			if streak >= cfg.NoConversionAlertDays {
				level := "WARN"
				if streak >= cfg.NoConversionAlertDays*2 { level = "CRITICAL" }
				msg := fmt.Sprintf("%d days without conversion", streak)
				alerts = append(alerts, fmt.Sprintf("[%s] no_conversions_streak: %s", level, msg))
				_ = alertRepo.Create(ctx, repository.AlertEvent{
					ID:           domain.NewID(),
					TenantID:     tenant.ID,
					Level:        level,
					Type:         "no_conversions_streak",
					CampaignID:   &campaignID,
					CampaignName: &campaignName,
					Message:      msg,
				})
			}

			// high_cpa
			if conversions > 0 {
				cpaBRL := fromMicros(costMicros) / conversions
				if cpaBRL > cfg.TargetCPABRL*cfg.MaxCPAMultiplier {
					pct := (cpaBRL/cfg.TargetCPABRL - 1) * 100
					msg := fmt.Sprintf("CPA R$%.2f — %.0f%% above target (R$%.2f)", cpaBRL, pct, cfg.TargetCPABRL)
					alerts = append(alerts, "[WARN] high_cpa: "+msg)
					_ = alertRepo.Create(ctx, repository.AlertEvent{
						ID:           domain.NewID(),
						TenantID:     tenant.ID,
						Level:        "WARN",
						Type:         "high_cpa",
						CampaignID:   &campaignID,
						CampaignName: &campaignName,
						Message:      msg,
					})
				}
			}

			// budget_underpace (INFO only — no alert_event row)
			if budgetMicros > 0 && impressions > 0 {
				pace := costMicros / budgetMicros
				if pace < cfg.BudgetUnderpaceThreshold {
					alerts = append(alerts, fmt.Sprintf(
						"[INFO] budget_underpace: pacing %.0f%%", pace*100))
				}
			}

			// low_impressions (INFO only)
			if impressions > 0 && impressions < float64(cfg.MinDailyImpressions) {
				alerts = append(alerts, fmt.Sprintf(
					"[INFO] low_impressions: %.0f impressions", impressions))
			}
		}

		// ── Upsert daily_metrics ──
		var cpaBRL *float64
		if conversions > 0 {
			v := fromMicros(costMicros) / conversions
			cpaBRL = &v
		}
		var ctr *float64
		if impressions > 0 {
			v := clicks / impressions
			ctr = &v
		}

		_ = metricsRepo.UpsertDaily(ctx, repository.DailyMetric{
			ID:           domain.NewID(),
			TenantID:     tenant.ID,
			Date:         parsedDate,
			CampaignID:   campaignID,
			CampaignName: campaignName,
			Impressions:  int32(impressions),
			Clicks:       int32(clicks),
			CostBRL:      fromMicros(costMicros),
			Conversions:  conversions,
			CPABRL:       cpaBRL,
			CTR:          ctr,
		})

		summary = append(summary, CampaignCollectRow{
			Campaign:    campaignName,
			Cost:        fmt.Sprintf("R$%.2f", fromMicros(costMicros)),
			Conversions: conversions,
			Alerts:      alerts,
		})
	}

	_ = agentRunRepo.Log(ctx, tenant.ID, "collect_daily_metrics", "success",
		fmt.Sprintf("date=%s campaigns=%d", targetDate, len(summary)))

	return &CollectResult{
		Date:               targetDate,
		CampaignsProcessed: len(summary),
		Summary:            summary,
	}, nil
}
```

**Note on schema difference from TypeScript:** The TypeScript version stored `ad_groups`
and `alerts` as JSON columns in SQLite's `daily_metrics`. The PostgreSQL schema does not
have these columns. Alerts go to the `alert_events` table. `ad_groups` data is not
persisted — agents can query it live via `get_ad_groups` if needed.

---

## Step 7 — `consolidate_monthly`

### `internal/connector/googleads/consolidate.go`

This function does NOT call Google Ads API. It reads from PostgreSQL `daily_metrics`
and writes to `monthly_summary`.

```go
package googleads

import (
	"context"
	"fmt"
	"time"

	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/repository"
)

type ConsolidateResult struct {
	Month              string                `json:"month"`
	CampaignsProcessed int                   `json:"campaigns_processed"`
	Results            []CampaignMonthlyRow  `json:"results"`
}

type CampaignMonthlyRow struct {
	CampaignID  string  `json:"campaign_id"`
	Cost        string  `json:"cost"`
	Conversions float64 `json:"conversions"`
	Clicks      int32   `json:"clicks"`
	Impressions int32   `json:"impressions"`
	DaysActive  int     `json:"days_active"`
	CPA         string  `json:"cpa"`
}

// ConsolidateMonthly aggregates daily_metrics for targetMonth into monthly_summary.
// targetMonth format: "YYYY-MM"
func ConsolidateMonthly(
	ctx context.Context,
	tenantID string,
	targetMonth string,
	metricsRepo *repository.MetricsRepository,
	agentRunRepo *repository.AgentRunRepository,
) (*ConsolidateResult, error) {
	// Parse month bounds
	start, err := time.Parse("2006-01", targetMonth)
	if err != nil { return nil, fmt.Errorf("invalid month format: %s", targetMonth) }
	end := start.AddDate(0, 1, 0) // first day of next month

	// Get all daily metrics for this tenant in this month
	days, err := metricsRepo.GetHistory(ctx, tenantID, start)
	if err != nil { return nil, err }

	// Filter to targetMonth only (GetHistory returns from 'since' to now, so filter end)
	var monthDays []repository.DailyMetric
	for _, d := range days {
		if !d.Date.Before(start) && d.Date.Before(end) {
			monthDays = append(monthDays, d)
		}
	}

	if len(monthDays) == 0 {
		_ = agentRunRepo.Log(ctx, tenantID, "consolidate_monthly", "success",
			fmt.Sprintf("month=%s no_data", targetMonth))
		return &ConsolidateResult{Month: targetMonth, CampaignsProcessed: 0}, nil
	}

	// Group by campaign_id
	type campaignAgg struct {
		name        string
		totalCost   float64
		totalConv   float64
		totalClicks int32
		totalImpr   int32
		daysActive  int
	}
	byID := map[string]*campaignAgg{}
	for _, d := range monthDays {
		agg := byID[d.CampaignID]
		if agg == nil {
			agg = &campaignAgg{name: d.CampaignName}
			byID[d.CampaignID] = agg
		}
		agg.totalCost  += d.CostBRL
		agg.totalConv  += d.Conversions
		agg.totalClicks += d.Clicks
		agg.totalImpr  += d.Impressions
		if d.Impressions > 0 { agg.daysActive++ }
	}

	var results []CampaignMonthlyRow
	for campaignID, agg := range byID {
		var avgCPA *float64
		cpaStr := "N/A"
		if agg.totalConv > 0 {
			v := agg.totalCost / agg.totalConv
			avgCPA = &v
			cpaStr = fmt.Sprintf("R$%.2f", v)
		}

		_ = metricsRepo.UpsertMonthly(ctx, repository.MonthlySummary{
			ID:           domain.NewID(),
			TenantID:     tenantID,
			Month:        targetMonth,
			CampaignID:   campaignID,
			CampaignName: agg.name,
			Impressions:  agg.totalImpr,
			Clicks:       agg.totalClicks,
			CostBRL:      agg.totalCost,
			Conversions:  agg.totalConv,
			AvgCPABRL:    avgCPA,
		})

		results = append(results, CampaignMonthlyRow{
			CampaignID:  campaignID,
			Cost:        fmt.Sprintf("R$%.2f", agg.totalCost),
			Conversions: agg.totalConv,
			Clicks:      agg.totalClicks,
			Impressions: agg.totalImpr,
			DaysActive:  agg.daysActive,
			CPA:         cpaStr,
		})
	}

	_ = agentRunRepo.Log(ctx, tenantID, "consolidate_monthly", "success",
		fmt.Sprintf("month=%s campaigns=%d", targetMonth, len(results)))

	return &ConsolidateResult{
		Month:              targetMonth,
		CampaignsProcessed: len(results),
		Results:            results,
	}, nil
}
```

---

## Step 8 — Add `AgentRunRepository.Log`

The `collect` and `consolidate` functions call `agentRunRepo.Log(ctx, tenantID, agent, status, summary)`.
This method doesn't exist yet. Add it to `backend/internal/repository/agent_run.go`:

```go
func (r *AgentRunRepository) Log(ctx context.Context, tenantID, agent, status, summary string) error {
	now := time.Now()
	id := domain.NewID()

	var tenantIDPtr *string
	if tenantID != "" {
		tenantIDPtr = &tenantID
	}

	_, err := r.pool.Exec(ctx,
		`INSERT INTO agent_runs (id, tenant_id, agent, status, started_at, finished_at, summary)
		 VALUES ($1, $2, $3, $4, $5, $5, $6)`,
		id, tenantIDPtr, agent, status, now, summary,
	)
	return err
}
```

Add required import: `"github.com/rush-maestro/rush-maestro/internal/domain"`.

---

## Step 9 — Fill in MCP tool stubs

### Update `internal/mcp/tools/ads.go`

Change `RegisterAdsTools` signature to accept repo interfaces and a client factory:

```go
// AdsClientFactory returns a configured Google Ads client for a given tenant.
// Returns an error if the tenant has no connected Google Ads integration.
type AdsClientFactory func(ctx context.Context, tenantID string) (*googleads.Client, *domain.Tenant, error)

func RegisterAdsTools(s *mcp.Server, factory AdsClientFactory) { ... }
```

The factory is implemented in `internal/mcp/setup.go`:

```go
func makeAdsFactory(tenantRepo *repository.TenantRepository, integrationRepo *repository.IntegrationRepository) tools.AdsClientFactory {
	return func(ctx context.Context, tenantID string) (*googleads.Client, *domain.Tenant, error) {
		tenant, err := tenantRepo.GetByID(ctx, tenantID)
		if err != nil {
			return nil, nil, fmt.Errorf("tenant %q not found", tenantID)
		}
		if tenant.GoogleAdsID == nil || *tenant.GoogleAdsID == "" {
			return nil, nil, fmt.Errorf("tenant %q has no google_ads_id", tenantID)
		}
		integration, err := integrationRepo.GetForTenant(ctx, tenantID, "google_ads")
		if err != nil {
			return nil, nil, fmt.Errorf("no connected Google Ads integration for tenant %q", tenantID)
		}
		creds := integration.GoogleAdsCredentials()
		if creds == nil {
			return nil, nil, fmt.Errorf("Google Ads integration for tenant %q is missing credentials", tenantID)
		}
		return googleads.NewClient(*tenant.GoogleAdsID, *creds), tenant, nil
	}
}
```

Replace each stub with a real implementation. Example for `get_live_metrics`:

```go
s.RegisterTool("get_live_metrics",
	"Query live campaign metrics from Google Ads API",
	map[string]any{"type": "object",
		"properties": map[string]any{"tenant_id": map[string]any{"type": "string"}},
		"required": []string{"tenant_id"}},
	func(ctx context.Context, args json.RawMessage) mcp.ToolResult {
		var p struct{ TenantID string `json:"tenant_id"` }
		json.Unmarshal(args, &p)
		client, _, err := factory(ctx, p.TenantID)
		if err != nil { return mcp.ErrResult(err.Error()) }
		metrics, err := client.GetLiveMetrics(ctx)
		if err != nil { return mcp.ErrResult(err.Error()) }
		return mcp.Ok(metrics)
	},
)
```

Follow the same pattern for all 10 ads tools, calling the corresponding `campaigns.go`
or `mutations.go` function.

### Update `internal/mcp/tools/monitoring.go`

Change `RegisterMonitoringTools` to accept a factory plus `alertRepo` and `agentRunRepo`:

```go
type MonitoringRepos struct {
	Metrics    *repository.MetricsRepository
	Alerts     *repository.AlertRepository
	AgentRuns  *repository.AgentRunRepository
	AdsFactory AdsClientFactory // shared with ads tools
	TenantRepo *repository.TenantRepository
}
```

Replace `collect_daily_metrics` stub:
```go
s.RegisterTool("collect_daily_metrics", ...,
	func(ctx context.Context, args json.RawMessage) mcp.ToolResult {
		var p struct {
			TenantID string `json:"tenant_id"`
			Date     string `json:"date"`
		}
		json.Unmarshal(args, &p)
		if p.Date == "" {
			yesterday := time.Now().AddDate(0, 0, -1)
			p.Date = yesterday.Format("2006-01-02")
		}
		client, tenant, err := repos.AdsFactory(ctx, p.TenantID)
		if err != nil { return mcp.ErrResult(err.Error()) }
		result, err := googleads.CollectDailyMetrics(
			ctx, client, tenant, p.Date,
			repos.Metrics, repos.Alerts, repos.AgentRuns,
		)
		if err != nil { return mcp.ErrResult(err.Error()) }
		return mcp.Ok(result)
	},
)
```

Replace `consolidate_monthly` stub:
```go
s.RegisterTool("consolidate_monthly", ...,
	func(ctx context.Context, args json.RawMessage) mcp.ToolResult {
		var p struct {
			TenantID string `json:"tenant_id"`
			Month    string `json:"month"`
		}
		json.Unmarshal(args, &p)
		if p.Month == "" {
			last := time.Now().AddDate(0, -1, 0)
			p.Month = last.Format("2006-01")
		}
		result, err := googleads.ConsolidateMonthly(
			ctx, p.TenantID, p.Month, repos.Metrics, repos.AgentRuns,
		)
		if err != nil { return mcp.ErrResult(err.Error()) }
		return mcp.Ok(result)
	},
)
```

---

## Step 10 — Wire in main.go

Update `NewRushMaestroServer` in `internal/mcp/setup.go` to pass the new dependencies:

```go
func NewRushMaestroServer(
	tenantRepo      *repository.TenantRepository,
	postRepo        *repository.PostRepository,
	reportRepo      *repository.ReportRepository,
	campaignRepo    *repository.CampaignRepository,
	alertRepo       *repository.AlertRepository,
	metricsRepo     *repository.MetricsRepository,
	integrationRepo *repository.IntegrationRepository,
	agentRunRepo    *repository.AgentRunRepository,
) *Server {
	s := NewServer("rush-maestro", "1.0.0")

	adsFactory := makeAdsFactory(tenantRepo, integrationRepo)

	tools.RegisterContentTools(s, tools.ContentRepos{...})
	tools.RegisterAdsTools(s, adsFactory)
	tools.RegisterMonitoringTools(s, tools.MonitoringRepos{
		Metrics:    metricsRepo,
		Alerts:     alertRepo,
		AgentRuns:  agentRunRepo,
		AdsFactory: adsFactory,
		TenantRepo: tenantRepo,
	})
	resources.RegisterTenantResources(s, ...)

	return s
}
```

In `cmd/server/main.go`, pass `integrationRepo` and `agentRunRepo` to `NewRushMaestroServer`.

---

## Step 11 — Update `.mcp.json`

After confirming `go build ./...` passes and the MCP tools work:

```json
{
  "mcpServers": {
    "marketing": {
      "type": "http",
      "url": "http://localhost:8181/mcp"
    }
  }
}
```

Note: `8181` is the dev port set via `PORT=8181` in `.env`. Adjust if your `.env` uses a different port.
After this change, agents will use the Go MCP. The TypeScript MCP at `:5173/mcp` is no longer needed
but can be left running — it will be removed in a later cleanup task.

---

## Step 12 — Smoke test with real credentials

With `make dev/backend` running (Go on `:8181`):

```bash
# 1. get_live_metrics with real tenant
curl -s -X POST http://localhost:8181/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_live_metrics","arguments":{"tenant_id":"portico"}}}' \
  | jq '.result.isError, (.result.content[0].text | fromjson | length)'
# Expected: false, <number of campaigns>

# 2. collect_daily_metrics for yesterday
curl -s -X POST http://localhost:8181/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"collect_daily_metrics","arguments":{"tenant_id":"portico"}}}' \
  | jq '.result.isError, (.result.content[0].text | fromjson | .campaigns_processed)'
# Expected: false, <number>

# 3. consolidate_monthly for last month
curl -s -X POST http://localhost:8181/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"consolidate_monthly","arguments":{"tenant_id":"portico"}}}' \
  | jq '.result.isError, (.result.content[0].text | fromjson | .campaigns_processed)'
# Expected: false, <number>

# 4. add_negative_keywords (dry-run: use a test campaign if available)
# Only run this if you have a test campaign — it modifies live data

# 5. Verify .mcp.json works by restarting the Claude Code session and checking tools
```

---

## Common pitfalls

### REST API field names are camelCase in responses
GAQL selectors use snake_case (`cost_micros`, `campaign.serving_status`) but the JSON
response from the REST API uses camelCase (`costMicros`, `servingStatus`). Always
use camelCase when accessing `QueryResult` via `str()` and `num()`.

### `segments.date DURING LAST_7_DAYS` vs date string
GAQL supports `DURING LAST_7_DAYS` as a built-in date range — use it as written.
For date-specific queries, use the string literal: `segments.date = 'YYYY-MM-DD'`.
The format in GAQL requires the value in single quotes.

### Campaign ID vs resource name
In GAQL `WHERE campaign.id = X`, `X` is the numeric campaign ID (without resource
name prefix). In mutations, you need the full resource name:
`customers/{customer_id}/campaigns/{campaign_id}`. Always use `c.rn("campaigns", id)`.

### login-customer-id header
Include only when `creds.LoginCustomerID != ""`. For direct (non-MCC) accounts,
omit the header entirely — passing an empty string causes a 400 error.

### `consolidate_monthly` reads from `start` date
`MetricsRepository.GetHistory` takes a `since time.Time` — pass the first day of
the target month (`time.Parse("2006-01", targetMonth)`). Then filter in Go to exclude
days on or after the first day of the next month.

### `update_campaign_budget` input field name
In TypeScript: `budget_id` (not `campaign_id`). The TypeScript tool does not take
`campaign_id` — it takes `budget_id` directly. The budget resource name is constructed
from the customer ID and the budget ID.

---

## Completion criteria

- [ ] `go build ./...` passes with zero errors
- [ ] `go vet ./...` passes
- [ ] `POST /mcp` → `tools/call` → `get_live_metrics` (tenant_id="portico") returns campaign list without `isError`
- [ ] `POST /mcp` → `tools/call` → `get_search_terms` returns search term data
- [ ] `POST /mcp` → `tools/call` → `collect_daily_metrics` stores rows in `daily_metrics` table
- [ ] After `collect_daily_metrics`, `SELECT count(*) FROM daily_metrics WHERE tenant_id='portico'` increases
- [ ] `POST /mcp` → `tools/call` → `consolidate_monthly` writes to `monthly_summary` table
- [ ] `POST /mcp` → `tools/call` → `get_metrics_history` returns data (via Go repo, not TypeScript)
- [ ] `POST /mcp` → `tools/call` → `add_negative_keywords` returns `{"added": N}` without `isError`
- [ ] `POST /mcp` → `tools/call` → `set_campaign_status` with `{"status":"PAUSED"}` returns without `isError`
- [ ] `agentRunRepo.Log` inserts a row into `agent_runs` (verify with `SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT 1`)
- [ ] `.mcp.json` updated to `http://localhost:8181/mcp`
- [ ] After Claude Code restart, `list_tenants` returns data from Go (not TypeScript)
- [ ] All 29 tools still present in `tools/list` response

---

## References

- TypeScript ads tools: `frontend/src/lib/server/mcp/tools/ads.ts`
- TypeScript monitoring tools: `frontend/src/lib/server/mcp/tools/monitoring.ts`
- TypeScript Google Ads client: `frontend/src/lib/server/googleAdsClient.ts`
- TypeScript getLiveCampaigns: `frontend/src/lib/server/googleAds.ts`
- Go integration domain: `backend/internal/domain/integration.go` (GoogleAdsCreds)
- Go integration repo: `backend/internal/repository/integration.go` (GetForTenant)
- Go metrics repo: `backend/internal/repository/metrics.go`
- Go alert repo: `backend/internal/repository/alert.go`
- Go agent run repo: `backend/internal/repository/agent_run.go`
- MCP server (T16): `backend/internal/mcp/`
- Previous task: T16 — MCP Server in Go
- Next task: T18 — LLM Connector
