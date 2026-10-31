import { OutlineIcon } from './IconButton'

/** What the rail shows of an agent: who it is, whether it is at work, and, from the tile marks, whether it needs you or has finished. */
export interface RailAgent {
  id: string
  name: string
  working: boolean
}

/** The slim strip left of the chat while the office is hidden: the way back to it, and a button for each agent so one can be opened without it. */
export function OfficeRail({ agents, selected, marks, onShow, onSelect }: { agents: RailAgent[]; selected: string | null; marks: Map<string, string>; onShow: () => void; onSelect: (id: string) => void }) {
  return (
    <nav className="office-rail" aria-label="Agents">
      <button className="rail-show" aria-label="Show the office" data-tip="Show the office" onClick={onShow}>
        <OutlineIcon name="office" size={16} />
      </button>
      {agents.map((a) => (
        <button key={a.id} className={`rail-agent ${a.working ? 'working' : ''}`} aria-label={a.name} aria-pressed={a.id === selected} title={a.name} onClick={() => onSelect(a.id)}>
          {a.name.charAt(0).toUpperCase()}
          {marks.has(a.id) && <span className={`wt-mark ${marks.get(a.id)}`} aria-hidden="true" />}
        </button>
      ))}
    </nav>
  )
}
