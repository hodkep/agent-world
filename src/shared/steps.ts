import type { Round, Run, RunStep, RunWorkflow } from './runs'
import { type StepKind, isLanding } from './workflow'

export type StepStatus = 'passed' | 'running' | 'waiting' | 'pending' | 'skipped' | 'failed'
export interface StepState {
  id: string
  kind: StepKind
  name: string
  state: StepStatus
  /** For a check: how many times it has failed since it was last asked for again. */
  tries?: number
  /** The step waits for the person's own approval (an audit, a pull request or a merge with gate approve): the same Approve and Send back as any step they approve. */
  awaiting?: true
  /** A pull request or merge whose approval was given for the branch as it is, so the agent may go ahead. */
  approved?: true
  /** A pull request that needs the person's approval and has not got it, whether or not its turn has come: a push before then is held. */
  gated?: true
  /** A check or an audit that starts when the person presses Run, and has not been started: it waits for that press. */
  toRun?: true
}

/**
 * What a step is before the order of the others is taken into account: done, waiting for the person, not applicable, not done yet and
 * the agent's to do (`open`), or not done yet and the app's or the person's to do at Finish (`later`).
 */
type Own = 'passed' | 'waiting' | 'open' | 'later' | 'skipped' | 'failed'

export interface StepContext {
  /** Whether an audit is run at this dial and for this program. */
  auditOn: boolean
  /** The Settings switch for the plan gate; a plan step with no gate of its own follows it. On when not given. */
  planGate?: boolean
  /** Whether the commands of the run's workflow file are approved (a project's file needs it; anything else does). Approved when not given. */
  approved?: boolean
  /** The branch as it is now: a check that passed for another head is due again. */
  head?: string
  /** The Settings switch for the merge gate: a pull request or merge step with no gate of its own asks for the person's approval when it is on. Off when not given. */
  mergeGate?: boolean
}

/** Whether a step waits for the person's own approval: an audit or a pull request with gate approve, or a pull request with no gate while the Settings merge gate is on. */
export function needsApproval(step: { kind: StepKind; gate?: string; start?: string }, ctx: StepContext): boolean {
  if (step.kind === 'audit' || step.kind === 'check') return step.gate === 'approve'
  // A merge is the person's own click on Land: that click is the approval, so it has no second one. A pull request follows its gate, else the Settings switch.
  if (step.kind !== 'pr') return false
  // A pull request that starts on Run is the person's press: nothing is pushed before it, as with gate approve.
  return step.gate === 'approve' || step.start === 'run' || (step.gate === undefined && ctx.mergeGate === true)
}

/** Whether the person approved this step for the branch as it is now: their last answer was an approval, given after the round's last commit (and after `since`). */
function approvedFor(round: Round, id: string, since = 0): boolean {
  const last = round.steps.filter((s) => s.step === id && (s.state === 'approved' || s.state === 'changes')).at(-1)
  return last?.state === 'approved' && last.t > Math.max(since, ...round.commits.map((c) => c.t))
}

export const DEFAULT_RETRIES = 2

/** How a check stands: how many times it ran since the person last asked for it again, and what became of it. */
/** The results of a check since the person last asked for it again, with how many of them failed. */
export function checkRuns(round: Round, stepId: string): { results: Round['checks']; failed: number } {
  const reset = round.steps.filter((x) => x.step === stepId && (x.state === 'rerun' || x.state === 'changes')).at(-1)?.t ?? -1
  const results = round.checks.filter((c) => c.step === stepId && c.t > reset)
  return { results, failed: results.filter((c) => !c.ok).length }
}

