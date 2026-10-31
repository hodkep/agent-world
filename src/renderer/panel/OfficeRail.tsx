import { useEffect, useRef, useState } from 'react'
import { OutlineIcon } from './IconButton'

/** What the rail shows of an agent: who it is, whether it is at work, and, from the tile marks, whether it needs you or has finished. */
export interface RailAgent {
  id: string
  name: string
  working: boolean
}

/** The strip left of the chat while the office is hidden: the way back to it, and each agent with its name and whether it is at work, so one can be opened without it. */
export function OfficeRail({ agents, selected, marks, slim, onSlim, officeKeys, onShow, onSelect }: { agents: RailAgent[]; selected: string | null; marks: Map<string, string>; /** Only the squares show, the names in tooltips. */ slim: boolean; onSlim: () => void; /** The keys that show the office, for its tooltip. */ officeKeys?: string; onShow: () => void; onSelect: (id: string) => void }) {
  // Folded, pointing at it (or a key on one of its buttons) opens the list over the page for as long as that lasts; a moment after it goes, it closes.
  const [peek, setPeek] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const open = () => (clearTimeout(timer.current), setPeek(true))
  const close = () => (clearTimeout(timer.current), (timer.current = setTimeout(() => setPeek(false), 300)))
  useEffect(() => () => clearTimeout(timer.current), [])
  const peeking = slim && peek
  return (
    <nav
      className={`office-rail ${slim ? 'slim' : ''} ${peeking ? 'peek' : ''}`}
      aria-label="Agents"
      onMouseEnter={() => slim && open()}
      onMouseLeave={() => slim && close()}
      onFocus={() => slim && open()}
      onBlur={(e) => slim && !e.currentTarget.contains(e.relatedTarget as Node | null) && close()}
    >
      <button className="rail-show" aria-label="Show the office" title={`Show the office${officeKeys ? ` (${officeKeys})` : ''}`} onClick={onShow}>
        <OutlineIcon name="office" size={16} />
        <span className="rail-name">Office</span>
      </button>
      <h6>Agents</h6>
      {agents.map((a) => (
        <button key={a.id} className={`rail-agent ${a.working ? 'working' : ''}`} aria-label={a.name} aria-pressed={a.id === selected} title={slim ? a.name : undefined} onClick={() => onSelect(a.id)}>
          <span className="rail-tile">
            {a.name.charAt(0).toUpperCase()}
            {marks.has(a.id) && <span className={`wt-mark ${marks.get(a.id)}`} aria-hidden="true" />}
          </span>
          <span className="rail-name">{a.name}</span>
          <small>{a.working ? 'working' : 'idle'}</small>
        </button>
      ))}
      <button className="rail-fold" aria-label={slim ? 'Open the list' : 'Fold the list'} aria-expanded={!slim} title={slim ? 'Open the list' : 'Fold the list'} onClick={onSlim}>
        <span className="rail-tile" aria-hidden="true">{slim ? '›' : '‹'}</span>
        <span className="rail-name">Fold</span>
      </button>
    </nav>
  )
}
