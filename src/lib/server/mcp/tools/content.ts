import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listTenants, getTenant, createTenant, updateTenant } from '@/lib/server/tenants.js'
import {
	listPosts, getPost, createPost, updatePostStatus, deletePost,
	type PostStatus, type MediaType
} from '@/lib/server/posts.js'
import { listReports, getReport, createReport, detectReportType } from '@/lib/server/reports.js'
import { listCampaigns, getCampaign } from '@/lib/server/campaigns.js'
import { getOpenAlerts } from '$db/alerts.js'

function ok(data: unknown) {
	return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function err(msg: string) {
	return { content: [{ type: 'text' as const, text: msg }], isError: true as const }
}

function slugify(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function registerContentTools(server: McpServer): void {
	server.registerTool('list_tenants', { description: 'List all clients' }, () => ok(listTenants()))

	server.registerTool('get_tenant', {
		description: 'Get brand config and persona for a client',
		inputSchema: { id: z.string().describe('Tenant ID, e.g. "portico"') }
	}, ({ id }) => {
		const t = getTenant(id)
		return t ? ok(t) : err(`Tenant "${id}" not found`)
	})

	server.registerTool('create_tenant', {
		description: 'Create a new client',
		inputSchema: {
			id: z.string(),
			name: z.string(),
			language: z.string().default('pt'),
			niche: z.string().optional(),
			location: z.string().optional(),
			tone: z.string().optional(),
			instructions: z.string().optional(),
			hashtags: z.array(z.string()).optional(),
			google_ads_id: z.string().optional()
		}
	}, (data) => {
		createTenant({
			id: data.id,
			name: data.name,
			language: data.language,
			niche: data.niche ?? null,
			location: data.location ?? null,
			primary_persona: null,
			tone: data.tone ?? null,
			instructions: data.instructions ?? null,
			hashtags: data.hashtags ?? [],
			google_ads_id: data.google_ads_id ?? null,
			ads_monitoring: null
		})
		return ok({ created: data.id })
	})

	server.registerTool('update_tenant', {
		description: 'Edit brand config for a client',
		inputSchema: {
			id: z.string(),
			name: z.string().optional(),
			language: z.string().optional(),
			niche: z.string().optional(),
			location: z.string().optional(),
			tone: z.string().optional(),
			instructions: z.string().optional(),
			hashtags: z.array(z.string()).optional(),
			google_ads_id: z.string().optional()
		}
	}, ({ id, ...rest }) => {
		updateTenant(id, rest)
		return ok({ updated: id })
	})

	server.registerTool('list_posts', {
		description: 'List posts for a client, optionally filtered by status',
		inputSchema: {
			tenant_id: z.string(),
			status: z.enum(['draft', 'approved', 'published', 'scheduled']).optional()
		}
	}, ({ tenant_id, status }) => ok(listPosts(tenant_id, status as PostStatus | undefined)))

	server.registerTool('get_post', {
		description: 'Get a single post with its workflow',
		inputSchema: { id: z.string() }
	}, ({ id }) => {
		const p = getPost(id)
		return p ? ok(p) : err(`Post "${id}" not found`)
	})

	server.registerTool('create_post', {
		description: 'Create a new post draft',
		inputSchema: {
			tenant_id: z.string(),
			content: z.string(),
			title: z.string().optional(),
			hashtags: z.array(z.string()).optional(),
			media_type: z.enum(['carousel', 'image', 'video', 'reel']).optional()
		}
	}, (data) => {
		const id = `${new Date().toISOString().slice(0, 10)}_${slugify(data.title ?? 'post')}`
		createPost({
			id,
			tenant_id: data.tenant_id,
			status: 'draft',
			title: data.title ?? null,
			content: data.content,
			hashtags: data.hashtags ?? [],
			media_type: (data.media_type as MediaType) ?? null,
			workflow: null,
			media_path: null,
			scheduled_date: null,
			scheduled_time: null,
			published_at: null
		})
		return ok({ created: id })
	})

	server.registerTool('update_post_status', {
		description: 'Change post status (draft → approved → published)',
		inputSchema: {
			id: z.string(),
			status: z.enum(['draft', 'approved', 'published', 'scheduled'])
		}
	}, ({ id, status }) => {
		updatePostStatus(id, status as PostStatus, status === 'published' ? new Date().toISOString() : undefined)
		return ok({ id, status })
	})

	server.registerTool('delete_post', {
		description: 'Delete a post',
		inputSchema: { id: z.string() }
	}, ({ id }) => {
		deletePost(id)
		return ok({ deleted: id })
	})

	server.registerTool('list_reports', {
		description: 'List reports for a client',
		inputSchema: { tenant_id: z.string() }
	}, ({ tenant_id }) => ok(listReports(tenant_id)))

	server.registerTool('get_report', {
		description: 'Get full markdown content of a report',
		inputSchema: { tenant_id: z.string(), slug: z.string() }
	}, ({ tenant_id, slug }) => {
		const r = getReport(tenant_id, slug)
		return r ? ok(r) : err(`Report "${slug}" not found for "${tenant_id}"`)
	})

	server.registerTool('create_report', {
		description: 'Save a new report (markdown content)',
		inputSchema: {
			tenant_id: z.string(),
			slug: z.string().describe('e.g. "google-ads-audit-2026-04-24"'),
			content: z.string().describe('Full markdown content'),
			title: z.string().optional()
		}
	}, ({ tenant_id, slug, content, title }) => {
		createReport({ tenant_id, slug, type: detectReportType(slug), content, title: title ?? null })
		return ok({ saved: slug })
	})

	server.registerTool('list_campaigns', {
		description: 'List local campaign files for a client',
		inputSchema: { tenant_id: z.string() }
	}, ({ tenant_id }) => ok(listCampaigns(tenant_id)))

	server.registerTool('get_campaign', {
		description: 'Get full campaign JSON for a client',
		inputSchema: { tenant_id: z.string(), slug: z.string() }
	}, ({ tenant_id, slug }) => {
		const c = getCampaign(tenant_id, slug)
		return c ? ok(c) : err(`Campaign "${slug}" not found for "${tenant_id}"`)
	})

	server.registerTool('check_alerts', {
		description: 'Get open monitoring alerts for a client',
		inputSchema: { tenant_id: z.string() }
	}, ({ tenant_id }) => ok(getOpenAlerts(tenant_id)))
}