function checkOwn(step: RunWorkflow['steps'][number], round: Round, ctx: StepContext): { own: Own; tries: number; toRun?: true; asks?: true } {
  const mine = round.steps.filter((x) => x.step === step.id)
  // The person asking for it again, or sending it back after it passed, gives it all its tries back.
  const reset = mine.filter((x) => x.state === 'rerun' || x.state === 'changes').at(-1)?.t ?? -1
  const decided = mine.filter((x) => x.t > reset && (x.state === 'skipped' || x.state === 'declined')).at(-1)
  if (decided) return { own: decided.state === 'skipped' ? 'skipped' : 'failed', tries: 0 }
  const { results, failed } = checkRuns(round, step.id)
  const last = results.at(-1)
  // A check that passed keeps how often it failed on the way, so the strip can still say so.
  if (last?.ok && (ctx.head === undefined || last.head === ctx.head)) {
    // A check with gate approve has passed for the agent; it passes for the run when the person has approved it (after this result).
    if (step.gate === 'approve' && !approvedFor(round, step.id, last.t)) return { own: 'waiting', tries: failed, asks: true }
    return { own: 'passed', tries: failed }
  }
  if (last && !last.ok && results.length >= (step.retries ?? DEFAULT_RETRIES) + 1) return { own: 'failed', tries: failed }
  if (!last && ctx.approved === false) return { own: 'waiting', tries: 0 }
  // It starts when the person presses Run: until they have (or have asked for it again, which runs it by itself) it waits for that press.
  if (!last && step.start === 'run' && !mine.some((x) => x.state === 'rerun' || x.state === 'changes')) return { own: 'waiting', tries: 0, toRun: true }
  return { own: 'open', tries: failed }
}

function own(step: RunWorkflow['steps'][number], round: Round, run: Run, ctx: StepContext): Own {
  const { kind, id } = step
  const mine = round.steps.filter((s) => s.step === id)
  const last = mine[mine.length - 1]
  // The person skipped an optional step: it is not followed, and the run goes on. (A check and an audit have their own way of being skipped.)
  if (step.optional && kind !== 'check' && kind !== 'audit' && last?.state === 'skipped') return 'skipped'
  if (kind === 'plan') {
    const p = round.plan?.state
    if (p === 'approved' || p === 'released') return 'passed'
    if (p === 'submitted') return 'waiting'
    if (p === 'changes') return 'open'
    // No plan: not needed when the run went on without one, in a follow-up round, or after the round ended.
    const workedAhead = run.workflow!.steps.some((s) => s.kind === 'work' && round.steps.some((l) => l.step === s.id && l.state === 'done'))
    const asked = step.gate === 'approve' ? true : step.gate === 'auto' ? false : ctx.planGate ?? true
    return !asked || round.n > 1 || round.endedAt !== undefined || workedAhead ? 'skipped' : 'open'
  }
  if (kind === 'audit') {
    if (!ctx.auditOn) return 'skipped'
    // The person set it aside: not followed, and nothing it found holds anything back.
    if (last?.state === 'skipped') return 'skipped'
    const a = run.audit
    if (!a || a.t < round.startedAt) return 'later'
    if (a.state === 'failed') return 'skipped'
    if (!a.findings.every((f) => f.seen)) return 'waiting'
    return needsApproval(step, ctx) && !approvedFor(round, id, a.t) ? 'waiting' : 'passed'
  }
  if (isLanding(kind)) return run.landed && run.landed.t >= round.startedAt ? 'passed' : 'later'
  if (kind === 'approve') {
    if (last?.state === 'approved') return 'passed'
    // Sent back: the agent's again, until it says it has done the work again.
    if (last?.state === 'changes') return round.steps.some((s) => s.state === 'done' && s.t > last.t) ? 'later' : 'open'
    return 'later'
  }
  if (step.gate === 'approve') return last?.state === 'approved' ? 'passed' : last?.state === 'done' ? 'waiting' : 'open'
  return mine.some((s) => s.state === 'done') ? 'passed' : 'open'
}

/**
 * Each step of the run's workflow as it stands in a round (the latest by default), read from what was logged. The first step still open
 * is running; a step waiting for the person holds the ones after it back. A run that follows no workflow has none.
 */
