import { type ReactNode, useRef, useState } from 'react'
import { cssColor, modeInfo } from '../../shared/modes'
import type { Activity, AgentRecord } from '../../shared/types'
import { TerminalView } from './TerminalView'
import { type Node, type Zone, addAll, isTerm, keepOnly, place, rectsOf, remove, resizeAt, splitsOf, tilesOf } from './tiling'

export { isTerm, readLayout, TERM } from './tiling'

/** What is open in the grid: a tiling of agents' conversations and shells in the project folder. */
export interface GridLayout {
  root: Node | null
}

export const AGENT_DRAG = 'text/aw-agent'
const PANE_DRAG = 'text/aw-pane'
const NEW_TERMINAL_DRAG = 'text/aw-new-terminal'
/** How close to an edge a drop counts as "on that edge" rather than "on the tile". */
const EDGE = 0.28
const GAP = 4

/** A tile or an agent being dragged around the grid, as opposed to files dragged in from outside (a chat takes those itself). */
const ours = (e: React.DragEvent) => [PANE_DRAG, AGENT_DRAG, NEW_TERMINAL_DRAG].some((t) => e.dataTransfer.types.includes(t))

const zoneAt = (box: DOMRect, x: number, y: number): Zone => {
  const fx = (x - box.left) / box.width
  const fy = (y - box.top) / box.height
  const near = Math.min(fx, 1 - fx, fy, 1 - fy)
  if (near > EDGE) return 'center'
  if (near === fx) return 'left'
  if (near === 1 - fx) return 'right'
  return near === fy ? 'top' : 'bottom'
}

export interface TerminalDrop {
  target: string
  zone: Zone
}

/**
 * The grid: a list on the left to drag from, and the tiles filling the rest. Drop a tile on the edge of another to put it
 * there, on its middle to swap; drag the gap between two tiles to resize both.
 */
