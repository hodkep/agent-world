import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentRecord, PermissionRequest } from '../shared/types'
import { PixelWord } from './PixelWord'
import { TerminalView } from './panel/TerminalView'
import { OfficeWorld } from './world/World'
import { type World, applyEvent, emptyWorld, roleOf } from './world/worldState'

const FOLDER_KEY = 'aw.folder'
const readFolder = () => {
  try {
    return localStorage.getItem(FOLDER_KEY)
  } catch {
    return null
  }
}

export function App() {
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [world, setWorld] = useState<World>(emptyWorld)
  const [selected, setSelected] = useState<string | null>(null)
  const [asks, setAsks] = useState<PermissionRequest[]>([])
  const [folder, setFolder] = useState<string | null>(readFolder)
  const [dirty, setDirty] = useState<{ id: string; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [trusts, setTrusts] = useState<Record<string, string>>({})
  const [focusTick, setFocusTick] = useState(0)
  const stage = useRef<HTMLDivElement>(null)
  const office = useRef<OfficeWorld | null>(null)

  useEffect(() => {
    void window.aw.listAgents().then((list) => {
      setAgents(list)
      setWorld((w) => list.reduce((acc, a) => applyEvent(acc, { type: 'session-end', sessionId: a.sessionId }), w))
    })
    const offs = [
      window.aw.onAgentEvent((e) => setWorld((w) => applyEvent(w, e))),
      window.aw.onPermission((r) => setAsks((q) => [...q, r])),
      window.aw.onPermissionSettled((id) => setAsks((q) => q.filter((r) => r.id !== id))),
      window.aw.onTrustPrompt((agentId, path) =>
        setTrusts((t) => {
          const { [agentId]: _, ...rest } = t
          return path ? { ...t, [agentId]: path } : rest
        })
      )
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    let alive = true
    let w: OfficeWorld | null = null
    void OfficeWorld.create(stage.current!, setSelected).then((created) => {
      if (!alive) return created.destroy()
      w = office.current = created
    })
    return () => {
      alive = false
      w?.destroy()
      office.current = null
    }
  }, [])

  useEffect(() => {
    office.current?.sync(
      agents.map((a) => ({ id: a.id, name: a.name, selected: a.id === selected, state: world[a.sessionId] ?? { activity: 'asleep', interns: {} } }))
    )
  })

  const current = agents.find((a) => a.id === selected) ?? null
  // A pending permission must never sit behind a collapsed panel.
  const pendingTrust = Object.entries(trusts)
  const showPanel = panelOpen || asks.length > 0 || pendingTrust.length > 0
  const state = current ? world[current.sessionId] : undefined
  const nameOf = useMemo(() => new Map(agents.map((a) => [a.sessionId, a])), [agents])

  const run = async (f: () => Promise<void>) => {
    setError(null)
    try {
      await f()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': /, '') : String(err))
    }
  }

  const pick = () =>
    run(async () => {
      const f = await window.aw.pickFolder()
      if (!f) return
      setFolder(f)
      try {
        localStorage.setItem(FOLDER_KEY, f)
      } catch {
        // Remembering the folder is a convenience; the picker still works without storage.
      }
    })

  const add = () =>
    run(async () => {
      if (!folder) return
      const a = await window.aw.addAgent(folder)
      setAgents((xs) => [...xs, a])
      setWorld((w) => applyEvent(w, { type: 'activity', sessionId: a.sessionId, activity: 'idle' }))
      setSelected(a.id)
    })

  const wake = (a: AgentRecord) =>
    run(async () => {
      await window.aw.wakeAgent(a.id)
      setWorld((w) => applyEvent(w, { type: 'activity', sessionId: a.sessionId, activity: 'idle' }))
    })

  const remove = (id: string, mode?: 'discard' | 'keep-worktree') =>
    run(async () => {
      const r = await window.aw.removeAgent(id, mode)
      if (!r.ok) return setDirty({ id, status: r.dirty })
      setDirty(null)
      setAgents((xs) => xs.filter((a) => a.id !== id))
      if (selected === id) setSelected(null)
    })

  const decide = (r: PermissionRequest, d: 'allow' | 'deny') => {
    window.aw.decide(r.id, d)
    setAsks((q) => q.filter((x) => x.id !== r.id))
    setFocusTick((n) => n + 1)
  }

  return (
    <div className="app">
      <header>
        <h1>
          <PixelWord text="agent world" />
        </h1>
        <button onClick={pick} title={folder ?? ''}>
          {folder ? folder.split(/[\\/]/).pop() : 'Open folder…'}
        </button>
        <button className="primary" onClick={add} disabled={!folder}>
          + Agent
        </button>
        {error && <span className="error">{error}</span>}
        <button className="push" onClick={() => setPanelOpen((o) => !o)} aria-expanded={showPanel} disabled={asks.length + pendingTrust.length > 0}>
          {showPanel ? 'Hide panel' : 'Show panel'}
        </button>
      </header>
      <main>
        <div className="stage" ref={stage} />
        <aside hidden={!showPanel}>
          {pendingTrust.length > 0 && (
            <section className="asks" aria-label="Workspace trust">
              {pendingTrust.map(([agentId, path]) => (
                <div key={agentId} className="ask">
                  <div>
                    <b>{agents.find((a) => a.id === agentId)?.name ?? 'agent'}</b> needs you to trust its workspace
                    <div className="detail" title={path}>
                      {path}
                    </div>
                  </div>
                  <button
                    className="primary"
                    onClick={() => {
                      window.aw.answerTrust(agentId, true)
                      setSelected(agentId)
                      setFocusTick((n) => n + 1)
                    }}
                  >
                    Trust folder
                  </button>
                  <button onClick={() => window.aw.answerTrust(agentId, false)}>Exit</button>
                </div>
              ))}
            </section>
          )}
          {asks.length > 0 && (
            <section className="asks" aria-label="Permission requests">
              {asks.map((r) => (
                <div key={r.id} className="ask">
                  <div>
                    <b>{nameOf.get(r.sessionId)?.name ?? 'agent'}</b> wants <code>{r.tool}</code>
                    <div className="detail">{r.detail}</div>
                  </div>
                  <button className="primary" onClick={() => decide(r, 'allow')}>
                    Approve
                  </button>
                  <button onClick={() => decide(r, 'deny')}>Deny</button>
                </div>
              ))}
            </section>
          )}
          {agents.length > 0 && (
            <nav className="roster" aria-label="Agents">
              {agents.map((a) => {
                const st = world[a.sessionId]
                const activity = st?.activity ?? 'asleep'
                return (
                  <button key={a.id} className={`agent-row is-${activity}`} aria-pressed={a.id === selected} onClick={() => setSelected(a.id)}>
                    <span className="dot" aria-hidden="true" />
                    <span className="name">{a.name}</span>
                    <span className="role">{st ? roleOf(st) : 'senior'}</span>
                    <span className="activity">{activity}</span>
                  </button>
                )
              })}
            </nav>
          )}
          {current ? (
            <section className="agent-head">
              <div>
                <b>{current.name}</b> <span className="role">{state ? roleOf(state) : 'senior'}</span>
                <div className="detail">
                  {current.branch ?? 'shared folder'} · {state?.activity ?? 'asleep'}
                  {state?.detail ? ` · ${state.detail}` : ''}
                </div>
              </div>
              {(state?.activity ?? 'asleep') === 'asleep' && <button onClick={() => wake(current)}>Wake</button>}
              <button onClick={() => remove(current.id)}>Remove</button>
            </section>
          ) : (
            <p className="hint">{agents.length ? 'Click a character to open its terminal.' : 'Open a folder, then hire your first agent with + Agent.'}</p>
          )}
          {dirty && dirty.id === current?.id && (
            <section className="dirty">
              <p>This worktree has uncommitted changes:</p>
              <pre>{dirty.status}</pre>
              <button onClick={() => setDirty(null)}>Cancel (commit in terminal)</button>
              <button onClick={() => remove(dirty.id, 'keep-worktree')}>Remove, keep worktree</button>
              <button className="danger" onClick={() => remove(dirty.id, 'discard')}>
                Discard changes
              </button>
            </section>
          )}
          <div className="terminals">
            {agents.map((a) => (
              <TerminalView key={a.id} agentId={a.id} visible={a.id === selected} focusTick={focusTick} />
            ))}
          </div>
        </aside>
      </main>
    </div>
  )
}