export function stepStates(run: Run, ctx: StepContext, roundN?: number): StepState[] {
  const wf = run.workflow
  const round = run.rounds.find((r) => r.n === (roundN ?? run.rounds.length))
  if (!wf || !round) return []
  let held = false
  return wf.steps.map((s) => {
    const c = s.kind === 'check' ? checkOwn(s, round, ctx) : undefined
    const o = c ? c.own : own(s, round, run, ctx)
    let state: StepStatus
    // An audit that starts on Run and has not been started waits for that press, once nothing before it holds it back.
    const auditToRun = o === 'later' && s.kind === 'audit' && s.start === 'run' && !held
    if (o === 'passed' || o === 'skipped') state = o
    else if (o === 'failed') (state = 'failed', (held = true))
    else if (o === 'later') (state = auditToRun || ((isLanding(s.kind) || s.kind === 'approve') && !held) ? 'waiting' : 'pending', (held = true))
    else if (held) state = 'pending'
    else if (o === 'waiting') (state = 'waiting', (held = true))
    else (state = 'running', (held = true))
    const audited = run.audit?.state === 'done' && run.audit.findings.every((f) => f.seen)
    const asks = c ? state === 'waiting' && !!c.asks : state === 'waiting' && needsApproval(s, ctx) && (isLanding(s.kind) || (s.kind === 'audit' && audited))
    const settled = asks && isLanding(s.kind) && approvedFor(round, s.id)
    const unapproved = isLanding(s.kind) && state !== 'passed' && needsApproval(s, ctx) && !approvedFor(round, s.id)
    return { id: s.id, kind: s.kind, name: s.name, state, ...(c?.tries && { tries: c.tries }), ...((auditToRun || (c?.toRun && state === 'waiting')) && { toRun: true as const }), ...(asks && !settled && { awaiting: true as const }), ...(settled && { approved: true as const }), ...(unapproved && { gated: true as const }) }
  })
}

/** Whether the person set the audit of this round aside (and has not asked for it again since): the step is not followed, by their choice. */
export function auditSetAside(run: Run, roundN?: number): boolean {
  // A run that follows no workflow has no audit step of its own: the gate's audit is set aside under this name.
  const step = run.workflow ? run.workflow.steps.find((s) => s.kind === 'audit')?.id : 'audit'
  const round = run.rounds.find((r) => r.n === (roundN ?? run.rounds.length))
  return !!step && !!round && round.steps.filter((s) => s.step === step).at(-1)?.state === 'skipped'
}

/** The audit is the app's to start once the agent's steps before it are passed or skipped (a check that has not passed, or a plan or approval still open, holds it back). */
export function readyForAudit(run: Run, ctx: StepContext): boolean {
  const states = stepStates(run, ctx)
  const at = states.findIndex((s) => s.kind === 'audit')
  return ctx.auditOn && at >= 0 && states.slice(0, at).every((s) => s.state === 'passed' || s.state === 'skipped')
}

/** What the person's answer to a step is typed into the agent as. */
export function stepReply(name: string, decision: 'approved' | 'changes', note?: string, kind?: StepKind): string {
  if (decision === 'approved') return `Your step "${name}" was approved.${note ? ` They said: ${note}` : ''}`
  // The steps the office does (the audit, a pull request, a merge) have no step_done: the agent changes the branch and the office asks again.
  if (kind === 'check') return `Your step "${name}" was sent back${note ? `: ${note}` : '.'} Make the change and commit it on your own branch; the check runs again and the person is asked again.`
  if (kind === 'audit' || kind === 'pr' || kind === 'merge') return `Your step "${name}" was sent back${note ? `: ${note}` : '.'} Make the change and commit it on your own branch; the audit runs again and the person is asked again. Do not push until they approve.`
  return `Your step "${name}" was sent back${note ? `: ${note}` : '.'} Make the change, then call step_done again.`
}

