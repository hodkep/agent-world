import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, relative, sep } from 'node:path'
import { type PlanAnswer, type PlanCheck, type Run, type RunEvent, reduceRuns } from '../../shared/runs'
import { auditPrompt, parseAudit } from '../../shared/audit'
import { intentPrompt, parseIntent } from '../../shared/intent'
import { parsePlan, type PlanQuestion } from '../../shared/plan'
import type { MergeCheck } from '../../shared/mergeCheck'
import type { Dial } from '../../shared/workflows'

interface Deps {
  /** Whether workflows are switched on: off starts no new task, but a task already open can still finish. */
  enabled: () => boolean
  /** The plan gate: a task's plan is approved by the person before the agent edits. */
  planGate: () => boolean
  /** The merge gate: Land is held until the plan was approved and the audit's findings were seen. */
  mergeGate: () => boolean
  dial: () => Dial
  /** One question to a model for the audit, under the agent's own account; the reply text and what it cost. */
  ask: (agentId: string, prompt: string, model?: string) => Promise<{ text: string; cost?: number; model?: string }>
  /** When workflows were switched on (ms): earlier commits are history. */
  since: () => number
  now: () => number
  newId: () => string
  /** Who an agent is, for the run's label; nothing for an agent the office no longer knows. */
  who: (agentId: string) => { name: string; project: string } | undefined
}

/** What the intent check found: questions to add to the plan, with what the call cost; or why it could not. */
export type IntentResult = { questions: PlanQuestion[]; cost?: number; model?: string } | { failed: string }

