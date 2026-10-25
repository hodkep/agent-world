import type { RunWorkflow } from './runs'
import type { SkillState } from './skills'

/**
 * A workflow is a list of steps an agent's task goes through, kept as a JSON file. The engine follows it; the app checks it in code,
 * so a file written by hand or proposed by the builder is either valid or comes back with every problem named.
 */
export const STEP_KINDS = ['plan', 'work', 'check', 'audit', 'approve', 'pr', 'merge'] as const
export type StepKind = (typeof STEP_KINDS)[number]
/** The two steps that end a run: `pr` holds the push of the agent's branch (the pull request, CI and the merge are GitHub's), `merge` holds a merge into the base branch. */
export const isLanding = (k: StepKind) => k === 'pr' || k === 'merge'
/** Which landing step a workflow ends in, if any: what the office holds (a push, or a merge) and how its cards word it. */
export const landingKind = (wf: { steps: readonly { kind: StepKind }[] } | undefined): 'pr' | 'merge' | undefined => wf?.steps.find((s) => isLanding(s.kind))?.kind as 'pr' | 'merge' | undefined
export type Gate = 'auto' | 'approve' | 'pass'
/** How a step starts: by itself, or when the person presses Run ("generate the plan", "build it", run the tests, audit, push). Only what the person does themselves cannot wait for their press. */
export type Start = 'auto' | 'run'
export const START_KINDS: StepKind[] = ['plan', 'work', 'check', 'audit', 'pr']

export interface Step {
  id: string
  kind: StepKind
  name?: string
  gate?: Gate
  /** What the agent is told at this step, what a reviewer looks for, or what the person reads on its card. */
  brief?: string
  start?: Start
  /** The person can skip it: it does not hold the run when they do. */
  optional?: boolean
  skills?: string[]
  run?: string
  retries?: number
  model?: string
}
export interface Workflow {
  version: 1
  id: string
  name: string
  when?: string
  steps: Step[]
}
export type WorkflowResult = { ok: true; workflow: Workflow } | { ok: false; problems: string[] }

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const STEPS_MAX = 12
const STEP_ID_MAX = 30
/** Where each kind can stop: `pass` is a check that must pass; `approve` is the person's approval (after a check, once it has passed). */
export const GATES: Record<StepKind, Gate[]> = { plan: ['auto', 'approve'], work: ['auto', 'approve'], check: ['auto', 'pass', 'approve'], audit: ['auto', 'approve'], approve: ['approve'], pr: ['auto', 'approve'], merge: ['auto', 'approve'] }
/** The kinds the agent does, which can be told to read skills. */
export const SKILL_KINDS: StepKind[] = ['plan', 'work', 'pr']
/** The kinds that can be passed over by the person: what is not the way a run ends or is held. */
export const OPTIONAL_KINDS: StepKind[] = ['work', 'check', 'audit', 'approve']
const orList = (w: string[]) => (w.length < 2 ? w.join('') : `${w.slice(0, -1).join(', ')} or ${w.at(-1)}`)
const STEP_FIELDS = ['id', 'kind', 'name', 'gate', 'brief', 'start', 'optional', 'skills', 'run', 'retries', 'model']
const TOP = ['version', 'id', 'name', 'when', 'steps']
/** Whether `v` can be a workflow's id, and so the name of its file. */
export const isWorkflowId = (v: unknown): v is string => typeof v === 'string' && ID.test(v) && v.length <= 40
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

