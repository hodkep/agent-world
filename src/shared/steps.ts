import type { Round, Run, RunStep, RunWorkflow } from './runs'
import { type StepKind, isLanding, isSkippable } from './workflow'

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
type Own = 'passed' | 'waiting' | 'open' | 'later' | 'skipped' | 'failed' | 'torun'

export interface StepContext {
  /** Whether an audit is run at this dial and for this program. */
  auditOn: boolean
  /** Whether the commands of the run's workflow file are approved (a project's file needs it; anything else does). Approved when not given. */
  approved?: boolean
  /** The branch as it is now: a check that passed for another head is due again. */
  head?: string
}

/** Whether a step waits for the person's own approval: an audit or a pull request with gate approve, or a pull request with no gate while the Settings merge gate is on. */
export function needsApproval(step: { kind: StepKind; gate?: string; start?: string }, ctx: StepContext): boolean {
  if (step.kind === 'audit' || step.kind === 'check') return step.gate === 'approve'
  // A merge is the person's own click on Land: that click is the approval, so it has no second one. A pull request follows its gate, else the Settings switch.
  if (step.kind !== 'pr') return false
  // A pull request that starts on Run is the person's press: nothing is pushed before it, as with gate approve.
  return step.gate === 'approve' || step.start === 'run'
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

/** Whether the person pressed Run on a step of this round that starts that way. */
const started = (round: Round, id: string) => round.starts?.[id] !== undefined

/** What the step is before the person's Run: the agent's steps that start on Run wait for it (as `torun`) while they would otherwise be the agent's to do. */
function own(step: RunWorkflow['steps'][number], round: Round, run: Run, ctx: StepContext): Own {
  const o = ownBase(step, round, run, ctx)
  return o === 'open' && step.start === 'run' && (step.kind === 'plan' || step.kind === 'work') && !started(round, step.id) ? 'torun' : o
}

function ownBase(step: RunWorkflow['steps'][number], round: Round, run: Run, ctx: StepContext): Own {
  const { kind, id } = step
  const mine = round.steps.filter((s) => s.step === id)
  const last = mine[mine.length - 1]
  // The person refused a step that is not optional: it failed, and nothing after it runs.
  if (last?.state === 'declined' && kind !== 'check' && kind !== 'audit') return 'failed'
  // The person skipped an optional step: it is not followed, and the run goes on. (A check and an audit have their own way of being skipped.)
  if (kind !== 'check' && kind !== 'audit' && last?.state === 'skipped') return 'skipped'
  if (kind === 'plan') {
    const p = round.plan?.state
    if (p === 'approved' || p === 'released') return 'passed'
    if (p === 'submitted') return 'waiting'
    if (p === 'changes') return 'open'
    // No plan: not needed when the run went on without one, in a follow-up round, or after the round ended.
    const workedAhead = run.workflow!.steps.some((s) => s.kind === 'work' && round.steps.some((l) => l.step === s.id && l.state === 'done'))
    const asked = step.gate !== 'auto'
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
  // Reopened after it was reported: not met until it is reported again.
  const reopened = mine.findLast((s) => s.state === 'reopen')?.t ?? -1
  return mine.some((s) => s.state === 'done' && s.t > reopened) ? 'passed' : 'open'
}

/**
 * Each step of the run's workflow as it stands in a round (the latest by default), read from what was logged. The first step still open
 * is running; a step waiting for the person holds the ones after it back. A run that follows no workflow has none.
 */
export function stepStates(run: Run, ctx: StepContext, roundN?: number): StepState[] {
  const wf = run.workflow
  const found = run.rounds.find((r) => r.n === (roundN ?? run.rounds.length))
  if (!wf || !found) return []
  // What was reported for work added to the run belongs to its lane (see lanesOf), not to the main chain.
  const round = found.steps.some((l) => l.item !== undefined) ? { ...found, steps: found.steps.filter((l) => l.item === undefined) } : found
  let held = false
  return wf.steps.map((s) => {
    const c = s.kind === 'check' ? checkOwn(s, round, ctx) : undefined
    const o = c ? c.own : own(s, round, run, ctx)
    let state: StepStatus
    // An audit that starts on Run and has not been started waits for that press, once nothing before it holds it back.
    const auditToRun = o === 'later' && s.kind === 'audit' && s.start === 'run' && !held
    if (o === 'passed' || o === 'skipped') state = o
    else if (o === 'failed') (state = 'failed', (held = true))
    else if (o === 'torun') (state = held ? 'pending' : 'waiting', (held = true))
    else if (o === 'later') (state = auditToRun || ((isLanding(s.kind) || s.kind === 'approve') && !held) ? 'waiting' : 'pending', (held = true))
    else if (held) state = 'pending'
    else if (o === 'waiting') (state = 'waiting', (held = true))
    else (state = 'running', (held = true))
    const audited = run.audit?.state === 'done' && run.audit.findings.every((f) => f.seen)
    const asks = c ? state === 'waiting' && !!c.asks : state === 'waiting' && needsApproval(s, ctx) && (isLanding(s.kind) || (s.kind === 'audit' && audited))
    const settled = asks && isLanding(s.kind) && approvedFor(round, s.id)
    const unapproved = isLanding(s.kind) && state !== 'passed' && needsApproval(s, ctx) && !approvedFor(round, s.id)
    return { id: s.id, kind: s.kind, name: s.name, state, ...(c?.tries && { tries: c.tries }), ...((auditToRun || (c?.toRun && state === 'waiting') || (o === 'torun' && state === 'waiting')) && { toRun: true as const }), ...(asks && !settled && { awaiting: true as const }), ...(settled && { approved: true as const }), ...(unapproved && { gated: true as const }) }
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
  // A pull request or a merge sent back may mean "not needed" as well as "change this": the agent decides which, and asks to skip it when it is the first.
  if (kind === 'pr' || kind === 'merge') return `Your step "${name}" was sent back${note ? `: ${note}${/[.!?]$/.test(note) ? '' : '.'}` : '.'} If that means the step is not needed, ask the person to skip it with skip_steps. If it means a change, make it and commit it on your own branch; the audit runs again and the person is asked again. Do not push until they approve.`
  if (kind === 'audit') return `Your step "${name}" was sent back${note ? `: ${note}` : '.'} Make the change and commit it on your own branch; the audit runs again and the person is asked again. Do not push until they approve.`
  return `Your step "${name}" was sent back${note ? `: ${note}` : '.'} Make the change, then call step_done again.`
}

/** The steps of runs that wait for the person to approve them (a step they approve, an audit, a pull request or a merge with gate approve; not a plan, and not a step that only waits for their Run), a stopped run's never. */
export function waitingSteps(runs: Run[], ctx: StepContext): { run: Run; step: RunStep }[] {
  return runs.flatMap((run) => {
    if (run.status === 'stopped' || !run.workflow) return []
    return stepStates(run, ctx)
      .filter((s) => s.state === 'waiting' && !s.toRun && (s.kind === 'approve' || s.kind === 'work' || s.awaiting))
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

/** What the agent is told when the person skips an optional or skippable step of its workflow. */
export const stepSkipped = (name: string, next?: string) => `Your step "${name}" was skipped by the person. ${next ? `Go on with the next step, "${next}".` : 'Go on with the next step.'}`

/** What the agent is told when the person refuses a step that is not optional: the person is asked what happens next, so it waits. */
export const stepDeclined = (name: string) => `The person refused your step "${name}". The office is asking them what to do next: skip it and go on, ask for it again later, or stop. Wait for their answer, which comes as a message from the office; do not do the step or any step after it until then.`

/** The person chose to ask for a refused step later: the agent asks again itself when the work is ready. */
export const stepRefusedLater = (name: string) => `The person will ask for "${name}" again later. Wait for their instructions. If more work comes, you decide when to ask them again: call step_reopen("id", why) once that work is ready.`

/** The person skipped a step they had refused, and the run goes on with the steps after it. */
export const stepSkippedOnward = (name: string, next?: string) => `The person skipped your step "${name}" and wants the task to go on. ${next ? `Go on with the next step, "${next}".` : 'If nothing else is left, call task_done.'}`

/** The line that tells an agent what comes after the step it just reported, so it can decide how to go on. */
export const nextStepLine = (n?: { id: string; name: string; optional: boolean; start: boolean; brief?: string }) =>
  n ? ` Next step: "${n.name}"${n.optional ? ' (optional: do it unless it clearly does not apply; to leave it out, call step_done("${n.id}", skipped, "<why>") first, never just move on)' : ''}${n.start ? '; it starts when the person presses Run, so change nothing until you are told' : ''}.${n.brief ? ` It is for: ${n.brief}` : ''}` : ' That was the last step.'

/** What the agent is told when the person presses Run on one of its steps. */
export const stepStarted = (name: string) => `The person pressed Run: start your step "${name}" now.`


const list = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/** What the agent is told when the person approves skipping steps it asked to skip. */
export const stepsSkipped = (names: string[], why: string) => `The person approved skipping ${list(names)}${why ? `: ${why}` : ''}. They are done with. If nothing else is left, call task_done.`

/** What the agent is told when the person wants the steps it asked to skip kept. */
export const stepsKept = (names: string[]) => `The person wants ${list(names)} kept, so they stay in the workflow. Go on as the workflow says.`

/** What the agent is told when the person asks for a step they refused once more. */
export const stepAskedAgain = (name: string) => `The person asks for your step "${name}" again: it waits for their Run, as before. Change nothing until you are told.`

/** What the agent is told when the person ends its run: it stops work on it, and nothing more is asked of it. */
export const runEnded = (title: string) => `The person ended your task "${title}": what was left is set aside. Stop work on it; nothing more is asked of you for it.`

/** One piece of work added to a run, as its own branch: its steps and how they stand, and where it leaves the main chain and rejoins it. */
export interface Lane {
  /** Its number: the run's own task is 1, so the first added is 2. */
  item: number
  title: string
  /** When it was added. */
  at: number
  /** The main step the run had reached when it was added; none when it was added before any step was reported. */
  fork?: string
  /** The first step after the lane, which is shared by all the work. */
  join?: string
  steps: StepState[]
}

/** The steps an added piece of work has of its own: those before the first step that asks the person (the plan counts, though it asks), so the review, the commit and the push stay shared. */
export function laneStepIds(wf: RunWorkflow): string[] {
  const at = wf.steps.findIndex((s) => s.kind !== 'plan' && (s.start === 'run' || s.gate === 'approve' || s.kind === 'approve' || isLanding(s.kind)))
  return (at < 0 ? wf.steps : wf.steps.slice(0, at)).map((s) => s.id)
}

/** The work added to a run in its latest round, each as a lane: the steps before the first one that asks, with the states of what was reported for it. */
export function lanesOf(run: Run, ctx: StepContext): Lane[] {
  const wf = run.workflow
  const round = run.rounds[run.rounds.length - 1]
  if (!wf || !round || !run.items?.length) return []
  const ids = laneStepIds(wf)
  if (ids.length === 0) return []
  const laneSteps = wf.steps.filter((s) => ids.includes(s.id))
  const join = wf.steps.find((s) => !ids.includes(s.id))?.id
  return run.items.map((it, i) => {
    const n = i + 2
    // The plan resubmitted for the added work is the first one submitted after it was added.
    const plan = round.plan && round.plan.submittedAt >= it.t ? round.plan : undefined
    const mine = { ...round, plan, starts: undefined, steps: round.steps.filter((l) => l.item === n).map(({ item: _item, ...l }) => l) } as Round
    const virtual: Run = { ...run, workflow: { ...wf, steps: laneSteps }, rounds: run.rounds.map((r) => (r.n === round.n ? mine : r)) }
    const reached = wf.steps.filter((s) => round.steps.some((l) => l.item === undefined && l.step === s.id && l.t <= it.t)).at(-1)
    return { item: n, title: it.title, at: it.t, ...(reached && { fork: reached.id }), ...(join && { join }), steps: stepStates(virtual, ctx) }
  })
}

/** The step the person refused and has not yet said what to do about, with the names of the steps still to come after it: what the card that asks "what next?" shows. */
export function refusedAsk(run: Run, ctx: StepContext): { id: string; name: string; rest: string[]; skippable: boolean } | undefined {
  if (run.status === 'stopped' || !run.workflow) return undefined
  const states = stepStates(run, ctx)
  const at = states.findIndex((s) => s.state === 'failed' && s.kind !== 'check' && s.kind !== 'audit')
  const found = states[at]
  if (!found) return undefined
  const last = run.rounds.at(-1)?.steps.filter((l) => l.step === found.id && l.item === undefined).at(-1)
  // "Ask again later" is a refusal with a note of its own: the question is answered, and the step stays refused.
  if (last?.note === LATER) return undefined
  const def = run.workflow?.steps.find((d) => d.id === found.id)
  return { id: found.id, name: found.name, skippable: !!def && isSkippable(def), rest: states.slice(at + 1).filter((s) => s.state !== 'passed' && s.state !== 'skipped').map((s) => s.name) }
}

/** The note on the refusal that says the person will ask again later. */
export const LATER = 'later'

/** Whether a run has recorded no work: no step reported done or approved, no commit, no added item. A run like that only asked to skip, so it never needed a workflow. */
export const noWorkRecorded = (run: Run): boolean =>
  (run.items?.length ?? 0) === 0 && run.rounds.every((r) => r.commits.length === 0 && r.steps.every((l) => l.state !== 'done' && l.state !== 'approved'))

/** Whether the agent's question to skip covers every step of the workflow that is neither the plan nor optional: then the run needs no workflow, and the card says so. */
export const skipsEverything = (run: Run): boolean => {
  const ask = run.skipAsk
  // An optional step (the designs) is skipped by the agent itself, so the question does not name it.
  const rest = run.workflow?.steps.filter((s) => s.kind !== 'plan' && !s.optional) ?? []
  return !!ask && rest.length > 0 && noWorkRecorded(run) && rest.every((s) => ask.steps.includes(s.id))
}

/** What the agent is told when the person drops its run because no workflow was needed. */
export const runDropped = (title: string) => `The person dropped your task "${title}": no workflow was needed for it. Answer them in plain words; do not call task_done or step_done for it.`
