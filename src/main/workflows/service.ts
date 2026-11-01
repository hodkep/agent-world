import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { DEFAULT_RETRIES, auditSetAside, checkFailed, checkGaveUp, checkRuns, readyForAudit, stepStates, lanesOf, LATER, noWorkRecorded, refusedAsk, finishable } from '../../shared/steps'
import type { CheckResult } from './runCheck'
import type { Asked } from './ask'
import { type PlanAnswer, type PlanCheck, type Run, type RunWorkflow, type RunEvent, reduceRuns } from '../../shared/runs'
import { auditPrompt, parseAudit } from '../../shared/audit'
import { intentPrompt, parseIntent } from '../../shared/intent'
import { parsePlan, type PlanQuestion } from '../../shared/plan'
import type { MergeCheck } from '../../shared/mergeCheck'
import type { Dial } from '../../shared/workflows'
import { namedSkills } from '../../shared/skills'
import { isLanding, isSkippable, landingKind } from '../../shared/workflow'

interface Deps {
  /** Whether workflows are switched on: off starts no new task, but a task already open can still finish. */
  enabled: () => boolean
  /** The plan gate: a task's plan is approved by the person before the agent edits. */
  /** The merge gate: Land is held until the plan was approved and the audit's findings were seen. */
  /** The agent's project uses no workflow: no task is recorded and nothing is held, as with workflows off. */
  noWorkflow?: (agentId: string) => boolean
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
const AUDIT_STEP = 'audit'
const SAME_WORK_MS = 10 * 60_000
/** What a run's ledger says of a push the pre-push hold never saw (`git push --no-verify`). */
const SKIPPED_HOLD = 'Pushed without the hold: git push --no-verify.'
/** What a landing records when the person set the review aside: it did not pass the review, it was excused from it. */
const ASIDE_HELD = 'The review was set aside.'
/** What the app commits for an agent's unfinished work when it quits. */
const SNAPSHOT = /^chore\([^)]*\): work in progress$/
const KINDS = ['drop', 'begin', 'round', 'workflow', 'todo', 'done', 'reopen', 'stop', 'plan', 'commit', 'audit', 'seen', 'scope', 'item', 'merge', 'step', 'check', 'start', 'skipask', 'skipans', 'trouble']
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
  /** When each running audit began, for the card that says how long it has taken. */
  private auditStarted = new Map<string, number>()

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

  /**
   * The run the commits of `head` belong to: the agent's earlier run that recorded a commit with that sha, else its latest run. A commit counts for an earlier run only when the
   * app recorded it before any later run of the agent began, by the order of the log and not by the commit's own date (git can be told any date), so work done under a later
   * task cannot take the gate of an earlier one. A head no run recorded follows the latest run.
   */
  private ownerOf(agentId: string, head?: string): Run | undefined {
    const runs = this.mine(agentId)
    const latest = runs[0]
    if (!head) return latest
    const events = this.events()
    const recorded = events.findIndex((e) => e.k === 'commit' && e.sha === head)
    const owner = recorded < 0 ? undefined : runs.find((r) => r.id === events[recorded]!.run)
    if (!owner || owner === latest) return latest
    const began = (r: Run) => events.findIndex((e) => e.k === 'begin' && e.run === r.id)
    return runs.filter((r) => began(r) > began(owner)).every((r) => began(r) > recorded) ? owner : latest
  }

  /** Whether a task of this agent follows a workflow at all: not in a project that uses none, unless the task asks for one that is there. */
  applies(agentId: string, requested?: string): boolean {
    return !this.deps.noWorkflow?.(agentId) || (!!requested && !!this.deps.pick(agentId, requested))
  }

  /**
   * A new request while the agent's run is open is one more item of that run, not another run: one track, one audit of the whole branch, one pull request.
   * Only a run that is still open counts: not one that was done, landed, stopped or started from a commit, and not a request that continues the last task.
   */
  addition(agentId: string, title: string, followUp = false): Run | undefined {
    const open = this.openRun(agentId)
    if (followUp || !open || open.auto || open.landed) return undefined
    this.append({ k: 'item', t: this.deps.now(), run: open.id, title })
    this.link(open.id, agentId, open.todos)
    return this.runs().find((r) => r.id === open.id)
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

  done(agentId: string, summary?: string, o: { byApp?: boolean } = {}) {
    const open = this.runs().find((r) => r.agent === agentId && r.status === 'open')
    if (!open) {
      // The push that ended a pull request run already said it: the agent's own task_done after it is not an error.
      const last = this.mine(agentId)[0]
      if (last?.landed && landingKind(last.workflow) === 'pr') return
      throw new Error('No task is open.')
    }
    // Finishing never claims a step nobody did: one the agent has to do and never reported is refused by name; an optional one it never reported was not needed, so it is skipped
    // (marked as the app's doing); one that starts on Run waits for the person's press, and is left alone.
    const round = open.rounds[open.rounds.length - 1]!
    // Work added to the run is finished with it: each of its lane's required steps is reported first.
    if (!o.byApp) {
      for (const lane of this.lanes(open)) {
        const owed = lane.steps.find((x) => x.kind === 'work' && x.state !== 'passed' && x.state !== 'skipped' && !open.workflow?.steps.find((w) => w.id === x.id)?.optional)
        if (owed) throw new Error(`Report "${owed.name}" for item ${lane.item} first: it was never done.`)
      }
    }
    const unreported = (open.workflow?.steps ?? []).filter((s) => s.kind === 'work' && !this.reported(round, s.id))
    const owed = unreported.find((s) => !s.optional && !(s.start === 'run' && round.starts?.[s.id] === undefined))
    // The app closing the run itself (the push went through) has nothing to ask of the agent: what is left is marked as the app's doing.
    // A step the person refused stops the workflow: the agent may close the task, and the steps after it are left undone.
    const refused = this.states(open).some((x) => x.state === 'failed' && x.kind !== 'check' && x.kind !== 'audit')
    if (owed && !o.byApp && !refused) throw new Error(`Report "${owed.name}" first: it was never done.`)
    // A step that starts on Run waits for the person's word: finishing now would close the task, and their Run would then open a new round that starts over.
    const waiting = unreported.find((s) => !s.optional && s.start === 'run' && round.starts?.[s.id] === undefined)
    if (waiting && !o.byApp && !refused) throw new Error(`The person has not pressed Run on "${waiting.name}" yet: nothing is finished until they do. Stop here and wait; their Run arrives as your next message.`)
    for (const s of unreported) if (o.byApp || s.optional) this.append({ k: 'step', t: this.deps.now(), run: open.id, round: round.n, step: s.id, state: s.optional ? 'skipped' : 'done', implicit: true })
    this.append({ k: 'done', t: this.deps.now(), run: open.id, ...(summary && { summary }) })
  }

  private states(run: Run, head?: string) {
    return stepStates(run, { auditOn: this.deps.dial() !== 'economy', approved: run.workflow ? this.deps.approved(run.workflow) : true, ...(head && { head }) })
  }

  /**
   * Whether the app starts the audit without being asked: the run's steps before it have passed and it has not been audited in this round. One audit by itself per round,
   * so a run that commits again does not pay for another on every new head; the person's "Run the audit now" audits the new one.
   */
  auditDue(agentId: string, head: string): boolean {
    const run = this.ownerOf(agentId, head)
    // An audit that starts when the person presses Run is never started by the app.
    if (run?.workflow?.steps.some((x) => x.kind === 'audit' && x.start === 'run')) return false
    const tried = !!run?.audit && run.audit.t >= run.rounds[run.rounds.length - 1]!.startedAt
    return !!run && !tried && run.status !== 'stopped' && !!run.workflow && readyForAudit(run, { auditOn: this.deps.dial() !== 'economy', approved: this.deps.approved(run.workflow), head })
  }

  private running = new Set<string>()

  private checkStep(runId: string, step: string) {
    const run = this.runs().find((r) => r.id === runId)
    const round = run?.rounds[run.rounds.length - 1]
    if (!run || !round) throw new Error('No such run.')
    if (run.workflow?.steps.find((s) => s.id === step)?.kind !== 'check') throw new Error('That is not a check.')
    return { run, round }
  }

  /** The person pressed Run on a step of the agent's (the plan, a build) that starts that way: it may begin. Says its name. */
  startStep(runId: string, step: string): string {
    const run = this.runs().find((r) => r.id === runId)
    const round = run?.rounds[run.rounds.length - 1]
    if (!run || !round) throw new Error('No such run.')
    const found = run.workflow?.steps.find((s) => s.id === step)
    if (!found) throw new Error('No such step.')
    if (found.start !== 'run' || (found.kind !== 'plan' && found.kind !== 'work')) throw new Error('That step does not wait for Run.')
    if (!this.states(run).find((s) => s.id === step)?.toRun) throw new Error('That step is not waiting for Run.')
    this.append({ k: 'start', t: this.deps.now(), run: runId, round: round.n, step })
    return found.name
  }

  /** The person skips an optional step the agent or they would do (a build or an approval): it is not followed, and the run goes on. Says its name. */
  skipStep(runId: string, step: string): string {
    const run = this.runs().find((r) => r.id === runId)
    const round = run?.rounds[run.rounds.length - 1]
    if (!run || !round) throw new Error('No such run.')
    const found = run.workflow?.steps.find((s) => s.id === step)
    if (!found) throw new Error('No such step.')
    // A check is skipped by skipCheck and an audit set aside, as before.
    if (!(found.optional || isSkippable(found)) || (found.kind !== 'work' && found.kind !== 'approve' && found.kind !== 'pr')) throw new Error('That step cannot be skipped.')
    this.append({ k: 'step', t: this.deps.now(), run: runId, round: round.n, step, state: 'skipped' })
    return found.name
  }

  /** Whether the agent has dealt with a step in this round: it reported it, or it was skipped or refused, and it was not sent back or reopened after. */
  private reported(round: Run['rounds'][number], id: string): boolean {
    const l = round.steps.filter((x) => x.step === id && x.item === undefined).at(-1)
    return !!l && l.state !== 'changes' && l.state !== 'reopen'
  }

  /** The names of the steps the person refused and that are still refused, in order: what the agent may ask about again when it is the right time. */
  refusedSteps(agentId: string): string[] {
    const run = this.mine(agentId)[0]
    return run ? this.states(run).filter((s) => s.state === 'failed' && s.kind !== 'check' && s.kind !== 'audit').map((s) => s.name) : []
  }

  private reopen(run: Run, step: RunWorkflow['steps'][number], note: string): string {
    const round = run.rounds[run.rounds.length - 1]!
    if (run.status === 'done') this.append({ k: 'reopen', t: this.deps.now(), run: run.id })
    this.append({ k: 'step', t: this.deps.now(), run: run.id, round: round.n, step: step.id, state: 'reopen', ...(note && { note }) })
    return step.name
  }

  /**
   * The agent puts a step back to open: one it reported (more work touches it), or one the person refused (it is the right time to ask again). A refused step then asks
   * for the person's Run again; a reported one has to be reported again before the task can finish. Says its name.
   */
  reopenStep(agentId: string, step: string, why: string): string {
    const run = this.mine(agentId)[0]
    if (!run || run.status === 'stopped') throw new Error('No task is open.')
    const flow = run.workflow
    if (!flow) throw new Error('This task has no steps to reopen.')
    const found = flow.steps.find((s) => s.id === step)
    if (!found) throw new Error(`This workflow has no step "${step}". Its steps: ${flow.steps.map((s) => s.id).join(', ')}.`)
    if (found.kind === 'plan') throw new Error('The plan is not reopened this way: submit it again with plan_submit.')
    const note = why.trim().slice(0, 200)
    if (!note) throw new Error('Say why in a few words: the person is told.')
    const now = this.states(run).find((s) => s.id === step)?.state
    if (now !== 'passed' && now !== 'failed' && now !== 'skipped') throw new Error(`"${found.name}" has not been reported yet, so there is nothing to reopen.`)
    if (run.landed && (found.kind === 'pr' || found.kind === 'merge')) throw new Error(`"${found.name}" already happened: the branch was pushed.`)
    return this.reopen(run, found, note)
  }

  /** The person asks for a step they refused once more: it is open again, and asks for their Run as before. Says its name. */
  askAgain(runId: string, step: string): string {
    const run = this.runs().find((r) => r.id === runId)
    const found = run?.workflow?.steps.find((s) => s.id === step)
    if (!run || !found) throw new Error('No such step.')
    if (this.states(run).find((s) => s.id === step)?.state !== 'failed') throw new Error('That step was not refused.')
    return this.reopen(run, found, '')
  }

  /**
   * The agent asks to skip steps that are not optional (a task that changed nothing has nothing to commit, push or open): one question, with its reason, and nothing is
   * skipped until the person says yes. Says the names, in the workflow's order.
   */
  askSkip(agentId: string, steps: string[], why: string): string[] {
    const run = this.openRun(agentId)
    if (!run) throw new Error('No task is open.')
    const flow = run.workflow
    if (!flow) throw new Error('This task has no steps to skip.')
    const reason = why.trim().slice(0, 300)
    if (!reason) throw new Error('Say the reason: the person is asked to approve skipping with it.')
    if (steps.length === 0) throw new Error('Name the steps to skip, by their ids.')
    if (run.skipAsk) throw new Error('A question to skip steps is already waiting for the person: wait for the answer.')
    const states = this.states(run)
    const picked = new Set<string>()
    for (const id of steps) {
      const at = flow.steps.findIndex((s) => s.id === id)
      if (at < 0) throw new Error(`This workflow has no step "${id}". Its steps: ${flow.steps.map((s) => s.id).join(', ')}.`)
      const s = flow.steps[at]!
      if (s.kind === 'plan') throw new Error('The plan is not skipped this way.')
      if (states[at]?.state === 'passed') throw new Error(`"${s.name}" is already done.`)
      if (states[at]?.state === 'skipped') throw new Error(`"${s.name}" is already skipped.`)
      if (!s.optional && !isSkippable(s)) throw new Error(`"${s.name}" is required: it cannot be skipped. Do it.`)
      picked.add(id)
    }
    const ordered = flow.steps.filter((s) => picked.has(s.id))
    const round = run.rounds[run.rounds.length - 1]!
    this.append({ k: 'skipask', t: this.deps.now(), run: run.id, round: round.n, steps: ordered.map((s) => s.id), why: reason })
    return ordered.map((s) => s.name)
  }

  /** The step of the agent's latest run that the person started with Run and the agent has left running: only they can finish it. */
  finishable(agentId: string): { run: string; step: string; name: string } | null {
    const found = finishable(this.runs().filter((r) => r.agent === agentId), (r) => ({ auditOn: this.deps.dial() !== 'economy', approved: r.workflow ? this.deps.approved(r.workflow) : true })).at(-1)
    return found ? { run: found.run.id, step: found.step.id, name: found.step.name } : null
  }

  /** The person marks a step of theirs done: it is reported for the agent, as if the agent had called step_done. */
  finishStep(runId: string, step: string) {
    const run = this.runs().find((r) => r.id === runId)
    const found = run && this.finishable(run.agent)
    if (!run || !found || found.step !== step) throw new Error('That step is not waiting for you to finish it.')
    return { name: found.name, next: this.stepDone(run.agent, step).next }
  }

  /** The agent's open question to skip steps, with the names of those steps, or null. */
  skipAsked(agentId: string): { run: string; names: string[]; why: string } | null {
    const run = this.mine(agentId)[0]
    const ask = run?.skipAsk
    return run && ask ? { run: run.id, names: ask.steps.map((id) => run.workflow?.steps.find((s) => s.id === id)?.name ?? id), why: ask.why } : null
  }

  /** The step of the agent's latest run that the person refused and has not said what to do about, or null; a pending question to skip comes first. */
  refusedFor(agentId: string): { run: string; ask: NonNullable<ReturnType<typeof refusedAsk>> } | null {
    const run = this.mine(agentId)[0]
    const ask = run && !run.skipAsk ? refusedAsk(run, { auditOn: this.deps.dial() !== 'economy', approved: run.workflow ? this.deps.approved(run.workflow) : true }) : undefined
    return run && ask ? { run: run.id, ask } : null
  }

  /** The person's answer to the question to skip: yes marks every step skipped with the reason, no leaves them as they were. */
  answerSkip(runId: string, approve: boolean): { names: string[]; why: string; approved: boolean } {
    const run = this.runs().find((r) => r.id === runId)
    const ask = run?.skipAsk
    if (!run || !ask) throw new Error('Nothing waits to be skipped.')
    const round = run.rounds[run.rounds.length - 1]!
    const names = ask.steps.map((id) => run.workflow?.steps.find((s) => s.id === id)?.name ?? id)
    if (approve) {
      const states = this.states(run)
      for (const id of ask.steps) {
        const now = states.find((x) => x.id === id)?.state
        if (now !== 'passed' && now !== 'skipped') this.append({ k: 'step', t: this.deps.now(), run: runId, round: round.n, step: id, state: 'skipped', note: ask.why })
      }
    }
    this.append({ k: 'skipans', t: this.deps.now(), run: runId, round: round.n, state: approve ? 'approved' : 'declined' })
    return { names, why: ask.why, approved: approve }
  }

  /** Whether the agent may be told to push: its latest run was not ended, and the step that pushes was neither skipped nor refused (a run the agent finished may still wait for the push). */
  mayAskPush(agentId: string): boolean {
    const run = this.mine(agentId)[0]
    if (!run || run.status === 'stopped') return false
    const landing = run.workflow?.steps.find((s) => isLanding(s.kind))
    if (!landing) return true
    const now = this.states(run).find((s) => s.id === landing.id)?.state
    return now !== 'skipped' && now !== 'failed'
  }

  /**
   * The person ends a run that cannot go on (a stuck one): what is left is set aside with the reason, the run stops, and nothing about it is asked again.
   * Says the names of the steps that were set aside.
   */
  endRun(runId: string, why: string): string[] {
    const run = this.runs().find((r) => r.id === runId)
    if (!run) throw new Error('No such run.')
    if (run.status === 'stopped') throw new Error('This run is already ended.')
    const round = run.rounds[run.rounds.length - 1]!
    const note = why.trim().slice(0, 200) || 'The person ended this run.'
    const left = (run.workflow ? this.states(run) : []).filter((s) => s.state !== 'passed' && s.state !== 'skipped')
    if (run.skipAsk) this.append({ k: 'skipans', t: this.deps.now(), run: runId, round: round.n, state: 'declined' })
    for (const s of left) this.append({ k: 'step', t: this.deps.now(), run: runId, round: round.n, step: s.id, state: 'skipped', note })
    this.append({ k: 'stop', t: this.deps.now(), run: runId })
    return left.map((s) => s.name)
  }

  /** The person refuses a step that is not optional: it is marked failed, the steps after it do not run, and the agent is told to stop. Says its name. */
  declineStep(runId: string, step: string): string {
    const run = this.runs().find((r) => r.id === runId)
    const round = run?.rounds[run.rounds.length - 1]
    if (!run || !round) throw new Error('No such run.')
    const found = run.workflow?.steps.find((s) => s.id === step)
    if (!found) throw new Error('No such step.')
    if (found.optional) throw new Error('That step is optional: skip it instead.')
    this.append({ k: 'step', t: this.deps.now(), run: runId, round: round.n, step, state: 'declined' })
    return found.name
  }

  /** Whether the run is open and has recorded no work at all, so dropping it loses nothing. */
  noWorkflowNeeded(runId: string): boolean {
    const run = this.runs().find((r) => r.id === runId)
    return !!run && run.status === 'open' && noWorkRecorded(run)
  }

  /** The person drops a run that never needed a workflow: it is removed from the lists. A run with work recorded is ended instead. Says its title. */
  dropRun(runId: string): string {
    const run = this.runs().find((r) => r.id === runId)
    if (!run) throw new Error('No such run.')
    if (!this.noWorkflowNeeded(runId)) throw new Error('This run has work recorded: end it instead.')
    this.append({ k: 'drop', t: this.deps.now(), run: runId })
    return run.title
  }

  /** The person skips a step they refused, so the steps after it go on. Says its name. */
  skipRefused(runId: string, step: string): string {
    const { run, round, found } = this.refused(runId, step)
    if (!isSkippable(found)) throw new Error(`"${found.name}" cannot be skipped: ask again later, or stop here.`)
    this.append({ k: 'step', t: this.deps.now(), run: run.id, round: round.n, step, state: 'skipped', note: 'Skipped by the person after refusing it.' })
    return found.name
  }

  /** The person answers a refused step with "ask again later": it stays refused, and nothing asks them about it again until it is reopened. Says its name. */
  deferRefused(runId: string, step: string): string {
    const { run, round, found } = this.refused(runId, step)
    this.append({ k: 'step', t: this.deps.now(), run: run.id, round: round.n, step, state: 'declined', note: LATER })
    return found.name
  }

  private refused(runId: string, step: string) {
    const run = this.runs().find((r) => r.id === runId)
    const round = run?.rounds[run.rounds.length - 1]
    const found = run?.workflow?.steps.find((s) => s.id === step)
    if (!run || !round || !found) throw new Error('No such step.')
    if (this.states(run).find((s) => s.id === step)?.state !== 'failed') throw new Error('That step was not refused.')
    return { run, round, found }
  }

  /** The step after `id` in the run's workflow, for the agent to be told what comes next (its name, whether it may be skipped, and what it is for). */
  nextAfter(run: Run, id: string): { id: string; name: string; optional: boolean; start: boolean; brief?: string } | undefined {
    const steps = run.workflow?.steps ?? []
    const n = steps[steps.findIndex((s) => s.id === id) + 1]
    return n && { id: n.id, name: n.name, optional: !!n.optional, start: n.start === 'run' || n.gate === 'approve', ...(n.brief && { brief: n.brief }) }
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
  async runChecks(agentId: string, head: string, o: { fresh?: boolean; /** The person pressed Run for this check: it runs, and no other. */ only?: string } = {}): Promise<{ ran: number; passed?: { name: string; run: string; ms: number }[]; sendBack?: string; gaveUp?: string; waitingApproval?: string }> {
    let ran = 0
    const passed: { name: string; run: string; ms: number }[] = []
    const result = <T extends object>(x: T) => ({ ...x, ...(passed.length > 0 && { passed }) })
    for (;;) {
      const run = this.mine(agentId)[0]
      const cwd = this.deps.cwd(agentId)
      if (!run?.workflow || run.status === 'stopped' || !cwd) return result({ ran })
      const due = this.states(run, head).find((s) => s.kind === 'check' && (s.state === 'running' || s.state === 'waiting'))
      if (!due) return result({ ran })
      // A check that starts on Run waits for that press (the person's, for this check); one the person pressed Run for is the only one that runs.
      if (due.toRun) {
        if (o.only !== due.id) return result({ ran })
      } else if (o.only !== undefined && due.id !== o.only) return result({ ran })
      else if (due.state === 'waiting') return result({ ran, waitingApproval: due.name })
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
    if (!run.workflow) return true
    const merge = run.workflow.steps.find((s) => isLanding(s.kind))
    // A merge is the person's own click on Land; a pull request holds the push when it asks (a start on Run, or an older file's gate of approve); no landing step holds nothing.
    return !!merge && (merge.kind === 'merge' || merge.gate === 'approve' || merge.start === 'run')
  }

  /** What the agent's latest run ends in, if its workflow has a landing step: a pull request (git holds the push) or a merge (git holds the base branch). */
  landKind(agentId: string): 'pr' | 'merge' | undefined {
    return landingKind(this.mine(agentId)[0]?.workflow)
  }

  /** Whether the run's plan must be approved before edits: the plan step's own gate decides, else the Settings switch; a workflow with no plan step needs none. */
  private planRequired(run: Run): boolean {
    if (!run.workflow) return true
    const plan = run.workflow.steps.find((s) => s.kind === 'plan')
    return !!plan && plan.gate !== 'auto'
  }

  /**
   * The agent says a step it does is done: the one named, or the first still open. After the person sent the work back, saying so again
   * reports the last work step done once more. Says which step now waits for the person, if one does.
   */
  stepDone(agentId: string, step?: string, o: { skipped?: boolean; why?: string; item?: number } = {}): { done: string; waiting?: string; checking?: boolean; skipped?: boolean; next?: { id: string; name: string; optional: boolean; start: boolean; brief?: string } } {
    // An agent may close the task in the same turn that its check fails, before it is told: reporting the fix then opens the task again.
    const closed = this.mine(agentId)[0]
    if (!this.openRun(agentId) && closed?.status === 'done' && this.states(closed).some((s) => s.kind === 'check' && s.state === 'running' && !!s.tries)) this.append({ k: 'reopen', t: this.deps.now(), run: closed.id })
    const run = this.openRun(agentId)
    if (!run) throw new Error('No task is open.')
    const flow = run.workflow
    if (!flow) throw new Error('This task has no steps to report.')
    const round = run.rounds[run.rounds.length - 1]!
    // Work added to the run has a lane of its own: a step reported for it (named by its number, or the main chain having it done already) goes there.
    const lanes = this.lanes(run)
    if (o.item !== undefined) {
      const lane = lanes.find((l) => l.item === o.item)
      if (!lane) throw new Error(`This task has no item ${o.item}.${lanes.length ? ` Added work: ${lanes.map((l) => `${l.item} "${l.title}"`).join(', ')}.` : ' Nothing was added to it.'}`)
      return this.laneDone(run, round, lane, step, o)
    }
    const last = (id: string) => round.steps.filter((x) => x.step === id && x.item === undefined).at(-1)
    const reportable = (s: RunWorkflow['steps'][number]) => s.kind === 'work' && (last(s.id)?.state === undefined || last(s.id)?.state === 'changes' || last(s.id)?.state === 'reopen')
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
        const lane = back?.step.id === target.id ? undefined : lanes.find((l) => l.steps.some((x) => x.id === target!.id && x.state !== 'passed' && x.state !== 'skipped'))
        if (lane) return this.laneDone(run, round, lane, target.id, o)
        if (back?.step.id !== target.id) throw new Error(`"${step}" is already done.${back ? ` ${back.by === 'check' ? 'A check was sent back' : 'Work was sent back'}: report the fix with step_done("${back.step.id}"), or with no id.` : ''}`)
      }
    } else {
      target = flow.steps.find(reportable) ?? sentBack()?.step
      if (!target) {
        const lane = lanes.find((l) => l.steps.some((x) => x.state === 'running'))
        if (lane) return this.laneDone(run, round, lane, undefined, o)
        throw new Error('Every step you do is already reported done.')
      }
    }
    // A step that starts on Run is not the agent's to report before the person has pressed it.
    if (target.start === 'run' && round.starts?.[target.id] === undefined) throw new Error(`The person has not pressed Run on "${target.name}" yet.`)
    // One step at a time, in order: every step before this one is done or skipped first.
    const states = this.states(run)
    const at = flow.steps.findIndex((s) => s.id === target!.id)
    const unmet = flow.steps.slice(0, at).find((s, i) => states[i]?.state !== 'passed' && states[i]?.state !== 'skipped')
    if (unmet) throw new Error(`"${unmet.name}" comes before "${target.name}": ${unmet.kind === 'work' ? `report it, or skip it with step_done("${unmet.id}", skipped, "<why>"): a step is never passed over without saying so.` : 'it is not met yet.'}`)
    if (o.skipped) {
      if (!target.optional) throw new Error(`"${target.name}" is not optional: do it, or ask the person.`)
      const why = o.why?.trim().slice(0, 200)
      if (!why) throw new Error('Say why in a few words: a skipped step needs a reason.')
      this.append({ k: 'step', t: this.deps.now(), run: run.id, round: round.n, step: target.id, state: 'skipped', note: why })
      return { done: target.id, skipped: true, ...this.nextOf(run.id, target.id) }
    }
    this.append({ k: 'step', t: this.deps.now(), run: run.id, round: round.n, step: target.id, state: 'done' })
    const after = this.states(this.runs().find((r) => r.id === run.id)!)
    const waiting = after.find((s) => s.state === 'waiting' && (s.kind === 'approve' || s.kind === 'work'))
    return { done: target.id, ...this.nextOf(run.id, target.id), ...(waiting && { waiting: waiting.name }), ...(after.some((s) => s.kind === 'check' && (s.state === 'running' || s.state === 'waiting')) && { checking: true }) }
  }

  /** The work added to a run, each as a lane with its own steps. */
  private lanes(run: Run) {
    return lanesOf(run, { auditOn: this.deps.dial() !== 'economy', approved: run.workflow ? this.deps.approved(run.workflow) : true })
  }

  /** The agent reports a step of the lane of work added to the run: in order within the lane, and skipped only when it is optional and says why. */
  private laneDone(run: Run, round: Run['rounds'][number], lane: ReturnType<Workflows['lanes']>[number], step: string | undefined, o: { skipped?: boolean; why?: string }) {
    const flow = run.workflow!
    const target = step ? lane.steps.find((x) => x.id === step) : lane.steps.find((x) => x.state === 'running')
    if (!target) throw new Error(step ? `"${step}" is not a step of item ${lane.item}: its steps are ${lane.steps.map((x) => x.id).join(', ')}.` : `Every step of item ${lane.item} is already reported.`)
    const def = flow.steps.find((x) => x.id === target.id)!
    if (def.kind !== 'work') throw new Error(`"${target.name}" for item ${lane.item} is not a step you report: the plan is submitted with plan_submit.`)
    if (target.state === 'passed' || target.state === 'skipped') throw new Error(`"${target.name}" is already done for item ${lane.item}.`)
    const at = lane.steps.findIndex((x) => x.id === target.id)
    const unmet = lane.steps.slice(0, at).find((x) => x.state !== 'passed' && x.state !== 'skipped')
    if (unmet) throw new Error(`"${unmet.name}" comes before "${target.name}" for item ${lane.item}: ${unmet.kind === 'work' ? `report it, or skip it with step_done("${unmet.id}", skipped, "<why>").` : 'it is not met yet.'}`)
    if (o.skipped) {
      if (!def.optional) throw new Error(`"${target.name}" is not optional: do it, or ask the person.`)
      const why = o.why?.trim().slice(0, 200)
      if (!why) throw new Error('Say why in a few words: a skipped step needs a reason.')
      this.append({ k: 'step', t: this.deps.now(), run: run.id, round: round.n, step: target.id, state: 'skipped', note: why, item: lane.item })
      return { done: target.id, skipped: true, ...this.nextOf(run.id, target.id) }
    }
    this.append({ k: 'step', t: this.deps.now(), run: run.id, round: round.n, step: target.id, state: 'done', item: lane.item })
    return { done: target.id, ...this.nextOf(run.id, target.id) }
  }

  /** A command failed while the agent's run was open: kept in the run's story with the step it was at. The same failure twice in a row is one. */
  trouble(agentId: string, t: { label: string; command: string; error: string }) {
    const run = this.openRun(agentId)
    if (!run) return
    const prev = run.troubles?.at(-1)
    const now = this.deps.now()
    if (prev && prev.command === t.command && prev.error === t.error && now - prev.t < 5000) return
    const step = this.states(run).find((x) => x.state === 'running' || x.state === 'waiting')?.id
    this.append({ k: 'trouble', t: now, run: run.id, ...(step && { step }), label: t.label, command: t.command, error: t.error })
  }

  private nextOf(runId: string, id: string) {
    const next = this.nextAfter(this.runs().find((r) => r.id === runId)!, id)
    return next ? { next } : {}
  }

  /** The step of the agent's latest run that waits for the person (to approve it or send the work back), or null. */
  waitingStep(agentId: string): { run: string; step: string; name: string; /** It waits for the person's Run (it starts on Run), not for their answer to work that was done. */ toRun: boolean } | null {
    const run = this.mine(agentId)[0]
    const waiting = run && this.states(run).find((s) => s.state === 'waiting' && (s.kind === 'approve' || s.kind === 'work'))
    return run && waiting ? { run: run.id, step: waiting.id, name: waiting.name, toRun: !!waiting.toRun } : null
  }

  /** The person's answer to a step that waits for them: approve it, or send the work back with a note. */
  approveStep(runId: string, step: string, decision: 'approved' | 'changes', o: { note?: string } = {}) {
    const run = this.runs().find((r) => r.id === runId)
    const round = run?.rounds[run.rounds.length - 1]
    if (!run || !round) throw new Error('No such run.')
    const waiting = this.states(run).find((s) => s.id === step && s.state === 'waiting' && (s.kind === 'approve' || s.kind === 'work' || s.awaiting))
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
    // With workflows off, a commit outside every window is not recorded: the feature is winding down, not tracking new work. A project with no workflow tracks none either.
    if (!this.deps.enabled() || this.deps.noWorkflow?.(agentId)) return
    // A commit older than the run that would take it (an app-made snapshot from days ago, say) is not this task's: it is not attached, so it can never be pushed for it.
    if (last && !last.auto) return at < last.startedAt ? undefined : this.append({ k: 'commit', t: at, run: last.id, round: last.rounds.length, sha, subject, flagged: true })
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
    const run = this.openRun(agentId)
    if (!this.deps.enabled() || this.deps.dial() !== 'max' || !run || !this.planRequired(run)) return undefined
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
    if (!run || run.auto) return null
    // A step of the agent's that starts when the person presses Run does not begin before it: nothing is edited or committed until then.
    const waiting = this.states(run).find((x) => x.toRun && (x.kind === 'plan' || x.kind === 'work'))
    if (waiting) return `Not yet: the person has not pressed Run on "${waiting.name}". Wait until you are told to start it.`
    if (!this.planRequired(run)) return null
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
    const run = this.ownerOf(agentId, head)
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
    // The snapshots the app makes when it quits are not work to push.
    const commits = run.rounds.reduce((n, r) => n + r.commits.filter((c) => !SNAPSHOT.test(c.subject)).length, 0)
    const flagged = run.rounds.reduce((n, r) => n + r.commits.filter((c) => c.flagged).length, 0)
    if (flagged) notes.push(`${flagged} commit${flagged === 1 ? ' was' : 's were'} made outside the task.`)
    const audit: MergeCheck['audit'] = gated ? this.auditState(run, head, o.auditable ?? true) : { state: 'off', reason: 'gate' }
    const asideAudit = auditSetAside(run)
    if (audit.state === 'done' && !asideAudit) {
      const unseen = audit.findings.filter((f) => !f.seen).length
      if (unseen) blocking.push(`${unseen} audit finding${unseen === 1 ? ' has' : 's have'} not been seen.`)
    }
    // Steps the person must approve before landing: named, so they know which.
    const states = this.states(run, head)
    for (const w of states) if ((w.state === 'waiting' && (w.kind === 'approve' || w.kind === 'work' || w.awaiting)) || w.gated) blocking.push(`"${w.name}" has not been approved.`)
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
    return { run: { id: run.id, title: run.title }, ...(landingKind(run.workflow) === 'pr' && { land: 'pr' as const }), plan: state, planned: readback ? { goal: readback.goal, outOfScope: readback.outOfScope } : null, commits, flagged, audit, asideAudit, checks, blocking, notes }
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
    if (this.auditing.has(`${run.id} ${head}`)) return { state: 'running', since: this.auditStarted.get(`${run.id} ${head}`) ?? this.deps.now() }
    const a = run.audit
    if (a?.head !== head) return { state: 'not-run' }
    return a.state === 'failed' ? { state: 'failed', reason: a.reason } : { state: 'done', t: a.t, findings: a.findings, files: a.files, lines: a.lines, truncated: a.truncated, ...(a.cost !== undefined && { cost: a.cost }), ...(a.tokens !== undefined && { tokens: a.tokens }), ...(a.model && { model: a.model }) }
  }

  /** The audit of `head` against the agent's plan: one question to a model, its findings logged with what it cost. */
  runAudit(agentId: string, head: string, diff: string): Promise<void> {
    const run = this.ownerOf(agentId, head)
    if (!run || !this.planOf(run) || this.deps.dial() === 'economy' || (run.workflow && !run.workflow.steps.some((s) => s.kind === 'audit')) || (run.audit?.head === head && run.audit.state === 'done')) return Promise.resolve()
    const key = `${run.id} ${head}`
    const running = this.auditing.get(key)
    if (running) return running
    this.auditStarted.set(key, this.deps.now())
    const p = this.audit(agentId, run, head, diff).finally(() => (this.auditing.delete(key), this.auditStarted.delete(key)))
    this.auditing.set(key, p)
    return p
  }

  private async audit(agentId: string, run: Run, head: string, diff: string) {
    const readback = this.planOf(run)!
    const shown = auditPrompt(readback, diff, { additions: run.additions?.map((a) => a.text), focus: run.workflow?.steps.find((x) => x.kind === 'audit')?.brief })
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
    const run = this.ownerOf(agentId, head)
    if (!run) throw new Error('No such run.')
    this.append({ k: 'seen', t: this.deps.now(), run: run.id, head, which })
  }

  /**
   * The person says these out-of-scope findings (by position, of the audit of `head`) belong in the plan: each becomes an addition every later audit is told about,
   * and counts as seen. Only out-of-scope work can be added, since the other kinds are about the goal and the guesses, not about what the plan covers.
   */
  addToPlan(agentId: string, head: string, which: number[]) {
    const run = this.ownerOf(agentId, head)
    if (!run) throw new Error('No such run.')
    const a = run.audit
    if (a?.state !== 'done' || a.head !== head) throw new Error('That audit is not the latest.')
    const picked = [...new Set(which)].flatMap((i) => (a.findings[i] ? [a.findings[i]!] : []))
    if (picked.some((f) => f.kind !== 'out-of-scope')) throw new Error('Only out-of-scope work can be added to the plan.')
    for (const f of picked) this.append({ k: 'scope', t: this.deps.now(), run: run.id, text: f.text })
    this.append({ k: 'seen', t: this.deps.now(), run: run.id, head, which })
  }

  /** The person sets the review aside: not followed, by their choice, and nothing it found or has not yet found holds landing. */
  asideAudit(agentId: string, head?: string) {
    this.auditStep(agentId, 'skipped', head)
  }

  /** The person takes it back: the review's findings hold landing again. */
  undoAsideAudit(agentId: string, head?: string) {
    this.auditStep(agentId, 'rerun', head)
  }

  private auditStep(agentId: string, state: 'skipped' | 'rerun', head?: string) {
    const run = this.ownerOf(agentId, head)
    if (!run) throw new Error('No such run.')
    // A run that follows no workflow has no audit step of its own: its audit is the one the gate runs, and sets aside under that name.
    const step = run.workflow ? run.workflow.steps.find((s) => s.kind === 'audit')?.id : AUDIT_STEP
    if (!step) throw new Error('This run has no review to set aside.')
    this.append({ k: 'step', t: this.deps.now(), run: run.id, round: run.rounds.length, step, state })
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
    const held = this.holdsOf(check)
    return held.length ? held : null
  }

  /** What holds a head: the check's own reasons, and a review that was expected and has not answered (the person would be letting it land unseen). */
  private holdsOf(check: MergeCheck): string[] {
    const reviewing = check.asideAudit ? [] : check.audit.state === 'not-run' ? ['The review has not run for this branch yet.'] : check.audit.state === 'running' ? ['The review is still running.'] : []
    return [...check.blocking, ...reviewing]
  }

  /** Land is about to happen: refused while the check holds it, unless the person chose to land anyway; either way the choice is logged. */
  landing(agentId: string, head: string, o: { anyway?: boolean; auditable?: boolean; unchecked?: boolean } = {}) {
    const check = this.mergeCheck(agentId, head, o)
    // A push that skipped the hold is always "anyway", with that said last: the person was never asked.
    const skipped = o.unchecked ? [SKIPPED_HOLD] : []
    if (!check) {
      // Nothing holds a push that ends in a pull request with its gate auto, but the run still ends there.
      const run = this.ownerOf(agentId, head)
      if (this.deps.enabled() && run && landingKind(run.workflow) === 'pr') {
        this.append({ k: 'merge', t: this.deps.now(), run: run.id, head, how: skipped.length ? 'anyway' : 'checked', held: skipped })
        this.endAtPush(agentId)
      }
      return
    }
    if (check.blocking.length && !o.anyway) throw new Error(`Not ready to land:\n${check.blocking.map((b) => `- ${b}`).join('\n')}`)
    this.allowed.delete(agentId)
    const held = [...(o.unchecked ? this.holdsOf(check) : check.blocking), ...(check.asideAudit ? [ASIDE_HELD] : []), ...skipped]
    this.append({ k: 'merge', t: this.deps.now(), run: check.run.id, head, how: held.length ? 'anyway' : 'checked', held })
    if (check.land === 'pr') this.endAtPush(agentId)
  }

  /** A run that ends in a pull request ends when its branch is pushed: the same as the agent saying it is done, which it need not do. */
  private endAtPush(agentId: string) {
    const run = this.openRun(agentId)
    if (!run) return
    // Steps of the agent's after the pushing step (opening the pull request) still have to be done: the agent reports them and says it is finished.
    const flow = run.workflow?.steps ?? []
    const round = run.rounds[run.rounds.length - 1]!
    const at = flow.findIndex((x) => isLanding(x.kind))
    if (at >= 0 && flow.slice(at + 1).some((x) => x.kind === 'work' && !this.reported(round, x.id))) return
    this.done(agentId, undefined, { byApp: true })
  }

  /** Whether this head of the agent's latest run is already recorded as landed or pushed. */
  landedHead(agentId: string, head: string): boolean {
    return this.ownerOf(agentId, head)?.landed?.head === head
  }
}