/** What is wrong with one step, each message starting with where it is. `seen` holds the ids used so far, with the step that used them. */
function stepProblems(raw: unknown, n: number, seen: Map<string, number>): string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [`Step ${n} must be an object.`]
  const s = raw as Record<string, unknown>
  const idOk = typeof s.id === 'string' && ID.test(s.id) && s.id.length <= STEP_ID_MAX
  const at = `Step ${n}${idOk ? ` ("${s.id}")` : ''}`
  const out: string[] = []
  if (!idOk) out.push(`${at}: "id" must be lowercase letters, digits and dashes, up to ${STEP_ID_MAX} characters.`)
  else if (seen.has(s.id as string)) out.push(`${at}: the id is already used by step ${seen.get(s.id as string)}.`)
  else seen.set(s.id as string, n)
  if (!STEP_KINDS.includes(s.kind as StepKind)) out.push(`${at}: "kind" must be one of ${STEP_KINDS.join(', ')}.`)
  const kind = STEP_KINDS.find((k) => k === s.kind)
  if (kind) {
    if (s.name !== undefined && !isText(s.name, 40)) out.push(`${at}: "name" must be text of up to 40 characters.`)
    if (s.gate !== undefined && !GATES[kind].includes(s.gate as Gate)) out.push(`${at}: "gate" for ${kind === 'approve' ? 'an' : 'a'} ${kind} step must be ${orList(GATES[kind])}.`)
    if (kind === 'check') {
      if (!isText(s.run, 300)) out.push(`${at}: a check step needs "run", the command to run.`)
      if (s.retries !== undefined && !(Number.isInteger(s.retries) && (s.retries as number) >= 0 && (s.retries as number) <= 5)) out.push(`${at}: "retries" must be a whole number from 0 to 5.`)
    } else {
      if (s.run !== undefined) out.push(`${at}: "run" only belongs on a check step.`)
      if (s.retries !== undefined) out.push(`${at}: "retries" only belongs on a check step.`)
    }
    if (s.model !== undefined && kind !== 'audit') out.push(`${at}: "model" only belongs on an audit step.`)
    else if (s.model !== undefined && !isText(s.model, 40)) out.push(`${at}: "model" must be a model name of up to 40 characters.`)
    if (s.brief !== undefined && !isText(s.brief, 600)) out.push(`${at}: "brief" must be text of up to 600 characters.`)
    if (s.optional !== undefined) {
      if (!OPTIONAL_KINDS.includes(kind)) out.push(`${at}: "optional" only belongs on a work, check, audit or approve step.`)
      else if (typeof s.optional !== 'boolean') out.push(`${at}: "optional" must be true or false.`)
    }
    if (s.start !== undefined) {
      if (!START_KINDS.includes(kind)) out.push(`${at}: "start" only belongs on a plan, work, check, audit or pr step.`)
      else if (s.start !== 'auto' && s.start !== 'run') out.push(`${at}: "start" must be auto or run.`)
    }
    if (s.skills !== undefined) {
      if (!SKILL_KINDS.includes(kind)) out.push(`${at}: "skills" only belongs on a plan, work or pr step.`)
      else if (!Array.isArray(s.skills) || s.skills.length > 8 || !s.skills.every((x) => isText(x, 60))) out.push(`${at}: "skills" must be a list of up to 8 names, each up to 60 characters.`)
    }
  }
  for (const k of Object.keys(s)) if (!STEP_FIELDS.includes(k)) out.push(`${at}: unknown field "${k}". Allowed: ${STEP_FIELDS.join(', ')}.`)
  return out
}

export function parseWorkflow(text: string): WorkflowResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, problems: [`Not valid JSON: ${(e as Error).message}`] }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, problems: ['The file must be one JSON object.'] }
  const f = raw as Record<string, unknown>
  const problems: string[] = []
  if (f.version !== 1) problems.push('"version" must be 1.')
  if (!isWorkflowId(f.id)) problems.push('"id" must be lowercase letters, digits and dashes (like "bug-fix"), up to 40 characters.')
  if (!isText(f.name, 60)) problems.push('"name" is required: a short title, up to 60 characters.')
  if (f.when !== undefined && !isText(f.when, 300)) problems.push('"when" must be text of up to 300 characters.')
  for (const k of Object.keys(f)) if (!TOP.includes(k)) problems.push(`Unknown field "${k}". Allowed: ${TOP.join(', ')}.`)
  if (!Array.isArray(f.steps) || f.steps.length < 1 || f.steps.length > STEPS_MAX) problems.push(`"steps" must be a list of 1 to ${STEPS_MAX} steps.`)
  if (Array.isArray(f.steps)) {
    const seen = new Map<string, number>()
    f.steps.forEach((step, i) => problems.push(...stepProblems(step, i + 1, seen)))
  }
  if (problems.length) return { ok: false, problems }
  return { ok: true, workflow: f as unknown as Workflow }
}

