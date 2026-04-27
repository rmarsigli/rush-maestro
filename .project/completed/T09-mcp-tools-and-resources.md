# T09 — Implement MCP tools and resources

**Phase:** 4 — MCP  
**Status:** completed  
**ADR:** ADR-001  
**Depends on:** T05, T08  
**Blocks:** T10

---

## Goal

Register all MCP tools and resources on the server instance from T08. Tools call the data layer functions from T05. Resources expose read-only data for agent browsing. No logic lives inside tool/resource definitions — they are thin adapters.

---

## Tools

**File: `src/lib/server/mcp/tools/content.ts`**

Register on `server` (imported from `../server.ts`):

```typescript
import { server } from '../server.ts'
import { listTenants, getTenant, createTenant, updateTenant } from '@/lib/server/tenants.ts'
import { listPosts, getPost, createPost, updatePost, updatePostStatus, deletePost } from '@/lib/server/posts.ts'
import { listReports, getReport, createReport, deleteReport } from '@/lib/server/reports.ts'
import { listCampaigns, getCampaign, upsertCampaign } from '@/lib/server/campaigns.ts'

server.tool('list_tenants', 'List all clients', {}, () => ({
  content: [{ type: 'text', text: JSON.stringify(listTenants(), null, 2) }]
}))

server.tool('get_tenant', 'Get brand config and persona for a client', {
  id: { type: 'string', description: 'Tenant ID, e.g. "portico"' }
}, ({ id }) => {
  const t = getTenant(id)
  if (!t) return { content: [{ type: 'text', text: `Tenant "${id}" not found` }], isError: true }
  return { content: [{ type: 'text', text: JSON.stringify(t, null, 2) }] }
})

server.tool('list_posts', 'List posts for a client, optionally filtered by status', {
  tenant_id: { type: 'string' },
  status: { type: 'string', enum: ['draft', 'approved', 'published'], optional: true }
}, ({ tenant_id, status }) => ({
  content: [{ type: 'text', text: JSON.stringify(listPosts(tenant_id, status), null, 2) }]
}))

server.tool('create_post', 'Create a new post draft', {
  tenant_id: { type: 'string' },
  title: { type: 'string', optional: true },
  content: { type: 'string' },
  hashtags: { type: 'array', items: { type: 'string' }, optional: true },
  media_type: { type: 'string', optional: true },
  workflow: { type: 'object', optional: true }
}, (data) => {
  const id = `${new Date().toISOString().slice(0, 10)}_${slugify(data.title ?? 'post')}`
  createPost({ id, status: 'draft', ...data, hashtags: data.hashtags ?? [], media_path: null, published_at: null })
  return { content: [{ type: 'text', text: `Created post: ${id}` }] }
})

server.tool('update_post_status', 'Change post status (draft → approved → published)', {
  id: { type: 'string' },
  status: { type: 'string', enum: ['draft', 'approved', 'published'] }
}, ({ id, status }) => {
  updatePostStatus(id, status, status === 'published' ? new Date().toISOString() : undefined)
  return { content: [{ type: 'text', text: `Post ${id} → ${status}` }] }
})

server.tool('create_report', 'Save a new report (markdown content)', {
  tenant_id: { type: 'string' },
  slug: { type: 'string', description: 'e.g. "google-ads-audit-2026-04-24"' },
  content: { type: 'string', description: 'Full markdown content' },
  title: { type: 'string', optional: true }
}, ({ tenant_id, slug, content, title }) => {
  createReport({ tenant_id, slug, content, title: title ?? null })
  return { content: [{ type: 'text', text: `Report saved: ${slug}` }] }
})

// ... list_reports, get_post, list_campaigns, get_campaign, etc. — same pattern
```

---

**File: `src/lib/server/mcp/tools/ads.ts`**

```typescript
server.tool('get_live_metrics', 'Query live campaign metrics from Google Ads API', {
  tenant_id: { type: 'string' },
  campaign_id: { type: 'string' }
}, async ({ tenant_id, campaign_id }) => {
  // calls existing googleAds.ts / googleAdsDetailed.ts logic
})

server.tool('deploy_campaign', 'Deploy a local campaign JSON to Google Ads (requires confirmation)', {
  tenant_id: { type: 'string' },
  campaign_slug: { type: 'string' }
}, async ({ tenant_id, campaign_slug }) => {
  // calls deploy logic — IMPORTANT: this is a live mutation, tool description must say so
})
```

---

## Resources

**File: `src/lib/server/mcp/resources/tenants.ts`**

```typescript
import { server } from '../server.ts'
import { listTenants, getTenant } from '@/lib/server/tenants.ts'
import { listPosts } from '@/lib/server/posts.ts'
import { listReports, getReport } from '@/lib/server/reports.ts'

// List all tenants as a browseable resource
server.resource('tenants', 'tenant://list', { mimeType: 'application/json' },
  () => ({ contents: [{ uri: 'tenant://list', text: JSON.stringify(listTenants(), null, 2) }] })
)

// Individual tenant brand + config
server.resource('tenant-brand', new ResourceTemplate('tenant://{id}/brand', { list: undefined }),
  { mimeType: 'application/json' },
  (uri, { id }) => {
    const t = getTenant(id as string)
    if (!t) throw new Error(`Tenant not found: ${id}`)
    return { contents: [{ uri: uri.href, text: JSON.stringify(t, null, 2) }] }
  }
)

// Posts for a tenant
server.resource('tenant-posts', new ResourceTemplate('tenant://{id}/posts', { list: undefined }),
  { mimeType: 'application/json' },
  (uri, { id }) => ({
    contents: [{ uri: uri.href, text: JSON.stringify(listPosts(id as string), null, 2) }]
  })
)

// Individual report content
server.resource('tenant-report', new ResourceTemplate('tenant://{id}/reports/{slug}', { list: undefined }),
  { mimeType: 'text/markdown' },
  (uri, { id, slug }) => {
    const r = getReport(id as string, slug as string)
    if (!r) throw new Error(`Report not found: ${slug}`)
    return { contents: [{ uri: uri.href, text: r.content }] }
  }
)
```

---

## Register everything in `server.ts`

```typescript
// src/lib/server/mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const server = new McpServer({ name: 'marketing-cms', version: '1.0.0' })

// register all tools and resources by importing side-effect modules
import './tools/content.ts'
import './tools/ads.ts'
import './resources/tenants.ts'
```

---

## Full tool list

| Tool | Description |
|---|---|
| `list_tenants` | All clients |
| `get_tenant` | Brand + persona for one client |
| `create_tenant` | New client |
| `update_tenant` | Edit brand config |
| `list_posts` | Posts for tenant (optional status filter) |
| `get_post` | Single post with workflow |
| `create_post` | New draft |
| `update_post_status` | Status transition |
| `delete_post` | Remove post |
| `list_reports` | Reports for tenant |
| `get_report` | Full markdown report |
| `create_report` | Save new report |
| `list_campaigns` | Local campaigns for tenant |
| `get_campaign` | Full campaign JSON |
| `deploy_campaign` | Push to Google Ads API |
| `get_live_metrics` | Live data from API |
| `check_alerts` | Run monitoring checks |

---

## Verify

In Claude Code with `/mcp` connected:
- Ask "list all tenants" — should return Pórtico and Bracar Pneus
- Ask "show me the latest posts for portico with status draft"
- Ask "read the brand for portico" — agent should use the resource, not a tool
