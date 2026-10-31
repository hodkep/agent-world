import { GATES, OPTIONAL_KINDS, SKILL_KINDS, SKIPPABLE_KINDS, START_KINDS, STEPS_MAX, isLanding, type Step, type StepKind, type Workflow } from './workflow'

/** The fields of a step that the draft's editor changes; an empty text or list takes the field away. */
export type StepPatch = Partial<Pick<Step, 'name' | 'gate' | 'brief' | 'start' | 'optional' | 'skippable' | 'skills' | 'run' | 'retries' | 'model'>>

const withSteps = (w: Workflow, steps: Step[]): Workflow => ({ ...w, steps })

/** A step moved one place up (-1) or down (1); nothing moves past either end. */
export function moveStep(w: Workflow, at: number, by: -1 | 1): Workflow {
  const to = at + by
  if (at < 0 || at >= w.steps.length || to < 0 || to >= w.steps.length) return w
  const steps = [...w.steps]
  ;[steps[at], steps[to]] = [steps[to]!, steps[at]!]
  return withSteps(w, steps)
}

/** A step moved to place `to` (counted before it was taken out), as when it is dragged there; a place past either end is the end. */
export function moveStepTo(w: Workflow, at: number, to: number): Workflow {
  if (at < 0 || at >= w.steps.length) return w
  const target = Math.min(w.steps.length - 1, Math.max(0, to))
  if (target === at) return w
  const steps = [...w.steps]
  const [step] = steps.splice(at, 1)
  steps.splice(target, 0, step!)
  return withSteps(w, steps)
}

/** The step `id` placed right after the step `after`, as when an arrow is drawn from one to the other; nothing moves when it is already there. */
export function moveAfter(w: Workflow, after: string, id: string): Workflow {
  const a = w.steps.findIndex((s) => s.id === after)
  const b = w.steps.findIndex((s) => s.id === id)
  if (a < 0 || b < 0 || a === b || b === a + 1) return w
  return moveStepTo(w, b, b < a ? a : a + 1)
}

/** A step taken out. A workflow keeps at least one. */
export function removeStep(w: Workflow, at: number): Workflow {
  if (w.steps.length <= 1) return w
  return withSteps(w, w.steps.filter((_, i) => i !== at))
}

/** A new step of `kind`, with an id no other step has, before the landing step when the workflow ends with one. A check starts with an empty command, which the checker asks for. */
export function addStep(w: Workflow, kind: StepKind): Workflow {
  if (w.steps.length >= STEPS_MAX) return w
  const used = new Set(w.steps.map((s) => s.id))
  let id: string = kind
  for (let n = 2; used.has(id); n++) id = `${kind}-${n}`
  const step: Step = kind === 'check' ? { id, kind, run: '' } : { id, kind }
  const last = w.steps.at(-1)
  const at = last && isLanding(last.kind) && !isLanding(kind) ? w.steps.length - 1 : w.steps.length
  return withSteps(w, [...w.steps.slice(0, at), step, ...w.steps.slice(at)])
}

/** A step with some of its fields changed. */
export function setStep(w: Workflow, at: number, patch: StepPatch): Workflow {
  return withSteps(
    w,
    w.steps.map((s, i) => {
      if (i !== at) return s
      const next: Record<string, unknown> = { ...s }
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete next[k]
        else next[k] = v
      }
      return next as unknown as Step
    })
  )
}

const newId = (w: Workflow, base: string) => {
  const used = new Set(w.steps.map((s) => s.id))
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  return id
}

/** A new step of `kind` at place `at` (past the end is the end), with an id no other step has. A check starts with an empty command, which the checker asks for. */
export function insertStepAt(w: Workflow, at: number, kind: StepKind): Workflow {
  if (w.steps.length >= STEPS_MAX) return w
  const step: Step = kind === 'check' ? { id: newId(w, kind), kind, run: '' } : { id: newId(w, kind), kind }
  const to = Math.min(w.steps.length, Math.max(0, at))
  return withSteps(w, [...w.steps.slice(0, to), step, ...w.steps.slice(to)])
}

