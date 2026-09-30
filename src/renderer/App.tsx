import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentMessage, AgentOptions, AgentRecord, AgentStats, Effort, PermissionRequest } from '../shared/types'
import { CodePanel, type OpenRequest } from './code/CodePanel'
import { PixelWord } from './PixelWord'
import { EFFORTS, HireForm, MODELS } from './panel/HireForm'
import type { Workspaces } from '../shared/api'
import { WorkspaceMenu } from './panel/WorkspaceMenu'
import { type LimitView, type UsageLimits, limitView, noLimits } from '../shared/usage'
import { InputDialog, needTitle, type Need } from './panel/InputDialog'
import { Welcome } from './panel/Welcome'
import { ToolsView } from './panel/ToolsView'
import { History } from './panel/History'
import { Palette } from './panel/Palette'
import { TerminalView } from './panel/TerminalView'
import { OfficeWorld } from './world/World'
import { type World, applyEvent, emptyWorld, roleOf } from './world/worldState'

// Before projects were saved by the app, the chosen folder lived here; it is carried over once.
const LEGACY_FOLDER_KEY = 'aw.folder'
const legacyFolder = () => {
  try {
    return localStorage.getItem(LEGACY_FOLDER_KEY)
  } catch {
    return null
  }
}

export function App() {
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [world, setWorld] = useState<World>(emptyWorld)
  const [selected, setSelected] = useState<string | null>(null)
  const [asks, setAsks] = useState<PermissionRequest[]>([])
  const [workspaces, setWorkspaces] = useState<Workspaces | null>(null)
  const folder = workspaces?.active ?? null
  const [dirty, setDirty] = useState<{ id: string; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  // Below this width the panel would squeeze the office, so it becomes a drawer over it, closed until needed.
  const narrow = useNarrow()
  const [drawer, setDrawer] = useState(false)
  const [trusts, setTrusts] = useState<Record<string, string>>({})
  const [focusTick, setFocusTick] = useState(0)
  const [view, setView] = useState<'terminal' | 'code' | 'tools'>('terminal')
  const [wide, setWide] = useState(false)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [hiring, setHiring] = useState(false)
  const [history, setHistory] = useState(false)
  const [openFile, setOpenFile] = useState<OpenRequest | undefined>()
  const [planMenus, setPlanMenus] = useState<Record<string, boolean>>({})
  const [questionMenus, setQuestionMenus] = useState<Record<string, boolean>>({})
  const [dialogFor, setDialogFor] = useState<string | null>(null)
  const [palette, setPalette] = useState(false)
  // The world builds asynchronously; agents that arrived first must be synced once it exists.
  const [officeReady, setOfficeReady] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [stats, setStats] = useState<Record<string, AgentStats>>({})
  const [budgetAlerts, setBudgetAlerts] = useState<Record<string, 'near' | 'over'>>({})
  // Selecting an agent, even the one already selected, means "type to it": always hand focus to its terminal.
  const select = (id: string) => {
    setSelected(id)
    setView('terminal')
    setOpenFile(undefined)
    // An agent that is waiting on you opens its box; otherwise keys go to its terminal.
    if (needsRef.current(id).length > 0) setDialogFor(id)
    else {
      setDrawer(true)
      setFocusTick((n) => n + 1)
    }
  }
  // The world is built once and keeps the first render's `select`, so it reads the latest needs through a ref.
  const needsRef = useRef<(id: string) => Need[]>(() => [])
  const stage = useRef<HTMLDivElement>(null)
  const office = useRef<OfficeWorld | null>(null)
  const [limits, setLimits] = useState<UsageLimits>(noLimits)
  const plantHover = useRef<(v: { five: LimitView; week: LimitView } | null, x: number, y: number) => void>(() => {})
  const [tip, setTip] = useState<{ five: LimitView; week: LimitView; x: number; y: number } | null>(null)
  // Each message flies once, when first seen, even though it is reported again on delivery.
  const seenFlights = useRef(new Set<string>())

  useEffect(() => {
    void window.aw.getWorkspaces().then(async (w) => {
      const old = legacyFolder()
      setWorkspaces(w.active || !old ? w : await window.aw.activateWorkspace(old).catch(() => w))
    })
  }, [])

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
      window.aw.onQuestionMenu((id, open) => setQuestionMenus((m) => ({ ...m, [id]: open }))),
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
    void OfficeWorld.create(stage.current!, select, { plant: { onHover: (v, x, y) => plantHover.current(v, x, y) } }).then((created) => {
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
  const needsOf = (id: string): Need[] => [
    ...(trusts[id] ? [{ kind: 'trust', path: trusts[id]! } as const] : []),
    ...asks.filter((r) => r.agentId === id).map((request) => ({ kind: 'permission', request }) as const),
    ...(planMenus[id] ? [{ kind: 'plan', text: world[id]?.plan ?? '' } as const] : []),
    ...(questionMenus[id] && world[id]?.questions?.length ? [{ kind: 'question', questions: world[id]!.questions! } as const] : [])
  ]
  needsRef.current = needsOf
  const dialogNeeds = dialogFor ? needsOf(dialogFor) : []
  useEffect(() => {
    if (dialogFor && dialogNeeds.length === 0) setDialogFor(null)
  })
  const showPanel = (narrow ? drawer || agents.length === 0 : panelOpen) || hiring || history
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

  const refreshWorkspaces = () => window.aw.getWorkspaces().then(setWorkspaces)
  const pick = () =>
    run(async () => {
      const f = await window.aw.pickFolder()
      if (f) setWorkspaces(await window.aw.activateWorkspace(f))
    })

  const hire = (options: AgentOptions, name: string) =>
    run(async () => {
      if (!folder) return
      const a = await window.aw.addAgent(folder, options, name)
      setHiring(false)
      void refreshWorkspaces()
      setAgents((xs) => [...xs, a])
      setWorld((w) => applyEvent(w, { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: 'idle' }))
      select(a.id)
    })

  const resume = (sessionId: string) =>
    run(async () => {
      if (!folder) return
      const a = await window.aw.resumeSession(folder, sessionId)
      setHistory(false)
      void refreshWorkspaces()
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

  plantHover.current = (v, x, y) => setTip(v ? { ...v, x, y } : null)
  useEffect(() => office.current?.setLimits(limits), [limits, officeReady])
  useEffect(() => {
    void window.aw.getUsage().then(setLimits)
    return window.aw.onUsage(setLimits)
  }, [])

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

  const decideById = (id: string, d: 'allow' | 'deny') => {
    window.aw.decide(id, d)
    setAsks((q) => q.filter((x) => x.id !== id))
  }

  return (
    <div className="app">
      {dialogFor && dialogNeeds.length > 0 && (
        <InputDialog
          agentName={agents.find((a) => a.id === dialogFor)?.name ?? 'agent'}
          need={dialogNeeds[0]!}
          more={dialogNeeds.length - 1}
          onClose={() => setDialogFor(null)}
          onFinishInTerminal={() => {
            setDialogFor(null)
            setSelected(dialogFor)
            setView('terminal')
            setFocusTick((n) => n + 1)
          }}
          actions={{
            trust: (yes) => window.aw.answerTrust(dialogFor, yes),
            decide: (id, d) => decideById(id, d),
            plan: (choice, feedback) => window.aw.answerPlan(dialogFor, choice, feedback),
            answer: (answers) => window.aw.answerQuestions(dialogFor, answers)
          }}
        />
      )}
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
        <WorkspaceMenu
          workspaces={workspaces}
          onOpen={(path) => void run(async () => setWorkspaces(await window.aw.activateWorkspace(path)))}
          onPick={pick}
          onForget={(path) => void run(async () => setWorkspaces(await window.aw.forgetWorkspace(path)))}
        />
        <button className="primary" onClick={() => setHiring((h) => !h)} disabled={!folder} aria-expanded={hiring}>
          + Agent
        </button>
        <button onClick={() => setHistory((h) => !h)} disabled={!folder} aria-expanded={history} title="Bring back an earlier conversation from this folder">
          History
        </button>
        <LimitChips limits={limits} />
        {officeCost > 0 && (
          <span className="office-cost" title="Spent by all agents this session">
            ${officeCost.toFixed(2)}
          </span>
        )}
        {error && <span className="error">{error}</span>}
        <button className="push" onClick={() => (narrow ? setDrawer((o) => !o) : setPanelOpen((o) => !o))} aria-expanded={showPanel}>
          {showPanel ? 'Hide panel' : 'Show panel'}
        </button>
      </header>
      <main>
        <div className="stage-wrap">
          <div className="stage" ref={stage} />
          {tip && (
            <div className="tip" style={{ left: Math.min(tip.x + 14, 9999), top: tip.y + 14 }} role="tooltip">
              <PlantTip five={tip.five} week={tip.week} />
            </div>
          )}
        </div>
        <aside hidden={!showPanel} className={`${wide ? 'wide' : ''} ${narrow ? 'drawer' : ''}`}>
          {history && folder && <History folder={folder} onResume={resume} onClose={() => setHistory(false)} />}
          {hiring && <HireForm onHire={hire} onCancel={() => setHiring(false)} />}
          {agents.length > 0 && (
            <nav className="roster" aria-label="Agents">
              {agents.map((a) => {
                const st = world[a.id]
                const activity = st?.activity ?? 'asleep'
                return (
                  <button key={a.id} className={`agent-row is-${activity} ${budgetAlerts[a.id] ? `budget-${budgetAlerts[a.id]}` : ''}`} aria-pressed={a.id === selected} onClick={() => select(a.id)}>
                    <span className="dot" aria-hidden="true" />
                    <span className="name">{a.name}</span>
                    {needsOf(a.id).length > 0 ? (
                      <span className="ask-pill" title="Waiting for you: click to answer">
                        {needTitle(needsOf(a.id)[0]!).toLowerCase()}
                      </span>
                    ) : (
                      <span />
                    )}
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
              <div className="head-main">
                <div className="head-title">
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
                )}
                <span className="role">{state ? roleOf(state) : 'senior'}</span>
                </div>
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
              </div>
              <div className="head-actions">
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
                {(state?.activity ?? 'asleep') !== 'asleep' && (
                  <div className="switches" title={between ? 'Switch for the next turn' : 'Available between turns'}>
                    <select aria-label="Model" disabled={!between} value="" onChange={(e) => e.target.value && switchTo({ model: e.target.value })}>
                      <option value="">Model…</option>
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
                <button className="push" onClick={() => remove(current.id)}>
                  Remove
                </button>
              </div>
            </section>
          ) : (
            agents.length ? (
              <p className="hint">Click a character to open its terminal.</p>
            ) : (
              <Welcome folder={folder} onPick={pick} onHire={() => setHiring(true)} onHistory={() => setHistory(true)} />
            )
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
              <button role="tab" aria-selected={view === 'tools'} onClick={() => setView('tools')}>
                Tools
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
          {current && view === 'tools' && <ToolsView key={current.id} agentId={current.id} />}
          {current && view === 'code' && <CodePanel key={current.id} agentId={current.id} workDone={state?.files ?? 0} openFile={openFile} />}
        </aside>
      </main>
    </div>
  )
}

function useNarrow() {
  const query = '(max-width: 1100px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

const window_ = (label: string, v: LimitView) =>
  v.pct === null ? `${label}: no reading yet` : v.reset === 'reset' ? `${label}: just reset, full again` : `${label}: ${Math.round(100 - v.pct)}% left · resets in ${v.reset}`

function PlantTip({ five, week }: { five: LimitView; week: LimitView }) {
  return (
    <>
      <b>Your Claude limits</b>
      <span>{window_('5-hour', five)}</span>
      <span>{window_('Weekly', week)}</span>
      <span className="tip-note">Shared by every agent signed in to your account.</span>
    </>
  )
}

/** The same two windows as the tanks, as text in the header: readable by keyboard and screen reader, and always on screen. */
function LimitChips({ limits }: { limits: UsageLimits }) {
  const now = Date.now()
  const chips = [
    { key: '5h', name: '5-hour', v: limitView(limits.fiveHour, now) },
    { key: 'wk', name: 'weekly', v: limitView(limits.sevenDay, now) }
  ].filter((c) => c.v.pct !== null)
  if (chips.length === 0) return null
  return (
    <span className="limit-chips" role="group" aria-label="Claude usage limits">
      {chips.map((c) => (
        <span key={c.key} className={`chip level-${c.v.level}`} role="status" aria-label={`${c.name} limit: ${Math.round(100 - c.v.pct!)}% left, resets in ${c.v.reset}`} title={`${c.name} limit · resets in ${c.v.reset}`}>
          <span className="chip-dot" aria-hidden="true" />
          {c.key} {Math.round(100 - c.v.pct!)}%
        </span>
      ))}
    </span>
  )
}
