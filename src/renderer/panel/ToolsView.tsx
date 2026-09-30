import { useEffect, useState } from 'react'
import type { ToolsInfo } from '../../shared/api'
import type { ManageAction } from '../../shared/types'

/** What this agent's Claude can reach right now, with add, remove and enable/disable. Signing in to a server still happens in the terminal with /mcp. */
export function ToolsView({ agentId }: { agentId: string }) {
  const [info, setInfo] = useState<ToolsInfo | null>(null)
  const [tick, setTick] = useState(0)
  const [sure, setSure] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null)
  // Runs a change through Claude's own CLI, then re-reads the lists so the screen shows what is really configured.
  const run = async (action: ManageAction) => {
    setBusy(true)
    setSure(null)
    try {
      await window.aw.manageTools(agentId, action)
      setNote({ text: 'Done.', bad: false })
      setAdding(false)
    } catch (e) {
      setNote({ text: (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), bad: true })
    } finally {
      setBusy(false)
      setTick((n) => n + 1)
    }
  }
  const confirm = (key: string, action: ManageAction, label: string) =>
    sure === key ? (
      <button className="danger" disabled={busy} onClick={() => void run(action)} onBlur={() => setSure(null)} autoFocus>
        Sure?
      </button>
    ) : (
      <button disabled={busy} onClick={() => setSure(key)}>
        {label}
      </button>
    )
  useEffect(() => {
    setInfo(null)
    void window.aw.listTools(agentId).then(setInfo, () => setInfo({ mcp: [], plugins: [] }))
  }, [agentId, tick])
  return (
    <div className="tools">
      <div className="tools-head">
        <b>MCP servers</b>
        <button onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          Add server
        </button>
        <button onClick={() => setTick((n) => n + 1)} disabled={!info} aria-label="Check again">
          ↻
        </button>
      </div>
      {adding && <AddServer busy={busy} onAdd={(a) => void run(a)} />}
      {note && (
        <p className={note.bad ? 'hint bad' : 'hint'} role={note.bad ? 'alert' : 'status'}>
          {note.text}
        </p>
      )}
      {!info ? <p className="hint">Checking each server…</p> : info.mcp.length === 0 ? <p className="hint">None configured.</p> : (
        <ul>
          {info.mcp.map((s) => (
            <li key={s.name} className={`health-${s.health}`}>
              <span className="mark px" aria-hidden="true" />
              <span className="grow"><b>{s.name}</b> <span className="detail">{s.target}</span></span>
              <span className="status">{s.status}</span>
              {confirm(`mcp:${s.name}`, { kind: 'mcp-remove', name: s.name }, 'Remove')}
            </li>
          ))}
        </ul>
      )}
      <div className="tools-head"><b>Plugins</b></div>
      {!info ? null : info.plugins.length === 0 ? <p className="hint">None installed.</p> : (
        <ul>
          {info.plugins.map((p) => (
            <li key={p.id} className={p.enabled ? 'health-ok' : 'health-off'}>
              <span className="mark px" aria-hidden="true" />
              <span className="grow"><b>{p.id}</b> <span className="detail">{p.version}</span></span>
              <span className="status">{p.enabled ? 'enabled' : 'disabled'} · {p.scope}</span>
              <button disabled={busy} onClick={() => void run({ kind: p.enabled ? 'plugin-disable' : 'plugin-enable', id: p.id })}>
                {p.enabled ? 'Disable' : 'Enable'}
              </button>
              {confirm(`plugin:${p.id}`, { kind: 'plugin-uninstall', id: p.id }, 'Uninstall')}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A web address (http) or a command that starts the server; new servers are kept to this project. */
function AddServer({ busy, onAdd }: { busy: boolean; onAdd: (a: ManageAction) => void }) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const web = /^https?:\/\//.test(target.trim())
  const submit = () => {
    const t = target.trim()
    if (web) return onAdd({ kind: 'mcp-add-http', name: name.trim(), url: t })
    const [command = '', ...args] = t.split(/\s+/)
    onAdd({ kind: 'mcp-add-stdio', name: name.trim(), command, args })
  }
  return (
    <form className="add-server" onSubmit={(e) => (e.preventDefault(), submit())}>
      <input aria-label="Server name" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
      <input aria-label="Address or command" placeholder="https://… or npx some-server" value={target} onChange={(e) => setTarget(e.target.value)} />
      <button type="submit" disabled={busy || !name.trim() || !target.trim()}>
        Add
      </button>
      <span className="hint">Kept to this project.</span>
    </form>
  )
}
