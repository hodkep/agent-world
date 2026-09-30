import { useEffect, useState } from 'react'
import type { ToolsInfo } from '../../shared/api'

const MARK = { ok: '●', attention: '▲', failed: '✕' } as const

/** What this agent's Claude can reach right now. Read-only: add or sign in to servers in the terminal with /mcp. */
export function ToolsView({ agentId }: { agentId: string }) {
  const [info, setInfo] = useState<ToolsInfo | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    setInfo(null)
    void window.aw.listTools(agentId).then(setInfo, () => setInfo({ mcp: [], plugins: [] }))
  }, [agentId, tick])
  return (
    <div className="tools">
      <div className="tools-head">
        <b>MCP servers</b>
        <button onClick={() => setTick((n) => n + 1)} disabled={!info} aria-label="Check again">
          ↻
        </button>
      </div>
      {!info ? <p className="hint">Checking each server…</p> : info.mcp.length === 0 ? <p className="hint">None configured.</p> : (
        <ul>
          {info.mcp.map((s) => (
            <li key={s.name} className={`health-${s.health}`}>
              <span className="mark" aria-hidden="true">{MARK[s.health]}</span>
              <span className="grow"><b>{s.name}</b> <span className="detail">{s.target}</span></span>
              <span className="status">{s.status}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="tools-head"><b>Plugins</b></div>
      {!info ? null : info.plugins.length === 0 ? <p className="hint">None installed.</p> : (
        <ul>
          {info.plugins.map((p) => (
            <li key={p.id} className={p.enabled ? 'health-ok' : 'health-off'}>
              <span className="mark" aria-hidden="true">{p.enabled ? '●' : '○'}</span>
              <span className="grow"><b>{p.id}</b> <span className="detail">{p.version}</span></span>
              <span className="status">{p.enabled ? 'enabled' : 'disabled'} · {p.scope}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
