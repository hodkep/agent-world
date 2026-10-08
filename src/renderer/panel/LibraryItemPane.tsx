import { useEffect, useRef, useState } from 'react'
import type { LibraryItem } from '../../shared/library'
import { Markdown } from '../chat/markdown'
import { PixelIcon, type IconName } from '../chat/PixelIcon'

const ICON: Record<LibraryItem['kind'], IconName> = { skill: 'book', instruction: 'flag', prompt: 'pencil' }
type Tab = 'text' | 'files' | 'used'

/** The open item at the full height of the window: facts at the top, then tabs, the first being the item's own words, drawn as markdown in a viewer that says it scrolls. */
export function LibraryItemPane({ item, usage, onEdit, onRemove }: { item: LibraryItem; usage?: { claude: number; agy: number; total: number }; onEdit: () => void; onRemove: () => void }) {
  const [tab, setTab] = useState<Tab>('text')
  const scroller = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  useEffect(() => setTab('text'), [item.id])
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
  const TABS: [Tab, string][] = [['text', 'What an agent reads'], ['files', `Files${item.files.length ? ` (${item.files.length})` : ''}`], ['used', 'Used by']]
  return (
    <div className="lip" role="group" aria-label={`${item.name} in detail`}>
      <div className="lip-top">
        <div className="lip-title"><PixelIcon name={ICON[item.kind]} scale={3} /><h3>{item.name}</h3><small className="lib-kind">{item.kind}</small><span className="lib-sp" /><button onClick={onEdit}>Edit</button><button className="bad-text" onClick={onRemove}>Remove</button></div>
        <p className="lip-desc">{item.description}</p>
      </div>
      <div className="lip-tabs" role="tablist" aria-label={`About ${item.name}`}>
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'text' && (
        <div className="lip-view" role="tabpanel" aria-label="What an agent reads">
          <div className="lip-bar"><PixelIcon name="book" scale={2} /><b>{file}</b><span>{lines} {lines === 1 ? 'line' : 'lines'} · about {item.tokens.body} tokens</span><span className="lib-sp" /><span>the item's own words</span></div>
          <div className="lip-scroll lib-scrollbar" ref={scroller} onScroll={check} tabIndex={0} aria-label="The item's text, scrolls">
            <Markdown text={item.body} />
          </div>
          {more && <div className="lip-more" aria-hidden="true"><span>↓ scroll for the rest</span></div>}
          <div className="lip-foot"><span>Read only. Edit to change it.</span></div>
        </div>
      )}
      {tab === 'files' && (
        <div className="lip-panel" role="tabpanel" aria-label="Files">
          {item.files.length ? <ul className="lip-files">{item.files.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="hint">{item.kind === 'skill' ? 'This skill is one text; it has no other files.' : 'This item is one text.'}</p>}
          {item.dir && <p className="hint">Kept at <code>{item.dir}</code></p>}
        </div>
      )}
      {tab === 'used' && (
        <div className="lip-panel" role="tabpanel" aria-label="Used by">
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
