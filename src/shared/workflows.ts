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
  /** The merge gate: Land waits until the plan was approved and the audit's findings were seen. On with workflows unless switched off. */
  mergeGate: boolean
}

export interface CostPart {
  label: string
  detail: string
  tokens: number
  /** In the agent's own context, or a separate model call that costs the agent nothing in context but does cost usage. */
  where: 'agent' | 'separate'
  /** What one call costs where it was measured (on the small model); left out where it was not. */
  usd?: number
}

// The briefs and the intent check are guesses; the audit's size and price were measured on haiku (pilot/audit.pilot.ts, 2026-10-12).
// All are shown to people as assumptions and replaced when real runs measure them.
const STEPS = 5
const BRIEF = 150
const PLAN_BLOCK = 250
const MERGE_AUDIT = 4000
const MERGE_AUDIT_USD = 0.0004
const INTENT_CHECK = 2000

/** What workflows add to one task of about five steps at a dial level, split into what lands in the agent's context and what is a separate call. */
export function workflowCost(dial: Dial): { context: number; calls: number; parts: CostPart[] } {
  const parts: CostPart[] = [{ label: 'Step briefs', detail: `${STEPS} steps of about ${BRIEF} tokens`, tokens: STEPS * BRIEF, where: 'agent' }]
  if (dial !== 'economy') {
    parts.push({ label: 'Plan read-back', detail: `a block of about ${PLAN_BLOCK} tokens at the top of the plan`, tokens: PLAN_BLOCK, where: 'agent' })
    parts.push({ label: 'Merge audit', detail: 'a separate model reads the finished branch against the plan', tokens: MERGE_AUDIT, where: 'separate', ...(dial === 'balanced' && { usd: MERGE_AUDIT_USD }) })
  }
  if (dial === 'max') parts.push({ label: 'Intent check', detail: 'a second, smaller model reads the plan against your request', tokens: INTENT_CHECK, where: 'separate' })
  const sum = (where: CostPart['where']) => parts.filter((p) => p.where === where).reduce((n, p) => n + p.tokens, 0)
  return { context: sum('agent'), calls: sum('separate'), parts }
}

/** What a dial does, in a sentence, for the line under the choice. */
export function dialDoes(dial: Dial): string {
  if (dial === 'economy') return 'A plan only when the task is more than one sentence. No audit, no intent check.'
  if (dial === 'balanced') return 'A plan every time. A small model (haiku) audits the branch against it.'
  return 'A plan every time, audited by a larger model (sonnet), and a second model checks the plan against your request.'
}

/** What a dial adds over the one below it, in a few words, for a row of the cost table. */
export function dialSummary(dial: Dial): string {
  const below = DIALS[DIALS.indexOf(dial) - 1]
  if (!below) return 'step briefs only'
  const before = new Set(workflowCost(below).parts.map((p) => p.label))
  return '+ ' + workflowCost(dial).parts.filter((p) => !before.has(p.label)).map((p) => p.label.toLowerCase()).join(', ')
}

/** The model the app's own checks use at a dial level (a guess until a pilot measures it); none where no check runs. */
export const auditModel = (d: Dial): string | undefined => (d === 'economy' ? undefined : d === 'balanced' ? 'haiku' : 'sonnet')

export const dialName = (d: Dial) => d.charAt(0).toUpperCase() + d.slice(1)

/** Off with runs still open: they finish, nothing new starts, and the button stays until they have. */
export const windingDown = (enabled: boolean, open: number) => !enabled && open > 0
export const workflowsShown = (enabled: boolean, open: number) => enabled || open > 0

/** The new setting after the switch is flipped: switching on from off records the moment, nothing else does. */
export const switchWorkflows = (w: WorkflowPrefs, enabled: boolean, now: number): WorkflowPrefs => ({ ...w, enabled, since: enabled && !w.enabled ? now : w.since })
