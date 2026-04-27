# T16 — MCP Server in Go

**Status:** completed  
**Phase:** 5 — MCP  
**Estimate:** 6–8 hours  
**Depends on:** T13 (repository layer), T14 (Go API running), T15 (integrations)  
**Unlocks:** T17 (Google Ads connector — fills in the stubbed tools)  
**Parallel with:** nothing (touches main.go)

---

## Context

The current MCP server is TypeScript-based, served by the SvelteKit dev server at
`http://localhost:5173/mcp`. It lives in:

```
frontend/src/lib/server/mcp/
  server.ts                  — McpServer factory
  tools/content.ts           — 15 content tools (list_tenants, create_post, etc.)
  tools/ads.ts               — 10 Google Ads tools (read + write)
  tools/monitoring.ts        — 4 monitoring tools
  resources/tenants.ts       — 5 tenant resources
frontend/src/routes/mcp/+server.ts  — HTTP handler (POST + GET)
```

This task ports the MCP server to Go. The Go implementation lives entirely inside
the existing Go backend and is served at `POST /mcp` by the same process as the REST API.

**Tool split between T16 and T17:**
- **T16 (this task):** Implement tools that only need the existing Go repository layer
  (content tools + monitoring read tools). Stub tools that require the Google Ads
  connector with a clear "not implemented" error.
- **T17 (next task):** Fill in the Google Ads connector and replace the stubs with real
  implementations.

**Migration of `.mcp.json`:** Do NOT update `.mcp.json` in this task. The TypeScript
MCP at `:5173/mcp` continues to serve agents until T17 completes. The `.mcp.json`
update happens at the end of T17 (a single line change).

---

## MCP Protocol — what you need to know

The MCP Streamable HTTP protocol (version `2024-11-05`) is JSON-RPC 2.0 over HTTP.
No external library is needed. The full flow for a stateless server:

### Client sends `POST /mcp` with JSON-RPC 2.0 message

```json
// Step 1 — initialize (client sends; id may be null or omitted for notifications)
{ "jsonrpc": "2.0", "id": 1, "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "claude-code", "version": "1.0.0" }
  }
}

// Step 2 — notifications/initialized (no response expected)
{ "jsonrpc": "2.0", "method": "notifications/initialized" }

// Step 3 — tools/list
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }

// Step 4 — tools/call
{ "jsonrpc": "2.0", "id": 3, "method": "tools/call",
  "params": { "name": "list_tenants", "arguments": {} }
}

// resources/list, resources/read work the same way
```

### Server responses

```json
// initialize response
{ "jsonrpc": "2.0", "id": 1, "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": {}, "resources": {} },
    "serverInfo": { "name": "rush-maestro", "version": "1.0.0" }
  }
}

// tools/list response
{ "jsonrpc": "2.0", "id": 2, "result": {
    "tools": [
      { "name": "list_tenants",
        "description": "List all clients",
        "inputSchema": { "type": "object", "properties": {} }
      }
    ]
  }
}

// tools/call response (success)
{ "jsonrpc": "2.0", "id": 3, "result": {
    "content": [{ "type": "text", "text": "{...json output...}" }],
    "isError": false
  }
}

// tools/call response (tool error — NOT a JSON-RPC error)
{ "jsonrpc": "2.0", "id": 3, "result": {
    "content": [{ "type": "text", "text": "Tenant not found" }],
    "isError": true
  }
}

// JSON-RPC error (parsing failure, unknown method)
{ "jsonrpc": "2.0", "id": 3, "error": { "code": -32601, "message": "Method not found" } }
```

### Notifications (client → server, no response)
When a message has `"method"` but no `"id"`, it is a notification. Return HTTP 200
with empty body. Do not return a JSON-RPC response.

### GET /mcp
Claude Code may probe the GET endpoint. Return HTTP 405 Method Not Allowed.
No SSE streaming is needed for a stateless tool-only server.

---

## Files to create

```
backend/internal/mcp/
  server.go          — MCPServer struct, RegisterTool/Resource, ServeHTTP
  tools/
    content.go       — 15 content tools (all implemented)
    ads.go           — 10 Google Ads tools (all stubs for T17)
    monitoring.go    — 4 tools: 2 implemented (read), 2 stubs (T17)
  resources/
    tenants.go       — 5 tenant resources (all implemented)
backend/internal/api/
  mcp_handler.go     — thin HTTP adapter
```

One migration file:
```
backend/migrations/000015_api_keys.sql  — optional: per-tenant API key table (see Step 6)
```

---

## Step 1 — Core MCP server

### `internal/mcp/server.go`

```go
package mcp

import (
	"context"
	"encoding/json"
	"net/http"
)

// Server is the MCP server. Register tools and resources before serving.
type Server struct {
	name      string
	version   string
	tools     map[string]*toolDef
	resources map[string]*resourceDef
}

func NewServer(name, version string) *Server {
	return &Server{
		name:      name,
		version:   version,
		tools:     map[string]*toolDef{},
		resources: map[string]*resourceDef{},
	}
}

// --- Tool registration -------------------------------------------------------

type toolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
	handler     func(ctx context.Context, args json.RawMessage) toolResult
}

type toolResult struct {
	Content []contentItem `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

