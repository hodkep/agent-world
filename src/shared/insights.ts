import { weekStartOf } from './ledger'
import type { Run, RunWorkflow } from './runs'
import { formatDuration } from './runStats'
import { type StepContext, type StepState, auditSetAside, stepStates } from './steps'
import { landingKind } from './workflow'

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
    if (!landingKind(wf) || run.status === 'stopped') return 'na'
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
  /** `add`: work added to the run; `skip`: a step set aside; `wait`: the run waits for the person. */
  kind: 'ok' | 'trouble' | 'bad' | 'you' | 'add' | 'skip' | 'wait'
  text: string
  /** What goes with the line: a reason, or where the run was. */
  sub?: string
  /** The step the line is about, by name. */
  step?: string
  /** A command that failed: what kind of failure, the command, and what it said. */
  fail?: { label: string; command: string; error: string }
}
const times = (n: number) => (n === 1 ? 'once' : `${n} times`)
/** The landing as one line of the story: what was not met when it went through anyway (a skipped hold is its own sentence), or that the review was set aside. */
function landing(run: Run, l: NonNullable<Run['landed']>): { kind: TimelineEntry['kind']; text: string } {
  const verb = run.workflow?.steps.some((s) => s.kind === 'pr') ? 'Pushed' : 'Landed'
  if (l.how === 'checked') return auditSetAside(run) ? { kind: 'trouble', text: `${verb} with the review set aside` } : { kind: 'ok', text: 'Landed after the checks' }
  const bare = (h: string) => h.replace(/\.$/, '')
  const skipped = l.held.filter((h) => h.startsWith('Pushed without the hold'))
  const unmet = l.held.filter((h) => !h.startsWith('Pushed without the hold')).map((h) => bare(h).replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase()))
  const text = [`${verb} anyway.`, unmet.length ? `Not met: ${unmet.join('; ')}.` : '', ...skipped.map((h) => `The hold itself was skipped: ${bare(h).replace(/^Pushed without the hold: /, '')}.`)].filter(Boolean).join(' ')
  return { kind: 'bad', text }
}

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
    const aside = unseen.length > 0 && auditSetAside(run)
    const text = aside ? `You set the review aside with ${plural(unseen.length, 'thing', 'things')} not looked at: “${clip(unseen[0]!.text, 80)}”` : a.findings.length === 0 ? 'Review found nothing' : unseen.length === 0 ? `Review found ${plural(a.findings.length, 'thing', 'things')}, all seen` : `Review found ${plural(unseen.length, 'thing', 'things')} you did not look at: “${clip(unseen[0]!.text, 80)}”`
    out.push({ at: a.t - start, kind: a.findings.length === 0 ? 'ok' : unseen.length === 0 ? 'trouble' : 'bad', text })
  }
  for (const add of run.additions ?? []) out.push({ at: add.t - start, kind: 'trouble', text: `Added to the plan: “${clip(add.text, 80)}”` })
  if (run.landed) out.push({ at: run.landed.t - start, ...landing(run, run.landed) })
  // Everything else that happened, in the run's own words: the work added to it, each step, the person's Run, the commits, the commands that failed, and the end.
  const name = (id: string | undefined) => (id ? (run.workflow?.steps.find((x) => x.id === id)?.name ?? id) : undefined)
  const allLogs = run.rounds.flatMap((r) => r.steps)
  for (const it of run.items ?? []) {
    const reached = run.workflow?.steps.find((x) => !allLogs.some((l) => l.item === undefined && l.step === x.id && l.t <= it.t && (l.state === 'done' || l.state === 'skipped' || l.state === 'approved')))
    out.push({ at: it.t - start, kind: 'add', text: `Added: ${clip(it.title, 80)}`, ...(reached && { sub: `The run was at ${reached.name}.` }) })
  }
  for (const round of run.rounds) {
    for (const l of round.steps) {
      const n = name(l.step) ?? l.step
      const lane = l.item !== undefined ? ` for item ${l.item}` : ''
      const at = l.t - start
      const note = l.note ? { sub: l.note } : {}
      if (l.state === 'done') out.push({ at, kind: l.implicit ? 'trouble' : 'ok', text: `${n} ${l.implicit ? 'marked done by the app' : 'done'}${lane}`, step: n })
      else if (l.state === 'skipped') out.push({ at, kind: 'skip', text: `${n} skipped${lane}`, step: n, ...note })
      else if (l.state === 'declined') out.push({ at, kind: 'bad', text: `${n} refused`, step: n })
      else if (l.state === 'changes') out.push({ at, kind: 'trouble', text: `${n} sent back`, step: n, ...note })
      else if (l.state === 'reopen') out.push({ at, kind: 'trouble', text: `${n} reopened`, step: n, ...note })
      else if (l.state === 'approved') out.push({ at, kind: 'you', text: `${n} approved`, step: n, ...note })
    }
    for (const [id, t] of Object.entries(round.starts ?? {})) out.push({ at: t - start, kind: 'you', text: `Run pressed: ${name(id) ?? id}`, step: name(id) ?? id })
    for (const c of round.commits) out.push({ at: c.t - start, kind: c.flagged ? 'trouble' : 'ok', text: `Commit ${c.sha.slice(0, 7)}: ${clip(c.subject, 70)}`, ...(c.flagged && { sub: 'Made with no open task.' }) })
  }
  for (const t of run.troubles ?? []) {
    const what = /git\s+commit\b/.test(t.command) ? 'Commit' : /git\s+push\b/.test(t.command) ? 'Push' : t.label === 'tests' ? 'Tests' : t.label === 'build' ? 'Build' : t.label === 'lint' ? 'Lint' : 'Git command'
    out.push({ at: t.t - start, kind: 'bad', text: `${what} failed`, ...(t.step && { step: name(t.step) ?? t.step }), fail: { label: t.label, command: t.command, error: t.error } })
  }
  if (run.skipAsk) out.push({ at: run.skipAsk.t - start, kind: 'wait', text: `Asked to skip ${run.skipAsk.steps.map((id) => name(id) ?? id).join(', ')}`, sub: run.skipAsk.why })
  if (run.endedAt !== undefined && run.status !== 'open') out.push({ at: run.endedAt - start, kind: run.status === 'stopped' ? 'bad' : 'ok', text: run.status === 'stopped' ? 'Ended' : `Finished${run.summary ? `: ${clip(run.summary, 100)}` : ''}` })
  // Stable by time: lines made at the same moment keep the order they were written in.
  return out.map((e, i) => ({ e, i })).sort((x, y) => x.e.at - y.e.at || x.i - y.i).map((x) => x.e)
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

