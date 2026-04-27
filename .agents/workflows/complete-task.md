# Complete Task

Finalize and close the current task.

## Steps

1. Ask the user to confirm which task is being completed, if not already clear from context.

2. Run `git status` and `git log -3 --oneline` to verify the committed changes.

3. Call `add_comment` MCP tool (AIPIM) with a summary of what was implemented, including:
   - What was done
   - Files changed
   - Any known limitations or follow-ups

4. Call `complete_task` MCP tool (AIPIM) with the task ID and a brief `notes` summary.

5. Call `/start-session` to reload the project context and show the next recommended task.