type contentItem struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func (s *Server) RegisterTool(name, description string, schema map[string]any,
	handler func(ctx context.Context, args json.RawMessage) toolResult) {
	s.tools[name] = &toolDef{
		Name:        name,
		Description: description,
		InputSchema: schema,
		handler:     handler,
	}
}

// ok wraps a value as a JSON text content result.
func ok(v any) toolResult {
	b, _ := json.MarshalIndent(v, "", "  ")
	return toolResult{Content: []contentItem{{Type: "text", Text: string(b)}}}
}

// errResult wraps an error string as an isError tool result.
func errResult(msg string) toolResult {
	return toolResult{Content: []contentItem{{Type: "text", Text: msg}}, IsError: true}
}

// --- Resource registration ---------------------------------------------------

type resourceDef struct {
	Name     string `json:"name"`
	URI      string `json:"uri"`       // static URI, e.g. "tenant://list"
	Template string `json:"uriTemplate,omitempty"` // RFC 6570, e.g. "tenant://{id}/brand"
	MimeType string `json:"mimeType"`
	handler  func(ctx context.Context, uri string, vars map[string]string) (string, error)
}

func (s *Server) RegisterResource(name, uri, mimeType string,
	handler func(ctx context.Context, uri string, vars map[string]string) (string, error)) {
	s.resources[uri] = &resourceDef{
		Name:     name,
		URI:      uri,
		MimeType: mimeType,
		handler:  handler,
	}
}

func (s *Server) RegisterResourceTemplate(name, uriTemplate, mimeType string,
	handler func(ctx context.Context, uri string, vars map[string]string) (string, error)) {
	s.resources[uriTemplate] = &resourceDef{
		Name:     name,
		Template: uriTemplate,
		MimeType: mimeType,
		handler:  handler,
	}
}

// --- HTTP handler ------------------------------------------------------------

type jsonRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id"` // number, string, or null
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type jsonRPCResponse struct {
	JSONRPC string `json:"jsonrpc"`
	ID      any    `json:"id,omitempty"`
	Result  any    `json:"result,omitempty"`
	Error   *rpcError `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		http.Error(w, "Use POST for MCP requests", http.StatusMethodNotAllowed)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req jsonRPCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeRPCError(w, nil, -32700, "Parse error")
		return
	}

	// Notifications have no id — acknowledge and return empty 200
	if req.ID == nil && req.Method != "" {
		w.WriteHeader(http.StatusOK)
		return
	}

	result, rpcErr := s.dispatch(r.Context(), &req)
	if rpcErr != nil {
		writeRPCError(w, req.ID, rpcErr.Code, rpcErr.Message)
		return
	}

	resp := jsonRPCResponse{JSONRPC: "2.0", ID: req.ID, Result: result}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Server) dispatch(ctx context.Context, req *jsonRPCRequest) (any, *rpcError) {
	switch req.Method {
	case "initialize":
		return s.handleInitialize(req.Params)
	case "tools/list":
		return s.handleToolsList()
	case "tools/call":
		return s.handleToolsCall(ctx, req.Params)
	case "resources/list":
		return s.handleResourcesList()
	case "resources/read":
		return s.handleResourcesRead(ctx, req.Params)
	default:
		return nil, &rpcError{Code: -32601, Message: "Method not found: " + req.Method}
	}
}

func (s *Server) handleInitialize(_ json.RawMessage) (any, *rpcError) {
	return map[string]any{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]any{"tools": map[string]any{}, "resources": map[string]any{}},
		"serverInfo":      map[string]any{"name": s.name, "version": s.version},
	}, nil
}

func (s *Server) handleToolsList() (any, *rpcError) {
	list := make([]map[string]any, 0, len(s.tools))
	for _, t := range s.tools {
		entry := map[string]any{
			"name":        t.Name,
			"description": t.Description,
		}
		if t.InputSchema != nil {
			entry["inputSchema"] = t.InputSchema
		} else {
			entry["inputSchema"] = map[string]any{"type": "object", "properties": map[string]any{}}
		}
		list = append(list, entry)
	}
	return map[string]any{"tools": list}, nil
}

func (s *Server) handleToolsCall(ctx context.Context, params json.RawMessage) (any, *rpcError) {
	var p struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &rpcError{Code: -32602, Message: "Invalid params"}
	}
	t, ok := s.tools[p.Name]
	if !ok {
		return nil, &rpcError{Code: -32602, Message: "Unknown tool: " + p.Name}
	}
	if p.Arguments == nil {
		p.Arguments = json.RawMessage("{}")
	}
	result := t.handler(ctx, p.Arguments)
	return result, nil
}

func (s *Server) handleResourcesList() (any, *rpcError) {
	list := make([]map[string]any, 0, len(s.resources))
	for _, res := range s.resources {
		entry := map[string]any{"name": res.Name, "mimeType": res.MimeType}
		if res.Template != "" {
			entry["uriTemplate"] = res.Template
		} else {
			entry["uri"] = res.URI
		}
		list = append(list, entry)
	}
	return map[string]any{"resources": list}, nil
}

func (s *Server) handleResourcesRead(ctx context.Context, params json.RawMessage) (any, *rpcError) {
	var p struct {
		URI string `json:"uri"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &rpcError{Code: -32602, Message: "Invalid params"}
	}

	// Try exact match first, then template match
	res := s.resolveResource(p.URI)
	if res == nil {
		return nil, &rpcError{Code: -32602, Message: "Resource not found: " + p.URI}
	}

	vars := extractTemplateVars(res.Template, p.URI)
	text, err := res.handler(ctx, p.URI, vars)
	if err != nil {
		return nil, &rpcError{Code: -32603, Message: err.Error()}
	}

	return map[string]any{
		"contents": []map[string]any{
			{"uri": p.URI, "mimeType": res.MimeType, "text": text},
		},
	}, nil
}

