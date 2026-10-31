import { type ReactNode, useCallback, useEffect, useState } from 'react'
import type { ProposalView } from '../../shared/builder'
import { formatCost } from '../../shared/runStats'
import type { WorkflowEntry } from '../../shared/workflow'
import { FlowCanvas } from './flow/FlowCanvas'
import { History } from './History'
import { builderHeading, savedEntry } from './listButtons'
import { Proposal } from './Proposal'

const SCOPE_LABEL = { 'built-in': 'Built in', global: 'Everything', project: 'This project' } as const

/** The builder's conversation on the left and its draft on the right. The chat is the ordinary chat of its agent, passed in. */
export function BuilderSplit({ agentId, folder, editing, editingId, chat, cost, onBack, onSaved }: { agentId: string; folder: string | null; editing?: string; /** The id of the saved workflow being edited. */ editingId?: string; chat: ReactNode; cost: number; onBack: () => void; onSaved: (e: WorkflowEntry) => void }) {
  const [view, setView] = useState<ProposalView | null | undefined>(undefined)
  const load = useCallback(() => void window.aw.workflows.proposal(agentId, folder).then(setView, () => setView(null)), [agentId, folder])
  useEffect(() => {
    load()
    return window.aw.onWorkflows(load)
  }, [load])
  const { title, status } = builderHeading({ ...(editing && { editing }), view: view && { saved: view.saved, same: view.diff.same, edited: !!view.edited } })
  // The workflow being edited, as it is saved: its scope for the title, and its flow for the right side until the builder proposes a change.
  const [saved, setSaved] = useState<WorkflowEntry | undefined>()
  useEffect(() => {
    if (!editingId) return setSaved(undefined)
    void window.aw.workflows.definitions(folder).then((l) => setSaved(savedEntry(l, editingId)), () => setSaved(undefined))
  }, [editingId, folder])
  return (
    <div className="bs-wrap">
      <div className="bs-bar">
        <button onClick={onBack}>← All workflows</button>
        <b>{title}</b>
        {editing && saved && <span className="wf-tag">{SCOPE_LABEL[saved.scope]}</span>}
        <span className="muted">{status}</span>
        <span className="mono muted bs-cost" title="What this conversation has cost so far">{formatCost(cost)} this chat</span>
      </div>
      <div className="bs">
        <div className="bs-chat">{chat}</div>
        <div className="bs-side">
          {view ? (
            <Proposal key={view.workflow.id} agentId={agentId} folder={folder} view={view} onSaved={onSaved} onGone={load} onChanged={load} />
          ) : saved?.workflow ? (
            <div className="bs-saved">
              <p className="muted">{saved.workflow.name} as it is saved. The builder's changes will appear here as a draft, and nothing is saved until you press a button.</p>
              <div className="wfl-flow"><FlowCanvas fill steps={saved.workflow.steps} selected={null} skillStates={saved.skills} onSelect={() => {}} /></div>
            </div>
          ) : (
            <div className="bs-empty">
              <b>Nothing proposed yet</b>
              <span>The builder asks a question or two, then puts its draft here. It cannot save anything: you do, with a button.</span>
            </div>
          )}
          {/* With a draft, the history is in its review drawer. */}
          {!view && editingId && <History folder={folder} id={editingId} />}
        </div>
      </div>
    </div>
  )
}
