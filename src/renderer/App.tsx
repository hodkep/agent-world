import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentMessage, AgentOptions, AgentRecord, AgentStats, Effort, PermissionRequest } from '../shared/types'
import { CodePanel, type OpenRequest } from './code/CodePanel'
import { PixelWord } from './PixelWord'
import { EFFORTS, HireForm, MODELS } from './panel/HireForm'
import { History } from './panel/History'
import { Palette } from './panel/Palette'
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
  const [view, setView] = useState<'terminal' | 'code'>('terminal')
  const [wide, setWide] = useState(false)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [hiring, setHiring] = useState(false)
  const [history, setHistory] = useState(false)
  const [openFile, setOpenFile] = useState<OpenRequest | undefined>()
  const [planMenus, setPlanMenus] = useState<Record<string, boolean>>({})
  const [feedback, setFeedback] = useState('')
  const [palette, setPalette] = useState(false)
  // The world builds asynchronously; agents that arrived first must be synced once it exists.
  const [, setOfficeReady] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [stats, setStats] = useState<Record<string, AgentStats>>({})
  const [budgetAlerts, setBudgetAlerts] = useState<Record<string, 'near' | 'over'>>({})
  // Selecting an agent, even the one already selected, means "type to it": always hand focus to its terminal.
  const select = (id: string) => {
    setSelected(id)
    setView('terminal')
    setOpenFile(undefined)
    setFocusTick((n) => n + 1)
  }
  const stage = useRef<HTMLDivElement>(null)
  const office = useRef<OfficeWorld | null>(null)
  // Each message flies once, when first seen, even though it is reported again on delivery.
  const seenFlights = useRef(new Set<string>())

  useEffect(() => {
    void window.aw.listAgents().then((list) => {
      setAgents(list)
      setWorld((w) => list.reduce((acc, a) => applyEvent(acc, a.online ? { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: a.activity ?? 'idle' } : { type: 'session-end', agentId: a.id, sessionId: a.sessionId }), w))
    })
    const offs = [
      window.aw.onAgentEvent((e) => {
        setWorld((w) => applyEvent(w, e))
        // The main process marks an agent started on its first real activity; mirror it so Clone unlocks.
        if (e.type === 'activity' && !e.subagentId) setAgents((xs) => (xs.some((a) => a.id === e.agentId && !a.started) ? xs.map((a) => (a.id === e.agentId ? { ...a, started: true } : a)) : xs))
      }),
      window.aw.onPermission((r) => setAsks((q) => [...q, r])),
      window.aw.onPermissionSettled((id) => setAsks((q) => q.filter((r) => r.id !== id))),
      window.aw.onAgentMessage((m) => {
        setMessages((ms) => [m, ...ms.filter((x) => x.id !== m.id)].slice(0, 30))
        if (m.status !== 'dropped' && !seenFlights.current.has(m.id)) {
          seenFlights.current.add(m.id)
          office.current?.sendMail(m.fromId, m.toId)
        }
      }),
      window.aw.onAgentStats((id, s) => setStats((all) => ({ ...all, [id]: s }))),
      window.aw.onBudgetAlert((id, level) => setBudgetAlerts((all) => ({ ...all, [id]: level }))),
      window.aw.onSelectAgent((id) => select(id)),
      window.aw.onPlanMenu((id, open) => setPlanMenus((m) => ({ ...m, [id]: open }))),
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
    void OfficeWorld.create(stage.current!, select).then((created) => {
      if (!alive) return created.destroy()
      w = office.current = created
      setOfficeReady(true)
    })
    return () => {
      alive = false
      w?.destroy()
      office.current = null
    }
  }, [])

  useEffect(() => {
    office.current?.sync(
      agents.map((a) => ({ id: a.id, name: a.name, selected: a.id === selected, contextPct: stats[a.id]?.contextPct ?? null, state: world[a.id] ?? { activity: 'asleep', interns: {}, files: 0 }, inbox: messages.filter((m) => m.toId === a.id && m.status === 'queued').length }))
    )
  })

  const current = agents.find((a) => a.id === selected) ?? null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && current) {
        e.preventDefault()
        setPalette(true)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [current])
  // A pending permission must never sit behind a collapsed panel.
  const pendingTrust = Object.entries(trusts)
  const pendingPlans = agents.filter((a) => planMenus[a.id])
  const showPanel = panelOpen || hiring || history || asks.length > 0 || pendingTrust.length > 0 || pendingPlans.length > 0
  const officeCost = Object.values(stats).reduce((sum, s) => sum + s.costUsd, 0)
  const cur = current ? stats[current.id] : undefined
  const state = current ? world[current.id] : undefined
  const nameOf = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

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

  const hire = (options: AgentOptions, name: string) =>
    run(async () => {
      if (!folder) return
      const a = await window.aw.addAgent(folder, options, name)
      setHiring(false)
      setAgents((xs) => [...xs, a])
      setWorld((w) => applyEvent(w, { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: 'idle' }))
      select(a.id)
    })

  const resume = (sessionId: string) =>
    run(async () => {
      if (!folder) return
      const a = await window.aw.resumeSession(folder, sessionId)
      setHistory(false)
      setAgents((xs) => [...xs, a])
      setWorld((w) => applyEvent(w, { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: 'idle' }))
      select(a.id)
    })

  // CLAUDE.md is the standing brief Claude reads at every start; start one if the project has none yet.
  const openHandbook = (a: AgentRecord) =>
    run(async () => {
      if (!(await window.aw.code.files(a.id)).includes('CLAUDE.md')) await window.aw.code.write(a.id, 'CLAUDE.md', '# Project notes\n\nWhat every agent here should know: how to build and test, conventions, things to avoid.\n')
      setView('code')
      setOpenFile({ path: 'CLAUDE.md' })
    })

  const clone = (src: AgentRecord) =>
    run(async () => {
      const a = await window.aw.cloneAgent(src.id)
      setAgents((xs) => [...xs, a])
      setWorld((w) => applyEvent(w, { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: 'idle' }))
      select(a.id)
    })

  const switchTo = (change: Parameters<typeof window.aw.reconfigure>[1]) => current && run(() => window.aw.reconfigure(current.id, change))
  const between = !state || ['idle', 'waiting'].includes(state.activity)

  const wake = (a: AgentRecord) =>
    run(async () => {
      await window.aw.wakeAgent(a.id)
      setWorld((w) => applyEvent(w, { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: 'idle' }))
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
      {palette && current && (
        <Palette
          agentId={current.id}
          agentName={current.name}
          onClose={() => {
            setPalette(false)
            setFocusTick((n) => n + 1)
          }}
          onRun={(name, args) => run(() => window.aw.runCommand(current.id, name, args))}
        />
      )}
      <header>
        <h1>
          <PixelWord text="agent world" />
        </h1>
        <button onClick={pick} title={folder ?? ''}>
          {folder ? folder.split(/[\\/]/).pop() : 'Open folder…'}
        </button>
        <button className="primary" onClick={() => setHiring((h) => !h)} disabled={!folder} aria-expanded={hiring}>
          + Agent
        </button>
        <button onClick={() => setHistory((h) => !h)} disabled={!folder} aria-expanded={history} title="Bring back an earlier conversation from this folder">
          History
        </button>
        {officeCost > 0 && (
          <span className="office-cost" title="Spent by all agents this session">
            ${officeCost.toFixed(2)}
          </span>
        )}
        {error && <span className="error">{error}</span>}
        <button className="push" onClick={() => setPanelOpen((o) => !o)} aria-expanded={showPanel} disabled={asks.length + pendingTrust.length + pendingPlans.length > 0}>
          {showPanel ? 'Hide panel' : 'Show panel'}
        </button>
      </header>
      <main>
        <div className="stage" ref={stage} />
        <aside hidden={!showPanel} className={wide ? 'wide' : ''}>
          {history && folder && <History folder={folder} onResume={resume} onClose={() => setHistory(false)} />}
          {hiring && <HireForm onHire={hire} onCancel={() => setHiring(false)} />}
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
          {pendingPlans.map((a) => (
            <section key={a.id} className="plan-card" aria-label={`${a.name}'s plan`}>
              <div className="plan-head">
                <b>{a.name}</b> has a plan ready
              </div>
              <pre className="plan-text">{world[a.id]?.plan || 'The plan is shown in the terminal.'}</pre>
              <div className="land">
                <button className="primary" onClick={() => run(() => window.aw.answerPlan(a.id, 0))}>
                  Approve · auto-accept edits
                </button>
                <button onClick={() => run(() => window.aw.answerPlan(a.id, 1))}>Approve · review each edit</button>
              </div>
              <form
                className="land"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(async () => {
                    await window.aw.answerPlan(a.id, 2, feedback)
                    setFeedback('')
                  })
                }}
              >
                <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What should change?" aria-label="Plan feedback" />
                <button type="submit">Keep planning</button>
              </form>
            </section>
          ))}
          {asks.length > 0 && (
            <section className="asks" aria-label="Permission requests">
              {asks.map((r) => (
                <div key={r.id} className="ask">
                  <div>
                    <b>{nameOf.get(r.agentId)?.name ?? 'agent'}</b> wants <code>{r.tool}</code>
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
                const st = world[a.id]
                const activity = st?.activity ?? 'asleep'
                return (
                  <button key={a.id} className={`agent-row is-${activity} ${budgetAlerts[a.id] ? `budget-${budgetAlerts[a.id]}` : ''}`} aria-pressed={a.id === selected} onClick={() => select(a.id)}>
                    <span className="dot" aria-hidden="true" />
                    <span className="name">{a.name}</span>
                    <span className="role">{st ? roleOf(st) : 'senior'}</span>
                    <span className="activity">{activity}</span>
                    <span className="cost">{stats[a.id] ? `$${stats[a.id]!.costUsd.toFixed(2)}` : ''}</span>
                  </button>
                )
              })}
            </nav>
          )}
          {current ? (
            <section className="agent-head">
              <div>
                {renaming === current.id ? (
                  <input
                    className="rename"
                    aria-label="New name"
                    defaultValue={current.name}
                    maxLength={20}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => setRenaming(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setRenaming(null)
                      if (e.key !== 'Enter') return
                      const id = current.id
                      window.aw.renameAgent(id, e.currentTarget.value).then(
                        (name) => {
                          setAgents((xs) => xs.map((a) => (a.id === id ? { ...a, name } : a)))
                          setRenaming(null)
                        },
                        (err: Error) => setError(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
                      )
                    }}
                  />
                ) : (
                  <b title="Double-click to rename" onDoubleClick={() => setRenaming(current.id)}>
                    {current.name}
                  </b>
                )}{' '}
                <span className="role">{state ? roleOf(state) : 'senior'}</span>
                <div className="detail">
                  {current.branch ?? 'shared folder'} · {state?.activity ?? 'asleep'}
                  {state?.detail ? ` · ${state.detail}` : ''}
                </div>
                {cur && (
                  <div className="meters" aria-label="Session usage">
                    <span>{cur.model ?? 'model ?'}</span>
                    {cur.effort && <span>effort {cur.effort}</span>}
                    {cur.fast && <span>fast</span>}
                    {cur.contextPct !== null && (
                      <span className="ctx" title={`${Math.round(cur.contextPct)}% of the context window used`}>
                        <span className="bar">
                          <span style={{ width: `${Math.min(100, cur.contextPct)}%` }} className={cur.contextPct > 80 ? 'hot' : cur.contextPct > 60 ? 'warm' : ''} />
                        </span>
                        {Math.round(cur.contextPct)}%
                      </span>
                    )}
                    <span className={budgetAlerts[current.id] ? `budget-${budgetAlerts[current.id]}` : ''}>
                      ${cur.costUsd.toFixed(2)}
                      {current.options?.budgetUsd ? ` / $${current.options.budgetUsd.toFixed(2)}` : ''}
                    </span>
                    <span>
                      +{cur.linesAdded} −{cur.linesRemoved}
                    </span>
                  </div>
                )}
                {state?.tasks && state.tasks.length > 0 && (
                  <ul className="tasks" aria-label="Tasks">
                    {state.tasks.map((t) => (
                      <li key={t.id} className={`task is-${t.status}`}>
                        <span className="mark" aria-hidden="true" />
                        {t.subject}
                        <span className="sr-only"> ({t.status.replace('_', ' ')})</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(state?.activity ?? 'asleep') !== 'asleep' && (
                  <div className="switches" title={between ? 'Switch for the next turn' : 'Available between turns'}>
                    <select aria-label="Model" disabled={!between} value="" onChange={(e) => e.target.value && switchTo({ model: e.target.value })}>
                      <option value="">Switch model…</option>
                      {MODELS.filter((m) => m.value).map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <select aria-label="Effort" disabled={!between} value="" onChange={(e) => e.target.value && switchTo({ effort: e.target.value as Effort })}>
                      <option value="">Effort…</option>
                      {EFFORTS.filter((m) => m.value).map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {(state?.activity ?? 'asleep') === 'asleep' && <button onClick={() => wake(current)}>Wake</button>}
              {(state?.activity ?? 'asleep') !== 'asleep' && (
                <button onClick={() => setPalette(true)} title="Run a command, skill or custom slash command (⌘K)">
                  Commands
                </button>
              )}
              {current.branch && (
                <button onClick={() => openHandbook(current)} title="CLAUDE.md: the standing instructions every agent reads when it starts">
                  Handbook
                </button>
              )}
              <button disabled={!current.started} onClick={() => clone(current)} title="A second agent that continues a copy of this conversation, in its own branch. Uncommitted edits stay behind.">
                Clone
              </button>
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
          {messages.length > 0 && (
            <section className="messages" aria-label="Messages between agents">
              {messages.slice(0, 5).map((m) => (
                <div key={m.id} className={`message is-${m.status}`}>
                  <b>{agents.find((a) => a.id === m.fromId)?.name ?? '?'}</b> → <b>{agents.find((a) => a.id === m.toId)?.name ?? '?'}</b>
                  <span className="status">{m.status}</span>
                  <div className="detail" title={m.text}>
                    {m.text}
                  </div>
                </div>
              ))}
            </section>
          )}
          {current && (
            <div className="tabs" role="tablist" aria-label="Agent view">
              <button role="tab" aria-selected={view === 'terminal'} onClick={() => (setView('terminal'), setFocusTick((n) => n + 1))}>
                Terminal
              </button>
              <button role="tab" aria-selected={view === 'code'} onClick={() => setView('code')}>
                Code
              </button>
              <button className="push" onClick={() => setWide((w) => !w)} aria-pressed={wide} title="Give the panel more room">
                {wide ? 'Narrow' : 'Expand'}
              </button>
            </div>
          )}
          <div className="terminals" hidden={view !== 'terminal'}>
            {agents.map((a) => (
              <TerminalView key={a.id} agentId={a.id} visible={a.id === selected && view === 'terminal'} focusTick={focusTick} />
            ))}
          </div>
          {current && view === 'code' && <CodePanel key={current.id} agentId={current.id} workDone={state?.files ?? 0} openFile={openFile} />}
        </aside>
      </main>
    </div>
  )
}
