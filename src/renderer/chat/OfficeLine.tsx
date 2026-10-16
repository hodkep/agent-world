import { useState } from 'react'
import type { PictureSet } from './gallery'
import { type OfficeGroup, summaryOf, whisperOf } from './officeCalls'
import { ToolCard } from './ToolCard'

/**
 * The office's own calls (library skips and reads, todo changes, notes) as one quiet line: what was done, counted. A click opens a line for each call, and a click on one of those
 * opens the same card as any tool call has. A call still running shows a spinner; a failed call is not here at all, it is a card of its own.
 */
export function OfficeLine({ group, working, onImage }: { group: OfficeGroup; working: boolean; onImage: (src: string, set?: PictureSet) => void }) {
  const [open, setOpen] = useState(false)
  const [cards, setCards] = useState<ReadonlySet<string>>(new Set())
  const flip = (id: string) => setCards((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const parts = summaryOf(group.calls)
  const running = working && group.calls.some((c) => !c.run.result)
  return (
    <div className={`of ${open ? 'is-open' : ''}`}>
      <button className="of-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="of-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="of-sum">
          {parts.map((p, i) => (
            <span key={p.area}>
              {i > 0 && <span className="of-sep"> · </span>}
              <b>{p.area}</b> {p.text}
            </span>
          ))}
        </span>
        {running && <span className="su-spin of-spin" role="status" aria-label="Working" />}
      </button>
      {open && (
        <div className="of-list">
          {group.calls.map((c) => {
            const w = whisperOf(c.run)
            return (
              <div key={c.id}>
                <button className={`of-row ${w.kind}`} aria-expanded={cards.has(c.id)} onClick={() => flip(c.id)}>
                  <span className="of-ic" aria-hidden="true">{w.icon}</span>
                  <b>{w.bold}</b>
                  {w.rest && <span>{w.rest}</span>}
                  {w.why && <span className="of-why">· {w.why}</span>}
                </button>
                {cards.has(c.id) && <div className="of-card"><ToolCard run={c.run} working={false} onImage={onImage} /></div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
