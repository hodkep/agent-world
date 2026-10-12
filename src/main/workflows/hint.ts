import type { Dial } from '../../shared/workflows'

/** What an agent is told about recording tasks, in the opening text while workflows are on. */
export const WORKFLOW_HINT =
  'This office records tasks. When you start a task that changes code or takes several steps, call the agent-world task_begin tool with a few words; when it is finished, call task_done with one line. Skip both for a question, a typo or a tiny edit. Pass follow_up to task_begin only when the request is more work on the task you just finished (a fix, a missed case, a change to it); a different piece of work is a new task.'
export const WORKFLOW_TOOLS = ['task_begin', 'task_done', 'plan_submit'].map((t) => `mcp__agent-world__${t}`)
/** Said at the start of a turn (by the program's prompt hook) while no task is open: the opening text alone was not followed reliably. */
export const WORKFLOW_REMINDER =
  'Before acting: if this request changes code or takes several steps, call task_begin first (follow_up: true only for more work on the task you just finished, not for a different piece of work), and task_done when it is finished. Skip both for a question, a typo or a tiny edit.'

/** What task_begin answers while the plan gate is on: where the plan goes, the four sections the app checks, and that edits wait for approval. */
export const PLAN_INSTRUCTION =
  'Before changing anything, write your plan to .agent-world/plan.md and call plan_submit. Start the file with these four sections, in this order:\n' +
  '## Goal: one line.\n' +
  '## Assumptions: one bullet each, starting [given] (the request said so) or [guessed] (you filled a gap).\n' +
  '## Out of scope: bullets, or "none".\n' +
  '## Open questions: what the person must decide, one bullet each with the choices as indented bullets, or "none".\n' +
  'Then the steps. Your edits are held back until the person approves the plan; reading and writing the plan itself are fine.'

/** The plan instruction for a dial: economy lets the agent skip the plan for a change that fits in one sentence; the others always ask for it. */
export const planInstruction = (dial: Dial) => (dial === 'economy' ? `If the whole change can be said in one sentence, skip the plan and go ahead; nothing is held back. Otherwise: ${PLAN_INSTRUCTION.charAt(0).toLowerCase()}${PLAN_INSTRUCTION.slice(1)}` : PLAN_INSTRUCTION)
