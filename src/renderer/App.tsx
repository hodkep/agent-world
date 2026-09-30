import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentMessage, AgentOptions, AgentRecord, AgentStats, Effort, PermissionRequest, Prefs, TerminalMenu } from '../shared/types'
import { CodePanel, type OpenRequest } from './code/CodePanel'
import { PixelWord } from './PixelWord'
import { EFFORTS, HireForm, MODELS } from './panel/HireForm'
import type { DevServer, Workspaces } from '../shared/api'
import { BUILT_IN_ROLES, STARTER_CREW, type Role } from '../shared/roles'
import { WorkspaceMenu } from './panel/WorkspaceMenu'
import { type LimitView, type UsageLimits, limitView, noLimits } from '../shared/usage'
import { cssColor, modeInfo } from '../shared/modes'
import { InputDialog, needTitle, type Need, type NeedActions } from './panel/InputDialog'
import { mentionText } from '../shared/mention'
import { Welcome } from './panel/Welcome'
import { ChatView } from './chat/ChatView'
import { PreviewView } from './panel/PreviewView'
import { ToolsView } from './panel/ToolsView'
import { History } from './panel/History'
import { Palette } from './panel/Palette'
import { Settings } from './panel/Settings'
import { TerminalView } from './panel/TerminalView'
import { OfficeWorld } from './world/World'
import { type World, applyEvent, emptyWorld, roleOf } from './world/worldState'

const store = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const keep = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* remembering the layout is a convenience */
  }
}

// The way you talk to an agent (chat or raw terminal) is remembered between launches.
type Talk = 'chat' | 'terminal'
const readTalk = (): Talk => {
  try {
    return localStorage.getItem('aw.talk') === 'terminal' ? 'terminal' : 'chat'
  } catch {
    return 'chat'
  }
}

// Before projects were saved by the app, the chosen folder lived here; it is carried over once.
const LEGACY_FOLDER_KEY = 'aw.folder'
const legacyFolder = () => {
  try {
    return localStorage.getItem(LEGACY_FOLDER_KEY)
  } catch {
    return null
  }
}

