# T08 — MCP server setup at `/mcp`

**Phase:** 4 — MCP  
**Status:** pending  
**ADR:** ADR-001  
**Depends on:** T01, T02  
**Blocks:** T09

---

## Goal

Install `@modelcontextprotocol/sdk`, create the MCP server instance, and expose it at `POST /mcp` + `GET /mcp` (Streamable HTTP transport) via SvelteKit. No tools or resources yet — just the server responding to the MCP initialize handshake.

---

## Install

```bash
bun add @modelcontextprotocol/sdk
```

---

## MCP server instance

**File: `src/lib/server/mcp/server.ts`**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const server = new McpServer({
  name: 'marketing-cms',
  version: '1.0.0'
})
```

All tools and resources are registered here (imported from `tools/` and `resources/` in T09).

---

## SvelteKit endpoint

**File: `src/routes/mcp/+server.ts`**

```typescript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { server } from '@/lib/server/mcp/server.js'
import type { RequestHandler } from './$types'

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
await server.connect(transport)

export const POST: RequestHandler = async ({ request }) => {
  return transport.handleRequest(request)
}

export const GET: RequestHandler = async ({ request }) => {
  return transport.handleRequest(request)
}

export const DELETE: RequestHandler = async ({ request }) => {
  return transport.handleRequest(request)
}
```

Note: `StreamableHTTPServerTransport` may need a session store for stateful connections. Check the SDK docs for the `sessionIdGenerator` option — for a single-user local tool, stateless is fine.

---

## `.mcp.json` config

Create at project root (committed to git):

```json
{
  "mcpServers": {
    "marketing": {
      "type": "http",
      "url": "http://localhost:5173/mcp"
    }
  }
}
```

Claude Code and Gemini CLI pick this up automatically from the project root.

---

## Verify

1. Start `bun run dev`
2. In a second terminal, confirm the endpoint responds:

```bash
curl -X POST http://localhost:5173/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
```

Expected: JSON response with `result.serverInfo.name === "marketing-cms"`.

3. In Claude Code: `/mcp` should show `marketing` as connected.

---

## Notes

- The MCP server is created once at module load time (singleton). SvelteKit's module-level code runs once per server process.
- If `StreamableHTTPServerTransport` doesn't map cleanly to SvelteKit's `RequestHandler`, check the SDK's Express adapter for reference and adapt accordingly.
- The `/mcp` route should have no auth — it's local only.
