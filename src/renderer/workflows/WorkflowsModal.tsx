import { RestartBanner } from './RestartBanner'
import type { Run } from '../../shared/runs'
import type { StepContext } from '../../shared/steps'
import type { RunSpend } from '../../shared/runStats'
import { type ReactNode, useEffect, useState } from 'react'
import type { AgentRecord } from '../../shared/types'
import { Modal } from '../panel/Modal'
import { BuilderSplit } from './BuilderSplit'
import { Insights } from './Insights'
import { RunsLedger } from './RunsLedger'
import { WorkflowList } from './WorkflowList'

/** Every agent's workflow runs in one place: the week as a bar for each run, the insights over them, and the workflows themselves. */
export function WorkflowsModal({ runs, spend, open, windingDown, folder, defaultId, onDefault, ctxFor, focusRun, chatOf, costOf, onBuilder, onClose }: { runs: Run[]; spend: Record<string, RunSpend>; open: number; windingDown: boolean; folder: string | null; defaultId: string; onDefault: (id: string) => void; ctx: StepContext; ctxFor: (r: Run) => StepContext; /** A run to show opened in the Runs tab. */ focusRun?: string; /** The ordinary chat of an agent, to show beside the builder's draft. */ chatOf: (a: AgentRecord) => ReactNode; costOf: (agentId: string) => number; /** Told when the builder was made or woken, so the office lists it. */ onBuilder: (a: AgentRecord) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'runs' | 'insights' | 'workflows'>('runs')
  const [builder, setBuilder] = useState<{ agent: AgentRecord; editing?: string; editingId?: string } | null>(null)
  const [focus, setFocus] = useState('')
  // Pointed at a run (from a task's link, or the agent's tab): the Runs tab is where it opens.
  useEffect(() => {
    if (focusRun) setTab('runs')
  }, [focusRun])
  const now = Date.now()
  return (
    <Modal label="Workflows" className="library-modal wf-window" onClose={onClose}>
      <header className="settings-head">
        <b>Workflows</b>
        <small className="lib-lead">What agents' pipelines did: runs, rounds, commits, cost and time.</small>
        <button onClick={onClose}>Close</button>
      </header>
      {windingDown && (
        <div className="wf-wind" role="status">
          <b>Winding down.</b> Workflows are off. {open} run{open === 1 ? ' is' : 's are'} still open; no new ones start, and this button goes when they finish.
        </div>
      )}
      <div className="wf-notices"><RestartBanner folder={folder} /></div>
      <div className="lib-tabs" role="tablist" aria-label="Workflows sections">
        <button role="tab" aria-selected={tab === 'runs'} className={tab === 'runs' ? 'on' : ''} onClick={() => setTab('runs')}>Runs</button>
        <button role="tab" aria-selected={tab === 'insights'} className={tab === 'insights' ? 'on' : ''} onClick={() => setTab('insights')}>Insights</button>
        <button role="tab" aria-selected={tab === 'workflows'} className={tab === 'workflows' ? 'on' : ''} onClick={() => setTab('workflows')}>Workflows</button>
      </div>
      {tab === 'workflows' && builder ? (
        <BuilderSplit
          agentId={builder.agent.id}
          folder={folder}
          editing={builder.editing}
          editingId={builder.editingId}
          chat={chatOf(builder.agent)}
          cost={costOf(builder.agent.id)}
         
          onBack={() => setBuilder(null)}
          onSaved={(e) => (setFocus(`${e.scope}:${e.id}`), setBuilder(null))}
        />
      ) : tab === 'workflows' ? (
        <WorkflowList
          folder={folder}
          runs={runs}
         
          defaultId={defaultId}
          onDefault={onDefault}
          initial={focus}
          onBuilder={async (first, editing) => {
            if (!folder) return
            const agent = await window.aw.workflows.builder(folder, first, editing?.id)
            onBuilder(agent)
            setBuilder({ agent, ...(editing && { editing: editing.name, editingId: editing.id }) })
          }}
        />
      ) : tab === 'insights' ? (
        <div className="wf-body"><Insights runs={runs} ctxFor={ctxFor} now={now} /></div>
      ) : runs.length === 0 ? (
        <div className="wf-empty">
          <b>No runs yet</b>
          <p>A run appears here when an agent starts a task, or commits work it never announced. You can switch Workflows off in Settings, under Features.</p>
        </div>
      ) : (
        <div className="wf-body"><RunsLedger runs={runs} spend={spend} ctxFor={ctxFor} now={now} initial={focusRun} /></div>
      )}
    </Modal>
  )
}
