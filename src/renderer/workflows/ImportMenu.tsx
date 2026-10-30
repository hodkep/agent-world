import { useEffect, useState } from 'react'
import type { WorkflowEntry } from '../../shared/workflow'

type Others = Awaited<ReturnType<typeof window.aw.workflows.others>>

/** The other workspaces with the workflows each keeps; clicking one copies it into this project, or for everything. */
export function ImportMenu({ folder, onImported, onClose }: { folder: string | null; onImported: (e: WorkflowEntry) => void; onClose: () => void }) {
  const [others, setOthers] = useState<Others | null>(null)
  const [to, setTo] = useState<'project' | 'global'>('project')
  const [error, setError] = useState('')
  useEffect(() => void window.aw.workflows.others(folder).then(setOthers, (e: Error) => setError(e.message)), [folder])
  const take = (source: string, id: string) =>
    window.aw.workflows.import(source, id, folder, to).then(onImported, (e: Error) => setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  return (
    <div className="am-pop right" role="dialog" aria-label="Import a workflow" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="am-s"><b>Import a workflow from another workspace</b></div>
      <div className="am-body">
        {error && <p className="error" role="alert">{error}</p>}
        {!others ? (
          <p className="hint imp-note">Loading…</p>
        ) : others.length === 0 ? (
          <p className="hint imp-note">There is no other workspace yet.</p>
        ) : (
          others.map((o) => (
            <div key={o.project} className="am-g">
              <div className="am-gh" title={o.project}>{o.name}<span className="am-n">{o.workflows.length === 0 ? 'none of its own' : o.workflows.length}</span></div>
              {o.workflows.map((e) => (
                <button key={e.id} className="am-it" onClick={() => void take(o.project, e.id)}>
                  <b>{e.workflow!.name}</b>
                  <small className="muted">{e.workflow!.steps.map((s) => s.name ?? s.id).join(' · ')}</small>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
      <div className="imp-ft" role="group" aria-label="Keep it in">
        <span className="muted">Keep it in</span>
        <button aria-pressed={to === 'project'} disabled={!folder} onClick={() => setTo('project')}>This project</button>
        <button aria-pressed={to === 'global'} onClick={() => setTo('global')}>Everything</button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