// resolveResource finds a resource definition by exact URI or template match.
func (s *Server) resolveResource(uri string) *resourceDef {
	if r, ok := s.resources[uri]; ok {
		return r
	}
	for _, r := range s.resources {
		if r.Template != "" && matchTemplate(r.Template, uri) {
			return r
		}
	}
	return nil
}

// matchTemplate checks if a URI matches a simple {var} template.
// Only supports single-level {var} substitutions.
func matchTemplate(template, uri string) bool {
	_, ok := extractVars(template, uri)
	return ok
}

// extractTemplateVars extracts {key} → value pairs from a URI given a template.
func extractTemplateVars(template, uri string) map[string]string {
	if template == "" {
		return nil
	}
	vars, _ := extractVars(template, uri)
	return vars
}

func extractVars(template, uri string) (map[string]string, bool) {
	vars := map[string]string{}
	ti, ui := 0, 0
	for ti < len(template) && ui < len(uri) {
		if template[ti] == '{' {
			end := strings.Index(template[ti:], "}")
			if end < 0 {
				return nil, false
			}
			key := template[ti+1 : ti+end]
			ti += end + 1
			// Consume uri until the next literal char in template (or end)
			var delim byte = 0
			if ti < len(template) {
				delim = template[ti]
			}
			start := ui
			for ui < len(uri) && (delim == 0 || uri[ui] != delim) {
				ui++
			}
			vars[key] = uri[start:ui]
		} else {
			if template[ti] != uri[ui] {
				return nil, false
			}
			ti++
			ui++
		}
	}
	return vars, ti == len(template) && ui == len(uri)
}

func writeRPCError(w http.ResponseWriter, id any, code int, message string) {
	resp := jsonRPCResponse{
		JSONRPC: "2.0",
		ID:      id,
		Error:   &rpcError{Code: code, Message: message},
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK) // JSON-RPC errors still return HTTP 200
	_ = json.NewEncoder(w).Encode(resp)
}
```

Add missing import `"strings"` to the file.

---

## Step 2 — Content tools

### `internal/mcp/tools/content.go`

This file registers all 15 content tools. Each tool is a function that receives
`json.RawMessage` args, decodes them, calls the appropriate repository method, and
returns a `toolResult` via `ok(v)` or `errResult(msg)`.

The file receives the required repos as constructor parameters — no global state.

```go
package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/mcp"
)

// contentRepos groups the repository interfaces required by content tools.
type contentRepos struct {
	tenants   tenantRepo
	posts     postRepo
	reports   reportRepo
	campaigns campaignRepo
	alerts    alertRepo
}

type tenantRepo interface {
	List(ctx context.Context) ([]*domain.Tenant, error)
	GetByID(ctx context.Context, id string) (*domain.Tenant, error)
	Create(ctx context.Context, t *domain.Tenant) error
	Update(ctx context.Context, t *domain.Tenant) error
}

type postRepo interface {
	List(ctx context.Context, tenantID string, status *string) ([]*domain.Post, error)
	GetByID(ctx context.Context, id string) (*domain.Post, error)
	Create(ctx context.Context, p *domain.Post) error
	UpdateStatus(ctx context.Context, id string, status domain.PostStatus, publishedAt *time.Time) error
	Delete(ctx context.Context, id string) error
}

type reportRepo interface {
	List(ctx context.Context, tenantID string) ([]*domain.Report, error)
	GetBySlug(ctx context.Context, tenantID, slug string) (*domain.Report, error)
	Create(ctx context.Context, r *domain.Report) error
}

type campaignRepo interface {
	List(ctx context.Context, tenantID string) ([]*domain.Campaign, error)
	GetBySlug(ctx context.Context, tenantID, slug string) (*domain.Campaign, error)
}

