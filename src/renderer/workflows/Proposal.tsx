import { useState } from 'react'
import type { ProposalView, SaveHow } from '../../shared/builder'
import type { Step, WorkflowEntry } from '../../shared/workflow'
import { previewOf, stopsLine } from '../../shared/workflowPreview'
import { StepEditor } from './StepEditor'
import { SkillChips } from './WorkflowList'

const SCOPE_WORDS = { 'built-in': 'the built-in one', global: 'the one kept for everything', project: 'the one in this project' } as const
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
export function Proposal({ agentId, folder, view, switches, onSaved, onGone, onChanged }: { agentId: string; folder: string | null; view: ProposalView; switches: { planGate: boolean; mergeGate: boolean }; onSaved: (e: WorkflowEntry) => void; onGone: () => void; /** The draft was edited: read it again. */ onChanged: () => void }) {
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
  const rows = previewOf(wf, switches)
  const grantingSteps = wf.steps.filter((s) => s.skills?.some((id) => granted.includes(id))).map((s) => s.name ?? s.id)
  return (
    <section className="bs-draft" aria-label="Workflow proposal">
      <div className="wfl-head">
        <b>{wf.name}</b>
        <span className="wf-tag">Proposal</span>
        <span className="muted">{!view.saved ? 'new · not saved' : replaces ? `replaces ${SCOPE_WORDS[view.saved.scope]}` : 'replaces the built-in Standard'}</span>
      </div>
      {wf.when && <p className="muted">When: {wf.when}</p>}
      {view.stale && (
        <p className="bs-note warn" role="alert">
          The saved workflow changed after this was proposed. Ask the builder to look at it again; saving is off until it does.
        </p>
      )}
      <StepEditor agentId={agentId} folder={folder} workflow={wf} skillStates={view.skills} switches={switches} at={view.at} edited={view.edited} onProblem={setProblem} onChanged={onChanged} />
      <details className="bs-preview" open aria-label="Preview of the workflow">
        <summary>
          <b>Preview</b>
          <span className="muted"> · {stopsLine(rows)}</span>
        </summary>
        <ol>
          {rows.map((r) => (
            <li key={r.id} className={r.stops ? 'stops' : undefined}>
              <span className="bp-k">{r.label}</span>
              <span className="bp-w">{r.says}</span>
            </li>
          ))}
        </ol>
      </details>
      {d.same ? (
        <p className="muted">Nothing differs from the saved one.</p>
      ) : d.isNew || !view.saved ? null : (
        <>
          <span className="bs-sub">What changes</span>
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
      {error && <p className="error" role="alert">{error}</p>}
      <div className="wfl-acts">
        {replaces ? (
          <>
            <button className="primary" disabled={busy || view.stale || problem} onClick={() => go('replace')}>
              Replace {wf.name} {view.saved!.scope === 'global' ? 'for everything' : `in ${here || 'the project'}`}
            </button>
            <button disabled={busy || view.stale || problem} onClick={() => go('copy')}>Save as a new workflow</button>
          </>
        ) : (
          <>
            <button className="primary" disabled={busy || view.stale || problem || !folder} title={folder ? '' : 'Open a project first'} onClick={() => go('project')}>
              Save to {here || 'a project'}
            </button>
            <button disabled={busy || view.stale || problem} onClick={() => go('global')}>Save for everything</button>
          </>
        )}
        <button disabled={busy} onClick={discard}>Discard</button>
      </div>
    </section>
  )
}
