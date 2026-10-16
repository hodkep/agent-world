import type { Run } from './runs'
import { type StepContext, stepStates } from './steps'
import type { StepKind } from './workflow'

/** One station on a run's track: a step of its workflow, and how far the run has got with it. */
export interface Station {
  id: string
  name: string
  kind: StepKind
  /** `trouble`: met, but a check was retried or the plan was sent back on the way. `skipped`: not asked, or set aside by the person. */
  state: 'done' | 'trouble' | 'failed' | 'now' | 'next' | 'skipped'
  /** How often a check failed, or the plan was sent back, on the way to this station. */
  tries?: number
}

export interface Track {
  title: string
  workflow: string
  round: number
  stations: Station[]
  /** The station the agent stands on: the first one not yet met. */
  at: number
  /** What the run waits for from the person, when it does. */
  waiting?: string
  /** What stands out when it is the agent's turn: a plan the person sent back, being revised. */
  note?: string
}

function waitingFor(kind: StepKind, state: string, runDone: boolean): string | undefined {
  if (kind === 'plan' && state === 'waiting') return 'needs your approval'
  if ((kind === 'approve' || kind === 'work') && state === 'waiting') return 'needs your approval'
  if (kind === 'check' && state === 'waiting') return 'its commands need your approval'
  if (kind === 'check' && state === 'failed') return 'out of tries: your call'
  if (kind === 'audit' && runDone) return 'ready at Finish'
  if (kind === 'merge' && state === 'waiting') return 'ready to land'
  return undefined
}

/**
 * Where a run stands on its workflow, for the track shown above the agent's chat and in its tab. Nothing for a run that landed, was stopped,
 * follows no workflow, or has every step met: there is nothing left to show.
 */
export function trackOf(run: Run, ctx: StepContext): Track | undefined {
  if (run.status === 'stopped' || run.landed || !run.workflow) return undefined
  const steps = stepStates(run, ctx)
  const at = steps.findIndex((s) => s.state !== 'passed' && s.state !== 'skipped')
  if (at < 0) return undefined
  const round = run.rounds[run.rounds.length - 1]!
  const stations = steps.map((s, i): Station => {
    const n = s.kind === 'check' ? s.tries : s.kind === 'plan' ? round.plan?.sentBack : undefined
    const base = { id: s.id, name: s.name, kind: s.kind, ...(n && { tries: n }) }
    if (s.state === 'passed') return { ...base, state: n ? 'trouble' : 'done' }
    if (s.state === 'skipped') return { ...base, state: 'skipped' }
    if (s.state === 'failed') return { ...base, state: 'failed' }
    return { ...base, state: i === at ? 'now' : 'next' }
  })
  const here = steps[at]!
  const waiting = waitingFor(here.kind, here.state, run.status === 'done')
  const note = !waiting && here.kind === 'plan' && round.plan?.state === 'changes' ? 'plan sent back: being revised' : undefined
  return { title: run.title, workflow: run.workflow.name, round: run.rounds.length, stations, at, ...(waiting && { waiting }), ...(note && { note }) }
}
