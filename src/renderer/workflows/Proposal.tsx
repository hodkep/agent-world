import { useEffect, useRef, useState } from 'react'
import { askRows, reviewSummary } from '../../shared/reviewSummary'
import { History } from './History'
import type { ProposalView, SaveHow } from '../../shared/builder'
import type { Step, WorkflowEntry } from '../../shared/workflow'
import { previewOf, stopsLine } from '../../shared/workflowPreview'
import { StepEditor } from './StepEditor'
import { SkillChips } from './WorkflowList'

const SCOPE_WORDS = { 'built-in': 'the built-in one', global: 'the one kept for everything', project: 'the one in this project' } as const
type ReviewTab = 'changes' | 'asks' | 'notes' | 'history'
const PANEL_LABEL: Record<ReviewTab, string> = { changes: 'Changes', asks: 'What asks you', notes: 'Notes', history: 'History' }
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What a changed step says in the "what changes" list: its kind, and the command or gate that matters to the person. */
function Detail({ step }: { step: Step | undefined }) {
  if (!step) return null
  return (
    <>
      <span className="mono muted"> · {step.kind}</span>
      {step.run && <span className="mono muted"> · runs: {step.run}</span>}
      {step.gate === 'pass' && <span className="mono muted"> · must pass</span>}
    </>
  )
}

/**
 * The builder's draft, as the person reviews it: what it is, what it changes in the saved one, the commands it would run, and the
 * buttons that save it. Nothing here is saved until one of them is pressed.
 */
