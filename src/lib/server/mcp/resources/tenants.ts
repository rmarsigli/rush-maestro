import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listTenants, getTenant } from '@/lib/server/tenants.js'
import { listPosts } from '@/lib/server/posts.js'
import { getReport, listReports } from '@/lib/server/reports.js'

export function registerTenantResources(server: McpServer): void {
	server.registerResource(
		'tenants',
		'tenant://list',
		{ mimeType: 'application/json' },
		(uri) => ({
			contents: [{ uri: uri.href, text: JSON.stringify(listTenants(), null, 2) }]
		})
	)

	server.registerResource(
		'tenant-brand',
		new ResourceTemplate('tenant://{id}/brand', { list: undefined }),
		{ mimeType: 'application/json' },
		(uri, { id }) => {
			const t = getTenant(id as string)
			if (!t) throw new Error(`Tenant not found: ${id}`)
			return { contents: [{ uri: uri.href, text: JSON.stringify(t, null, 2) }] }
		}
	)

	server.registerResource(
		'tenant-posts',
		new ResourceTemplate('tenant://{id}/posts', { list: undefined }),
		{ mimeType: 'application/json' },
		(uri, { id }) => ({
			contents: [{ uri: uri.href, text: JSON.stringify(listPosts(id as string), null, 2) }]
		})
	)

	server.registerResource(
		'tenant-reports',
		new ResourceTemplate('tenant://{id}/reports', { list: undefined }),
		{ mimeType: 'application/json' },
		(uri, { id }) => ({
			contents: [{ uri: uri.href, text: JSON.stringify(listReports(id as string), null, 2) }]
		})
	)

	server.registerResource(
		'tenant-report',
		new ResourceTemplate('tenant://{id}/reports/{slug}', { list: undefined }),
		{ mimeType: 'text/markdown' },
		(uri, { id, slug }) => {
			const r = getReport(id as string, slug as string)
			if (!r) throw new Error(`Report not found: ${slug}`)
			return { contents: [{ uri: uri.href, text: r.content }] }
		}
	)
}
