import { useState } from 'react'
import type { Run, RunStep } from '../../shared/runs'
import { Markdown } from '../chat/markdown'

/** A step of a workflow that waits for the person: what it is, then approve it or send the work back with a note. */
export function StepGate({ agentName, run, step, onDecide }: { agentName: string; run: Run; step: RunStep; onDecide: (decision: 'approved' | 'changes', note?: string) => void }) {
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  return (
    <section className="inline-need dialog plan-gate" aria-label={`Step from ${agentName}`}>
      <header className="dialog-bar">
        <span className="pg-tag">{step.kind === 'pr' && step.start === 'run' ? 'Your turn to run' : 'Your approval'}</span>
        <b>{step.name}</b>
      </header>
      <div className="pg-body">
        <p className="pg-task">{run.title}</p>
        {step.brief && <div className="pg-text"><Markdown text={step.brief} agentId={run.agent} /></div>}
        <p className="pg-task">
          {run.workflow?.name}:{' '}
          {step.kind === 'pr' ? (step.start === 'run' ? `nothing is pushed until you press Run. Running it lets ${agentName} push this branch and open the pull request.` : `nothing is pushed until you approve. Approving lets ${agentName} push this branch and open the pull request.`)
          : step.kind === 'audit' ? `approve the audit to go on; ${agentName} is not told to push before that.`
          : `this must be approved before ${agentName}'s work can land.`}
        </p>
        {asking && (
          <label className="pg-note">
            What should change?
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </label>
        )}
        <div className="pg-acts">
          {!asking ? (
            <>
              <button className="primary" onClick={() => onDecide('approved')}>{step.kind === 'pr' && step.start === 'run' ? 'Run' : 'Approve'}</button>
              <button onClick={() => setAsking(true)}>Send back</button>
              {step.optional && (step.kind === 'work' || step.kind === 'approve') && <button title="It is optional: the run goes on without it." onClick={() => void window.aw.workflows.skipStep(run.id, step.id)}>Skip</button>}
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
