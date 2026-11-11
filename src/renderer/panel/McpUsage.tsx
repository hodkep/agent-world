import { useCallback, useEffect, useState } from 'react'
import type { McpReport, McpServer, ToolUsage } from '../../shared/mcp'
import { ago } from './addressHistory'
import { clean } from './McpBits'
import { byAgentCalls, byProjectCalls, ranked, rowState, totalDays, unusedServers } from './mcpView'
import { DayStrip, Heads } from './SkillBits'

const none: ToolUsage = { tools: {}, servers: {} }
const COLOUR: Record<McpServer['where'], string> = { office: '#f2c230', global: '#5f9e5f', project: '#6ad0e0', plugin: '#a4a2b8', 'agy-cli': '#e07aa8', 'agy-ide': '#a4a2b8' }
const colourOf = (name: string, servers: McpServer[]) => COLOUR[servers.find((s) => s.name === name)?.where ?? 'global']

/**
 * The Usage tab's servers and tools, laid out as the skills' are: the last 30 days by day, a ranking of what was called with who called it, what is gathering dust
 * with a way to turn it off, and, beside them, each project and each agent.
 */
export function McpUsage() {
  const [rep, setRep] = useState<McpReport | null>(null)
  const [usage, setUsage] = useState<ToolUsage>(none)
  const [fail, setFail] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      const [r, u] = await Promise.all([window.aw.library.mcp(), window.aw.library.toolUsage()])
      setRep(r)
      setUsage(u)
    } catch (e) {
      setFail(clean(e))
    }
  }, [])
  useEffect(() => void load(), [load])
  const turnOff = (names: string[]) => {
    setBusy(true)
    void Promise.all(names.map((n) => window.aw.library.setMcp(n, false))).then(() => load(), (e: unknown) => setFail(clean(e))).finally(() => setBusy(false))
  }
  const now = Date.now()
  const servers = rep?.servers ?? []
  const idle = rep ? unusedServers(rep.servers, rep.off, usage) : []
  const byServer = ranked(usage.servers)
  const byTool = ranked(usage.tools).slice(0, 10)
  const total = Object.values(usage.tools).reduce((n, c) => n + c.n, 0)
  const watched = servers.filter((s) => s.where === 'global' || s.where === 'project').length
  const where = byProjectCalls(usage)
  const crew = byAgentCalls(usage)
  const topServer = byServer[0]?.[1].n ?? 1
  const topTool = byTool[0]?.[1].n ?? 1
  return (
    <section className="sku" aria-label="MCP servers and tools in the last 30 days">
      <div className="sku-top">
        <b>Last 30 days</b>
        <span className="hint">{total} {total === 1 ? 'call' : 'calls'} · {byServer.length} of {watched || byServer.length} servers called</span>
        <span className="lib-sp" />
        <DayStrip days={totalDays(usage)} />
      </div>
      {fail && <p className="error" role="alert">{fail}</p>}
      <div className="sku-grid">
        <div className="sku-col">
          <div role="group" aria-label="MCP servers called">
            <h4>Servers most called</h4>
            {byServer.length === 0 && <p className="hint">{total === 0 ? 'No tool call has been noted yet. The count starts when an agent next calls a tool.' : 'No MCP server was called in the last 30 days.'}</p>}
            {byServer.map(([name, c], i) => (
              <div key={name} className={`sku-rank${i === 0 ? ' first' : ''}`}>
                <span className="sku-pos">#{i + 1}</span>
                <span className="sku-spine" style={{ background: colourOf(name, servers) }} aria-hidden />
                <span className="sku-who"><b>{name}</b><small><Heads who={Object.entries(c.agents).map(([id, a]) => ({ id, name: a.name }))} />last called {ago(c.last, now)} · {Object.keys(c.projects).length} {Object.keys(c.projects).length === 1 ? 'project' : 'projects'}</small></span>
                <span className="sku-bar" aria-hidden><i style={{ width: `${Math.max(4, Math.round((c.n / topServer) * 100))}%` }} /></span>
                <span className="sku-n" aria-label={`${name} called ${c.n} times`}>{c.n}×</span>
              </div>
            ))}
          </div>
          <div role="group" aria-label="Tools called">
            <h4>Tools most called</h4>
            {byTool.length === 0 && <p className="hint">No tool was called in the last 30 days.</p>}
            {byTool.map(([name, c], i) => (
              <div key={name} className={`sku-rank${i === 0 ? ' first' : ''}`}>
                <span className="sku-pos">#{i + 1}</span>
                <span className="sku-spine" style={{ background: name.startsWith('mcp__') ? colourOf(name.split('__')[1]!, servers) : '#6ad0e0' }} aria-hidden />
                <span className="sku-who"><b>{name.replace(/^mcp__(.+?)__/, '$1 · ')}</b><small><Heads who={Object.entries(c.agents).map(([id, a]) => ({ id, name: a.name }))} />last called {ago(c.last, now)}</small></span>
                <span className="sku-bar" aria-hidden><i style={{ width: `${Math.max(4, Math.round((c.n / topTool) * 100))}%` }} /></span>
                <span className="sku-n">{c.n}×</span>
              </div>
            ))}
          </div>
          <div role="group" aria-label="Not called in 30 days">
            <h4>Gathering dust · {idle.length}</h4>
            {idle.length === 0 && <p className="hint">{rep ? 'Every server on for Claude agents was called.' : 'Reading the servers…'}</p>}
            {idle.map((s) => (
              <div key={s.id} className="sku-rank dusty">
                <span className="sku-pos">—</span>
                <span className="sku-spine" style={{ background: colourOf(s.name, servers) }} aria-hidden />
                <span className="sku-who"><b>{s.name}</b><small>never called{s.fact ? ` · ${s.fact}` : ''}</small></span>
                <button disabled={busy || rowState(s, rep!.off) !== 'on'} onClick={() => turnOff([s.name])}>Turn off for Claude</button>
              </div>
            ))}
            {idle.length > 0 && (
              <div className="sku-dust">
                <span>Turn off {idle.length === 1 ? 'it' : `all ${idle.length}`} for Claude: each one adds its tool list to what an agent starts with. Each can be turned back on.</span>
                <button className="primary" disabled={busy} onClick={() => turnOff([...new Set(idle.map((s) => s.name))])}>Clear the dust</button>
              </div>
            )}
          </div>
        </div>
        <div className="sku-col sku-crew">
          <div role="group" aria-label="Used in each project">
            <h4>Used in each project</h4>
            {where.length === 0 && <p className="hint">No tool was called in a project in the last 30 days.</p>}
            {where.map((w) => (
              <div key={w.name} className="sku-ag"><b title={w.name}>{w.name}</b><span className="sku-ag-skills">{w.top.join(' · ')}</span><small>{w.n}×</small></div>
            ))}
          </div>
          <div role="group" aria-label="Who called what">
            <h4>Who called what</h4>
            {crew.length === 0 && <p className="hint">No agent called a tool in the last 30 days.</p>}
            {crew.map((a) => (
              <div key={a.id} className="sku-ag"><Heads who={[{ id: a.id, name: a.name }]} /><b>{a.name}</b><span className="sku-ag-skills">{a.top.join(' · ')}</span><small>{a.n}×</small></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
