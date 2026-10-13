import { type Run, pendingPlans } from '../../shared/runs'
import { type StepContext, checkPanels, waitingSteps } from '../../shared/steps'
import { type RunSpend, agentCounts, formatCost, formatDuration, howRunsBegan, runStats, runsThisWeek, spendText } from '../../shared/runStats'
import { useState } from 'react'
import { Modal } from '../panel/Modal'
import { WorkflowList } from './WorkflowList'

/** A label, a bar as long as its share of the largest count, and the count. */
function Bars({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  return (
    <div className="wf-bars">
      {rows.map((r) => (
        <div key={r.label} className="wf-bar">
          <span>{r.label}</span>
          <span className="tr"><i style={{ width: `${(100 * r.n) / max}%` }} /></span>
          <span className="n">{r.n}</span>
        </div>
      ))}
    </div>
  )
}

const timeOf = (r: Run, now: number) => (r.auto ? '—' : formatDuration(r.rounds.reduce((n, x) => n + Math.max(0, (x.endedAt ?? now) - x.startedAt), 0)))

/** Every agent's workflow runs this week in one place: what ran, how many rounds and commits, what it cost and how long it took. */
export function WorkflowsModal({ runs, spend, open, windingDown, folder, switches, defaultId, onDefault, ctx, ctxFor, onClose }: { runs: Run[]; spend: Record<string, RunSpend>; open: number; windingDown: boolean; folder: string | null; switches: { planGate: boolean; mergeGate: boolean }; defaultId: string; onDefault: (id: string) => void; ctx: StepContext; ctxFor: (r: Run) => StepContext; onClose: () => void }) {
  const [tab, setTab] = useState<'runs' | 'workflows'>('runs')
  const now = Date.now()
  const week = runsThisWeek(runs, now)
  const s = runStats(week, now)
  const usd = week.reduce((n, r) => n + (spend[r.id]?.usd ?? 0), 0)
  const began = howRunsBegan(week)
  const openNow = runs.filter((r) => r.status === 'open')
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
      <div className="lib-tabs" role="tablist" aria-label="Workflows sections">
        <button role="tab" aria-selected={tab === 'runs'} className={tab === 'runs' ? 'on' : ''} onClick={() => setTab('runs')}>Runs</button>
        <button role="tab" aria-selected={tab === 'workflows'} className={tab === 'workflows' ? 'on' : ''} onClick={() => setTab('workflows')}>Workflows</button>
      </div>
      {tab === 'workflows' ? (
        <WorkflowList folder={folder} runs={runs} switches={switches} defaultId={defaultId} onDefault={onDefault} />
      ) : runs.length === 0 ? (
        <div className="wf-empty">
          <b>No runs yet</b>
          <p>A run appears here when an agent starts a task, or commits work it never announced. You can switch Workflows off in Settings, under Features.</p>
        </div>
      ) : (
        <div className="wf-body">
          <p className="wf-sum" aria-label="This week">
            This week, across all agents: <b>{s.runs} run{s.runs === 1 ? '' : 's'}</b> in <b>{s.rounds} round{s.rounds === 1 ? '' : 's'}</b>, <b>{s.commits} commit{s.commits === 1 ? '' : 's'}</b>
            {s.flagged > 0 && <> ({s.flagged} with no open task)</>}. <b>{formatCost(usd)}</b> spent in <b>{formatDuration(s.ms)}</b>.
          </p>
          <div className="wf-trio">
            <div>
              <span className="wf-cap">Runs by agent</span>
              <Bars rows={agentCounts(week).map((a) => ({ label: a.name, n: a.n }))} />
            </div>
            <div>
              <span className="wf-cap">How runs began</span>
              <Bars rows={[{ label: 'agent said so', n: began.announced }, { label: 'app, from a commit', n: began.byApp }]} />
            </div>
            <div>
              <span className="wf-cap">Needs you / open now</span>
              {pendingPlans(runs).map(({ run, round }) => <span key={`${run.id}-${round.n}`}><span className="wf-tag flag">Plan</span> {run.name}: {run.title}, waiting for approval</span>)}
              {checkPanels(runs, ctxFor).map(({ run, step, kind }) => <span key={`${run.id}-${step.id}-c`}><span className="wf-tag flag">Check</span> {run.name}: {step.name}, {kind === 'failed' ? 'failed every try' : 'waiting for you to approve its commands'}</span>)}
              {waitingSteps(runs, ctx).map(({ run, step }) => <span key={`${run.id}-${step.id}`}><span className="wf-tag flag">Step</span> {run.name}: {step.name}, waiting for approval</span>)}
              {openNow.length === 0 ? <span className="hint">Nothing is open.</span> : openNow.map((r) => <span key={r.id}><span className="wf-tag open">Open</span> {r.name}: {r.title}</span>)}
            </div>
          </div>
          <div className="wf-table" role="table" aria-label="Runs">
            <div className="wf-row h" role="row"><span>Agent</span><span>Task</span><span>Rounds</span><span>Commits</span><span>Cost</span><span>Time</span></div>
            {[...week].reverse().map((r) => {
              const flagged = r.rounds.reduce((n, x) => n + x.commits.filter((c) => c.flagged).length, 0)
              return (
                <div key={r.id} className="wf-row" role="row">
                  <b>{r.name}</b>
                  <span>{r.title} <span className="wf-chip">{r.status}</span>{r.auto && <span className="wf-chip" title="The agent never announced this task; the app started the run from its commit.">from a commit</span>}</span>
                  <span>{r.rounds.length}</span>
                  <span>{r.rounds.reduce((n, x) => n + x.commits.length, 0)}{flagged > 0 && <span className="wf-tag flag">{flagged} no task</span>}</span>
                  <span className="mono">{spendText(spend[r.id])}</span>
                  <span className="mono">{timeOf(r, now)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}
