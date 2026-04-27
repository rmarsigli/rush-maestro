# T18 — Remove TypeScript MCP Server

**Status:** pending  
**Phase:** 5 — MCP (cleanup)  
**Estimate:** 1–2 hours  
**Depends on:** T16 (Go MCP fully operational), T17 (ads tools filled in)  
**Unlocks:** T19 (safe to remove remaining server code once MCP is gone)  
**Parallel with:** nothing (touches package.json)

---

## Context

T16 ported the MCP server to Go and T17 filled in all 29 tools. The `.mcp.json` was
already switched to point to `http://localhost:8181/mcp`. The TypeScript implementation
in `frontend/src/lib/server/mcp/` and its HTTP handler at
`frontend/src/routes/mcp/+server.ts` are now dead code.

This task deletes the TypeScript MCP entirely and removes its npm dependency.

---

## Verify first

Before deleting, confirm the Go MCP is reachable:

```bash
curl -s -X POST http://localhost:8181/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | python3 -m json.tool
```

Expected: a JSON response with `result.protocolVersion = "2024-11-05"` and a non-empty `result.capabilities`.

Also confirm `tools/list` works:

```bash
curl -s -X POST http://localhost:8181/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['result']['tools']), 'tools')"
```

Expected output: `29 tools`.

---

## Files to delete

```
frontend/src/lib/server/mcp/
  server.ts
  resources/tenants.ts
  tools/ads.ts
  tools/content.ts
  tools/monitoring.ts

frontend/src/routes/mcp/
  +server.ts
```

Delete with:

```bash
rm -rf frontend/src/lib/server/mcp
rm -rf frontend/src/routes/mcp
```

---

## Dependency to remove

`@modelcontextprotocol/sdk` is only used by the TypeScript MCP. Remove it:

```bash
cd frontend && bun remove @modelcontextprotocol/sdk
```

Then verify the frontend still builds:

```bash
cd frontend && bun run build
```

---

## Verify after deletion

1. `make dev/frontend` starts without TypeScript errors
2. `make dev/backend` serves MCP at `:8181/mcp`
3. Claude Code (via `.mcp.json`) can still call `list_tenants` and other MCP tools

---

## Commit

```
chore(T18): remove TypeScript MCP server — replaced by Go at :8181/mcp
```
