import { useEffect, useMemo, useRef, useState } from 'react'
import type { LibraryItem } from '../../shared/library'
import { groupItems, originOf } from './addItemGroups'

/** The "Add an item…" popover: items grouped by where they came from, with a search over names, descriptions and publishers. */
export function AddItemMenu({ items, added, onAdd }: { items: LibraryItem[]; added: Set<string>; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [unfolded, setUnfolded] = useState<Set<string> | null>(null)
  const [on, setOn] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const groups = useMemo(() => groupItems(items, query), [items, query])
  // Until the person folds or opens one, the first two groups are open; a search opens every group that matches.
  const isOpen = (source: string, n: number) => !!query.trim() || (unfolded ? unfolded.has(source) : n < 2)
  const rows = groups.flatMap((g, n) => (isOpen(g.source, n) ? g.items.filter((i) => !added.has(i.id)) : []))
  const total = groups.reduce((n, g) => n + g.items.length, 0)

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  useEffect(() => setOn(0), [query])
  useEffect(() => { root.current?.querySelector('.am-it.on')?.scrollIntoView({ block: 'nearest' }) }, [on, open])

  const close = () => { setOpen(false); setQuery('') }
  const pick = (id: string) => { onAdd(id); close() }
  const toggle = (source: string, n: number) => {
    const now = new Set(unfolded ?? groups.filter((g, k) => k < 2).map((g) => g.source))
    if (isOpen(source, n)) now.delete(source); else now.add(source)
    setUnfolded(now)
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setOn((n) => Math.min(rows.length - 1, n + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOn((n) => Math.max(0, n - 1)) }
    else if (e.key === 'Enter' && rows[on]) { e.preventDefault(); pick(rows[on].id) }
  }
  const mark = (text: string) => {
    const w = query.trim().toLowerCase().split(/\s+/)[0] ?? ''
    const at = w ? text.toLowerCase().indexOf(w) : -1
    return at < 0 ? text : <>{text.slice(0, at)}<mark>{text.slice(at, at + w.length)}</mark>{text.slice(at + w.length)}</>
  }
  const current = rows[on]

  return (
    <div className="am" ref={root}>
      <button aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>Add an item… <span className="tag">▾</span></button>
      {open && (
        <div className="am-pop" role="dialog" aria-label="Add an item" onKeyDown={keys}>
          <div className="am-s">
            <span aria-hidden>⌕</span>
            <input ref={input} value={query} placeholder="Search skills, instructions, prompts…" aria-label="Search items" onChange={(e) => setQuery(e.target.value)} />
            <span className="tag" aria-live="polite">{total} of {items.length}</span>
          </div>
          <div className="am-body">
            {groups.length === 0 && <div className="am-empty">No item matches “{query}”.<br />Try a publisher name or a word from what it does.</div>}
            {groups.map((g, n) => {
              const shown = isOpen(g.source, n)
              return (
                <div key={g.source} className="am-g">
                  <button className="am-gh" aria-expanded={shown} onClick={() => toggle(g.source, n)}>
                    <span className="am-car" aria-hidden>{shown ? '▾' : '▸'}</span>{mark(g.label)} <span className={`tag am-${g.tone}`}>{g.chip}</span><span className="am-n">{g.items.length}</span>
                  </button>
                  {shown && g.items.map((i) => {
                    const here = added.has(i.id)
                    const idx = rows.indexOf(i)
                    return (
                      <button key={i.id} className={`am-it${here ? ' added' : ''}${idx === on && !here ? ' on' : ''}`} aria-label={`${i.name}${here ? ', already in the playbook' : ''}`} aria-disabled={here} onMouseEnter={() => idx >= 0 && setOn(idx)} onClick={() => !here && pick(i.id)}>
                        <span className="am-t"><b>{mark(i.name)}</b>{here && <span className="tag">in playbook</span>}<span className="tag am-k">{i.kind}</span></span>
                        <span className="am-d">{mark(i.description)}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <div className="am-foot"><span>↑↓ move</span><span>Enter add</span><span>Esc close</span>{current && <span className="am-full" title={current.description}>{originOf(current.source).label}: {current.description}</span>}</div>
        </div>
      )}
    </div>
  )
}
