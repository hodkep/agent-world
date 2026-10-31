import type { Finding } from './audit'
import type { Gate, Start, StepKind } from './workflow'
import type { PlanReadback } from './plan'

/**
 * A workflow run is one task an agent worked on, read back from an append-only log: when it began, each round
 * (a follow-up after it finished is a new round of the same run), and the commits made in it.
 */
export type RunEvent =
  | { k: 'begin'; t: number; run: string; agent: string; name: string; project: string; title: string; /** Started by the app from a commit, because the agent never announced the task. */ auto?: boolean; /** The workflow the task follows, as its file was when the task began. */ workflow?: RunWorkflow }
  /** A follow-up after the run finished: the same run, round n + 1. */
  | { k: 'round'; t: number; run: string }
  /** The run belongs to this task of the todo board: the agent was on it when the run began or a follow-up round began. */
  | { k: 'todo'; t: number; run: string; todo: string }
  /** The workflow file changed since the run took its copy and a follow-up round began: the run takes the new copy, so its commands are asked about again. */
  | { k: 'workflow'; t: number; run: string; workflow: RunWorkflow }
  | { k: 'done'; t: number; run: string; summary?: string }
  /** A finished task's work was sent back (a check failed, or the person asked for changes): it is open again, in the same round. */
  | { k: 'reopen'; t: number; run: string }
  | { k: 'stop'; t: number; run: string }
  /** `flagged`: the commit was made with no task open, so it was attached to the nearest run. */
  /** The plan of a round: submitted (with its read-back), then approved, sent back for changes, or released (the person lifted the block without approving). */
  | { k: 'plan'; t: number; run: string; round: number; state: 'submitted'; path: string; readback: PlanReadback; check?: PlanCheck }
  | { k: 'plan'; t: number; run: string; round: number; state: 'approved' | 'changes' | 'released'; note?: string; answers?: PlanAnswer[] }
  | { k: 'step'; t: number; run: string; round: number; step: string; state: 'done' | 'approved' | 'changes' | 'skipped' | 'declined' | 'rerun' | 'reopen'; note?: string; implicit?: boolean; /** For the work added to the run with this number (the run's own task is 1): the step belongs to its lane, not to the main chain. */ item?: number }
  /** A command failed while the run was open: a git command, or a test, build or lint command. `step` is the step the run was at. */
  | { k: 'trouble'; t: number; run: string; step?: string; label: string; command: string; error: string }
  /** The agent asks to skip steps that are not optional, with its reason: one question for the person, who answers it once. */
  | { k: 'skipask'; t: number; run: string; round: number; steps: string[]; why: string }
  | { k: 'skipans'; t: number; run: string; round: number; state: 'approved' | 'declined' }
  /** The person pressed Run on a step that starts that way, in this round: it may begin. */
  | { k: 'start'; t: number; run: string; round: number; step: string }
  | { k: 'check'; t: number; run: string; round: number; step: string; head: string; attempt: number; ok: boolean; exit: number | null; timedOut: boolean; ms: number; tail: string }
  | { k: 'commit'; t: number; run: string; sha: string; subject: string; flagged?: boolean; /** The round it was made in; the latest when not given. */ round?: number }
  /** A model's review of the branch head against the plan, or why it could not be done. */
  | { k: 'audit'; t: number; run: string; head: string; state: 'done'; findings: Finding[]; files: number; lines: number; truncated: boolean; cost?: number; tokens?: number; model?: string }
  | { k: 'audit'; t: number; run: string; head: string; state: 'failed'; reason: string }
  /** The agent was asked for more work while this run was open: an item of the run, not another run. */
  | { k: 'item'; t: number; run: string; title: string }
  /** The person added this to the plan after approving it (from an out-of-scope finding): in scope for every audit of the run from now on. */
  | { k: 'scope'; t: number; run: string; text: string }
  /** The person has seen these findings (by position) of the audit of `head`. */
  | { k: 'seen'; t: number; run: string; head: string; which: number[] }
  /** The work was landed: after the checks, or "anyway" with `held` still holding it. */
  | { k: 'merge'; t: number; run: string; head: string; how: 'checked' | 'anyway'; held: string[] }

