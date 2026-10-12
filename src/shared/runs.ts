import type { Finding } from './audit'
import type { PlanReadback } from './plan'

/**
 * A workflow run is one task an agent worked on, read back from an append-only log: when it began, each round
 * (a follow-up after it finished is a new round of the same run), and the commits made in it.
 */
export type RunEvent =
  | { k: 'begin'; t: number; run: string; agent: string; name: string; project: string; title: string; /** Started by the app from a commit, because the agent never announced the task. */ auto?: boolean }
  /** A follow-up after the run finished: the same run, round n + 1. */
  | { k: 'round'; t: number; run: string }
  | { k: 'done'; t: number; run: string; summary?: string }
  | { k: 'stop'; t: number; run: string }
  /** `flagged`: the commit was made with no task open, so it was attached to the nearest run. */
  /** The plan of a round: submitted (with its read-back), then approved, sent back for changes, or released (the person lifted the block without approving). */
  | { k: 'plan'; t: number; run: string; round: number; state: 'submitted'; path: string; readback: PlanReadback; check?: PlanCheck }
  | { k: 'plan'; t: number; run: string; round: number; state: 'approved' | 'changes' | 'released'; note?: string; answers?: PlanAnswer[] }
  | { k: 'commit'; t: number; run: string; sha: string; subject: string; flagged?: boolean; /** The round it was made in; the latest when not given. */ round?: number }
  /** A model's review of the branch head against the plan, or why it could not be done. */
  | { k: 'audit'; t: number; run: string; head: string; state: 'done'; findings: Finding[]; files: number; lines: number; truncated: boolean; cost?: number; model?: string }
  | { k: 'audit'; t: number; run: string; head: string; state: 'failed'; reason: string }
  /** The person has seen these findings (by position) of the audit of `head`. */
  | { k: 'seen'; t: number; run: string; head: string; which: number[] }
  /** The work was landed: after the checks, or "anyway" with `held` still holding it. */
  | { k: 'merge'; t: number; run: string; head: string; how: 'checked' | 'anyway'; held: string[] }

export interface PlanAnswer {
  question: string
  answer: string
}
/** What the intent check did for a plan: how many questions it added (they are in the read-back, marked as its own), or why it could not. */
export type PlanCheck = { added: number; cost?: number; model?: string } | { failed: string }
export interface RoundPlan {
  state: 'submitted' | 'approved' | 'changes' | 'released'
  path: string
  readback: PlanReadback
  check?: PlanCheck
  submittedAt: number
  decidedAt?: number
  note?: string
  answers?: PlanAnswer[]
}
export interface RunCommit {
  sha: string
  subject: string
  t: number
  flagged?: boolean
}
export interface Round {
  n: number
  startedAt: number
  endedAt?: number
  commits: RunCommit[]
  plan?: RoundPlan
}
export type RunAudit =
  | { head: string; t: number; state: 'failed'; reason: string }
  | { head: string; t: number; state: 'done'; findings: (Finding & { seen: boolean })[]; files: number; lines: number; truncated: boolean; cost?: number; model?: string }
export interface Landed {
  t: number
  head: string
  how: 'checked' | 'anyway'
  held: string[]
}
export interface Run {
  id: string
  agent: string
  name: string
  project: string
  title: string
  auto?: boolean
  status: 'open' | 'done' | 'stopped'
  startedAt: number
  endedAt?: number
  summary?: string
  rounds: Round[]
  /** The audit of the branch head the person last looked at, if one ran. */
  audit?: RunAudit
  landed?: Landed
}

/** Folds the log into runs, oldest first. An event for a run that was never begun is ignored, so a damaged log still reads. */
export function reduceRuns(events: RunEvent[]): Run[] {
  const runs = new Map<string, Run>()
  for (const e of events) {
    if (e.k === 'begin') {
      runs.set(e.run, { id: e.run, agent: e.agent, name: e.name, project: e.project, title: e.title, ...(e.auto && { auto: true }), status: 'open', startedAt: e.t, rounds: [{ n: 1, startedAt: e.t, commits: [] }] })
      continue
    }
    const r = runs.get(e.run)
    const round = r?.rounds[r.rounds.length - 1]
    if (!r || !round) continue
    if (e.k === 'round') {
      r.status = 'open'
      delete r.endedAt
      r.rounds.push({ n: round.n + 1, startedAt: e.t, commits: [] })
    } else if (e.k === 'plan') {
      const into = r.rounds.find((x) => x.n === e.round)
      if (!into) continue
      if (e.state === 'submitted') into.plan = { state: 'submitted', path: e.path, readback: e.readback, ...(e.check && { check: e.check }), submittedAt: e.t }
      else if (e.state === 'released' && !into.plan) into.plan = { state: 'released', path: '', readback: { goal: '', assumptions: [], outOfScope: [], questions: [] }, submittedAt: e.t, decidedAt: e.t }
      else if (into.plan) {
        into.plan = { ...into.plan, state: e.state, decidedAt: e.t, ...(e.note && { note: e.note }), ...(e.answers?.length && { answers: e.answers }) }
      }
    } else if (e.k === 'commit') {
      const into = (e.round !== undefined && r.rounds.find((x) => x.n === e.round)) || round
      into.commits.push({ sha: e.sha, subject: e.subject, t: e.t, ...(e.flagged && { flagged: true }) })
    } else if (e.k === 'audit') {
      r.audit = e.state === 'failed' ? { head: e.head, t: e.t, state: 'failed', reason: e.reason } : { head: e.head, t: e.t, state: 'done', findings: e.findings.map((f) => ({ ...f, seen: false })), files: e.files, lines: e.lines, truncated: e.truncated, ...(e.cost !== undefined && { cost: e.cost }), ...(e.model && { model: e.model }) }
    } else if (e.k === 'seen') {
      if (r.audit?.state === 'done' && r.audit.head === e.head) for (const i of e.which) if (r.audit.findings[i]) r.audit.findings[i]!.seen = true
    } else if (e.k === 'merge') {
      r.landed = { t: e.t, head: e.head, how: e.how, held: e.held }
    } else {
      r.status = e.k === 'done' ? 'done' : 'stopped'
      r.endedAt = e.t
      round.endedAt = e.t
      if (e.k === 'done' && e.summary) r.summary = e.summary
    }
  }
  return [...runs.values()]
}

/** "ada: Add a dark-mode toggle (round 2)": who, what, and which round once there is more than one. */
export const runLabel = (r: Run) => `${r.name}: ${r.title}${r.rounds.length > 1 ? ` (round ${r.rounds.length})` : ''}`

/** Plans waiting for the person: one per round at most. */
export const pendingPlans = (runs: Run[]) => runs.flatMap((run) => run.rounds.filter((round) => round.plan?.state === 'submitted').map((round) => ({ run, round })))