export type GroupKey = 'needs' | 'open' | 'trouble' | 'clean' | 'stopped' | 'unannounced'
export interface RunGroup {
  key: GroupKey
  title: string
  /** A few words under the title, or none. */
  note: string
  /** Newest first. */
  runs: Run[]
}
const GROUP_TITLES: Record<GroupKey, string> = { needs: 'Needs you', open: 'Still open', trouble: 'Landed with trouble', clean: 'Landed clean', stopped: 'Stopped', unannounced: 'Not announced' }

/**
 * The runs by what there is to do about them: those held for the person, those still going, those that finished with a gate missed or overridden, those that finished clean
 * (a retried check or a plan sent back is still clean), and those stopped. A run the app started from a commit is not trouble for never having been announced, nor clean: it has a group of its own.
 */
export function groupKeyOf(r: Run, tiles: Tile[]): GroupKey {
  if (r.status === 'stopped') return 'stopped'
  if (tiles.some((t) => t.kind === 'wait')) return 'needs'
  if (r.status === 'open') return 'open'
  if (tiles.some((t) => t.gate !== 'told' && t.kind === 'bad')) return 'trouble'
  // A run the app started from a commit never had a task, a plan, checks or a review: nothing of it landed clean.
  return r.auto ? 'unannounced' : 'clean'
}

/** How a run is said to stand, in the words of its group. */
export const GROUP_STANDS: Record<GroupKey, string> = { needs: 'needs you', open: 'still open', trouble: 'landed with trouble', clean: 'landed clean', stopped: 'stopped', unannounced: 'not announced' }