/** The workflow a run follows, kept with the run so a later edit to the file cannot change how an old run is read. */
export interface RunWorkflow {
  id: string
  name: string
  hash?: string
  /** Where the file came from; a project's lives in its repository, so its commands are not the person's own. */
  scope?: 'project' | 'global'
  steps: RunStep[]
}
/** A step as a run keeps it: the whole definition, with a name. */
export interface RunStep {
  id: string
  kind: StepKind
  name: string
  gate?: Gate
  brief?: string
  start?: Start
  optional?: boolean
  skills?: string[]
  run?: string
  retries?: number
  model?: string
}
/** What happened to one step in a round: the agent said it is done, or the person approved it or sent it back. */
export interface StepLog {
  step: string
  state: 'done' | 'approved' | 'changes' | 'skipped' | 'declined' | 'rerun' | 'reopen'
  t: number
  note?: string
  /** The app marked it done when the agent finished the task, because the agent never said so. */
  implicit?: boolean
  /** For the work added to the run with this number (the run's own task is 1): the step belongs to its lane, not to the main chain. */
  item?: number
}

/** One run of a check command: for which branch head, which try it was, and how it ended. */
export interface CheckLog {
  step: string
  t: number
  head: string
  attempt: number
  ok: boolean
  exit: number | null
  timedOut: boolean
  ms: number
  tail: string
}

export interface PlanAnswer {
  question: string
  answer: string
}
/** What the intent check did for a plan: how many questions it added (they are in the read-back, marked as its own), or why it could not. */
export type PlanCheck = { added: number; cost?: number; tokens?: number; model?: string } | { failed: string }
export interface RoundPlan {
  state: 'submitted' | 'approved' | 'changes' | 'released'
  path: string
  readback: PlanReadback
  check?: PlanCheck
  submittedAt: number
  decidedAt?: number
  note?: string
  answers?: PlanAnswer[]
  /** How often the person sent it back for changes before this version; kept when it is submitted again. */
  sentBack?: number
  /** How long the person was waited on in all: each time the plan was sent to them, until they decided. Not counting a plan still waiting. */
  waitedMs?: number
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
  steps: StepLog[]
  checks: CheckLog[]
  /** When the person pressed Run on each step that starts that way, by step id. */
  starts?: Record<string, number>
}
export type RunAudit =
  | { head: string; t: number; state: 'failed'; reason: string }
  | { head: string; t: number; state: 'done'; findings: (Finding & { seen: boolean })[]; files: number; lines: number; truncated: boolean; cost?: number; tokens?: number; model?: string }
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
  workflow?: RunWorkflow
  status: 'open' | 'done' | 'stopped'
  startedAt: number
  endedAt?: number
  summary?: string
  rounds: Round[]
  /** The tasks of the todo board the run belongs to (ids), in the order they were linked. */
  todos?: string[]
  /** How often work was sent back to it after it said it was done (a check that failed, or the person's changes). */
  reopened?: number
  /** The audit of the branch head the person last looked at, if one ran. */
  audit?: RunAudit
  /** More work asked for while the run was open, in the order asked (the run's own title is the first item). */
  items?: { title: string; t: number }[]
  /** What the person added to the plan afterwards, in the order added. */
  additions?: { text: string; t: number }[]
  /** The commands that failed while the run was open, in order. */
  troubles?: { t: number; step?: string; label: string; command: string; error: string }[]
  /** The agent's question to skip steps, until the person answers it. */
  skipAsk?: { steps: string[]; why: string; t: number }
  landed?: Landed
}

