import type { Run } from '../../shared/runs'
import { type StepContext, type StepStatus, stepStates } from '../../shared/steps'

const MARK: Record<StepStatus, string> = { passed: '✓', running: '…', waiting: '', pending: '', skipped: '–', failed: '✗' }
const WORD: Record<StepStatus, string> = { passed: 'done', running: 'in progress', waiting: 'waiting for you', pending: 'not yet', skipped: 'not needed', failed: 'failed' }

/** The steps of the run's workflow, drawn as a pipeline: done, in progress, waiting for the person, not yet, or not needed. */
export function RunStrip({ run, round, ctx }: { run: Run; round: number; ctx: StepContext }) {
  const states = stepStates(run, ctx, round)
  if (states.length === 0) return null
  return (
    <ol className="wf-strip" aria-label={`Steps of ${run.workflow!.name}, round ${round}`}>
      {states.map((s) => (
        <li key={s.id} className={`st k-${s.kind} is-${s.state}`} title={`${s.name}: ${WORD[s.state]}`}>
          <span className="st-mark" aria-hidden="true">{MARK[s.state]}</span>
          <span>{s.name}</span>
          {s.state === 'waiting' && <b className="st-tag">waiting</b>}
          {s.tries ? <b className="st-tag bad">{s.tries === 1 ? 'failed once' : `failed ${s.tries} times`}</b> : null}
          <span className="sr-only"> ({WORD[s.state]})</span>
        </li>
      ))}
    </ol>
  )
}
