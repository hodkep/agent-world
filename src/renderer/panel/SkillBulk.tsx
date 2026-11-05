import { useMemo, useRef, useState } from 'react'
import type { LibraryCandidate, LibraryItem } from '../../shared/library'
import { sizeText } from '../../shared/size'
import { importable, shelfGroups } from './skillGroups'
import { spineLook } from './libraryShelf'
import { Callout } from './Callout'

type Mode = 'add' | 'remove'
/** What an action says about itself, for the callout by its button. */
export interface Said { text: string; bad?: boolean }
interface Row { key: string; name: string; meta: string; size?: string }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * One screen for one job, over the list: Add (what was found on this computer that the library does not hold, each skill once, added as links) or Remove (what the library holds: a link
 * is only unlinked, a copy is deleted from the library, and what that frees is said before it is asked). A skill's name opens it in the reader; its box ticks it. What an action did is said
 * in a callout over its button, which goes by itself.
 */
export function SkillBulk({ mode, items, found, open, onOpen, onBack, onAdd, onRemove }: { mode: Mode; items: LibraryItem[]; found: LibraryCandidate[]; open: string | null; onOpen: (key: string) => void; onBack: () => void; onAdd: (dirs: string[]) => Promise<Said>; onRemove: (ids: string[]) => Promise<Said> }) {
  const [find, setFind] = useState('')
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ at: DOMRect; say: Said } | null>(null)
  const action = useRef<HTMLButtonElement>(null)
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const rows: Row[] = useMemo(() => {
    if (mode === 'add') return importable(items, found, find).map((r) => ({ key: r.candidate.dir, name: r.name, meta: [r.candidate.source, ...(r.also.length ? [`also ${r.also.join(', ')}`] : [])].join(' · ') }))
    return shelfGroups(items, [], find).flatMap((g) => g.rows).map((r) => ({ key: r.key, name: r.name, meta: `${byId.get(r.key)?.place ? 'link' : 'copy'} · ${r.fact}`, ...(r.bytes !== undefined && { size: sizeText(r.bytes) }) }))
  }, [mode, items, found, find, byId])

  const picked = rows.filter((r) => ticked.has(r.key))
  const flip = (key: string, on: boolean) => (setSure(false), setTicked((t) => { const n = new Set(t); if (on) n.add(key); else n.delete(key); return n }))
  const all = rows.length > 0 && picked.length === rows.length

  const links = picked.filter((r) => byId.get(r.key)?.place).length
  const copies = picked.length - links
  const freed = picked.reduce((n, r) => n + (byId.get(r.key)?.place ? 0 : (byId.get(r.key)?.size?.bytes ?? 0)), 0)
  const effect = [links ? `${plural(links, 'link is', 'links are')} unlinked, ${links === 1 ? 'its folder stays' : 'their folders stay'}` : '', copies ? `${plural(copies, 'copy is', 'copies are')} deleted from the library${freed ? ` (frees ${sizeText(freed)})` : ''}` : ''].filter(Boolean).join('. ')

  const go = async () => {
    const at = action.current?.getBoundingClientRect()
    setBusy(true)
    let say: Said
    try {
      say = mode === 'add' ? await onAdd(picked.map((r) => r.key)) : await onRemove(picked.map((r) => r.key))
    } catch (e) {
      say = { text: e instanceof Error ? e.message : String(e), bad: true }
    }
    setBusy(false)
    setTicked(new Set())
    setSure(false)
    if (at) setSaid({ at, say })
  }

  return (
    <section className="drawer sk2 skb" aria-label="Skills in bulk">
      <div className="skb-head">
        <button className="ghost" onClick={onBack}>← Back to skills</button>
        <h3>{mode === 'add' ? 'Import skills from device' : 'Remove skills'}</h3>
        <span className="hint">{mode === 'add' ? 'Only skills the library does not hold yet · added as links' : 'What the library holds now'}</span>
      </div>
      <div className="skb-bar">
        <label className="skb-all"><input type="checkbox" aria-label="Select all" checked={all} disabled={rows.length === 0} onChange={(e) => (setSure(false), setTicked(e.target.checked ? new Set(rows.map((r) => r.key)) : new Set()))} /> Select all ({rows.length})</label>
        <input aria-label="Find" placeholder="Find…" value={find} onChange={(e) => setFind(e.target.value)} />
        <span className="lib-sp" />
        <span className="hint">{picked.length} selected</span>
      </div>
      <div className="skb-list lib-scrollbar">
        {rows.length === 0 && <p className="hint">{mode === 'add' ? 'Nothing new on this computer: everything found is in the library already.' : 'Nothing matches.'}</p>}
        {rows.map((r) => (
          <div key={r.key} className={`skb-row${ticked.has(r.key) ? ' sel' : ''}${open === r.key ? ' open' : ''}`}>
            <input type="checkbox" aria-label={`Select ${r.name}`} checked={ticked.has(r.key)} onChange={(e) => flip(r.key, e.target.checked)} />
            <button className="skb-open" aria-label={`Open ${r.name}`} aria-pressed={open === r.key} onClick={() => onOpen(r.key)}>
              <span className="sk2-spine" style={{ background: spineLook({ name: r.name, tokens: { description: 0, body: 0 } }, true).colour }} aria-hidden />
              <span className="sk2-main"><b>{r.name}</b><small>{r.meta}</small></span>
              {r.size && <span className="sk2-size">{r.size}</span>}
            </button>
          </div>
        ))}
      </div>
      <div className="skb-act">
        {mode === 'add' ? (
          <button ref={action} className="primary" disabled={picked.length === 0 || busy} onClick={() => void go()}>Add {picked.length}{picked.length === 1 ? ' as a link' : ' as links'}</button>
        ) : sure ? (
          <button ref={action} className="danger" disabled={busy} onClick={() => void go()}>Yes, remove {picked.length}</button>
        ) : (
          <button ref={action} className="danger" disabled={picked.length === 0 || busy} onClick={() => setSure(true)}>Remove {picked.length}</button>
        )}
        <button onClick={() => (sure ? setSure(false) : onBack())}>{sure ? 'No' : 'Close'}</button>
        <span className="hint">{mode === 'add' ? 'Skills the library holds already, as a link or a copy, are not listed. A skill found in two places is one row.' : picked.length ? `${effect}.` : 'Tick the skills to remove.'}</span>
      </div>
      {said && <Callout at={said.at} tone={said.say.bad ? 'bad' : 'ok'} seconds={said.say.bad ? 6 : 3} onClose={() => setSaid(null)}>{said.say.text}</Callout>}
    </section>
  )
}
