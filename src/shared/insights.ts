import type { Run, RunWorkflow } from './runs'
import { type StepContext, stepStates } from './steps'

/** One stretch of a run's time: the agent working, the person being waited on, a check that ran, or one that failed. */
export interface Segment {
  kind: 'work' | 'you' | 'check' | 'fail'
  ms: number
}
/** A moment in a run's drawn time: the review ended, the work landed (properly or anyway), the person lifted the plan hold, or a follow-up round began. */
export interface Mark {
  kind: 'review' | 'landed' | 'anyway' | 'lifted' | 'round'
  at: number
}
export interface RunBar {
  totalMs: number
  segments: Segment[]
  marks: Mark[]
  /** The person is being waited on right now. */
  waiting: boolean
}

type Interval = { kind: 'you' | 'check' | 'fail'; from: number; to: number }

/** The waits on the person inside one round, as stretches of time. Open ones run to `to`. */
function waits(run: Run, round: Run['rounds'][number], to: number): { ivs: Interval[]; open: boolean } {
  const ivs: Interval[] = []
  let open = false
  const p = round.plan
  if (p) {
    const waiting = p.state === 'submitted'
    const total = (p.waitedMs ?? 0) + (waiting ? Math.max(0, to - p.submittedAt) : 0)
    const end = waiting ? to : (p.decidedAt ?? p.submittedAt)
    if (total > 0) ivs.push({ kind: 'you', from: end - total, to: end })
    if (waiting && round.endedAt === undefined) open = true
  }
  // A step the person approves: the wait is from the work reported before it to their answer; while there is none, to now.
  const logs = round.steps
  for (const a of logs.filter((l) => l.state === 'approved' || l.state === 'changes')) {
    const before = logs.filter((l) => l.state === 'done' && l.t < a.t).at(-1)
    if (before) ivs.push({ kind: 'you', from: before.t, to: a.t })
  }
  const steps = run.workflow?.steps ?? []
  const last = logs.filter((l) => l.state === 'done').at(-1)
  const next = last ? steps[steps.findIndex((s) => s.id === last.step) + 1] : undefined
  if (last && next?.kind === 'approve' && !logs.some((l) => l.step === next.id && (l.state === 'approved' || l.state === 'changes') && l.t >= last.t) && round.endedAt === undefined) {
    ivs.push({ kind: 'you', from: last.t, to })
    open = true
  }
  return { ivs, open }
}

/**
 * A run's time as the bar draws it: the stretches in the order they happened. The waits on the person and the checks are known; everything else is the agent working.
 * When a plan was sent back, the waits are drawn together where it was decided. A review and a landing are marks, not lengths: the log has only when they ended.
 * A follow-up round follows the first without the gap between them. Nothing for a run the app started from a commit: its start was never announced.
 */
export function runBar(run: Run, now: number): RunBar | undefined {
  if (run.auto) return undefined
  const segments: Segment[] = []
  const marks: Mark[] = []
  let offset = 0
  let waiting = false
  const placed = { audit: false, landed: false }
  const push = (kind: Segment['kind'], ms: number) => {
    if (ms <= 0) return
    const prev = segments.at(-1)
    if (prev?.kind === kind) prev.ms += ms
    else segments.push({ kind, ms })
  }
  const at = (t: number, from: number, to: number) => offset + Math.min(Math.max(0, t - from), to - from)
  for (const round of run.rounds) {
    const from = round.startedAt
    const to = round.endedAt ?? now
    if (round.n > 1) marks.push({ kind: 'round', at: offset })
    const w = waits(run, round, to)
    if (w.open) waiting = true
    const ivs: Interval[] = [...w.ivs, ...round.checks.map((c): Interval => ({ kind: c.ok ? 'check' : 'fail', from: c.t - c.ms, to: c.t }))].sort((a, b) => a.from - b.from)
    let cursor = from
    for (const iv of ivs) {
      const start = Math.max(iv.from, cursor)
      const end = Math.min(iv.to, to)
      if (end <= start) continue
      push('work', start - cursor)
      push(iv.kind, end - start)
      cursor = end
    }
    push('work', to - cursor)
    const last = round.n === run.rounds.length
    const inside = (t: number) => (t >= from && t <= to) || (last && t > to)
    if (run.audit && !placed.audit && inside(run.audit.t)) (marks.push({ kind: 'review', at: at(run.audit.t, from, to) }), (placed.audit = true))
    if (run.landed && !placed.landed && inside(run.landed.t)) (marks.push({ kind: run.landed.how === 'anyway' ? 'anyway' : 'landed', at: at(run.landed.t, from, to) }), (placed.landed = true))
    if (round.plan?.state === 'released' && round.plan.decidedAt !== undefined) marks.push({ kind: 'lifted', at: at(round.plan.decidedAt, from, to) })
    offset += to - from
  }
  return { totalMs: offset, segments, marks: marks.sort((a, b) => a.at - b.at), waiting }
}