const MIN_PANEL = 340

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
  const [view, setView] = useState<'chat' | 'terminal' | 'code' | 'tools' | 'preview'>(readTalk)
  const [wide, setWide] = useState(false)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [hiring, setHiring] = useState(false)
  const [history, setHistory] = useState(false)
  const [openFile, setOpenFile] = useState<OpenRequest | undefined>()
  const [planMenus, setPlanMenus] = useState<Record<string, boolean>>({})
  const [termMenus, setTermMenus] = useState<Record<string, TerminalMenu | null>>({})
  const [questionMenus, setQuestionMenus] = useState<Record<string, boolean>>({})
  const [dialogFor, setDialogFor] = useState<string | null>(null)
  const [palette, setPalette] = useState(false)
  const [settings, setSettings] = useState(false)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const prefsNow = useRef<Prefs | null>(null)
  useEffect(() => void window.aw.getPrefs().then((p) => ((prefsNow.current = p), setPrefs(p))), [])
  // The world builds asynchronously; agents that arrived first must be synced once it exists.
  const [officeReady, setOfficeReady] = useState(false)
  const [talk, setTalk] = useState<Talk>(readTalk)
  // The agent list and details fold into one line to leave the room to the conversation.
  const [compact, setCompact] = useState(() => store('aw.compact') === '1')
  const [panelW, setPanelW] = useState<number | null>(() => Number(store('aw.panelw')) || null)
  const [reviewMenu, setReviewMenu] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [grouping, setGrouping] = useState(false)
  const [stats, setStats] = useState<Record<string, AgentStats>>({})
  const [budgetAlerts, setBudgetAlerts] = useState<Record<string, 'near' | 'over'>>({})
  // Selecting an agent, even the one already selected, means "type to it": always hand focus to its terminal.
  const select = (id: string) => {
    setSelected(id)
    keep('aw.selected', id)
    setView(talkRef.current)
    setOpenFile(undefined)
    // An agent that is waiting on you opens its box; otherwise keys go to its terminal.
    // In the chat the ask is answered inline, so the pop-up is only for the other views.
    if (needsRef.current(id).length > 0 && talkRef.current !== 'chat') setDialogFor(id)
    else {
      setDrawer(true)
      setFocusTick((n) => n + 1)
    }
  }
  // The world is built once and keeps the first render's `select`, so it reads the latest needs through a ref.
  const needsRef = useRef<(id: string) => Need[]>(() => [])
  const talkRef = useRef<Talk>(readTalk())
  const stage = useRef<HTMLDivElement>(null)
  const office = useRef<OfficeWorld | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [servers, setServers] = useState<Record<string, DevServer[]>>({})
  const [limits, setLimits] = useState<UsageLimits>(noLimits)
  const handbookOpen = useRef<(id: string) => void>(() => {})
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
      // Back where you were after a reload or a restart: the agent you had open is open again (asleep ones offer to wake).
      const last = store('aw.selected')
      if (last && list.some((a) => a.id === last)) setSelected(last)
      setWorld((w) => list.reduce((acc, a) => applyEvent(acc, a.online ? { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: a.activity ?? 'idle' } : { type: 'session-end', agentId: a.id, sessionId: a.sessionId }), w))
    })
    const offs = [
      window.aw.onAgentEvent((e) => {
        setWorld((w) => applyEvent(w, e))
        // The main process marks an agent started on its first real activity; mirror it so Clone unlocks.
        if (e.type === 'activity' && !e.subagentId) setAgents((xs) => (xs.some((a) => a.id === e.agentId && !a.started) ? xs.map((a) => (a.id === e.agentId ? { ...a, started: true } : a)) : xs))
      }),
      window.aw.onTerminalMenu((id, m) => setTermMenus((t) => ({ ...t, [id]: m }))),
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
    void window.aw.resync()
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    let alive = true
    let w: OfficeWorld | null = null
    void OfficeWorld.create(stage.current!, select, {
      plant: { onHover: (v, x, y) => plantHover.current(v, x, y) },
      handbook: (id) => handbookOpen.current(id)
    }).then((created) => {
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
      agents.map((a) => ({ id: a.id, name: a.name, selected: a.id === selected, contextPct: stats[a.id]?.contextPct ?? null, state: world[a.id] ?? { activity: 'asleep', interns: {}, files: 0 }, inbox: messages.filter((m) => m.toId === a.id && m.status === 'queued').length, cloneOf: a.cloneOf }))
    )
  })

  const current = agents.find((a) => a.id === selected) ?? null
  // The list only folds away while an agent is selected; with none selected it must stay, or there is no way to pick one.
  const folded = compact && !!current
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
    ...(questionMenus[id] && world[id]?.questions?.length ? [{ kind: 'question', questions: world[id]!.questions! } as const] : []),
    ...(termMenus[id] ? [{ kind: 'menu', ...termMenus[id]! } as const] : [])
  ]
  needsRef.current = needsOf
  talkRef.current = talk
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
  handbookOpen.current = (id) => {
    const a = agents.find((x) => x.id === id)
    if (!a?.branch) return setError(`${a?.name ?? 'That agent'} works in a shared folder, so there is no branch to keep a handbook in.`)
    select(id)
    void openHandbook(a)
  }
  // Files dropped on a character are mentioned to that agent, wherever it is standing.
  const dropOnStage = (e: React.DragEvent) => {
    e.preventDefault()
    const box = e.currentTarget.getBoundingClientRect()
    const id = office.current?.agentAt(e.clientX - box.left, e.clientY - box.top)
    const text = mentionText([...e.dataTransfer.files].map((f) => window.aw.pathOf(f)))
    if (!id || !text) return setError('Drop files right onto an agent to hand them over.')
    window.aw.ptyWrite(id, text)
    select(id)
  }
  useEffect(() => office.current?.setLimits(limits), [limits, officeReady])
  useEffect(() => {
    void window.aw.listRoles(folder ?? '').then(setRoles, () => setRoles([]))
  }, [folder, hiring])
  useEffect(() => {
    void window.aw.getServers().then(setServers)
    return window.aw.onServers(setServers)
  }, [])
  useEffect(() => {
    void window.aw.getUsage().then(setLimits)
    return window.aw.onUsage(setLimits)
  }, [])

  const askReview = (author: AgentRecord, reviewer: string) =>
    run(async () => {
      setReviewMenu(false)
      const created = await window.aw.requestReview(author.id, reviewer)
      if (created) {
        setAgents((xs) => [...xs, created])
        setWorld((w) => applyEvent(w, { type: 'activity', agentId: created.id, sessionId: created.sessionId, activity: 'idle' }))
      }
    })

  const chooseTalk = (t: Talk) => {
    setTalk(t)
    setView(t)
    try {
      localStorage.setItem('aw.talk', t)
    } catch {
      /* remembering the choice is a convenience */
    }
  }

  // Hires the three roles that make a first team; a name that is already in use is skipped, not fatal.
  const hireCrew = () =>
    run(async () => {
      if (!folder) return
      for (const id of STARTER_CREW) {
        const r = BUILT_IN_ROLES.find((x) => x.id === id)!
        try {
          const a = await window.aw.addAgent(folder, { ...r.options, role: r.title }, r.nameHint)
          setAgents((xs) => [...xs, a])
          setWorld((w) => applyEvent(w, { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: 'idle' }))
        } catch (err) {
          setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
        }
      }
      void refreshWorkspaces()
    })

  // Previous / next agent, for the folded view.
  const step = (dir: 1 | -1) => {
    if (!agents.length) return
    const i = agents.findIndex((a) => a.id === selected)
    select(agents[(i + dir + agents.length) % agents.length]!.id)
  }

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

  // One set of answers for both places an ask can be answered: the pop-up box and the chat itself.
  const needActions = (agentId: string): NeedActions => ({
    trust: (yes) => window.aw.answerTrust(agentId, yes),
    decide: (id, d) => decideById(id, d),
    plan: (choice, feedback) => window.aw.answerPlan(agentId, choice, feedback),
    answer: (answers) => window.aw.answerQuestions(agentId, answers),
    menu: (index) => window.aw.answerMenu(agentId, index),
    cancelMenu: () => window.aw.cancelMenu(agentId)
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
          actions={needActions(dialogFor)}
        />
      )}
      {settings && prefs && <Settings prefs={prefs} roles={roles} onChange={(patch) => {
          // Merged with the latest saved state, so two quick changes (a text box losing focus, then a menu) both stick.
          const next = { ...prefsNow.current!, ...patch }
          prefsNow.current = next
          setPrefs(next)
          void window.aw.setPrefs(next)
        }} onClose={() => setSettings(false)} />}
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
        <button className="push" onClick={() => setSettings(true)} title="Notifications, defaults for new agents, where Claude is">
          Settings
        </button>
        <button onClick={() => (narrow ? setDrawer((o) => !o) : setPanelOpen((o) => !o))} aria-expanded={showPanel}>
          {showPanel ? 'Hide panel' : 'Show panel'}
        </button>
      </header>
      <main>
        <div className="stage-wrap" onDragOver={(e) => e.preventDefault()} onDrop={dropOnStage}>
          <div className="stage" ref={stage} />
          <div className="zoom-ctl" role="group" aria-label="View">
            <button onClick={() => office.current?.zoomBy(-1)} aria-label="Zoom out" title="Zoom out" className="zc-minus" />
            <button onClick={() => office.current?.zoomBy(1)} aria-label="Zoom in" title="Zoom in" className="zc-plus" />
            <button onClick={() => office.current?.fitOffice()} title="Fill the window with the office">
              Fit office
            </button>
            <button onClick={() => office.current?.resetView()} title="Back to the default view with the grounds">
              Reset
            </button>
          </div>
          {tip && (
            <div className="tip" style={{ left: Math.min(tip.x + 14, 9999), top: tip.y + 14 }} role="tooltip">
              <PlantTip five={tip.five} week={tip.week} />
            </div>
          )}
        </div>
        <aside hidden={!showPanel} className={`${wide ? 'wide' : ''} ${narrow ? 'drawer' : ''}`} style={!wide && panelW ? { width: `min(${panelW}px, ${narrow ? '94vw' : '80vw'})` } : undefined}>
          <div
            className="resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the panel"
            tabIndex={0}
            title="Drag to resize · double-click to reset"
            onDoubleClick={() => (setPanelW(null), keep('aw.panelw', ''))}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
              e.preventDefault()
              const now = panelW ?? (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width
              const next = Math.max(MIN_PANEL, Math.min(window.innerWidth * 0.8, now + (e.key === 'ArrowLeft' ? 40 : -40)))
              setPanelW(next)
              keep('aw.panelw', String(Math.round(next)))
            }}
            onPointerDown={(e) => {
              e.preventDefault()
              const el = e.currentTarget
              el.setPointerCapture(e.pointerId)
              const move = (ev: PointerEvent) => setPanelW(Math.round(Math.max(MIN_PANEL, Math.min(window.innerWidth * 0.8, window.innerWidth - ev.clientX))))
              const up = () => {
                el.removeEventListener('pointermove', move)
                el.removeEventListener('pointerup', up)
                setPanelW((w) => (keep('aw.panelw', String(w ?? '')), w))
              }
              el.addEventListener('pointermove', move)
              el.addEventListener('pointerup', up)
            }}
          />
          {history && folder && <History folder={folder} onResume={resume} onClose={() => setHistory(false)} />}
          {hiring && <HireForm roles={roles} defaults={prefs?.defaults ?? { model: '', permissionMode: '', inPlace: false }} roleModels={prefs?.roleModels ?? {}} onHire={hire} onCancel={() => setHiring(false)} onSaveRole={async (title, options) => void (await window.aw.saveRole({ title, blurb: options.instructions?.slice(0, 120) ?? '', options }), setRoles(await window.aw.listRoles(folder ?? '')))} />}
          {agents.length > 0 && (
            <nav className="roster" aria-label="Agents" hidden={folded}>
              {[...agents].sort((x, y) => (x.group ?? '').localeCompare(y.group ?? '')).map((a, i, all) => {
                const st = world[a.id]
                const activity = st?.activity ?? 'asleep'
                const heading = a.group && a.group !== all[i - 1]?.group
                return (
                  <Fragment key={a.id}>
                    {heading && <div className="group-head">{a.group}</div>}
                  <button className={`agent-row is-${activity} ${budgetAlerts[a.id] ? `budget-${budgetAlerts[a.id]}` : ''}`} aria-pressed={a.id === selected} onClick={() => select(a.id)}>
                    <span className="dot" aria-hidden="true" />
                    <span className="name">
                      {a.name}
                      {new Set(agents.map((x) => x.repoPath)).size > 1 && (
                        <span className="proj" title={a.repoPath}>
                          {a.repoPath.split(/[\\/]/).pop()}
                        </span>
                      )}
                    </span>
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
                  </Fragment>
                )
              })}
            </nav>
          )}
          {current ? (
            <section className="agent-head" hidden={folded}>
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
                {current.options?.role && <span className="job-tag">{current.options.role}</span>}
                {grouping ? (
                  <>
                    <input
                      className="rename"
                      aria-label="Group"
                      list="groups"
                      placeholder="group"
                      defaultValue={current.group ?? ''}
                      maxLength={24}
                      autoFocus
                      onBlur={() => setGrouping(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setGrouping(false)
                        if (e.key !== 'Enter') return
                        const id = current.id
                        const group = e.currentTarget.value.trim()
                        void window.aw.setGroup(id, group).then(() => {
                          setAgents((xs) => xs.map((a) => (a.id === id ? { ...a, group: group || undefined } : a)))
                          setGrouping(false)
                        })
                      }}
                    />
                    <datalist id="groups">
                      {[...new Set(agents.flatMap((a) => (a.group ? [a.group] : [])))].map((g) => (
                        <option key={g} value={g} />
                      ))}
                    </datalist>
                  </>
                ) : (
                  <button className="group-tag" onClick={() => setGrouping(true)} title="Group this agent in the list">
                    {current.group ?? '+ group'}
                  </button>
                )}
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
              {current.branch && (
                <span className="menu-wrap">
                  <button onClick={() => setReviewMenu((o) => !o)} aria-haspopup="menu" aria-expanded={reviewMenu} title="Hand this branch to another agent for a code review">
                    Review
                  </button>
                  {reviewMenu && (
                    <div className="pop-menu" role="menu" aria-label="Ask for a review">
                      {agents
                        .filter((a) => a.id !== current.id && (world[a.id]?.activity ?? 'asleep') !== 'asleep')
                        .map((a) => (
                          <button key={a.id} role="menuitem" onClick={() => void askReview(current, a.id)}>
                            Ask {a.name}
                          </button>
                        ))}
                      <button role="menuitem" onClick={() => void askReview(current, 'new')}>
                        Hire a new reviewer
                      </button>
                    </div>
                  )}
                </span>
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
              <p className="hint">Pick an agent from the list above, or click its character.</p>
            ) : (
              <Welcome folder={folder} onPick={pick} onHire={() => setHiring(true)} onHistory={() => setHistory(true)} onCrew={() => void hireCrew()} />
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
          {current && folded && (
            <section className="head-compact" aria-label="Selected agent">
              <button onClick={() => step(-1)} aria-label="Previous agent" className="hc-step hc-prev" />
              <button onClick={() => step(1)} aria-label="Next agent" className="hc-step hc-next" />
              <b className="hc-name">{current.name}</b>
              <span className={`hc-state is-${state?.activity ?? 'asleep'}`}>{state?.activity ?? 'asleep'}</span>
              {state?.mode && state.mode !== 'default' && (
                <span className="hc-mode" style={{ color: cssColor(modeInfo(state.mode).color) }}>
                  {modeInfo(state.mode).label}
                </span>
              )}
              {cur && <span className="hc-cost">${cur.costUsd.toFixed(2)}</span>}
              {agents.some((a) => a.id !== current.id && needsOf(a.id).length > 0) && (
                <button className="ask-pill" onClick={() => setCompact(false)} title="Another agent is waiting for you">
                  others waiting
                </button>
              )}
            </section>
          )}
          {current && (
            <div className="tabs" role="tablist" aria-label="Agent view">
              <button role="tab" aria-selected={view === 'chat'} onClick={() => (chooseTalk('chat'), setFocusTick((n) => n + 1))}>
                Chat
              </button>
              <button role="tab" aria-selected={view === 'terminal'} onClick={() => (chooseTalk('terminal'), setFocusTick((n) => n + 1))}>
                Terminal
              </button>
              <button role="tab" aria-selected={view === 'code'} onClick={() => setView('code')}>
                Code
              </button>
              <button role="tab" aria-selected={view === 'tools'} onClick={() => setView('tools')}>
                Tools
              </button>
              <button role="tab" aria-selected={view === 'preview'} onClick={() => setView('preview')}>
                Preview{(servers[current.id] ?? []).some((s) => s.alive) ? ' ●' : ''}
              </button>
              <button
                className="push"
                onClick={() => (setCompact((c) => !c), keep('aw.compact', compact ? '' : '1'))}
                aria-pressed={folded}
                title="Fold the agent list and details into one line, for more room to talk"
              >
                {folded ? 'Show agents' : 'Hide agents'}
              </button>
              <button onClick={() => setWide((w) => !w)} aria-pressed={wide} title="Give the panel more room">
                {wide ? 'Narrow' : 'Expand'}
              </button>
            </div>
          )}
          {agents.map((a) => (
            <ChatView
              key={a.id}
              agentId={a.id}
              agentName={a.name}
              activity={world[a.id]?.activity ?? 'asleep'}
              detail={world[a.id]?.detail}
              mode={world[a.id]?.mode}
              asleep={(world[a.id]?.activity ?? 'asleep') === 'asleep'}
              need={needsOf(a.id)[0] ?? null}
              moreNeeds={Math.max(0, needsOf(a.id).length - 1)}
              needActions={needActions(a.id)}
              visible={a.id === selected && view === 'chat'}
              focusTick={focusTick}
              onWake={() => wake(a)}
              onTerminal={() => (chooseTalk('terminal'), setFocusTick((n) => n + 1))}
            />
          ))}
          <div className="terminals" hidden={view !== 'terminal'}>
            {agents.map((a) => (
              <TerminalView key={a.id} agentId={a.id} visible={a.id === selected && view === 'terminal'} focusTick={focusTick} />
            ))}
          </div>
          {current && view === 'preview' && <PreviewView key={current.id} servers={servers[current.id] ?? []} agentName={current.name} />}
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