type alertRepo interface {
	ListOpen(ctx context.Context, tenantID string) ([]*domain.AlertEvent, error)
}
```

**RegisterContentTools function signature:**

```go
func RegisterContentTools(s *mcp.Server, repos contentRepos) {
	// ... register each tool below
}
```

**Tool list with exact schemas and implementations:**

#### `list_tenants`
```go
s.RegisterTool("list_tenants",
	"List all clients",
	map[string]any{"type": "object", "properties": map[string]any{}},
	func(ctx context.Context, _ json.RawMessage) mcp.ToolResult {
		tenants, err := repos.tenants.List(ctx)
		if err != nil { return mcp.ErrResult(err.Error()) }
		return mcp.Ok(tenants)
	},
)
```

#### `get_tenant`
Input: `{ "id": string }` — Tenant ID, e.g. "portico"
```go
s.RegisterTool("get_tenant",
	"Get brand config and persona for a client",
	map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id": map[string]any{"type": "string", "description": `Tenant ID, e.g. "portico"`},
		},
		"required": []string{"id"},
	},
	func(ctx context.Context, args json.RawMessage) mcp.ToolResult {
		var p struct{ ID string `json:"id"` }
		json.Unmarshal(args, &p)
		t, err := repos.tenants.GetByID(ctx, p.ID)
		if err != nil { return mcp.ErrResult(fmt.Sprintf(`Tenant "%s" not found`, p.ID)) }
		return mcp.Ok(t)
	},
)
```

#### `create_tenant`
Input: `{ id, name, language?, niche?, location?, tone?, instructions?, hashtags?, google_ads_id? }`
```go
s.RegisterTool("create_tenant",
	"Create a new client",
	map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id":             map[string]any{"type": "string"},
			"name":           map[string]any{"type": "string"},
			"language":       map[string]any{"type": "string", "default": "pt_BR"},
			"niche":          map[string]any{"type": "string"},
			"location":       map[string]any{"type": "string"},
			"tone":           map[string]any{"type": "string"},
			"instructions":   map[string]any{"type": "string"},
			"hashtags":       map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"google_ads_id":  map[string]any{"type": "string"},
		},
		"required": []string{"id", "name"},
	},
	func(ctx context.Context, args json.RawMessage) mcp.ToolResult {
		var p struct {
			ID           string   `json:"id"`
			Name         string   `json:"name"`
			Language     string   `json:"language"`
			Niche        *string  `json:"niche"`
			Location     *string  `json:"location"`
			Tone         *string  `json:"tone"`
			Instructions *string  `json:"instructions"`
			Hashtags     []string `json:"hashtags"`
			GoogleAdsID  *string  `json:"google_ads_id"`
		}
		json.Unmarshal(args, &p)
		if p.Language == "" { p.Language = "pt_BR" }
		t := &domain.Tenant{
			ID: p.ID, Name: p.Name, Language: p.Language,
			Niche: p.Niche, Location: p.Location, Tone: p.Tone,
			Instructions: p.Instructions, Hashtags: p.Hashtags,
			GoogleAdsID: p.GoogleAdsID,
		}
		if err := repos.tenants.Create(ctx, t); err != nil {
			return mcp.ErrResult(err.Error())
		}
		return mcp.Ok(map[string]string{"created": p.ID})
	},
)
```

#### `update_tenant`
Input: `{ id, name?, language?, niche?, location?, tone?, instructions?, hashtags?, google_ads_id? }`  
Implementation: fetch existing, apply non-nil fields, call Update.

#### `list_posts`
Input: `{ tenant_id, status? }` — status one of draft|approved|scheduled|published  
Implementation: call `repos.posts.List(ctx, p.TenantID, statusPtr)` — pass nil status for all.

#### `get_post`
Input: `{ id }`  
Implementation: `repos.posts.GetByID(ctx, p.ID)` — err → `ErrResult`.

#### `create_post`
Input: `{ tenant_id, content, title?, hashtags?, media_type? }`  
Implementation: generate ID as `domain.NewID()`, create with status draft.
```go
// Generate slug-based ID like the TypeScript version
func slugify(s string) string {
	s = strings.ToLower(s)
	re := regexp.MustCompile(`[^a-z0-9]+`)
	s = re.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}
// id = time.Now().Format("2006-01-02") + "_" + slugify(title)
// If title empty: use domain.NewID()
```

#### `update_post_status`
Input: `{ id, status }` — status one of draft|approved|scheduled|published  
Implementation: if status == "published", pass `publishedAt = &now`. Otherwise nil.  
Note: does NOT validate transitions here (MCP is trusted by design — agents understand the workflow).

#### `delete_post`
Input: `{ id }`

#### `list_reports`
Input: `{ tenant_id }`  
Implementation: `repos.reports.List(ctx, p.TenantID)` — return list WITHOUT content field.

#### `get_report`
Input: `{ tenant_id, slug }`  
Implementation: `repos.reports.GetBySlug(ctx, p.TenantID, p.Slug)` — returns full content.

#### `create_report`
Input: `{ tenant_id, slug, content, title? }`  
Implementation: detect type with `domain.DetectReportType(slug)`, call Create.

#### `list_campaigns`
Input: `{ tenant_id }`  
Implementation: `repos.campaigns.List(ctx, p.TenantID)` — return list WITHOUT full JSON data.

#### `get_campaign`
Input: `{ tenant_id, slug }`  
Implementation: `repos.campaigns.GetBySlug(ctx, p.TenantID, p.Slug)` — returns full data.

#### `check_alerts`
Input: `{ tenant_id }`  
Implementation: `repos.alerts.ListOpen(ctx, p.TenantID)`.

---

## Step 3 — Monitoring tools

### `internal/mcp/tools/monitoring.go`

Two tools implemented (read-only, use existing repos); two tools stubbed.

```go
type monitoringRepos struct {
	metrics    metricsRepo
	alertRepo  alertWriteRepo
	agentRuns  agentRunRepo
}

