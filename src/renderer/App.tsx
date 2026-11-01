import { DEFAULT_PROVIDER } from '../shared/types'
import { BRAND } from '../shared/brand'
import { Fragment, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LimitWindow, AgentMessage, AgentOptions, AgentProfile, AgentRecord, AgentStats, Decision, Effort, PermissionRequest, Prefs, ProviderId, ProviderInfo, RemoteState, TerminalMenu } from '../shared/types'
import { CodePanel, type OpenRequest } from './code/CodePanel'
import { PixelWord } from './PixelWord'
import { EFFORTS, HireForm, MODELS } from './panel/HireForm'
import { Modal } from './panel/Modal'
import { PREVIEW_EVENT } from './links'
import { gitTag, type DevServer, type Workspaces } from '../shared/api'
import { BUILT_IN_ROLES, STARTER_CREW, type Role } from '../shared/roles'
import { ModBar, ModStyle, ShotAsk, WidgetSlot } from './chat/layoutUi'
import { type MeterName, metersFor, todosUpdatedBy } from '../shared/widgets'
import { WorkspaceMenu, type WorkspaceActivity } from './panel/WorkspaceMenu'
import { Identicon } from './panel/Identicon'
import { QuickPanel } from './panel/QuickPanel'
import { agentsByRecent } from '../shared/recent'
import { useHoverMenu } from './panel/hoverMenu'
import { agentDot, agentMarks, createDoneTracker, projectDot } from '../shared/attention'
import { WorkspacePicker } from './panel/WorkspacePicker'
import { TerminalDrawer } from './panel/TerminalDrawer'
import { useConfirm } from './panel/ConfirmDialog'
import { type LimitView, type UsageLimits, limitView, noLimits, untilReset } from '../shared/usage'
import { PICKABLE_MODES, cssColor, modeInfo } from '../shared/modes'
import { effortsFor } from '../shared/efforts'
import { InputDialog, needTitle, type Need, type NeedActions } from './panel/InputDialog'
import { mentionText } from '../shared/mention'
import { Welcome } from './panel/Welcome'
import { ChatView } from './chat/ChatView'
import type { AgentActions, AgentInfo } from './chat/AgentControls'
import { PreviewView } from './panel/PreviewView'
import { keepPreviews } from './panel/previewKeep'
import { FileView } from './panel/FileView'
import { pageLabels } from './files/context'
import { MemoryView } from './panel/MemoryView'
import { CrewView } from './chat/CrewView'
import { staleInterns } from './chat/crewRows'
import { reactTo, resumedUnseen } from './chat/subagentMessage'
import { SubagentPanel } from './chat/SubagentPanel'
import { OPEN_SUBAGENT } from './chat/subagentEvents'
import { History } from './panel/History'
import { Palette } from './panel/Palette'
import { ShortcutsSheet } from './panel/ShortcutsSheet'
import { requestAddSelection } from './addSelection'
import { hint, keysOf, matches, tabNumber } from './shortcuts'
import { Switcher, type Tile } from './panel/Switcher'
import { useSwitcher, type Flight } from './panel/useSwitcher'
import { waitWord, waitsForPerson } from '../shared/waits'
import { GridView } from './panel/GridView'
import { AGENT_DRAG, PaneGrid, type GridLayout, type TerminalDrop } from './panel/PaneGrid'
import { OPEN_KEY, openOf, readOpen, saveOpen, setOpen } from './panel/termMemory'
import { MEMORY_KEY, conversationsRoot, type Slot, pruneViews, readMemory, saveMemory, setSlot, setView as withView, slotOf, termTiles } from './panel/gridMemory'
import { type Node, add, addAll, even, isTerm, mapTiles, place, tilesOf } from './panel/tiling'
import { TracesView } from './panel/TracesView'
import { AgentLibrary } from './panel/AgentLibrary'
import { useLibraryUses } from './chat/LibrarySlips'
import { type HeaderIconName, IconButton, OutlineIcon } from './panel/IconButton'
import { ViewTab } from './panel/ViewTab'
import { OfficeRail } from './panel/OfficeRail'
import { sideWidth } from './panel/sidePane'
import { officeHidden } from './officeHidden'
import { createBatcher } from './batch'
import { UpdateChip } from './panel/UpdateChip'
import { WhatsNew } from './panel/ReleaseNotes'
import { justUpdated, learnsVersion } from '../shared/updatedNote'
import { Settings } from './panel/Settings'
import { LibraryModal } from './panel/LibraryModal'
import { TodoBoardModal } from './todos/TodoBoardModal'
import { OPEN_MESSAGE, OPEN_TODO, setTodoBoard, todoBoardNow, useTodoVersion } from './todos/todoStore'
import type { MessageLink } from '../shared/todos'
import { Setup } from './panel/Setup'
import type { ChatItem } from '../shared/chat'
import { parseHandoff } from '../shared/handoff'
import { HandoffDialog } from './panel/HandoffDialog'
import { banks, claudeWindows, lowCount, pooled } from '../shared/limits'
import { Swatch } from './panel/ProviderTag'
import { RewindModal } from './stats/RewindModal'
import { UsageModal } from './stats/UsageModal'
import { WorkflowsModal } from './workflows/WorkflowsModal'
import { useWorkflows } from './workflows/useWorkflows'
import { WorkflowTab } from './workflows/WorkflowTab'
import { RemoteHead } from './chat/RemoteControl'
import { StepCard } from './workflows/StepCard'
import { RunTrack } from './workflows/RunTrack'
import { useLandingHolds } from './workflows/useLandingHolds'
import { GROUP_STANDS, gateTiles, groupKeyOf } from '../shared/insights'
import { landingPill, trackOf } from '../shared/runTrack'
import { landingKind } from '../shared/workflow'
import { pendingPlans } from '../shared/runs'
import { checkPanels, refusedAsk, toRunSteps, waitingSteps } from '../shared/steps'
import { IdentityChip } from './panel/IdentityChip'
import { billboardLine, profileFor, type IdentityState } from '../shared/identity'
import { WorkflowGates } from './workflows/WorkflowGates'
import { defaultWorkflow, windingDown, withDefault, workflowsShown } from '../shared/workflows'
import { TerminalView } from './panel/TerminalView'
import { OfficeWorld } from './world/World'
import type { CardData } from './profile/facts'
import { cardLayout, cardMaxHeight } from './profile/layout'
import { onRevealRightClick } from './files/reveal'
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
  const folderRef = useRef(folder)
  folderRef.current = folder
  // Each agent belongs to the folder it was hired in: switching folders shows that folder's crew, and the rest keep working in the background.
  const agents = useMemo(() => (folder ? allAgents.filter((a) => a.repoPath === folder) : allAgents), [allAgents, folder])
  const [dirty, setDirty] = useState<{ id: string; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  // The person hid the office to give the chat the window (and spare the battery); remembered, per window.
  const [officeOff, setOfficeOff] = useState(() => store('aw.officeHidden') === '1')
  const [railSlim, setRailSlim] = useState(() => store('aw.railSlim') === '1')
  const [railW, setRailW] = useState<number | null>(() => Number(store('aw.railw')) || null)
  // Below this width the panel would squeeze the office, so it becomes a drawer over it, closed until needed.
  const narrow = useNarrow()
  const [drawer, setDrawer] = useState(false)
  const [trusts, setTrusts] = useState<Record<string, string>>({})
  const [focusTick, setFocusTick] = useState(0)
  const [view, setView] = useState<'chat' | 'terminal' | 'code' | 'tools' | 'preview' | 'traces' | 'library' | 'workflow' | 'file'>(readTalk)
  const [wide, setWide] = useState(false)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [hiring, setHiring] = useState(false)
  const [history, setHistory] = useState(false)
  const [crewOpen, setCrewOpen] = useState(false)
  const wf = useWorkflows()
  const landingHolds = useLandingHolds()
  const [report, setReport] = useState<'usage' | 'rewind' | 'workflows' | null>(null)
  // A run the Workflows window was opened on, from a tile in an agent's tab.
  const [runFocus, setRunFocus] = useState<string | null>(null)
  // The profile card of the selected agent: shown or hidden (kept), where it goes, and what it shows.
  const [cardOpen, setCardOpen] = useState(false)
  // The terminals drawer under the office: shown or hidden, how tall, and how many terminals the project has.
  // Each workspace has its own: the drawer opened in one project is not open in the next.
  const [termMem, setTermMem] = useState(() => readOpen(store(OPEN_KEY)))
  const termOpen = openOf(termMem, folder ?? '')
  const [termSideW, setTermSideW] = useState<number | null>(() => Number(store('aw.termSideW')) || null)
  const [vw, setVw] = useState(() => window.innerWidth)
  useEffect(() => {
    const on = () => setVw(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  // The pane at the right of the chat starts under the top bar, whatever its height is.
  useEffect(() => {
    const h = document.querySelector('.app > header')
    if (h) document.documentElement.style.setProperty('--hdr', `${(h as HTMLElement).offsetHeight}px`)
  }, [vw])
  const [termH, setTermH] = useState(() => Math.max(110, Number(store('aw.termH')) || 230))
  const [termCount, setTermCount] = useState(0)
  const setTermOpen = useCallback(
    (open: (was: boolean) => boolean) =>
      setTermMem((m) => {
        const key = folderRef.current ?? ''
        const next = setOpen(m, key, open(openOf(m, key)))
        keep(OPEN_KEY, saveOpen(next))
        return next
      }),
    []
  )
  const showTerm = useCallback(() => setTermOpen(() => true), [setTermOpen])
  const toggleTerm = useCallback(() => setTermOpen((o) => !o), [setTermOpen])
  // Right-click on a path anywhere in the app offers Reveal in Finder.
  useEffect(() => {
    document.addEventListener('contextmenu', onRevealRightClick)
    return () => document.removeEventListener('contextmenu', onRevealRightClick)
  }, [])
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
  // How many logins (a program's own and each account) wait for a sign-in: the dot on Settings and on its Accounts page.
  const [signIns, setSignIns] = useState(0)
  useEffect(() => {
    const ask = () => void window.aw.accountsNeedingSignIn().then(setSignIns, () => {})
    ask()
    window.addEventListener('focus', ask)
    const every = setInterval(ask, 60_000)
    return () => (window.removeEventListener('focus', ask), clearInterval(every))
  }, [settings])
  const [shortcuts, setShortcuts] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  // Where Settings opens when a link to one of its pages (the Library's off notice) asked for it.
  const [settingsPane, setSettingsPane] = useState<string | undefined>(undefined)
  // The todo board of the open project, how many of its tasks wait on you, and the message a task asked to be opened at.
  const [todoOpen, setTodoOpen] = useState(false)
  const [todoNeeds, setTodoNeeds] = useState(0)
  useTodoVersion() // a widget's todo count follows the board
  const [notesKey, setNotesKey] = useState(false)
  useEffect(() => void window.aw.notes.shortcut().then(setNotesKey, () => setNotesKey(false)), [])
  const [todoFocus, setTodoFocus] = useState<string | null>(null)
  const [jump, setJump] = useState<{ agentId: string; itemId: string; excerpt: string; n: number } | null>(null)
  useEffect(() => {
    if (!folder) return (setTodoNeeds(0), setTodoBoard(null))
    const load = () => void window.aw.todos.get(folder).then((r) => (setTodoBoard(r.board), setTodoNeeds(r.board.todos.filter((t) => t.needsYou && t.status !== 'done').length)), () => undefined)
    load()
    return window.aw.onTodosChanged(load)
  }, [folder])
  // The notes window asked an agent about a task or gave it one: the message goes into the agent's chat from here, and the chat is shown.
  useEffect(
    () =>
      window.aw.onNotesAsk(async ({ agentId, message }) => {
        if ((world[agentId]?.activity ?? 'asleep') === 'asleep') await window.aw.wakeAgent(agentId)
        await window.aw.chatSend(agentId, message)
        select(agentId)
        setView('chat')
      }),
    [world, folder] // eslint-disable-line react-hooks/exhaustive-deps
  )
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
  // Each agent's remote control as the main process last reported it; an agent not listed has it off.
  const [remotes, setRemotes] = useState<Record<string, RemoteState>>({})
  const [agentsLoaded, setAgentsLoaded] = useState(false)
  const [setupAgain, setSetupAgain] = useState(false)
  // A provider the hire form sent to setup: its install or sign-in starts as setup opens.
  const [setupFor, setSetupFor] = useState<ProviderId | null>(null)
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
  // In a narrow panel the tab strip scrolls sideways, so the tab chosen is brought into view.
  useEffect(() => {
    document.querySelector('.tabs [role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [view])
  // Each workspace is left as it was: office or grid, and the grid's layout. null layout shows the overview tiles, otherwise conversations side by side.
  const [gridMemory, setGridMemory] = useState(() => readMemory(store(MEMORY_KEY), { grid: store('aw.grid'), layout: store('aw.gridLayout') }))
  const slot = slotOf(gridMemory, folder ?? '')
  const grid = slot.grid
  const paneLayout: GridLayout | null = slot.layout
  const rememberGrid = (patch: Partial<Slot>) => setGridMemory((m) => {
    const next = setSlot(m, folder ?? '', patch)
    keep(MEMORY_KEY, saveMemory(next))
    return next
  })
  // A pane's terminal choice goes with its tile: an agent taken out of the grid and put back again starts as a chat.
  // What the grid held when Overview was chosen, so Conversations opens on it again.
  const beforeOverview = useRef<Record<string, Node | null | undefined>>({})
  const changeLayout = (l: GridLayout | null) => rememberGrid({ layout: l, views: pruneViews(slot.views, l?.root ?? null) })
  // With conversations laid out in the grid, the grid is where they live: the side panel stays out of the way until you ask for it.
  const [peek, setPeek] = useState(false)
  // A local link clicked anywhere in a chat opens in that agent's Preview tab.
  // The file each agent has open in its File tab.
  const agentsRef = useRef<AgentRecord[]>([])
  agentsRef.current = allAgents
  const [fileTab, setFileTab] = useState<Record<string, string>>({})
  const [previewTarget, setPreviewTarget] = useState<Record<string, { url: string; n: number }>>({})
  const [previewed, setPreviewed] = useState<string[]>([])
  // The terminals in the grid cells. One that leaves its cell (closed, replaced, the layout dropped) is closed for good, unless another workspace has it.
  const shellsOpen = useRef(new Set<string>())
  useEffect(() => {
    const now = new Set(termTiles(gridMemory))
    for (const id of shellsOpen.current) if (!now.has(id)) window.aw.closeShell(id)
    shellsOpen.current = now
  }, [gridMemory])
  // After a restart the shells of an earlier run are gone: a workspace's grid gets a new shell in each of their cells when it is opened.
  useEffect(() => {
    if (!folder) return
    const dead = tilesOf(slotOf(gridMemory, folder).layout?.root ?? null).filter(isTerm)
    if (!dead.length) return
    let stale = false
    void window.aw.listShells().then(async (live) => {
      const gone = dead.filter((t) => !live.includes(t))
      if (!gone.length || stale) return
      const fresh = new Map<string, string>()
      for (const t of gone) fresh.set(t, await window.aw.openShell(folder))
      if (stale) return void fresh.forEach((id) => window.aw.closeShell(id))
      setGridMemory((m) => {
        const next = setSlot(m, folder, { layout: { root: mapTiles(slotOf(m, folder).layout?.root ?? null, (t) => fresh.get(t) ?? t) } })
        keep(MEMORY_KEY, saveMemory(next))
        return next
      })
    })
    return () => {
      stale = true
    }
    // Once for each workspace shown, not on every change to its layout.
  }, [folder])
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const prefsNow = useRef<Prefs | null>(null)
  useEffect(() => void window.aw.getPrefs().then((p) => ((prefsNow.current = p), setPrefs(p))), [])
  // The audit runs at every dial but economy; steps and plans waiting for the person are what the Workflows button counts.
  const stepCtx = { auditOn: prefs?.workflows.dial !== 'economy' }
  // A project's workflow file whose check commands are not approved: its checks wait for the person.
  const ctxFor = (r: { id: string }) => ({ ...stepCtx, approved: !wf.unapproved.includes(r.id) })
  // The Workflows window and its count are about the project that is open, as the agent list is.
  const projectRuns = folder ? wf.runs.filter((r) => r.project === folder) : wf.runs
  // Everything a run waits for the person for (a plan, check commands, an approval, audit findings, Land): the Workflows count, and the same sign beside the agent that a permission request gets.
  const waits = waitsForPerson(wf.runs, ctxFor, landingHolds, folder ? { project: folder, agents: new Set(agents.map((a) => a.id)) } : undefined)
  const needsYou = waits.length
  // What every project's runs wait on, for the project switcher: the list above is the open project's alone, but another project's plan or approval is a wait for you too.
  const waitsEverywhere = waitsForPerson(wf.runs, ctxFor, landingHolds)
  const patchPrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefsNow.current!, ...patch }
    prefsNow.current = next
    setPrefs(next)
    void window.aw.setPrefs(next)
  }
  // After an update the app says so once: the version is remembered the moment the line is first shown (so a reload or the next start does not show it again), and the line
  // stays for this session until it is dismissed. The first start, and a downgrade, only learn the version.
  const [appVersion, setAppVersion] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const [bannerFor, setBannerFor] = useState('')
  useEffect(() => void window.aw.appInfo().then((i) => setAppVersion(i.version), () => undefined), [])
  useEffect(() => {
    if (!prefs || !appVersion) return
    if (justUpdated(prefs.seenVersion, appVersion)) {
      setBannerFor(appVersion)
      patchPrefs({ seenVersion: appVersion })
    } else if (learnsVersion(prefs.seenVersion, appVersion)) patchPrefs({ seenVersion: appVersion })
  }, [prefs?.seenVersion, appVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const updatedBanner = !!appVersion && bannerFor === appVersion
  // The world builds asynchronously; agents that arrived first must be synced once it exists.
  const [officeReady, setOfficeReady] = useState(false)
  const [talk, setTalk] = useState<Talk>(readTalk)
  // The agent list and details fold into one line to leave the room to the conversation.
  // Folded away by default; the switcher in the slim header stands in for the list. Tests open it with aw.compact=0.
  const compact = store('aw.compact') !== '0'
  const [panelW, setPanelW] = useState<number | null>(() => Number(store('aw.panelw')) || null)
  // The agent switcher in the slim header: resting on it opens a grid of the agents, a click keeps it open until a click elsewhere.
  const sw = useHoverMenu()
  // When each agent last did something, read as the Agents panel opens and left alone while it is open: the tiles do not move under the pointer.
  const [seenAt, setSeenAt] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!sw.open) return setSeenAt({})
    let alive = true
    void window.aw.listAgents().then((list) => alive && setSeenAt(Object.fromEntries(list.map((a) => [a.id, a.activeAt ?? 0]))))
    return () => {
      alive = false
    }
  }, [sw.open])
  const openSwitcher = () => !sw.pinned && sw.menu.click()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [grouping, setGrouping] = useState(false)
  const [stats, setStats] = useState<Record<string, AgentStats>>({})
  const [budgetAlerts, setBudgetAlerts] = useState<Record<string, 'near' | 'over'>>({})
  // Selecting an agent, even the one already selected, means "type to it": always hand focus to its terminal.
  // The card goes away when you click anywhere outside it (its own name in the header opens it again) or press Esc.
  useEffect(() => {
    if (!cardOpen) return
    const away = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest('.pc, .hc-name, .pc-menu, .rail-agent[aria-pressed="true"]')) setCardOpen(false)
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

  // "Switch all agents here" changes the agents' accounts in the main process, one after another: the list shown here is read again as each one settles, so the roster, cards and allowances follow with no reload.
  useEffect(
    () =>
      window.aw.onAccountsSwitch((r) => {
        if (r.state === 'stopping' || r.state === 'starting' || r.state === 'left') return
        void window.aw.listAgents().then((list) => setAgents(list.filter((a) => !a.builder)))
        void lookLimits(true)
      }),
    [lookLimits]
  )
  useEffect(() => {
    void window.aw.listAgents().then((all) => {
      // The builder's agent is the builder's own: it is in no list of agents (it is shown in the builder, from the record that opened it).
      const list = all.filter((a) => !a.builder)
      setAgents(list)
      setAgentsLoaded(true)
      // Back where you were after a reload or a restart: the agent you had open is open again (asleep ones offer to wake).
      const last = store('aw.selected')
      if (last && list.some((a) => a.id === last)) setSelected(last)
      setWorld((w) => list.reduce((acc, a) => applyEvent(acc, a.online ? { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: a.activity ?? 'idle' } : { type: 'session-end', agentId: a.id, sessionId: a.sessionId }), w))
    })
    // Agent events and stats come in a stream; they are applied together every 150 ms, so the whole app is redrawn once for the lot, not once for each.
    const later = createBatcher(150)
    const offs = [
      later.stop,
      window.aw.onAgentEvent((e) => {
        later(() => setWorld((w) => applyEvent(w, e)))
        // A subagent another program was asked to do (through the office) opens in the panel as it starts: nobody else would tell you it is there.
        if (e.type === 'subagent-start') void window.aw.subagents(e.agentId).then((l) => l.some((i) => i.agentId === e.subagentId && i.toolUseId.startsWith('spawn:')) && openSub(e.agentId, e.subagentId), () => {})
        if (e.type === 'subagent-stop') sentAway.current.set(e.subagentId, Date.now())
        if (e.type === 'activity' && e.tool === 'SendMessage' && e.target && !e.subagentId) void messageSubagent(e.agentId, e.sessionId, e.target)
        // The main process marks an agent started on its first real activity; mirror it so Clone unlocks.
        if (e.type === 'activity' && !e.subagentId) setAgents((xs) => (xs.some((a) => a.id === e.agentId && !a.started) ? xs.map((a) => (a.id === e.agentId ? { ...a, started: true } : a)) : xs))
      }),
      window.aw.onTerminalMenu((id, m) => setTermMenus((t) => ({ ...t, [id]: m }))),
      window.aw.onRemote((id, s) => setRemotes((r) => ({ ...r, [id]: s }))),
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
      window.aw.onAgentStats((id, s) => later(() => setStats((all) => ({ ...all, [id]: s })))),
      window.aw.onBudgetAlert((id, level) => setBudgetAlerts((all) => ({ ...all, [id]: level }))),
      // A notice clicked for an agent of another project opens that project first: its agent is not in the open project's list.
      window.aw.onSelectAgent(async (id) => {
        const to = agentsRef.current.find((a) => a.id === id)?.repoPath
        if (to && to !== folderRef.current) setWorkspaces(await window.aw.activateWorkspace(to))
        select(id)
      }),
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
  // An agent that is only waiting for the person's word on a run raises its hand in the office, as for a permission.
  const askedOffice = <T extends { activity: string }>(id: string, st: T): T => (['idle', 'waiting'].includes(st.activity) && waits.some((w) => w.agentId === id) ? { ...st, activity: 'permission' } : st)
  useEffect(() => {
    office.current?.sync(
      agents.map((a) => ({ id: a.id, name: a.name, selected: a.id === selected, tasksDone: wf.runs.filter((r) => r.agent === a.id && r.status === 'done').length, taskOpen: wf.runs.some((r) => r.agent === a.id && r.status === 'open'), contextPct: stats[a.id]?.contextPct ?? null, state: askedOffice(a.id, world[a.id] ?? { activity: 'asleep', interns: {}, files: 0 }), inbox: messages.filter((m) => m.toId === a.id && m.status === 'queued').length, cloneOf: a.cloneOf, linesChanged: (stats[a.id]?.linesAdded ?? 0) + (stats[a.id]?.linesRemoved ?? 0), reading: (reading[a.id]?.until ?? 0) > Date.now(), readingName: reading[a.id]?.item }))
    )
  })

  const current = agents.find((a) => a.id === selected) ?? null
  useEffect(() => {
    if (view === 'preview' && current) setPreviewed((p) => keepPreviews(p, current.id))
  }, [view, current?.id])
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
  // Who this project acts as, read again when Settings closes (where it is changed) and when the project changes.
  const [identity, setIdentity] = useState<IdentityState | null>(null)
  useEffect(() => void (settings || window.aw.identity.state().then(setIdentity, () => undefined)), [folder, settings])
  const identityLine = folder && identity ? billboardLine(profileFor(identity.identity, folder), identity.logins) : null
  useEffect(() => {
    office.current?.setWorkspace(folder ? (folder.split(/[\\/]/).filter(Boolean).pop() ?? folder) : null, identityLine)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the line is made from these
  }, [folder, officeReady, identity])
  useEffect(() => {
    office.current?.setOfficeLife(prefs?.officeLife !== false)
  }, [prefs?.officeLife, officeReady])
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
  // The key beside every Ask button: the place with a selection showing takes it. The code editor has its own binding for the same key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!matches(e, 'add-selection') || (e.target as Element | null)?.closest?.('.monaco-editor')) return
      if (requestAddSelection()) (e.preventDefault(), e.stopPropagation())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  // Mod+Alt+1-9 press the Nth tab shown, so it follows the bar whichever optional tabs are in it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = tabNumber(e)
      if (n === null || document.querySelector('dialog[open]')) return
      const tab = document.querySelectorAll<HTMLElement>('.tabs [role="tab"]')[n - 1]
      if (tab) (e.preventDefault(), e.stopPropagation(), tab.click())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === '/') (e.preventDefault(), e.stopPropagation(), setShortcuts((o) => !o))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  // Ctrl+Tab through the agents of the open workspace and Shift+Cmd/Ctrl+[ and ] through the projects, in the order their dropdowns list them: hold the modifier to see the bar, let go to switch.
  const { flight, pick: pickTile } = useSwitcher(() => ({ agents, workspaces: workspaces?.items ?? [], selected, folder }), {
    agent: (id) => select(id),
    space: (path) => void run(async () => setWorkspaces(await window.aw.activateWorkspace(path)))
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
  // What an agent asks of the person, in one word: a permission or question first, else a workflow wait.
  const askWord = (id: string): string | null => {
    const need = needsOf(id)[0]
    const wait = waits.find((w) => w.agentId === id)
    return need ? needTitle(need).toLowerCase() : wait ? waitWord(wait.kind) : null
  }
  // Agents that finished while you were elsewhere: another project's, or another agent here. Remembered until you open that project or select the agent.
  const finished = useRef(createDoneTracker())
  const [finishedKey, setFinishedKey] = useState('')
  const syncFinished = () => {
    const t = finished.current
    setFinishedKey(`${[...t.projects()].sort().join('|')}#${[...t.agents()].sort().join('|')}`)
  }
  useEffect(() => {
    const t = finished.current
    t.observe(allAgents.map((a) => ({ id: a.id, repoPath: a.repoPath, activity: world[a.id]?.activity ?? 'asleep' })))
    if (folder) t.opened(folder)
    if (selected) t.selected(selected)
    syncFinished()
  }, [world, allAgents, folder, selected]) // eslint-disable-line react-hooks/exhaustive-deps
  const markRead = (ids: string[]) => (finished.current.read(ids), syncFinished())
  // What each project's agents are doing, for its tile in the project switcher: some wait for the person (a permission, a question, a plan, a gate), some are working.
  const attention = { selected, agents: agents.map((a) => ({ id: a.id, asks: askWord(a.id) !== null })), done: finished.current.agents() }
  const tileMarks = agentMarks(attention)
  const agentsDot = agentDot(attention)
  const wsActivity: Record<string, WorkspaceActivity> = {}
  for (const a of allAgents) {
    const w = (wsActivity[a.repoPath] ??= { waiting: 0, working: 0 })
    const act = world[a.id]?.activity ?? 'asleep'
    if (needsOf(a.id).length > 0 || act === 'permission' || waitsEverywhere.some((x) => x.agentId === a.id)) w.waiting++
    else if (['thinking', 'researching', 'implementing', 'running', 'delegating'].includes(act)) w.working++
  }
  // The tiles of the switcher bar, drawn as the dropdowns draw theirs.
  const switchTiles = (f: Flight): Tile[] =>
    f.ids.flatMap((id): Tile[] => {
      if (f.kind === 'agents') {
        const a = agents.find((x) => x.id === id)
        if (!a) return []
        const activity = world[id]?.activity ?? 'asleep'
        const ask = askWord(id)
        return [
          {
            id,
            group: a.group,
            line: `${a.name} · ${ask ?? activity}${id === f.start ? ' · here now' : ''}`,
            cls: `agent-tile is-${activity}`,
            body: (
              <>
                <span className="wt-top">
                  <Identicon name={a.name} />
                  <span className="wt-state" aria-hidden="true" />
                </span>
                <span className="wt-name">{a.name}</span>
                <span className="wt-sub">{ask ? <span className="ask-pill">{ask}</span> : activity}</span>
              </>
            )
          }
        ]
      }
      const w = workspaces?.items.find((x) => x.path === id)
      if (!w) return []
      const a = wsActivity[w.path]
      const sub = w.agents > 0 ? `${w.agents} agent${w.agents === 1 ? '' : 's'}` : 'no agents'
      return [
        {
          id,
          line: `${w.name} · ${sub}${id === f.start ? ' · here now' : ''}`,
          body: (
            <>
              <span className="wt-top">
                <Identicon name={w.name} />
                {a && a.waiting > 0 && <span className="wt-need">{a.waiting}</span>}
                {a && a.waiting === 0 && finished.current.projects().has(w.path) && <span className="wt-done" />}
                {a && a.waiting === 0 && !finished.current.projects().has(w.path) && a.working > 0 && <span className="wt-live" />}
              </span>
              <span className="wt-name">{w.name}</span>
              <span className="wt-sub">
                {sub}
                <em className={w.git ? 'git' : w.repos > 0 ? 'multi' : ''}>{gitTag(w)}</em>
              </span>
            </>
          )
        }
      ]
    })
  talkRef.current = talk
  const dialogNeeds = dialogFor ? needsOf(dialogFor) : []
  useEffect(() => {
    if (dialogFor && dialogNeeds.length === 0) setDialogFor(null)
  })
  // Subagents alive right now, from the hooks: free to count on every render.
  const crewLive = agents.reduce((n, a) => n + Object.keys(world[a.id]?.interns ?? {}).length, 0)
  const waitingOf = (id: string) => new Set(Object.entries(world[id]?.interns ?? {}).filter(([, i]) => i.activity === 'permission').map(([k]) => k))
  // The agent's plan, when it waits for the person: shown in its chat where the answer is given.
  const gateFor = (a: AgentRecord) => {
    const p = pendingPlans(wf.runs).find((x) => x.run.agent === a.id)
    const w = waitingSteps(wf.runs.filter((r) => r.agent === a.id), stepCtx).at(0)
    const c = checkPanels(wf.runs.filter((r) => r.agent === a.id), ctxFor).at(0)
    const r = toRunSteps(wf.runs.filter((x) => x.agent === a.id), ctxFor).at(0)
    const sk = wf.runs.find((x) => x.agent === a.id && x.status !== 'stopped' && x.skipAsk)
    const rf = wf.runs.filter((x) => x.agent === a.id).flatMap((x) => { const ask = refusedAsk(x, ctxFor(x)); return ask ? [{ run: x, ask }] : [] }).at(0)
    return (
      <WorkflowGates
        agentName={a.name}
        plan={p}
        check={c}
        {...(sk && { skip: sk })}
        {...(rf && { refused: rf })}
        runStep={r}
        step={w}
        onDecidePlan={(runId, state, o) => void window.aw.workflows.decide(runId, state, o)}
        onDecideStep={(runId, stepId, decision, note) => void window.aw.workflows.approveStep(runId, stepId, decision, note)}
      />
    )
  }
  // Where the agent's latest run stands, above its conversation, while it is not finished.
  const trackFor = (a: AgentRecord) => {
    const run = wf.runs.filter((r) => r.agent === a.id).at(-1)
    const t = run && prefs && workflowsShown(prefs.workflows.enabled, wf.open) ? trackOf(run, ctxFor(run)) : undefined
    const hold = landingHolds.find((h) => h.agentId === a.id)
    // Git holds the agent's merge: the marker is on the track; what asks the person is the card at the end of the conversation.
    return (
      (t || hold) && (
        <>
          {t && <RunTrack track={t} seed={a.id} agentName={a.name} variant="bar" landing={landingPill(hold, landingKind(run?.workflow))} onReopen={() => void window.aw.landingReopen(a.id)} />}
        </>
      )
    )
  }
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
      gate={gateFor(a)}
      track={trackFor(a)}
      stepCard={a.branch ? <StepCard agentId={a.id} agentName={a.name} active={visible} held={!!landingHolds.find((h) => h.agentId === a.id && !h.declined)} working={['thinking', 'researching', 'implementing', 'running', 'delegating'].includes(world[a.id]?.activity ?? 'asleep')} /> : undefined}
      moreNeeds={Math.max(0, needsOf(a.id).length - 1)}
      needActions={needActions(a.id)}
      visible={visible}
      focusTick={focusTick}
      jump={jump?.agentId === a.id ? jump : null}
      limits={limitsOf(a)}
      info={infoOf(a)}
      todosUpdated={todoBoardNow() ? todosUpdatedBy(todoBoardNow()!.todos, a.id, a.hiredAt ?? 0) : null}
      actions={actionsOf(a)}
      waitingSubagents={waitingOf(a.id)}
      remote={providers?.find((p) => p.id === (a.provider ?? DEFAULT_PROVIDER))?.capabilities.remote ? (remotes[a.id] ?? { state: 'off' }) : undefined}
      outgoing={outgoingOf(a)}
      onWake={() => wake(a)}
      onTerminal={() => (select(a.id), chooseTalk('terminal'), setFocusTick((n) => n + 1))}
    />
  )
  const panes = grid && !!paneLayout && agents.length > 0
  useEffect(() => setPeek(false), [panes])
  const noOffice = officeHidden(officeOff, agents.length, grid)
  // With the office hidden the panel is the window: it is always showing.
  const showPanel = noOffice || (panes ? peek : narrow ? drawer || agents.length === 0 : panelOpen)
  // In a narrow window the panel slides over the office; the terminals under the office stop where the panel starts, so no line of them is behind it (the office itself stays full width, the panel being over it).
  const overW = narrow && showPanel && !panes && !noOffice ? (wide ? 'min(94vw, 900px)' : `min(${panelW ?? 560}px, 94vw)`) : '0px'
  const setOffice = (off: boolean) => (setOfficeOff(off), keep('aw.officeHidden', off ? '1' : ''))
  // Mod+Alt+O shows or hides the office, from anywhere (even with a box focused: the key is not typed anywhere).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!matches(e, 'office')) return
      e.preventDefault()
      e.stopPropagation()
      setOffice(!officeOff)
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [officeOff])
  // An agent's card over the office has nothing to show over while it is hidden, and its timers would go on.
  useEffect(() => void (noOffice && setCardOpen(false)), [noOffice])
  // Hidden, the office draws nothing at all.
  // Not drawn while the person hid it, nor while the grid is on top of it: it is not seen.
  const gridCovers = grid && agents.length > 0
  useEffect(() => office.current?.setShown(!noOffice && !gridCovers), [noOffice, gridCovers, officeReady])
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
  const curRemote = curProv?.capabilities.remote && current ? (remotes[current.id] ?? ({ state: 'off' } as RemoteState)) : undefined
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
        cwd: current.cwd,
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
        accounts: curProv?.capabilities.accounts && prefs?.accounts.some((a) => a.provider === curProv.id) ? ['', ...prefs.accounts.filter((a) => a.provider === curProv.id).map((a) => a.id)].map((id) => ({ id, name: accountName(prefs.accounts, id, curProv.id, prefs.ownNames), color: accountColor(prefs.accounts, id) })) : [],
        accountId: current.account ?? ''
      }
    : null
  // The terminal drawer covers the bottom of the stage, so the card has less room.
  const drawerH = termOpen && folder ? termH : 0
  const cardLay = cardData ? cardLayout({ w: stageBox.w, h: stageBox.h - drawerH, agentX, panel: noOffice, prefer: cardSize ?? undefined }) : null
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

  const [askConfirm, confirmNode] = useConfirm()
  // The × on a project: a saved one is only forgotten; one whose folder is gone goes with the agents that worked in it, after asking.
  const forgetProject = (path: string) =>
    void run(async () => {
      const w = workspaces?.items.find((i) => i.path === path)
      if (w && !w.exists) {
        const names = (await window.aw.listAgents()).filter((a) => a.repoPath === path && !a.parent).map((a) => a.name)
        const who = names.length ? `${names.join(', ')} ${names.length === 1 ? 'works' : 'work'} in it: ${names.length === 1 ? 'its' : 'their'} process stops and ${names.length === 1 ? 'its' : 'their'} worktree and record are deleted.` : 'No agent works in it.'
        if (!(await askConfirm({ title: `Remove ${w.name}?`, body: `The folder is gone. ${who} Claude's own saved conversations are not touched.`, confirm: 'Remove', danger: true }))) return
        setWorkspaces(await window.aw.removeMissingProject(path))
      } else setWorkspaces(await window.aw.forgetWorkspace(path))
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

  // A refusal is not caught here: the hire form shows it, where the person is looking.
  const hire = async (options: AgentOptions, name: string, base?: string, leftover?: 'replace' | 'reuse') => {
    if (!folder) return
    setError(null)
    const a = await window.aw.addAgent(folder, options, name, base, leftover)
    setHiring(false)
    void refreshWorkspaces()
    setAgents((xs) => [...xs, a])
    setWorld((w) => applyEvent(w, { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: 'idle' }))
    select(a.id)
  }

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

  // What a restart for an update would put to sleep: agents at work, and agents waiting for an answer.
  const updateAgents = {
    working: allAgents.filter((a) => ['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting'].includes(world[a.id]?.activity ?? 'asleep')).length,
    waiting: allAgents.filter((a) => world[a.id]?.activity === 'waiting').length
  }
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
                        <i className="acct-dot" style={{ background: accountColor(prefs.accounts, a.account) }} title={`Runs on ${accountName(prefs.accounts, a.account, a.provider ?? DEFAULT_PROVIDER, prefs.ownNames)}`} />
                      )}
                      {new Set(agents.map((x) => x.repoPath)).size > 1 && (
                        <span className="proj" title={a.repoPath}>
                          {a.repoPath.split(/[\\/]/).pop()}
                        </span>
                      )}
                    </span>
                    {askWord(a.id) ? (
                      <span className="ask-pill" title="Waiting for you: click to answer">
                        {askWord(a.id)}
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
    memory: () => setView('tools'),
    rename: () => setRenaming(a.id),
    group: () => setGrouping(true),
    restart: () =>
      void run(async () => {
        const running = (await window.aw.listProcs(a.id)).length
        const stops = running ? ` ${running === 1 ? 'A command it is running' : `${running} commands it is running`} will be stopped.` : ''
        if (await askConfirm({ title: `Restart ${a.name}?`, body: `Its terminal stops and starts again on the same conversation.${stops} Nothing is lost from its worktree.`, confirm: 'Restart' })) await window.aw.restartAgent(a.id)
      }),
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
    cancelMenu: () => window.aw.cancelMenu(agentId),
    cancelNeed: () => window.aw.cancelNeed(agentId)
  })
  const decideById = (id: string, d: Decision) => {
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
      {flight?.shown && <Switcher kind={flight.kind} title={flight.kind === 'agents' ? 'Switch agent' : 'Switch project'} tiles={switchTiles(flight)} at={flight.at} onPick={pickTile} />}
      {/* A window that has no project yet (every fresh one) opens on the picker; with nothing saved there is nothing to pick, so Welcome handles it. */}
      {workspaces && !workspaces.active && workspaces.items.length > 0 && (
        <WorkspacePicker
          workspaces={workspaces}
          onOpen={(path) => void run(async () => setWorkspaces(await window.aw.activateWorkspace(path)))}
          onPick={pick}
          onForget={forgetProject}
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
      {report === 'usage' && <UsageModal providers={providers ?? []} limits={pool} limitsAt={poolAt} accounts={prefs?.accounts ?? []} own={prefs?.ownNames} office={{ agents: agents.length, projects: new Set(agents.map((a) => a.repoPath)).size }} onRefreshLimits={() => lookLimits(true)} onClose={() => setReport(null)} />}
      {report === 'workflows' && prefs && workflowsShown(prefs.workflows.enabled, wf.open) && <WorkflowsModal runs={projectRuns} spend={wf.spend} open={wf.open} windingDown={windingDown(prefs.workflows.enabled, wf.open)} folder={folder} defaultId={defaultWorkflow(prefs.workflows, folder)} onDefault={(id) => folder && patchPrefs({ workflows: withDefault(prefs.workflows, folder, id) })} ctx={stepCtx} ctxFor={ctxFor} chatOf={(a) => chatFor(a, true, `builder-${a.id}`)} costOf={(id) => stats[id]?.costUsd ?? 0} onBuilder={(a) => (setWorld((w) => (w[a.id] ? w : applyEvent(w, { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: 'idle' }))))} focusRun={runFocus ?? undefined} onClose={() => (setReport(null), setRunFocus(null))} />}
      {report === 'rewind' && <RewindModal providers={providers ?? []} accounts={prefs?.accounts ?? []} own={prefs?.ownNames} onClose={() => setReport(null)} />}
      {!setupOpen && starting && (
        <div className="su-overlay" role="status" aria-label="Starting">
          <div className="su-wait"><span className="su-spin" aria-hidden="true" />Getting ready…</div>
        </div>
      )}
      {setupOpen && (
        <Setup
          providers={providers}
          prefs={prefs}
          onPrefs={patchPrefs}
          workspaces={workspaces}
          folder={folder}
          onPick={pick}
          onOpen={(path) => void run(async () => setWorkspaces(await window.aw.activateWorkspace(path)))}
          onRescan={() => scanProviders()}
          onHire={async (options, name, crew) => {
            // Closed before the hire lands: the crew list changes under it as agents arrive, and a late close must not undo a reopening.
            setSetupAgain(false)
            await hire(options, name)
            if (crew) await hireCrew()
          }}
          onClose={() => (setSetupAgain(false), setSetupFor(null))}
          reopened={setupAgain}
          startWith={setupFor}
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
          runsOf={(id) => wf.runs.filter((r) => r.todos?.includes(id)).map((r) => ({ id: r.id, workflow: r.workflow?.name ?? 'Run', stands: GROUP_STANDS[groupKeyOf(r, gateTiles(r, ctxFor(r)))] }))}
          onOpenRun={(id) => (setTodoOpen(false), setTodoFocus(null), setRunFocus(id), setReport('workflows'))}
          onClose={() => (setTodoOpen(false), setTodoFocus(null))}
          onOpenMessage={(l) => (setTodoOpen(false), openMsg(l))}
        />
      )}
      {libraryOpen && <LibraryModal folder={folder ?? ''} providers={providers ?? []} enabled={prefs?.libraryEnabled !== false} onOpenSettings={() => (setLibraryOpen(false), setSettingsPane('features'), setSettings(true))} onClose={() => setLibraryOpen(false)} />}
      {settings && prefs && <Settings project={folder ? { path: folder, name: folder.split(/[\\/]/).pop() || folder } : undefined} updateAgents={updateAgents} signIns={signIns} onSignIns={setSignIns} initialPane={settingsPane} providers={providers ?? []} onProviders={() => scanProviders()} onSetup={() => (setSettings(false), setSetupAgain(true))} prefs={prefs} roles={roles} onChange={(patch) => {
          // Merged with the latest saved state, so two quick changes (a text box losing focus, then a menu) both stick.
          const next = { ...prefsNow.current!, ...patch }
          prefsNow.current = next
          setPrefs(next)
          void window.aw.setPrefs(next)
        }} onClose={() => (setSettings(false), setSettingsPane(undefined))} />}
      {shortcuts && <ShortcutsSheet onClose={() => setShortcuts(false)} />}
      {palette && current && (
        <Palette
          agentId={current.id}
          agentName={current.name}
          remote={curProv?.capabilities.remote ? (remotes[current.id] ?? { state: 'off' }) : undefined}
          onClose={() => {
            setPalette(false)
            setFocusTick((n) => n + 1)
          }}
          onRun={(name, args) => run(() => window.aw.runCommand(current.id, name, args))}
        />
      )}
      <ModStyle />
      <ModBar />
      <ShotAsk />
      <header>
        <h1>
          <PixelWord text="agent world" />
        </h1>
        <WorkspaceMenu
          workspaces={workspaces}
          activity={wsActivity}
          dot={projectDot({ activity: wsActivity, active: folder, done: finished.current.projects() })}
          finished={finished.current.projects()}
          onOpen={(path) => void run(async () => setWorkspaces(await window.aw.activateWorkspace(path)))}
          onPick={pick}
          onForget={forgetProject}
          onNewWindow={() => void window.aw.newWindow()}
        />
        <IdentityChip line={identityLine} onOpen={() => (setSettingsPane('identity'), setSettings(true))} />
        <button className="primary" onClick={() => setHiring((h) => !h)} disabled={!folder} aria-expanded={hiring}>
          + Agent
        </button>
        <IconButton icon="history" label="History" onClick={() => setHistory((h) => !h)} disabled={!folder} expanded={history} tip="Bring back an earlier conversation from this folder" />
        {agents.length > 0 && (
          <IconButton icon="crew" label={`Subagents${crewLive > 0 ? ` ${crewLive}` : ''}`} onClick={() => setCrewOpen(true)} haspopup tip="Every agent's subagents together" badge={crewLive > 0 ? crewLive : undefined} />
        )}
        {agents.length > 0 && (
          <IconButton icon="grid" label="Grid" onClick={() => rememberGrid({ grid: !grid })} pressed={grid} tip="Show every agent at once, with the last lines of its terminal" />
        )}
        <IconButton icon="notes" label="Notes" onClick={() => void window.aw.notes.toggle()} tip={notesKey ? hint('notes') : 'Notes that stay above every window'} />
        {folder && <IconButton icon="todo" label={`Todos${todoNeeds > 0 ? ` ${todoNeeds}` : ''}`} onClick={() => setTodoOpen(true)} haspopup tip={todoNeeds > 0 ? `${todoNeeds} todo${todoNeeds > 1 ? 's' : ''} need${todoNeeds > 1 ? '' : 's'} you` : 'The tasks for this project, yours and the agents\''} badge={todoNeeds > 0 ? todoNeeds : undefined} />}
        {prefs && workflowsShown(prefs.workflows.enabled, wf.open) && <IconButton icon="workflow" label="Workflows" onClick={() => setReport('workflows')} haspopup badge={needsYou || undefined} tip={needsYou ? `${needsYou} thing${needsYou === 1 ? '' : 's'} waiting for you` : windingDown(prefs.workflows.enabled, wf.open) ? `Winding down: ${wf.open} run${wf.open === 1 ? '' : 's'} still open` : "Runs and stats of the agents' workflows"} />}
        <IconButton icon="library" label={prefs?.libraryEnabled === false ? 'Library (off)' : 'Library'} dim={prefs?.libraryEnabled === false} onClick={() => setLibraryOpen(true)} haspopup tip={prefs?.libraryEnabled === false ? 'The library and playbook are turned off. Open to turn them on in Settings.' : 'Skills, instructions and the playbook that says what agents are told'} />
        <IconButton icon="money" label={`Usage${lowLimits > 0 ? ` ${lowLimits}` : ''}`} onClick={() => setReport('usage')} haspopup tip={lowLimits > 0 ? `${lowLimits} usage limit${lowLimits > 1 ? 's' : ''} nearly used up` : 'Limits and what the agents have cost'} badge={lowLimits > 0 ? lowLimits : undefined} />
        <IconButton icon="week" label="Weekly Rewind" onClick={() => setReport('rewind')} haspopup tip="Your week of agent work" />
        {error && <span className="error">{error}</span>}
        <UpdateChip agents={updateAgents} />
        <IconButton className="push" icon="keyboard" label="Shortcuts" onClick={() => setShortcuts(true)} haspopup tip={hint('shortcuts')} />
        <IconButton icon="gear" label="Settings" alert={signIns > 0} onClick={() => setSettings(true)} tip={signIns > 0 ? `${signIns === 1 ? 'An account needs' : `${signIns} accounts need`} signing in: see Settings, Accounts` : 'Notifications, defaults for new agents, where each program is'} />
        <IconButton icon="panel" label={showPanel ? 'Hide panel' : 'Show panel'} disabled={noOffice} onClick={() => (panes ? setPeek((o) => !o) : narrow ? setDrawer((o) => !o) : setPanelOpen((o) => !o))} expanded={showPanel} tip={showPanel ? 'Hide panel' : 'Show panel'} />
      </header>
      {updatedBanner && (
        <div className="upd-banner" role="status">
          <span>Updated to Agent World {appVersion}.</span>
          <button className="su-link" onClick={() => setNotesOpen(true)}>See what's new</button>
          <span className="grow" />
          <button aria-label="Dismiss" title="Dismiss" onClick={() => setBannerFor('')}>✕</button>
        </div>
      )}
      {confirmNode}
      {notesOpen && <WhatsNew onClose={() => setNotesOpen(false)} />}
      <main className={noOffice && termOpen && folder ? 'term-side' : ''} style={{ '--over': overW, '--tside': `${sideWidth(termSideW, vw)}px` } as React.CSSProperties}>
        <div className={`stage-wrap ${noOffice ? 'off' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={dropOnStage}>
          <div className="stage" ref={stage} />
          {cardData && cardAt && cardAt.mode !== 'panel' && (
            <div key={flash} className={`profile-overlay ${flash ? 'flash' : ''}`} data-side={cardAt.side} data-mode={cardAt.mode} style={{ [cardAt.side]: 10, top: 10, width: cardAt.size!.w, maxHeight: cardMaxHeight({ stageH: stageBox.h, side: cardAt.side, drawerH }) }}>
              <ProfileCard data={cardData} variant={cardAt.mode} now={clock} edit={cardEdit} onClose={() => setCardOpen(false)} onToggleSize={() => setCardSize(cardAt.mode === 'full' ? 'compact' : 'full')} />
            </div>
          )}
          {grid && agents.length > 0 && (
            <div className="grid-area">
              <div className="grid-bar" role="toolbar" aria-label="Grid layout">
                <button aria-pressed={!paneLayout} onClick={() => (beforeOverview.current[folder ?? ''] = paneLayout?.root, changeLayout(null))} title="Every agent as a tile with the last lines of its terminal">
                  Overview
                </button>
                <button
                  aria-pressed={!!paneLayout}
                  onClick={() => !paneLayout && changeLayout({ root: conversationsRoot(beforeOverview.current[folder ?? ''], current?.id ?? agents[0]!.id) })}
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
                  onProfile={(id) => (setSelected(id), keep('aw.selected', id))}
                  renderCard={(a, close, mode) => (cardData && current?.id === a.id ? <ProfileCard data={cardData} variant={mode} now={clock} edit={cardEdit} onClose={close} /> : null)}
                  renderChat={(a) => chatFor(a, true, `pane-${a.id}`)}
                  views={slot.views ?? {}}
                  onView={(id, terminal) => rememberGrid({ views: withView(slot.views, id, terminal) })}
                  onWake={(id) => void (agents.find((a) => a.id === id) && wake(agents.find((a) => a.id === id)!))}
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
                    needs: askWord(a.id)
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
              {agents.length > 0 && (
                <div className="zoom-ctl" role="group" aria-label="Office">
                  <button className="hide-office" onClick={() => setOffice(true)} title={`Stops the picture and gives the chat the whole window; a button on the left brings it back (${keysOf('office')})`}>
                    <OutlineIcon name="hide" size={14} />
                    Hide office
                  </button>
                </div>
              )}
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
          <TerminalDrawer folder={folder} folderName={folderName} open={termOpen && !!folder} height={termH} onHeight={(h) => (setTermH(h), keep('aw.termH', String(h)))} onHide={toggleTerm} onShow={showTerm} side={noOffice} sideW={sideWidth(termSideW, vw)} onSideW={(w) => (setTermSideW(w), keep('aw.termSideW', String(w)))} onCount={setTermCount} ask={current ? { agentId: current.id, onAttached: showChat } : undefined} />
          {tip && (
            <FloatingTip x={tip.x} y={tip.y}>
              <PlantTip five={tip.five} week={tip.week} pool={pool} accounts={prefs?.accounts ?? []} own={prefs?.ownNames} providers={providers ?? []} />
            </FloatingTip>
          )}
        </div>
        {noOffice && (
          <OfficeRail
            agents={agents.map((a) => { const act = world[a.id]?.activity ?? ''; const working = ['thinking', 'researching', 'implementing', 'running', 'delegating'].includes(act); return { id: a.id, name: a.name, working, state: act === 'asleep' ? 'asleep' as const : act === 'waiting' || act === 'permission' ? 'waiting' as const : working ? 'working' as const : 'idle' as const, role: world[a.id] ? roleOf(world[a.id]!) : 'senior' } })}
            selected={selected}
            marks={tileMarks}
            asks={new Map(agents.flatMap((a) => { const w = askWord(a.id); return w ? [[a.id, w] as [string, string]] : [] }))}
            onRead={(id) => markRead([id])}
            slim={railSlim}
            width={railW}
            terminalOpen={termOpen && !!folder}
            onTerminal={folder ? toggleTerm : undefined}
            onWidth={(w) => (setRailW(w), keep('aw.railw', w ? String(w) : ''))}
            onSlim={() => (setRailSlim(!railSlim), keep('aw.railSlim', railSlim ? '' : '1'))}
            usage={current ? { five: limitView(limitsOf(current).fiveHour, Date.now()), week: limitView(limitsOf(current).sevenDay, Date.now()), account: prefs?.accounts.find((x) => x.id === current.account && x.provider === (current.provider ?? DEFAULT_PROVIDER))?.name } : null}
            officeKeys={keysOf('office')}
            onShow={() => setOffice(false)}
            // The agent that is open: pressing it again shows or hides its profile card, which has no name above the chat to click now.
            onSelect={(id) => (id === selected ? (cardOpen ? setCardOpen(false) : showCard()) : select(id))}
          />
        )}
        <aside hidden={!showPanel} className={`${wide ? 'wide' : ''} ${narrow && !noOffice ? 'drawer' : ''} ${noOffice ? 'solo' : ''}`} style={!wide && !noOffice && panelW ? { width: `min(${panelW}px, ${narrow ? '94vw' : '80vw'})` } : undefined}>
          <div
            className="resizer"
            hidden={noOffice}
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
          {current && !noOffice && (
            <section className="head-compact" aria-label="Selected agent">
              <button onClick={() => step(-1)} aria-label="Previous agent" title="Previous agent in this project" className="hc-step hc-prev" />
              <button onClick={() => step(1)} aria-label="Next agent" title="Next agent in this project" className="hc-step hc-next" />
              <span className="hc-wrap" ref={sw.wrap as React.RefObject<HTMLSpanElement>} onMouseEnter={() => sw.menu.enter()} onMouseLeave={() => sw.menu.leave()}>
                <button className={`hc-switch ${sw.open ? 'open' : ''}`} onClick={() => sw.menu.click()} aria-haspopup="menu" aria-expanded={sw.open} aria-label="Agents" title={`All agents in this project${agentsDot === 'need' ? '. Another agent needs you' : agentsDot === 'done' ? '. Another agent finished' : ''}`}>
                  {agents.length}
                  <span aria-hidden="true">▾</span>
                </button>
                {agentsDot && <span className={`adot cnt ${agentsDot}`} aria-hidden="true" data-testid="agents-dot">{tileMarks.size}</span>}
                {sw.open && (
                  <div className="qp-wrap hc" data-pinned={sw.pinned}>
                    <QuickPanel
                      label="Agents"
                      title="Agents"
                      count={agents.length}
                      className="agents"
                      actions={[...tileMarks.values()].includes('done') && <button className="tip-btn qh-read" data-tip="Mark all as read" aria-label="Mark all as read" onClick={() => markRead(agents.map((a) => a.id))}><OutlineIcon name="ticks" size={14} /></button>}
                      footer={
                        <>
                          <button role="menuitem" onClick={() => (sw.menu.chosen(), setHiring(true))}>+ Agent</button>
                          <span className="hint">Ctrl+Tab to step</span>
                        </>
                      }
                    >
                      {agentsByRecent(agents.map((a) => ({ ...a, activeAt: seenAt[a.id] ?? a.activeAt }))).map((a, i, all) => {
                        const activity = world[a.id]?.activity ?? 'asleep'
                        const ask = askWord(a.id)
                        return (
                          <Fragment key={a.id}>
                            {a.group && a.group !== all[i - 1]?.group && <div className="group-head qp-head">{a.group}</div>}
                            <div className={`wt-cell ${a.id === selected ? 'on' : ''}`}>
                              <button role="menuitem" className={`wt agent-tile is-${activity} ${a.id === selected ? 'on' : ''}`} data-n={i < 9 ? String(i + 1) : undefined} aria-current={a.id === selected} onClick={() => (select(a.id), sw.menu.chosen())} title={`${a.name}: ${activity}`}>
                                {i < 9 && <kbd aria-hidden="true">{i + 1}</kbd>}
                                <span className="wt-top">
                                  <Identicon name={a.name} />
                                  <span className="wt-state" aria-hidden="true" />
                                  {tileMarks.has(a.id) && <span className={`wt-mark ${tileMarks.get(a.id)}`} aria-hidden="true" />}
                                </span>
                                <span className="wt-name">{a.name}</span>
                                <span className="wt-sub">{ask ? <span className="ask-pill">{ask}</span> : tileMarks.get(a.id) === 'done' ? <span className="wt-tag done">Finished</span> : activity}</span>
                              </button>
                              {tileMarks.get(a.id) === 'done' && <button className="wt-read tip-btn" data-tip="Mark as read" aria-label={`Mark ${a.name} as read`} onClick={() => markRead([a.id])}><OutlineIcon name="tick" size={12} /></button>}
                            </div>
                          </Fragment>
                        )
                      })}
                    </QuickPanel>
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
              {curRemote && <RemoteHead agentId={current.id} agentName={current.name} working={!['idle', 'waiting', 'asleep'].includes(state?.activity ?? 'asleep')} remote={curRemote} />}
              {cur && <span className="hc-cost">${cur.costUsd.toFixed(2)}</span>}
              {agents.some((a) => a.id !== current.id && askWord(a.id)) && (
                <button className="ask-pill" onClick={openSwitcher} title="Another agent is waiting for you">
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
            <div className={`tabbar ${noOffice ? 'with-who' : ''}`}>
              {noOffice && (
                <div className="tab-who">
                  <b>{current.name}</b>
                  <small>{[current.branch, state?.activity ?? 'asleep'].filter(Boolean).join(' · ')}</small>
                </div>
              )}
            <div className="tabs" role="tablist" aria-label="Agent view">
              {[
                { id: 'chat', icon: 'chat', label: 'Chat', about: 'Talk with the agent', go: () => (chooseTalk('chat'), setFocusTick((n) => n + 1)) },
                { id: 'terminal', icon: 'terminal', label: 'Terminal', about: "The agent's own terminal", keys: ['Ctrl+`'], reveal: current.cwd, go: () => (chooseTalk('terminal'), setFocusTick((n) => n + 1)) },
                { id: 'code', icon: 'code', label: 'Code', about: 'Changes and files in this branch', reveal: current.cwd, go: () => setView('code') },
                { id: 'tools', icon: 'memory', label: 'Agent Memory', about: 'Notes every agent in this project shares', go: () => setView('tools') },
                ...(hasLibrary || view === 'library' ? [{ id: 'library', icon: 'library', label: 'Library', about: 'What the library told this agent and what it did about it', go: () => setView('library') }] : []),
                ...(prefs && workflowsShown(prefs.workflows.enabled, wf.open)
                  ? [{ id: 'workflow', icon: 'workflow', label: 'Workflow', about: "This agent's tasks, round by round", dot: wf.runs.some((r) => r.agent === current.id && r.status === 'open') ? 'run' : undefined, go: () => setView('workflow') }]
                  : []),
                { id: 'traces', icon: 'traces', label: 'Traces', about: 'Messages between agents', badge: messages.length, go: () => setView('traces') },
                ...(fileTab[current.id] ? [{ id: 'file', icon: 'file', label: fileTab[current.id]!.split('/').pop()!, about: fileTab[current.id]!, named: true, go: () => setView('file') }] : []),
                { id: 'preview', icon: 'desktop', label: 'Preview', about: 'The page this agent is serving', dot: (servers[current.id] ?? []).some((s) => s.alive) ? 'live' : undefined, go: () => setView('preview') }
              ].map((t, i) => (
                <ViewTab key={t.id} icon={t.icon as HeaderIconName} label={t.label} name={`${t.label}${t.badge ? ` ${t.badge}` : ''}${t.dot ? ' ●' : ''}`} about={t.about} number={i + 1} selected={view === t.id} onClick={t.go} badge={t.badge} dot={t.dot as 'run' | 'live' | undefined} keys={t.keys} reveal={t.reveal} named={t.named} />
              ))}
              <button className="push icon-btn" onClick={() => setWide((w) => !w)} aria-pressed={wide} aria-label={wide ? 'Narrow' : 'Expand'} title={wide ? 'Narrow the panel' : 'Give the panel more room'}>
                {wide ? '⤡' : '⤢'}
              </button>
            </div>
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
          {/* A Preview that has been opened stays mounted, hidden, so its page is not loaded again each time you come back to the tab, or to the project (so every project's agents, not only the open one's). */}
          {allAgents.filter((a) => previewed.includes(a.id) || (view === 'preview' && a.id === current?.id)).map((a) => (
            <div key={a.id} className="preview-keep" hidden={!(a.id === current?.id && view === 'preview')}>
              <PreviewView folder={a.repoPath} servers={servers[a.id] ?? []} agentName={a.name} agentId={a.id} target={previewTarget[a.id]} onAttached={() => (chooseTalk('chat'), setFocusTick((n) => n + 1))} />
            </div>
          ))}
          {current && view === 'workflow' && <WorkflowTab agentName={current.name} agentId={current.id} folder={folder} runs={wf.runs} spend={wf.spend} ctxFor={ctxFor} onOpenRun={(id) => (setRunFocus(id ?? null), setReport('workflows'))} />}
          {current && view === 'traces' && <TracesView messages={messages} agents={agents} currentId={current.id} />}
          {current && view === 'library' && <AgentLibrary key={current.id} agentId={current.id} agentName={current.name} enabled={prefs?.libraryEnabled !== false} onOpenSettings={() => (setSettingsPane('features'), setSettings(true))} />}
          {current && view === 'tools' && <MemoryView key={current.id} agentId={current.id} />}
          {current && view === 'code' && <CodePanel key={current.id} agentId={current.id} agentName={current.name} workDone={state?.files ?? 0} inPlace={current.branch ? undefined : { path: current.cwd }} openFile={openFile} onOpenChat={() => (chooseTalk('chat'), setFocusTick((n) => n + 1))} />}
        </aside>
        {/* Dialogs sit outside the side panel: inside it they would be open (blocking the page) but not drawn while the panel is hidden. */}
        {crewOpen && <CrewView agents={agents.map((a) => ({ id: a.id, name: a.name }))} waitingOf={waitingOf} onOpen={select} onClose={() => setCrewOpen(false)} />}
        {history && folder && <History folder={folder} onResume={resume} onClose={() => setHistory(false)} />}
        {hiring && (
          <Modal label="Hire an agent dialog" className="hire-dialog" onClose={() => setHiring(false)}>
            <HireForm folder={folder ?? ''} providers={(providers ?? []).filter((p) => p.detection.state === 'ready')} unready={(providers ?? []).filter((p) => p.detection.state !== 'ready')} onSetUp={(id) => (setHiring(false), setSetupFor(id), setSetupAgain(true))} defaultProvider={prefs?.defaults.provider || prefs?.setup.defaultProvider || ''} roles={roles} defaults={prefs?.defaults ?? { provider: '', model: '', permissionMode: '', inPlace: false, accounts: {} }} accounts={prefs?.accounts ?? []} own={prefs?.ownNames} roleModels={prefs?.roleModels ?? {}} onHire={hire} onCancel={() => setHiring(false)} onSaveRole={async (title, options) => void (await window.aw.saveRole({ title, blurb: options.instructions?.slice(0, 120) ?? '', options }), setRoles(await window.aw.listRoles(folder ?? '')))} />
          </Modal>
        )}
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
      <WidgetSlot slot="window-bottom" agentId={current?.id} meters={(want) => (current ? metersFor(want as MeterName[], { limits: limitsOf(current), tokens: infoOf(current).tokens ?? null, costUsd: infoOf(current).costUsd, todosUpdated: todoBoardNow() ? todosUpdatedBy(todoBoardNow()!.todos, current.id, current.hiredAt ?? 0) : null }) : {})} />
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

function PlantTip({ five, week, pool, accounts, own, providers }: { five: LimitView; week: LimitView; pool: LimitWindow[]; accounts: Prefs['accounts']; own?: Prefs['ownNames']; providers: ProviderInfo[] }) {
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
      <LimitBoard pool={pool} accounts={accounts} own={own} providers={providers} />
    </>
  )
}
