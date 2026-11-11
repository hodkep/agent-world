import { useState } from 'react'
import { mcpKey, type ProbeTool, type ToolUsage } from '../../shared/mcp'

/** What a server listed: a row for each tool with its description and whether it reads or writes, and the open tool's whole description and parameters under the table. */
export function McpToolsTable({ server, tools, usage, connected }: { server: string; tools: ProbeTool[]; usage: ToolUsage; connected: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const seen = Object.entries(usage.tools).filter(([k]) => k.startsWith(`mcp__${mcpKey(server)}__`)).sort((a, b) => b[1].n - a[1].n)
  if (!connected && !tools.length) {
    return (
      <div className="sk2-over">
        <section>
          <h5>Tools</h5>
          <p className="hint">Press Connect to start this server and read the tools it offers, with their descriptions. Nothing is started until you do.</p>
          {seen.length > 0 && (
            <>
              <h5 style={{ marginTop: 18 }}>Seen in use</h5>
              <div className="sk2-used">{seen.map(([k, c]) => <div key={k} className="sk2-u"><span title={k}>{k.replace(`mcp__${mcpKey(server)}__`, '')}</span><i style={{ width: `${Math.max(6, Math.round((c.n / seen[0]![1].n) * 100))}%` }} aria-hidden /><b>{c.n}×</b></div>)}</div>
            </>
          )}
        </section>
      </div>
    )
  }
  const current = tools.find((t) => t.name === open)
  return (
    <div className="mt-tools">
      <table className="mt-tbl" aria-label={`Tools of ${server}`}>
        <tbody>
          {tools.map((t) => (
            <tr key={t.name} className={open === t.name ? 'sel' : ''} onClick={() => setOpen(t.name)}>
              <td className="n"><button aria-label={`Show ${t.name}`} aria-pressed={open === t.name} onClick={() => setOpen(t.name)}>{t.name}</button></td>
              <td className="d"><span className="mt-clamp">{t.description || <i>no description</i>}</span></td>
              <td className="b">{t.destructive ? <span className="mt-bd d">writes</span> : t.readOnly ? <span className="mt-bd r">read</span> : null}</td>
              <td className="c">{usage.tools[`mcp__${mcpKey(server)}__${mcpKey(t.name)}`]?.n ?? ''}</td>
            </tr>
          ))}
          {tools.length === 0 && <tr><td className="d"><i>This server lists no tools.</i></td></tr>}
        </tbody>
      </table>
      {current && (
        <div className="mt-detail" role="group" aria-label={`${current.name} in detail`}>
          <b>{current.name}</b>
          <p>{current.description || 'No description.'}</p>
          {current.params.length > 0 ? <div>{current.params.map((p) => <span key={p.name} className="mt-par">{p.name}{p.required && <em>*</em>} <i>{p.type}</i></span>)}</div> : <p className="hint">No parameters.</p>}
          <p className="hint">{current.destructive ? 'The server says it changes things.' : current.readOnly ? 'The server says it only reads.' : 'The server gives no hint about whether it changes things.'}{' '}* is required.</p>
        </div>
      )}
    </div>
  )
}