type metricsRepo interface {
	GetHistory(ctx context.Context, tenantID string, days int) ([]*domain.DailyMetrics, error)
	GetMonthlySummary(ctx context.Context, tenantID string, limit int) ([]*domain.MonthlySummary, error)
}

type alertWriteRepo interface {
	Create(ctx context.Context, a *domain.AlertEvent) error
}

type agentRunRepo interface {
	Create(ctx context.Context, run *domain.AgentRun) error
	Update(ctx context.Context, run *domain.AgentRun) error
}
```

#### `get_metrics_history` — IMPLEMENTED
Input: `{ tenant_id, days? }` — days defaults to 30, max 90.
```go
s.RegisterTool("get_metrics_history",
	"Get stored daily metrics for a client (last N days)",
	map[string]any{
		"type": "object",
		"properties": map[string]any{
			"tenant_id": map[string]any{"type": "string"},
			"days":      map[string]any{"type": "number", "default": 30, "minimum": 1, "maximum": 90},
		},
		"required": []string{"tenant_id"},
	},
	func(ctx context.Context, args json.RawMessage) mcp.ToolResult {
		var p struct {
			TenantID string `json:"tenant_id"`
			Days     int    `json:"days"`
		}
		json.Unmarshal(args, &p)
		if p.Days <= 0 { p.Days = 30 }
		if p.Days > 90 { p.Days = 90 }
		rows, err := repos.metrics.GetHistory(ctx, p.TenantID, p.Days)
		if err != nil { return mcp.ErrResult(err.Error()) }
		return mcp.Ok(rows)
	},
)
```

#### `get_monthly_summary` — IMPLEMENTED
Input: `{ tenant_id, months? }` — months defaults to 6.
```go
s.RegisterTool("get_monthly_summary",
	"Get consolidated monthly metrics for a client",
	map[string]any{
		"type": "object",
		"properties": map[string]any{
			"tenant_id": map[string]any{"type": "string"},
			"months":    map[string]any{"type": "number", "default": 6, "minimum": 1, "maximum": 24},
		},
		"required": []string{"tenant_id"},
	},
	func(ctx context.Context, args json.RawMessage) mcp.ToolResult {
		var p struct {
			TenantID string `json:"tenant_id"`
			Months   int    `json:"months"`
		}
		json.Unmarshal(args, &p)
		if p.Months <= 0 { p.Months = 6 }
		rows, err := repos.metrics.GetMonthlySummary(ctx, p.TenantID, p.Months)
		if err != nil { return mcp.ErrResult(err.Error()) }
		return mcp.Ok(rows)
	},
)
```

#### `collect_daily_metrics` — STUB (implemented in T17)
Input: `{ tenant_id, date? }`  
Return: `ErrResult("collect_daily_metrics requires the Google Ads connector (T17). Use the TypeScript MCP at localhost:5173/mcp until T17 is complete.")`

#### `consolidate_monthly` — STUB (implemented in T17)
Input: `{ tenant_id, month? }`  
Return: `ErrResult("consolidate_monthly requires the Google Ads connector (T17). Use the TypeScript MCP at localhost:5173/mcp until T17 is complete.")`

---

## Step 4 — Google Ads tools (all stubs)

### `internal/mcp/tools/ads.go`

All 10 ads tools are registered with correct schemas but return stub errors.
This is critical: **the tools MUST appear in `tools/list`** so agents know they exist
and can be called — but they fail gracefully until T17 fills in the implementations.

Register each with its exact input schema (agents validate schemas before calling):

#### Ads read tools

| Tool | Input fields |
|---|---|
| `get_live_metrics` | `tenant_id: string` |
| `get_campaign_criteria` | `tenant_id: string`, `campaign_id: string` |
| `get_search_terms` | `tenant_id: string`, `campaign_id: string`, `days?: number (1-90, default 30)` |
| `get_ad_groups` | `tenant_id: string`, `campaign_id: string`, `days?: number (1-30, default 7)` |

#### Ads write tools

| Tool | Input fields |
|---|---|
| `add_negative_keywords` | `tenant_id: string`, `campaign_id: string`, `keywords: string[]`, `match_type?: "broad"\|"phrase"\|"exact"` |
| `update_campaign_budget` | `tenant_id: string`, `campaign_id: string`, `budget_id: string`, `daily_budget_brl: number` |
| `set_weekday_schedule` | `tenant_id: string`, `campaign_id: string` |
| `add_ad_group_keywords` | `tenant_id: string`, `ad_group_resource_name: string`, `keywords: string[]`, `match_type?: string` |
| `add_campaign_extensions` | `tenant_id: string`, `campaign_id: string`, `callouts?: string[]`, `sitelinks?: array` |
| `set_campaign_status` | `tenant_id: string`, `campaign_id: string`, `status: "ENABLED"\|"PAUSED"` |

All stub handlers:
```go
func adsStub(ctx context.Context, _ json.RawMessage) mcp.ToolResult {
	return mcp.ErrResult("Google Ads connector not yet implemented (T17). Use the TypeScript MCP at localhost:5173/mcp for Google Ads operations.")
}
```

---

## Step 5 — Tenant resources

### `internal/mcp/resources/tenants.go`

Five resources. The handler receives the URI and any template vars extracted from it.

```go
func RegisterTenantResources(s *mcp.Server, repos resourceRepos) {
	// tenant://list  — all tenants
	s.RegisterResource("tenants", "tenant://list", "application/json",
		func(ctx context.Context, _ string, _ map[string]string) (string, error) {
			tenants, err := repos.tenants.List(ctx)
			if err != nil { return "", err }
			b, _ := json.MarshalIndent(tenants, "", "  ")
			return string(b), nil
		},
	)

	// tenant://{id}/brand
	s.RegisterResourceTemplate("tenant-brand", "tenant://{id}/brand", "application/json",
		func(ctx context.Context, _ string, vars map[string]string) (string, error) {
			t, err := repos.tenants.GetByID(ctx, vars["id"])
			if err != nil { return "", fmt.Errorf("tenant not found: %s", vars["id"]) }
			b, _ := json.MarshalIndent(t, "", "  ")
			return string(b), nil
		},
	)

	// tenant://{id}/posts
	s.RegisterResourceTemplate("tenant-posts", "tenant://{id}/posts", "application/json",
		func(ctx context.Context, _ string, vars map[string]string) (string, error) {
			posts, err := repos.posts.List(ctx, vars["id"], nil)
			if err != nil { return "", err }
			b, _ := json.MarshalIndent(posts, "", "  ")
			return string(b), nil
		},
	)

	// tenant://{id}/reports  (list, no content)
	s.RegisterResourceTemplate("tenant-reports", "tenant://{id}/reports", "application/json",
		func(ctx context.Context, _ string, vars map[string]string) (string, error) {
			reports, err := repos.reports.List(ctx, vars["id"])
			if err != nil { return "", err }
			b, _ := json.MarshalIndent(reports, "", "  ")
			return string(b), nil
		},
	)

	// tenant://{id}/reports/{slug}  (full content)
	// Note: the template extractor must handle two variables.
	// Use the pattern "tenant://{id}/reports/{slug}" — the extractVars function
	// handles multi-var templates as long as there's a literal "/" separator between them.
	s.RegisterResourceTemplate("tenant-report", "tenant://{id}/reports/{slug}", "text/markdown",
		func(ctx context.Context, _ string, vars map[string]string) (string, error) {
			r, err := repos.reports.GetBySlug(ctx, vars["id"], vars["slug"])
			if err != nil { return "", fmt.Errorf("report not found: %s", vars["slug"]) }
			return r.Content, nil
		},
	)
}
```

---

## Step 6 — Optional API key auth

Create an optional authentication middleware for the MCP endpoint.
If `MCP_API_KEY` environment variable is set, every request to `/mcp` must include
`Authorization: Bearer <key>`. If not set, the endpoint is open (local dev).

```go
// internal/api/mcp_handler.go

