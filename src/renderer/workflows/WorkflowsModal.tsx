import { type Run, runLabel } from '../../shared/runs'
import { Modal } from '../panel/Modal'

/** Every agent's workflow runs in one place: what ran, how many rounds, which gates passed, what it cost. */
export function WorkflowsModal({ runs, open, windingDown, onClose }: { runs: Run[]; open: number; windingDown: boolean; onClose: () => void }) {
  return (
    <Modal label="Workflows" className="library-modal wf-window" onClose={onClose}>
      <header className="settings-head">
        <b>Workflows</b>
        <small className="lib-lead">What agents' pipelines did: runs, rounds, gates, tokens and time.</small>
        <button onClick={onClose}>Close</button>
      </header>
      {windingDown && (
        <div className="wf-wind" role="status">
          <b>Winding down.</b> Workflows are off. {open} run{open === 1 ? ' is' : 's are'} still open; no new ones start, and this button goes when they finish.
        </div>
      )}
      {runs.length === 0 ? (
        <div className="wf-empty">
          <b>No runs yet</b>
          <p>A run appears here when an agent starts a task. You can switch Workflows off in Settings, under Features.</p>
        </div>
      ) : (
        <ul className="wf-runs" aria-label="Runs">
          {[...runs].reverse().map((r) => (
            <li key={r.id}><span>{runLabel(r)}</span><small>{r.status}</small></li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
