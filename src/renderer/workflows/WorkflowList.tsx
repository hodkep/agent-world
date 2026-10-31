import { type FormEvent, useCallback, useEffect, useState } from 'react'
import type { Run } from '../../shared/runs'
import { workflowRuns } from '../../shared/runStats'
import { type SkillState, goneSkills } from '../../shared/skills'
import type { WorkflowEntry } from '../../shared/workflow'
import { FlowCanvas } from './flow/FlowCanvas'
import { NO_WORKFLOW } from '../../shared/workflows'
import { History } from './History'
import { ImportMenu } from './ImportMenu'
import { listButtons } from './listButtons'

const SCOPE_LABEL = { 'built-in': 'Built in', global: 'Everything', project: 'This project' } as const
const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

export const SKILL_WORDS: Record<SkillState, string> = { ready: '', granted: "this step grants it: not in the project's playbook", gone: 'not in the library' }

/** What a work step's skills are here: ready, granted by the step, or not in the library. */
export function SkillChips({ ids, states }: { ids: string[]; states?: Record<string, SkillState> }) {
  return (
    <div className="sk-row" aria-label="Skills">
      {ids.map((id) => {
        const state = states?.[id] ?? 'ready'
        return (
          <span key={id} className={`sk ${state}`}>
            {id}
            {SKILL_WORDS[state] && <small> {SKILL_WORDS[state]}</small>}
          </span>
        )
      })}
    </div>
  )
}

