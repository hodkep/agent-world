import { useState, type ReactNode } from 'react'
import { cssColor, modeInfo } from '../../shared/modes'
import type { Activity, AgentRecord } from '../../shared/types'

export interface GridLayout {
  cols: number
  rows: number
  /** The agent in each cell, row by row; null is an empty cell. */
  cells: (string | null)[]
}

export const AGENT_DRAG = 'text/aw-agent'
const CELL_DRAG = 'text/aw-cell'

/** Same layout at a new size: what was in a cell stays in it while it still exists. */
export function resize(layout: GridLayout, cols: number, rows: number): GridLayout {
  const cells = Array.from({ length: cols * rows }, (_, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return col < layout.cols && row < layout.rows ? (layout.cells[row * layout.cols + col] ?? null) : null
  })
  return { cols, rows, cells }
}

/** Put an agent in a cell. If it is already in another cell the two swap, so nobody is shown twice. */
export function place(layout: GridLayout, cell: number, agentId: string): GridLayout {
  const cells = [...layout.cells]
  const from = cells.indexOf(agentId)
  if (from >= 0) cells[from] = cells[cell] ?? null
  cells[cell] = agentId
  return { ...layout, cells }
}

export function swap(layout: GridLayout, a: number, b: number): GridLayout {
  const cells = [...layout.cells]
  ;[cells[a], cells[b]] = [cells[b] ?? null, cells[a] ?? null]
  return { ...layout, cells }
}

/** Fill the empty cells with agents that are not shown yet, in list order. */
export function fill(layout: GridLayout, agentIds: string[]): GridLayout {
  const shown = new Set(layout.cells)
  const rest = agentIds.filter((id) => !shown.has(id))
  return { ...layout, cells: layout.cells.map((c) => c ?? rest.shift() ?? null) }
}

/** Conversations laid out side by side. Drag an agent from the list into a cell, or a cell's title onto another to swap. */
export function PaneGrid({
  layout,
  agents,
  activity,
  modeOf,
  onChange,
  onOpen,
  renderChat
}: {
  layout: GridLayout
  agents: AgentRecord[]
  activity: (id: string) => Activity
  modeOf: (id: string) => string | undefined
  onChange: (l: GridLayout) => void
  onOpen: (id: string) => void
  renderChat: (agent: AgentRecord) => ReactNode
}) {
  const [over, setOver] = useState<number | null>(null)
  const drop = (cell: number, e: React.DragEvent) => {
    e.preventDefault()
    setOver(null)
    const agent = e.dataTransfer.getData(AGENT_DRAG)
    const from = e.dataTransfer.getData(CELL_DRAG)
    if (agent && agents.some((a) => a.id === agent)) onChange(place(layout, cell, agent))
    else if (from !== '') onChange(swap(layout, Number(from), cell))
  }
  const hidden = agents.filter((a) => !layout.cells.includes(a.id))
  return (
    <div className="panes" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))` }}>
      {layout.cells.map((id, i) => {
        const agent = id ? agents.find((a) => a.id === id) : undefined
        return (
          <div
            key={i}
            className={`pane ${over === i ? 'over' : ''} ${agent ? '' : 'empty'}`}
            onDragOver={(e) => (e.preventDefault(), setOver(i))}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => drop(i, e)}
            aria-label={agent ? `${agent.name}'s conversation` : 'Empty cell'}
          >
            {agent ? (
              <>
                <div className="pane-head" draggable onDragStart={(e) => (e.dataTransfer.setData(CELL_DRAG, String(i)), (e.dataTransfer.effectAllowed = 'move'))} title="Drag onto another cell to swap">
                  <span className={`dot is-${activity(agent.id)}`} aria-hidden="true" />
                  <b>{agent.name}</b>
                  <span className="pane-act">{activity(agent.id)}</span>
                  {modeOf(agent.id) && modeOf(agent.id) !== 'default' && <span style={{ color: cssColor(modeInfo(modeOf(agent.id)).color) }}>{modeInfo(modeOf(agent.id)).label}</span>}
                  <button className="push" onClick={() => onOpen(agent.id)} aria-label={`Open ${agent.name} in the side panel`} title="Open in the side panel">
                    ↗
                  </button>
                  <button onClick={() => onChange({ ...layout, cells: layout.cells.map((c, k) => (k === i ? null : c)) })} aria-label={`Remove ${agent.name} from the grid`} title="Take out of the grid (the agent keeps working)">
                    ×
                  </button>
                </div>
                {renderChat(agent)}
              </>
            ) : (
              <div className="pane-empty">
                <span>Drag an agent here</span>
                {hidden.length > 0 && (
                  <select aria-label="Put an agent here" value="" onChange={(e) => e.target.value && onChange(place(layout, i, e.target.value))}>
                    <option value="">or pick one…</option>
                    {hidden.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
