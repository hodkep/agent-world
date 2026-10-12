/** How much care a workflow takes: each level adds checks, and each check costs tokens. */
export const DIALS = ['economy', 'balanced', 'max'] as const
export type Dial = (typeof DIALS)[number]
export const isDial = (v: unknown): v is Dial => DIALS.includes(v as Dial)

export interface WorkflowPrefs {
  enabled: boolean
  dial: Dial
  /** When workflows were last switched on (ms): work committed before this is history, never recorded as a run. */
  since: number
  /** The plan gate: the person approves a task's plan before the agent edits. On with workflows unless switched off. */
  planGate: boolean
}

export interface CostPart {
  label: string
  detail: string
  tokens: number
}

// Guesses, not measurements: they are shown to people as assumptions and replaced when real runs measure them.
const STEPS = 5
const BRIEF = 150
const PLAN_BLOCK = 250
const MERGE_AUDIT = 3000
const INTENT_CHECK = 2000

/** What workflows add to one task of about five steps at a dial level, with the parts so the sum can be read. */
export function workflowCost(dial: Dial): { perTask: number; parts: CostPart[] } {
  const parts: CostPart[] = [{ label: 'Step briefs', detail: `${STEPS} steps of about ${BRIEF} tokens`, tokens: STEPS * BRIEF }]
  if (dial !== 'economy') {
    parts.push({ label: 'Plan read-back', detail: `a block of about ${PLAN_BLOCK} tokens at the top of the plan`, tokens: PLAN_BLOCK })
    parts.push({ label: 'Merge audit', detail: 'a review of the finished branch against the plan', tokens: MERGE_AUDIT })
  }
  if (dial === 'max') parts.push({ label: 'Intent check', detail: 'a second, smaller model reads the plan against your request', tokens: INTENT_CHECK })
  return { perTask: parts.reduce((n, p) => n + p.tokens, 0), parts }
}

/** What a dial adds over the one below it, in a few words, for a row of the cost table. */
export function dialSummary(dial: Dial): string {
  const below = DIALS[DIALS.indexOf(dial) - 1]
  if (!below) return 'step briefs only'
  const before = new Set(workflowCost(below).parts.map((p) => p.label))
  return '+ ' + workflowCost(dial).parts.filter((p) => !before.has(p.label)).map((p) => p.label.toLowerCase()).join(', ')
}

export const dialName = (d: Dial) => d.charAt(0).toUpperCase() + d.slice(1)

/** Off with runs still open: they finish, nothing new starts, and the button stays until they have. */
export const windingDown = (enabled: boolean, open: number) => !enabled && open > 0
export const workflowsShown = (enabled: boolean, open: number) => enabled || open > 0

/** The new setting after the switch is flipped: switching on from off records the moment, nothing else does. */
export const switchWorkflows = (w: WorkflowPrefs, enabled: boolean, now: number): WorkflowPrefs => ({ ...w, enabled, since: enabled && !w.enabled ? now : w.since })
