import { Modal } from '../panel/Modal'

/** Every agent's workflow runs in one place: what ran, how many rounds, which gates passed, what it cost. */
export function WorkflowsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="Workflows" className="library-modal wf-window" onClose={onClose}>
      <header className="settings-head">
        <b>Workflows</b>
        <small className="lib-lead">What agents' pipelines did: runs, rounds, gates, tokens and time.</small>
        <button onClick={onClose}>Close</button>
      </header>
      <div className="wf-empty">
        <b>No runs yet</b>
        <p>A run appears here when an agent starts a task. You can switch Workflows off in Settings, under Features.</p>
      </div>
    </Modal>
  )
}
