# T10 — Cleanup: remove flat-files, update scripts and CLAUDE.md

**Phase:** 5 — Cleanup  
**Status:** completed  
**ADR:** ADR-001  
**Depends on:** T07 (all routes migrated), T09 (MCP verified)  
**Blocks:** nothing — final task

---

## Goal

Remove all flat-file read paths, clean up the `clients/` directory (keep only images in `storage/images/`), simplify scripts to thin debug wrappers, and update `CLAUDE.md` to reflect the new architecture.

**Do not run this task until T07 and T09 are fully verified.**

---

## Steps

### 1. Remove flat-file content from `clients/`

After confirming SQLite has all data and the UI reads only from SQLite:

```bash
# Verify counts one more time
bun run -e "import { getDb } from './src/lib/server/db/index.ts'; const db = getDb(); ..."

# Remove flat-file content (NOT images)
find clients/ -name "brand.json" -delete
find clients/ -name "*.json" -path "*/posts/*" -delete
find clients/ -name "*.md" -path "*/reports/*" -delete
find clients/ -name "*.json" -path "*/ads/*" -delete

# Remove now-empty directories
find clients/ -type d -empty -delete
```

Images should already be in `storage/images/[tenant]/` from T06. If not, move them first.

### 2. Remove `scripts/migrate-flat-to-sqlite.ts`

This was a one-time script. Delete it.

### 3. Simplify scripts

Scripts in `scripts/` were originally standalone tools that read from env + flat-files. After the migration they should be thin debug wrappers that call the data layer or Google Ads API directly.

Keep:
- `scripts/test-ads-connection.ts` — useful debug tool
- `scripts/test-query.ts`, `test-query-ag.ts`, `test-query-history.ts` — useful debug
- `scripts/deploy-google-ads.ts` — keep but update to call `markDeployed` in SQLite after deploy
- `scripts/collect-daily-metrics.ts`, `consolidate-monthly.ts` — update to call `createReport` instead of writing MD files

Remove:
- Any script that now duplicates what MCP tools do

### 4. Update `scripts/collect-daily-metrics.ts`

This script writes `.md` report files. Update to call `createReport` from `src/lib/server/reports.ts` instead:

```typescript
import { createReport } from '@/lib/server/reports.ts'

// instead of: fs.writeFile(`clients/${tenant}/reports/${slug}.md`, content)
createReport({ tenant_id: tenant, slug, content, title })
```

### 5. Update `scripts/consolidate-monthly.ts`

Same pattern — reads existing reports and writes a new one. Update to use `listReports` and `createReport`.

### 6. Update `CLAUDE.md`

Key changes to make in `CLAUDE.md`:

- **Stack section**: add `@modelcontextprotocol/sdk`, update SQLite note (no longer "sem banco de dados"), add MCP section
- **Storage**: "Flat-file JSON/MD em `clients/[tenant]/`" → "SQLite para todo conteúdo; imagens em `storage/images/[tenant]/`"
- **Directory structure**: update to reflect new layout (`src/routes/`, `src/lib/server/`, `src/lib/server/mcp/`)
- **Scripts section**: note that scripts are debug/utility wrappers; core logic lives in `src/lib/server/`
- **Add MCP section**: document the `/mcp` endpoint, `.mcp.json`, tool list, and resource URIs
- **Remove**: "Flat-file first — sem banco de dados" rule (now reversed)

### 7. Remove old type definitions

`src/lib/server/db.ts` (the old type file with `Brand`, `Post`, `PostWithMeta`, etc.) was superseded by types in the data layer functions (T05). Remove or audit — keep only what's not covered by T05 types.

---

## Verify

```bash
# No flat-file reads anywhere in routes
grep -r "readFile\|readdir" src/routes/ --include="*.ts"
# Should return nothing (or only the media route which reads from storage/)

# No references to clients/ in routes
grep -r "clients/" src/routes/ --include="*.ts"
# Should return nothing

bun run check   # zero TypeScript errors
bun run build   # builds cleanly
```

Navigate all routes in the browser for a final smoke test.
