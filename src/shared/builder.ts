import { DEFAULT_RETRIES } from './steps'
import type { AgentOptions, AgentRecord } from './types'
import { GATES, STEPS_MAX, STEP_KINDS, type Scope, type Step, type StepKind, type Workflow, commandDiff, stepName } from './workflow'

/** One step that is in both versions with something different in it, and what. */
export interface StepChange {
  id: string
  name: string
  fields: string[]
}

/** What a proposed workflow would change in the saved one, in the words the proposal card shows. */
export interface WorkflowDiff {
  /** Nothing was saved under this id. */
  isNew: boolean
  /** Not one difference. */
  same: boolean
  name?: { from: string; to: string }
  when?: boolean
  added: { id: string; name: string; kind: Step['kind']; /** The step it follows; none when it comes first. */ after?: string }[]
  removed: { id: string; name: string; kind: Step['kind'] }[]
  changed: StepChange[]
  /** Steps both versions have are in another order. */
  reordered: boolean
  /** Names of the steps that did not change. */
  unchanged: string[]
  commands: ReturnType<typeof commandDiff>
}

const FIELDS = ['kind', 'name', 'gate', 'brief', 'skills', 'run', 'retries', 'model'] as const
const show = (v: unknown) => (v === undefined ? 'none' : Array.isArray(v) ? v.join(', ') : String(v))
const LONG = 60

function fieldChanges(a: Step, b: Step): string[] {
  const out: string[] = []
  for (const f of FIELDS) {
    const x = a[f]
    const y = b[f]
    if (show(x) === show(y)) continue
    out.push(f === 'brief' || (typeof x === 'string' && typeof y === 'string' && x.length > LONG && y.length > LONG) ? `${f} rewritten` : `${f} ${show(x)} → ${show(y)}`)
  }
  return out
}

const commandsOf = (w: Workflow | undefined) => [...new Set((w?.steps ?? []).flatMap((s) => (s.kind === 'check' && s.run ? [s.run] : [])))]

/** The proposal against the saved workflow with the same id (none when it is new). Steps are matched by id. */
export function workflowDiff(saved: Workflow | undefined, proposed: Workflow): WorkflowDiff {
  const before = new Map((saved?.steps ?? []).map((s) => [s.id, s]))
  const after = new Map(proposed.steps.map((s) => [s.id, s]))
  const added = proposed.steps.flatMap((s, i) => (before.has(s.id) ? [] : [{ id: s.id, name: stepName(s), kind: s.kind, ...(i > 0 && { after: stepName(proposed.steps[i - 1]!) }) }]))
  const removed = (saved?.steps ?? []).filter((s) => !after.has(s.id)).map((s) => ({ id: s.id, name: stepName(s), kind: s.kind }))
  const changed: StepChange[] = []
  const unchanged: string[] = []
  for (const s of proposed.steps) {
    const was = before.get(s.id)
    if (!was) continue
    const fields = fieldChanges(was, s)
    if (fields.length) changed.push({ id: s.id, name: stepName(was), fields })
    else unchanged.push(stepName(s))
  }
  const common = (w: Workflow, other: Map<string, Step>) => w.steps.filter((s) => other.has(s.id)).map((s) => s.id)
  const reordered = !!saved && common(saved, after).join() !== common(proposed, before).join()
  const name = saved && saved.name !== proposed.name ? { from: saved.name, to: proposed.name } : undefined
  const when = !!saved && (saved.when ?? '') !== (proposed.when ?? '')
  const commands = commandDiff(commandsOf(saved), commandsOf(proposed))
  const same = !!saved && !added.length && !removed.length && !changed.length && !reordered && !name && !when
  return { isNew: !saved, same, ...(name && { name }), ...(when && { when }), added, removed, changed, reordered, unchanged, commands }
}

/** The agent the person talks to about workflows: one per project, named so, and found again by this job title. */
export const BUILDER_NAME = 'builder'
export const BUILDER_ROLE = 'Workflow builder'
/** The tools only the builder is given. */
export const BUILDER_TOOLS = ['workflow_list', 'workflow_get', 'workflow_propose'] as const

