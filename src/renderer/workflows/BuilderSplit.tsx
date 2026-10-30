import { type ReactNode, useCallback, useEffect, useState } from 'react'
import type { ProposalView } from '../../shared/builder'
import { formatCost } from '../../shared/runStats'
import type { WorkflowEntry } from '../../shared/workflow'
import { History } from './History'
import { Proposal } from './Proposal'

/** The builder's conversation on the left and its draft on the right. The chat is the ordinary chat of its agent, passed in. */
export function BuilderSplit({ agentId, folder, editing, editingId, chat, cost, onBack, onSaved }: { agentId: string; folder: string | null; editing?: string; /** The id of the saved workflow being edited. */ editingId?: string; chat: ReactNode; cost: number; onBack: () => void; onSaved: (e: WorkflowEntry) => void }) {
  const [view, setView] = useState<ProposalView | null | undefined>(undefined)
  const load = useCallback(() => void window.aw.workflows.proposal(agentId, folder).then(setView, () => setView(null)), [agentId, folder])
  useEffect(() => {
    load()
    return window.aw.onWorkflows(load)
  }, [load])
  const status = editing && (!view || (view.diff.same && !view.edited)) ? `editing ${editing}` : view ? (view.saved ? 'proposed a change' : 'proposed a new workflow') : 'no draft yet'
  return (
    <div className="bs-wrap">
      <div className="bs-bar">
        <button onClick={onBack}>← All workflows</button>
        <b>Builder</b>
        <span className="muted">{status}</span>
        <span className="mono muted bs-cost" title="What this conversation has cost so far">{formatCost(cost)} this chat</span>
      </div>
      <div className="bs">
        <div className="bs-chat">{chat}</div>
        <div className="bs-side">
          {view ? (
            <Proposal key={view.workflow.id} agentId={agentId} folder={folder} view={view} onSaved={onSaved} onGone={load} onChanged={load} />
          ) : (
            <div className="bs-empty">
              <b>Nothing proposed yet</b>
              <span>The builder asks a question or two, then puts its draft here. It cannot save anything: you do, with a button.</span>
            </div>
          )}
          {(view?.workflow.id ?? editingId) && <History folder={folder} id={(view?.workflow.id ?? editingId)!} />}
        </div>
      </div>
    </div>
  )
}
