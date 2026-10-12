import { DEFAULT_PROVIDER } from '../shared/types'
import { BRAND } from '../shared/brand'
import { Fragment, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LimitWindow, AgentMessage, AgentOptions, AgentProfile, AgentRecord, AgentStats, Effort, PermissionRequest, Prefs, ProviderInfo, TerminalMenu } from '../shared/types'
import { CodePanel, type OpenRequest } from './code/CodePanel'
import { PixelWord } from './PixelWord'
import { EFFORTS, HireForm, MODELS } from './panel/HireForm'
import { Modal } from './panel/Modal'
import { PREVIEW_EVENT } from './links'
import type { DevServer, Workspaces } from '../shared/api'
import { BUILT_IN_ROLES, STARTER_CREW, type Role } from '../shared/roles'
import { WorkspaceMenu } from './panel/WorkspaceMenu'
import { WorkspacePicker } from './panel/WorkspacePicker'
import { TerminalDrawer } from './panel/TerminalDrawer'
import { type LimitView, type UsageLimits, noLimits, untilReset } from '../shared/usage'
import { PICKABLE_MODES, cssColor, modeInfo } from '../shared/modes'
import { effortsFor } from '../shared/efforts'
import { InputDialog, needTitle, type Need, type NeedActions } from './panel/InputDialog'
import { mentionText } from '../shared/mention'
import { Welcome } from './panel/Welcome'
import { ChatView } from './chat/ChatView'
import type { AgentActions, AgentInfo } from './chat/AgentControls'
import { PreviewView } from './panel/PreviewView'
import { FileView } from './panel/FileView'
import { pageLabels } from './files/context'
import { ToolsView } from './panel/ToolsView'
import { CrewView } from './chat/CrewView'
import { staleInterns } from './chat/crewRows'
import { reactTo, resumedUnseen } from './chat/subagentMessage'
import { SubagentPanel } from './chat/SubagentPanel'
import { OPEN_SUBAGENT } from './chat/subagentEvents'
import { History } from './panel/History'
import { Palette } from './panel/Palette'
import { ShortcutsSheet } from './panel/ShortcutsSheet'
import { hint, keysOf, matches } from './shortcuts'
import { next } from './cycle'
import { Finish } from './panel/Finish'
import { GridView } from './panel/GridView'
import { AGENT_DRAG, PaneGrid, readLayout, type GridLayout, type TerminalDrop } from './panel/PaneGrid'
import { add, addAll, even, isTerm, keepOnly, place, tilesOf } from './panel/tiling'
import { TracesView } from './panel/TracesView'
import { AgentLibrary } from './panel/AgentLibrary'
import { useLibraryUses } from './chat/LibrarySlips'
import { IconButton } from './panel/IconButton'
import { Settings } from './panel/Settings'
import { LibraryModal } from './panel/LibraryModal'
import { TodoBoardModal } from './todos/TodoBoardModal'
import { OPEN_MESSAGE, OPEN_TODO, setTodoBoard } from './todos/todoStore'
import type { MessageLink } from '../shared/todos'
import { Setup } from './panel/Setup'
import type { ChatItem } from '../shared/chat'
import { parseHandoff } from '../shared/handoff'
import { HandoffDialog } from './panel/HandoffDialog'
import { banks, claudeWindows, lowCount, pooled } from '../shared/limits'
import { Swatch } from './panel/ProviderTag'
import { RewindModal } from './stats/RewindModal'
import { UsageModal } from './stats/UsageModal'
import { TerminalView } from './panel/TerminalView'
import { OfficeWorld } from './world/World'
import type { CardData } from './profile/facts'
import { cardLayout, cardMaxHeight } from './profile/layout'
import { type CardEdit, ProfileCard } from './profile/ProfileCard'
import { accountColor, accountName } from './accounts'
import { LimitBoard } from './panel/LimitBoard'
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
  const [allAgents, setAgents] = useState<AgentRecord[]>([])
  const [world, setWorld] = useState<World>(emptyWorld)
  const [selected, setSelected] = useState<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selected
  const [asks, setAsks] = useState<PermissionRequest[]>([])
  const [workspaces, setWorkspaces] = useState<Workspaces | null>(null)
  const folder = workspaces?.active ?? null
  // Each agent belongs to the folder it was hired in: switching folders shows that folder's crew, and the rest keep working in the background.
  const agents = useMemo(() => (folder ? allAgents.filter((a) => a.repoPath === folder) : allAgents), [allAgents, folder])
  const [dirty, setDirty] = useState<{ id: string; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  // Below this width the panel would squeeze the office, so it becomes a drawer over it, closed until needed.
  const narrow = useNarrow()
  const [drawer, setDrawer] = useState(false)
  const [trusts, setTrusts] = useState<Record<string, string>>({})
  const [focusTick, setFocusTick] = useState(0)
  const [view, setView] = useState<'chat' | 'terminal' | 'code' | 'tools' | 'preview' | 'traces' | 'library' | 'file'>(readTalk)
  const [wide, setWide] = useState(false)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [hiring, setHiring] = useState(false)
  const [history, setHistory] = useState(false)
  const [crewOpen, setCrewOpen] = useState(false)
  const [report, setReport] = useState<'usage' | 'rewind' | null>(null)
  // The profile card of the selected agent: shown or hidden (kept), where it goes, and what it shows.
  const [cardOpen, setCardOpen] = useState(false)
  // The terminals drawer under the office: shown or hidden, how tall, and how many terminals the project has.
  const [termOpen, setTermOpen] = useState(() => store('aw.term') === '1')
  const [termH, setTermH] = useState(() => Math.max(110, Number(store('aw.termH')) || 230))
  const [termCount, setTermCount] = useState(0)
  const showTerm = useCallback(() => (keep('aw.term', '1'), setTermOpen(true)), [])
  const toggleTerm = useCallback(() => setTermOpen((o) => (keep('aw.term', o ? '' : '1'), !o)), [])
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === '`') (e.preventDefault(), e.stopPropagation(), toggleTerm())
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [toggleTerm])
  // Which size of card the toggle on it asked for; until then, whatever the room allows.
  const [cardSize, setCardSize] = useState<'full' | 'compact' | null>(null)
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 })
  const [agentX, setAgentX] = useState(0)
  const [profile, setProfile] = useState<{ id: string; data: AgentProfile } | null>(null)
  const [clock, setClock] = useState(Date.now())
  const [flash, setFlash] = useState(0)
  const [openFile, setOpenFile] = useState<OpenRequest | undefined>()
  const [planMenus, setPlanMenus] = useState<Record<string, boolean>>({})
  const [termMenus, setTermMenus] = useState<Record<string, TerminalMenu | null>>({})
  const [questionMenus, setQuestionMenus] = useState<Record<string, boolean>>({})
  const [dialogFor, setDialogFor] = useState<string | null>(null)
  const [palette, setPalette] = useState(false)
  const [settings, setSettings] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  // The todo board of the open project, how many of its tasks wait on you, and the message a task asked to be opened at.
  const [todoOpen, setTodoOpen] = useState(false)
  const [todoNeeds, setTodoNeeds] = useState(0)
  const [todoFocus, setTodoFocus] = useState<string | null>(null)
  const [jump, setJump] = useState<{ agentId: string; itemId: string; excerpt: string; n: number } | null>(null)
  useEffect(() => {
    if (!folder) return (setTodoNeeds(0), setTodoBoard(null))
    const load = () => void window.aw.todos.get(folder).then((r) => (setTodoBoard(r.board), setTodoNeeds(r.board.todos.filter((t) => t.needsYou && t.status !== 'done').length)), () => undefined)
    load()
    return window.aw.onTodosChanged(load)
  }, [folder])
  // The chat of the agent that said something, scrolled to that message (what a task or a card points back at).
  const openMsg = (l: MessageLink) => {
    select(l.agentId)
    setView('chat')
    setJump({ agentId: l.agentId, itemId: l.itemId, excerpt: l.excerpt, n: Date.now() })
  }
  const openMsgRef = useRef(openMsg)
  openMsgRef.current = openMsg
  useEffect(() => {
    const open = (e: Event) => openMsgRef.current((e as CustomEvent<MessageLink>).detail)
    window.addEventListener(OPEN_MESSAGE, open)
    return () => window.removeEventListener(OPEN_MESSAGE, open)
  }, [])
  // A link to a task, anywhere in the app, opens the Todos window on it.
  useEffect(() => {
    const open = (e: Event) => (setTodoFocus(String((e as CustomEvent).detail)), setTodoOpen(true))
    window.addEventListener(OPEN_TODO, open)
    return () => window.removeEventListener(OPEN_TODO, open)
  }, [])
  // What is installed here; first-run setup opens from it, and Settings can open it again.
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null)
  const [agentsLoaded, setAgentsLoaded] = useState(false)
  const [setupAgain, setSetupAgain] = useState(false)
  const [handoffFrom, setHandoffFrom] = useState<string | null>(null)
  // How many allowances (of any provider) are nearly used up: the Usage button says so.
  const [lowLimits, setLowLimits] = useState(0)
  // Every provider's allowances, as the main process pools them: the tanks, the header chips and the Usage button all read from this.
  const [pool, setPool] = useState<LimitWindow[]>([])
  const [poolAt, setPoolAt] = useState(Date.now())
  // A window whose reset has passed is full again, whatever it last reported.
  const lookLimits = useCallback((refresh?: boolean) => {
    const fresh = (ws: LimitWindow[]) => ws.map((w) => (Date.parse(w.resetsAt) <= Date.now() ? { ...w, remainingPct: 100 } : w))
    return window.aw.getLimits(refresh).then((w) => (setPool(fresh(w)), setLowLimits(lowCount(fresh(w))), setPoolAt(Date.now())), () => undefined)
  }, [])
  useEffect(() => {
    void lookLimits()
    const t = setInterval(() => void lookLimits(), 30_000)
    return () => clearInterval(t)
  }, [lookLimits])
  const scanProviders = useCallback(() => {
    return window.aw.listProviders().then(setProviders, () => setProviders([]))
  }, [])
  useEffect(() => void scanProviders(), [scanProviders])
  const [finishing, setFinishing] = useState<string | null>(null)
  // In a narrow panel the tab strip scrolls sideways, so the tab chosen is brought into view.
  useEffect(() => {
    document.querySelector('.tabs [role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [view])
  // The Changes panel's land menu can open the finish dialog too.
  useEffect(() => {
    const on = (e: Event) => setFinishing(String((e as CustomEvent).detail))
    window.addEventListener('aw-finish', on)
    return () => window.removeEventListener('aw-finish', on)
  }, [])
  const [grid, setGrid] = useState(() => store('aw.grid') === '1')
  // null shows the overview tiles; otherwise conversations side by side in this layout.
  const [paneLayout, setPaneLayout] = useState<GridLayout | null>(() => {
    try {
      return readLayout(JSON.parse(store('aw.gridLayout') || 'null'))
    } catch {
      return null
    }
  })
  const changeLayout = (l: GridLayout | null) => (setPaneLayout(l), keep('aw.gridLayout', l ? JSON.stringify(l) : ''))
  // With conversations laid out in the grid, the grid is where they live: the side panel stays out of the way until you ask for it.
  const [peek, setPeek] = useState(false)
  // A local link clicked anywhere in a chat opens in that agent's Preview tab.
  // The file each agent has open in its File tab.
  const agentsRef = useRef<AgentRecord[]>([])
  agentsRef.current = allAgents
  const [fileTab, setFileTab] = useState<Record<string, string>>({})
  const [previewTarget, setPreviewTarget] = useState<Record<string, { url: string; n: number }>>({})
  // The terminals in the grid cells. One that leaves its cell (closed, replaced, the layout dropped) is closed for good.
  const shellsOpen = useRef(new Set<string>())
  useEffect(() => {
    const now = new Set(tilesOf(paneLayout?.root ?? null).filter(isTerm))
    for (const id of shellsOpen.current) if (!now.has(id)) window.aw.closeShell(id)
    shellsOpen.current = now
  }, [paneLayout])
  // After a restart the shells of an earlier run are gone: their panes go too.
  useEffect(() => {
    void window.aw.listShells().then((live) =>
      setPaneLayout((l) => {
        if (!l || !tilesOf(l.root).some((c) => isTerm(c) && !live.includes(c))) return l
        const next = { root: keepOnly(l.root, (c) => !isTerm(c) || live.includes(c)) }
        keep('aw.gridLayout', JSON.stringify(next))
        return next
      })
    )
  }, [])
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const prefsNow = useRef<Prefs | null>(null)
  useEffect(() => void window.aw.getPrefs().then((p) => ((prefsNow.current = p), setPrefs(p))), [])
  // The world builds asynchronously; agents that arrived first must be synced once it exists.
  const [officeReady, setOfficeReady] = useState(false)
  const [talk, setTalk] = useState<Talk>(readTalk)
  // The agent list and details fold into one line to leave the room to the conversation.
  // Folded away by default; the switcher in the slim header stands in for the list. Tests open it with aw.compact=0.
  const compact = store('aw.compact') !== '0'
  const [panelW, setPanelW] = useState<number | null>(() => Number(store('aw.panelw')) || null)
  const [switcher, setSwitcher] = useState(false)
  const switchWrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!switcher) return
    const away = (e: MouseEvent) => !switchWrap.current?.contains(e.target as Node) && setSwitcher(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setSwitcher(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [switcher])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [grouping, setGrouping] = useState(false)
  const [stats, setStats] = useState<Record<string, AgentStats>>({})
  const [budgetAlerts, setBudgetAlerts] = useState<Record<string, 'near' | 'over'>>({})
  // Selecting an agent, even the one already selected, means "type to it": always hand focus to its terminal.
  // The card goes away when you click anywhere outside it (its own name in the header opens it again) or press Esc.
  useEffect(() => {
    if (!cardOpen) return
    const away = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest('.pc, .hc-name, .pc-menu')) setCardOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setCardOpen(false)
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [cardOpen])
  // While a card is showing: follow the agent's character (so the card stays on the far side) and keep its counts fresh.
  useEffect(() => {
    if (!selected || !cardOpen) return
    let alive = true
    const where = () => {
      const p = office.current?.screenPosOf(selected)
      if (p) setAgentX(p.x)
      setClock(Date.now())
    }
    const load = () => void window.aw.profile(selected).then((data) => alive && setProfile({ id: selected, data }), () => {})
    where()
    load()
    const a = setInterval(where, 500)
    const b = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(a)
      clearInterval(b)
    }
  }, [selected, cardOpen])
  // The profile card opens only when you ask for it (a click on the agent in the office, or on its name), never by itself.
  const select = (id: string, withCard = false) => {
    setSelected(id)
    if (withCard) setCardOpen(true)
    keep('aw.selected', id)
    // Each project remembers its own last agent, for when it is opened again.
    // (One just hired is not in the list yet, and is always in the project that is open.)
    const where = agentsRef.current.find((a) => a.id === id)?.repoPath ?? folder
    if (where) keep(`aw.selected.${where}`, id)
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
  // A subagent that was stopped never fires the hook that takes its character out of the office; Claude's own files
  // say it is over, so look now and then and let those characters go.
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const look = () => setStageBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }))
    look()
    const ro = new ResizeObserver(look)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // With the window out of sight or another app in front, nobody sees the blinking dots, and a running animation keeps the screen busy: the page says so and the styles switch them off.
  useEffect(() => {
    const mark = () => document.documentElement.toggleAttribute('data-away', document.hidden || !document.hasFocus())
    mark()
    window.addEventListener('focus', mark)
    window.addEventListener('blur', mark)
    document.addEventListener('visibilitychange', mark)
    return () => {
      window.removeEventListener('focus', mark)
      window.removeEventListener('blur', mark)
      document.removeEventListener('visibilitychange', mark)
    }
  }, [])
  const crewRef = useRef({ world, allAgents })
  crewRef.current = { world, allAgents }
  // When each subagent was last sent away (by id), and when one was last brought back by a message: a fresh one gets a grace
  // period before the files can say it is over, because its file has not caught up with the message yet.
  const sentAway = useRef(new Map<string, number>())
  const broughtBack = useRef(new Map<string, number>())
  const GRACE_MS = 30_000
  // Subagents opened as conversations beside the chat, for each main agent: their tabs and the one shown.
  const [subs, setSubs] = useState<Record<string, { ids: string[]; active: string }>>({})
  const openSub = useCallback((agentId: string, id: string) => setSubs((m) => ({ ...m, [agentId]: { ids: m[agentId]?.ids.includes(id) ? m[agentId]!.ids : [...(m[agentId]?.ids ?? []), id], active: id } })), [])
  const closeSub = useCallback(
    (agentId: string, id: string) =>
      setSubs((m) => {
        const cur = m[agentId]
        if (!cur) return m
        const ids = cur.ids.filter((x) => x !== id)
        const { [agentId]: _, ...rest } = m
        return ids.length ? { ...rest, [agentId]: { ids, active: cur.active === id ? ids.at(-1)! : cur.active } } : rest
      }),
    []
  )
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ agentId: string; subagentId: string }>).detail
      openSub(d.agentId, d.subagentId)
    }
    window.addEventListener(OPEN_SUBAGENT, on)
    return () => window.removeEventListener(OPEN_SUBAGENT, on)
  }, [openSub])
  const bringBack = (agentId: string, sessionId: string, id: string, type: string) => {
    broughtBack.current.set(id, Date.now())
    setWorld((w) => applyEvent(w, { type: 'subagent-start', agentId, sessionId, subagentId: id, subagentType: type }))
  }
  useEffect(() => {
    const t = setInterval(() => {
      for (const a of crewRef.current.allAgents) {
        const shown = Object.keys(crewRef.current.world[a.id]?.interns ?? {})
        if (!shown.length && sentAway.current.size === 0) continue
        void window.aw.subagents(a.id).then(
          (infos) => {
            const now = Date.now()
            for (const id of staleInterns(shown, infos, now)) {
              if (now - (broughtBack.current.get(id) ?? 0) < GRACE_MS) continue
              sentAway.current.set(id, now)
              setWorld((w) => applyEvent(w, { type: 'subagent-stop', agentId: a.id, sessionId: a.sessionId, subagentId: id }))
            }
            // One that went on working after it left (a message woke it, and Claude said nothing) comes back.
            for (const i of resumedUnseen(infos, shown, sentAway.current, now)) bringBack(a.id, a.sessionId, i.agentId, i.type)
          },
          () => {}
        )
      }
    }, 3000)
    return () => clearInterval(t)
  }, [])
  // A message to a subagent: an envelope flies to it if it is in the office, and one that had left is brought back.
  const messageSubagent = async (agentId: string, sessionId: string, to: string) => {
    const infos = await window.aw.subagents(agentId).catch(() => [])
    const reaction = reactTo(to, Object.keys(crewRef.current.world[agentId]?.interns ?? {}), infos)
    if (reaction.kind === 'present') office.current?.sendMail(agentId, `${agentId}/${reaction.id}`)
    else if (reaction.kind === 'wake') {
      bringBack(agentId, sessionId, reaction.id, reaction.type)
      office.current?.sendMailToDoor(agentId)
    }
  }
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

  // The terminal drawer covers the bottom of the stage: the office is fitted to what is left above it.
  useEffect(() => {
    const el = document.getElementById('terminal-drawer')
    if (!el) return
    const tell = () => office.current?.setInset(el.hidden ? 0 : el.offsetHeight)
    tell()
    const ro = new ResizeObserver(tell)
    ro.observe(el)
    return () => (ro.disconnect(), office.current?.setInset(0))
  }, [termOpen, termH, folder, officeReady])

  useEffect(() => {
    void window.aw.getWorkspaces().then(async (w) => {
      const old = legacyFolder()
      setWorkspaces(w.active || !old ? w : await window.aw.activateWorkspace(old).catch(() => w))
    })
  }, [])

  useEffect(() => {
    void window.aw.listAgents().then((list) => {
      setAgents(list)
      setAgentsLoaded(true)
      // Back where you were after a reload or a restart: the agent you had open is open again (asleep ones offer to wake).
      const last = store('aw.selected')
      if (last && list.some((a) => a.id === last)) setSelected(last)
      setWorld((w) => list.reduce((acc, a) => applyEvent(acc, a.online ? { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: a.activity ?? 'idle' } : { type: 'session-end', agentId: a.id, sessionId: a.sessionId }), w))
    })
    const offs = [
      window.aw.onAgentEvent((e) => {
        setWorld((w) => applyEvent(w, e))
        // A subagent another program was asked to do (through the office) opens in the panel as it starts: nobody else would tell you it is there.
        if (e.type === 'subagent-start') void window.aw.subagents(e.agentId).then((l) => l.some((i) => i.agentId === e.subagentId && i.toolUseId.startsWith('spawn:')) && openSub(e.agentId, e.subagentId), () => {})
        if (e.type === 'subagent-stop') sentAway.current.set(e.subagentId, Date.now())
        if (e.type === 'activity' && e.tool === 'SendMessage' && e.target && !e.subagentId) void messageSubagent(e.agentId, e.sessionId, e.target)
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
    void OfficeWorld.create(stage.current!, (id) => select(id, true), {
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

  // An agent that reads a library item walks to the bookshelf for a few seconds.
  const [reading, setReading] = useState<Record<string, { until: number; item: string }>>({})
  useEffect(
    () =>
      window.aw.onLibraryUse((id, how, item) => {
        if (how !== 'fetched' && how !== 'skill' && how !== 'read') return
        const until = Date.now() + 6000
        setReading((r) => ({ ...r, [id]: { until, item } }))
        setTimeout(() => setReading((r) => (r[id]?.until === until ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== id)) : r)), 6000)
      }),
    []
  )
  useEffect(() => {
    office.current?.sync(
      agents.map((a) => ({ id: a.id, name: a.name, selected: a.id === selected, contextPct: stats[a.id]?.contextPct ?? null, state: world[a.id] ?? { activity: 'asleep', interns: {}, files: 0 }, inbox: messages.filter((m) => m.toId === a.id && m.status === 'queued').length, cloneOf: a.cloneOf, linesChanged: (stats[a.id]?.linesAdded ?? 0) + (stats[a.id]?.linesRemoved ?? 0), reading: (reading[a.id]?.until ?? 0) > Date.now(), readingName: reading[a.id]?.item }))
    )
  })

  const current = agents.find((a) => a.id === selected) ?? null
  // The Library tab appears once the library has done something for the agent, so an agent that never uses it keeps the usual six tabs.
  const hasLibrary = useLibraryUses(current?.id ?? '').uses.some((u) => u.how !== 'started' || !!u.words)
  useEffect(() => {
    if (selected && !current && allAgents.length) setSelected(null)
  }, [selected, current, allAgents.length])
  // Opening a project brings back the agent that was open in it last.
  const openedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!folder || !allAgents.length || openedFor.current === folder) return
    openedFor.current = folder
    if (selected && allAgents.some((a) => a.id === selected && a.repoPath === folder)) return
    const last = store(`aw.selected.${folder}`)
    const there = allAgents.find((a) => a.id === last && a.repoPath === folder)
    // As after a reload: the agent is open again, without a narrow window's drawer sliding over what was clicked.
    if (there) setSelected(there.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a project being opened restores its agent
  }, [folder, allAgents])
  useEffect(() => {
    office.current?.setWorkspace(folder ? (folder.split(/[\\/]/).filter(Boolean).pop() ?? folder) : null)
  }, [folder, officeReady])
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === '/') (e.preventDefault(), e.stopPropagation(), setShortcuts((o) => !o))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  // Ctrl+Tab steps through the agents of the open workspace (Shift goes back) and Cmd/Ctrl+Shift+[ and ] through the workspaces. They win over the terminal and message box. The Cmd+arrows are left to the system, which uses them to jump around text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const byAgent = matches(e, 'agent-switch')
      if ((!byAgent && !matches(e, 'workspace-switch')) || document.querySelector('dialog[open]')) return
      e.preventDefault(), e.stopPropagation()
      const dir = byAgent ? (e.shiftKey ? -1 : 1) : e.code === 'BracketLeft' || e.key === '[' || e.key === '{' ? -1 : 1
      if (byAgent) {
        const to = next(agents.map((a) => a.id), selected, dir)
        if (to) select(to)
      } else {
        const to = next((workspaces?.items ?? []).filter((w) => w.exists).map((w) => w.path), folder, dir)
        if (to) void run(async () => setWorkspaces(await window.aw.activateWorkspace(to)))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
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
  // Subagents alive right now, from the hooks: free to count on every render.
  const crewLive = agents.reduce((n, a) => n + Object.keys(world[a.id]?.interns ?? {}).length, 0)
  const waitingOf = (id: string) => new Set(Object.entries(world[id]?.interns ?? {}).filter(([, i]) => i.activity === 'permission').map(([k]) => k))
  const chatFor = (a: AgentRecord, visible: boolean, key = a.id) => (
    <ChatView
      key={key}
      agentId={a.id}
      agentName={a.name}
      activity={world[a.id]?.activity ?? 'asleep'}
      detail={world[a.id]?.detail}
      mode={world[a.id]?.mode}
      asleep={(world[a.id]?.activity ?? 'asleep') === 'asleep'}
      need={needsOf(a.id)[0] ?? null}
      moreNeeds={Math.max(0, needsOf(a.id).length - 1)}
      needActions={needActions(a.id)}
      visible={visible}
      focusTick={focusTick}
      jump={jump?.agentId === a.id ? jump : null}
      limits={limitsOf(a)}
      info={infoOf(a)}
      actions={actionsOf(a)}
      waitingSubagents={waitingOf(a.id)}
      outgoing={outgoingOf(a)}
      onWake={() => wake(a)}
      onTerminal={() => (select(a.id), chooseTalk('terminal'), setFocusTick((n) => n + 1))}
    />
  )
  const panes = grid && !!paneLayout && agents.length > 0
  useEffect(() => setPeek(false), [panes])
  const showPanel = panes ? peek : narrow ? drawer || agents.length === 0 : panelOpen
  // The agent the side panel is showing is left out of the grid while it does, so it is not on screen twice.
  const inPanel = grid && showPanel && agents.some((a) => a.id === selected) ? selected : null
  const folderName = folder ? (folder.split(/[\\/]/).filter(Boolean).pop() ?? folder) : ''
  // A shell in the project folder, added to the grid beside a tile, or wherever it fits.
  const newTerminal = (drop?: TerminalDrop) =>
    run(async () => {
      if (!folder) return
      const id = await window.aw.openShell(folder)
      const root = paneLayout?.root ?? null
      changeLayout({ root: drop ? place(root, id, drop.target, drop.zone) : add(root, id) })
    })
  const cur = current ? stats[current.id] : undefined
  const curProv = current ? providers?.find((p) => p.id === (current.provider ?? DEFAULT_PROVIDER)) : undefined
  const cardData: CardData | null = current
    ? {
        id: current.id,
        name: current.name,
        role: world[current.id] ? roleOf(world[current.id]!) : 'senior',
        roleLabel: current.options?.role ?? (world[current.id] && roleOf(world[current.id]!) === 'boss' ? 'Boss' : 'Senior'),
        activity: world[current.id]?.activity ?? 'asleep',
        model: cur?.model ?? current.options?.model ?? '',
        effort: cur?.effort ?? current.options?.effort ?? '',
        mode: world[current.id]?.mode ? modeInfo(world[current.id]!.mode!).label : '',
        branch: current.branch ?? '',
        ctx: cur?.contextPct ?? null,
        costUsd: cur?.costUsd ?? 0,
        tokens: cur?.tokens ?? null,
        budgetUsd: current.options?.budgetUsd,
        add: cur?.linesAdded ?? 0,
        del: cur?.linesRemoved ?? 0,
        profile: profile && profile.id === current.id ? profile.data : null,
        modelId: current.options?.model ?? '',
        effortId: cur?.effort ?? current.options?.effort ?? '',
        modeId: world[current.id]?.mode ?? (current.options?.permissionMode === 'manual' || !current.options?.permissionMode ? 'default' : current.options.permissionMode),
        canSwitch: ['idle', 'waiting'].includes(world[current.id]?.activity ?? 'asleep'),
        provider: { id: current.provider ?? DEFAULT_PROVIDER, label: curProv?.label ?? BRAND[DEFAULT_PROVIDER].short },
        models: (curProv?.models ?? MODELS).filter((m) => m.value),
        efforts: effortsFor(curProv?.models ?? MODELS, current.options?.model, cur?.model, cur?.effort),
        modes: (curProv?.modes ?? PICKABLE_MODES).filter((m) => !/bypass|skip/.test(m.id) || curProv?.relaunchModes.includes(m.id)),
        canCompact: curProv?.capabilities.compact ?? true,
        accounts: curProv?.capabilities.accounts && prefs?.accounts.some((a) => a.provider === curProv.id) ? ['', ...prefs.accounts.filter((a) => a.provider === curProv.id).map((a) => a.id)].map((id) => ({ id, name: accountName(prefs.accounts, id), color: accountColor(prefs.accounts, id) })) : [],
        accountId: current.account ?? ''
      }
    : null
  // The terminal drawer covers the bottom of the stage, so the card has less room.
  const drawerH = termOpen && folder ? termH : 0
  const cardLay = cardData ? cardLayout({ w: stageBox.w, h: stageBox.h - drawerH, agentX, prefer: cardSize ?? undefined }) : null
  const cardAt = cardOpen ? cardLay : null
  const renameTo = (id: string, value: string) =>
    window.aw.renameAgent(id, value).then((name) => {
      setAgents((xs) => xs.map((a) => (a.id === id ? { ...a, name } : a)))
    })
  // Each setting is the same action as the chat's own control, so the chat follows.
  const cardEdit: CardEdit | null = current
    ? {
        onName: (v) => renameTo(current.id, v),
        onModel: (model) =>
          void run(async () => {
            await window.aw.reconfigure(current.id, { model })
            setAgents((xs) => xs.map((a) => (a.id === current.id ? { ...a, options: { ...a.options, model } } : a)))
          }),
        onEffort: (effort) =>
          void run(async () => {
            await window.aw.reconfigure(current.id, { effort })
            setAgents((xs) => xs.map((a) => (a.id === current.id ? { ...a, options: { ...a.options, effort } } : a)))
          }),
        onMode: (mode) => void run(() => window.aw.setMode(current.id, mode)),
        onCompact: () => void run(() => window.aw.chatSend(current.id, '/compact')),
        onAccount: (account) =>
          void run(async () => {
            await window.aw.setAccount(current.id, account)
            setAgents((xs) => xs.map((a) => (a.id === current.id ? { ...a, account: account || undefined } : a)))
            // The new account's allowances are asked for at once, so the tanks, chips and this agent's controls follow the switch.
            void lookLimits(true)
          })
      }
    : null
  // Clicking the agent's name brings up its card (opening the dock when the card has no room over the office).
  const showCard = () => {
    setCardOpen(true)
    setFlash((n) => n + 1)
  }
  const state = current ? world[current.id] : undefined
  const nameOf = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  useEffect(() => {
    const on = (e: Event) => {
      const { agentId, url } = (e as CustomEvent<{ agentId: string; url: string }>).detail
      setPreviewTarget((t) => ({ ...t, [agentId]: { url, n: (t[agentId]?.n ?? 0) + 1 } }))
      setPeek(true)
      select(agentId)
      setView('preview')
    }
    window.addEventListener(PREVIEW_EVENT, on)
    return () => window.removeEventListener(PREVIEW_EVENT, on)
  })

  // A page an agent opened in a browser is shown in its Preview tab too; the one you are looking at switches to it, any other keeps what you are doing.
  useEffect(
    () =>
      window.aw.onOpenPage((agentId, path) => {
        void window.aw.fileUrl(agentId, path).then(({ info, url }) => {
          pageLabels.set(url, info.name)
          setPreviewTarget((t) => ({ ...t, [agentId]: { url, n: (t[agentId]?.n ?? 0) + 1 } }))
          if (agentId === selectedRef.current) (setPeek(true), setView('preview'))
        }, () => {})
      }),
    []
  )
  // A file an agent mentioned, clicked in a chat: a page or PDF goes to the Preview tab, a code file in the agent's folder to the
  // Code tab, anything else to the File tab, which also offers the machine's own program.
  useEffect(() => {
    const on = (e: Event) => {
      const { agentId, path } = (e as CustomEvent<{ agentId: string; path: string }>).detail
      void window.aw.fileInfo(agentId, [path]).then(async ([info]) => {
        setPeek(true)
        select(agentId)
        if (info && (info.kind === 'html' || info.kind === 'pdf')) {
          const { url } = await window.aw.fileUrl(agentId, info.path)
          pageLabels.set(url, info.name)
          setPreviewTarget((t) => ({ ...t, [agentId]: { url, n: (t[agentId]?.n ?? 0) + 1 } }))
          return setView('preview')
        }
        // The Code tab shows files of an agent that has its own branch; for any other folder the File tab shows it.
        if (info?.kind === 'code' && info.rel && agentsRef.current.find((x) => x.id === agentId)?.branch) {
          setOpenFile({ path: info.rel })
          return setView('code')
        }
        setFileTab((t) => ({ ...t, [agentId]: info?.path ?? path }))
        setView('file')
      })
    }
    window.addEventListener('aw-open-file', on)
    return () => window.removeEventListener('aw-open-file', on)
  })

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

  const hire = (options: AgentOptions, name: string, base?: string) =>
    run(async () => {
      if (!folder) return
      const a = await window.aw.addAgent(folder, options, name, base)
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
      const book = providers?.find((p) => p.id === (a.provider ?? DEFAULT_PROVIDER))?.handbook ?? 'CLAUDE.md'
      if (!(await window.aw.code.files(a.id)).includes(book)) await window.aw.code.write(a.id, book, '# Project notes\n\nWhat every agent here should know: how to build and test, conventions, things to avoid.\n')
      setView('code')
      setOpenFile({ path: book })
    })

  // The office stays under the grid and under dialogs and still hears the pointer, so what it would show is shown only while nothing is on top of it.
  const officeCovered = () => (grid && agents.length > 0) || !!document.querySelector('dialog[open], .scrim, [role="dialog"]')
  plantHover.current = (v, x, y) => setTip(v && !officeCovered() ? { ...v, x, y } : null)
  useEffect(() => {
    if (tip && officeCovered()) setTip(null)
  })
  // The book on a desk is the agent's work in progress: clicking it shows what has changed.
  handbookOpen.current = (id) => {
    select(id)
    setView('code')
    setOpenFile({ tab: 'changes' })
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
  // The tightest allowance of each kind across programs; before any program has answered, what Claude's agents report.
  // An agent's own controls show the allowance of the account it runs on, not the tightest of all of them. A program with accounts and no reading yet for this one shows none, never another's.
  const limitsOf = (a: AgentRecord): UsageLimits => {
    const prog = a.provider ?? DEFAULT_PROVIDER
    const mine = pool.filter((w) => w.provider === prog && (w.account ?? '') === (a.account ?? ''))
    if (mine.length) return pooled(mine)
    return prefs?.accounts.some((x) => x.provider === prog) ? noLimits() : limits
  }
  // The tanks on the lawn: a bank of two for each connected program, so each program's allowance can be read apart.
  const readyIds = (providers ?? []).filter((p) => p.detection.state === 'ready').map((p) => p.id)
  const plantBanks = banks(pool.length ? pool : claudeWindows(limits), readyIds.length ? readyIds : [DEFAULT_PROVIDER]).map((b) => ({ ...b, logins: b.logins.map((l) => ({ ...l, color: accountColor(prefs?.accounts ?? [], l.id) })) }))
  const plantKey = JSON.stringify(plantBanks)
  useEffect(() => office.current?.setBanks(plantBanks), [plantKey, officeReady])
  useEffect(() => {
    void window.aw.listRoles(folder ?? '').then(setRoles, () => setRoles([]))
  }, [folder, hiring])
  useEffect(() => {
    void window.aw.getServers().then(setServers)
    return window.aw.onServers(setServers)
  }, [])
  useEffect(() => {
    void window.aw.getUsage().then(setLimits)
    // Each report from an agent also refreshes what the tanks, the chips and every agent's controls show.
    return window.aw.onUsage((u) => (setLimits(u), void lookLimits()))
  }, [])

  const askReview = (author: AgentRecord, reviewer: string) =>
    run(async () => {
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

  // What is added to an agent's message from the terminals is there to see: the panel opens on its chat.
  const showChat = () => {
    chooseTalk('chat')
    if (panes) setPeek(true)
    else if (narrow) setDrawer(true)
    else setPanelOpen(true)
    setFocusTick((n) => n + 1)
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

  const clone = (src: AgentRecord, model?: string) =>
    run(async () => {
      const a = await window.aw.cloneAgent(src.id, model)
      setAgents((xs) => [...xs, a])
      setWorld((w) => applyEvent(w, { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: 'idle' }))
      select(a.id)
    })

  const switchTo = (change: Parameters<typeof window.aw.reconfigure>[1]) => current && run(() => window.aw.reconfigure(current.id, change))
  const between = !state || ['idle', 'waiting'].includes(state.activity)

  // The agent rows, shared by the list and by the switcher that stands in for it when the list is folded away.
  // A colour only helps once there is more than one program to tell apart: two ready here, or agents of two kinds.
  const mixed = (providers ?? []).filter((p) => p.detection.state === 'ready').length > 1 || new Set(allAgents.map((a) => a.provider ?? DEFAULT_PROVIDER)).size > 1
  const rosterRows = (after?: () => void) =>
    [...agents].sort((x, y) => (x.group ?? '').localeCompare(y.group ?? '')).map((a, i, all) => {
                const st = world[a.id]
                const activity = st?.activity ?? 'asleep'
                const heading = a.group && a.group !== all[i - 1]?.group
                return (
                  <Fragment key={a.id}>
                    {heading && <div className="group-head">{a.group}</div>}
                  <button draggable onDragStart={(e) => (e.dataTransfer.setData(AGENT_DRAG, a.id), (e.dataTransfer.effectAllowed = 'copy'))} className={`agent-row is-${activity} ${budgetAlerts[a.id] ? `budget-${budgetAlerts[a.id]}` : ''}`} aria-pressed={a.id === selected} onClick={() => (select(a.id), after?.())}>
                    <span className="dot" aria-hidden="true" />
                    <span className="name">
                      {a.name}
                      {mixed && <Swatch id={a.provider} label={providers?.find((p) => p.id === (a.provider ?? DEFAULT_PROVIDER))?.label ?? BRAND[DEFAULT_PROVIDER].short} />}
                      {!!prefs?.accounts.length && !!prefs.accounts.some((x) => x.provider === (a.provider ?? DEFAULT_PROVIDER)) && (
                        <i className="acct-dot" style={{ background: accountColor(prefs.accounts, a.account) }} title={`Runs on ${accountName(prefs.accounts, a.account)}`} />
                      )}
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
                    <span className="role" title={{ senior: 'A regular agent at its own desk. An agent that delegates becomes a boss; a subagent is an intern.', boss: 'Has handed work to subagents.', intern: 'A subagent, started by another agent.' }[st ? roleOf(st) : 'senior']}>{st ? roleOf(st) : 'senior'}</span>
                    <span className="activity">{activity}</span>
                    <span className="cost">{stats[a.id] ? `$${stats[a.id]!.costUsd.toFixed(2)}` : ''}</span>
                  </button>
                  </Fragment>
                )
              })
  // What the controls under each agent's message box show and can do.
  // Work this agent handed to others: the message box keeps them, and the agent's own file does not.
  const outgoingBy = useMemo(() => {
    const by = new Map<string, Extract<ChatItem, { kind: 'handoff-out' }>[]>()
    for (const m of messages) {
      if (!parseHandoff(m.text)) continue
      const list = by.get(m.fromId) ?? []
      list.push({ kind: 'handoff-out', id: `handoff:${m.id}`, at: m.at, to: allAgents.find((x) => x.id === m.toId)?.name ?? 'another agent', status: m.status, text: m.text })
      by.set(m.fromId, list)
    }
    return by
  }, [messages, allAgents])
  const outgoingOf = (a: AgentRecord) => outgoingBy.get(a.id)
  const infoOf = (a: AgentRecord): AgentInfo => {
    // Before the agent's first report there are no numbers yet, but the menus are still needed.
    const st = stats[a.id]
    const act = world[a.id]?.activity ?? 'asleep'
    return {
      model: st?.model ?? null,
      effort: st?.effort ?? null,
      fast: st?.fast ?? false,
      contextPct: st?.contextPct ?? null,
      costUsd: st?.costUsd ?? 0,
      budgetUsd: a.options?.budgetUsd,
      budgetAlert: budgetAlerts[a.id],
      linesAdded: st?.linesAdded ?? 0,
      linesRemoved: st?.linesRemoved ?? 0,
      branch: a.branch,
      canSwitch: act !== 'asleep' && ['idle', 'waiting'].includes(act),
      started: !!a.started,
      role: a.options?.role,
      tokens: st?.tokens,
      canCompact: providers?.find((p) => p.id === (a.provider ?? DEFAULT_PROVIDER))?.capabilities.compact,
      can: providers?.find((p) => p.id === (a.provider ?? DEFAULT_PROVIDER))?.capabilities,
      handbook: providers?.find((p) => p.id === (a.provider ?? DEFAULT_PROVIDER))?.handbook,
      liveLimits: providers?.find((p) => p.id === (a.provider ?? DEFAULT_PROVIDER))?.capabilities.liveLimits,
      models: providers?.find((p) => p.id === (a.provider ?? DEFAULT_PROVIDER))?.models,
      modes: providers?.find((p) => p.id === (a.provider ?? DEFAULT_PROVIDER))?.modes,
      relaunch: providers?.find((p) => p.id === (a.provider ?? DEFAULT_PROVIDER))?.relaunchModes
    }
  }
  const actionsOf = (a: AgentRecord): AgentActions => ({
    switchTo: (change) => void run(() => window.aw.reconfigure(a.id, change)),
    roles,
    setRole: (role) => void run(async () => {
      const options = await window.aw.setRole(a.id, role)
      setAgents((xs) => xs.map((x) => (x.id === a.id ? { ...x, options } : x)))
    }),
    reviewers: agents.filter((x) => x.id !== a.id && (world[x.id]?.activity ?? 'asleep') !== 'asleep').map((x) => ({ id: x.id, name: x.name })),
    askReview: (reviewer) => void askReview(a, reviewer),
    handoff: () => setHandoffFrom(a.id),
    clone: (model) => clone(a, model),
    compact: () => void run(() => window.aw.chatSend(a.id, '/compact')),
    handbook: () => openHandbook(a),
    tools: () => setView('tools'),
    finish: () => setFinishing(a.id),
    rename: () => setRenaming(a.id),
    group: () => setGrouping(true),
    remove: () => remove(a.id)
  })
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

  // First run owns the screen: while the first-run state is still being read, and while setup is open, nothing behind it can be used.
  const setupOpen = !!(prefs && providers && agentsLoaded && (setupAgain || (allAgents.length === 0 && (!prefs.setup.done || !providers.some((p) => p.detection.state === 'ready')))))
  const starting = !prefs || (!prefs.setup.done && !(providers && agentsLoaded))
  const covered = setupOpen || starting
  useEffect(() => {
    if (!covered) return
    const behind = [...document.querySelectorAll('.app > :not(.su-overlay)')]
    behind.forEach((e) => e.setAttribute('inert', ''))
    return () => behind.forEach((e) => e.removeAttribute('inert'))
  }, [covered])
  return (
    <div className="app">
      {/* A window that has no project yet (every fresh one) opens on the picker; with nothing saved there is nothing to pick, so Welcome handles it. */}
      {workspaces && !workspaces.active && workspaces.items.length > 0 && (
        <WorkspacePicker
          workspaces={workspaces}
          onOpen={(path) => void run(async () => setWorkspaces(await window.aw.activateWorkspace(path)))}
          onPick={pick}
          onForget={(path) => void run(async () => setWorkspaces(await window.aw.forgetWorkspace(path)))}
        />
      )}
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
      {finishing && agents.find((a) => a.id === finishing) && (
        <Finish
          agentId={finishing}
          agentName={agents.find((a) => a.id === finishing)!.name}
          onClose={() => setFinishing(null)}
          onDone={(removed) => {
            const id = finishing
            setFinishing(null)
            if (removed) {
              setAgents((xs) => xs.filter((a) => a.id !== id))
              setSelected((s) => (s === id ? null : s))
            }
          }}
        />
      )}
      {report === 'usage' && <UsageModal providers={providers ?? []} limits={pool} limitsAt={poolAt} accounts={prefs?.accounts ?? []} office={{ agents: agents.length, projects: new Set(agents.map((a) => a.repoPath)).size }} onRefreshLimits={() => lookLimits(true)} onClose={() => setReport(null)} />}
      {report === 'rewind' && <RewindModal providers={providers ?? []} accounts={prefs?.accounts ?? []} onClose={() => setReport(null)} />}
      {!setupOpen && starting && (
        <div className="su-overlay" role="status" aria-label="Starting">
          <div className="su-wait"><span className="su-spin" aria-hidden="true" />Getting ready…</div>
        </div>
      )}
      {setupOpen && (
        <Setup
          providers={providers}
          prefs={prefs}
          onPrefs={(patch) => {
            const next = { ...prefsNow.current!, ...patch }
            prefsNow.current = next
            setPrefs(next)
            void window.aw.setPrefs(next)
          }}
          workspaces={workspaces}
          folder={folder}
          onPick={pick}
          onOpen={(path) => void run(async () => setWorkspaces(await window.aw.activateWorkspace(path)))}
          onRescan={() => void scanProviders()}
          onHire={async (options, name, crew) => {
            // Closed before the hire lands: the crew list changes under it as agents arrive, and a late close must not undo a reopening.
            setSetupAgain(false)
            await hire(options, name)
            if (crew) await hireCrew()
          }}
          onClose={() => setSetupAgain(false)}
          reopened={setupAgain}
        />
      )}
      {handoffFrom && providers && agents.find((a) => a.id === handoffFrom) && (
        <HandoffDialog
          author={agents.find((a) => a.id === handoffFrom)!}
          others={agents.filter((a) => a.id !== handoffFrom)}
          asleep={(id) => (world[id]?.activity ?? 'asleep') === 'asleep'}
          providers={providers}
          onClose={() => setHandoffFrom(null)}
          onSend={async (to, kind, note) => {
            let sent = false
            await run(async () => {
              const created = await window.aw.sendHandoff(handoffFrom, to, kind, note)
              sent = true
              if (created) {
                setAgents((xs) => [...xs, created])
                setWorld((w) => applyEvent(w, { type: 'activity', agentId: created.id, sessionId: created.sessionId, activity: 'idle' }))
              }
            })
            return sent
          }}
        />
      )}
      {todoOpen && folder && (
        <TodoBoardModal
          folder={folder}
          focusId={todoFocus}
          agents={agents.filter((a) => a.repoPath === folder && !a.parent).map((a) => ({ id: a.id, name: a.name, provider: a.provider ?? 'claude', state: world[a.id]?.activity ?? 'asleep' }))}
          onAsk={async (agentId, message, openChat) => {
            const a = agents.find((x) => x.id === agentId)
            if (!a) throw new Error('That agent is gone.')
            if ((world[agentId]?.activity ?? 'asleep') === 'asleep') await window.aw.wakeAgent(agentId)
            await window.aw.chatSend(agentId, message)
            if (openChat) {
              setTodoOpen(false)
              select(agentId)
              setView('chat')
            }
          }}
          onClose={() => (setTodoOpen(false), setTodoFocus(null))}
          onOpenMessage={(l) => (setTodoOpen(false), openMsg(l))}
        />
      )}
      {libraryOpen && <LibraryModal folder={folder ?? ''} providers={providers ?? []} onClose={() => setLibraryOpen(false)} />}
      {settings && prefs && <Settings providers={providers ?? []} onProviders={() => void scanProviders()} onSetup={() => (setSettings(false), setSetupAgain(true))} prefs={prefs} roles={roles} onChange={(patch) => {
          // Merged with the latest saved state, so two quick changes (a text box losing focus, then a menu) both stick.
          const next = { ...prefsNow.current!, ...patch }
          prefsNow.current = next
          setPrefs(next)
          void window.aw.setPrefs(next)
        }} onClose={() => setSettings(false)} />}
      {shortcuts && <ShortcutsSheet onClose={() => setShortcuts(false)} />}
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
          onNewWindow={() => void window.aw.newWindow()}
        />
        <button className="primary" onClick={() => setHiring((h) => !h)} disabled={!folder} aria-expanded={hiring}>
          + Agent
        </button>
        <IconButton icon="history" label="History" onClick={() => setHistory((h) => !h)} disabled={!folder} expanded={history} tip="Bring back an earlier conversation from this folder" />
        {agents.length > 0 && (
          <IconButton icon="crew" label={`Subagents${crewLive > 0 ? ` ${crewLive}` : ''}`} onClick={() => setCrewOpen(true)} haspopup tip="Every agent's subagents together" badge={crewLive > 0 ? crewLive : undefined} />
        )}
        {agents.length > 0 && (
          <IconButton icon="grid" label="Grid" onClick={() => setGrid((g) => (keep('aw.grid', g ? '' : '1'), !g))} pressed={grid} tip="Show every agent at once, with the last lines of its terminal" />
        )}
        {folder && <IconButton icon="todo" label={`Todos${todoNeeds > 0 ? ` ${todoNeeds}` : ''}`} onClick={() => setTodoOpen(true)} haspopup tip={todoNeeds > 0 ? `${todoNeeds} todo${todoNeeds > 1 ? 's' : ''} need${todoNeeds > 1 ? '' : 's'} you` : 'The tasks for this project, yours and the agents\''} badge={todoNeeds > 0 ? todoNeeds : undefined} />}
        <IconButton icon="library" label="Library" onClick={() => setLibraryOpen(true)} haspopup tip="Skills, instructions and the playbook that says what agents are told" />
        <IconButton icon="money" label={`Usage${lowLimits > 0 ? ` ${lowLimits}` : ''}`} onClick={() => setReport('usage')} haspopup tip={lowLimits > 0 ? `${lowLimits} usage limit${lowLimits > 1 ? 's' : ''} nearly used up` : 'Limits and what the agents have cost'} badge={lowLimits > 0 ? lowLimits : undefined} />
        <IconButton icon="week" label="Weekly Rewind" onClick={() => setReport('rewind')} haspopup tip="Your week of agent work" />
        {error && <span className="error">{error}</span>}
        <IconButton className="push" icon="keyboard" label="Shortcuts" onClick={() => setShortcuts(true)} haspopup tip={hint('shortcuts')} />
        <IconButton icon="gear" label="Settings" onClick={() => setSettings(true)} tip="Notifications, defaults for new agents, where each program is" />
        <IconButton icon="panel" label={showPanel ? 'Hide panel' : 'Show panel'} onClick={() => (panes ? setPeek((o) => !o) : narrow ? setDrawer((o) => !o) : setPanelOpen((o) => !o))} expanded={showPanel} tip={showPanel ? 'Hide panel' : 'Show panel'} />
      </header>
      <main>
        <div className="stage-wrap" onDragOver={(e) => e.preventDefault()} onDrop={dropOnStage}>
          <div className="stage" ref={stage} />
          {cardData && cardAt && cardAt.mode !== 'panel' && (
            <div key={flash} className={`profile-overlay ${flash ? 'flash' : ''}`} data-side={cardAt.side} data-mode={cardAt.mode} style={{ [cardAt.side]: 10, top: 10, width: cardAt.size!.w, maxHeight: cardMaxHeight({ stageH: stageBox.h, side: cardAt.side, drawerH }) }}>
              <ProfileCard data={cardData} variant={cardAt.mode} now={clock} edit={cardEdit} onClose={() => setCardOpen(false)} onToggleSize={() => setCardSize(cardAt.mode === 'full' ? 'compact' : 'full')} />
            </div>
          )}
          {grid && agents.length > 0 && (
            <div className="grid-area">
              <div className="grid-bar" role="toolbar" aria-label="Grid layout">
                <button aria-pressed={!paneLayout} onClick={() => changeLayout(null)} title="Every agent as a tile with the last lines of its terminal">
                  Overview
                </button>
                <button
                  aria-pressed={!!paneLayout}
                  onClick={() => !paneLayout && changeLayout({ root: even([current?.id ?? agents[0]!.id]) })}
                  title="Conversations and terminals side by side: drag them in from the list, and the grid fits itself to them"
                >
                  Conversations
                </button>
                {paneLayout && (
                  <>
                    <button className="push" onClick={() => changeLayout({ root: addAll(paneLayout.root, agents.map((a) => a.id)) })} title="Put every agent in the grid">
                      Add all
                    </button>
                    <button onClick={() => void newTerminal()} title="A terminal in the project folder">
                      + Terminal
                    </button>
                    <button onClick={() => changeLayout({ root: even(tilesOf(paneLayout.root)) })} title="Give every tile an equal share of the space again">
                      Even out
                    </button>
                    <button onClick={() => changeLayout({ root: null })} title="Take everything out of the grid (agents keep working)">
                      Empty grid
                    </button>
                  </>
                )}
              </div>
              {paneLayout ? (
                <PaneGrid
                  layout={paneLayout}
                  agents={agents}
                  activity={(id) => world[id]?.activity ?? 'asleep'}
                  modeOf={(id) => world[id]?.mode}
                  onChange={changeLayout}
                  onOpen={(id) => (setPeek(true), select(id))}
                  hidden={inPanel}
                  folderName={folderName}
                  onNewTerminal={(drop) => void newTerminal(drop)}
                  renderChat={(a) => chatFor(a, true, `pane-${a.id}`)}
                />
              ) : (
                <GridView
                  selected={selected}
                  onOpen={(id) => select(id)}
                  inPanel={agents.find((a) => a.id === inPanel)?.name ?? null}
                  tiles={agents.filter((a) => a.id !== inPanel).map((a) => ({
                    agent: a,
                    activity: world[a.id]?.activity ?? 'asleep',
                    detail: world[a.id]?.detail,
                    mode: world[a.id]?.mode,
                    stats: stats[a.id],
                    needs: needsOf(a.id)[0] ? needTitle(needsOf(a.id)[0]!).toLowerCase() : null
                  }))}
                />
              )}
            </div>
          )}
          {/* The zoom and Terminal buttons are the office canvas's: with the grid showing in its place there is nothing for them to act on. */}
          {!(grid && agents.length > 0) && (
            <div className="stage-ctl" style={{ bottom: termOpen && folder ? termH + 10 : 10 }}>
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
              {folder && (
                <div className="zoom-ctl" role="group" aria-label="Terminals">
                  <button className="term-btn" onClick={toggleTerm} aria-pressed={termOpen} aria-controls="terminal-drawer" title={`Show or hide the terminals in this project (${keysOf('terminals')})`}>
                    <span className="term-gl" aria-hidden="true">&gt;_</span>
                    Terminal
                    {termCount > 0 && <span className="term-count" aria-label={`${termCount} terminal${termCount === 1 ? '' : 's'}`}>{termCount}</span>}
                  </button>
                </div>
              )}
            </div>
          )}
          <TerminalDrawer folder={folder} folderName={folderName} open={termOpen && !!folder} height={termH} onHeight={(h) => (setTermH(h), keep('aw.termH', String(h)))} onHide={toggleTerm} onShow={showTerm} onCount={setTermCount} ask={current ? { agentId: current.id, onAttached: showChat } : undefined} />
          {tip && (
            <FloatingTip x={tip.x} y={tip.y}>
              <PlantTip five={tip.five} week={tip.week} pool={pool} accounts={prefs?.accounts ?? []} providers={providers ?? []} />
            </FloatingTip>
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
          {crewOpen && <CrewView agents={agents.map((a) => ({ id: a.id, name: a.name }))} waitingOf={waitingOf} onOpen={select} onClose={() => setCrewOpen(false)} />}
          {history && folder && <History folder={folder} onResume={resume} onClose={() => setHistory(false)} />}
          {hiring && (
            <Modal label="Hire an agent dialog" className="hire-dialog" onClose={() => setHiring(false)}>
              <HireForm folder={folder ?? ''} providers={(providers ?? []).filter((p) => p.detection.state === 'ready')} defaultProvider={prefs?.defaults.provider || prefs?.setup.defaultProvider || ''} roles={roles} defaults={prefs?.defaults ?? { provider: '', model: '', permissionMode: '', inPlace: false, accounts: {} }} accounts={prefs?.accounts ?? []} roleModels={prefs?.roleModels ?? {}} onHire={hire} onCancel={() => setHiring(false)} onSaveRole={async (title, options) => void (await window.aw.saveRole({ title, blurb: options.instructions?.slice(0, 120) ?? '', options }), setRoles(await window.aw.listRoles(folder ?? '')))} />
            </Modal>
          )}
          {agents.length > 0 && (
            <nav className="roster" aria-label="Agents" hidden={folded}>
              {rosterRows()}
            </nav>
          )}
          {current ? (
            null
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
          {current && (
            <section className="head-compact" aria-label="Selected agent">
              <button onClick={() => step(-1)} aria-label="Previous agent" title="Previous agent in this project" className="hc-step hc-prev" />
              <button onClick={() => step(1)} aria-label="Next agent" title="Next agent in this project" className="hc-step hc-next" />
              <span className="hc-wrap" ref={switchWrap}>
                <button className="hc-switch" onClick={() => setSwitcher((o) => !o)} aria-haspopup="menu" aria-expanded={switcher} aria-label="Agents" title="All agents in this project">
                  {agents.length}
                  <span aria-hidden="true">▾</span>
                </button>
                {switcher && (
                  <div className="sw-pop" role="menu" aria-label="Agents">
                    <nav className="roster" aria-label="Agent list">
                      {rosterRows(() => setSwitcher(false))}
                    </nav>
                    <div className="sw-foot">
                      <button onClick={() => (setSwitcher(false), setHiring(true))}>+ Agent</button>
                    </div>
                  </div>
                )}
              </span>
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
                <b className="hc-name" role="button" tabIndex={0} title="Click for its profile card, double-click to rename" onClick={showCard} onKeyDown={(e) => e.key === 'Enter' && showCard()} onDoubleClick={() => setRenaming(current.id)}>
                  {current.name}
                </b>
              )}
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
                current.group && (
                  <button className="group-tag" onClick={() => setGrouping(true)} title="Change this agent's group">
                    {current.group}
                  </button>
                )
              )}
              <span className={`hc-state is-${state?.activity ?? 'asleep'}`}>{state?.activity ?? 'asleep'}</span>
              {state?.mode && state.mode !== 'default' && (
                <span className="hc-mode" style={{ color: cssColor(modeInfo(state.mode).color) }}>
                  {modeInfo(state.mode).label}
                </span>
              )}
              {cur && <span className="hc-cost">${cur.costUsd.toFixed(2)}</span>}
              {agents.some((a) => a.id !== current.id && needsOf(a.id).length > 0) && (
                <button className="ask-pill" onClick={() => setSwitcher(true)} title="Another agent is waiting for you">
                  others waiting
                </button>
              )}
            </section>
          )}
          {cardData && (
            cardAt?.mode === 'panel' && (
              <div key={flash} className={`profile-dock ${flash ? 'flash' : ''}`}>
                <ProfileCard data={cardData} variant="docked" now={clock} edit={cardEdit} onClose={() => setCardOpen(false)} />
              </div>
            )
          )}
          {current && state?.tasks && state.tasks.length > 0 && (
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
              {(hasLibrary || view === 'library') && (
                <button role="tab" aria-selected={view === 'library'} onClick={() => setView('library')} title="What the library told this agent and what it did about it">
                  Library
                </button>
              )}
              <button role="tab" aria-selected={view === 'traces'} onClick={() => setView('traces')} title="Messages between agents">
                Traces{messages.length ? ` ${messages.length}` : ''}
              </button>
              {fileTab[current.id] && (
                <button role="tab" aria-selected={view === 'file'} onClick={() => setView('file')} title={fileTab[current.id]}>
                  {fileTab[current.id]!.split('/').pop()}
                </button>
              )}
              <button role="tab" aria-selected={view === 'preview'} onClick={() => setView('preview')}>
                Preview{(servers[current.id] ?? []).some((s) => s.alive) ? ' ●' : ''}
              </button>
              <button className="push icon-btn" onClick={() => setWide((w) => !w)} aria-pressed={wide} aria-label={wide ? 'Narrow' : 'Expand'} title={wide ? 'Narrow the panel' : 'Give the panel more room'}>
                {wide ? '⤡' : '⤢'}
              </button>
            </div>
          )}
          {agents.map((a) => chatFor(a, a.id === selected && view === 'chat'))}
          <div className="terminals" hidden={view !== 'terminal'}>
            {agents.map((a) => (
              <TerminalView key={a.id} ptyId={a.id} visible={a.id === selected && view === 'terminal'} focusTick={focusTick} ask={{ agentId: a.id, onAttached: showChat }} />
            ))}
          </div>
          {current && view === 'file' && fileTab[current.id] && (
            <FileView
              key={`${current.id}:${fileTab[current.id]}`}
              agentId={current.id}
              path={fileTab[current.id]!}
              onClose={() => (setFileTab((t) => Object.fromEntries(Object.entries(t).filter(([k]) => k !== current.id))), setView('chat'))}
              onAttached={() => (chooseTalk('chat'), setFocusTick((n) => n + 1))}
            />
          )}
          {current && view === 'preview' && <PreviewView key={current.id} folder={current.repoPath} servers={servers[current.id] ?? []} agentName={current.name} agentId={current.id} target={previewTarget[current.id]} onAttached={() => (chooseTalk('chat'), setFocusTick((n) => n + 1))} />}
          {current && view === 'traces' && <TracesView messages={messages} agents={agents} currentId={current.id} />}
          {current && view === 'library' && <AgentLibrary key={current.id} agentId={current.id} agentName={current.name} />}
          {current && view === 'tools' && <ToolsView key={current.id} agentId={current.id} />}
          {current && view === 'code' && <CodePanel key={current.id} agentId={current.id} agentName={current.name} workDone={state?.files ?? 0} inPlace={current.branch ? undefined : { path: current.cwd }} openFile={openFile} onOpenChat={() => (chooseTalk('chat'), setFocusTick((n) => n + 1))} />}
        </aside>
        {current && subs[current.id] && (
          <SubagentPanel
            key={current.id}
            agentId={current.id}
            agentName={current.name}
            ids={subs[current.id]!.ids}
            active={subs[current.id]!.active}
            onActive={(id) => openSub(current.id, id)}
            onClose={(id) => closeSub(current.id, id)}
            onCloseAll={() => setSubs(({ [current.id]: _, ...rest }) => rest)}
            onOpen={(id) => openSub(current.id, id)}
          />
        )}
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

/** A tooltip beside the pointer that never leaves the area it floats in: it flips to the pointer's other side, or slides up, when it would spill out. */
function FloatingTip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ left: x + 14, top: y + 14 })
  useLayoutEffect(() => {
    const box = el.current
    const area = box?.offsetParent as HTMLElement | null
    if (!box || !area) return
    const w = box.offsetWidth
    const h = box.offsetHeight
    const left = x + 14 + w > area.clientWidth - 4 ? Math.max(4, x - w - 14) : x + 14
    const top = y + 14 + h > area.clientHeight - 4 ? Math.max(4, area.clientHeight - h - 4) : y + 14
    setAt((p) => (p.left === left && p.top === top ? p : { left, top }))
  })
  return (
    <div ref={el} className="tip" style={at} role="tooltip">
      {children}
    </div>
  )
}

function PlantTip({ five, week, pool, accounts, providers }: { five: LimitView; week: LimitView; pool: LimitWindow[]; accounts: Prefs['accounts']; providers: ProviderInfo[] }) {
  if (pool.length === 0)
    return (
      <>
        <b>Your usage limits</b>
        <span>{window_('5-hour', five)}</span>
        <span>{window_('Weekly', week)}</span>
        <span className="tip-note">Shared by every agent signed in to your account.</span>
      </>
    )
  // The tanks show the tightest allowance of each kind; here is every one it was picked from.
  return (
    <>
      <b>Your usage limits</b>
      <span className="tip-note">The tanks show the tightest of each kind; the moons above one are its logins.</span>
      <LimitBoard pool={pool} accounts={accounts} providers={providers} />
    </>
  )
}
