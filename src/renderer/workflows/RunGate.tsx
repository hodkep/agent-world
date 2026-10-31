import { isSkippable } from '../../shared/workflow'
import { useState } from 'react'
import type { Run, RunStep } from '../../shared/runs'
import { Markdown } from '../chat/markdown'

/** A check or an audit that starts when the person presses Run: in the chat of the agent it belongs to, where the press is, so no tab has to be opened for one click. */
export function RunGate({ agentName, run, step }: { agentName: string; run: Run; step: RunStep }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const audit = step.kind === 'audit'
  const agents = step.kind === 'plan' || step.kind === 'work'
  const go = () => {
    setBusy(true)
    setError('')
    const call = audit ? window.aw.finishAudit(run.agent) : agents ? window.aw.workflows.startStep(run.id, step.id) : window.aw.workflows.runCheck(run.id, step.id)
    call.then(
      () => setBusy(false),
      (e: Error) => (setBusy(false), setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    )
  }
  return (
    <section className="inline-need dialog plan-gate" aria-label={`Run ${step.name} for ${agentName}`}>
      <header className="dialog-bar">
        <span className="pg-tag">Your turn to run</span>
        <b>{step.name}</b>
      </header>
      <div className="pg-body">
        <p className="pg-task">{run.title}</p>
        {step.brief && <div className="pg-text"><Markdown text={step.brief} agentId={run.agent} /></div>}
        <p className="pg-task">
          {audit
            ? `${run.workflow?.name}: a reviewer reads ${agentName}'s branch against the plan when you press Run audit. Nothing starts before that.`
            : agents
              ? `${run.workflow?.name}: ${agentName} is waiting. It starts this step when you press Run, and edits nothing before that.`
              : `${run.workflow?.name}: the app runs ${step.run ? `\`${step.run}\` ` : 'the check '}in ${agentName}'s worktree when you press Run. Nothing has run yet.`}
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="pg-acts">
          <button className="primary" disabled={busy} onClick={go}>{audit ? 'Run audit' : 'Run'}</button>
          <button disabled={busy} title={step.optional ? 'It is optional: the run goes on without it.' : `Required: the workflow stops here and ${agentName} is told to wait.`} onClick={() => void window.aw.workflows.declineStep(run.id, step.id).then(() => undefined, (e: Error) => setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))}>Not now</button>
          {!audit && !agents && <button disabled={busy} onClick={() => void window.aw.workflows.skipCheck(run.id, step.id)}>Skip this check</button>}
          {!audit && step.kind === 'work' && (step.optional || isSkippable(step)) && <button disabled={busy} title="You can skip it: the run goes on without it." onClick={() => void window.aw.workflows.skipStep(run.id, step.id).then(() => undefined, (e: Error) => setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))}>Skip</button>}
          {audit && (step.optional || isSkippable(step)) && <button disabled={busy} title="You can skip it: the run goes on without it." onClick={() => void window.aw.finishAside(run.agent)}>Skip</button>}
        </div>
      </div>
    </section>
  )
}