/** Commits this close together (ms) are one piece of work the agent never announced. */
const SAME_WORK_MS = 10 * 60_000
const KINDS = ['begin', 'round', 'done', 'stop', 'plan', 'commit', 'audit', 'seen', 'merge']
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
  /** Audits being asked for right now, by run and head, so two views of the same head share one model call. */
  private auditing = new Map<string, Promise<void>>()

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

  /**
   * At the max dial a small model reads the person's request against the plan and lists what it leaves open. Nothing is asked below max,
   * with no open task, or for a plan the read-back check will refuse. A model that fails is reported, never fatal: the plan goes ahead without it.
   */
  async intentCheck(agentId: string, markdown: string, request: string): Promise<IntentResult | undefined> {
    if (!this.deps.enabled() || !this.deps.planGate() || this.deps.dial() !== 'max' || !this.openRun(agentId)) return undefined
    const parsed = parsePlan(markdown)
    if (!parsed.ok) return undefined
    try {
      const reply = await this.deps.ask(agentId, intentPrompt(request, parsed.plan).prompt, 'haiku')
      const gaps = parseIntent(reply.text)
      if (!gaps) return { failed: 'The reply was not a list of gaps.' }
      return { questions: gaps, ...(reply.cost !== undefined && { cost: reply.cost }), ...(reply.model && { model: reply.model }) }
    } catch (e) {
      return { failed: (e as Error).message }
    }
  }

  /** The agent hands in its plan: the read-back block is checked in code and every problem is sent back at once. */
  submitPlan(agentId: string, path: string, markdown: string, check?: IntentResult) {
    const open = this.openRun(agentId)
    if (!open) throw new Error('No task is open.')
    const parsed = parsePlan(markdown)
    if (!parsed.ok) throw new Error(`The plan's read-back block needs fixing:\n${parsed.problems.map((p) => `- ${p}`).join('\n')}`)
    // The check's questions come after the agent's own, and one the agent already asked is not asked twice.
    const asked = new Set(parsed.plan.questions.map((q) => q.text.trim().toLowerCase()))
    const extra = check && 'questions' in check ? check.questions.filter((q) => !asked.has(q.text.trim().toLowerCase())) : []
    const readback = { ...parsed.plan, questions: [...parsed.plan.questions, ...extra] }
    const recorded: PlanCheck | undefined = !check ? undefined : 'failed' in check ? { failed: check.failed } : { added: extra.length, ...(check.cost !== undefined && { cost: check.cost }), ...(check.model && { model: check.model }) }
    this.append({ k: 'plan', t: this.deps.now(), run: open.id, round: open.rounds.length, state: 'submitted', path, readback, ...(recorded && { check: recorded }) })
    return { questions: readback.questions.length }
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
    if (!plan && (round.n > 1 || this.deps.dial() === 'economy')) return null
    const rel = relative(cwd, file)
    if (!rel.startsWith('..') && rel.split(sep)[0] === PLAN_DIR) return null
    if (!plan) return `Not yet: this office wants your plan approved first. Write it to ${PLAN_DIR}/plan.md with the read-back block and call plan_submit.`
    return plan.state === 'submitted'
      ? 'Not yet: your plan is waiting for the person to approve it.'
      : 'Not yet: the person asked for changes to your plan. Revise it and call plan_submit again.'
  }

  /** What stands between the agent's work and landing it, or null when no gate applies (off, or the agent never had a run). */
  mergeCheck(agentId: string, head: string, o: { auditable?: boolean } = {}): MergeCheck | null {
    const run = this.mine(agentId)[0]
    if (!this.deps.enabled() || !this.deps.mergeGate() || !run) return null
    const blocking: string[] = []
    const notes: string[] = []
    const plan = [...run.rounds].reverse().find((r) => r.plan)?.plan
    let state: MergeCheck['plan'] = plan?.state === 'submitted' ? 'waiting' : (plan?.state ?? 'none')
    if (run.auto) {
      state = 'not-needed'
      notes.push('The app started this run from a commit, so there was no plan to approve.')
    } else if (!this.deps.planGate() || (state === 'none' && this.deps.dial() === 'economy')) state = 'not-needed'
    else if (state === 'none') blocking.push('No plan was approved for this task.')
    else if (state === 'waiting') blocking.push('The plan is still waiting for your approval.')
    else if (state === 'changes') blocking.push('You asked for changes to the plan and no new plan was approved.')
    if (run.status === 'open') notes.push('The task is still open: the agent has not said it is done.')
    const commits = run.rounds.reduce((n, r) => n + r.commits.length, 0)
    const flagged = run.rounds.reduce((n, r) => n + r.commits.filter((c) => c.flagged).length, 0)
    if (flagged) notes.push(`${flagged} commit${flagged === 1 ? ' was' : 's were'} made outside the task.`)
    const audit = this.auditState(run, head, o.auditable ?? true)
    if (audit.state === 'done') {
      const unseen = audit.findings.filter((f) => !f.seen).length
      if (unseen) blocking.push(`${unseen} audit finding${unseen === 1 ? ' has' : 's have'} not been seen.`)
    }
    const readback = this.planOf(run)
    return { run: { id: run.id, title: run.title }, plan: state, planned: readback ? { goal: readback.goal, outOfScope: readback.outOfScope } : null, commits, flagged, audit, blocking, notes }
  }

  /** The plan an audit reads against: the latest round's that has a goal (a released hold has none). */
  private planOf(run: Run) {
    return [...run.rounds].reverse().find((r) => r.plan?.readback.goal)?.plan?.readback
  }

  private auditState(run: Run, head: string, auditable: boolean): MergeCheck['audit'] {
    if (this.deps.dial() === 'economy') return { state: 'off', reason: 'economy' }
    if (!auditable) return { state: 'off', reason: 'provider' }
    if (!this.planOf(run)) return { state: 'off', reason: 'no-plan' }
    if (this.auditing.has(`${run.id} ${head}`)) return { state: 'running' }
    const a = run.audit
    if (a?.head !== head) return { state: 'not-run' }
    return a.state === 'failed' ? { state: 'failed', reason: a.reason } : { state: 'done', findings: a.findings, files: a.files, lines: a.lines, truncated: a.truncated, ...(a.cost !== undefined && { cost: a.cost }), ...(a.model && { model: a.model }) }
  }

  /** The audit of `head` against the agent's plan: one question to a model, its findings logged with what it cost. */
  runAudit(agentId: string, head: string, diff: string): Promise<void> {
    const run = this.mine(agentId)[0]
    if (!run || !this.planOf(run) || this.deps.dial() === 'economy' || (run.audit?.head === head && run.audit.state === 'done')) return Promise.resolve()
    const key = `${run.id} ${head}`
    const running = this.auditing.get(key)
    if (running) return running
    const p = this.audit(agentId, run, head, diff).finally(() => this.auditing.delete(key))
    this.auditing.set(key, p)
    return p
  }

  private async audit(agentId: string, run: Run, head: string, diff: string) {
    const readback = this.planOf(run)!
    const shown = auditPrompt(readback, diff)
    const failed = (reason: string) => this.append({ k: 'audit', t: this.deps.now(), run: run.id, head, state: 'failed', reason })
    let reply: Awaited<ReturnType<Deps['ask']>>
    try {
      reply = await this.deps.ask(agentId, shown.prompt)
    } catch (e) {
      return failed((e as Error).message)
    }
    const findings = parseAudit(reply.text)
    if (!findings) return failed('The reply was not a list of findings.')
    this.append({ k: 'audit', t: this.deps.now(), run: run.id, head, state: 'done', findings, files: shown.files, lines: shown.lines, truncated: shown.truncated, ...(reply.cost !== undefined && { cost: reply.cost }), ...(reply.model && { model: reply.model }) })
  }

  /** The person has looked at these findings (by position) of the audit of `head`. */
  seen(agentId: string, head: string, which: number[]) {
    const run = this.mine(agentId)[0]
    if (!run) throw new Error('No such run.')
    this.append({ k: 'seen', t: this.deps.now(), run: run.id, head, which })
  }

  /** Land is about to happen: refused while the check holds it, unless the person chose to land anyway; either way the choice is logged. */
  landing(agentId: string, head: string, o: { anyway?: boolean; auditable?: boolean } = {}) {
    const check = this.mergeCheck(agentId, head, o)
    if (!check) return
    if (check.blocking.length && !o.anyway) throw new Error(`Not ready to land:\n${check.blocking.map((b) => `- ${b}`).join('\n')}`)
    this.append({ k: 'merge', t: this.deps.now(), run: check.run.id, head, how: check.blocking.length ? 'anyway' : 'checked', held: check.blocking })
  }
}