/** The steps of runs that wait for the person to approve them (a step they approve, an audit, a pull request or a merge with gate approve; not a plan), a stopped run's never. */
export function waitingSteps(runs: Run[], ctx: StepContext): { run: Run; step: RunStep }[] {
  return runs.flatMap((run) => {
    if (run.status === 'stopped' || !run.workflow) return []
    return stepStates(run, ctx)
      .filter((s) => s.state === 'waiting' && (s.kind === 'approve' || s.kind === 'work' || s.awaiting))
      .flatMap((s) => run.workflow!.steps.filter((x) => x.id === s.id).map((step) => ({ run, step })))
  })
}

/** What a check sends back to the agent that made it fail: the command, how it ended, what it printed last, and what to do. */
export function checkFailed(o: { name: string; run: string; try: number; of: number; result: { exit: number | null; timedOut: boolean; tail: string; ms: number } }): string {
  const how = o.result.timedOut ? 'did not finish in 5 minutes and was stopped' : `exited with ${o.result.exit}`
  const printed = o.result.tail ? ` What it printed last:\n${o.result.tail}` : ' It printed nothing.'
  return `The check "${o.name}" failed (try ${o.try} of ${o.of}): \`${o.run}\` ${how}.${printed}\nFix it, commit, then call step_done again. This is still the same task, so do not call task_begin again.`
}

/** What the agent is told when the person approved a check's commands and it passed: it was told their answer would come, and this is it. */
export const checkPassed = (o: { name: string; run: string; ms: number }) =>
  `The person approved the commands and the check "${o.name}" passed (\`${o.run}\`, ${o.ms < 1000 ? `${o.ms} ms` : `${(o.ms / 1000).toFixed(1)} s`}). Nothing more is needed from you for it.`

/** What the agent is told when a check will not be sent back again. */
export const checkGaveUp = (o: { name: string; tries: number }) => `The check "${o.name}" still fails after ${o.tries} tries. The person has been asked what to do; change nothing more until they answer.`

export interface CheckPanel {
  kind: 'approval' | 'declined' | 'failed'
  run: Run
  step: RunStep
  /** For a check that ran out of tries: how often it failed, and the end of what it printed last. */
  tries: number
  tail?: string
}

/** The checks that wait for the person: their commands to approve, commands they declined, or a check that failed every try. A stopped run's never. */
export function checkPanels(runs: Run[], ctxFor: (run: Run) => StepContext): CheckPanel[] {
  return runs.flatMap((run) => {
    if (run.status === 'stopped' || !run.workflow) return []
    const round = run.rounds[run.rounds.length - 1]!
    return stepStates(run, ctxFor(run)).flatMap((s): CheckPanel[] => {
      const step = run.workflow!.steps.find((x) => x.id === s.id)
      if (s.kind !== 'check' || !step) return []
      if (s.state === 'waiting') return s.toRun || s.awaiting ? [] : [{ kind: 'approval', run, step, tries: 0 }]
      if (s.state !== 'failed') return []
      if (!s.tries) return [{ kind: 'declined', run, step, tries: 0 }]
      const last = checkRuns(round, s.id).results.at(-1)
      return [{ kind: 'failed', run, step, tries: s.tries, ...(last?.tail && { tail: last.tail }) }]
    })
  })
}

/** The steps of runs that wait for the person to press Run (a check or an audit that starts that way, and has not been started), a stopped run's never. */
export function toRunSteps(runs: Run[], ctxFor: (run: Run) => StepContext): { run: Run; step: RunStep }[] {
  return runs.flatMap((run) => {
    if (run.status === 'stopped' || !run.workflow) return []
    return stepStates(run, ctxFor(run))
      .filter((s) => s.toRun)
      .flatMap((s) => run.workflow!.steps.filter((x) => x.id === s.id).map((step) => ({ run, step })))
  })
}

/** What the agent is told when the person skips an optional step of its workflow. */
export const stepSkipped = (name: string) => `Your step "${name}" was skipped by the person: it is optional. Go on with the next step.`

