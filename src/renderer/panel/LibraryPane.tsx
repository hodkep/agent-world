import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeReminder } from './libraryReminder'
import { groupTokens } from './libraryCost'
import type { LibraryCandidate, LibraryItem, LibraryKind, LibraryPreview, PlaybookRule, RuleMode } from '../../shared/library'
import type { ProviderId, ProviderInfo } from '../../shared/types'
import { PixelIcon, type IconName } from '../chat/PixelIcon'
import { AddItemMenu } from './AddItemMenu'
import { LibraryItemPane } from './LibraryItemPane'
import { LibraryReach, type Fix } from './LibraryReach'
import { LibraryRule } from './LibraryRule'
import { ProviderTag } from './ProviderTag'
import { findItems, highlightOpening, spineLook, tierOf, type Tier } from './libraryShelf'

const KINDS: { value: LibraryKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'skill', label: 'Skills' },
  { value: 'instruction', label: 'Instructions' },
  { value: 'prompt', label: 'Prompts' }
]
const SECTIONS: ['shelf' | 'playbook' | 'reach', string][] = [['shelf', 'Shelf'], ['playbook', 'Playbook'], ['reach', 'Reached for']]
const MODES: RuleMode[] = ['always', 'on-demand', 'step', 'off']
const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
const CORE_BUDGET = 300
const GROUP_LABEL: Record<RuleMode, string> = { always: 'Told every time', 'on-demand': 'In the rulebook, the agent decides', step: 'Put in by a workflow step', off: 'Off' }
const KIND_ICON: Record<LibraryKind, IconName> = { skill: 'book', instruction: 'flag', prompt: 'pencil' }
// The box is a drawer below the shelves, not a shelf: forty books in no playbook would not fit in one view.
const TIERS: { id: Tier; label: string; sub: string }[] = [
  { id: 'desk', label: 'On the desk', sub: 'told every time' },
  { id: 'shelf', label: 'On the shelf', sub: 'pointed at' }
]
const GLOSSARY: [string, string][] = [
  ['Told every time', 'The words go into the opening text, so the agent knows them from its first message.'],
  ['Pointed at', 'Only a line that says when it applies is in the opening text. The agent judges from it whether its work needs the item, and reads it then.'],
  ['By a step', 'A workflow step puts the item in when that step starts. It is not in the opening text.'],
  ['Off', 'In the library, but in no opening text and never put in front of an agent.'],
  ['Strength', 'How often the rulebook line is put in front of the agent: soft only in the opening text, medium on every third message, hard on every message with a request to say which rules apply.'],
  ['Opening text', 'What an agent is given when it starts: the told items, the list of when-lines and how to read an item.'],
  ['When it applies', 'One plain sentence the agent reads and judges against its own work. The app does not match it to a message.'],
  ['Tokens', 'Roughly three quarters of a word. Opening text is capped at 300 so it stays cheap.'],
  ['Everywhere and project', 'Everywhere reaches every project. A project can add or switch off items for itself.']
]

/**
 * The shared library (one global store of skills, instructions and prompts), the playbooks that say how agents use it
 * (global, and for the project that is open), and a preview of what an agent would be told.
 */
