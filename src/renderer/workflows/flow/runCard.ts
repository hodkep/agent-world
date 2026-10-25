import type { RunStep } from '../../../shared/runs'
import type { StepState } from '../../../shared/steps'

/** What the person can press on a step of a run: Run, for a check or an audit that starts that way, or Approve (with Send back) for a step that asks. */
export type RunAction = { kind: 'run'; label: string; call: 'check' | 'audit' } | { kind: 'approve'; label: string; plan?: true }

export function actionOf(s: StepState, step: RunStep): RunAction | null {
  if (s.toRun) return s.kind === 'audit' ? { kind: 'run', label: 'Run audit', call: 'audit' } : { kind: 'run', label: 'Run', call: 'check' }
  if (s.state !== 'waiting') return null
  if (s.kind === 'plan') return { kind: 'approve', label: 'Approve plan', plan: true }
  if (s.kind === 'approve' || s.kind === 'work' || s.awaiting) return { kind: 'approve', label: step.kind === 'pr' && step.start === 'run' ? 'Run' : 'Approve' }
  return null
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
      return 'not asked'
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
