import type { RunStep } from '../../../shared/runs'
import type { StepState } from '../../../shared/steps'
import { isSkippable } from '../../../shared/workflow'

/** What the person can press on a step of a run: Run, for a check or an audit that starts that way, or Approve (with Send back) for a step that asks. */
export type RunAction = { kind: 'run'; label: string; call: 'check' | 'audit' | 'start' | 'push' | 'again' } | { kind: 'approve'; label: string; plan?: true }

export function actionOf(s: StepState, step: RunStep): RunAction | null {
  if (s.toRun) return s.kind === 'audit' ? { kind: 'run', label: 'Run audit', call: 'audit' } : s.kind === 'check' ? { kind: 'run', label: 'Run', call: 'check' } : { kind: 'run', label: 'Run', call: 'start' }
  // A step the person refused is not final: it can be asked again.
  if (s.state === 'failed' && s.kind !== 'check' && s.kind !== 'audit') return { kind: 'run', label: 'Ask again', call: 'again' }
  if (s.state !== 'waiting') return null
  // The person approved the push and the agent has not pushed: if the go-ahead was lost, this tells the agent again.
  if (s.approved && !s.awaiting) return { kind: 'run', label: 'Tell the agent to push', call: 'push' }
  if (s.kind === 'plan') return { kind: 'approve', label: 'Approve plan', plan: true }
  if (s.kind === 'approve' || s.kind === 'work' || s.awaiting) return { kind: 'approve', label: step.kind === 'pr' && step.start === 'run' ? 'Run' : 'Approve' }
  return null
}

/** How the person skips a step of a run, when it is optional or skippable and not over: a build or an approval by a call of its own, a check and an audit the way they always were. */
export function skipOf(s: StepState, step: RunStep): 'step' | 'check' | 'audit' | undefined {
  if (!(step.optional || isSkippable(step)) || (s.state !== 'running' && s.state !== 'waiting')) return undefined
  return s.kind === 'check' ? 'check' : s.kind === 'audit' ? 'audit' : s.kind === 'work' || s.kind === 'approve' || s.kind === 'pr' ? 'step' : undefined
}

const PLURAL = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** What a step of a run is doing, in a few words for its card. */
export function wordOf(s: StepState): string {
  switch (s.state) {
    case 'passed':
      return s.tries ? `done after ${PLURAL(s.tries, 'failure')}` : 'done'
    case 'running':
      return 'working'
    case 'pending':
      return 'later'
    case 'skipped':
      return 'skipped'
    case 'failed':
      return 'failed'
    case 'waiting':
      if (s.toRun) return 'press Run'
      if (s.kind === 'plan' || s.kind === 'approve' || s.kind === 'work' || s.awaiting) return 'needs you'
      if (s.kind === 'check') return 'its commands need your approval'
      if (s.kind === 'audit') return 'findings to look at'
      return s.kind === 'merge' ? 'ready to land' : 'ready to push'
  }
}
