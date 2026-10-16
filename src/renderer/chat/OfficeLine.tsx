import { useState } from 'react'
import type { PictureSet } from './gallery'
import { OutlineIcon } from '../panel/IconButton'
import { type OfficeGroup, type Stamp, stampOf, summaryOf, whisperOf } from './officeCalls'
import { STAMP_ICON } from './stampIcons'
import { ToolCard } from './ToolCard'

const MAX_STAMPS = 10

/** One office call as a small picture with a few words; the tip says the whole of it. */
function StampView({ stamp }: { stamp: Stamp }) {
  return (
    <span className={`stamp stamp-${stamp.kind} ${stamp.state}`} title={stamp.tip}>
      <OutlineIcon name={STAMP_ICON[stamp.kind]} size={14} />
      {stamp.label && <b>{stamp.label}</b>}
    </span>
  )
}

/**
 * The office's own calls (library skips and reads, todo changes, notes, the builder's workflow tools) as a short row of stamps, one picture for each. A click opens a line for each
 * call, and a click on one of those opens the same card as any tool call has. A call still running has a brass rim and a spinner; a failed call is not here at all, it is a card of its own.
 */
export function OfficeLine({ group, working, onImage }: { group: OfficeGroup; working: boolean; onImage: (src: string, set?: PictureSet) => void }) {
  const [open, setOpen] = useState(false)
  const [cards, setCards] = useState<ReadonlySet<string>>(new Set())
  const flip = (id: string) => setCards((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const parts = summaryOf(group.calls)
  const said = parts.map((p) => `${p.area} ${p.text}`).join(', ')
  const running = working && group.calls.some((c) => !c.run.result)
  const stamps = group.calls.map((c) => stampOf(c.run, working))
  return (
    <div className={`of ${open ? 'is-open' : ''}`}>
      <button className="of-head" aria-expanded={open} aria-label={`Office: ${said}`} onClick={() => setOpen(!open)}>
        <span className="of-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="strip">
          {stamps.slice(0, MAX_STAMPS).map((s, i) => <StampView key={i} stamp={s} />)}
          {stamps.length > MAX_STAMPS && <span className="more">+{stamps.length - MAX_STAMPS}</span>}
        </span>
        {running && <span className="su-spin of-spin" role="status" aria-label="Working" />}
      </button>
      {open && (
        <div className="of-list">
          {group.calls.map((c) => {
            const w = whisperOf(c.run)
            const st = stampOf(c.run)
            return (
              <div key={c.id} className={`of-item stamp-${st.kind} ${st.state}`}>
                <button className="of-row" aria-expanded={cards.has(c.id)} onClick={() => flip(c.id)}>
                  <span className="of-ic" aria-hidden="true"><OutlineIcon name={STAMP_ICON[st.kind]} size={14} /></span>
                  <span className="of-txt">
                    <b>{w.bold}</b>
                    {w.rest && <span> {w.rest}</span>}
                    {w.why && <span className="of-why"> · {w.why}</span>}
                  </span>
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
