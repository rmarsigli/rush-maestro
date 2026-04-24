import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getTenant } from '@/lib/server/tenants.js'
import { getLiveCampaigns } from '@/lib/server/googleAds.js'

function ok(data: unknown) {
	return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function err(msg: string) {
	return { content: [{ type: 'text' as const, text: msg }], isError: true as const }
}

export function registerAdsTools(server: McpServer): void {
	server.registerTool('get_live_metrics', {
		description: 'Query live campaign metrics from Google Ads API',
		inputSchema: { tenant_id: z.string() }
	}, async ({ tenant_id }) => {
		const tenant = getTenant(tenant_id)
		if (!tenant) return err(`Tenant "${tenant_id}" not found`)
		const campaigns = await getLiveCampaigns(tenant.google_ads_id ?? undefined, tenant_id)
		return ok(campaigns)
	})
}
