import { type Run, runLabel } from '../../shared/runs'
import { Modal } from '../panel/Modal'

/** Turning workflows off while runs are open: let them finish (nothing new starts, then it hides) or stop them now. */
export function WorkflowOffConfirm({ open, onFinish, onStop, onCancel }: { open: Run[]; onFinish: () => void; onStop: () => void; onCancel: () => void }) {
  return (
    <Modal label="Turn off workflows" role="alertdialog" className="wf-confirm" onClose={onCancel}>
      <div className="wf-confirm-body">
        <b>Turn off workflows? {open.length} run{open.length === 1 ? ' is' : 's are'} still open.</b>
        <ul>
          {open.map((r) => <li key={r.id}>{runLabel(r)}</li>)}
        </ul>
        <div className="wf-confirm-btns">
          <button className="primary" onClick={onFinish}>Let them finish, then hide</button>
          <button onClick={onStop}>Stop them now</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
        <small>Until they finish no new runs start, and the Workflows button stays, marked as winding down.</small>
      </div>
    </Modal>
  )
}