func MCPAuthMiddleware(apiKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if apiKey == "" {
				next.ServeHTTP(w, r)
				return
			}
			auth := r.Header.Get("Authorization")
			if !strings.HasPrefix(auth, "Bearer ") || strings.TrimPrefix(auth, "Bearer ") != apiKey {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
```

Add to `config.go`:
```go
MCPAPIKey string  // optional; from MCP_API_KEY env var
```

In `config.Load()`:
```go
MCPAPIKey: os.Getenv("MCP_API_KEY"),
```

---

## Step 7 — Wiring `main.go`

### Export ok/errResult from the mcp package

The tools package imports from `internal/mcp` — the helpers `ok` and `errResult`
must be exported. Name them `Ok` and `ErrResult` and export `ToolResult`:

In `internal/mcp/server.go` export:
```go
type ToolResult = toolResult  // or rename toolResult → ToolResult throughout

func Ok(v any) ToolResult { ... }
func ErrResult(msg string) ToolResult { ... }
```

### Create the MCP server factory

Create `internal/mcp/setup.go`:

```go
package mcp

import (
	"github.com/rush-maestro/rush-maestro/internal/mcp/tools"
	"github.com/rush-maestro/rush-maestro/internal/mcp/resources"
	"github.com/rush-maestro/rush-maestro/internal/repository"
)

func NewRushMaestroServer(
	tenantRepo   *repository.TenantRepository,
	postRepo     *repository.PostRepository,
	reportRepo   *repository.ReportRepository,
	campaignRepo *repository.CampaignRepository,
	alertRepo    *repository.AlertRepository,
	metricsRepo  *repository.MetricsRepository,
) *Server {
	s := NewServer("rush-maestro", "1.0.0")

	tools.RegisterContentTools(s, tools.ContentRepos{
		Tenants:   tenantRepo,
		Posts:     postRepo,
		Reports:   reportRepo,
		Campaigns: campaignRepo,
		Alerts:    alertRepo,
	})

	tools.RegisterAdsTools(s)

	tools.RegisterMonitoringTools(s, tools.MonitoringRepos{
		Metrics: metricsRepo,
	})

	resources.RegisterTenantResources(s, resources.TenantResourceRepos{
		Tenants: tenantRepo,
		Posts:   postRepo,
		Reports: reportRepo,
	})

	return s
}
```

### Wire in `cmd/server/main.go`

```go
import mcpserver "github.com/rush-maestro/rush-maestro/internal/mcp"

// After existing repo declarations:
metricsRepo := repository.NewMetricsRepository(pool)

// After existing handler declarations:
mcpSrv := mcpserver.NewRushMaestroServer(
	tenantRepo, postRepo, reportRepo, campaignRepo, alertRepo, metricsRepo,
)
mcpAPIKey := cfg.MCPAPIKey

// Register routes (before the SPA fallback handler):
r.Route("/mcp", func(r chi.Router) {
	r.Use(api.MCPAuthMiddleware(mcpAPIKey))
	r.Post("/", mcpSrv.ServeHTTP)
	r.Get("/", mcpSrv.ServeHTTP)   // returns 405, for compatibility
	r.Delete("/", mcpSrv.ServeHTTP) // session delete (ignored, returns 200)
})
```

---

## Step 8 — Repository interface additions

The monitoring tools need `GetHistory` and `GetMonthlySummary` on the metrics
repository. Check `internal/repository/metrics.go` — if these methods don't exist,
add them.

### Expected `MetricsRepository` methods

```go
func (r *MetricsRepository) GetHistory(ctx context.Context, tenantID string, days int) ([]*domain.DailyMetrics, error)
func (r *MetricsRepository) GetMonthlySummary(ctx context.Context, tenantID string, limit int) ([]*domain.MonthlySummary, error)
```

Check `internal/repository/db/metrics.sql.go` for the generated query functions.
The SQLC query `GetMetricsHistory` exists. `GetMonthlySummary` may need to be verified.

If `domain.DailyMetrics` or `domain.MonthlySummary` structs don't exist in `internal/domain/`,
create `internal/domain/metrics.go`:

```go
package domain

import "time"

type DailyMetrics struct {
	ID                   string          `json:"id"`
	TenantID             string          `json:"tenant_id"`
	Date                 string          `json:"date"` // YYYY-MM-DD
	CampaignID           string          `json:"campaign_id"`
	CampaignName         string          `json:"campaign_name"`
	Impressions          int32           `json:"impressions"`
	Clicks               int32           `json:"clicks"`
	CostBRL              float64         `json:"cost_brl"`
	Conversions          float64         `json:"conversions"`
	CPABRL               *float64        `json:"cpa_brl"`
	CTR                  *float64        `json:"ctr"`
	SearchImpressionShare *float64       `json:"search_impression_share"`
	CreatedAt            time.Time       `json:"created_at"`
}

type MonthlySummary struct {
	ID           string    `json:"id"`
	TenantID     string    `json:"tenant_id"`
	Month        string    `json:"month"` // YYYY-MM
	CampaignID   string    `json:"campaign_id"`
	CampaignName string    `json:"campaign_name"`
	Impressions  int32     `json:"impressions"`
	Clicks       int32     `json:"clicks"`
	CostBRL      float64   `json:"cost_brl"`
	Conversions  float64   `json:"conversions"`
	AvgCPABRL    *float64  `json:"avg_cpa_brl"`
	CreatedAt    time.Time `json:"created_at"`
}
```

---

## Step 9 — Do NOT update `.mcp.json` yet

The `.mcp.json` currently points to:
```json
{ "mcpServers": { "marketing": { "type": "http", "url": "http://localhost:5173/mcp" } } }
```

**Leave it unchanged.** The TypeScript MCP continues to serve agents (especially for
Google Ads operations) until T17 is complete. The `.mcp.json` will be updated in T17
to point to `http://localhost:8080/mcp`.

---

## Step 10 — Verify the implementation manually

After running `make dev/backend` (starts Go on `:8080`):

```bash
# 1. Test initialize
curl -s -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | jq .

# Expected: result.protocolVersion = "2024-11-05", result.serverInfo.name = "rush-maestro"

# 2. List tools
curl -s -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | jq '.result.tools | length'

# Expected: 29 (15 content + 10 ads + 4 monitoring)

# 3. Call list_tenants
curl -s -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_tenants","arguments":{}}}' \
  | jq '.result.content[0].text' | python3 -c "import sys,json; print(json.dumps(json.loads(json.load(sys.stdin)), indent=2))"

# Expected: JSON array of tenants

# 4. Call an ads stub
curl -s -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_live_metrics","arguments":{"tenant_id":"portico"}}}' \
  | jq '.result.isError'

# Expected: true  (stub)

# 5. Resources list
curl -s -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"resources/list","params":{}}' \
  | jq '.result.resources | length'

# Expected: 5

# 6. Read tenant list resource
curl -s -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"resources/read","params":{"uri":"tenant://list"}}' \
  | jq '.result.contents[0].text' | python3 -c "import sys,json; print(json.load(sys.stdin)[:200])"

# Expected: JSON array of tenants

# 7. GET /mcp should return 405
curl -s -o /dev/null -w "%{http_code}" -X GET http://localhost:8080/mcp
# Expected: 405
```

---

## Package structure summary

```
backend/internal/mcp/
  server.go          — MCPServer, toolDef, resourceDef, ServeHTTP, JSON-RPC dispatch
  setup.go           — NewRushMaestroServer (factory, wires repos to tools)
  tools/
    content.go       — 15 content tools (RegisterContentTools, ContentRepos)
    ads.go           — 10 ads tools (RegisterAdsTools — all stubs)
    monitoring.go    — 4 monitoring tools (RegisterMonitoringTools, MonitoringRepos)
  resources/
    tenants.go       — 5 tenant resources (RegisterTenantResources, TenantResourceRepos)
backend/internal/api/
  mcp_handler.go     — MCPAuthMiddleware
```

**Naming conventions:**
- Exported types: `ToolResult`, `ContentRepos`, `MonitoringRepos`, `TenantResourceRepos`
- Exported functions: `Ok`, `ErrResult`, `RegisterContentTools`, `RegisterAdsTools`, `RegisterMonitoringTools`, `RegisterTenantResources`
- Unexported: `toolDef`, `resourceDef`, `jsonRPCRequest`, `jsonRPCResponse`, etc.

---

## Common pitfalls

### JSON-RPC notifications have no `id` field
A message with `method` but no `id` is a notification (e.g., `notifications/initialized`).
Do NOT return a JSON-RPC response — just return HTTP 200 with empty body. Returning
a response to a notification violates the spec and breaks some clients.

### `id` can be null, number, or string
The `id` field in JSON-RPC can be any of these. Store it as `any` (Go interface{})
when serializing. Don't coerce it to int.

### Tools/call args may be absent
`"arguments"` can be absent, null, or `{}`. Default to `json.RawMessage("{}")` if nil.

### Template variable extraction with multiple variables
The `extractVars` function must handle `tenant://{id}/reports/{slug}` correctly.
The literal `/reports/` between `{id}` and `{slug}` acts as the delimiter.
Test this case explicitly:
```go
// Must return: {"id": "portico", "slug": "google-ads-2026-04"}
extractVars("tenant://{id}/reports/{slug}", "tenant://portico/reports/google-ads-2026-04")
```

### MetricsRepository.GetHistory parameter type
The SQLC-generated query `GetMetricsHistory` may use a different parameter type
(e.g., `pgtype.Text` for the interval). Check `metrics.sql.go` and adapt the
repository method accordingly. Use `fmt.Sprintf("%d days", days)` for the interval string.

---

## Completion criteria

- [ ] `go build ./...` passes with zero errors
- [ ] `go vet ./...` passes
- [ ] `POST /mcp` with `initialize` returns `protocolVersion: "2024-11-05"` and `serverInfo.name: "rush-maestro"`
- [ ] `POST /mcp` with `tools/list` returns exactly 29 tools
- [ ] `POST /mcp` with `tools/call` → `list_tenants` returns the tenant array from PostgreSQL
- [ ] `POST /mcp` with `tools/call` → `create_report` creates a report in PostgreSQL
- [ ] `POST /mcp` with `tools/call` → `get_metrics_history` returns stored daily metrics
- [ ] `POST /mcp` with `tools/call` → `get_live_metrics` returns `isError: true` with stub message
- [ ] `POST /mcp` with `resources/list` returns 5 resources
- [ ] `POST /mcp` with `resources/read` → `tenant://list` returns all tenants
- [ ] `POST /mcp` with `resources/read` → `tenant://portico/reports/google-ads-2026-04` returns report content
- [ ] `GET /mcp` returns HTTP 405
- [ ] `notifications/initialized` (no `id`) returns HTTP 200 with empty body (no JSON-RPC response)
- [ ] `.mcp.json` unchanged (still points to `:5173/mcp`)

---

## References

- Current TypeScript MCP: `frontend/src/lib/server/mcp/`
- Current MCP route: `frontend/src/routes/mcp/+server.ts`
- MCP Streamable HTTP spec: https://modelcontextprotocol.io/specification/2024-11-05/basic/transports
- Go repositories: `backend/internal/repository/`
- Domain types: `backend/internal/domain/`
- Config: `backend/internal/config/config.go`
- Previous task: T15 — Integrations Hub
- Next task: T17 — Google Ads Connector (fills in the stubs)