/** The workflows a project can use, with the chosen one's steps beside the list; copying, deleting and choosing the default are here. */
export function WorkflowList({ folder, runs, defaultId, onDefault, initial = '', onBuilder }: { folder: string | null; runs: Run[]; defaultId: string; onDefault: (id: string) => void; /** The entry to show first, as `scope:id`. */ initial?: string; /** Opens the builder; what the person typed (or asked for) is sent to it, and `editing` says which workflow is being changed. */ onBuilder: (first: string | undefined, editing?: { id: string; name: string }) => Promise<void> }) {
  const [entries, setEntries] = useState<WorkflowEntry[] | null>(null)
  const [picked, setPicked] = useState(initial)
  const [describe, setDescribe] = useState('')
  const [starting, setStarting] = useState(false)
  const [asking, setAsking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [importing, setImporting] = useState(false)
  // Which small menu is open (the New workflow one above the list, or the More one under the workflow), and whether the top bar is taking a description for the builder.
  const [menu, setMenu] = useState<'new' | 'more' | null>(null)
  const [describing, setDescribing] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(() => window.aw.workflows.definitions(folder).then((e) => (setEntries(e), setError('')), (e: Error) => setError(e.message)), [folder])
  useEffect(() => void load(), [load])
  useEffect(() => {
    if (!menu) return
    const away = (e: MouseEvent) => !(e.target as HTMLElement).closest('.wfl-menu-wrap') && setMenu(null)
    // The window is a dialog: Escape would close all of it, so the menu takes the key.
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), setMenu(null))
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc, true)
    return () => (document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc, true))
  }, [menu])
  const list = entries ?? []
  const shown = list.find((e) => `${e.scope}:${e.id}` === picked) ?? list.find((e) => e.id === defaultId) ?? list[0]
  const run = (go: () => Promise<unknown>) => go().then(() => (setAsking(false), load()), (e: Error) => setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  const wf = shown?.workflow
  const lb = shown ? listButtons({ scope: shown.scope, isDefault: shown.id === defaultId, removedHere: defaultId === NO_WORKFLOW, hasFolder: !!folder }) : null
  const here = folder ? base(folder) : ''
  // The list is walked with the arrow keys, Home and End, and the one it rests on is the one shown.
  const walk = (e: React.KeyboardEvent) => {
    const at = shown ? list.indexOf(shown) : 0
    const to = e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowUp' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : null
    if (to === null || list.length === 0) return
    e.preventDefault()
    const next = list[Math.max(0, Math.min(list.length - 1, to))]!
    setPicked(`${next.scope}:${next.id}`)
    setAsking(false)
    document.getElementById(`wfl-${next.scope}-${next.id}`)?.scrollIntoView({ block: 'nearest' })
  }
  const start = (first: string | undefined, editing?: { id: string; name: string }) => {
    setStarting(true)
    setError('')
    onBuilder(first, editing).then(
      () => setStarting(false),
      (e: Error) => (setStarting(false), setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    )
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (describe.trim()) start(describe.trim())
  }
  return (
    <>
    <div className="wfl-describe">
      {describing ? (
        <form className="wfl-desc-form" onSubmit={submit}>
          <input autoFocus value={describe} onChange={(e) => setDescribe(e.target.value)} disabled={!folder || starting} placeholder="Describe a workflow to the builder, e.g. every change to billing needs a security review and a second approval" aria-label="Describe a workflow" onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), setDescribing(false))} />
          <button className="primary" type="submit" disabled={!folder || starting || !describe.trim()}>{starting ? 'Starting…' : 'Start'}</button>
          <button type="button" disabled={starting} onClick={() => (setDescribing(false), setDescribe(''))}>Cancel</button>
        </form>
      ) : (
        <span className="wfl-menu-wrap">
          <button className="primary" type="button" disabled={!folder || starting} title={folder ? '' : 'Open a project to build a workflow'} aria-haspopup="menu" aria-expanded={menu === 'new'} onClick={() => setMenu(menu === 'new' ? null : 'new')}>+ New workflow ▾</button>
          {menu === 'new' && (
            <div className="fl-add-menu wfl-menu" role="menu" aria-label="New workflow">
              <button role="menuitem" onClick={() => (setMenu(null), setDescribing(true))}><span><b>Describe it to the builder…</b><small>Say what you want; the builder drafts it</small></span></button>
              <button role="menuitem" onClick={() => (setMenu(null), start(undefined))}><span><b>Blank workflow</b><small>Open the builder with nothing in it</small></span></button>
            </div>
          )}
        </span>
      )}
      <span className="imp-wrap">
        <button type="button" aria-expanded={importing} onClick={() => setImporting(!importing)}>Import…</button>
        {importing && <ImportMenu folder={folder} onClose={() => setImporting(false)} onImported={(e) => (setImporting(false), setPicked(`${e.scope}:${e.id}`), load())} />}
      </span>
    </div>
    <div className="wfl" aria-label="Workflows">
      <ul className="wfl-side" role="listbox" aria-label="Workflow list" tabIndex={0} aria-activedescendant={shown ? `wfl-${shown.scope}-${shown.id}` : undefined} onKeyDown={walk}>
        {list.map((e) => {
          const key = `${e.scope}:${e.id}`
          return (
            <li key={key} id={`wfl-${e.scope}-${e.id}`} role="option" aria-selected={shown === e} className={shown === e ? 'on' : ''} onClick={() => (setPicked(key), setAsking(false), setRemoving(false))}>
              <b>{e.workflow?.name ?? `${e.id}.json`}</b>
              <span className="muted">
                {e.problems ? 'Has problems' : SCOPE_LABEL[e.scope]}
                {e.id === defaultId && !e.problems ? ' · default' : ''}
                {e.scope === 'built-in' && defaultId === NO_WORKFLOW ? ' · removed for this project' : ''}
                {e.skills && goneSkills(e.skills).length > 0 && <span className="sk-warn"> · {goneSkills(e.skills).length === 1 ? '1 warning' : `${goneSkills(e.skills).length} warnings`}</span>}
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
            <div className="wfl-cols">
              <div className="wfl-main">
              <div className="wfl-head">
                <b>{wf.name}</b>
                <span className="wf-tag">{SCOPE_LABEL[shown.scope]}</span>
                {shown.id === defaultId && <span className="wf-tag flag">Default{folder ? ` for ${here}` : ''}</span>}
                {shown.scope === 'built-in' && defaultId === NO_WORKFLOW && <span className="wf-tag flag">Removed for {here || 'this project'}</span>}
              </div>
              {wf.when && <p className="muted">When: {wf.when}</p>}
              <p className="muted">{(() => { const n = workflowRuns(runs, shown.id, Date.now()); return n === 0 ? 'No runs this week.' : `${n} run${n === 1 ? '' : 's'} this week.` })()}</p>
              {shown.overrides && <p className="hint">This one is used instead of the {shown.overrides === 'built-in' ? 'built-in Standard' : 'one kept for everything'} with the same id.</p>}
              {(() => {
                const gone = shown.skills ? goneSkills(shown.skills) : []
                return gone.length > 0 ? (
                  <p className="sk-banner" role="alert">
                    <b>{gone.length === 1 ? '1 skill this workflow names is not in the library:' : `${gone.length} skills this workflow names are not in the library:`}</b> {gone.join(', ')}. Agents are told to skip {gone.length === 1 ? 'it' : 'them'}. Fix the file, or add the skill in the Library.
                  </p>
                ) : null
              })()}
              {shown.file && <span className="mono muted" data-reveal={shown.file} title="Right-click to reveal this file">{shown.file}</span>}
              {removing ? (
                <div className="wfl-acts" role="alertdialog" aria-label={`Remove ${wf.name}`}>
                  <span>Remove {wf.name} for {here}? Agents will then work with no workflow: no plan hold, no track, no gate. You can bring it back from the list.</span>
                  <button className="primary" onClick={() => (setRemoving(false), onDefault(NO_WORKFLOW))}>Remove</button>
                  <button onClick={() => setRemoving(false)}>Keep it</button>
                </div>
              ) : asking ? (
                <div className="wfl-acts" role="alertdialog" aria-label={`Delete ${wf.name}`}>
                  <span>Delete {shown.id}.json? This cannot be undone.</span>
                  <button className="primary" onClick={() => void run(() => window.aw.workflows.remove(folder, shown.id, shown.scope === 'project' ? 'project' : 'global'))}>Delete</button>
                  <button onClick={() => setAsking(false)}>Cancel</button>
                </div>
              ) : (
                <div className="wfl-acts">
                  {lb!.restore && <button className="primary" onClick={() => onDefault(shown.id)}>Restore {wf.name}</button>}
                  <button className={lb!.restore ? '' : 'primary'} disabled={!folder || starting} title={folder ? 'Open the builder on this workflow' : 'Open a project first'} onClick={() => start(`I want to change the workflow "${shown.id}" (${wf.name}). Read it first, then ask me what to change.`, { id: shown.id, name: wf.name })}>Edit with the builder</button>
                  {lb!.makeDefault && <button onClick={() => onDefault(shown.id)}>Make default for {here}</button>}
                  <span className="wfl-menu-wrap">
                    <button aria-haspopup="menu" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}>More ▾</button>
                    {menu === 'more' && (
                      <div className="fl-add-menu wfl-menu" role="menu" aria-label="More">
                        {lb!.more.includes('copyProject') && <button role="menuitem" disabled={!folder} title={folder ? '' : 'Open a project first'} onClick={() => (setMenu(null), void run(() => window.aw.workflows.duplicate(folder, shown.id, 'project')))}>Copy to {folder ? here : 'a project'}</button>}
                        {lb!.more.includes('copyGlobal') && <button role="menuitem" onClick={() => (setMenu(null), void run(() => window.aw.workflows.duplicate(folder, shown.id, 'global')))}>Copy for everything</button>}
                        {lb!.more.includes('delete') && <button role="menuitem" className="danger-text" onClick={() => (setMenu(null), setAsking(true))}>Delete</button>}
                        {lb!.more.includes('remove') && <button role="menuitem" className="danger-text" onClick={() => (setMenu(null), setRemoving(true))}>Remove</button>}
                      </div>
                    )}
                  </span>
                </div>
              )}
              {shown.scope !== 'built-in' && <History folder={folder} id={shown.id} />}
              </div>
              <div className="wfl-flow"><FlowCanvas fill steps={wf.steps} selected={null} skillStates={shown.skills} onSelect={() => {}} /></div>
            </div>
          )
        )}
      </div>
    </div>
    </>
  )
}
