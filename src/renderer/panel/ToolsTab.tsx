import { useCallback, useEffect, useMemo, useState } from 'react'
import type { McpReport, Policy, ToolUsage } from '../../shared/mcp'
import { Bars, clean, Policy3 } from './McpBits'
import { foundTools, toolGroups, type ToolRow } from './mcpView'
import type { ProbeTool } from '../../shared/mcp'
import { skillView, type SkillView } from './libraryUsage'

const COLOUR = { claude: '#6ad0e0', agy: '#e07aa8', mcp: '#5f9e5f' }
const none: ToolUsage = { tools: {}, servers: {} }

/** Claude Code's and agy's own tools, and the tools of the servers seen in use: each one Allow, Ask or Deny for the agents the app runs. */
export function ToolsTab() {
  const [policy, setPolicy] = useState<McpReport['policy']>({})
  const [found, setFound] = useState<Record<string, ProbeTool[]>>({})
  const [usage, setUsage] = useState<ToolUsage>(none)
  const [find, setFind] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [fail, setFail] = useState('')
  // Which tools the list shows; null until picked, so it opens on those called.
  const [view, setView] = useState<SkillView | null>(null)
  const load = useCallback(async () => {
    try {
      const [r, u] = await Promise.all([window.aw.library.mcp(), window.aw.library.toolUsage()])
      setPolicy(r.policy)
      setFound(foundTools(r.servers, r.probes ?? {}))
      setUsage(u)
      setFail('')
    } catch (e) {
      setFail(clean(e))
    }
  }, [])
  useEffect(() => void load(), [load])
  const tell = (tool: string, p: Policy | null) =>
    void window.aw.library.setToolPolicy(tool, p).then(
      () => (setFail(''), setPolicy((cur) => { const next = { ...cur }; if (p) next[tool] = p; else delete next[tool]; return next })),
      (e: unknown) => setFail(clean(e))
    )
  const every = useMemo(() => toolGroups(policy, usage, find, found), [policy, usage, find, found])
  const all = every.flatMap((g) => g.rows)
  const current = all.find((r) => r.key === open)
  const told = Object.keys(policy).length
  const rows = useMemo(() => toolGroups(policy, usage, '', found).flatMap((g) => g.rows), [policy, usage, found])
  const called = rows.filter((r) => r.n > 0).length
  const shown = skillView(view, find, called)
  const groups = every.flatMap((g) => {
    const kept = g.rows.filter((r) => shown === 'all' || (shown === 'use' ? r.n > 0 : r.n === 0))
    return kept.length ? [{ ...g, rows: kept }] : []
  })
  const rules = told === 0 ? 'No rule set: every tool follows the agent’s permission mode.' : `${told} ${told === 1 ? 'tool has' : 'tools have'} a rule.`
  const VIEWS: [SkillView, string, number][] = [['use', 'Called in 30 days', called], ['rest', 'Not called', rows.length - called], ['all', 'All', rows.length]]
  return (
    <div role="tabpanel" id="lib-panel-tools" aria-labelledby="lib-tab-tools" className="lib-panel lib-panel-shelf">
      <div className="lib-col">
        <div className="lib-bar" role="group" aria-label="Tools">
          <input aria-label="Find a tool" placeholder="Find a tool…" value={find} onChange={(e) => setFind(e.target.value)} />
          <span className="lib-sp" />
          <button onClick={() => void load()}>Refresh</button>
        </div>
        <div className="lib-views" role="group" aria-label="Show" title={`${rules} The number on a row is its calls in 30 days.`}>
          {VIEWS.map(([id, label, n]) => <button key={id} className="ghost sm" aria-pressed={shown === id} onClick={() => (setView(id), setFind(''))}>{label} <b>{n}</b></button>)}
        </div>
        {fail && <p className="error" role="alert">{fail}</p>}
        <section className="drawer sk2" aria-label="Tools">
          <div className="sk2-list lib-scrollbar">
            {groups.map((g) => (
              <div key={g.key} className="sk2-pnl" role="group" aria-label={g.title}>
                <div className="sk2-grp"><b>{g.title}</b><span className="sk2-path">{g.path}</span><span className="sk2-tot">{g.rows.length}</span></div>
                {g.rows.map((r) => (
                  <div key={r.key} className={`sk2-row mt-row${open === r.key ? ' sel' : ''}`}>
                    <button className="mt-pick" aria-label={`Open ${r.name}`} aria-pressed={open === r.key} onClick={() => setOpen(r.key)}>
                      <span className="sk2-spine" style={{ background: COLOUR[r.owner] }} aria-hidden />
                      <span className="sk2-main"><b>{r.name}</b><small>{r.fact}</small></span>
                    </button>
                    <span className="mt-tail">
                      <span className="sk2-size">{r.n || '–'}</span>
                      <Policy3 value={r.policy} label={`${r.name} for the agents the app runs`} only={r.owner === 'agy' ? ['deny'] : undefined} onChange={(p) => tell(r.key, p)} />
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {groups.length === 0 && <p className="hint">Nothing matches.</p>}
          </div>
        </section>
      </div>
      <div className="lib-read">
        {current ? <ToolReader r={current} usage={usage} onTell={tell} /> : <div className="lib-box lib-pick"><p className="hint">Pick a tool to see what the app does when an agent calls it. {rules}</p></div>}
      </div>
    </div>
  )
}

function ToolReader({ r, usage, onTell }: { r: ToolRow; usage: ToolUsage; onTell: (tool: string, p: Policy | null) => void }) {
  const u = usage.tools[r.key]
  return (
    <div className="lip lip-page" role="group" aria-label={`${r.name} in detail`}>
      <div className="lip-top">
        <nav className="lip-crumb" aria-label="Where it is"><span>Tools</span><i aria-hidden>›</i><span>{r.group}</span><i aria-hidden>›</i><span>{r.name}</span></nav>
        <div className="lip-title"><h3>{r.name}</h3><small className="lib-kind">{r.owner === 'mcp' ? 'MCP tool' : 'built in'}</small></div>
        <p className="lip-desc">{r.fact}</p>
      </div>
      <div className="lip-details lib-scrollbar"><div className="lip-cols"><div className="sk2-over">
        {r.found && (
          <section>
            <h5>What the server says it is</h5>
            <p className="mt-says">{r.found.description || 'No description.'}</p>
            {r.found.params.length > 0 && <div>{r.found.params.map((p) => <span key={p.name} className="mt-par">{p.name}{p.required && <em>*</em>} <i>{p.type}</i></span>)}</div>}
            <p className="hint">{r.found.destructive ? 'It says it changes things.' : r.found.readOnly ? 'It says it only reads.' : 'It gives no hint about whether it changes things.'} * is required.</p>
          </section>
        )}
        <section>
          <h5>What the app does when an agent calls it</h5>
          <Policy3 value={r.policy} label={`${r.name} for the agents the app runs`} only={r.owner === 'agy' ? ['deny'] : undefined} onChange={(p) => onTell(r.key, p)} />
          <dl className="sk2-kv mt-legend">
            <div><dt>Allow</dt><dd>{r.owner === 'agy' ? 'agy decides: the app can only say no to its tools' : 'the agent runs it without asking'}</dd></div>
            <div><dt>Ask</dt><dd>{r.owner === 'agy' ? 'agy decides: the app can only say no to its tools' : 'the permission band appears in the chat'}</dd></div>
            <div><dt>Deny</dt><dd>the agent is told no and carries on</dd></div>
            <div><dt>No rule</dt><dd>the agent’s own permission mode decides, as it did before</dd></div>
          </dl>
        </section>
        <section>
          <h5>Calls in 30 days{u?.n ? ` · ${u.n}` : ''}</h5>
          <Bars rows={Object.entries(u?.projects ?? {}).sort((a, b) => b[1] - a[1])} />
        </section>
        <p className="hint lip-note">A rule applies to agents the app runs, from their next start. Your own settings files are not changed.</p>
      </div></div></div>
    </div>
  )
}
