import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { DEFAULT_RETRIES, checkFailed, checkGaveUp, checkRuns, readyForAudit, stepStates } from '../../shared/steps'
import type { CheckResult } from './runCheck'
import type { Asked } from './ask'
import { type PlanAnswer, type PlanCheck, type Run, type RunWorkflow, type RunEvent, reduceRuns } from '../../shared/runs'
import { auditPrompt, parseAudit } from '../../shared/audit'
import { intentPrompt, parseIntent } from '../../shared/intent'
import { parsePlan, type PlanQuestion } from '../../shared/plan'
import type { MergeCheck } from '../../shared/mergeCheck'
import type { Dial } from '../../shared/workflows'
import { namedSkills } from '../../shared/skills'

interface Deps {
  /** Whether workflows are switched on: off starts no new task, but a task already open can still finish. */
  enabled: () => boolean
  /** The plan gate: a task's plan is approved by the person before the agent edits. */
  planGate: () => boolean
  /** The merge gate: Land is held until the plan was approved and the audit's findings were seen. */
  mergeGate: () => boolean
  dial: () => Dial
  /** One question to a model for the audit, under the agent's own account; the reply text and what it cost. */
  ask: (agentId: string, prompt: string, model?: string) => Promise<Asked>
  /** The workflow a new task follows: the one the agent asked for if there is such a workflow, else the project's default. Nothing when the app has none to offer. */
  pick: (agentId: string, requested?: string) => RunWorkflow | undefined
  /** Runs a check's command in a folder. */
  run: (command: string, cwd: string) => Promise<CheckResult>
  /** Whether the commands of this workflow's file may run: a project's file needs the person's approval of its exact content. */
  approved: (workflow: RunWorkflow) => boolean
  /** The folder an agent works in. */
  cwd: (agentId: string) => string | undefined
  /** When workflows were switched on (ms): earlier commits are history. */
  since: () => number
  now: () => number
  newId: () => string
  /** The id of the task the agent is on, if any: a run begun then belongs to it. */
  todoOf?: (agentId: string) => string | undefined
  /** Who an agent is, for the run's label; nothing for an agent the office no longer knows. */
  who: (agentId: string) => { name: string; project: string } | undefined
}

/** What the intent check found: questions to add to the plan, with what the call cost; or why it could not. */
export type IntentResult = { questions: PlanQuestion[]; cost?: number; tokens?: number; model?: string } | { failed: string }

