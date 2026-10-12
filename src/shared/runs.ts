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
  | { k: 'plan'; t: number; run: string; round: number; state: 'submitted'; path: string; readback: PlanReadback }
  | { k: 'plan'; t: number; run: string; round: number; state: 'approved' | 'changes' | 'released'; note?: string; answers?: PlanAnswer[] }
  | { k: 'commit'; t: number; run: string; sha: string; subject: string; flagged?: boolean; /** The round it was made in; the latest when not given. */ round?: number }

export interface PlanAnswer {
  question: string
  answer: string
}
export interface RoundPlan {
  state: 'submitted' | 'approved' | 'changes' | 'released'
  path: string
  readback: PlanReadback
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
      if (e.state === 'submitted') into.plan = { state: 'submitted', path: e.path, readback: e.readback, submittedAt: e.t }
      else if (e.state === 'released' && !into.plan) into.plan = { state: 'released', path: '', readback: { goal: '', assumptions: [], outOfScope: [], questions: [] }, submittedAt: e.t, decidedAt: e.t }
      else if (into.plan) {
        into.plan = { ...into.plan, state: e.state, decidedAt: e.t, ...(e.note && { note: e.note }), ...(e.answers?.length && { answers: e.answers }) }
      }
    } else if (e.k === 'commit') {
      const into = (e.round !== undefined && r.rounds.find((x) => x.n === e.round)) || round
      into.commits.push({ sha: e.sha, subject: e.subject, t: e.t, ...(e.flagged && { flagged: true }) })
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