export function groupRuns(runs: Run[], ctxFor: (run: Run) => StepContext): RunGroup[] {
  const buckets: Record<GroupKey, Run[]> = { needs: [], open: [], trouble: [], clean: [], stopped: [], unannounced: [] }
  let retried = 0
  for (const r of [...runs].sort((a, b) => b.startedAt - a.startedAt)) {
    const tiles = gateTiles(r, ctxFor(r))
    const key = groupKeyOf(r, tiles)
    buckets[key].push(r)
    if (key === 'clean' && tiles.some((t) => t.kind === 'trouble')) retried++
  }
  const notes: Record<GroupKey, string> = { needs: '', open: '', trouble: 'went ahead past a gate', clean: retried > 0 ? `${retried} needed a second try` : '', stopped: '', unannounced: 'no task was started, so no plan, checks or review' }
  return (['needs', 'open', 'trouble', 'clean', 'stopped', 'unannounced'] as const).filter((k) => buckets[k].length > 0).map((key) => ({ key, title: GROUP_TITLES[key], note: notes[key], runs: buckets[key] }))
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

/** The todos a ledger row shows as chips: the first few, and how many more the opened run lists. */
export const TODO_CHIPS = 5
export const todoChips = <T,>(ids: T[] = []): { shown: T[]; more: number } => ({ shown: ids.slice(0, TODO_CHIPS), more: Math.max(0, ids.length - TODO_CHIPS) })

/** One step of a run's workflow as the Runs tab lists it: where it stands, and why when the agent skipped it. */
export interface StepLine {
  id: string
  name: string
  state: StepState['state']
  /** The agent's reason for skipping it. */
  note?: string
}

/** The steps of a run's workflow in the latest round, each with how it ended. A run that follows no workflow has none. */
export function stepLines(run: Run, ctx: StepContext): StepLine[] {
  const round = run.rounds[run.rounds.length - 1]
  return stepStates(run, ctx).map((s) => {
    const note = round?.steps.filter((x) => x.step === s.id && x.note).at(-1)?.note
    return { id: s.id, name: s.name, state: s.state, ...(note && (s.state === 'skipped' || s.state === 'failed') && { note }) }
  })
}

/** What the steps column says for a run: how many are met, and the first thing worth a look (refused, waiting for the person, skipped). */
export function stepSummary(lines: StepLine[]): { text: string; tone: 'bad' | 'you' | 'warn' | '' | 'dim' } {
  if (lines.length === 0) return { text: '—', tone: 'dim' }
  const met = lines.filter((l) => l.state === 'passed').length
  const skipped = lines.filter((l) => l.state === 'skipped').length
  const base = `${met} of ${lines.length} met${skipped ? `, ${skipped} skipped` : ''}`
  const failed = lines.find((l) => l.state === 'failed')
  if (failed) return { text: `${base} · ${failed.name} failed`, tone: 'bad' }
  const waiting = lines.find((l) => l.state === 'waiting')
  if (waiting) return { text: `${base} · ${waiting.name} waits for you`, tone: 'you' }
  return { text: base, tone: skipped ? 'warn' : '' }
}

export interface StepCount {
  name: string
  met: number
  skipped: number
  failed: number
}

/** For each step name across the runs, how often it was met, skipped or failed, counting only the runs that got that far. In the order the steps were first seen. */
export function stepCounts(runs: Run[], ctxFor: (run: Run) => StepContext): StepCount[] {
  const by = new Map<string, StepCount>()
  for (const run of runs) {
    for (const l of stepLines(run, ctxFor(run))) {
      if (l.state !== 'passed' && l.state !== 'skipped' && l.state !== 'failed') continue
      const c = by.get(l.name) ?? { name: l.name, met: 0, skipped: 0, failed: 0 }
      if (l.state === 'passed') c.met++
      else if (l.state === 'skipped') c.skipped++
      else c.failed++
      by.set(l.name, c)
    }
  }
  return [...by.values()]
}

export interface MatrixCell {
  run: string
  title: string
  /** How the step stood in that run; none when the run's workflow has no such step or had not got to it. */
  state?: 'passed' | 'skipped' | 'failed' | 'open'
  note?: string
}
export interface StepMatrix {
  /** The step names: the newest run's order first, then any step only older runs had. */
  steps: string[]
  /** One column for each run, oldest first, at most `max` of the newest. */
  runs: { id: string; title: string; cells: MatrixCell[] }[]
  /** How many older runs did not fit. */
  more: number
}

/** The runs side by side and the steps down the side: each cell is how one step ended in one run, so a skipped or failed step shows in the run it happened in. */
export function stepMatrix(runs: Run[], ctxFor: (run: Run) => StepContext, max = 16): StepMatrix {
  const sorted = [...runs].sort((a, b) => a.startedAt - b.startedAt)
  const lines = new Map(sorted.map((r) => [r.id, stepLines(r, ctxFor(r))]))
  // The newest run's steps set the order (its workflow is the one in use); a step only older runs had comes after them.
  const steps = [...new Set([...sorted].reverse().flatMap((r) => lines.get(r.id)!.map((l) => l.name)))]
  const shown = sorted.slice(-max)
  return {
    steps,
    more: sorted.length - shown.length,
    runs: shown.map((r) => ({
      id: r.id,
      title: r.title,
      cells: steps.map((name): MatrixCell => {
        const l = lines.get(r.id)!.find((x) => x.name === name)
        const state = !l ? undefined : l.state === 'passed' || l.state === 'skipped' || l.state === 'failed' ? l.state : l.state === 'pending' ? undefined : 'open'
        return { run: r.id, title: r.title, ...(state && { state }), ...(l?.note && { note: l.note }) }
      })
    }))
  }
}

/** The runs of the week that want the person: a gate missed or overridden, or waiting for them. Newest first, at most `max`, with how many more there are. */
export function needsLook(days: WeekDay[], max = 3): { shown: { id: string; title: string; kind: TileKind; day: string }[]; more: number } {
  const all = days.flatMap((d) => d.runs.filter((r) => r.kind === 'bad' || r.kind === 'wait').map((r) => ({ ...r, day: d.label }))).reverse()
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) }
}
