---
description: Always-on rule for project management. Enforces that all task reading, writing, and status updates are done exclusively via AIPIM MCP tools. Apply whenever the user mentions tasks, sessions, backlogs, project management, or asks to start/resume/complete work.
activation: always_on
---

# Project Management via MCP (AIPIM)

## Golden Rule

**NEVER read or write task files manually.** The `.project/backlog/`, `.project/completed/`, and `.project/decisions/` directories are managed exclusively by the AIPIM MCP server at `http://localhost:3141/mcp`. Any direct file access to these directories is forbidden.

## Available AIPIM Tools

| Tool | When to use |
|---|---|
| `get_project_context` | MANDATORY at the start of every session |
| `get_task` | Fetch a specific task by ID (e.g. `TASK-019`) |
| `list_tasks` | List tasks filtered by status or priority |
| `get_next_task` | Get the highest-priority pending task |
| `get_blockers` | List all blocked tasks |
| `update_task_status` | Change status: `backlog` → `in-progress` → `review` |
| `add_comment` | Log progress or blockers to a task |
| `complete_task` | Mark a task as done (moves file to completed/) |
| `log_decision` | Record an ADR in `.project/decisions/` |
| `create_task` | Create a new task in the backlog |

## Task ID Format

Tasks use the format `TASK-XXX` (e.g. `TASK-019`). When the user says "task 19", interpret it as `TASK-019`.

## Session Lifecycle

1. **Start:** Call `get_project_context` first, always.
2. **Work:** Call `get_task` to load task details. Update status to `in-progress` via `update_task_status`. Use `add_comment` to document decisions.
3. **End:** Call `complete_task` when done. Never end a session without calling `add_comment` with a progress summary.
