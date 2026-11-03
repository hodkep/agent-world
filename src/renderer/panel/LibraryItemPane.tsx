import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LibraryItem } from '../../shared/library'
import { Markdown } from '../chat/markdown'
import { PixelIcon, type IconName } from '../chat/PixelIcon'

const ICON: Record<LibraryItem['kind'], IconName> = { skill: 'book', instruction: 'flag', prompt: 'pencil' }
type Tab = 'where' | 'text' | 'files' | 'used'

/** The open item at the full height of the window: facts at the top, then tabs, the first being the item's own words, drawn as markdown in a viewer that says it scrolls. */
export function LibraryItemPane({ item, usage, where, stats, colour, onEdit, onRemove }: { item: LibraryItem; usage?: { claude: number; agy: number; total: number }; /** For a skill: the panel that says where it works. */ where?: ReactNode; /** For a skill: its use in the last 30 days, under the description. */ stats?: ReactNode; /** The item's spine colour, worn by its icon. */ colour?: string; onEdit: () => void; onRemove: () => void }) {
  const first: Tab = where ? 'where' : 'text'
  const [tab, setTab] = useState<Tab>(first)
  const scroller = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  // Why Open, Show in Finder or Copy did not work, said under the files.
  const [fail, setFail] = useState('')
  const act = (p: Promise<unknown>) => void p.then(() => setFail(''), (e: unknown) => setFail(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)))
  useEffect(() => (setTab(first), setFail('')), [item.id, first])
  const lines = item.body.split('\n').length
  const file = item.kind === 'skill' ? `${item.id}/SKILL.md` : `${item.id}.md`
  const check = () => {
    const el = scroller.current
    setMore(!!el && el.scrollHeight - el.scrollTop - el.clientHeight > 8)
  }
  useEffect(() => {
    if (tab !== 'text') return
    check()
    const el = scroller.current
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    if (el && ro) ro.observe(el)
    return () => ro?.disconnect()
  }, [tab, item.id, item.body])
  const TABS: [Tab, string][] = [...(where ? ([['where', 'Where it works']] as [Tab, string][]) : []), ['text', 'What an agent reads'], ['files', `Files${item.files.length ? ` (${item.files.length})` : ''}`], ['used', 'Used by']]
  const tid = (id: Tab) => `lip-tab-${id}`
  const pid = (id: Tab) => `lip-panel-${id}`
  // The tabs as one stop in the Tab order: the arrow keys, Home and End move between them, and the tab moved to is picked.
  const keys = (e: React.KeyboardEvent) => {
    const at = TABS.findIndex(([id]) => id === tab)
    const to = e.key === 'ArrowRight' ? (at + 1) % TABS.length : e.key === 'ArrowLeft' ? (at - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    const id = TABS[to]![0]
    setTab(id)
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus()
  }
  return (
    <div className="lip" role="group" aria-label={`${item.name} in detail`}>
      <div className="lip-top">
        <div className="lip-title"><span className="lip-ic" style={colour ? ({ '--sk': colour } as React.CSSProperties) : undefined}><PixelIcon name={ICON[item.kind]} scale={3} /></span><h3>{item.name}</h3><small className="lib-kind">{item.kind}</small><span className="lib-sp" /><button onClick={onEdit}>Edit</button><button className="bad-text" onClick={onRemove}>Remove</button></div>
        <p className="lip-desc">{item.description}</p>
        {stats}
      </div>
      <div className="lip-tabs" role="tablist" aria-label={`About ${item.name}`} onKeyDown={keys}>
        {TABS.map(([id, label]) => <button key={id} id={tid(id)} role="tab" aria-selected={tab === id} aria-controls={pid(id)} tabIndex={tab === id ? 0 : -1} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'where' && <div className="lip-tp" role="tabpanel" id={pid('where')} aria-labelledby={tid('where')}>{where}</div>}
      {tab === 'text' && (
        <div className="lip-view" role="tabpanel" id={pid('text')} aria-labelledby={tid('text')}>
          <div className="lip-bar"><PixelIcon name="book" scale={2} /><b>{file}</b><span>{lines} {lines === 1 ? 'line' : 'lines'} · about {item.tokens.body} tokens</span><span className="lib-sp" /><span>the item's own words</span></div>
          <div className="lip-scroll lib-scrollbar" ref={scroller} onScroll={check} tabIndex={0} aria-label="The item's text, scrolls">
            <Markdown text={item.body} />
          </div>
          {more && <div className="lip-more" aria-hidden="true"><span>↓ scroll for the rest</span></div>}
          <div className="lip-foot"><span>Read only. Edit to change it.</span></div>
        </div>
      )}
      {tab === 'files' && (
        <div className="lip-panel" role="tabpanel" id={pid('files')} aria-labelledby={tid('files')}>
          {item.files.length ? (() => {
            const sizes = item.fileTokens ?? {}
            const total = item.files.reduce((n, f) => n + (sizes[f] ?? 0), 0)
            return (
              <>
                <h5 className="lif-head">{item.files.length} {item.files.length === 1 ? 'file' : 'files'}{total ? ` · ≈${total} tokens if all are read` : ''}</h5>
                <ul className="lif-list">
                  {item.files.map((f) => {
                    const ext = (f.split('.').pop() ?? '').toLowerCase()
                    return (
                      <li key={f}>
                        <span className={`lif-ic lif-${ext}`} aria-hidden>{f.includes('.') ? ext.slice(0, 3).toUpperCase() : '—'}</span>
                        <span className="lif-n" title={f}>{f}</span>
                        {sizes[f] !== undefined && <small>≈{sizes[f]} tok</small>}
                        <button onClick={() => act(window.aw.library.file(item.id, f, 'open'))} aria-label={`Open ${f}`}>Open</button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )
          })() : <p className="hint">{item.kind === 'skill' ? 'This skill is one text; it has no other files.' : 'This item is one text.'}</p>}
          {item.dir && (
            <div className="lif-kept">
              <span>Kept at</span>
              <code title={item.dir}>{item.dir}</code>
              <button onClick={() => act(navigator.clipboard.writeText(item.dir))}>Copy</button>
              <button onClick={() => act(window.aw.library.file(item.id, null, 'show'))}>Show in Finder</button>
            </div>
          )}
          {fail && <p className="error" role="alert">{fail}</p>}
        </div>
      )}
      {tab === 'used' && (
        <div className="lip-panel" role="tabpanel" id={pid('used')} aria-labelledby={tid('used')}>
          <dl className="lip-facts">
            <div><dt>From</dt><dd>{item.source}</dd></div>
            <div><dt>Costs</dt><dd>about {item.tokens.body} tokens to read, {item.tokens.description} to list</dd></div>
            <div><dt>Read</dt><dd>{usage ? `${usage.total}× so far: ${usage.claude}× by Claude agents, ${usage.agy}× by agy agents` : 'Not fetched yet.'}</dd></div>
          </dl>
        </div>
      )}
    </div>
  )
}
