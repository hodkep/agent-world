import type { SkillState } from './skills'
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

const FIELDS = ['kind', 'name', 'gate', 'brief', 'start', 'optional', 'skills', 'run', 'retries', 'model'] as const
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

/** One save of a workflow through the builder: when, how, who saved it, and in a line what it changed. */
export interface HistoryEntry {
  at: number
  how: SaveHow
  by: string
  summary: string
}

/** One line for a history entry: what a save changed in a workflow. */
export function diffSummary(d: WorkflowDiff): string {
  if (d.isNew) return `created with ${d.added.length} step${d.added.length === 1 ? '' : 's'}`
  const parts = [
    ...(d.name ? [`renamed to "${d.name.to}"`] : []),
    ...(d.when ? ['"when" reworded'] : []),
    ...(d.added.length ? [`added ${d.added.map((a) => a.name).join(', ')}`] : []),
    ...d.changed.map((c) => `changed ${c.name} (${c.fields.join(' · ')})`),
    ...(d.removed.length ? [`removed ${d.removed.map((r) => r.name).join(', ')}`] : []),
    ...(d.reordered ? ['steps reordered'] : [])
  ]
  return parts.length ? parts.join('; ') : 'no change'
}

/** The agent the person talks to about workflows: one per project, named so, and found again by this job title. */
export const BUILDER_NAME = 'builder'
export const BUILDER_ROLE = 'Workflow builder'
/** The tools only the builder is given. */
export const BUILDER_TOOLS = ['workflow_list', 'workflow_get', 'workflow_history', 'workflow_propose'] as const
/** What the builder may use without being asked each time: its own tools and the project's notes, which it only reads. */
export const BUILDER_ALLOWED = [...BUILDER_TOOLS, 'recall'] as const

const KIND_DOES: Record<StepKind, string> = {
  plan: 'the agent writes a plan for the person to read. Fields: brief, skills, start.',
  work: 'the agent does the work and reports it. Fields: brief (what to do or how), skills (names of library skills it should read), start.',
  check: `the app runs the command "run" in the agent's worktree and a failure goes back to the agent, up to "retries" times (0 to 5, ${DEFAULT_RETRIES} if left out). Needs run. Gate pass means landing waits until it passes; approve means it must pass and then the person approves it; auto only reports. Fields: brief (what it is for), start.`,
  audit: 'a model reads the branch against the plan and lists what does not match. Fields: brief (what to look at as well), model (leave out unless asked), start.',
  approve: 'the person must approve before anything goes on, like a review. Fields: brief (what to look at). It always stops.',
  pr: "the agent opens a pull request; git holds the push of its branch until the plan is approved and the review's findings were seen, and CI and the merge are GitHub's. Gate approve makes the person confirm; auto leaves it to the settings. Fields: brief (what goes in the pull request), skills, start. Put it last.",
  merge: 'the person lands the work with a merge into the base branch. Gate approve makes them confirm; auto leaves it to the settings. Use pr instead when the work goes through a pull request.'
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
    { "id": "pr", "kind": "pr", "name": "Pull request", "gate": "approve" }
  ]
}`

/** What the builder is told when it is hired. Built from the file format's own tables, so it never describes a step the app would refuse. */
export function builderInstructions(): string {
  const kinds = STEP_KINDS.map((k) => `- ${k}: ${KIND_DOES[k]} Gates: ${GATES[k].join(', ')}.`).join('\n')
  return `You are the workflow builder of this project. A workflow is the list of steps an agent's task goes through here. You talk with the person and propose workflows that fit how they work.
You never write a file. You hand a draft to the person with workflow_propose, and only they save it, from a button beside this chat. You also change nothing else in the project: you only read.

Tools: ${BUILDER_TOOLS.join(', ')}.
- workflow_list shows the workflows that exist, and the skills you can name on a work step. Call it first.
- workflow_get gives one as its file. To change one, start from it and keep everything the person did not ask to change, with the same id.
- workflow_history lists the changes saved to one before, newest first, with when and what changed. Read it before changing a saved workflow, so you do not undo a change the person made on purpose, and to answer why a step is there.
- workflow_propose takes the whole file as JSON text. If it is wrong you get every problem back at once: fix them and call it again.

How to work
- Ask one short question at a time, and only when the answer would change the workflow. Prefer a sensible default to a question.
- Look in the project (package.json, Makefile, CI files, scripts) for the real commands that run tests, lint and type checks. Never invent a command. If you cannot find one, ask.
- Keep it short: most workflows need three to seven steps, never more than ${STEPS_MAX}. Steps run in the order listed.
- A work step may name library skills the agent reads. Name only skills under "Skills you can name"; never invent a skill. If the person asks for one that is not listed, leave it out and say so in your reply. One marked as not in the project's playbook is fine to use: the step lets agents read it, and the person sees a note.
- "when" is one sentence saying which tasks the workflow fits. Agents read it to choose between workflows, so make it specific.
- After workflow_propose works, say in a sentence or two what the draft does and what to say if they want it different. Do not paste the file into the chat: the person sees the draft beside it.

The file is one JSON object: version (1), id (lowercase letters, digits and dashes), name, when, steps. Each step has an id (unique, same characters), a kind, and optionally name and gate.
Every step may also have: "brief" (up to 600 characters: what the agent is told, what a reviewer looks at, or what the person reads), "start": "run" (on a plan, work, check, audit or pr step: nothing starts, and the agent edits nothing, until the person presses Run), "optional": true (on a work, check, audit or approve step: the person can skip it and the run goes on) and "skills" (on a plan, work or pr step). Use start and optional only when the person asks for that.
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
  /** How each skill the draft names stands in this project. */
  skills: Record<string, SkillState>
  commands: ProposedCommand[]
  /** How many things the person changed in the builder's draft; none when they changed nothing. */
  edited?: number
  at: number
}

/** Where a proposal is saved: a new file in the project or for everything, over the saved one, or as a copy beside it. */
export type SaveHow = 'project' | 'global' | 'replace' | 'copy'

/** The project's builder, if the office has made one. */
export const builderAgent = (agents: AgentRecord[], repoPath: string): AgentRecord | undefined => agents.find((a) => a.builder && a.repoPath === repoPath)

/** How the builder is launched: on the program chosen, in the folder itself, read-only, with its instructions. */
export const builderOptions = (provider: 'claude' | 'agy'): AgentOptions => ({ provider, role: BUILDER_ROLE, inPlace: true, permissionMode: 'plan', instructions: builderInstructions() })

/** The program the builder runs on: the person's default when it can use the office's tools (`usable`), else the first that can (claude, then agy). */
export function builderProgram(preferred: string, usable: ('claude' | 'agy')[]): 'claude' | 'agy' | undefined {
  return usable.find((p) => p === preferred) ?? usable.find((p) => p === 'claude') ?? usable[0]
}

/** `builder`, or `builder-2` and on when the name is taken (another project's builder has it). */
export function builderName(taken: string[]): string {
  let name = BUILDER_NAME
  for (let n = 2; taken.includes(name); n++) name = `${BUILDER_NAME}-${n}`
  return name
}
