# Check Blockers

Review all blocked tasks and decide next steps.

## Steps

1. Call `get_blockers` MCP tool (AIPIM) to list all blocked tasks with how long they have been blocked.

2. For each blocked task, call `get_task` to retrieve full details and the blocking reason.

3. Report back to the user in Portuguese with:
   - List of blocked tasks sorted by time blocked (longest first)
   - Blocking reason for each
   - Suggested resolution for each (based on task context)

4. Ask the user which blocker to address first. Do not make changes until instructed.
