import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeReminder } from './libraryReminder'
import { groupTokens } from './libraryCost'
import type { LibraryCandidate, LibraryItem, LibraryKind, LibraryPreview, PlaybookRule, RuleMode, SkillPlaces, SkillUse } from '../../shared/library'
import type { ProviderId, ProviderInfo } from '../../shared/types'
import { PixelIcon, type IconName } from '../chat/PixelIcon'
import { AddItemMenu } from './AddItemMenu'
import { LibraryItemPane } from './LibraryItemPane'
import { LibraryReach, type Fix } from './LibraryReach'
import { LibraryRule } from './LibraryRule'
import { ProviderTag } from './ProviderTag'
import { SkillWhere } from './SkillWhere'
import { SkillUsage } from './SkillUsage'
import { CostMeter, DayStrip, Heads } from './SkillBits'
import { ago } from './addressHistory'
import { dustOf, splitUsage } from './libraryUsage'
import { findItems, highlightOpening, spineLook, tierOf, type Tier } from './libraryShelf'
import { SkillShelf } from './SkillShelf'
import { FoundReader, SkillFooter, SkillOverview } from './SkillOverview'
import { shelfGroups } from './skillGroups'
import { sizeText } from '../../shared/size'

const SECTIONS: ['skills' | 'playbook' | 'reach', string][] = [['skills', 'Skills'], ['playbook', 'Playbook'], ['reach', 'Usage']]
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
  ['Strength', 'How firmly the rulebook line pushes: soft is only in the opening text. Medium and hard rules are in the line sent with the first message, every sixth one after, after a compaction and after a long pause. Hard adds a request to say which rules apply.'],
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
  const [tab, setTab] = useState<'skills' | 'playbook' | 'reach'>('skills')
  const [find, setFind] = useState('')
  const [places, setPlaces] = useState<SkillPlaces | null>(null)
  const [busy, setBusy] = useState(false)
  const [usage30, setUsage30] = useState<Record<string, SkillUse>>({})
  // Every skill found on this computer (global folders, every project, every account's plugins), to show beside what the library holds.
  const [scan, setScan] = useState<LibraryCandidate[]>([])
  const refreshScan = useCallback(() => void window.aw.library.sources(folder || undefined).then(setScan, () => setScan([])), [folder])

  const [holders, setHolders] = useState<{ id: string; name: string; provider: string; stale: boolean }[]>([])
  const stale = holders.filter((h) => h.stale)
  const [silent, setSilent] = useState<{ id: string; name: string }[]>([])
  const [restarting, setRestarting] = useState(false)

  const load = useCallback(async () => {
    const r = await window.aw.library.list()
    setItems(r.items)
    setUsage(r.usage)
  }, [])
  const loadPlaces = useCallback(() => window.aw.library.places(folder || undefined).then(setPlaces, (e) => setError(clean(e))), [folder])
  useEffect(() => void load().catch((e) => setError(clean(e))), [load])
  // Opening the tab reads both again: a folder may have been installed, moved or deleted since.
  useEffect(() => {
    if (tab !== 'skills') return
    refreshScan()
    void load().catch(() => undefined)
  }, [tab, refreshScan, load])
  // A skill's size was measured: the list is read again, which brings the sizes.
  useEffect(() => window.aw.onLibrarySizes(() => void load()), [load])
  useEffect(() => void loadPlaces(), [loadPlaces, items])
  const loadUsage = useCallback(() => window.aw.library.usage30().then(setUsage30, (e) => setError(clean(e))), [])
  useEffect(() => void loadUsage(), [loadUsage, items])
  // A skill an agent just loaded or read pulses in the list for a moment, and its numbers move on.
  const [live, setLive] = useState<Set<string>>(new Set())
  useEffect(() => window.aw.onLibraryUse((_agent, how, item) => {
    if (how !== 'skill' && how !== 'read' && how !== 'fetched') return
    void loadUsage()
    setLive((l) => new Set(l).add(item))
    setTimeout(() => setLive((l) => { const n = new Set(l); n.delete(item); return n }), 2400)
  }), [loadUsage])
  // One change at a time, so two quick clicks cannot cross; the switches show what is on disk afterwards.
  const place = async (go: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await go()
    } catch (e) {
      setError(clean(e))
    }
    await loadPlaces()
    setBusy(false)
  }
  // Clear the dust: each skill turned off for Claude in turn, as one change.
  const turnOff = (ids: string[]) => void place(async () => { for (const id of ids) await window.aw.library.setClaude(id, false) })
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

  const shown = items
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
  // Skills a playbook rule hands to agents whatever the switch says: never offered as dust.
  const named = useMemo(() => new Set(effective.filter((r) => r.mode !== 'off').map((r) => r.id)), [effective])
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
      refreshScan()
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
    refreshScan()
  }
  const shelf = useMemo(() => shelfGroups(items, scan, ''), [items, scan])
  const current = open ? byId.get(open) : undefined
  const foundCurrent = open && !current ? scan.find((c) => c.dir === open) : undefined
  // Adds a found skill to the library as a link, and opens it.
  const addFound = async (c: LibraryCandidate) => {
    setError('')
    try {
      const r = await window.aw.library.import(folder || undefined, [c.dir])
      await load()
      refreshScan()
      setOpen(r.added[0] ?? null)
    } catch (e) {
      setError(clean(e))
    }
  }
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
      </div>

      {tab === 'skills' && (
      <div role="tabpanel" id="lib-panel-skills" aria-labelledby="lib-tab-skills" className="lib-panel lib-panel-shelf">
      <div className="lib-col">
      {notice && <p className="mc-done" role="status">{notice}</p>}
      <div className="lib-bar" role="group" aria-label="Library items">
        <input aria-label="Find an item" placeholder="Find an item…" value={find} onChange={(e) => setFind(e.target.value)} />
        <span className="lib-sp" />
        <button aria-label="Import from this computer…" title="Copy skills found on this computer into the library" onClick={() => void startImport()}>Add skill…</button>
        <button onClick={() => (setOpen(null), setDraft({ kind: 'instruction', name: '', description: '', body: '' }))}>New instruction</button>
        <button onClick={() => (setOpen(null), setDraft({ kind: 'prompt', name: '', description: '', body: '' }))}>New prompt</button>
      </div>
      {places && (() => {
        const skills = items.filter((i) => i.kind === 'skill')
        const on = skills.filter((i) => !places.claudeOff.includes(i.id))
        return <p className="lib-sum"><span className="hint">{skills.length} {skills.length === 1 ? 'skill' : 'skills'} · {on.length} on for Claude · start-of-session cost</span><CostMeter tokens={on.reduce((n, i) => n + i.tokens.description, 0)} /></p>
      })()}

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

      {items.length === 0 && scan.length === 0 && <p className="hint">Nothing here yet. Add skills from this computer, or write an instruction.</p>}
      {(items.length > 0 || scan.length > 0) && (
        <SkillShelf groups={shelfGroups(items, scan, find)} others={findItems(items.filter((i) => i.kind !== 'skill'), find)} open={open} live={live} onOpen={(key) => (setOpen(key), setDraft(null))} />
      )}
      </div>

      <div className="lib-read">
      {!current && !foundCurrent && !draft && <div className="lib-box lib-pick"><p className="hint">Pick an item to read it here, or write a new instruction.</p></div>}
      {foundCurrent && !draft && <FoundReader c={foundCurrent} busy={busy} onAdd={() => void addFound(foundCurrent)} />}
      {current && !draft && (
        <LibraryItemPane
          item={current}
          usage={usage[current.id]}
          stats={current.kind === 'skill' ? (() => {
            const u = usage30[current.id]
            const n = Object.keys(u?.projects ?? {}).length
            return (
              <div className="lip-stats" aria-label={`${current.name} in the last 30 days`}>
                {current.size && <span><b>{sizeText(current.size.bytes)}</b> on disk</span>}
                <span>{u?.used ? <>used <b>{u.used}×</b> in {n} {n === 1 ? 'project' : 'projects'}{u.last ? `, last ${ago(u.last, Date.now())}` : ''}</> : 'not used in 30 days'}</span>
                <span className="lip-tok" title="What its name and description add to every Claude session">{current.tokens.description} tok each session</span>
              </div>
            )
          })() : undefined}
          colour={spineLook(current).colour}
          where={current.kind === 'skill' && places ? (
            <SkillOverview
              item={current}
              use={usage30[current.id]}
              places={places}
              busy={busy}
              original={shelf.find((g) => g.kind === 'library')?.rows.find((r) => r.key === current.id)?.original}
              onUseOriginal={(dir) => void place(async () => { await window.aw.library.useOriginal(current.id, dir); await load(); refreshScan() })}
              where={<SkillWhere id={current.id} colour={spineLook(current).colour} dir={current.place?.real ?? current.dir} places={places} busy={busy} onClaude={(on) => void place(() => window.aw.library.setClaude(current.id, on))} onLink={(t, on) => void place(() => window.aw.library.link(current.id, t, on, folder || undefined))} />}
            />
          ) : undefined}
          footer={current.kind === 'skill' ? <SkillFooter item={current} busy={busy} onRemove={() => void remove(current.id)} onDeleted={() => (setOpen(null), void load(), refreshScan())} /> : undefined}
          onEdit={() => edit(current)}
          onRemove={() => void remove(current.id)}
        />
      )}
      {draft && (() => {
        const KIND_LABEL: Record<LibraryKind, string> = { skill: 'skill', instruction: 'instruction', prompt: 'prompt' }
        const ABOUT: Record<LibraryKind, string> = {
          skill: 'A skill is a folder an agent loads when its work needs it. A playbook says which agents get it, and when.',
          instruction: 'An instruction is told to agents as written. A playbook says which agents, and when.',
          prompt: 'A prompt is text an agent reads when its work calls for it. A playbook says which agents, and when.'
        }
        const ok = !!draft.name.trim() && !!draft.body.trim()
        const keys = (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ok) (e.preventDefault(), void saveDraft())
          else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), setDraft(null))
        }
        const len = draft.description.length
        return (
          <div className="lib-box lie" role="group" aria-label="Edit item" onKeyDown={keys}>
            <div className="lie-head">
              <h3>{draft.id ? `Edit ${draft.name || draft.id}` : `New ${KIND_LABEL[draft.kind]}`}</h3>
              <small className="lib-kind">{draft.kind}</small>
              <p>{ABOUT[draft.kind]}</p>
            </div>
            <div className="lie-body">
              <label className="lie-f">
                <span className="lie-lb"><b>Name</b></span>
                <input autoFocus value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Item name" />
              </label>
              <label className="lie-f">
                <span className="lie-lb"><b>When to use it</b><small className={len > 160 ? 'over' : ''}>{len} / 160</small></span>
                <input value={draft.description} maxLength={500} placeholder="before committing" onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Item description" />
                <span className="lie-hint">One line an agent judges its work against, such as "before committing" or "when a test fails".</span>
              </label>
              <label className="lie-f lie-grow">
                <span className="lie-lb"><b>Text an agent reads</b><small>Markdown · ≈{Math.ceil(draft.body.length / 4)} tokens</small></span>
                <textarea rows={10} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} aria-label="Item text" />
              </label>
            </div>
            <div className="lie-foot">
              <button className="primary" disabled={!ok} onClick={() => void saveDraft()}>Save</button>
              <button onClick={() => setDraft(null)}>Cancel</button>
              <span className="lib-sp" />
              <small>⌘↵ saves · Esc cancels</small>
            </div>
          </div>
        )
      })()}
      </div>

      </div>
      )}

      {tab === 'playbook' && (
      <div role="tabpanel" id="lib-panel-playbook" aria-labelledby="lib-tab-playbook" className="lib-panel">
      <div className="pb">
        {preview?.overBudget && (
          <div className="lib-notice warn" role="note"><div><b>The opening text is over budget: {preview.coreTokens} of {CORE_BUDGET} tokens.</b><span>Every agent pays this on every message. Move something to "Pointed at", or shorten it.</span></div></div>
        )}
        <div className="shelf low" aria-label="What is on the desk and the shelf">
          {TIERS.map((t) => {
            const row = items.filter((i) => tierOf(effective, i.id) === t.id)
            return (
              <div key={t.id} className="tier">
                <div className="tier-lab"><b>{t.label}</b><span>{t.sub}</span></div>
                <div>
                  <div className={`spines small${row.length ? '' : ' none'}`}>
                    {row.length === 0 && <small className="tier-none">nothing here</small>}
                    {row.map((i) => {
                      const look = spineLook(i, true)
                      return (
                        <button key={i.id} className="spine" data-name={i.name} aria-label={`Open ${i.name}`} style={{ height: look.height, background: look.colour }} onClick={() => (setTab('skills'), setFind(''), setDraft(null), setOpen(i.id))}>
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
                <p className="hint">{preview?.reminder ? describeReminder(preview.reminder) : (who === 'claude' ? '(none: every rule is soft)' : '(agy has no per-turn reminder)')}</p>
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
      {places && <SkillUsage items={items} usage={usage30} claudeOff={places.claudeOff} named={named} projects={places.projects} busy={busy} onClaude={(id, on) => void place(() => window.aw.library.setClaude(id, on))} onClear={turnOff} onRemove={(id) => void remove(id)} />}
      <LibraryReach byId={byId} whenOf={whenOf} onFix={(id, fix) => void fixRule(id, fix)} />
      </div>
      )}
    </>
  )
}
