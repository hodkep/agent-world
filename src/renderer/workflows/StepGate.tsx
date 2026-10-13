import { useState } from 'react'
import type { Run, RunStep } from '../../shared/runs'

/** A step of a workflow that waits for the person: what it is, then approve it or send the work back with a note. */
export function StepGate({ agentName, run, step, onDecide }: { agentName: string; run: Run; step: RunStep; onDecide: (decision: 'approved' | 'changes', note?: string) => void }) {
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  return (
    <section className="inline-need dialog plan-gate" aria-label={`Step from ${agentName}`}>
      <header className="dialog-bar">
        <span className="pg-tag">Your approval</span>
        <b>{step.name}</b>
      </header>
      <div className="pg-body">
        <p className="pg-task">{run.title}</p>
        {step.brief && <p>{step.brief}</p>}
        <p className="pg-task">{run.workflow?.name}: this must be approved before {agentName}'s work can land.</p>
        {asking && (
          <label className="pg-note">
            What should change?
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </label>
        )}
        <div className="pg-acts">
          {!asking ? (
            <>
              <button className="primary" onClick={() => onDecide('approved')}>Approve</button>
              <button onClick={() => setAsking(true)}>Send back</button>
            </>
          ) : (
            <>
              <button className="primary" disabled={!note.trim()} onClick={() => onDecide('changes', note.trim())}>Send back</button>
              <button onClick={() => setAsking(false)}>Cancel</button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
