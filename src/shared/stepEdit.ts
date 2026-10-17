import { STEPS_MAX, type Step, type StepKind, type Workflow } from './workflow'

/** The fields of a step that the draft's editor changes; an empty text or list takes the field away. */
export type StepPatch = Partial<Pick<Step, 'name' | 'gate' | 'brief' | 'skills' | 'run' | 'retries'>>

const withSteps = (w: Workflow, steps: Step[]): Workflow => ({ ...w, steps })

/** A step moved one place up (-1) or down (1); nothing moves past either end. */
export function moveStep(w: Workflow, at: number, by: -1 | 1): Workflow {
  const to = at + by
  if (at < 0 || at >= w.steps.length || to < 0 || to >= w.steps.length) return w
  const steps = [...w.steps]
  ;[steps[at], steps[to]] = [steps[to]!, steps[at]!]
  return withSteps(w, steps)
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
  const at = last?.kind === 'merge' && kind !== 'merge' ? w.steps.length - 1 : w.steps.length
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
