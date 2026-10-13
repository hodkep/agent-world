import { useEffect, useState } from 'react'
import type { CheckPanel } from '../../shared/steps'

type Approval = Awaited<ReturnType<typeof window.aw.workflows.checkApproval>>

const short = (hash: string) => hash.slice(0, 8)

/**
 * A check that needs the person: the commands of a project's workflow file to approve (with what changed since the version they approved
 * before), commands they declined, or a check that failed every try.
 */
export function CheckGate({ agentName, panel }: { agentName: string; panel: CheckPanel }) {
  const { run, step } = panel
  const [info, setInfo] = useState<Approval | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (panel.kind === 'failed') return
    void window.aw.workflows.checkApproval(run.id).then(setInfo, (e: Error) => setError(e.message))
  }, [panel.kind, run.id])
  const go = (f: () => Promise<void>) => void f().catch((e: Error) => setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  if (panel.kind === 'failed') {
    return (
      <section className="inline-need dialog plan-gate" aria-label={`Check from ${agentName}`}>
        <header className="dialog-bar">
          <span className="pg-tag bad">Check failed</span>
          <b>{step.name} failed {panel.tries} time{panel.tries === 1 ? '' : 's'}</b>
        </header>
        <div className="pg-body">
          <p className="pg-task">{run.title} · <code>{step.run}</code> did not pass. {agentName} was sent the output each time.</p>
          {panel.tail && <pre className="cg-tail" aria-label="What it printed last">{panel.tail}</pre>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="pg-acts">
            <button className="primary" onClick={() => go(() => window.aw.workflows.rerunCheck(run.id, step.id))}>Run again</button>
            <button onClick={() => go(() => window.aw.workflows.skipCheck(run.id, step.id))}>Skip this check</button>
          </div>
          <small className="pg-foot">Landing waits for this check to pass or be skipped.</small>
        </div>
      </section>
    )
  }
  const n = info?.commands.length ?? 0
  const declined = panel.kind === 'declined'
  return (
    <section className="inline-need dialog plan-gate" aria-label={`Commands from ${run.workflow?.name ?? 'a workflow'}`}>
      <header className="dialog-bar">
        <span className={`pg-tag ${info?.before ? 'bad' : ''}`}>{info?.before ? 'File changed' : 'Run commands?'}</span>
        <b>{declined ? 'You did not approve these commands' : `${info?.workflow ?? run.workflow?.name} wants to run ${n || 'some'} command${n === 1 ? '' : 's'}`}</b>
      </header>
      <div className="pg-body">
        <p className="pg-task">{run.title} · step "{step.name}"</p>
        {info?.before ? (
          <pre className="cg-diff" aria-label="What changed since the version you approved">
            <span className="muted">approved {short(info.before.hash)}, now {short(info.hash)}</span>
            {info.before.diff.map((d) => (
              <span key={`${d.change}-${d.text}`} className={`cg-${d.change}`}>{d.change === 'added' ? '+ ' : d.change === 'removed' ? '- ' : '  '}{d.text}</span>
            ))}
          </pre>
        ) : (
          info?.commands.map((c) => <div key={c} className="pg-row"><span className="pg-k scope">Command</span><code>{c}</code></div>)
        )}
        {info?.before && info.before.diff.some((d) => d.change === 'added') && <p className="pg-task warn">The added commands are new. Read them (and what they run) before you approve.</p>}
        <p className="pg-task">
          They come from <code>{info?.file ? info.file : 'the project\'s workflow file'}</code> and run on your computer, in {agentName}'s worktree, with a 5 minute limit. Approving covers this exact version of the file ({info ? short(info.hash) : '…'}); any edit asks again.
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="pg-acts">
          <button className="primary" disabled={!info} onClick={() => go(() => window.aw.workflows.approveChecks(run.id))}>{info?.before ? 'Approve this version' : 'Approve and run'}</button>
          {declined ? <button onClick={() => go(() => window.aw.workflows.skipCheck(run.id, step.id))}>Skip this check</button> : <button onClick={() => go(() => window.aw.workflows.declineChecks(run.id))}>Don't run</button>}
        </div>
      </div>
    </section>
  )
}
