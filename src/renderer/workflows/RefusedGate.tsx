import { useState } from 'react'
import type { Run } from '../../shared/runs'

const clean = (e: Error) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/**
 * A step the person refused used to end the run. Now it asks what next, with the steps still to come in view: skip it and go on, ask for it again later (it stays
 * refused), or stop the run. It is the Skip card's family: one more question to them.
 */
export function RefusedGate({ agentName, run, ask }: { agentName: string; run: Run; ask: { id: string; name: string; rest: string[]; skippable: boolean } }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const answer = (choice: 'skip' | 'later' | 'stop') => {
    setBusy(true)
    setError('')
    window.aw.workflows.refusedAnswer(run.id, ask.id, choice).then(
      () => setBusy(false),
      (e: Error) => (setBusy(false), setError(clean(e)))
    )
  }
  return (
    <section className="inline-need dialog plan-gate" aria-label={`${ask.name} was refused for ${agentName}`}>
      <header className="dialog-bar">
        <span className="pg-tag">{ask.name} refused</span>
        <b>What happens next?</b>
      </header>
      <div className="pg-body">
        <p className="pg-task">{run.title}</p>
        <p className="pg-text">You refused <b>{ask.name}</b>. Nothing after it has started.</p>
        {ask.rest.length > 0 && (
          <div className="sg-chips" aria-label="Steps still to go">
            <span className="sg-why">Still to go:</span>
            {ask.rest.map((n) => <span key={n} className="sg-chip">{n}</span>)}
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="pg-acts">
          {ask.skippable && <button className="primary" disabled={busy} onClick={() => answer('skip')}>Skip it and continue</button>}
          <button className={ask.skippable ? '' : 'primary'} disabled={busy} onClick={() => answer('later')}>Ask again later</button>
          <button disabled={busy} onClick={() => answer('stop')}>Stop here</button>
        </div>
      </div>
    </section>
  )
}
