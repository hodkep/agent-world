import type { Round, Run, RunStep, RunWorkflow } from './runs'
import type { StepKind } from './workflow'

export type StepStatus = 'passed' | 'running' | 'waiting' | 'pending' | 'skipped'
export interface StepState {
  id: string
  kind: StepKind
  name: string
  state: StepStatus
}

/**
 * What a step is before the order of the others is taken into account: done, waiting for the person, not applicable, not done yet and
 * the agent's to do (`open`), or not done yet and the app's or the person's to do at Finish (`later`).
 */
type Own = 'passed' | 'waiting' | 'open' | 'later' | 'skipped'

export interface StepContext {
  /** Whether an audit is run at this dial and for this program. */
  auditOn: boolean
  /** The Settings switch for the plan gate; a plan step with no gate of its own follows it. On when not given. */
  planGate?: boolean
}

function own(step: RunWorkflow['steps'][number], round: Round, run: Run, ctx: StepContext): Own {
  const { kind, id } = step
  const mine = round.steps.filter((s) => s.step === id)
  const last = mine[mine.length - 1]
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
    const a = run.audit
    if (!a || a.t < round.startedAt) return 'later'
    if (a.state === 'failed') return 'skipped'
    return a.findings.every((f) => f.seen) ? 'passed' : 'waiting'
  }
  if (kind === 'merge') return run.landed && run.landed.t >= round.startedAt ? 'passed' : 'later'
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
    const o = own(s, round, run, ctx)
    let state: StepStatus
    if (o === 'passed' || o === 'skipped') state = o
    else if (o === 'later') (state = (s.kind === 'merge' || s.kind === 'approve') && !held ? 'waiting' : 'pending', (held = true))
    else if (held) state = 'pending'
    else if (o === 'waiting') (state = 'waiting', (held = true))
    else (state = 'running', (held = true))
    return { id: s.id, kind: s.kind, name: s.name, state }
  })
}

/** What the person's answer to a step is typed into the agent as. */
export function stepReply(name: string, decision: 'approved' | 'changes', note?: string): string {
  if (decision === 'approved') return `Your step "${name}" was approved.${note ? ` They said: ${note}` : ''}`
  return `Your step "${name}" was sent back${note ? `: ${note}` : '.'} Make the change, then call step_done again.`
}

/** The steps of runs that wait for the person to approve them (a step they approve, not a plan, an audit or a landing), a stopped run's never. */
export function waitingSteps(runs: Run[], ctx: StepContext): { run: Run; step: RunStep }[] {
  return runs.flatMap((run) => {
    if (run.status === 'stopped' || !run.workflow) return []
    return stepStates(run, ctx)
      .filter((s) => s.state === 'waiting' && (s.kind === 'approve' || s.kind === 'work'))
      .flatMap((s) => run.workflow!.steps.filter((x) => x.id === s.id).map((step) => ({ run, step })))
  })
}
