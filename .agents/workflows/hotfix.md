# Hotfix

Quickly address a critical bug outside the normal task flow.

## Steps

1. Ask the user to describe the bug if not already provided. Clarify:
   - Which service is affected (backend Go, frontend SvelteKit, or MCP server)
   - Whether it is in production or only in development

2. Call `create_task` MCP tool (AIPIM) with:
   - `taskType: "fix"`
   - `priority: "P1-S"`
   - Title and description based on the bug report

3. Call `update_task_status` to set the new task to `in-progress`.

4. Run `git log -3 --oneline` to check recent changes that may have introduced the bug.

5. Report the task ID and proposed fix plan to the user in Portuguese. Wait for approval before writing code.

6. After implementing the fix, call `/complete-task` to close it out.
