import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerContentTools } from './tools/content.js'
import { registerAdsTools } from './tools/ads.js'
import { registerMonitoringTools } from './tools/monitoring.js'
import { registerTenantResources } from './resources/tenants.js'

export function createServer(): McpServer {
	const server = new McpServer({ name: 'rush-maestro', version: '1.0.0' })
	registerContentTools(server)
	registerAdsTools(server)
	registerMonitoringTools(server)
	registerTenantResources(server)
	return server
}
