import { isSkippable } from '../../shared/workflow'
import { useState } from 'react'
import type { Run, RunStep } from '../../shared/runs'
import { Markdown } from '../chat/markdown'
import { GateCard, gistOf } from './GateCard'

/** A step of a workflow that waits for the person: what it is, then approve it or send the work back with a note. */
export function StepGate({ agentName, run, step, onDecide }: { agentName: string; run: Run; step: RunStep; onDecide: (decision: 'approved' | 'changes', note?: string) => void }) {
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const sentence = `${run.workflow?.name}: ${
    step.kind === 'pr'
      ? step.start === 'run'
        ? `nothing is pushed until you press Run. Running it lets ${agentName} push this branch and open the pull request.`
        : `nothing is pushed until you approve. Approving lets ${agentName} push this branch and open the pull request.`
      : step.kind === 'audit'
        ? `approve the audit to go on; ${agentName} is not told to push before that.`
        : `this must be approved before ${agentName}'s work can land.`
  }`
  return (
    <GateCard
      foldKey={`step-${run.id}-${step.id}`}
      label={`Step from ${agentName}`}
      tag={step.kind === 'pr' && step.start === 'run' ? 'Your turn to run' : 'Your approval'}
      title={step.name}
      gist={gistOf(step.brief) || sentence}
      locked={asking}
      commentable
      buttons={(comment) =>
        !asking ? (
          <>
              <button className="primary" onClick={() => onDecide('approved', comment || undefined)}>{step.kind === 'pr' && step.start === 'run' ? 'Run' : 'Approve'}</button>
              <button onClick={() => setAsking(true)}>Send back</button>
              {step.kind === 'pr' && <button title={step.optional ? 'It is optional: the run goes on without it.' : `Required: the workflow stops here and ${agentName} is told to wait.`} onClick={() => void window.aw.workflows.declineStep(run.id, step.id, comment || undefined)}>Not now</button>}
              {(step.optional || isSkippable(step)) && (step.kind === 'work' || step.kind === 'approve' || step.kind === 'pr') && <button title="You can skip it: the run goes on without it." onClick={() => void window.aw.workflows.skipStep(run.id, step.id, comment || undefined)}>Skip</button>}
          </>
        ) : (
          <>
              <button className="primary" disabled={!note.trim()} onClick={() => onDecide('changes', note.trim())}>Send back</button>
              <button onClick={() => setAsking(false)}>Cancel</button>
          </>
        )
      }
    >
      <p className="pg-task">{run.title}</p>
      {step.brief && <div className="pg-text"><Markdown text={step.brief} agentId={run.agent} /></div>}
      <p className="pg-task">{sentence}</p>
      {asking && (
        <label className="pg-note">
          What should change?
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </label>
      )}
    </GateCard>
  )
}
