# Rush Maestro

> AI-assisted development with context persistence. Full docs: `.project/docs/`

{{SLOT:guidelines}}

## Stack & Architecture

- **Backend:** Go (chi router, pgx/v5, goose migrations) - `backend/`
- **Frontend:** SvelteKit (Svelte 5 runes) + Tailwind v4 + `adapter-static` - `frontend/`
- **Database:** PostgreSQL via pgx at `rush_maestro`. PostgreSQL is the source of truth for all content.
- **MCP:** Streamable HTTP. Exposes two services, **AIPIM** (Project Manager at `http://localhost:3141/mcp`) and **Rush Maestro** (the Plataform at `http://localhost:5173/mcp`).
- **Credentials:** Google Ads OAuth and other connections are stored in the `integrations` table (not `.env`). Client IDs, campaign IDs and tracking tags **never** go in committed files.

## Agent Communication via MCP

All agents can interact with this system exclusively through MCP tools. There are no agent `.md` files, no flat-file workflows, no direct script invocations from agents. The MCP servers at `http://localhost:3141/mcp` (AIPIM for memory manager and project management) and `http://localhost:5173/mcp` (Rush Maestro, the project per se) are the only interfaces.

## General Conventions

- Commits follow Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`
- Svelte components use `untrack()` for `$state` initialized from `$props` + `$effect` for sync
- Rune-based stores must use `.svelte.ts` extension (not `.ts`)

## Language Rules

- **Files:** All files in `.project/` (tasks, ADRs, notes), code comments, and commit messages MUST be written in **English**. This ensures any agent can read them without ambiguity.
- **Chat:** All conversational responses to the user MUST be in **Portuguese**.
{{/SLOT:guidelines}}

## Directory Structure

```text
backend/                 # Go API (chi, pgx, goose)
frontend/                # SvelteKit app
.project/
  ├── current-task.md    # Active work
  ├── context.md         # Session state persistence
  ├── backlog/           # Managed entirely via AIPIM MCP tools (`get_task`, `list_tasks`)
  ├── completed/         # Archive (Managed via `complete_task`)
  ├── decisions/         # ADRs (Managed via `log_decision`)
  └── README.md          # Project overview
```

## Session Protocol

**Start (MANDATORY):**

1. Call `get_project_context` MCP tool - returns current state, stats, next task
2. Review last commit: `git log -1 --oneline`
3. Continue from `next_action`

**Task Execution:**

1. Fetch task details using the `get_task` MCP tool (AIPIM) by passing the task ID. **DO NOT** attempt to read task files manually from `.project/backlog/`.
2. Work directly on the project files. Implement requested changes.
3. Run tests/linters if configured.
4. Call `add_comment` (via MCP) to document progress or blockers.

**End:**

1. Provide a brief summary of completed work.
2. If task is fully done, call `complete_task`.
3. Stop execution and wait for user to clear session (`/clear` or `/compact`).

**Context Preservation:**

- DO NOT summarize code in `context.md`
- Store architectural decisions in `.project/decisions/` via `log_decision` MCP tool

## Troubleshooting

**context.md too long?**

```bash
mkdir -p .project/context-archive/
mv .project/context.md .project/context-archive/2025-01-Q1.md
cp .project/_templates/context.md .project/context.md
```

**Hit token limits?**

- Run `.project/scripts/pre-session.sh` before starting
- Archive old context sessions
- Load fewer files in memory
- Use line ranges with view tool
