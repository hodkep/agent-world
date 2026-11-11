import { type HeaderIconName, OutlineIcon } from '../panel/IconButton'
import type { WorkflowMessage } from '../../shared/workflowMessage'

const ICON: Record<WorkflowMessage['icon'], HeaderIconName> = { tick: 'tick', run: 'run', skip: 'forward', cross: 'cross', push: 'arrow', back: 'back' }

/**
 * What the person pressed on a workflow card, on their side of the chat: one line with a tile for how it went, the step, and the time. The sentence the app typed to the
 * agent for them is folded under it, so nothing is hidden, and there is no Copy or Rewind: they did not write it.
 */
/** `local` is a receipt the app shows for the person without typing anything to the agent: the workflow was over, and a note would only wake it. */
export function WorkflowReceipt({ msg, rowId, at, pending, local }: { msg: WorkflowMessage; rowId: string; at?: number; pending?: boolean; local?: boolean }) {
  const time = at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  // A step marked done by hand is two rows in one receipt: what was marked, and what comes next.
  const two = msg.next !== undefined
  return (
    <div className={`msg user wf-rcpt ${pending ? 'pending' : ''}`} data-row={rowId}>
      <details className="wf-rcpt-d">
        <summary className={two ? 'wf-two' : undefined} aria-label={`${msg.title}${msg.sub ? `: ${msg.sub}` : ''}${two ? `. Next: ${msg.next}` : ''}. ${local ? 'The agent was not told' : 'What the agent was told'}`}>
          <span className="wf-row">
            <i className={`wf-tile ${msg.tone}`} aria-hidden="true"><OutlineIcon name={ICON[msg.icon]} size={12} /></i>
            <span className="wf-rcpt-t"><b>{msg.title}</b>{msg.sub && <span className="wf-rcpt-s"> · {msg.sub}</span>}{time && <span className="wf-rcpt-s"> · {time}</span>}</span>
          </span>
          {two && (
            <span className="wf-row wf-next">
              <i className="wf-tile go" aria-hidden="true"><OutlineIcon name="run" size={12} /></i>
              <span className="wf-rcpt-t"><b>{msg.next}</b><span className="wf-rcpt-s"> · {msg.nextWaits ? 'starts when you press Run' : 'starts now'}</span></span>
            </span>
          )}
        </summary>
        <p className="wf-told">{local ? <><b>Not told to the agent</b>Nothing was left of the workflow, so the agent was not woken.</> : <><b>Told to the agent</b>{msg.told}</>}</p>
      </details>
    </div>
  )
}