/** Commits this close together (ms) are one piece of work the agent never announced. */
const SAME_WORK_MS = 10 * 60_000
const KINDS = ['begin', 'round', 'workflow', 'todo', 'done', 'reopen', 'stop', 'plan', 'commit', 'audit', 'seen', 'merge', 'step', 'check']
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
  /** The skills the steps of the agent's open task's workflow name: what the agent may read for the task. */
  skillsOf(agentId: string): string[] {
    const open = this.runs().find((r) => r.agent === agentId && r.status === 'open')
    return open?.workflow ? namedSkills(open.workflow) : []
  }
  openCount() {
    return this.runs().filter((r) => r.status === 'open').length
  }

  /** The agent's runs, newest first. */
  private mine(agentId: string) {
    return this.runs().filter((r) => r.agent === agentId).reverse()
  }

  /** `followUp`: the request continues the agent's last task, so that run gets a new round instead of a new run. */
  begin(agentId: string, title: string, opts: { followUp?: boolean; workflow?: string } = {}) {
    if (!this.deps.enabled()) throw new Error('Workflows are off.')
    const who = this.deps.who(agentId)
    if (!who) throw new Error('Unknown agent.')
    const last = this.mine(agentId)[0]
    if (opts.followUp && last) {
      if (last.status !== 'open') {
        this.append({ k: 'round', t: this.deps.now(), run: last.id })
        // The workflow file may have been edited since the run began: read it again, and take the new copy when its version changed (its commands are then asked about again).
        const now = last.workflow ? this.deps.pick(agentId, last.workflow.id) : undefined
        if (now && last.workflow && now.id === last.workflow.id && now.hash !== last.workflow.hash) this.append({ k: 'workflow', t: this.deps.now(), run: last.id, workflow: now })
      }
      this.link(last.id, agentId, last.todos)
      return last.id
    }
    // An agent that starts another task has moved on from the one it had open.
    const open = last?.status === 'open' ? last : undefined
    if (open) this.append({ k: 'done', t: this.deps.now(), run: open.id })
    const run = this.deps.newId()
    const workflow = this.deps.pick(agentId, opts.workflow)
    this.append({ k: 'begin', t: this.deps.now(), run, agent: agentId, name: who.name, project: who.project, title, ...(workflow && { workflow }) })
    this.link(run, agentId)
    return run
  }

  /** The run belongs to the task the agent is on, if there is one and the run does not have it yet. */
  private link(run: string, agentId: string, have: string[] = []) {
    const todo = this.deps.todoOf?.(agentId)
    if (todo && !have.includes(todo)) this.append({ k: 'todo', t: this.deps.now(), run, todo })
  }

  done(agentId: string, summary?: string) {
    const open = this.runs().find((r) => r.agent === agentId && r.status === 'open')
    if (!open) throw new Error('No task is open.')
    // Agents often forget to report a step: finishing the task reports the ones left, marked as the app's doing.
    const round = open.rounds[open.rounds.length - 1]!
    for (const s of open.workflow?.steps ?? []) {
      if (s.kind === 'work' && !round.steps.some((x) => x.step === s.id && x.state !== 'changes')) this.append({ k: 'step', t: this.deps.now(), run: open.id, round: round.n, step: s.id, state: 'done', implicit: true })
    }
    this.append({ k: 'done', t: this.deps.now(), run: open.id, ...(summary && { summary }) })
  }

  private states(run: Run, head?: string) {
    return stepStates(run, { auditOn: this.deps.dial() !== 'economy', planGate: this.deps.planGate(), approved: run.workflow ? this.deps.approved(run.workflow) : true, ...(head && { head }) })
  }

  /**
   * Whether the app starts the audit without being asked: the run's steps before it have passed and it has not been audited in this round. One audit by itself per round,
   * so a run that commits again does not pay for another on every new head; the person's "Run the audit now" audits the new one.
   */
  auditDue(agentId: string, head: string): boolean {
    const run = this.mine(agentId)[0]
    const tried = !!run?.audit && run.audit.t >= run.rounds[run.rounds.length - 1]!.startedAt
    return !!run && !tried && run.status !== 'stopped' && !!run.workflow && readyForAudit(run, { auditOn: this.deps.dial() !== 'economy', planGate: this.deps.planGate(), approved: this.deps.approved(run.workflow), head })
  }

  private running = new Set<string>()

  private checkStep(runId: string, step: string) {
    const run = this.runs().find((r) => r.id === runId)
    const round = run?.rounds[run.rounds.length - 1]
    if (!run || !round) throw new Error('No such run.')
    if (run.workflow?.steps.find((s) => s.id === step)?.kind !== 'check') throw new Error('That is not a check.')
    return { run, round }
  }

  /** The person passes a check over: it does not hold landing. */
  skipCheck(runId: string, step: string) {
    const { run, round } = this.checkStep(runId, step)
    if (this.states(run).find((s) => s.id === step)?.state === 'passed') throw new Error('That check already passed.')
    this.append({ k: 'step', t: this.deps.now(), run: runId, round: round.n, step, state: 'skipped' })
  }

  /** The person asks for a check again: it gets all its tries back. */
  rerunCheck(runId: string, step: string) {
    const { round } = this.checkStep(runId, step)
    this.append({ k: 'step', t: this.deps.now(), run: runId, round: round.n, step, state: 'rerun' })
  }

  /** The person approved the commands after all: the checks they had declined are asked for again, and ones that failed on their tries are left as they are. */
  commandsApproved(runId: string) {
    const run = this.runs().find((r) => r.id === runId)
    const round = run?.rounds[run.rounds.length - 1]
    if (!run || !round) throw new Error('No such run.')
    for (const s of this.states(run)) {
      const declined = round.steps.filter((x) => x.step === s.id && (x.state === 'declined' || x.state === 'rerun')).at(-1)?.state === 'declined'
      if (s.kind === 'check' && declined) this.append({ k: 'step', t: this.deps.now(), run: runId, round: round.n, step: s.id, state: 'rerun' })
    }
  }

  /** The person does not approve the commands of the file: the checks that wait for it are marked failed, and run again only when asked for. */
  declineCommands(runId: string) {
    const run = this.runs().find((r) => r.id === runId)
    const round = run?.rounds[run.rounds.length - 1]
    if (!run || !round) throw new Error('No such run.')
    for (const s of this.states(run)) if (s.kind === 'check' && s.state === 'waiting') this.append({ k: 'step', t: this.deps.now(), run: runId, round: round.n, step: s.id, state: 'declined' })
  }

  /**
   * Runs the checks of the agent's workflow that are due, in order, in its worktree, stopping at the first that fails or waits for the
   * person's approval of its commands. Says how many ran, and what to tell the agent when one failed and may be tried again or has run out of tries.
   */
  async runChecks(agentId: string, head: string, o: { fresh?: boolean } = {}): Promise<{ ran: number; passed?: { name: string; run: string; ms: number }[]; sendBack?: string; gaveUp?: string; waitingApproval?: string }> {
    let ran = 0
    const passed: { name: string; run: string; ms: number }[] = []
    const result = <T extends object>(x: T) => ({ ...x, ...(passed.length > 0 && { passed }) })
    for (;;) {
      const run = this.mine(agentId)[0]
      const cwd = this.deps.cwd(agentId)
      if (!run?.workflow || run.status === 'stopped' || !cwd) return result({ ran })
      const due = this.states(run, head).find((s) => s.kind === 'check' && (s.state === 'running' || s.state === 'waiting'))
      if (!due) return result({ ran })
      if (due.state === 'waiting') return result({ ran, waitingApproval: due.name })
      // Asked only for what is new: a check that already ran for this very commit is left, so a second ask (the agent reports its step and
      // its task together, or the person opens Finish) does not use up its tries. The person's "Run again" starts its results over.
      if (checkRuns(run.rounds[run.rounds.length - 1]!, due.id).results.some((c) => c.head === head)) return result({ ran })
      const key = `${run.id} ${due.id}`
      if (this.running.has(key)) return result({ ran })
      this.running.add(key)
      try {
        const step = run.workflow.steps.find((s) => s.id === due.id)!
        const round = run.rounds[run.rounds.length - 1]!
        const attempt = checkRuns(round, step.id).results.length + 1
        const r = await this.deps.run(step.run ?? '', cwd)
        this.append({ k: 'check', t: this.deps.now(), run: run.id, round: round.n, step: step.id, head, attempt, ok: r.exit === 0, exit: r.exit, timedOut: r.timedOut, ms: r.ms, tail: r.tail })
        ran++
        if (r.exit === 0) {
          passed.push({ name: step.name, run: step.run ?? '', ms: r.ms })
          continue
        }
        const of = (step.retries ?? DEFAULT_RETRIES) + 1
        // The agent may have said the task was done before its checks ran: the work coming back makes it open again, so the fix can be reported.
        if (this.runs().find((x) => x.id === run.id)?.status === 'done') this.append({ k: 'reopen', t: this.deps.now(), run: run.id })
        return attempt < of ? result({ ran, sendBack: checkFailed({ name: step.name, run: step.run ?? '', try: attempt, of, result: r }) }) : result({ ran, gaveUp: checkGaveUp({ name: step.name, tries: attempt }) })
      } finally {
        this.running.delete(key)
      }
    }
  }

  /** Whether the plan comes first for the task the agent has open. */
  planWanted(agentId: string): boolean {
    const run = this.openRun(agentId)
    return !!run && this.planRequired(run)
  }

  /** Whether landing is held for the plan, the audit and the person's approvals: the merge step's own gate decides, else the Settings switch. */
  private mergeRequired(run: Run): boolean {
    const merge = run.workflow?.steps.find((s) => s.kind === 'merge')
    return merge?.gate === 'approve' ? true : merge?.gate === 'auto' ? false : this.deps.mergeGate()
  }

  /** Whether the run's plan must be approved before edits: the plan step's own gate decides, else the Settings switch; a workflow with no plan step needs none. */
  private planRequired(run: Run): boolean {
    if (!run.workflow) return this.deps.planGate()
    const plan = run.workflow.steps.find((s) => s.kind === 'plan')
    return !plan ? false : plan.gate === 'approve' ? true : plan.gate === 'auto' ? false : this.deps.planGate()
  }

  /**
   * The agent says a step it does is done: the one named, or the first still open. After the person sent the work back, saying so again
   * reports the last work step done once more. Says which step now waits for the person, if one does.
   */
  stepDone(agentId: string, step?: string): { done: string; waiting?: string; checking?: boolean } {
    // An agent may close the task in the same turn that its check fails, before it is told: reporting the fix then opens the task again.
    const closed = this.mine(agentId)[0]
    if (!this.openRun(agentId) && closed?.status === 'done' && this.states(closed).some((s) => s.kind === 'check' && s.state === 'running' && !!s.tries)) this.append({ k: 'reopen', t: this.deps.now(), run: closed.id })
    const run = this.openRun(agentId)
    if (!run) throw new Error('No task is open.')
    const flow = run.workflow
    if (!flow) throw new Error('This task has no steps to report.')
    const round = run.rounds[run.rounds.length - 1]!
    const last = (id: string) => round.steps.filter((x) => x.step === id).at(-1)
    const reportable = (s: RunWorkflow['steps'][number]) => s.kind === 'work' && (last(s.id)?.state === undefined || last(s.id)?.state === 'changes')
    // The work that was sent back, for the agent to report again: by the person (an approve step came back), or by a check that failed and still has tries.
    const sentBack = (): { step: RunWorkflow['steps'][number]; by: 'person' | 'check' } | undefined => {
      const back = flow.steps.findIndex((s) => s.kind === 'approve' && last(s.id)?.state === 'changes')
      const failing = this.states(run).findIndex((s) => s.kind === 'check' && s.state === 'running' && !!s.tries)
      const at = back >= 0 ? back : failing
      const found = at < 0 ? undefined : flow.steps.slice(0, at).reverse().find((s) => s.kind === 'work')
      return found && { step: found, by: back >= 0 ? 'person' : 'check' }
    }
    let target: RunWorkflow['steps'][number] | undefined
    if (step) {
      target = flow.steps.find((s) => s.id === step)
      if (!target) throw new Error(`This workflow has no step "${step}". Its steps: ${flow.steps.map((s) => s.id).join(', ')}.`)
      if (target.kind !== 'work') throw new Error(`"${step}" is not a step you report: the app or the person does it.`)
      if (!reportable(target)) {
        // An agent told to "call step_done again" names the step it named before; when that step is the one sent back, that is the fix being reported.
        const back = sentBack()
        if (back?.step.id !== target.id) throw new Error(`"${step}" is already done.${back ? ` ${back.by === 'check' ? 'A check was sent back' : 'Work was sent back'}: report the fix with step_done("${back.step.id}"), or with no id.` : ''}`)
      }
    } else {
      target = flow.steps.find(reportable) ?? sentBack()?.step
      if (!target) throw new Error('Every step you do is already reported done.')
    }
    this.append({ k: 'step', t: this.deps.now(), run: run.id, round: round.n, step: target.id, state: 'done' })
    const after = this.states(this.runs().find((r) => r.id === run.id)!)
    const waiting = after.find((s) => s.state === 'waiting' && (s.kind === 'approve' || s.kind === 'work'))
    return { done: target.id, ...(waiting && { waiting: waiting.name }), ...(after.some((s) => s.kind === 'check' && (s.state === 'running' || s.state === 'waiting')) && { checking: true }) }
  }

  /** The person's answer to a step that waits for them: approve it, or send the work back with a note. */
  approveStep(runId: string, step: string, decision: 'approved' | 'changes', o: { note?: string } = {}) {
    const run = this.runs().find((r) => r.id === runId)
    const round = run?.rounds[run.rounds.length - 1]
    if (!run || !round) throw new Error('No such run.')
    const waiting = this.states(run).find((s) => s.id === step && s.state === 'waiting' && (s.kind === 'approve' || s.kind === 'work'))
    if (!waiting) throw new Error('Nothing is waiting for approval there.')
    if (decision === 'changes' && run.status === 'done') this.append({ k: 'reopen', t: this.deps.now(), run: runId })
    this.append({ k: 'step', t: this.deps.now(), run: runId, round: round.n, step, state: decision, ...(o.note && { note: o.note }) })
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
    // A run belongs to one task: commits close together join it unless the agent has moved to another task of the board.
    const todo = this.deps.todoOf?.(agentId)
    const held = last?.todos ?? []
    if (last?.endedAt !== undefined && at - last.endedAt < SAME_WORK_MS && (!todo || held.length === 0 || held.includes(todo))) {
      this.link(last.id, agentId, held)
      this.append({ k: 'commit', t: at, run: last.id, round: last.rounds.length, sha, subject })
      return this.append({ k: 'done', t: at, run: last.id })
    }
    const who = this.deps.who(agentId)
    if (!who) return
    const run = this.deps.newId()
    this.append({ k: 'begin', t: at, run, agent: agentId, name: who.name, project: who.project, title: subject, auto: true })
    this.link(run, agentId)
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
      return { questions: gaps, ...(reply.cost !== undefined && { cost: reply.cost }), ...(reply.tokens !== undefined && { tokens: reply.tokens }), ...(reply.model && { model: reply.model }) }
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
    const recorded: PlanCheck | undefined = !check ? undefined : 'failed' in check ? { failed: check.failed } : { added: extra.length, ...(check.cost !== undefined && { cost: check.cost }), ...(check.tokens !== undefined && { tokens: check.tokens }), ...(check.model && { model: check.model }) }
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
    if (!this.deps.enabled()) return null
    const run = this.openRun(agentId)
    if (!run || run.auto || !this.planRequired(run)) return null
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

  /**
   * Why a commit of `files` (paths from the work tree's root) must wait, or null when it may go ahead: the same hold as an edit, seen from git,
   * so it binds whatever program the agent is. A commit of the plan's own folder alone is never held.
   */
  commitBlock(agentId: string, cwd: string, files: string[]): string | null {
    const code = files.filter((f) => f.split('/')[0] !== PLAN_DIR)
    if (files.length > 0 && code.length === 0) return null
    return this.editBlock(agentId, join(cwd, code[0] ?? 'commit'), cwd)
  }

  /** What stands between the agent's work and landing it, or null when no gate applies (off, or the agent never had a run). */
  mergeCheck(agentId: string, head: string, o: { auditable?: boolean } = {}): MergeCheck | null {
    const run = this.mine(agentId)[0]
    if (!this.deps.enabled() || !run) return null
    // A merge step with gate auto turns off the plan and audit rules; a check that must pass and a step the person must approve still hold landing.
    const gated = this.mergeRequired(run)
    if (!gated && !run.workflow?.steps.some((s) => s.kind === 'check' || s.kind === 'approve' || (s.kind === 'work' && s.gate === 'approve'))) return null
    const blocking: string[] = []
    const notes: string[] = []
    const plan = [...run.rounds].reverse().find((r) => r.plan)?.plan
    let state: MergeCheck['plan'] = plan?.state === 'submitted' ? 'waiting' : (plan?.state ?? 'none')
    if (run.auto) {
      state = 'not-needed'
      notes.push('The app started this run from a commit, so there was no plan to approve.')
    } else if (!gated || !this.planRequired(run) || (state === 'none' && this.deps.dial() === 'economy')) state = 'not-needed'
    else if (state === 'none') blocking.push('No plan was approved for this task.')
    else if (state === 'waiting') blocking.push('The plan is still waiting for your approval.')
    else if (state === 'changes') blocking.push('You asked for changes to the plan and no new plan was approved.')
    if (run.status === 'open') notes.push('The task is still open: the agent has not said it is done.')
    const commits = run.rounds.reduce((n, r) => n + r.commits.length, 0)
    const flagged = run.rounds.reduce((n, r) => n + r.commits.filter((c) => c.flagged).length, 0)
    if (flagged) notes.push(`${flagged} commit${flagged === 1 ? ' was' : 's were'} made outside the task.`)
    const audit: MergeCheck['audit'] = gated ? this.auditState(run, head, o.auditable ?? true) : { state: 'off', reason: 'gate' }
    if (audit.state === 'done') {
      const unseen = audit.findings.filter((f) => !f.seen).length
      if (unseen) blocking.push(`${unseen} audit finding${unseen === 1 ? ' has' : 's have'} not been seen.`)
    }
    // Steps the person must approve before landing: named, so they know which.
    const states = this.states(run, head)
    for (const w of states) if (w.state === 'waiting' && (w.kind === 'approve' || w.kind === 'work')) blocking.push(`"${w.name}" has not been approved.`)
    // Checks: a row each, and landing held by name for one that has not passed or been skipped (unless its gate is auto, which only reports).
    const latest = run.rounds[run.rounds.length - 1]!
    const checks = states.flatMap((c) => {
      const step = run.workflow?.steps.find((x) => x.id === c.id)
      if (c.kind !== 'check' || !step) return []
      const last = checkRuns(latest, c.id).results.at(-1)
      if (step.gate !== 'auto' && c.state !== 'passed' && c.state !== 'skipped') {
        blocking.push(
          c.state === 'pending' ? `"${c.name}" has not run yet.`
          : c.state === 'running' ? `"${c.name}" has not passed for the branch as it is now.`
          : c.state === 'waiting' ? `"${c.name}" has not run: its commands are not approved.`
          : c.tries ? `"${c.name}" failed after ${c.tries} tries.`
          : `"${c.name}" did not run: you declined its commands.`
        )
      }
      return [{ id: c.id, name: c.name, run: step.run ?? '', state: c.state, ...(c.tries && { tries: c.tries }), ...(last && { ms: last.ms }), ...(last?.tail && !last.ok && { tail: last.tail }) }]
    })
    if (!gated && blocking.length === 0 && checks.length === 0) return null
    const readback = this.planOf(run)
    return { run: { id: run.id, title: run.title }, plan: state, planned: readback ? { goal: readback.goal, outOfScope: readback.outOfScope } : null, commits, flagged, audit, checks, blocking, notes }
  }

  /** The plan an audit reads against: the latest round's that has a goal (a released hold has none). */
  private planOf(run: Run) {
    return [...run.rounds].reverse().find((r) => r.plan?.readback.goal)?.plan?.readback
  }

  private auditState(run: Run, head: string, auditable: boolean): MergeCheck['audit'] {
    if (run.workflow && !run.workflow.steps.some((s) => s.kind === 'audit')) return { state: 'off', reason: 'workflow' }
    if (this.deps.dial() === 'economy') return { state: 'off', reason: 'economy' }
    if (!auditable) return { state: 'off', reason: 'no-model' }
    if (!this.planOf(run)) return { state: 'off', reason: 'no-plan' }
    if (this.auditing.has(`${run.id} ${head}`)) return { state: 'running' }
    const a = run.audit
    if (a?.head !== head) return { state: 'not-run' }
    return a.state === 'failed' ? { state: 'failed', reason: a.reason } : { state: 'done', findings: a.findings, files: a.files, lines: a.lines, truncated: a.truncated, ...(a.cost !== undefined && { cost: a.cost }), ...(a.tokens !== undefined && { tokens: a.tokens }), ...(a.model && { model: a.model }) }
  }

  /** The audit of `head` against the agent's plan: one question to a model, its findings logged with what it cost. */
  runAudit(agentId: string, head: string, diff: string): Promise<void> {
    const run = this.mine(agentId)[0]
    if (!run || !this.planOf(run) || this.deps.dial() === 'economy' || (run.workflow && !run.workflow.steps.some((s) => s.kind === 'audit')) || (run.audit?.head === head && run.audit.state === 'done')) return Promise.resolve()
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
    this.append({ k: 'audit', t: this.deps.now(), run: run.id, head, state: 'done', findings, files: shown.files, lines: shown.lines, truncated: shown.truncated, ...(reply.cost !== undefined && { cost: reply.cost }), ...(reply.tokens !== undefined && { tokens: reply.tokens }), ...(reply.model && { model: reply.model }) })
  }

  /** The person has looked at these findings (by position) of the audit of `head`. */
  seen(agentId: string, head: string, which: number[]) {
    const run = this.mine(agentId)[0]
    if (!run) throw new Error('No such run.')
    this.append({ k: 'seen', t: this.deps.now(), run: run.id, head, which })
  }

  /** The heads the person allowed to land with something still holding them, by agent: one allowance serves one head, and landing it uses it up. */
  private allowed = new Map<string, string>()

  /** The person said this head may land although something holds it, in answer to a held merge. */
  allowLanding(agentId: string, head: string) {
    this.allowed.set(agentId, head)
  }

  /** What holds git from moving the base branch to `head`, for the agent whose branch it is, or null when it may: the same rules as Land, unless the person allowed this head. */
  landingHold(agentId: string, head: string, o: { auditable?: boolean } = {}): string[] | null {
    const check = this.mergeCheck(agentId, head, o)
    if (!check || this.allowed.get(agentId) === head) return null
    // A review that was expected and has not answered holds the branch too: the person would be letting it land unseen.
    const reviewing = check.audit.state === 'not-run' ? ['The review has not run for this branch yet.'] : check.audit.state === 'running' ? ['The review is still running.'] : []
    const held = [...check.blocking, ...reviewing]
    return held.length ? held : null
  }

  /** Land is about to happen: refused while the check holds it, unless the person chose to land anyway; either way the choice is logged. */
  landing(agentId: string, head: string, o: { anyway?: boolean; auditable?: boolean } = {}) {
    const check = this.mergeCheck(agentId, head, o)
    if (!check) return
    if (check.blocking.length && !o.anyway) throw new Error(`Not ready to land:\n${check.blocking.map((b) => `- ${b}`).join('\n')}`)
    this.allowed.delete(agentId)
    this.append({ k: 'merge', t: this.deps.now(), run: check.run.id, head, how: check.blocking.length ? 'anyway' : 'checked', held: check.blocking })
  }
}
