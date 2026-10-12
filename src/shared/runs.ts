/**
 * A workflow run is one task an agent worked on, read back from an append-only log: when it began, each round
 * (a follow-up after it finished is a new round of the same run), and the commits made in it.
 */
export type RunEvent =
  | { k: 'begin'; t: number; run: string; agent: string; name: string; project: string; title: string }
  /** A follow-up after the run finished: the same run, round n + 1. */
  | { k: 'round'; t: number; run: string }
  | { k: 'done'; t: number; run: string; summary?: string }
  | { k: 'stop'; t: number; run: string }
  /** `flagged`: the commit was made with no task open, so it was attached to the nearest run. */
  | { k: 'commit'; t: number; run: string; sha: string; subject: string; flagged?: boolean; /** The round it was made in; the latest when not given. */ round?: number }

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
}
export interface Run {
  id: string
  agent: string
  name: string
  project: string
  title: string
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
      runs.set(e.run, { id: e.run, agent: e.agent, name: e.name, project: e.project, title: e.title, status: 'open', startedAt: e.t, rounds: [{ n: 1, startedAt: e.t, commits: [] }] })
      continue
    }
    const r = runs.get(e.run)
    const round = r?.rounds[r.rounds.length - 1]
    if (!r || !round) continue
    if (e.k === 'round') {
      r.status = 'open'
      delete r.endedAt
      r.rounds.push({ n: round.n + 1, startedAt: e.t, commits: [] })
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
