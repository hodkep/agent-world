import { useCallback, useEffect, useState } from 'react'
import { type Chip, type Step, type WorkflowEntry, stepChips } from '../../shared/workflow'

const KIND_LABEL: Record<Step['kind'], string> = { plan: 'plan', work: 'build', check: 'check', audit: 'audit', approve: 'your approval', merge: 'land' }
const SCOPE_LABEL = { 'built-in': 'Built in', global: 'Everything', project: 'This project' } as const
const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

/** What a step does, in the words of its file, for the detail beside the list. */
function StepRow({ step, chip }: { step: Step; chip: Chip }) {
  return (
    <li className={`wfl-step k-${step.kind}`}>
      <span className="wfl-dot" aria-hidden="true" />
      <div>
        <b>{chip.label}</b>
        {chip.stops && <span className="wf-tag flag">you approve</span>}
        {step.gate === 'pass' && <span className="wf-tag">must pass</span>}
        <span className="mono muted"> {KIND_LABEL[step.kind]}</span>
        {step.skills?.length ? <span className="mono muted"> · skill: {step.skills.join(', ')}</span> : null}
        {step.run && <span className="mono muted"> · runs: {step.run}{step.retries ? ` (up to ${step.retries} tries)` : ''}</span>}
        {step.model && <span className="mono muted"> · {step.model}</span>}
        {step.brief && <div className="muted">{step.brief}</div>}
      </div>
    </li>
  )
}

/** The workflows a project can use, with the chosen one's steps beside the list; copying, deleting and choosing the default are here. */
export function WorkflowList({ folder, switches, defaultId, onDefault }: { folder: string | null; switches: { planGate: boolean; mergeGate: boolean }; defaultId: string; onDefault: (id: string) => void }) {
  const [entries, setEntries] = useState<WorkflowEntry[] | null>(null)
  const [picked, setPicked] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(() => window.aw.workflows.definitions(folder).then((e) => (setEntries(e), setError('')), (e: Error) => setError(e.message)), [folder])
  useEffect(() => void load(), [load])
  const list = entries ?? []
  const shown = list.find((e) => `${e.scope}:${e.id}` === picked) ?? list.find((e) => e.id === defaultId) ?? list[0]
  const run = (go: () => Promise<unknown>) => go().then(() => (setAsking(false), load()), (e: Error) => setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  const wf = shown?.workflow
  const here = folder ? base(folder) : ''
  return (
    <div className="wfl" aria-label="Workflows">
      <ul className="wfl-side" role="listbox" aria-label="Workflow list">
        {list.map((e) => {
          const key = `${e.scope}:${e.id}`
          return (
            <li key={key} role="option" aria-selected={shown === e} className={shown === e ? 'on' : ''} onClick={() => (setPicked(key), setAsking(false))}>
              <b>{e.workflow?.name ?? `${e.id}.json`}</b>
              <span className="muted">
                {e.problems ? 'Has problems' : SCOPE_LABEL[e.scope]}
                {e.id === defaultId && !e.problems ? ' · default' : ''}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="wfl-detail">
        {error && <p className="error" role="alert">{error}</p>}
        {!shown ? (
          <p className="hint">Loading…</p>
        ) : shown.problems ? (
          <>
            <div className="wfl-head"><b>{shown.id}.json</b><span className="wf-tag flag">Has problems</span></div>
            <p className="muted">This file cannot be used until these are fixed:</p>
            <ul className="wfl-problems" aria-label="Problems">
              {shown.problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <span className="mono muted">{shown.file}</span>
          </>
        ) : (
          wf && (
            <>
              <div className="wfl-head">
                <b>{wf.name}</b>
                <span className="wf-tag">{SCOPE_LABEL[shown.scope]}</span>
                {shown.id === defaultId && <span className="wf-tag flag">Default{folder ? ` for ${here}` : ''}</span>}
              </div>
              {wf.when && <p className="muted">When: {wf.when}</p>}
              {shown.overrides && <p className="hint">This one is used instead of the {shown.overrides === 'built-in' ? 'built-in Standard' : 'one kept for everything'} with the same id.</p>}
              <ol className="wfl-steps" aria-label="Steps">
                {wf.steps.map((s, i) => <StepRow key={s.id} step={s} chip={stepChips(wf, switches)[i]!} />)}
              </ol>
              {shown.file && <span className="mono muted">{shown.file}</span>}
              {asking ? (
                <div className="wfl-acts" role="alertdialog" aria-label={`Delete ${wf.name}`}>
                  <span>Delete {shown.id}.json? This cannot be undone.</span>
                  <button className="primary" onClick={() => void run(() => window.aw.workflows.remove(folder, shown.id, shown.scope === 'project' ? 'project' : 'global'))}>Delete</button>
                  <button onClick={() => setAsking(false)}>Cancel</button>
                </div>
              ) : (
                <div className="wfl-acts">
                  {folder && shown.id !== defaultId && <button className="primary" onClick={() => onDefault(shown.id)}>Make default for {here}</button>}
                  <button disabled={!folder} title={folder ? '' : 'Open a project first'} onClick={() => void run(() => window.aw.workflows.duplicate(folder, shown.id, 'project'))}>Copy to {folder ? here : 'a project'}</button>
                  <button onClick={() => void run(() => window.aw.workflows.duplicate(folder, shown.id, 'global'))}>Copy for everything</button>
                  {shown.scope !== 'built-in' && <button onClick={() => setAsking(true)}>Delete</button>}
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  )
}
