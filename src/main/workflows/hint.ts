import type { RunWorkflow } from '../../shared/runs'
import type { SkillState } from '../../shared/skills'
import type { WorkflowEntry } from '../../shared/workflow'
import type { Dial } from '../../shared/workflows'

/** What an agent is told about recording tasks, in the opening text while workflows are on. */
export const WORKFLOW_HINT =
  'This office records tasks. When you start a task that changes code or takes several steps, call the agent-world task_begin tool with a few words; when it is finished, call task_done with one line. Skip both for a question, a typo or a tiny edit. Pass follow_up to task_begin only when the request is more work on the task you just finished (a fix, a missed case, a change to it); a different piece of work is a new task.'
export const WORKFLOW_TOOLS = ['task_begin', 'task_done', 'plan_submit', 'step_done'].map((t) => `mcp__agent-world__${t}`)
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

/** What task_begin says about the workflow the task follows: the steps the agent does or waits on, with their briefs, and how to report them. */
/** What a step's skills are to the agent: the ones it can read with the library tool, and the ones that are not there. `skills` is how each stands in the project; without it they are only named. */
function skillNote(ids: string[] | undefined, states: Record<string, SkillState> | undefined): string {
  if (!ids?.length) return ''
  if (!states) return ` (skill: ${ids.join(', ')})`
  const usable = ids.filter((id) => states[id] !== 'gone')
  const gone = ids.filter((id) => states[id] === 'gone')
  const parts = [usable.length ? `read with library_get: ${usable.join(', ')}` : '', ...gone.map((id) => `there is no skill ${id} in the library, so skip it`)].filter(Boolean)
  return parts.length ? ` (${parts.join('; ')})` : ''
}

export function workflowBrief(w: RunWorkflow, o: { fellBackFrom?: string; planFirst?: boolean; skills?: Record<string, SkillState> } = {}): string {
  const { fellBackFrom, planFirst } = o
  const head = `Workflow: ${w.name}${fellBackFrom ? ` (there is no workflow "${fellBackFrom}", so the project's default was used)` : ''}. Its steps, in order:`
  const lines = w.steps.flatMap((s) => {
    const brief = s.brief ? ` ${s.brief}` : ''
    // The plan line only when a plan is asked for: otherwise the agent would wait for an approval that never comes.
    if (s.kind === 'plan') return !planFirst ? [] : [`- ${s.id} "${s.name}": the person approves your plan before you edit.${brief}`]
    if (s.kind === 'work') return [`- ${s.id} "${s.name}"${skillNote(s.skills, o.skills)}:${brief}`]
    if (s.kind === 'approve') return [`- ${s.id} "${s.name}": the person approves this before it can land.${brief}`]
    return []
  })
  return [head, ...lines, 'Report each step you do with step_done and its id, for example step_done("' + (w.steps.find((s) => s.kind === 'work')?.id ?? 'build') + '"); with no id it reports the next one. The app audits the branch and the person lands it.'].join('\n')
}

const OFFERED_MAX = 5

/** The line of the opening text that lists the project's other workflows, so an agent can pass one to task_begin; nothing when there is no choice. */
export function workflowList(entries: WorkflowEntry[], defaultId: string): string {
  const usable = entries.filter((e) => e.workflow)
  const chosen = usable.find((e) => e.id === defaultId) ?? usable.find((e) => e.id === 'standard')
  const others = usable.filter((e) => e !== chosen).slice(0, OFFERED_MAX)
  if (!chosen || others.length === 0) return ''
  return [`This project has workflows. ${chosen.workflow!.name} is the default; pass one of these to task_begin as "workflow" if it fits better:`, ...others.map((e) => `- ${e.id}${e.workflow!.when ? `: ${e.workflow!.when}` : ''}`)].join('\n')
}