export function LibraryPane({ folder, providers }: { folder: string; providers: ProviderInfo[] }) {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [usage, setUsage] = useState<Record<string, { claude: number; agy: number; total: number }>>({})
  const [kind, setKind] = useState<LibraryKind | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ id?: string; kind: LibraryKind; name: string; description: string; body: string } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [found, setFound] = useState<LibraryCandidate[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [scope, setScope] = useState<'global' | 'workspace'>(folder ? 'workspace' : 'global')
  const [books, setBooks] = useState<{ global: PlaybookRule[]; workspace: PlaybookRule[] }>({ global: [], workspace: [] })
  const ready = providers.filter((p) => p.detection.state === 'ready')
  const [who, setWho] = useState<ProviderId>(ready[0]?.id ?? 'claude')
  const [preview, setPreview] = useState<LibraryPreview | null>(null)
  const [help, setHelp] = useState(false)
  const [tab, setTab] = useState<'shelf' | 'playbook' | 'reach'>('shelf')
  const [find, setFind] = useState('')
  const [holders, setHolders] = useState<{ id: string; name: string; provider: string; stale: boolean }[]>([])
  const stale = holders.filter((h) => h.stale)
  const [silent, setSilent] = useState<{ id: string; name: string }[]>([])
  const [restarting, setRestarting] = useState(false)

  const load = useCallback(async () => {
    const r = await window.aw.library.list()
    setItems(r.items)
    setUsage(r.usage)
  }, [])
  useEffect(() => void load().catch((e) => setError(clean(e))), [load])
  useEffect(() => void window.aw.library.playbook(folder || undefined).then(setBooks).catch((e) => setError(clean(e))), [folder])
  const refreshStale = useCallback(() => (folder ? window.aw.library.holders(folder).then(setHolders, () => setHolders([])) : Promise.resolve(setHolders([]))), [folder])
  useEffect(() => void refreshStale(), [refreshStale, books])
  // The hooks of agy's plugin are quiet when they work, so ask now and then; an agent that has worked and never been heard from is shown.
  useEffect(() => {
    if (!folder) return setSilent([])
    const ask = () => void window.aw.library.silent(folder).then(setSilent, () => setSilent([]))
    ask()
    const t = setInterval(ask, 15_000)
    return () => clearInterval(t)
  }, [folder])
  useEffect(() => window.aw.onLibraryUse(() => void refreshStale()), [refreshStale])
  const restartStale = async () => {
    setRestarting(true)
    setError('')
    const failed: string[] = []
    for (const a of stale) await window.aw.reconfigure(a.id, {}).catch(() => void failed.push(a.name))
    setRestarting(false)
    if (failed.length) setError(`${failed.join(', ')} ${failed.length === 1 ? 'is' : 'are'} in the middle of a turn. Try again when ${failed.length === 1 ? 'it finishes' : 'they finish'}.`)
    setTimeout(() => void refreshStale(), 1500)
  }
  const refreshPreview = useCallback(() => (folder ? window.aw.library.preview(folder, who).then(setPreview, () => setPreview(null)) : Promise.resolve()), [folder, who])
  useEffect(() => void refreshPreview(), [refreshPreview, books, items])

  const shown = items.filter((i) => kind === 'all' || i.kind === kind)
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const rules = books[scope]
  const effective = useMemo(() => [...new Map([...books.global, ...(folder ? books.workspace : [])].map((r) => [r.id, r])).values()], [books, folder])
  const saveRules = async (next: PlaybookRule[]) => {
    setBooks((b) => ({ ...b, [scope]: next }))
    try {
      await window.aw.library.setPlaybook(scope === 'global' ? null : folder, next)
    } catch (e) {
      setError(clean(e))
    }
  }
  const change = (n: number, patch: Partial<PlaybookRule>) => void saveRules(rules.map((r, i) => (i === n ? { ...r, ...patch } : r)))

  // A fix from the stats edits the rule where it lives: this workspace's playbook when it has the item, else the global one.
  const fixRule = async (id: string, fix: Fix) => {
    const where: 'workspace' | 'global' = folder && books.workspace.some((r) => r.id === id) ? 'workspace' : 'global'
    const list = books[where]
    if (!list.some((r) => r.id === id)) return
    if (fix === 'when') {
      setScope(where)
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[aria-label="When to use ${id}"]`)?.focus())
      return
    }
    const next = list.map((r) => (r.id === id ? (fix === 'firm' ? { ...r, strength: 'hard' as const } : { ...r, mode: 'step' as const }) : r))
    setBooks((b) => ({ ...b, [where]: next }))
    try {
      await window.aw.library.setPlaybook(where === 'global' ? null : folder, next)
    } catch (e) {
      setError(clean(e))
    }
  }
  const whenOf = useCallback((id: string) => [...books.workspace, ...books.global].find((r) => r.id === id)?.when ?? '', [books])

  const startImport = async () => {
    setError('')
    setNotice('')
    try {
      const c = await window.aw.library.sources(folder || undefined)
      const have = new Set(items.map((i) => i.id))
      setFound(c)
      setPicked(new Set(c.filter((x) => !have.has(x.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))).map((x) => x.dir)))
    } catch (e) {
      setError(clean(e))
    }
  }
  const doImport = async () => {
    try {
      const r = await window.aw.library.import(folder || undefined, [...picked])
      setNotice(`Imported ${r.added.length}${r.skipped.length ? `, skipped ${r.skipped.length} already here` : ''}.`)
      setFound(null)
      await load()
    } catch (e) {
      setError(clean(e))
    }
  }
  const saveDraft = async () => {
    if (!draft) return
    try {
      const saved = await window.aw.library.save(draft)
      setDraft(null)
      setOpen(saved.id)
      setNotice(`Saved ${saved.name}.`)
      await load()
    } catch (e) {
      setError(clean(e))
    }
  }
  const remove = async (id: string) => {
    if (!window.confirm(`Remove ${id} from the library? Playbooks that use it stop using it.`)) return
    await window.aw.library.remove(id)
    setOpen(null)
    setDraft(null)
    await load()
  }
  const current = open ? byId.get(open) : undefined
  const edit = (i: LibraryItem) => setDraft({ id: i.id, kind: i.kind, name: i.name, description: i.description, body: i.body })

  return (
    <>
      <div className="lib-tabs" role="tablist" aria-label="Library sections">
        {SECTIONS.map(([id, label]) => (
          <button key={id} role="tab" id={`lib-tab-${id}`} aria-selected={tab === id} aria-controls={`lib-panel-${id}`} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="lib-notices" aria-label="Things to know">
        {ready.some((p) => p.id === 'agy') && providers.find((p) => p.id === 'agy')?.mail === 'missing' && (
          <div className="lib-notice info" role="note"><div><b>agy is not connected.</b><span>Its agents get the always-on rules and the catalog, but no line for the message they are sent. Connect it under Message box.</span></div></div>
        )}
        {silent.length > 0 && (
          <div className="lib-notice bad" role="note"><div><b>The library plugin could not reach the office for {silent.map((a) => a.name).join(', ')}.</b><span>agy carried on without a library line, and what it reads is not counted. Check that the plugin is installed under Message box, and that Agent World was running when the agent started.</span></div></div>
        )}
        {stale.length > 0 && (
          <div className="lib-notice warn" role="note">
            <div>
              <b>{stale.length} {stale.length === 1 ? 'agent started' : 'agents started'} before you changed this playbook.</b>
              <span>{stale.map((a) => a.name).join(', ')} keep{stale.length === 1 ? 's' : ''} what they were told until they restart.</span>
              <div className="actions"><button className="primary" disabled={restarting} onClick={() => void restartStale()}>{restarting ? 'Restarting…' : `Restart ${stale.length} ${stale.length === 1 ? 'agent' : 'agents'}`}</button></div>
            </div>
          </div>
        )}
        {preview?.overBudget && (
          <div className="lib-notice warn" role="note"><div><b>The opening text is over budget: {preview.coreTokens} of {CORE_BUDGET} tokens.</b><span>Every agent pays this on every message. Move something to "Pointed at", or shorten it.</span></div></div>
        )}
      </div>

      {tab === 'shelf' && (
      <div role="tabpanel" id="lib-panel-shelf" aria-labelledby="lib-tab-shelf" className="lib-panel lib-panel-shelf">
      <div className="lib-col">
      {notice && <p className="mc-done" role="status">{notice}</p>}
      <div className="lib-bar" role="group" aria-label="Library items">
        <div className="lib-kinds" role="group" aria-label="Show">
          {KINDS.map((k) => (
            <button key={k.value} aria-pressed={kind === k.value} className={kind === k.value ? 'on' : ''} onClick={() => setKind(k.value)}>{k.label}</button>
          ))}
        </div>
        <span className="lib-sp" />
        <button aria-label="Import from this computer…" title="Copy skills found on this computer into the library" onClick={() => void startImport()}>Import…</button>
        <button onClick={() => (setOpen(null), setDraft({ kind: 'instruction', name: '', description: '', body: '' }))}>New instruction</button>
        <button onClick={() => (setOpen(null), setDraft({ kind: 'prompt', name: '', description: '', body: '' }))}>New prompt</button>
      </div>

      {found && (
        <div className="lib-box" role="group" aria-label="Import from this computer">
          {found.length === 0 && <p className="hint">No skills found in the usual places.</p>}
          {found.map((c) => (
            <label key={c.dir} className="lib-src">
              <input type="checkbox" checked={picked.has(c.dir)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(c.dir); else n.delete(c.dir); return n })} />
              <span><b>{c.name}</b> <small>{c.source}</small><small>{c.description}</small></span>
            </label>
          ))}
          <div className="su-row">
            <button className="primary" disabled={picked.size === 0} onClick={() => void doImport()}>Import {picked.size} selected</button>
            <button onClick={() => setFound(null)}>Cancel</button>
            <span className="hint">Copies them into the library; the originals stay where they are.</span>
          </div>
        </div>
      )}

      {shown.length === 0 && <p className="hint">Nothing here yet. Import skills from this computer, or write an instruction.</p>}
      {shown.length > 0 && (
        <div className="shelf low" aria-label="Items">
          {TIERS.map((t) => {
            const row = shown.filter((i) => tierOf(effective, i.id) === t.id)
            return (
              <div key={t.id} className="tier">
                <div className="tier-lab"><b>{t.label}</b><span>{t.sub}</span></div>
                <div>
                  <div className={`spines small${row.length ? '' : ' none'}`}>
                    {row.length === 0 && <small className="tier-none">nothing here</small>}
                    {row.map((i) => {
                      const look = spineLook(i, true)
                      return (
                        <button key={i.id} className={`spine${open === i.id ? ' sel' : ''}`} data-name={i.name} aria-label={`Open ${i.name}`} aria-pressed={open === i.id} style={{ height: look.height, background: look.colour }} onClick={() => (setOpen(i.id), setDraft(null))}>
                          <PixelIcon name={KIND_ICON[i.kind]} scale={1} />
                        </button>
                      )
                    })}
                  </div>
                  <div className="plank" />
                </div>
              </div>
            )
          })}
        </div>
      )}
      {shown.length > 0 && (() => {
        const inBox = shown.filter((i) => tierOf(effective, i.id) === 'box')
        const hits = findItems(inBox, find)
        return (
          <section className="drawer" aria-label="In the box">
            <h4>In the box <span>{inBox.length} in no playbook</span><span className="lib-sp" /><input aria-label="Find an item" placeholder="Find an item…" value={find} onChange={(e) => setFind(e.target.value)} /></h4>
            <div className="drawer-list lib-scrollbar">
              {hits.map((i) => (
                <button key={i.id} className={`drawer-item${open === i.id ? ' sel' : ''}`} aria-label={`Open ${i.name}`} aria-pressed={open === i.id} onClick={() => (setOpen(i.id), setDraft(null))}>
                  <PixelIcon name={KIND_ICON[i.kind]} scale={1} /><span>{i.name}</span><small>{i.tokens.body} tokens</small>
                </button>
              ))}
              {hits.length === 0 && <p className="hint">{inBox.length ? 'Nothing in the box matches.' : 'Everything is in a playbook.'}</p>}
            </div>
          </section>
        )
      })()}
      </div>

      <div className="lib-read">
      {!current && !draft && <div className="lib-box lib-pick"><p className="hint">Pick a book or an item from the box to read it here, or write a new instruction.</p></div>}
      {current && !draft && <LibraryItemPane item={current} usage={usage[current.id]} onEdit={() => edit(current)} onRemove={() => void remove(current.id)} />}
      {draft && (
        <div className="lib-box" role="group" aria-label="Edit item">
          <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Item name" /></label>
          <label>One line: what it is for, and when an agent should use it<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Item description" /></label>
          <label>Text an agent reads<textarea rows={8} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} aria-label="Item text" /></label>
          <div className="su-row"><button className="primary" disabled={!draft.name.trim() || !draft.body.trim()} onClick={() => void saveDraft()}>Save</button><button onClick={() => setDraft(null)}>Cancel</button></div>
        </div>
      )}
      </div>

      </div>
      )}
      {tab === 'playbook' && (
      <div role="tabpanel" id="lib-panel-playbook" aria-labelledby="lib-tab-playbook" className="lib-panel">
      <div className="pb">
        <div className="pb-head">
          <div className="lib-scopes" role="group" aria-label="Playbook scope">
            <button aria-pressed={scope === 'global'} onClick={() => setScope('global')}>Everywhere</button>
            {folder && <button aria-pressed={scope === 'workspace'} onClick={() => setScope('workspace')}>{folder.split('/').pop()}</button>}
          </div>
          {preview && <small className="lib-tok" aria-label="Opening text size">opening text ≈ {preview.coreTokens} / {CORE_BUDGET} tokens{preview.overBudget ? ' (over budget)' : ''}</small>}
          <button className="help" aria-expanded={help} aria-label="What do these words mean?" title="What do these words mean?" onClick={() => setHelp((h) => !h)}>?</button>
        </div>
        {help && (
          <dl className="gloss" aria-label="What the words mean">
            {GLOSSARY.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
          </dl>
        )}
        <div className="pb-grid">
          <div className="pb-l">
            {rules.length === 0 && <p className="hint">No rules. Agents in {scope === 'global' ? 'any workspace' : 'this workspace'} get nothing from the library until you add some.</p>}
            <div className="lib-rules" aria-label="Playbook rules">
              {MODES.map((m) => {
                const here = rules.map((r, n) => ({ r, n })).filter((x) => x.r.mode === m)
                if (!here.length) return null
                return (
                  <div key={m} className="rule-group">
                    <h4>{GROUP_LABEL[m]} <span>{here.length}</span></h4>
                    {here.map(({ r, n }) => (
                      <LibraryRule key={r.id} rule={r} item={byId.get(r.id)} onChange={(patch) => change(n, patch)} onRemove={() => void saveRules(rules.filter((_, i) => i !== n))} />
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="lib-bar">
              <AddItemMenu items={items} added={new Set(rules.map((r) => r.id))} onAdd={(id) => void saveRules([...rules, { id, mode: 'on-demand', when: '', strength: 'soft' }])} />
            </div>
          </div>
          <div className="pb-r">
            {!folder ? <p className="hint">Open a project to see what its agents would be told.</p> : (
              <div role="group" aria-label="What an agent is told">
                <h4>What every agent starts with</h4>
                <label className="lib-inline">Agent of
                  <select aria-label="Program" value={who} onChange={(e) => setWho(e.target.value as ProviderId)}>{ready.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
                </label>
                <pre className="doc" aria-label="Opening text">{preview?.core
                  ? highlightOpening(preview.core, effective.filter((r) => r.mode === 'always').map((r) => byId.get(r.id)?.name ?? ''), effective.filter((r) => r.mode === 'on-demand').map((r) => r.when)).map((m, k) => m.kind ? <span key={k} className={m.kind}>{m.text}</span> : m.text)
                  : '(nothing: no rules apply here)'}</pre>
                <h4>It can ask for</h4>
                <p className="hint">{preview && preview.indexIds.length ? preview.indexIds.map((id) => byId.get(id)?.name ?? id).join(', ') : 'nothing'}</p>
                <h4>Reminder</h4>
                <p className="hint">{preview?.reminder ? describeReminder(preview.reminder, effective.filter((r) => r.strength === 'hard' && r.mode !== 'off').map((r) => r.id)) : (who === 'claude' ? '(none: every rule is soft)' : '(agy has no per-turn reminder)')}</p>
                {holders.length > 0 && (
                  <>
                    <h4>Who gets this</h4>
                    <ul className="who-list" aria-label="Who has this text">
                      {holders.map((h) => <li key={h.id}><i className={`who-dot${h.stale ? ' old' : ''}`} /><b>{h.name}</b><ProviderTag id={h.provider as ProviderId} /><span className={`who-st${h.stale ? ' old' : ''}`}>{h.stale ? 'started on an older text' : 'up to date'}</span></li>)}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      </div>
      )}
      {tab === 'reach' && (
      <div role="tabpanel" id="lib-panel-reach" aria-labelledby="lib-tab-reach" className="lib-panel">
      <LibraryReach byId={byId} whenOf={whenOf} onFix={(id, fix) => void fixRule(id, fix)} />
      </div>
      )}
    </>
  )
}
