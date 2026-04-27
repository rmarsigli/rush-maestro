# Start Session

Start a new development session by loading the full project context.

## Steps

1. Call the `get_project_context` MCP tool (AIPIM at `http://localhost:3141/mcp`). This returns the current project state, active tasks, blockers, and the recommended next action.

2. Run the terminal command `git log -1 --oneline` to see what was last committed.

3. Report back to the user in Portuguese with a concise summary:
   - Current active task (if any)
   - Next recommended task from `next_action`
   - Any blockers found
   - Last commit

4. Ask the user how they want to proceed. Do not start implementing anything until explicitly instructed.
