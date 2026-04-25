# Tasks — Rush Maestro

Refactor guided by **ADR-001** (`.project/adrs/001-sveltekit-sqlite-mcp.md`).  
Goal: move SvelteKit to root, replace flat-files with SQLite, expose MCP at `/mcp`.

---

## Current state

**Refactor complete. All tasks T01–T10 have been completed.**

| Task | Status | Description |
|---|---|---|
| T01 | ✅ completed | Move SvelteKit from `ui/` to root |
| T02 | ✅ completed | Drop dual-runtime shim, use `bun:sqlite` directly |
| T03 | ✅ completed | SQLite migrations: tenants, posts, reports, campaigns |
| T04 | ✅ completed | Seed script: flat-files → SQLite |
| T05 | ✅ completed | TS data layer functions (`src/lib/server/`) |
| T06 | ✅ completed | Storage adapter interface + local implementation |
| T07 | ✅ completed | Migrate UI routes from `fs.readFile` to SQLite functions |
| T08 | ✅ completed | MCP server setup at `/mcp` via SvelteKit |
| T09 | ✅ completed | MCP tools and resources |
| T10 | ✅ completed | Cleanup: remove flat-files, update scripts and CLAUDE.md |

---

## Final result

- SvelteKit at root (`src/`), Bun as the sole runtime
- SQLite (`db/marketing.db`) is the source of truth for tenants, posts, reports and campaigns
- MCP server at `POST /mcp` with 16 tools and 5 resources
- Simplified scripts: read from SQLite, not from `clients/`
- `clients/` contains only legacy images (duplicates of `storage/images/`)
- CLAUDE.md updated to reflect the new architecture

---

## Project rules

- Commits follow Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`
- Completed tasks go to `tasks/completed/` with `**Status:** completed`
- Never modify live Google Ads campaigns without explicit confirmation
- Client IDs and tracking tags never go in committed files
