import { weekStartOf } from './ledger'
import type { Run, RunWorkflow } from './runs'
import { formatDuration } from './runStats'
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
  /** For a tile met with trouble: the count it shows (plans sent back, checks failed, findings seen). */
  n?: number
}

const has = (wf: RunWorkflow | undefined, kind: RunWorkflow['steps'][number]['kind']) => !!wf?.steps.some((s) => s.kind === kind)

/** Whether a run met each gate its workflow asked for: plan, check, review, landing, and whether the agent said it began the task. */
export function gateTiles(run: Run, ctx: StepContext): Tile[] {
  // The latest round with anything logged: a follow-up that has not got as far as its checks yet leaves the first round's standing.
  const active = [...run.rounds].reverse().find((r) => r.steps.length > 0 || r.checks.length > 0 || r.plan) ?? run.rounds.at(-1)
  const states = stepStates(run, ctx, active?.n)
  const wf = run.workflow
  const plan = (): TileKind => {
    if (!has(wf, 'plan') || states.find((s) => s.kind === 'plan')?.state === 'skipped') return 'na'
    const p = run.rounds[0]?.plan
    if (!p) return run.status === 'open' ? 'wait' : 'na'
    if (p.state === 'released') return 'bad'
    if (p.state === 'approved') return p.sentBack ? 'trouble' : 'ok'
    return 'wait'
  }
  const planN = run.rounds[0]?.plan?.sentBack
  const checks = states.filter((s) => s.kind === 'check')
  const check = (): Tile => {
    if (checks.length === 0) return { gate: 'check', kind: 'na' }
    if (checks.some((s) => s.state === 'failed' || s.state === 'skipped')) return { gate: 'check', kind: 'bad' }
    if (checks.some((s) => s.state === 'waiting' || (s.state === 'running' && s.tries))) return { gate: 'check', kind: 'wait' }
    if (checks.every((s) => s.state === 'passed')) {
      const tries = Math.max(0, ...checks.map((s) => s.tries ?? 0))
      return tries > 0 ? { gate: 'check', kind: 'trouble', tries, n: tries } : { gate: 'check', kind: 'ok' }
    }
    return { gate: 'check', kind: 'na' }
  }
  const review = (): TileKind => {
    const a = run.audit
    if (!has(wf, 'audit') || !a || a.state === 'failed') return 'na'
    if (a.findings.length === 0) return 'ok'
    return a.findings.every((f) => f.seen) ? 'trouble' : 'bad'
  }
  const reviewN = run.audit?.state === 'done' ? run.audit.findings.length : undefined
  const land = (): TileKind => {
    if (!has(wf, 'merge') || run.status === 'stopped') return 'na'
    if (run.landed) return run.landed.how === 'checked' ? 'ok' : 'bad'
    return run.status === 'done' ? 'wait' : 'na'
  }
  const counted = (gate: GateName, kind: TileKind, n: number | undefined): Tile => ({ gate, kind, ...(kind === 'trouble' && n ? { n } : {}) })
  return [counted('plan', plan(), planN), check(), counted('review', review(), reviewN), { gate: 'land', kind: land() }, { gate: 'told', kind: run.auto ? 'bad' : 'ok' }]
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

export function headline(runs: Run[], ctxFor: (run: Run) => StepContext, now: number): Headline {
  const h: Headline = { runs: runs.length, finished: 0, metEvery: 0, withTrouble: 0, landedAnyway: 0, fromCommit: 0, waiting: 0, youMs: 0 }
  for (const r of runs) {
    const tiles = gateTiles(r, ctxFor(r))
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const WRONG: Record<GateName, string> = { plan: 'the plan hold was lifted', check: 'a check was skipped or ran out of tries', review: 'a finding was not seen', land: 'it landed anyway', told: 'it began from a commit' }
const MEANS: Record<'plan' | 'check' | 'review', (t: number, of: number) => string> = {
  plan: (t, of) => `${t} of ${of} plans were sent back. The request may need more detail up front.`,
  check: (t, of) => `${t} of ${of} runs needed more than one try. The check may be stricter than the request.`,
  review: (t, of) => `${t} of ${of} runs had findings. The scope may be too loose.`
}

/** What stands out in a grid of runs (newest first): the row with the most missed gates and why, and the column where trouble keeps happening and what it may mean. */
export function says(rows: { title: string; tiles: Tile[] }[]): string[] {
  const out: string[] = []
  const bad = (r: { tiles: Tile[] }) => r.tiles.filter((t) => t.kind === 'bad').length
  const red = rows.reduce<{ title: string; tiles: Tile[] } | undefined>((best, r) => (bad(r) > (best ? bad(best) : 0) ? r : best), undefined)
  if (red) out.push(`${red.title} is the red row: ${red.tiles.filter((t) => t.kind === 'bad').map((t) => WRONG[t.gate]).join(', ')}.`)
  let amber: { gate: 'plan' | 'check' | 'review'; t: number; of: number } | undefined
  for (const gate of ['plan', 'check', 'review'] as const) {
    const col = rows.map((r) => r.tiles.find((t) => t.gate === gate)?.kind).filter((k) => k === 'ok' || k === 'trouble' || k === 'bad')
    const t = col.filter((k) => k === 'trouble').length
    if (t >= 2 && t / col.length >= 0.3 && (!amber || t > amber.t)) amber = { gate, t, of: col.length }
  }
  if (amber) out.push(`${amber.gate[0]!.toUpperCase()}${amber.gate.slice(1)} is the amber column: ${MEANS[amber.gate](amber.t, amber.of)}`)
  return out
}

export interface TimelineEntry {
  /** Milliseconds since the run began. */
  at: number
  kind: 'ok' | 'trouble' | 'bad' | 'you'
  text: string
}
const times = (n: number) => (n === 1 ? 'once' : `${n} times`)
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)

/** How one run went, line by line: began, plan, checks, review, landing, and each follow-up round, with when each happened. */
export function timelineOf(run: Run, now: number): TimelineEntry[] {
  const start = run.startedAt
  const out: TimelineEntry[] = []
  out.push(run.auto ? { at: 0, kind: 'bad', text: 'Began from a commit: the agent never said it had started the task' } : { at: 0, kind: 'ok', text: `Began by the agent${run.workflow ? ` · ${run.workflow.name}` : ''}` })
  for (const round of run.rounds) if (round.n > 1) out.push({ at: round.startedAt - start, kind: 'ok', text: `Follow-up round ${round.n} began` })
  const p = run.rounds[0]?.plan
  if (p) {
    const waited = formatDuration(p.waitedMs ?? 0)
    if (p.state === 'approved') out.push({ at: (p.decidedAt ?? p.submittedAt) - start, kind: p.sentBack ? 'trouble' : 'ok', text: `Plan approved after ${waited}${p.sentBack ? `, sent back ${times(p.sentBack)}` : ''}` })
    else if (p.state === 'released') out.push({ at: (p.decidedAt ?? p.submittedAt) - start, kind: 'bad', text: `Plan sent, then you lifted the hold after ${waited} without approving it` })
    else if (p.state === 'changes') out.push({ at: (p.decidedAt ?? p.submittedAt) - start, kind: 'trouble', text: `Plan sent back ${times(p.sentBack ?? 1)}: waiting for the agent` })
    else out.push({ at: p.submittedAt - start, kind: 'you', text: `Plan sent ${formatDuration(now - p.submittedAt)} ago: waiting for you` })
  }
  const checkSteps = run.workflow?.steps.filter((s) => s.kind === 'check') ?? []
  for (const step of checkSteps) {
    const results = run.rounds.flatMap((r) => r.checks).filter((c) => c.step === step.id)
    const last = results.at(-1)
    if (!last) continue
    const failed = results.filter((c) => !c.ok).length
    const label = checkSteps.length > 1 ? step.name : 'Check'
    const skipped = run.rounds.some((r) => r.steps.some((l) => l.step === step.id && l.state === 'skipped'))
    const [kind, text]: [TimelineEntry['kind'], string] = last.ok ? (failed === 0 ? ['ok', `${label} passed first time`] : ['trouble', `${label} failed ${times(failed)}, passed on try ${results.length}`]) : ['bad', `${label} failed ${times(failed)}${skipped ? ', then you skipped it' : ''}`]
    out.push({ at: last.t - start, kind, text })
  }
  const a = run.audit
  if (a?.state === 'failed') out.push({ at: a.t - start, kind: 'trouble', text: `Review could not run: ${a.reason}` })
  if (a?.state === 'done') {
    const unseen = a.findings.filter((f) => !f.seen)
    const text = a.findings.length === 0 ? 'Review found nothing' : unseen.length === 0 ? `Review found ${plural(a.findings.length, 'thing', 'things')}, all seen` : `Review found ${plural(unseen.length, 'thing', 'things')} you did not look at: “${clip(unseen[0]!.text, 80)}”`
    out.push({ at: a.t - start, kind: a.findings.length === 0 ? 'ok' : unseen.length === 0 ? 'trouble' : 'bad', text })
  }
  if (run.landed) out.push({ at: run.landed.t - start, kind: run.landed.how === 'checked' ? 'ok' : 'bad', text: run.landed.how === 'checked' ? 'Landed after the checks' : `Landed anyway, with ${run.landed.held.join(' and ') || 'a gate'} still holding it` })
  return out.sort((x, y) => x.at - y.at)
}

const DAY = 24 * 60 * 60_000
/** The runs that ended, or are still going, within the last `days` days. */
export const runsWithin = (runs: Run[], days: number, now: number) => runs.filter((r) => (r.endedAt ?? now) >= now - days * DAY)

export type StageName = 'plan' | 'check' | 'review' | 'land'
export interface StageCount {
  /** Met first time. */
  ok: number
  /** Met after trouble: a plan sent back, a check retried, findings seen. */
  trouble: number
  /** Missed or overridden. */
  bad: number
}
/** For each stage over a set of runs: how many met it first time, after trouble, or not at all. A run that was not asked for the stage, or has not reached it, is left out. */
export function stageCounts(rows: Tile[][]): Record<StageName, StageCount> {
  const counts: Record<StageName, StageCount> = { plan: { ok: 0, trouble: 0, bad: 0 }, check: { ok: 0, trouble: 0, bad: 0 }, review: { ok: 0, trouble: 0, bad: 0 }, land: { ok: 0, trouble: 0, bad: 0 } }
  for (const row of rows)
    for (const t of row) {
      if (t.gate === 'told' || t.kind === 'na' || t.kind === 'wait') continue
      counts[t.gate][t.kind]++
    }
  return counts
}

export interface Invocations {
  /** Runs of each workflow, most used first. */
  byWorkflow: { name: string; runs: number }[]
  /** Runs of any workflow. */
  total: number
  /** Runs the app started from a commit, because the agent never announced the task: not an invocation of a workflow. */
  fromCommit: number
  /** Runs of a workflow begun on each day, oldest day first and today last; one begun before the window is counted on its first day. */
  perDay: number[]
}
const startOfDay = (t: number) => new Date(new Date(t).setHours(0, 0, 0, 0)).getTime()

/** How often each workflow was invoked over the runs of the last `days` days, and on which days. */
export function invocations(runs: Run[], days: number, now: number): Invocations {
  const by = new Map<string, number>()
  const perDay = Array.from({ length: days }, () => 0)
  let fromCommit = 0
  const today = startOfDay(now)
  for (const r of runs) {
    if (!r.workflow) {
      if (r.auto) fromCommit++
      continue
    }
    by.set(r.workflow.name, (by.get(r.workflow.name) ?? 0) + 1)
    const ago = Math.round((today - startOfDay(r.startedAt)) / DAY)
    perDay[Math.min(days - 1, Math.max(0, days - 1 - ago))]!++
  }
  const byWorkflow = [...by].map(([name, n]) => ({ name, runs: n })).sort((x, y) => y.runs - x.runs)
  return { byWorkflow, total: byWorkflow.reduce((n, w) => n + w.runs, 0), fromCommit, perDay }
}

export type GroupKey = 'needs' | 'open' | 'trouble' | 'clean' | 'stopped'
export interface RunGroup {
  key: GroupKey
  title: string
  /** A few words under the title, or none. */
  note: string
  /** Newest first. */
  runs: Run[]
}
const GROUP_TITLES: Record<GroupKey, string> = { needs: 'Needs you', open: 'Still open', trouble: 'Landed with trouble', clean: 'Landed clean', stopped: 'Stopped' }

/**
 * The runs by what there is to do about them: those held for the person, those still going, those that finished with a gate missed or overridden, those that finished clean
 * (a retried check or a plan sent back is still clean), and those stopped. A run the app started from a commit is not trouble for never having been announced.
 */
export function groupKeyOf(r: Run, tiles: Tile[]): GroupKey {
  if (r.status === 'stopped') return 'stopped'
  if (tiles.some((t) => t.kind === 'wait')) return 'needs'
  if (r.status === 'open') return 'open'
  return tiles.some((t) => t.gate !== 'told' && t.kind === 'bad') ? 'trouble' : 'clean'
}

/** How a run is said to stand, in the words of its group. */
export const GROUP_STANDS: Record<GroupKey, string> = { needs: 'needs you', open: 'still open', trouble: 'landed with trouble', clean: 'landed clean', stopped: 'stopped' }

export function groupRuns(runs: Run[], ctxFor: (run: Run) => StepContext): RunGroup[] {
  const buckets: Record<GroupKey, Run[]> = { needs: [], open: [], trouble: [], clean: [], stopped: [] }
  let retried = 0
  for (const r of [...runs].sort((a, b) => b.startedAt - a.startedAt)) {
    const tiles = gateTiles(r, ctxFor(r))
    const key = groupKeyOf(r, tiles)
    buckets[key].push(r)
    if (key === 'clean' && tiles.some((t) => t.kind === 'trouble')) retried++
  }
  const notes: Record<GroupKey, string> = { needs: '', open: '', trouble: 'went ahead past a gate', clean: retried > 0 ? `${retried} needed a second try` : '', stopped: '' }
  return (['needs', 'open', 'trouble', 'clean', 'stopped'] as const).filter((k) => buckets[k].length > 0).map((key) => ({ key, title: GROUP_TITLES[key], note: notes[key], runs: buckets[key] }))
}

export interface LedgerRow {
  finished: boolean
  /** The run's whole time, or none for a run the app started from a commit (its start was never announced). */
  wallMs: number | null
  /** How long the person was waited on. */
  youMs: number
  /** `first`: passed first time; `retried`: passed after `tries` failures; `failed`: out of tries or skipped; `pending`: held for the person; `none`: not reached or not asked. */
  checks: { kind: 'first' | 'retried' | 'failed' | 'pending' | 'none'; tries: number }
  /** `clean`: nothing found; `seen`: `n` findings, all looked at; `unseen`: `n` findings, some not; `none`: no review. */
  review: { kind: 'clean' | 'seen' | 'unseen' | 'none'; n: number }
  commits: number
}

/** What the Runs ledger says about one run, as values for the tab to word. */
export function ledgerRow(run: Run, tiles: Tile[], bar: RunBar | undefined): LedgerRow {
  const check = tiles.find((t) => t.gate === 'check')
  const review = tiles.find((t) => t.gate === 'review')
  const found = run.audit?.state === 'done' ? run.audit.findings.length : 0
  return {
    finished: run.status === 'done',
    wallMs: bar ? bar.totalMs : null,
    youMs: bar ? bar.segments.filter((s) => s.kind === 'you').reduce((n, s) => n + s.ms, 0) : 0,
    checks: check?.kind === 'ok' ? { kind: 'first', tries: 0 } : check?.kind === 'trouble' ? { kind: 'retried', tries: check.tries ?? check.n ?? 1 } : check?.kind === 'bad' ? { kind: 'failed', tries: 0 } : check?.kind === 'wait' ? { kind: 'pending', tries: 0 } : { kind: 'none', tries: 0 },
    review: review?.kind === 'ok' ? { kind: 'clean', n: 0 } : review?.kind === 'trouble' ? { kind: 'seen', n: found } : review?.kind === 'bad' ? { kind: 'unseen', n: found } : { kind: 'none', n: 0 },
    commits: run.rounds.reduce((n, r) => n + r.commits.length, 0)
  }
}

export interface LedgerTotals {
  /** The middle run time of the runs that finished, or none. */
  medianWallMs: number | null
  youMs: number
  checks: { first: number; of: number }
  /** How many reviews found something, of those that ran. */
  review: { found: number; of: number }
}

/** The line under each column heading: the middle time of the finished runs, the wait on the person in all, how often checks passed first time, how often a review found something. */
export function ledgerTotals(rows: LedgerRow[]): LedgerTotals {
  const times = rows.filter((r) => r.finished && r.wallMs !== null).map((r) => r.wallMs!).sort((a, b) => a - b)
  const mid = Math.floor(times.length / 2)
  const checked = rows.filter((r) => ['first', 'retried', 'failed'].includes(r.checks.kind))
  const reviewed = rows.filter((r) => r.review.kind !== 'none')
  return {
    medianWallMs: times.length === 0 ? null : times.length % 2 ? times[mid]! : (times[mid - 1]! + times[mid]!) / 2,
    youMs: rows.reduce((n, r) => n + r.youMs, 0),
    checks: { first: checked.filter((r) => r.checks.kind === 'first').length, of: checked.length },
    review: { found: reviewed.filter((r) => r.review.kind !== 'clean').length, of: reviewed.length }
  }
}

/** One tile for a whole run: the worst that happened (a gate missed, then one still waiting, then trouble on the way), else met. */
export function runVerdict(tiles: Tile[]): TileKind {
  const kinds = tiles.map((t) => t.kind)
  for (const k of ['bad', 'wait', 'trouble', 'ok'] as const) if (kinds.includes(k)) return k
  return 'na'
}

export interface WeekDay {
  label: string
  today: boolean
  runs: { id: string; title: string; kind: TileKind }[]
}
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayOf = (t: number) => (new Date(t).getDay() + 6) % 7

/** This week, Monday to Sunday, with each run on the day it began (a run still going from before the week on Monday), oldest first, as one verdict each. */
export function weekDays(runs: Run[], ctxFor: (run: Run) => StepContext, now: number): WeekDay[] {
  const start = weekStartOf(now)
  const days: WeekDay[] = DAY_LABELS.map((label, i) => ({ label, today: i === dayOf(now), runs: [] }))
  for (const r of runs) {
    if ((r.endedAt ?? now) < start) continue
    days[r.startedAt < start ? 0 : dayOf(r.startedAt)]!.runs.push({ id: r.id, title: r.title, kind: runVerdict(gateTiles(r, ctxFor(r))) })
  }
  return days
}
