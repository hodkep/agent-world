import { toast } from '../toasts'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LibraryItem } from '../../shared/library'
import { Markdown } from '../chat/markdown'
import { PixelIcon, type IconName } from '../chat/PixelIcon'
import { fileGroups } from './skillFiles'

const ICON: Record<LibraryItem['kind'], IconName> = { skill: 'book', instruction: 'flag', prompt: 'pencil' }

/** The open item as a page: where it came from and its name at the top, then two tabs: its details (its use, where it works, its files) and its own words. */
export function LibraryItemPane({ item, usage, where, footer, stats, colour, logo, onEdit, onRemove }: { item: LibraryItem; usage?: { claude: number; agy: number; total: number }; /** For a skill: its overview on the Details tab (where it works, where it is used, where it lives). */ where?: ReactNode; /** For a skill: the actions under it (Remove, Delete), in place of the Remove button at the top. */ footer?: ReactNode; /** For a skill: its use in the last 30 days, first on the Details tab. */ stats?: ReactNode; /** The item's spine colour, worn by its icon. */ colour?: string; /** The skill's logo, shown in place of its icon. */ logo?: string; onEdit: () => void; onRemove: () => void }) {
  const [tab, setTab] = useState<'details' | 'text'>('details')
  useEffect(() => setTab('details'), [item.id])
  const scroller = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  // Why Open, Show in Finder or Copy did not work, said under the files.
  const act = (p: Promise<unknown>) => void p.catch(toast)
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
  const sizes = item.fileTokens ?? {}
  const total = item.files.reduce((n, f) => n + (sizes[f] ?? 0), 0)
  const groups = fileGroups(item.files, sizes)
  const TABS: ['details' | 'text', string][] = [['details', 'Details'], ['text', item.kind === 'skill' ? 'Skill content' : 'Content']]
  // The tabs are one stop in the Tab order: the arrow keys, Home and End move between them, and the tab moved to is picked.
  const keys = (e: React.KeyboardEvent) => {
    const at = TABS.findIndex(([id]) => id === tab)
    const to = e.key === 'ArrowRight' ? (at + 1) % TABS.length : e.key === 'ArrowLeft' ? (at - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    setTab(TABS[to]![0])
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus()
  }
  const row = (f: { path: string; name: string; tokens?: number }) => {
    const ext = f.path.includes('.') ? (f.path.split('.').pop() ?? '').toLowerCase() : ''
    return (
      <li key={f.path}>
        <span className={`lif-ic lif-${ext}`} aria-hidden>{ext ? ext.slice(0, 3).toUpperCase() : '—'}</span>
        <span className="lif-n" title={f.path}>{f.name}</span>
        {f.tokens !== undefined && <small>≈{f.tokens.toLocaleString()} tok</small>}
        <button className="ghost sm" onClick={() => act(window.aw.library.file(item.id, f.path, 'open'))} aria-label={`Open ${f.path}`}>Open</button>
      </li>
    )
  }
  return (
    <div className="lip lip-page" role="group" aria-label={`${item.name} in detail`}>
      <div className="lip-top">
        <nav className="lip-crumb" aria-label="Where it is"><span>{item.kind === 'skill' ? 'Skills' : item.kind === 'instruction' ? 'Instructions' : 'Prompts'}</span><i aria-hidden>›</i><span>{item.source}</span><i aria-hidden>›</i><span>{item.name}</span></nav>
        <div className="lip-title">{logo ? <img className="lip-logo" src={logo} alt="" style={colour ? ({ '--c': colour } as React.CSSProperties) : undefined} /> : <span className="lip-ic" style={colour ? ({ '--sk': colour } as React.CSSProperties) : undefined}><PixelIcon name={ICON[item.kind]} scale={3} /></span>}<h3>{item.name}</h3><small className="lib-kind">{item.kind}</small><span className="lib-sp" /><button onClick={onEdit}>Edit</button>{!footer && item.kind !== 'skill' && <button className="bad-text" onClick={onRemove}>Remove</button>}</div>
        <p className="lip-desc">{item.description}</p>
      </div>
      <div className="lip-tabs" role="tablist" aria-label={`About ${item.name}`} onKeyDown={keys}>
        {TABS.map(([id, label]) => <button key={id} id={`lip-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`lip-panel-${id}`} tabIndex={tab === id ? 0 : -1} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'details' && (
        <div className="lip-details lib-scrollbar" role="tabpanel" id="lip-panel-details" aria-labelledby="lip-tab-details">
          <div className="lip-cols">
          {stats}
          {where}
          {!where && (
            <section className="lip-box">
              <h5>About it</h5>
              <dl className="lip-facts">
                <div><dt>From</dt><dd>{item.source}</dd></div>
                <div><dt>Costs</dt><dd>about {item.tokens.body} tokens to read, {item.tokens.description} to list</dd></div>
                <div><dt>Read</dt><dd>{usage ? `${usage.total}× so far: ${usage.claude}× by Claude agents, ${usage.agy}× by agy agents` : 'Not fetched yet.'}</dd></div>
              </dl>
            </section>
          )}
          <section className="lip-box lip-files">
            <h5>Files{item.files.length ? ` · ${item.files.length}` : ''}{total ? ` · ≈${total.toLocaleString()} tok if all are read` : ''}</h5>
            {item.files.length ? groups.map((g) => g.folder === '' ? (
              <ul key="" className="lif-list">{g.files.map(row)}</ul>
            ) : (
              <details key={g.folder} className="lif-dir" open={groups.length === 1}>
                <summary><b>{g.folder}/</b><span>{g.files.length} {g.files.length === 1 ? 'file' : 'files'}{g.tokens ? ` · ≈${g.tokens.toLocaleString()} tok` : ''}</span></summary>
                <ul className="lif-list">{g.files.map(row)}</ul>
              </details>
            )) : <p className="hint">{item.kind === 'skill' ? 'This skill is one text; it has no other files.' : 'This item is one text.'}</p>}
            {item.dir && !where && (
              <div className="lif-kept">
                <span>Kept at</span>
                <code title={item.dir}>{item.dir}</code>
                <button className="ghost sm" onClick={() => act(navigator.clipboard.writeText(item.dir))}>Copy</button>
                <button className="ghost sm" onClick={() => act(window.aw.library.file(item.id, null, 'show'))}>Show in Finder</button>
              </div>
            )}
          </section>
          {footer}
          </div>
        </div>
      )}
      {tab === 'text' && (
        <div className="lip-textp lip-view" role="tabpanel" id="lip-panel-text" aria-labelledby="lip-tab-text">
          <div className="lip-bar"><PixelIcon name="book" scale={2} /><b>{file}</b><span title="Read only. Edit to change it.">{lines} {lines === 1 ? 'line' : 'lines'} · about {item.tokens.body} tokens</span></div>
          <div className="lip-scroll lib-scrollbar" ref={scroller} onScroll={check} tabIndex={0} aria-label="The item's text, scrolls">
            <Markdown text={item.body} />
          </div>
          {more && <div className="lip-more" aria-hidden="true"><span>↓ scroll for the rest</span></div>}
        </div>
      )}
    </div>
  )
}
