import { STEPS_MAX, isLanding, type Step, type StepKind, type Workflow } from './workflow'

/** The fields of a step that the draft's editor changes; an empty text or list takes the field away. */
export type StepPatch = Partial<Pick<Step, 'name' | 'gate' | 'brief' | 'start' | 'skills' | 'run' | 'retries' | 'model'>>

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