export function Proposal({ agentId, folder, view, onSaved, onGone, onChanged }: { agentId: string; folder: string | null; view: ProposalView; onSaved: (e: WorkflowEntry) => void; onGone: () => void; /** The draft was edited: read it again. */ onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [problem, setProblem] = useState(false)
  const wf = view.workflow
  const d = view.diff
  const here = folder ? (folder.split(/[\\/]/).filter(Boolean).pop() ?? folder) : ''
  const replaces = !!view.saved && view.saved.scope !== 'built-in'
  const step = (id: string) => wf.steps.find((s) => s.id === id)
  const go = (how: SaveHow) => {
    setBusy(true)
    setError('')
    window.aw.workflows.saveProposal(agentId, folder, how).then(
      (e) => (setBusy(false), onSaved(e)),
      (e: Error) => (setBusy(false), setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    )
  }
  const discard = () => void window.aw.workflows.discardProposal(agentId).then(onGone, () => undefined)
  const newCommands = view.commands.filter((c) => !c.known).length
  const granted = Object.keys(view.skills).filter((id) => view.skills[id] === 'granted')
  const rows = previewOf(wf)
  const sum = reviewSummary(view, rows)
  const asks = askRows(rows)
  // Review is a row of tabs under the flow: a click opens a panel over the flow, a second click shuts it. It opens by itself once, on what needs a look: changes, then notes.
  const [tab, setTab] = useState<ReviewTab | null>(sum.changes > 0 ? 'changes' : sum.notes > 0 ? 'notes' : null)
  const dock = useRef<HTMLDivElement>(null)
  // When changes or notes appear, the tab for them opens by itself (a panel the person shut stays shut until something new needs a look).
  useEffect(() => {
    if (sum.changes > 0 || sum.notes > 0) setTab((t) => t ?? (sum.changes > 0 ? 'changes' : 'notes'))
  }, [sum.changes, sum.notes])
  useEffect(() => {
    if (!tab) return
    const away = (e: MouseEvent) => {
      if (!dock.current?.contains(e.target as Node)) setTab(null)
    }
    const key = (e: KeyboardEvent) => {
      // Escape puts this away and no more: the window around it stays open.
      if (e.key === 'Escape') {
        e.stopPropagation()
        setTab(null)
      }
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [tab])
  const toggle = (t: ReviewTab) => setTab(tab === t ? null : t)
  const grantingSteps = wf.steps.filter((s) => s.skills?.some((id) => granted.includes(id))).map((s) => s.name ?? s.id)
  const saveTo = replaces ? `${wf.name} ${view.saved!.scope === 'global' ? 'for everything' : `in ${here || 'the project'}`}` : ''
  const replaceLabel = view.saved?.scope === 'global' ? 'Replace for everything' : 'Replace in project'
  const buttons = replaces ? (
    <>
      <button className="primary" disabled={busy || view.stale || problem} onClick={() => go('replace')}>{replaceLabel}</button>
      <button disabled={busy || view.stale || problem} onClick={() => go('copy')}>Save as new</button>
    </>
  ) : (
    <>
      <button className="primary" disabled={busy || view.stale || problem || !folder} title={folder ? '' : 'Open a project first'} onClick={() => go('project')}>Save to {here || 'a project'}</button>
      <button disabled={busy || view.stale || problem} onClick={() => go('global')}>Save for everything</button>
    </>
  )
  const tabs: { id: ReviewTab; label: string; count: string; hot?: boolean }[] = [
    { id: 'changes', label: 'Changes', count: String(sum.changes), hot: sum.changes > 0 },
    { id: 'asks', label: 'Asks you', count: String(asks.length) },
    { id: 'notes', label: 'Notes', count: String(sum.notes), hot: sum.notes > 0 },
    ...(view.saved ? [{ id: 'history' as const, label: 'History', count: '' }] : [])
  ]
  return (
    <section className="bs-draft fills" aria-label="Workflow proposal">
      <div className="bs-top">
        <div className="wfl-head">
          <b>{wf.name}</b>
          <span className="wf-tag draft">Draft</span>
          <span className="muted">{!view.saved ? 'new · not saved' : replaces ? `replaces ${SCOPE_WORDS[view.saved.scope]}` : 'replaces the built-in Standard'}</span>
          <span className="bs-actions">
            {buttons}
            <button disabled={busy} onClick={discard}>Discard draft</button>
          </span>
        </div>
        {wf.when && <p className="muted bs-when">When: {wf.when}</p>}
        {view.stale && (
          <p className="bs-note warn" role="alert">
            The saved workflow changed after this was proposed. Ask the builder to look at it again; saving is off until it does.
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="bs-flowarea">
        <StepEditor fill agentId={agentId} folder={folder} workflow={wf} skillStates={view.skills} at={view.at} edited={view.edited} marks={sum.marks} onProblem={setProblem} onChanged={onChanged} />
      </div>
      <div className="bs-dock" ref={dock}>
        {tab && (
          <div className="bs-panel" role="region" aria-label={PANEL_LABEL[tab]}>
            {tab === 'changes' && (
              <>
                <h5>Changes <span className="muted">{view.saved ? (d.same ? 'none' : plural(sum.changes, 'change')) : 'a new workflow'}</span></h5>
              {d.same ? (
                <p className="bs-none">Nothing differs from the saved one.</p>
              ) : d.isNew || !view.saved ? null : (
                <>
                  <ul className="bs-diff" aria-label="What changes">
                    {d.name && <li className="chg">~ Name: {d.name.from} → {d.name.to}</li>}
                    {d.when && <li className="chg">~ When it fits is reworded</li>}
                    {d.added.map((a) => <li key={a.id} className="add">+ {a.name}<Detail step={step(a.id)} />{a.after && <span className="muted"> (after {a.after})</span>}</li>)}
                    {d.changed.map((c) => <li key={c.id} className="chg">~ {c.name} · {c.fields.join(' · ')}</li>)}
                    {d.removed.map((r) => <li key={r.id} className="del">− {r.name}<span className="mono muted"> · {r.kind}</span></li>)}
                    {d.reordered && <li className="chg">~ The steps are in a different order</li>}
                    {d.unchanged.length > 0 && <li className="same muted">{plural(d.unchanged.length, 'step')} unchanged: {d.unchanged.join(', ')}</li>}
                  </ul>
                </>
              )}
              </>
            )}
            {tab === 'asks' && (
              <>
                <h5>Asks you <span className="muted">{stopsLine(rows)}</span></h5>
                <ul className="bs-asks" aria-label="Preview of the workflow">
                  {asks.length === 0 ? <li className="bs-none">Nothing waits for you.</li> : asks.map((r) => <li key={r.id}><span className="bp-k">{r.label}</span><span className="bp-w">{r.says}</span></li>)}
                </ul>
              </>
            )}
            {tab === 'notes' && (
              <>
                <h5>Notes <span className="muted">{sum.notes === 0 ? 'none' : plural(sum.notes, 'note')}</span></h5>
              {granted.length > 0 && (
                <div className="bs-note" aria-label="Skills not in the playbook">
                  {!d.isNew && view.saved && !d.same && <SkillChips ids={granted} states={view.skills} />}
                  <span>
                    <b>{granted.length === 1 ? '1 skill is not enabled for this project.' : `${granted.length} skills are not enabled for this project.`}</b> {grantingSteps.length === 1 ? `The ${grantingSteps[0]} step lets` : 'The steps that name them let'} agents read {granted.length === 1 ? 'it' : 'them'} while the task runs. To use {granted.length === 1 ? 'it' : 'them'} in every task, add {granted.length === 1 ? 'it' : 'them'} to the project's playbook in the Library.
                  </span>
                </div>
              )}
              {view.commands.length > 0 && (
                <div className="bs-note" aria-label="Commands">
                  <span>
                    <b>{plural(view.commands.length, 'command')} would run on your computer</b>, in the agent's worktree, once this is saved{newCommands < view.commands.length ? ` (${newCommands === 0 ? 'none is new' : `${newCommands} new`})` : ''}:
                  </span>
                  <ul>
                    {view.commands.map((c) => (
                      <li key={c.text}>
                        <span className="mono">{c.text}</span>
                        {c.known && <span className="muted"> · approved before</span>}
                      </li>
                    ))}
                  </ul>
                  <span className="muted">Saving approves exactly these commands for this version of the file. Any later edit asks again.</span>
                </div>
              )}
                {sum.notes === 0 && <p className="bs-none">Nothing to look at before saving.</p>}
              </>
            )}
            {tab === 'history' && (
              <>
                <h5>History <span className="muted">saved through the builder</span></h5>
                <History folder={folder} id={wf.id} empty="Nothing saved through the builder yet." />
              </>
            )}
          </div>
        )}
        <div className="bs-strip" role="group" aria-label="Review of the workflow">
          <span className="bs-strip-lab">Review</span>
          {tabs.map((t) => (
            <button key={t.id} className={`bs-tab ${tab === t.id ? 'on' : ''}`} aria-pressed={tab === t.id} aria-expanded={tab === t.id} onClick={() => toggle(t.id)}>
              {t.label}
              {t.count !== '' && <i className={t.hot ? 'hot' : ''}>{t.count}</i>}
            </button>
          ))}
          <span className="bs-sum muted">
            {!view.saved ? 'New workflow, not saved.' : d.same ? 'Nothing differs from the saved one.' : <><b>{plural(sum.changes, 'change')}</b> to save{replaces ? ` over ${wf.name}` : ''}.</>}
          </span>
        </div>
      </div>
    </section>
  )
}
