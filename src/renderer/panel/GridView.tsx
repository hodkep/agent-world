import { useEffect, useState } from 'react'
import { modeInfo, cssColor } from '../../shared/modes'
import type { Activity, AgentRecord, AgentStats } from '../../shared/types'

export interface Tile {
  agent: AgentRecord
  activity: Activity
  detail?: string
  mode?: string
  stats?: AgentStats
  /** What is waiting on the user, if anything (already worded). */
  needs: string | null
}

/** Every agent at once: state, cost and the last lines of its terminal. A tile opens that agent. */
export function GridView({ tiles, selected, onOpen }: { tiles: Tile[]; selected: string | null; onOpen: (id: string) => void }) {
  const [lines, setLines] = useState<Record<string, string[]>>({})
  const key = tiles.map((t) => t.agent.id).join(',')
  useEffect(() => {
    if (!key) return
    let live = true
    const tick = () => void window.aw.peek(key.split(',')).then((l) => live && setLines(l))
    tick()
    const t = setInterval(tick, 2000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [key])
  return (
    <div className="grid-view" role="list" aria-label="All agents">
      {tiles.map((t) => (
        <button key={t.agent.id} role="listitem" className={`tile is-${t.activity} ${t.needs ? 'needs' : ''}`} aria-current={t.agent.id === selected} onClick={() => onOpen(t.agent.id)} aria-label={`${t.agent.name}, ${t.activity}${t.needs ? `, ${t.needs}` : ''}`}>
          <span className="tile-head">
            <span className="dot" aria-hidden="true" />
            <b>{t.agent.name}</b>
            {t.mode && t.mode !== 'default' && <span className="tile-mode" style={{ color: cssColor(modeInfo(t.mode).color) }}>{modeInfo(t.mode).label}</span>}
            <span className="tile-act">{t.activity}</span>
            {t.stats && <span className="tile-cost">${t.stats.costUsd.toFixed(2)}</span>}
          </span>
          <span className="tile-sub">
            {t.agent.branch ?? 'shared folder'}
            {t.detail ? ` · ${t.detail}` : ''}
          </span>
          <pre className="tile-screen">{(lines[t.agent.id] ?? []).join('\n') || (t.activity === 'asleep' ? 'asleep: open to wake' : '…')}</pre>
          {t.needs && <span className="tile-need">{t.needs}: open to answer</span>}
        </button>
      ))}
    </div>
  )
}
