import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, relative, sep } from 'node:path'
import { type PlanAnswer, type Run, type RunEvent, reduceRuns } from '../../shared/runs'
import { parsePlan } from '../../shared/plan'

interface Deps {
  /** Whether workflows are switched on: off starts no new task, but a task already open can still finish. */
  enabled: () => boolean
  /** The plan gate: a task's plan is approved by the person before the agent edits. */
  planGate: () => boolean
  /** When workflows were switched on (ms): earlier commits are history. */
  since: () => number
  now: () => number
  newId: () => string
  /** Who an agent is, for the run's label; nothing for an agent the office no longer knows. */
  who: (agentId: string) => { name: string; project: string } | undefined
}

/** Commits this close together (ms) are one piece of work the agent never announced. */
const SAME_WORK_MS = 10 * 60_000
const KINDS = ['begin', 'round', 'done', 'stop', 'plan', 'commit']
/** The folder in an agent's worktree where its plan lives: edits there are never held back. */
export const PLAN_DIR = '.agent-world'

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
   * A commit belongs to the round whose time window holds the moment it was made, whenever it is read. One made outside every
   * window means the agent did not announce the work: with no run of the agent's own it starts a run from the commit (marked as the
   * app's doing); after a task the agent did announce it is attached to the nearest run, flagged. Nothing is untracked, nothing refused.
   */
  commit(agentId: string, sha: string, subject: string, at = this.deps.now()) {
    if (this.events().some((e) => e.k === 'commit' && e.sha === sha)) return
    const mine = this.mine(agentId)
    const last = mine[0]
    // Work committed before the agent's first task began is not part of any run.
    if (last && at < mine[mine.length - 1]!.startedAt) return
    for (const r of mine) {
      const round = r.rounds.find((x) => at >= x.startedAt && (x.endedAt === undefined || at <= x.endedAt))
      if (round) return this.append({ k: 'commit', t: at, run: r.id, round: round.n, sha, subject })
    }
    // With workflows off, a commit outside every window is not recorded: the feature is winding down, not tracking new work.
    if (!this.deps.enabled()) return
    if (last && !last.auto) return this.append({ k: 'commit', t: at, run: last.id, round: last.rounds.length, sha, subject, flagged: true })
    if (at < this.deps.since()) return
    if (last?.endedAt !== undefined && at - last.endedAt < SAME_WORK_MS) {
      this.append({ k: 'commit', t: at, run: last.id, round: last.rounds.length, sha, subject })
      return this.append({ k: 'done', t: at, run: last.id })
    }
    const who = this.deps.who(agentId)
    if (!who) return
    const run = this.deps.newId()
    this.append({ k: 'begin', t: at, run, agent: agentId, name: who.name, project: who.project, title: subject, auto: true })
    this.append({ k: 'commit', t: at, run, round: 1, sha, subject })
    this.append({ k: 'done', t: at, run })
  }

  private openRun(agentId: string) {
    return this.mine(agentId).find((r) => r.status === 'open')
  }

  /** The agent hands in its plan: the read-back block is checked in code and every problem is sent back at once. */
  submitPlan(agentId: string, path: string, markdown: string) {
    const open = this.openRun(agentId)
    if (!open) throw new Error('No task is open.')
    const parsed = parsePlan(markdown)
    if (!parsed.ok) throw new Error(`The plan's read-back block needs fixing:\n${parsed.problems.map((p) => `- ${p}`).join('\n')}`)
    this.append({ k: 'plan', t: this.deps.now(), run: open.id, round: open.rounds.length, state: 'submitted', path, readback: parsed.plan })
    return { questions: parsed.plan.questions.length }
  }

  /** The person's answer to a waiting plan; a release also works when no plan was ever handed in, so a block can always be lifted. */
  decide(runId: string, state: 'approved' | 'changes' | 'released', o: { note?: string; answers?: PlanAnswer[] } = {}) {
    const run = this.runs().find((r) => r.id === runId)
    const round = run?.rounds[run.rounds.length - 1]
    if (!run || !round) throw new Error('No such run.')
    if (state !== 'released' && round.plan?.state !== 'submitted') throw new Error('No plan is waiting.')
    this.append({ k: 'plan', t: this.deps.now(), run: runId, round: round.n, state, ...(o.note && { note: o.note }), ...(o.answers?.length && { answers: o.answers }) })
  }

  /**
   * Why an edit to `file` must wait, or null when it may go ahead. A task's first round is held from its start until the person
   * approves the plan; a follow-up round, a task the app started and a finished task are not.
   */
  editBlock(agentId: string, file: string, cwd: string): string | null {
    if (!this.deps.enabled() || !this.deps.planGate()) return null
    const run = this.openRun(agentId)
    if (!run || run.auto) return null
    const round = run.rounds[run.rounds.length - 1]!
    const plan = round.plan
    if (plan?.state === 'approved' || plan?.state === 'released') return null
    if (!plan && round.n > 1) return null
    const rel = relative(cwd, file)
    if (!rel.startsWith('..') && rel.split(sep)[0] === PLAN_DIR) return null
    if (!plan) return `Not yet: this office wants your plan approved first. Write it to ${PLAN_DIR}/plan.md with the read-back block and call plan_submit.`
    return plan.state === 'submitted'
      ? 'Not yet: your plan is waiting for the person to approve it.'
      : 'Not yet: the person asked for changes to your plan. Revise it and call plan_submit again.'
  }
}
