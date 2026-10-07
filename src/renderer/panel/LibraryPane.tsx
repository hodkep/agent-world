import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LibraryCandidate, LibraryItem, LibraryKind, LibraryPreview, PlaybookRule, RuleMode, RuleStrength } from '../../shared/library'
import type { ProviderId, ProviderInfo } from '../../shared/types'
import { PixelIcon, type IconName } from '../chat/PixelIcon'
import { LibraryReach, type Fix } from './LibraryReach'
import { highlightOpening, spineLook, tierOf, type Tier } from './libraryShelf'

const KINDS: { value: LibraryKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'skill', label: 'Skills' },
  { value: 'instruction', label: 'Instructions' },
  { value: 'prompt', label: 'Prompts' }
]
const MODES: RuleMode[] = ['always', 'on-demand', 'step', 'off']
const STRENGTHS: RuleStrength[] = ['soft', 'medium', 'hard']
const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
const CORE_BUDGET = 300
const MODE_LABEL: Record<RuleMode, string> = { always: 'Told every time', 'on-demand': 'Pointed at', step: 'By a step', off: 'Off' }
const GROUP_LABEL: Record<RuleMode, string> = { always: 'Told every time', 'on-demand': 'Pointed at when a message matches', step: 'Put in by a workflow step', off: 'Off' }
const KIND_ICON: Record<LibraryKind, IconName> = { skill: 'book', instruction: 'flag', prompt: 'pencil' }
const TIERS: { id: Tier; label: string; sub: string }[] = [
  { id: 'desk', label: 'On the desk', sub: 'told every time' },
  { id: 'shelf', label: 'On the shelf', sub: 'pointed at when a message matches' },
  { id: 'box', label: 'In the box', sub: 'in no playbook' }
]
const GLOSSARY: [string, string][] = [
  ['Told every time', 'The words go into the opening text, so the agent knows them from its first message.'],
  ['Pointed at', 'Only a line that says when it applies is in the opening text. When a message matches, the agent is pointed at the item and reads it then.'],
  ['By a step', 'A workflow step puts the item in when that step starts. It is not in the opening text.'],
  ['Off', 'In the library, but in no opening text and never pointed at.'],
  ['Strength', 'How firmly the agent is reminded each turn: soft is a hint, hard is an instruction.'],
  ['Opening text', 'What an agent is given when it starts: the told items, the list of when-lines and how to read an item.'],
  ['When it applies', 'One plain sentence. A message that sounds like it makes the agent point at the item.'],
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
  const [adding, setAdding] = useState('')
  const ready = providers.filter((p) => p.detection.state === 'ready')
  const [who, setWho] = useState<ProviderId>(ready[0]?.id ?? 'claude')
  const [preview, setPreview] = useState<LibraryPreview | null>(null)
  const [help, setHelp] = useState(false)

  const load = useCallback(async () => {
    const r = await window.aw.library.list()
    setItems(r.items)
    setUsage(r.usage)
  }, [])
  useEffect(() => void load().catch((e) => setError(clean(e))), [load])
  useEffect(() => void window.aw.library.playbook(folder || undefined).then(setBooks).catch((e) => setError(clean(e))), [folder])
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
      <legend>Library</legend>
      <p className="set-lead">Skills, instructions and prompts kept once, for every program. A playbook says which an agent uses and when; they are fetched on demand, so they cost nothing until used.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="mc-done" role="status">{notice}</p>}

      <div className="lib-bar" role="group" aria-label="Library items">
        <div className="lib-kinds" role="group" aria-label="Show">
          {KINDS.map((k) => (
            <button key={k.value} aria-pressed={kind === k.value} className={kind === k.value ? 'on' : ''} onClick={() => setKind(k.value)}>{k.label}</button>
          ))}
        </div>
        <span className="lib-sp" />
        <button onClick={() => void startImport()}>Import from this computer…</button>
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

      <div className="shelf" aria-label="Items">
        {shown.length === 0 && <p className="hint">Nothing here yet. Import skills from this computer, or write an instruction.</p>}
        {shown.length > 0 && TIERS.map((t) => {
          const row = shown.filter((i) => tierOf(effective, i.id) === t.id)
          return (
            <div key={t.id} className="tier">
              <h4>{t.label} <span>{t.sub}</span></h4>
              <div className="spines">
                {row.map((i) => {
                  const look = spineLook(i)
                  return (
                    <button key={i.id} className={`spine${open === i.id ? ' sel' : ''}`} data-name={i.name} aria-label={`Open ${i.name}`} aria-pressed={open === i.id} style={{ height: look.height, background: look.colour }} onClick={() => (setOpen(i.id), setDraft(null))}>
                      <PixelIcon name={KIND_ICON[i.kind]} scale={1} />
                    </button>
                  )
                })}
              </div>
              <div className="plank" />
            </div>
          )
        })}
      </div>

      {current && !draft && (
        <div className="lib-box" role="group" aria-label={`${current.name} in detail`}>
          <div className="lib-head"><b>{current.name}</b><small className="lib-kind">{current.kind}</small><span className="lib-sp" /><button onClick={() => edit(current)}>Edit</button><button onClick={() => void remove(current.id)}>Remove</button></div>
          <p className="hint">{current.description}</p>
          <p className="hint">From {current.source}. {usage[current.id] ? `Fetched ${usage[current.id]!.claude}× by Claude agents and ${usage[current.id]!.agy}× by agy agents.` : 'Not fetched yet.'}</p>
          <pre className="lib-body">{current.body}</pre>
          {current.files.length > 0 && <p className="hint">Also holds: {current.files.join(', ')}</p>}
        </div>
      )}
      {draft && (
        <div className="lib-box" role="group" aria-label="Edit item">
          <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Item name" /></label>
          <label>One line: what it is for, and when an agent should use it<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Item description" /></label>
          <label>Text an agent reads<textarea rows={8} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} aria-label="Item text" /></label>
          <div className="su-row"><button className="primary" disabled={!draft.name.trim() || !draft.body.trim()} onClick={() => void saveDraft()}>Save</button><button onClick={() => setDraft(null)}>Cancel</button></div>
        </div>
      )}

      <legend className="lib-sub">Playbook</legend>
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
                    <h4>{GROUP_LABEL[m]}</h4>
                    {here.map(({ r, n }) => (
                      <div key={r.id} className="lib-rule">
                        <b title={byId.get(r.id)?.description}>{byId.get(r.id)?.name ?? `${r.id} (missing)`}</b>
                        <select aria-label={`Mode for ${r.id}`} value={r.mode} onChange={(e) => change(n, { mode: e.target.value as RuleMode })}>{MODES.map((x) => <option key={x} value={x}>{MODE_LABEL[x]}</option>)}</select>
                        <select aria-label={`Strength for ${r.id}`} value={r.strength} onChange={(e) => change(n, { strength: e.target.value as RuleStrength })}>{STRENGTHS.map((x) => <option key={x}>{x}</option>)}</select>
                        <button className="rm" aria-label={`Remove ${r.id} from the playbook`} title="Remove from this playbook" onClick={() => void saveRules(rules.filter((_, i) => i !== n))}><PixelIcon name="x" scale={1} /></button>
                        {r.mode === 'on-demand' && <input className="when" aria-label={`When to use ${r.id}`} value={r.when} placeholder="when does it apply?" onChange={(e) => change(n, { when: e.target.value })} />}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="lib-bar">
              <select aria-label="Item to add" value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Add an item…</option>
                {items.filter((i) => !rules.some((r) => r.id === i.id)).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.kind})</option>)}
              </select>
              <button disabled={!adding} onClick={() => (void saveRules([...rules, { id: adding, mode: 'on-demand', when: '', strength: 'soft' }]), setAdding(''))}>Add to playbook</button>
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
                <h4>Reminder each turn</h4>
                <p className="hint">{preview?.reminder || (who === 'claude' ? '(none: every rule is soft)' : '(agy has no per-turn reminder)')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <legend className="lib-sub">Reached for</legend>
      <LibraryReach byId={byId} whenOf={whenOf} onFix={(id, fix) => void fixRule(id, fix)} />
    </>
  )
}
