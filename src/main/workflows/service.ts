import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { type Run, type RunEvent, reduceRuns } from '../../shared/runs'

interface Deps {
  /** Whether workflows are switched on: off starts no new task, but a task already open can still finish. */
  enabled: () => boolean
  now: () => number
  newId: () => string
  /** Who an agent is, for the run's label; nothing for an agent the office no longer knows. */
  who: (agentId: string) => { name: string; project: string } | undefined
}

const KINDS = ['begin', 'round', 'done', 'stop', 'commit']

/** What the log says, skipping a half-written last line (expected after a crash) and lines of another kind. */
export function parseRuns(text: string): RunEvent[] {
  const out: RunEvent[] = []
  for (const line of text.split('\n')) {
    try {
      const e = JSON.parse(line) as RunEvent
      if (KINDS.includes(e.k) && Number.isFinite(e.t)) out.push(e)
    } catch {
      /* ignored on purpose */
    }
  }
  return out
}

/** Tasks agents report through the office tools, kept in an append-only log the way the ledger is. */
export class Workflows {
  constructor(
    private file: string,
    private deps: Deps
  ) {}

  private events(): RunEvent[] {
    try {
      return parseRuns(readFileSync(this.file, 'utf8'))
    } catch {
      return []
    }
  }
  private append(e: RunEvent) {
    mkdirSync(dirname(this.file), { recursive: true })
    appendFileSync(this.file, JSON.stringify(e) + '\n')
  }

  runs(): Run[] {
    return reduceRuns(this.events())
  }
  openCount() {
    return this.runs().filter((r) => r.status === 'open').length
  }

  /** The agent's runs, newest first. */
  private mine(agentId: string) {
    return this.runs().filter((r) => r.agent === agentId).reverse()
  }

  /** `followUp`: the request continues the agent's last task, so that run gets a new round instead of a new run. */
  begin(agentId: string, title: string, opts: { followUp?: boolean } = {}) {
    if (!this.deps.enabled()) throw new Error('Workflows are off.')
    const who = this.deps.who(agentId)
    if (!who) throw new Error('Unknown agent.')
    const last = this.mine(agentId)[0]
    if (opts.followUp && last) {
      if (last.status !== 'open') this.append({ k: 'round', t: this.deps.now(), run: last.id })
      return last.id
    }
    // An agent that starts another task has moved on from the one it had open.
    const open = last?.status === 'open' ? last : undefined
    if (open) this.append({ k: 'done', t: this.deps.now(), run: open.id })
    const run = this.deps.newId()
    this.append({ k: 'begin', t: this.deps.now(), run, agent: agentId, name: who.name, project: who.project, title })
    return run
  }

  done(agentId: string, summary?: string) {
    const open = this.runs().find((r) => r.agent === agentId && r.status === 'open')
    if (!open) throw new Error('No task is open.')
    this.append({ k: 'done', t: this.deps.now(), run: open.id, ...(summary && { summary }) })
  }

  /** "Stop them now": every open run is closed as stopped. */
  stopAll() {
    for (const r of this.runs()) if (r.status === 'open') this.append({ k: 'stop', t: this.deps.now(), run: r.id })
  }

  /**
   * A commit belongs to the round whose time window holds the moment it was made, whenever it is read; one made outside every
   * window goes to the agent's nearest run, flagged, so nothing is untracked.
   */
  commit(agentId: string, sha: string, subject: string, at = this.deps.now()) {
    if (this.events().some((e) => e.k === 'commit' && e.sha === sha)) return
    const mine = this.mine(agentId)
    const last = mine[0]
    // Work committed before the agent's first task began is not part of any run.
    if (!last || at < mine[mine.length - 1]!.startedAt) return
    for (const r of mine) {
      const round = r.rounds.find((x) => at >= x.startedAt && (x.endedAt === undefined || at <= x.endedAt))
      if (round) return this.append({ k: 'commit', t: at, run: r.id, round: round.n, sha, subject })
    }
    // With workflows off, a commit outside every window is not recorded: the feature is winding down, not tracking new work.
    if (!this.deps.enabled()) return
    this.append({ k: 'commit', t: at, run: last.id, round: last.rounds.length, sha, subject, flagged: true })
  }
}
