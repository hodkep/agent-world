import type { RunWorkflow } from '../../shared/runs'
import type { SkillState } from '../../shared/skills'
import type { WorkflowEntry } from '../../shared/workflow'
import type { Dial } from '../../shared/workflows'

/** What an agent is told about recording tasks, in the opening text while workflows are on. */
export const WORKFLOW_HINT =
  'This office records tasks. When you start a task that changes code or takes several steps, call the agent-world task_begin tool with a few words; when it is finished, call task_done with one line. Skip both for a question, a typo or a tiny edit. Pass follow_up to task_begin only when the request is more work on the task you just finished (a fix, a missed case, a change to it); a different piece of work is a new task. Work and commit only on your own branch in your worktree: a commit on any other branch there is refused, and a push or pull request waits for the audit (task_begin says how).'
/** What the app says to the agent once the audit of its branch has passed and the run ends in a pull request: the gate is open, nobody has to ask. */
export const PR_GO = (branch: string, head: string) =>
  `The audit of ${branch} (${head.slice(0, 7)}) has passed. Push a branch whose head is exactly this commit, your own branch or another name for the same commit (git push origin ${branch}:<name>), and open the pull request. Do not add commits first: a branch with other commits is held.`
export const WORKFLOW_TOOLS = ['task_begin', 'task_done', 'plan_submit', 'step_done'].map((t) => `mcp__agent-world__${t}`)
/** Said at the start of a turn (by the program's prompt hook) while no task is open: the opening text alone was not followed reliably. */
export const WORKFLOW_REMINDER =
  'Before acting: if this request changes code or takes several steps, call task_begin first (follow_up: true only for more work on the task you just finished, not for a different piece of work), and task_done when it is finished. Skip both for a question, a typo or a tiny edit.'

/** The reminder for one turn: only while workflows are on and the agent (not the builder, not a subagent) has no task open, so it costs nothing once a task is announced. */
export const workflowRemind = (o: { enabled: boolean; subagent: boolean; builder: boolean; open: boolean }): string => (o.enabled && !o.subagent && !o.builder && !o.open ? WORKFLOW_REMINDER : '')

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

/** The things in brackets after a step's name: its skills, that it is optional, that it waits for the person's Run. */
function notes(s: { skills?: string[]; optional?: boolean; start?: string }, skills: Record<string, SkillState> | undefined, may: { optional?: boolean; start?: boolean }): string {
  const skill = skillNote(s.skills, skills).replace(/^ \(|\)$/g, '')
  const parts = [skill, may.optional && s.optional ? 'optional: the person may skip it' : '', may.start && s.start === 'run' ? 'starts when the person presses Run: wait until you are told, and change nothing before' : ''].filter(Boolean)
  return parts.length ? ` (${parts.join('; ')})` : ''
}

export function workflowBrief(w: RunWorkflow, o: { fellBackFrom?: string; planFirst?: boolean; skills?: Record<string, SkillState> } = {}): string {
  const { fellBackFrom, planFirst } = o
  const head = `Workflow: ${w.name}${fellBackFrom ? ` (there is no workflow "${fellBackFrom}", so the project's default was used)` : ''}. Its steps, in order:`
  const lines = w.steps.flatMap((s) => {
    const brief = s.brief ? ` ${s.brief}` : ''
    // The plan line only when a plan is asked for: otherwise the agent would wait for an approval that never comes.
    if (s.kind === 'plan') return !planFirst ? [] : [`- ${s.id} "${s.name}"${notes(s, o.skills, { start: true })}: the person approves your plan before you edit.${brief}`]
    if (s.kind === 'work') return [`- ${s.id} "${s.name}"${notes(s, o.skills, { optional: true, start: true })}:${brief}`]
    if (s.kind === 'approve') return [`- ${s.id} "${s.name}"${s.optional ? ' (optional: the person may skip it)' : ''}: the person approves this before it can land.${brief}`]
    if (s.kind === 'pr' && (s.brief || s.skills?.length)) return [`- ${s.id} "${s.name}"${skillNote(s.skills, o.skills)}: when you open the pull request${s.brief ? `, ${s.brief}` : '.'}`]
    return []
  })
  const landing = w.steps.find((s) => s.kind === 'pr' || s.kind === 'merge')?.kind
  // An older run may still have an audit the app does; the workflows made now have none: the agent reviews its own work in a step, and the person is asked once, before the step.
  const audited = w.steps.some((s) => s.kind === 'audit')
  const rules = !landing ? [] : [
    `Work and commit only on your own branch in this worktree: a commit on any other branch here is refused${audited ? ', and the app audits your branch, not another' : ''}.`,
    ...(landing === 'pr'
      ? [audited
          ? 'Do not push or open a pull request until the app tells you the audit passed. Then push a branch whose head is exactly that audited commit (your own branch, or another name for the same commit: git push origin <your branch>:<name>) and open the pull request; a push of anything else is held.'
          : 'Do not push or open a pull request until the person has told you to start that step. Then push your branch (git push origin <your branch>) and open the pull request.']
      : [])
  ]
  const first = w.steps.find((s) => s.kind === 'work')?.id ?? 'build'
  return [head, ...lines, ...rules, `Report each step you do, in order, with step_done and its id, for example step_done("${first}"); with no id it reports the next one. A step that is optional and does not apply to this task is skipped with step_done("${first}", skipped), using its own id. ${audited ? 'The app audits the branch and the person lands it.' : 'The person lands it.'}`].join('\n')
}

const OFFERED_MAX = 5

/** The line of the opening text that lists the project's other workflows, so an agent can pass one to task_begin; nothing when there is no choice. */
export function workflowList(entries: WorkflowEntry[], defaultId: string): string {
  const usable = entries.filter((e) => e.workflow)
  const chosen = usable.find((e) => e.id === defaultId) ?? usable.find((e) => e.id === 'standard')
  const others = usable.filter((e) => e !== chosen).slice(0, OFFERED_MAX)
  if (!chosen || others.length === 0) return ''
  return [`This project has workflows. ${chosen.workflow!.name} is the default: use it unless another one's description covers the whole task, and then pass its id to task_begin as "workflow". A description says what a workflow is for and does not stretch to other work (copy changes do not cover new code or new tests); when in doubt, use ${chosen.workflow!.name}:`, ...others.map((e) => `- ${e.id}${e.workflow!.when ? `: ${e.workflow!.when}` : ''}`)].join('\n')
}
