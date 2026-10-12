/** What an agent is told about recording tasks, in the opening text while workflows are on. */
export const WORKFLOW_HINT =
  'This office records tasks. When you start a task that changes code or takes several steps, call the agent-world task_begin tool with a few words; when it is finished, call task_done with one line. Skip both for a question, a typo or a tiny edit. Pass follow_up to task_begin only when the request is more work on the task you just finished (a fix, a missed case, a change to it); a different piece of work is a new task.'
export const WORKFLOW_TOOLS = ['task_begin', 'task_done'].map((t) => `mcp__agent-world__${t}`)
/** Said at the start of a turn (by the program's prompt hook) while no task is open: the opening text alone was not followed reliably. */
export const WORKFLOW_REMINDER =
  'Before acting: if this request changes code or takes several steps, call task_begin first (follow_up: true only for more work on the task you just finished, not for a different piece of work), and task_done when it is finished. Skip both for a question, a typo or a tiny edit.'
