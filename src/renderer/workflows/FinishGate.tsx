import { useState } from 'react'
import type { Run, RunStep } from '../../shared/runs'
import { Markdown } from '../chat/markdown'
import { GateCard, gistOf } from './GateCard'

const clean = (e: Error) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/**
 * A step the person started with Run and the agent has left running, like Verify: the agent has nothing to do in it, so only the person can finish it. They say how it went:
 * it works (the step is reported done for the agent), or it needs changes (the agent is told what, and goes back to work).
 */
export function FinishGate({ agentName, run, step }: { agentName: string; run: Run; step: RunStep }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const send = (decision: 'done' | 'changes', note: string) => {
    if (decision === 'changes' && !note) return setError('Say what to change in the comment first: the agent is told it.')
    setBusy(true)
    setError('')
    window.aw.workflows.finishStep(run.id, step.id, decision, note || undefined).then(
      () => setBusy(false),
      (e: Error) => (setBusy(false), setError(clean(e)))
    )
  }
  return (
    <GateCard
      foldKey={`finish-${run.id}-${step.id}`}
      label={`Finish ${step.name} for ${agentName}`}
      tag="Your verdict"
      title={step.name}
      gist={gistOf(step.brief) || `${agentName} has nothing to do in this step: say how it went.`}
      error={error}
      commentable
      noteOpen
      buttons={(note) => (
        <>
          <button className="primary" disabled={busy} onClick={() => send('done', note)}>It works, mark done</button>
          <button disabled={busy} title={`${agentName} is told what to change and goes back to work.`} onClick={() => send('changes', note)}>Needs changes</button>
        </>
      )}
    >
      <p className="pg-task">{run.title}</p>
      {step.brief && <div className="pg-text"><Markdown text={step.brief} agentId={run.agent} /></div>}
      <p className="pg-task">{agentName} has nothing to do in this step. Try it yourself, then say how it went.</p>
    </GateCard>
  )
}
