import { useState } from 'react'
import type { Run } from '../../shared/runs'

const COUNT: Record<number, string> = { 1: 'it', 2: 'both', 3: 'all three', 4: 'all four' }
const clean = (e: Error) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/**
 * The agent's question to skip steps that are not optional (a task whose work changed nothing has nothing to commit, push or open): what it would skip and why,
 * and one answer for all of them. Nothing is skipped until the person says yes. It is the Run card's family: it is one more question to them.
 */
export function SkipGate({ agentName, run }: { agentName: string; run: Run }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ask = run.skipAsk
  if (!ask) return null
  const names = ask.steps.map((id) => run.workflow?.steps.find((s) => s.id === id)?.name ?? id)
  const all = COUNT[names.length] ?? `all ${names.length}`
  const answer = (approve: boolean) => {
    setBusy(true)
    setError('')
    window.aw.workflows.answerSkip(run.id, approve).then(
      () => setBusy(false),
      (e: Error) => (setBusy(false), setError(clean(e)))
    )
  }
  return (
    <section className="inline-need dialog plan-gate" aria-label={`Skip steps for ${agentName}`}>
      <header className="dialog-bar">
        <span className="pg-tag">{names.length === 1 ? 'Skip this step?' : 'Skip these steps?'}</span>
        <b>{names.join(', ')}</b>
      </header>
      <div className="pg-body">
        <p className="pg-task">{run.title}</p>
        <p className="pg-text">{agentName} wants to skip {names.length === 1 ? 'a step' : `${names.length} steps`} of this task.</p>
        <div className="sg-chips" aria-label="Steps to skip">
          {names.map((n) => <span key={n} className="sg-chip">{n}</span>)}
        </div>
        <p className="sg-why"><b>Why:</b> {ask.why}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="pg-acts">
          <button className="primary" disabled={busy} onClick={() => answer(true)}>Skip {all}</button>
          <button disabled={busy} onClick={() => answer(false)}>{names.length === 1 ? 'Keep it' : 'Keep them'}</button>
        </div>
      </div>
    </section>
  )
}