/** Folds the log into runs, oldest first. An event for a run that was never begun is ignored, so a damaged log still reads. */
export function reduceRuns(events: RunEvent[]): Run[] {
  const runs = new Map<string, Run>()
  for (const e of events) {
    if (e.k === 'begin') {
      runs.set(e.run, { id: e.run, agent: e.agent, name: e.name, project: e.project, title: e.title, ...(e.auto && { auto: true }), ...(e.workflow && { workflow: e.workflow }), status: 'open', startedAt: e.t, rounds: [{ n: 1, startedAt: e.t, commits: [], steps: [], checks: [] }] })
      continue
    }
    const r = runs.get(e.run)
    const round = r?.rounds[r.rounds.length - 1]
    if (!r || !round) continue
    if (e.k === 'reopen') {
      if (r.status !== 'done') continue
      r.status = 'open'
      r.reopened = (r.reopened ?? 0) + 1
      delete r.endedAt
      delete r.summary
      delete round.endedAt
    } else if (e.k === 'todo') {
      if (!r.todos?.includes(e.todo)) r.todos = [...(r.todos ?? []), e.todo]
    } else if (e.k === 'workflow') {
      r.workflow = e.workflow
    } else if (e.k === 'round') {
      r.status = 'open'
      delete r.endedAt
      r.rounds.push({ n: round.n + 1, startedAt: e.t, commits: [], steps: [], checks: [] })
    } else if (e.k === 'plan') {
      const into = r.rounds.find((x) => x.n === e.round)
      if (!into) continue
      if (e.state === 'submitted') into.plan = { state: 'submitted', path: e.path, readback: e.readback, ...(e.check && { check: e.check }), submittedAt: e.t, ...(into.plan?.sentBack && { sentBack: into.plan.sentBack }), ...(into.plan?.waitedMs && { waitedMs: into.plan.waitedMs }) }
      else if (e.state === 'released' && !into.plan) into.plan = { state: 'released', path: '', readback: { goal: '', assumptions: [], outOfScope: [], questions: [] }, submittedAt: e.t, decidedAt: e.t }
      else if (into.plan) {
        into.plan = { ...into.plan, state: e.state, decidedAt: e.t, waitedMs: (into.plan.waitedMs ?? 0) + Math.max(0, e.t - into.plan.submittedAt), ...(e.state === 'changes' && { sentBack: (into.plan.sentBack ?? 0) + 1 }), ...(e.note && { note: e.note }), ...(e.answers?.length && { answers: e.answers }) }
      }
    } else if (e.k === 'step') {
      r.rounds.find((x) => x.n === e.round)?.steps.push({ step: e.step, state: e.state, t: e.t, ...(e.note && { note: e.note }), ...(e.implicit && { implicit: true }), ...(e.item !== undefined && { item: e.item }) })
    } else if (e.k === 'start') {
      const into = r.rounds.find((x) => x.n === e.round)
      if (into) into.starts = { ...into.starts, [e.step]: e.t }
    } else if (e.k === 'check') {
      r.rounds.find((x) => x.n === e.round)?.checks.push({ step: e.step, t: e.t, head: e.head, attempt: e.attempt, ok: e.ok, exit: e.exit, timedOut: e.timedOut, ms: e.ms, tail: e.tail })
    } else if (e.k === 'commit') {
      const into = (e.round !== undefined && r.rounds.find((x) => x.n === e.round)) || round
      into.commits.push({ sha: e.sha, subject: e.subject, t: e.t, ...(e.flagged && { flagged: true }) })
    } else if (e.k === 'audit') {
      r.audit = e.state === 'failed' ? { head: e.head, t: e.t, state: 'failed', reason: e.reason } : { head: e.head, t: e.t, state: 'done', findings: e.findings.map((f) => ({ ...f, seen: false })), files: e.files, lines: e.lines, truncated: e.truncated, ...(e.cost !== undefined && { cost: e.cost }), ...(e.tokens !== undefined && { tokens: e.tokens }), ...(e.model && { model: e.model }) }
    } else if (e.k === 'trouble') {
      r.troubles = [...(r.troubles ?? []), { t: e.t, ...(e.step && { step: e.step }), label: e.label, command: e.command, error: e.error }]
    } else if (e.k === 'skipask') {
      r.skipAsk = { steps: e.steps, why: e.why, t: e.t }
    } else if (e.k === 'skipans') {
      delete r.skipAsk
    } else if (e.k === 'item') {
      r.items = [...(r.items ?? []), { title: e.title, t: e.t }]
    } else if (e.k === 'scope') {
      r.additions = [...(r.additions ?? []), { text: e.text, t: e.t }]
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