/** A copy of a step right after it, with an id of its own and a name that says it is a copy. */
export function duplicateStep(w: Workflow, at: number): Workflow {
  const from = w.steps[at]
  if (!from || w.steps.length >= STEPS_MAX) return w
  const copy: Step = { ...from, id: newId(w, from.id), ...(from.name !== undefined && { name: `${from.name} copy`.slice(0, 40) }) }
  return withSteps(w, [...w.steps.slice(0, at + 1), copy, ...w.steps.slice(at + 1)])
}

/** Who does a step: the agent, a command the app runs, a model that reviews, or the person. */
export type Who = 'agent' | 'command' | 'reviewer' | 'you'
/** The part a step plays in the run, beyond its work: the plan the person approves first, the pull request that is held, the merge that lands it. */
export type Role = 'none' | 'plan' | 'pr' | 'land'

export const whoOf = (k: StepKind): Who => ({ plan: 'agent', work: 'agent', check: 'command', audit: 'reviewer', approve: 'you', pr: 'agent', merge: 'you' } as const)[k]
export const roleOf = (k: StepKind): Role => (k === 'plan' ? 'plan' : k === 'pr' ? 'pr' : k === 'merge' ? 'land' : 'none')
const KINDS: Record<string, StepKind> = { 'agent:none': 'work', 'agent:plan': 'plan', 'agent:pr': 'pr', 'command:none': 'check', 'reviewer:none': 'audit', 'you:none': 'approve', 'you:land': 'merge' }
/** The kind of step that is done by `who` in `role`, or none when that one cannot play that part. */
export const kindFor = (who: Who, role: Role): StepKind | undefined => KINDS[`${who}:${role}`]

/** A step as another kind: its name and brief stay, and so does every setting the new kind has too; what it has no use for goes. */
function asKind(s: Step, kind: StepKind): Step {
  const next: Step = { id: s.id, kind }
  if (s.name !== undefined) next.name = s.name
  if (s.brief !== undefined) next.brief = s.brief
  if (s.gate !== undefined && GATES[kind].includes(s.gate)) next.gate = s.gate
  if (s.start !== undefined && START_KINDS.includes(kind)) next.start = s.start
  if (s.optional !== undefined && OPTIONAL_KINDS.includes(kind)) next.optional = s.optional
  if (s.skippable !== undefined && SKIPPABLE_KINDS.includes(kind)) next.skippable = s.skippable
  if (s.skills !== undefined && SKILL_KINDS.includes(kind)) next.skills = s.skills
  if (kind === 'check') {
    next.run = s.run ?? ''
    if (s.retries !== undefined) next.retries = s.retries
  }
  if (kind === 'audit' && s.model !== undefined) next.model = s.model
  return next
}
const replaceAt = (w: Workflow, at: number, step: Step): Workflow => withSteps(w, w.steps.map((x, i) => (i === at ? step : x)))

/** A step done by someone else: the agent, a command, a reviewer or the person. It keeps the part it played when the new one can play it too. */
export function withWho(w: Workflow, at: number, who: Who): Workflow {
  const s = w.steps[at]
  if (!s || whoOf(s.kind) === who) return w
  const kind = kindFor(who, roleOf(s.kind)) ?? kindFor(who, 'none')
  return kind ? replaceAt(w, at, asKind(s, kind)) : w
}

/** A step given a part in the run (or none): only the agent can plan or open the pull request, only the person lands it. */
export function withRole(w: Workflow, at: number, role: Role): Workflow {
  const s = w.steps[at]
  const kind = s && kindFor(whoOf(s.kind), role)
  return s && kind && kind !== s.kind ? replaceAt(w, at, asKind(s, kind)) : w
}

