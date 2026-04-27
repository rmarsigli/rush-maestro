# Begin Task

Load and start work on a specific task. The user must provide the task number or ID.

## Steps

1. Parse the task ID from the user's message. Accept formats like "task 19", "TASK-019", "T019", or just "19". Normalize to the format `TASK-XXX` (zero-padded to 3 digits, e.g. `TASK-019`).

2. Call `get_task` MCP tool (AIPIM) with the parsed task ID to fetch the full task details, including description, acceptance criteria, and comments.

3. Call `update_task_status` MCP tool (AIPIM) to set the task status to `in-progress`.

4. Call `git log -1 --oneline` in the terminal to check the current state of the repo.

5. Report back to the user in Portuguese with:
   - Task title and description
   - Acceptance criteria (summarized)
   - Proposed implementation plan based on the task details
   - Files likely to be affected (backend/ or frontend/)

6. Wait for the user to confirm the plan before writing any code.