export type GateName = 'plan' | 'check' | 'review' | 'land' | 'told'
/** `ok`: met first time; `trouble`: met after a plan was sent back, a check was retried or findings were seen; `bad`: overridden or missed; `na`: not asked, or not reached; `wait`: held for the person. */
export type TileKind = 'ok' | 'trouble' | 'bad' | 'na' | 'wait'
export interface Tile {
  gate: GateName
  kind: TileKind
  /** For a check met after trouble: how often it failed. */
  tries?: number
}

const has = (wf: RunWorkflow | undefined, kind: RunWorkflow['steps'][number]['kind']) => !!wf?.steps.some((s) => s.kind === kind)

/** Whether a run met each gate its workflow asked for: plan, check, review, landing, and whether the agent said it began the task. */
export function gateTiles(run: Run, ctx: StepContext): Tile[] {
  const states = stepStates(run, ctx)
  const wf = run.workflow
  const plan = (): TileKind => {
    if (!has(wf, 'plan') || states.find((s) => s.kind === 'plan')?.state === 'skipped') return 'na'
    const p = run.rounds[0]?.plan
    if (!p) return run.status === 'open' ? 'wait' : 'na'
    if (p.state === 'released') return 'bad'
    if (p.state === 'approved') return p.sentBack ? 'trouble' : 'ok'
    return 'wait'
  }
  const checks = states.filter((s) => s.kind === 'check')
  const check = (): Tile => {
    if (checks.length === 0) return { gate: 'check', kind: 'na' }
    if (checks.some((s) => s.state === 'failed' || s.state === 'skipped')) return { gate: 'check', kind: 'bad' }
    if (checks.some((s) => s.state === 'waiting' || (s.state === 'running' && s.tries))) return { gate: 'check', kind: 'wait' }
    if (checks.every((s) => s.state === 'passed')) {
      const tries = Math.max(0, ...checks.map((s) => s.tries ?? 0))
      return tries > 0 ? { gate: 'check', kind: 'trouble', tries } : { gate: 'check', kind: 'ok' }
    }
    return { gate: 'check', kind: 'na' }
  }
  const review = (): TileKind => {
    const a = run.audit
    if (!has(wf, 'audit') || !a || a.state === 'failed') return 'na'
    if (a.findings.length === 0) return 'ok'
    return a.findings.every((f) => f.seen) ? 'trouble' : 'bad'
  }
  const land = (): TileKind => {
    if (!has(wf, 'merge') || run.status === 'stopped') return 'na'
    if (run.landed) return run.landed.how === 'checked' ? 'ok' : 'bad'
    return run.status === 'done' ? 'wait' : 'na'
  }
  return [{ gate: 'plan', kind: plan() }, check(), { gate: 'review', kind: review() }, { gate: 'land', kind: land() }, { gate: 'told', kind: run.auto ? 'bad' : 'ok' }]
}

export interface Rate {
  good: number
  of: number
}
/** For each gate over a set of runs: how often it was met as asked, out of how often it was asked and decided. A review met after seeing its findings counts as met. */
export function columnRates(rows: Tile[][]): Record<GateName, Rate> {
  const rates: Record<GateName, Rate> = { plan: { good: 0, of: 0 }, check: { good: 0, of: 0 }, review: { good: 0, of: 0 }, land: { good: 0, of: 0 }, told: { good: 0, of: 0 } }
  for (const row of rows)
    for (const t of row) {
      if (t.kind === 'na' || t.kind === 'wait') continue
      rates[t.gate].of++
      if (t.kind === 'ok' || (t.gate === 'review' && t.kind === 'trouble')) rates[t.gate].good++
    }
  return rates
}

export interface Headline {
  runs: number
  /** Runs that followed a workflow and are done. */
  finished: number
  /** Of those, the ones with no gate missed or overridden; `withTrouble` of them had trouble on the way. */
  metEvery: number
  withTrouble: number
  landedAnyway: number
  fromCommit: number
  /** Open runs held for the person. */
  waiting: number
  /** How long the person was waited on, in all, still counting for a plan waiting now. */
  youMs: number
}

export function headline(runs: Run[], ctx: StepContext, now: number): Headline {
  const h: Headline = { runs: runs.length, finished: 0, metEvery: 0, withTrouble: 0, landedAnyway: 0, fromCommit: 0, waiting: 0, youMs: 0 }
  for (const r of runs) {
    const tiles = gateTiles(r, ctx)
    if (r.auto) h.fromCommit++
    if (tiles.find((t) => t.gate === 'land')?.kind === 'bad') h.landedAnyway++
    if (r.status === 'open' && tiles.some((t) => t.kind === 'wait')) h.waiting++
    if (r.workflow && r.status === 'done') {
      h.finished++
      if (!tiles.some((t) => t.kind === 'bad')) {
        h.metEvery++
        if (tiles.some((t) => t.kind === 'trouble')) h.withTrouble++
      }
    }
    h.youMs += runBar(r, now)?.segments.filter((s) => s.kind === 'you').reduce((n, s) => n + s.ms, 0) ?? 0
  }
  return h
}