const KIND_DOES: Record<StepKind, string> = {
  plan: 'the agent writes a plan for the person to read. Fields: brief.',
  work: 'the agent does the work and reports it. Fields: brief (what to do or how), skills (names of library skills it should read).',
  check: `the app runs the command "run" in the agent's worktree and a failure goes back to the agent, up to "retries" times (0 to 5, ${DEFAULT_RETRIES} if left out). Needs run. Gate pass means landing waits until it passes; auto only reports.`,
  audit: 'a model reads the branch against the plan and lists what does not match. Fields: model (leave out unless asked).',
  approve: 'the person must approve before anything goes on, like a review. Fields: brief (what to look at). It always stops.',
  merge: 'the person lands the work. Gate approve makes them confirm; auto leaves it to the settings.'
}

const EXAMPLE = `{
  "version": 1,
  "id": "bug-fix",
  "name": "Bug fix",
  "when": "A defect with a known symptom: something that used to work, or should, and does not.",
  "steps": [
    { "id": "plan", "kind": "plan", "gate": "approve", "brief": "Name the symptom and the likely cause. Say what you would not touch." },
    { "id": "fix", "kind": "work", "name": "Fix, test first", "brief": "Write a failing test that shows the bug, then make it pass." },
    { "id": "tests", "kind": "check", "name": "Tests pass", "run": "npm test", "gate": "pass", "retries": 3 },
    { "id": "review", "kind": "audit" },
    { "id": "land", "kind": "merge", "gate": "approve" }
  ]
}`

/** What the builder is told when it is hired. Built from the file format's own tables, so it never describes a step the app would refuse. */
export function builderInstructions(): string {
  const kinds = STEP_KINDS.map((k) => `- ${k}: ${KIND_DOES[k]} Gates: ${GATES[k].join(', ')}.`).join('\n')
  return `You are the workflow builder of this project. A workflow is the list of steps an agent's task goes through here. You talk with the person and propose workflows that fit how they work.
You never write a file. You hand a draft to the person with workflow_propose, and only they save it, from a button beside this chat. You also change nothing else in the project: you only read.

Tools: ${BUILDER_TOOLS.join(', ')}.
- workflow_list shows the workflows that exist. Call it first.
- workflow_get gives one as its file. To change one, start from it and keep everything the person did not ask to change, with the same id.
- workflow_propose takes the whole file as JSON text. If it is wrong you get every problem back at once: fix them and call it again.

How to work
- Ask one short question at a time, and only when the answer would change the workflow. Prefer a sensible default to a question.
- Look in the project (package.json, Makefile, CI files, scripts) for the real commands that run tests, lint and type checks. Never invent a command. If you cannot find one, ask.
- Keep it short: most workflows need three to seven steps, never more than ${STEPS_MAX}. Steps run in the order listed.
- "when" is one sentence saying which tasks the workflow fits. Agents read it to choose between workflows, so make it specific.
- After workflow_propose works, say in a sentence or two what the draft does and what to say if they want it different. Do not paste the file into the chat: the person sees the draft beside it.

The file is one JSON object: version (1), id (lowercase letters, digits and dashes), name, when, steps. Each step has an id (unique, same characters), a kind, and optionally name and gate.
${kinds}

Example:
\`\`\`json
${EXAMPLE}
\`\`\``
}

/** A command a proposal would run, and whether the person already approved it in an earlier version of this workflow. */
export interface ProposedCommand {
  text: string
  known: boolean
}

/** The builder's draft as the Workflows window shows it. */
export interface ProposalView {
  workflow: Workflow
  diff: WorkflowDiff
  /** The workflow with this id that is saved now; none when the id is new. */
  saved?: { scope: Scope }
  /** What is saved under this id is not what the proposal was made against. */
  stale: boolean
  commands: ProposedCommand[]
  at: number
}

/** Where a proposal is saved: a new file in the project or for everything, over the saved one, or as a copy beside it. */
export type SaveHow = 'project' | 'global' | 'replace' | 'copy'

/** The project's builder, if the office has made one. */
export const builderAgent = (agents: AgentRecord[], repoPath: string): AgentRecord | undefined => agents.find((a) => a.builder && a.repoPath === repoPath)

/** How the builder is launched: Claude, in the folder itself, read-only, with its instructions. */
export const builderOptions = (): AgentOptions => ({ provider: 'claude', role: BUILDER_ROLE, inPlace: true, permissionMode: 'plan', instructions: builderInstructions() })

/** `builder`, or `builder-2` and on when the name is taken (another project's builder has it). */
export function builderName(taken: string[]): string {
  let name = BUILDER_NAME
  for (let n = 2; taken.includes(name); n++) name = `${BUILDER_NAME}-${n}`
  return name
}