/** The built-in pipeline: plan, build, audit, then the pull request (the push of the agent's branch is what is held). Its plan and pull request follow the Settings switches. */
export const STANDARD: Workflow = {
  version: 1,
  id: 'standard',
  name: 'Standard',
  when: "The fallback, for work that none of this project's other workflows describes.",
  steps: [
    { id: 'plan', kind: 'plan' },
    { id: 'build', kind: 'work', name: 'Build' },
    { id: 'review', kind: 'audit', name: 'Audit' },
    { id: 'pr', kind: 'pr', name: 'Pull request' }
  ]
}

const KIND_NAME: Record<StepKind, string> = { plan: 'Plan', work: 'Build', check: 'Check', audit: 'Audit', approve: 'Your approval', pr: 'Pull request', merge: 'Land' }
/** What a step is called where a person reads it: its own name, else its kind's. */
export const stepName = (s: Step) => s.name ?? KIND_NAME[s.kind]

export interface Chip {
  id: string
  kind: StepKind
  label: string
  /** The step waits for the person. */
  stops: boolean
}

/**
 * The workflow a new task follows: the one it asked for, else the project's default, else Standard. A project that uses no workflow (`defaultId` is "none") follows
 * none unless the task asks for one that is there. A file with problems is never picked.
 */
export function pickEntry(entries: WorkflowEntry[], requested: string | undefined, defaultId: string): WorkflowEntry | undefined {
  const usable = entries.filter((e) => e.workflow)
  const asked = usable.find((e) => e.id === requested)
  if (asked) return asked
  return defaultId === 'none' ? undefined : (usable.find((e) => e.id === defaultId) ?? usable.find((e) => e.id === 'standard'))
}

/** The steps as the list draws them. A plan or merge step that names no gate follows its Settings switch; an approve step always stops. */
export function stepChips(wf: Workflow, switches: { planGate: boolean; mergeGate: boolean }): Chip[] {
  return wf.steps.map((s) => {
    const own = s.gate !== undefined ? s.gate === 'approve' : undefined
    const inherited = s.kind === 'plan' ? switches.planGate : isLanding(s.kind) ? switches.mergeGate : false
    return { id: s.id, kind: s.kind, label: s.name ?? KIND_NAME[s.kind], stops: s.kind === 'approve' || s.start === 'run' || (own ?? inherited) }
  })
}

export type Scope = 'built-in' | 'global' | 'project'

/** One workflow as the list shows it: where it came from and, for a file that does not read, why not. */
export interface WorkflowEntry {
  id: string
  scope: Scope
  workflow?: Workflow
  /** Set when the file does not read: everything wrong with it. */
  problems?: string[]
  /** The file it was read from; none for the built-in Standard. */
  file?: string
  /** A fingerprint of the file's content: what a person's approval of its commands is tied to. */
  hash?: string
  /** How each skill its steps name stands in the project: ready, granted by the step, or gone. Left out when it names none. */
  skills?: Record<string, SkillState>
  /** What this one shadows: a project's workflow over a global one, or any file over the built-in Standard. */
  overrides?: Scope
}

/** The workflow as a run keeps it: every step with a name, and the hash of the file it came from. */
export function toRunWorkflow(wf: Workflow, hash?: string, scope?: 'project' | 'global'): RunWorkflow {
  return { id: wf.id, name: wf.name, ...(hash && { hash }), ...(scope && { scope }), steps: wf.steps.map((s) => ({ ...s, name: s.name ?? KIND_NAME[s.kind] })) }
}

/** The command of each check step, in order, each once: what approving the workflow's file lets the app run. */
export const checkCommands = (wf: RunWorkflow): string[] => [...new Set(wf.steps.flatMap((s) => (s.kind === 'check' && s.run ? [s.run] : [])))]

/** This version's commands against an older approved version: new ones first, then what is gone, then what stayed. */
export function commandDiff(before: string[], after: string[]): { change: 'added' | 'removed' | 'same'; text: string }[] {
  return [
    ...after.filter((c) => !before.includes(c)).map((text) => ({ change: 'added' as const, text })),
    ...before.filter((c) => !after.includes(c)).map((text) => ({ change: 'removed' as const, text })),
    ...after.filter((c) => before.includes(c)).map((text) => ({ change: 'same' as const, text }))
  ]
}