export function PaneGrid({
  layout,
  agents,
  activity,
  modeOf,
  onChange,
  onOpen,
  renderChat,
  folderName,
  onNewTerminal
}: {
  layout: GridLayout
  agents: AgentRecord[]
  activity: (id: string) => Activity
  modeOf: (id: string) => string | undefined
  onChange: (l: GridLayout) => void
  onOpen: (id: string) => void
  renderChat: (agent: AgentRecord) => ReactNode
  /** The project the terminals are open in. */
  folderName: string
  /** Open a shell in the project folder and add it (beside a tile, or wherever it fits). */
  onNewTerminal: (drop?: TerminalDrop) => void
}) {
  const area = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState<{ id: string; zone: Zone } | null>(null)
  // Agents that have gone (removed, or in another folder) leave their tiles behind quietly.
  const root = keepOnly(layout.root, (id) => isTerm(id) || agents.some((a) => a.id === id))
  const tiles = tilesOf(root)
  const change = (r: Node | null) => onChange({ root: r })

  const drop = (target: string | null, zone: Zone, e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(null)
    const agent = e.dataTransfer.getData(AGENT_DRAG)
    const moved = e.dataTransfer.getData(PANE_DRAG)
    const tile = moved && tiles.includes(moved) ? moved : agent && agents.some((a) => a.id === agent) ? agent : ''
    if (e.dataTransfer.getData(NEW_TERMINAL_DRAG)) return onNewTerminal(target ? { target, zone } : undefined)
    if (tile) change(target ? place(root, tile, target, zone) : addAll(root, [tile]))
  }

  // Dragging a gutter moves the dividing line, so both tiles beside it change size.
  const dragGutter = (path: number[], dir: 'row' | 'col', rect: { x: number; y: number; w: number; h: number }, e: React.PointerEvent) => {
    e.preventDefault()
    const box = area.current!.getBoundingClientRect()
    const move = (m: PointerEvent) => {
      const at = dir === 'row' ? (m.clientX - box.left - rect.x * box.width) / (rect.w * box.width) : (m.clientY - box.top - rect.y * box.height) / (rect.h * box.height)
      change(resizeAt(root, path, at))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const listed = new Set(tiles)
  return (
    <div className="pane-area">
      <div className="pane-side" role="complementary" aria-label="Agents and terminals to add">
        <button
          className="side-item side-terminal"
          draggable
          onDragStart={(e) => (e.dataTransfer.setData(NEW_TERMINAL_DRAG, '1'), (e.dataTransfer.effectAllowed = 'copy'))}
          onClick={() => onNewTerminal()}
          title={`A terminal in ${folderName}: click to add, or drag it into the grid`}
        >
          <span className="pane-term" aria-hidden="true">
            &gt;_
          </span>
          <span className="side-name">Terminal</span>
          <span className="side-meta">{folderName}</span>
        </button>
        <div className="side-label">Agents</div>
        {agents.map((a) => (
          <button
            key={a.id}
            className={`side-item ${listed.has(a.id) ? 'in-grid' : ''}`}
            draggable
            onDragStart={(e) => (e.dataTransfer.setData(AGENT_DRAG, a.id), (e.dataTransfer.effectAllowed = 'copyMove'))}
            onClick={() => (listed.has(a.id) ? document.querySelector<HTMLElement>(`.pane[data-pane="${CSS.escape(a.id)}"]`)?.scrollIntoView({ block: 'nearest' }) : change(addAll(root, [a.id])))}
            title={listed.has(a.id) ? `${a.name} is in the grid` : `Add ${a.name} to the grid, or drag it in`}
            aria-pressed={listed.has(a.id)}
          >
            <span className={`dot is-${activity(a.id)}`} aria-hidden="true" />
            <span className="side-name">{a.name}</span>
            <span className="side-meta">{listed.has(a.id) ? 'in grid' : activity(a.id)}</span>
          </button>
        ))}
      </div>
      <div className="panes" ref={area} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(null, 'center', e)}>
        {tiles.length === 0 && (
          <div className="pane-hint">
            <b>Drag an agent or a terminal here</b>
            <span>or click one in the list on the left. Drop one on the edge of another to put it beside it, and drag the gap between two to resize them.</span>
          </div>
        )}
        {rectsOf(root).map(({ tile: id, rect }) => {
          const agent = isTerm(id) ? undefined : agents.find((a) => a.id === id)
          const drag = (e: React.DragEvent) => (e.dataTransfer.setData(PANE_DRAG, id), (e.dataTransfer.effectAllowed = 'move'))
          const mark = over?.id === id ? over.zone : null
          const style = { left: `calc(${rect.x * 100}% + ${GAP}px)`, top: `calc(${rect.y * 100}% + ${GAP}px)`, width: `calc(${rect.w * 100}% - ${GAP * 2}px)`, height: `calc(${rect.h * 100}% - ${GAP * 2}px)` }
          return (
            <div
              key={id}
              data-pane={id}
              style={style}
              className={`pane ${mark ? 'dropping' : ''}`}
              // Captured, so the chat's own drop target (for attached files) never swallows a tile dropped over it.
              onDragOverCapture={(e) => {
                if (!ours(e)) return
                e.preventDefault()
                e.stopPropagation()
                const zone = zoneAt(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)
                setOver((o) => (o?.id === id && o.zone === zone ? o : { id, zone }))
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as globalThis.Node | null) && setOver((o) => (o?.id === id ? null : o))}
              onDropCapture={(e) => ours(e) && drop(id, zoneAt(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY), e)}
              aria-label={agent ? `${agent.name}'s conversation` : `Terminal in ${folderName}`}
            >
              {mark && <span className={`drop-zone zone-${mark}`} aria-hidden="true" />}
              {isTerm(id) ? (
                <>
                  <div className="pane-head" draggable onDragStart={drag} title="Drag onto the edge of another tile to put it there, or onto its middle to swap">
                    <span className="pane-term" aria-hidden="true">
                      &gt;_
                    </span>
                    <b>terminal</b>
                    <span className="pane-act">{folderName}</span>
                    <button className="push" onClick={() => change(remove(root, id))} aria-label={`Close the terminal in ${folderName}`} title="Close this terminal">
                      ×
                    </button>
                  </div>
                  <TerminalView ptyId={id} visible focusTick={0} />
                </>
              ) : agent ? (
                <>
                  <div className="pane-head" draggable onDragStart={drag} title="Drag onto the edge of another tile to put it there, or onto its middle to swap">
                    <span className={`dot is-${activity(agent.id)}`} aria-hidden="true" />
                    <b>{agent.name}</b>
                    <span className="pane-act">{activity(agent.id)}</span>
                    {modeOf(agent.id) && modeOf(agent.id) !== 'default' && <span style={{ color: cssColor(modeInfo(modeOf(agent.id)).color) }}>{modeInfo(modeOf(agent.id)).label}</span>}
                    <button className="push" onClick={() => onOpen(agent.id)} aria-label={`Open ${agent.name} in the side panel`} title="Open in the side panel">
                      ↗
                    </button>
                    <button onClick={() => change(remove(root, id))} aria-label={`Remove ${agent.name} from the grid`} title="Take out of the grid (the agent keeps working)">
                      ×
                    </button>
                  </div>
                  {renderChat(agent)}
                </>
              ) : null}
            </div>
          )
        })}
        {splitsOf(root).map(({ path, dir, rect, at }) => {
          const style =
            dir === 'row'
              ? { left: `calc(${(rect.x + rect.w * at) * 100}% - 5px)`, top: `calc(${rect.y * 100}% + ${GAP}px)`, width: 10, height: `calc(${rect.h * 100}% - ${GAP * 2}px)` }
              : { top: `calc(${(rect.y + rect.h * at) * 100}% - 5px)`, left: `calc(${rect.x * 100}% + ${GAP}px)`, height: 10, width: `calc(${rect.w * 100}% - ${GAP * 2}px)` }
          return <div key={path.join('.')} className={`gutter gutter-${dir}`} role="separator" aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'} aria-label="Resize the tiles on either side" style={style} onPointerDown={(e) => dragGutter(path, dir, rect, e)} />
        })}
      </div>
    </div>
  )
}
