import { busiest } from './limits'
import type { LimitWindow, ProviderId } from './types'

export type Kind = 'read' | 'edit' | 'feature' | 'debug' | 'review'
export interface Task {
  kind: Kind
  /** The spec leaves things to find out (a "find every place" task, no tests that say what is wanted). */
  vague?: boolean
}
/** One model the app can run. `score` (0 to 1, from public benchmarks) and `n` (how many) are missing for a model nobody has scored. */
export interface CatalogModel {
  model: string
  program: ProviderId
  /** Relative price of a typical agent turn (see docs/research/model-choice-and-limits.md, 5.2). */
  cost: number
  score?: number
  n?: number
  /** Epoch ms after which the program drops the model. */
  retiresOn?: number
  /** The short name an agent is hired on ("haiku"). */
  alias?: string
}
export interface IdleAgent {
  /** The name the office knows it by (what send_message takes). */
  name: string
  model: string
  /** Tokens in its context now, and whether its prompt cache is still warm. */
  ctx: number
  warm: boolean
}
export interface Office {
  idle: IdleAgent[]
  windows: LimitWindow[]
  now: number
}
export type Check = 'selftest' | 'review'
export type Pick =
  | { use: 'spawn'; model: string; program: ProviderId; checks: Check[]; escalateTo?: string }
  | { use: 'idle'; agent: string; model: string; program: ProviderId; checks: Check[]; escalateTo?: string }
  | { use: 'none'; why: string }

/**
 * The lowest score and the fewest benchmarks a model needs for a kind of work. The numbers are assumptions from docs/research (5.3), except that a clear
 * feature is allowed down to the small-edit score: Haiku with its own tests first passed 12 of 12 hidden-test runs on clear single-folder tasks (see the
 * delegation experiments), while plain Haiku failed a third of them.
 */
const NEEDS = { read: [0.6, 1], edit: [0.7, 1], clearFeature: [0.7, 2], feature: [0.9, 2], debug: [0.95, 2], review: [0.95, 3] } as const
const needFor = (t: Task) => NEEDS[t.kind === 'feature' && !t.vague ? 'clearFeature' : t.kind]

const FLOOR = 10
const BAND = 2
/** An idle agent is worth borrowing if its context is small, or its cache is warm so the context is read at a tenth rather than written again at 1.25. */
const SMALL_CTX = 60_000
const WEEK = 7 * 86_400_000

/** The share left in a program's tightest window; 100 while it has reported none. ponytail: per program, not per model group, so agy's two quota groups count as one. */
const headroom = (ws: LimitWindow[], program: ProviderId) => busiest(ws.filter((w) => w.provider === program))?.remainingPct ?? 100

export function pickRunner(task: Task, catalog: CatalogModel[], office: Office): Pick {
  const [minScore, minN] = needFor(task)
  const fits = catalog.filter((m) => m.score !== undefined && m.score >= minScore && (m.n ?? 0) >= minN && !(m.retiresOn !== undefined && m.retiresOn - office.now < WEEK))
  if (!fits.length) return { use: 'none', why: 'no model clears this kind of work' }
  const room = (m: CatalogModel) => headroom(office.windows, m.program)
  const open = [FLOOR, 0.0001].map((min) => fits.filter((m) => room(m) >= min)).find((l) => l.length)
  if (!open) return { use: 'none', why: 'no model has headroom' }
  const c0 = Math.min(...open.map((m) => m.cost))
  const band = open.filter((m) => m.cost <= BAND * c0)
  const best = [...band].sort((a, b) => room(b) - room(a) || a.cost - b.cost || b.score! - a.score!)[0]!
  const checks: Check[] = task.kind === 'read' || task.kind === 'review' ? [] : task.vague ? ['selftest', 'review'] : ['selftest']
  const stronger = open.filter((m) => m.score! > best.score!).sort((a, b) => a.cost - b.cost)[0]
  const tail = { checks, ...(stronger && { escalateTo: stronger.model }) }
  const free = office.idle.filter((a) => (a.ctx <= SMALL_CTX || a.warm) && band.some((m) => m.model === a.model || m.alias === a.model)).sort((a, b) => a.ctx - b.ctx)[0]
  const them = free && band.find((m) => m.model === free.model || m.alias === free.model)
  return free && them ? { use: 'idle', agent: free.name, model: them.model, program: them.program, ...tail } : { use: 'spawn', model: best.model, program: best.program, ...tail }
}

/** The pick in a few plain lines for an agent to act on. */
export function runnerText(p: Pick): string {
  if (p.use === 'none') return `No runner picked: ${p.why}.`
  const who = p.use === 'idle' ? `Send it to ${p.agent}, who is idle and already hired (${p.model}).` : `Start a ${p.model} agent (${p.program}).`
  const how = [
    p.checks.includes('selftest') && 'Tell it to write its own tests from the spec first (one per rule, with edge cases and exact messages), then make them and the existing tests pass before it reports.',
    p.checks.includes('review') && `The spec is vague, so after it reports start a second ${p.model} agent to read the spec line by line against the code and fix every gap.`,
    p.escalateTo ? `If its tests fail or it reports blocked, hand the task to ${p.escalateTo}.` : 'Nothing stronger is available to hand it to.'
  ].filter(Boolean)
  return [who, ...how].join('\n')
}
