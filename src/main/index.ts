import { readText, resolveFile, startFileServer } from './files'
import { forget, loadMemory, recall, remember } from './memory'
import { createLibraryService } from './library/service'
import { importCandidates, scanSources } from './library/sources'
import { isRule } from './library/playbook'
import { sessionNotes } from './notes'
import { resolveCommand } from './command'
import { checkForUpdates } from './updates'
import { AccountService } from './accounts'
import { cleanPrefs, loadPrefs, savePrefs } from './prefs'
import { listProcs, stopProc } from './procs'
import { execFile, execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, relative, sep } from 'node:path'
import { BrowserWindow, Menu, Notification, app, clipboard, dialog, ipcMain, powerSaveBlocker, shell } from 'electron'
import { contextItems } from './contextMenu'
import * as pty from 'node-pty'
import type { RemoveResult } from '../shared/api'
import { costDelta, limitDue, overview, parseLedger, tokensReport, usageReport, weekReport, weekStartOf, type LedgerEvent } from '../shared/ledger'
import type { AccountInfo, Activity, AgentEvent, AgentOptions, AgentProfile, AgentRecord, AgentStats, Decision, PermissionMode, PermissionRequest, LimitWindow, ProviderId, ProviderInfo, Question, QuestionAnswer, RawEvent } from '../shared/types'
import { type Alert, budgetAlert, finishedTurn, idleCheckDelay, noticeToOpen, shouldNotify } from './attention'
import { providerOf, providers } from './providers/registry'
import type { EventHandle, EventSourceOptions, Provider } from './providers/ports'
import { commandLine } from './commands'
import { homeDirName } from './home'
import { LimitsBook } from '../shared/usage'
import { cleanRates, estimateUsd, type Rate } from '../shared/prices'
import { claudeWindows } from '../shared/limits'
import { type HandoffKind, handoffText } from '../shared/handoff'
import { saveAttachment } from './attachments'
import { okfHint } from './okf'
import { wrapUp } from './wrapUp'
import type { ChatItem } from '../shared/chat'
import { BUILT_IN_ROLES } from '../shared/roles'
import { checkName, cleanName } from './names'
import { type WorkClock, advanceWork, hiredAtOf, profileCounts, workedNow } from './profile'
import { type Role, withRole } from '../shared/roles'
import { recentlyRunning, writeRunning } from './resume'
import { deleteRole, discoverRoles, loadRoles, saveRole } from './roles'
import { findLocalServers, isListening } from './servers'
import { reviewRequest } from './review'
import { activate as activateWorkspace, forget as forgetWorkspace, loadWorkspaces, remember as rememberWorkspace, saveWorkspaces, type WorkspaceState } from './workspaces'
import { WindowWorkspaces } from './windowWorkspaces'
import { Mailbox } from './mailbox'
import { startMcpServer } from './mcpServer'
import { fitOptions } from '../shared/efforts'
import { DEFAULT_PROVIDER } from '../shared/types'
import { Screen } from './screen'
import { loadAgents, saveAgents } from './store'
import { assertBranch, branches, changes, commitAll, staleHint, createPr, discardFile, finishReadiness, listFiles, mergeInto, originalContent, pushBranch, readWorktreeFile, writeWorktreeFile } from './gitops'
import { DirtyWorktreeError, createWorktree, git, isGitRepo, nameTaken, removeWorktree, slug as repoSlug } from './worktree'

// AW_HIDDEN=1 runs the app without a visible window, a dock icon, notifications or focus stealing: for automated tests.
const HIDDEN = process.env.AW_HIDDEN === '1'
if (HIDDEN && process.platform === 'darwin') app.dock?.hide()
const HOME = process.env.AW_HOME ?? join(homedir(), homeDirName(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')))
// A run with its own home (tests, demos) also gets its own browser storage, so remembered layout never leaks between runs.
if (process.env.AW_HOME) app.setPath('userData', join(HOME, 'electron'))
process.env.AW_APP_HOME = HOME
const AGENTS_FILE = join(HOME, 'agents.json')
let prefs = loadPrefs(join(HOME, 'preferences.json'))
// The environment wins (tests and packaging), then Settings, then whatever `claude` the PATH finds.
/** Whether a provider can use the office message box: natively, once connected, or not (yet). */
const mailState = (p: Provider): ProviderInfo['mail'] => (p.capabilities.mail ? 'yes' : p.mail ? (p.mail.status() === 'connected' ? 'connected' : 'missing') : 'no')
// A test or a package can name the program with AW_<ID>_BIN (AW_CLAUDE_BIN, AW_AGY_BIN…); else Settings, else its usual name.
const binFor = (p: Provider) => process.env[`AW_${p.id.toUpperCase()}_BIN`] ?? (prefs.providers[p.id]?.path || p.bin)
/** The program and arguments that start a provider here (on Windows the name needs its extension, or cmd.exe for a .cmd). */
const providerCmd = (p: Provider, args: string[]) => {
  const l = resolveCommand(binFor(p))
  return { file: l.file, args: [...l.prefix, ...args] }
}
// Unset keeps Claude's own starting mode (auto on recent versions); `default` makes it ask before every edit.
const PERMISSION_MODE = process.env.AW_PERMISSION_MODE
const PERMISSION_TIMEOUT_SEC = 300
const SCROLLBACK = 256 * 1024
const COLS = 100
const ROWS = 30
const NAMES = ['ada', 'linus', 'grace', 'alan', 'margaret', 'ken', 'barbara', 'dennis', 'radia', 'guido', 'hedy', 'bjarne']

// Apps launched from Finder/desktop get a bare PATH; claude usually lives in a path set by the login shell.
function loginShellPath() {
  if (process.platform === 'win32') return process.env.PATH
  try {
    const out = execFileSync(process.env.SHELL ?? '/bin/zsh', ['-ilc', 'printf "__AW__%s__AW__" "$PATH"'], { encoding: 'utf8', timeout: 5000 })
    return /__AW__(.*)__AW__/.exec(out)?.[1] ?? process.env.PATH
  } catch {
    return process.env.PATH
  }
}

// A packaged app has to find claude and agy itself: its own PATH is bare, so it uses the login shell's plus the usual install folders.
if (app.isPackaged && process.platform !== 'win32') {
  process.env.PATH = [loginShellPath(), join(homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'].join(':')
}

// Several windows share this one process (and so one set of agents); each shows its own project.
const windows = new Set<BrowserWindow>()
const windowWorkspaces = new WindowWorkspaces()
const liveWindows = () => [...windows].filter((w) => !w.isDestroyed())
const frontWindow = () => BrowserWindow.getFocusedWindow() ?? liveWindows()[0] ?? null
const windowFor = (agent?: AgentRecord) => (agent && liveWindows().find((w) => windowWorkspaces.get(w.webContents.id) === agent.repoPath)) || frontWindow()
let ready = false
let agents: AgentRecord[] = []
const sessions = new Map<string, pty.IPty>()
// Plain shells opened in the grid, in the project folder: not agents, so they have no hooks, screen or chat. Ids start with `term:`.
const shells = new Map<string, pty.IPty>()
const shellIdle = new Map<string, string>()
// When each agent's terminal was started: a provider that reports nothing itself uses it to tell its sessions apart.
const spawnedAt = new Map<string, number>()
// Providers whose limits have to be asked for are asked at most this often, whoever is looking.
const LIMITS_FRESH_MS = 120_000
const polled: LimitWindow[][] = []
let limitsAt = 0
async function pollLimits() {
  limitsAt = Date.now()
  polled.length = 0
  await Promise.all(
    providers().map(async (p) => {
      if (!p.limits || !agents.some((a) => providerOf(a).id === p.id) && (await p.detect(binFor(p))).state !== 'ready') return
      // Each login of a program that keeps accounts has allowances of its own, so each is asked under its own folder.
      const logins = p.accounts ? ['', ...prefs.accounts.filter((x) => x.provider === p.id).map((x) => x.id)] : [undefined]
      await Promise.all(
        logins.map(async (account) => {
          const extra = accountsSvc.envFor(p.id, accountsSvc.dirOf(p.id, account))
          const run = (file: string, args: string[]) =>
            new Promise<string>((resolve, reject) => execFile(file, args, { env: { ...providerOf({}).env(process.env), ...extra }, timeout: 30_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))))
          try {
            const ws = await p.limits!.read(binFor(p), Object.keys(extra).length ? run : undefined)
            polled.push(account === undefined ? ws : ws.map((w) => ({ ...w, account })))
          } catch {
            /* not signed in or offline: its windows are simply missing */
          }
        })
      )
    })
  )
}
// What the /btw overlay last showed each agent, so the window hears only about changes.
const btwSent = new Map<string, string>()
const lastStats = new Map<string, AgentStats>()
const MEMORY_HINT =
  'This project keeps shared notes for every agent. Near the start of a task, call the agent-world recall tool with a few words about it. When you learn something a future agent should know (how to run the tests, a decision and why, a trap), save it with the remember tool. Keep notes short; never save secrets.'
// The chat titles each command card with the agent's own description of it; without one it can only show the start of the command.
const DESCRIBE_HINT = "Whenever you run a shell command, fill in the Bash tool's description with a short plain-language summary of what it does (for example 'Run the unit tests' or 'List files changed on this branch'). The chat shows it as the command's title."
// One memory file per project, shared by every agent working in it.
const memoryFile = (repoPath: string) => join(HOME, 'memory', `${repoSlug(repoPath)}.json`)
const buffers = new Map<string, { text: string; end: number }>()
const trustOpen = new Set<string>()
const planOpen = new Set<string>()
// When the terminal last drew anything: Claude's spinner redraws constantly while it works.
const lastOutput = new Map<string, number>()
// Agents whose terminal showed a menu while a permission card was open for them.
const menuSeen = new Set<string>()
const QUIET_MS = 3000
// With no spinner on screen and the input box showing, a short quiet is enough to call an agent idle.
const SETTLED_MS = 700
const MENU_RETRY_MS = 1000
const MENU_RETRIES = 60
const screens = new Map<string, Screen>()
const lastActivity = new Map<string, Activity>()
const lastCost = new Map<string, number>()
// The subscription's 5-hour and weekly windows, from whichever agent reported last. Kept on disk so the last
// reading is still there after a restart, until the next reply refreshes it.
const USAGE_FILE = join(HOME, 'usage.json')
const limitsBook = new LimitsBook()
// Rates for programs that report tokens but no price, as the user has added to prices.json.
let priceBook: Record<string, Rate> = {}
const loadPrices = () => {
  try {
    priceBook = cleanRates(JSON.parse(readFileSync(join(HOME, 'prices.json'), 'utf8')))
  } catch {
    /* none added */
  }
}
const loadUsage = () => {
  try {
    Object.assign(limitsBook, LimitsBook.from(JSON.parse(readFileSync(USAGE_FILE, 'utf8'))))
  } catch {
    /* first run, or unreadable: start empty */
  }
}
// The history behind the Usage and Weekly Rewind screens: one line per cost increase and per finished stretch of work.
const LEDGER_FILE = join(HOME, 'ledger.jsonl')
let ledger: LedgerEvent[] = []
const loadLedger = () => {
  try {
    ledger = parseLedger(readFileSync(LEDGER_FILE, 'utf8'))
  } catch {
    /* first run: nothing recorded yet */
  }
}
function record(e: LedgerEvent) {
  ledger.push(e)
  try {
    mkdirSync(HOME, { recursive: true })
    appendFileSync(LEDGER_FILE, `${JSON.stringify(e)}\n`, { mode: 0o600 })
  } catch {
    /* the history is a convenience; a full disk must not stop an agent */
  }
}
const projectOf = (a: AgentRecord) => basename(a.repoPath)
/** Each allowance, as it was last looked at, saved now and then so the Weekly Rewind can say how hard each account was pushed. */
const limitSeen = new Map<string, { t: number; pct: number }>()
function snapshotLimits(windows: LimitWindow[]) {
  const t = Date.now()
  for (const w of windows) {
    const usedPct = Math.round(100 - w.remainingPct)
    const key = [w.provider, w.account ?? '', w.group, w.kind].join('\n')
    if (!limitDue(limitSeen.get(key), t, usedPct)) continue
    limitSeen.set(key, { t, pct: usedPct })
    record({ k: 'limit', t, provider: w.provider, group: w.group, kind: w.kind, usedPct, ...(w.account && { account: w.account }) })
  }
}

// Folders worked in, saved once an agent has been hired there so the next launch opens where you left off.
const WORKSPACES_FILE = join(HOME, 'workspaces.json')
let workspaces: WorkspaceState = { active: null, recent: [] }
const setWorkspaces = (next: WorkspaceState) => {
  workspaces = next
  saveWorkspaces(WORKSPACES_FILE, workspaces)
}
const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}
// Dev servers an agent has started (spotted in its terminal output, confirmed by connecting), for the Preview tab.
interface Served {
  port: number
  url: string
  alive: boolean
  since: number
  lastAlive: number
}
const served = new Map<string, Map<number, Served>>()
const serverTail = new Map<string, string>()
const ownPorts: number[] = []
const serversOf = (id: string) => [...(served.get(id)?.values() ?? [])].map(({ port, url, alive }) => ({ port, url, alive }))
function noteServers(id: string, chunk: string, terminal = true) {
  // An address in terminal output can arrive split across two chunks; a tool call's words are whole.
  const text = terminal ? (serverTail.get(id) ?? '') + chunk : chunk
  if (terminal) serverTail.set(id, text.slice(-160))
  const found = findLocalServers(text, ownPorts)
  if (!found.length) return
  const mine = served.get(id) ?? new Map<number, Served>()
  served.set(id, mine)
  let added = false
  for (const f of found)
    if (!mine.has(f.port)) {
      mine.set(f.port, { ...f, alive: false, since: Date.now(), lastAlive: 0 })
      added = true
    }
  if (added) void probeServers()
}
async function probeServers() {
  let changed = false
  for (const [id, mine] of served)
    for (const [port, sv] of mine) {
      const alive = await isListening(port)
      if (alive) sv.lastAlive = Date.now()
      if (alive !== sv.alive) (sv.alive = alive), (changed = true)
      // A server that never answered, or stopped answering, half a minute ago is gone.
      if (!alive && Date.now() - (sv.lastAlive || sv.since) > 30_000) (mine.delete(port), (changed = true))
    }
  if (changed) send('servers', Object.fromEntries([...served.keys()].map((id) => [id, serversOf(id)])))
}
// Each agent's conversation, read from the transcript file Claude keeps for its session, for the chat view.
const ATTACH_DIR = join(HOME, 'attachments')
const MAX_CHAT = 800
// Pictures are big; only the newest few stay in memory (older ones remain in the transcript file).
const KEEP_IMAGES = 12
function trimImages(items: ChatItem[]): ChatItem[] {
  let seen = 0
  return [...items].reverse().map((i) => {
    if (i.kind === 'image' && i.src) return ++seen > KEEP_IMAGES ? { ...i, src: '' } : i
    if (i.kind === 'tool-result' && i.images?.some(Boolean)) return ++seen > KEEP_IMAGES ? { ...i, images: i.images.map(() => '') } : i
    return i
  }).reverse()
}
interface Chat {
  tail: { start(): void; stop(): void }
  sessionId: string
  items: ChatItem[]
}
const chats = new Map<string, Chat>()
function followChat(a: AgentRecord) {
  const now = chats.get(a.id)
  if (now?.sessionId === a.sessionId) return
  now?.tail.stop()
  const chat: Chat = { tail: null as unknown as Chat['tail'], sessionId: a.sessionId, items: [] }
  chat.tail = providerOf(a).transcript.follow(a, (items, replace) => {
    chat.items = trimImages((replace ? items : [...chat.items, ...items]).slice(-MAX_CHAT))
    // A replacement (after a rewind) is told to the window as a reset, so it reloads the whole conversation.
    if (replace) send('chat-reset', a.id, a.sessionId)
    else send('chat-items', a.id, a.sessionId, items)
  })
  chats.set(a.id, chat)
  // A different session (after /clear or a fork) is a different conversation: the view starts over.
  if (now) send('chat-reset', a.id, a.sessionId)
  chat.tail.start()
}
/**
 * /clear starts a new Claude session, but its id only reaches us with a later hook event, so the old conversation
 * would linger on screen. Empty the view at once and let the new session's tail take over when its id arrives.
 */
function clearChatNow(id: string) {
  const chat = chats.get(id)
  const a = byId(id)
  if (!chat || !a) return
  chat.items = []
  send('chat-reset', id, a.sessionId)
  chat.tail.stop()
  // If Claude never switches (the command was refused), pick the old conversation back up.
  setTimeout(() => {
    if (chats.get(id) === chat && a.sessionId === chat.sessionId) chat.tail.start()
  }, 60_000)
}
// The permission mode last seen in each agent's footer: hooks only say it changed at their next event, the screen says it at once.
// Agents whose footer has named a mode since they started: the mode they were started in no longer stands in for a footer that says nothing.
const leftStartMode = new Set<string>()
const seenMode = new Map<string, string>()
const RUNNING_FILE = join(HOME, 'running.json')
let quitting = false
const noteRunning = () => {
  if (!quitting) writeRunning(RUNNING_FILE, [...sessions.keys()], Date.now())
}
// Choice menus Claude shows in its own terminal that no other part of the app handles (see genericMenu), once they have stayed put.
// A rewind in progress: after Claude's confirmation is answered, its restored prompt is moved into the chat's composer.
const rewinding = new Map<string, { text: string; at: number }>()
const termMenuSeen = new Map<string, { sig: string; since: number }>()
const termMenuSent = new Map<string, string>()
const MENU_STABLE_MS = 800
const pendingPermissions = new Map<string, PermissionRequest>()
// The last question and plan Claude showed each agent, kept so a reloaded window can show them again.
const stickyEvents = new Map<string, RawEvent>()
// Agents whose question menu is on screen, and the questions Claude last asked each (from its PreToolUse hook).
const questionOpen = new Set<string>()
const askedQuestions = new Map<string, Question[]>()
// Agents being relaunched in place: their exit is not a departure.
const restarting = new Set<string>()
// Relaunches that must not reuse the system prompt the saved session remembers (a new role's instructions).
const freshPrompt = new Set<string>()
// Last size the panel gave each terminal, so a relaunch comes back at the size the user sees.
const sizes = new Map<string, { cols: number; rows: number }>()
let awakeBlocker: number | null = null
// One listener per provider, started with the local servers; every spawned agent gets its own MCP identity file.
const eventHandles = new Map<string, EventHandle>()
const eventsOf = (agentId: string) => { const a = agents.find((x) => x.id === agentId); return a ? eventHandles.get(providerOf(a).id) : undefined }
let office: { mcpUrl: string } | null = null
// Per-agent MCP tokens, minted at each spawn: the token is the agent's identity on the office server.
const agentTokens = new Map<string, string>()
// Claude needs a moment after SessionStart/Stop before its input box accepts a paste.
const DELIVERY_DELAY_MS = 700
const mailbox = new Mailbox({
  agents: () => agents.map((a) => ({ id: a.id, name: a.name, online: sessions.has(a.id) })),
  deliver: (id, text) => {
    const attempt = (left: number) => {
      const p = sessions.get(id)
      if (!p) return
      // Never type into an open menu: the message's Enter would answer it.
      if (ui(id).anyMenu(screens.get(id)?.text() ?? '') && left > 0) return void setTimeout(() => attempt(left - 1), MENU_RETRY_MS)
      // Bracketed paste keeps multi-line messages as one prompt instead of submitting at the first newline.
      p.write(keysOf(id).paste(text))
      setTimeout(() => p.write(keysOf(id).submit), keysOf(id).submitDelayMs)
    }
    setTimeout(() => attempt(MENU_RETRIES), DELIVERY_DELAY_MS)
  },
  notify: (m) => send('agent-message', m)
})
// PTYs exit after the window is gone during quit; messages then have nowhere to go.
const send = (channel: string, ...args: unknown[]) => {
  for (const w of liveWindows()) w.webContents.send(channel, ...args)
}
const persist = () => saveAgents(AGENTS_FILE, agents)
const byId = (id: string) => agents.find((a) => a.id === id)
// The global library of skills and instructions, and the playbooks (global, and one per workspace) that say how agents use it.
const LIBRARY_DIR = join(HOME, 'library')
// Where skills are looked for to import: the user's own folders (a test points it elsewhere).
const userHome = () => process.env.AW_USER_HOME ?? homedir()
const libraryService = createLibraryService({
  root: LIBRARY_DIR,
  agent: (id) => {
    const a = byId(id)
    return a ? { id: a.id, name: a.name, repoPath: a.repoPath, provider: providerOf(a).id } : undefined
  },
  workspaceKey: repoSlug,
  onUse: (id, how) => send('library-use', id, how)
})
// The library's tools only read, so an agent may use them without asking each time (Claude's name for an MCP tool is mcp__server__tool).
const LIBRARY_TOOLS = ['library_index', 'library_get', 'library_search'].map((t) => `mcp__agent-world__${t}`)
// What is added to each message an agent is sent (Claude only: it has a hook for it) comes from libraryService.remind.
const libraryRemind = (id: string, prompt: string) => {
  try {
    return libraryService.remind(id, prompt) || null
  } catch {
    return null
  }
}
// A Claude agent used a library item through its own tools: the Skill tool (plain or plugin-prefixed name), or reading a file of the library.
const noteLibraryUse = (id: string, tool: string, input: Record<string, unknown>) => {
  try {
    if (tool === 'Skill' && typeof input.skill === 'string') libraryService.record(id, input.skill.replace(/^[^:]+:/, ''), 'skill')
    else if (tool === 'Read' && typeof input.file_path === 'string') {
      const m = relative(join(LIBRARY_DIR, 'skills'), input.file_path).split(sep)
      if (m[0] && m[0] !== '..' && !isAbsolute(m[0])) libraryService.record(id, m[0], 'read')
    }
  } catch {
    /* counting is a convenience */
  }
}
/** How to read an agent's terminal screen: that agent's provider knows its own screens. */
const ui = (id: string) => providerOf(byId(id) ?? {}).screen
const keysOf = (id: string) => providerOf(byId(id) ?? {}).keys

// Names handed out but not yet on an agent (creating a worktree takes a moment), so two hires at once never share one.
const reservedNames = new Set<string>()

/** The next name from the list that no agent has and no old branch or worktree in this repo is still using. */
async function nextName(repoPath: string) {
  for (let n = 1; ; n++)
    for (const base of NAMES) {
      const name = n === 1 ? base : `${base}${n}`
      if (agents.some((a) => a.name === name) || reservedNames.has(name)) continue
      reservedNames.add(name)
      if (await nameTaken({ repoPath, name, rootDir: join(HOME, 'worktrees') })) {
        reservedNames.delete(name)
        continue
      }
      // By now the caller has the agent in the list; if it failed instead, the name is free again soon.
      setTimeout(() => reservedNames.delete(name), 30_000)
      return name
    }
}

/**
 * A fresh token per launch, written into this agent's own hook settings and MCP config (user-only files).
 * Every hook call, statusline update and MCP request carries it, and the token alone says which agent is talking.
 */
function agentFiles(a: AgentRecord) {
  if (!office) throw new Error('Local servers are not running yet.')
  for (const [t, id] of agentTokens) if (id === a.id) agentTokens.delete(t)
  const agentToken = randomBytes(24).toString('hex')
  agentTokens.set(agentToken, a.id)
  return providerOf(a).prepare({ dir: join(HOME, 'agents', a.id), hookUrl: eventHandles.get(providerOf(a).id)?.url ?? '', mcpUrl: office.mcpUrl, agentToken, permissionTimeoutSec: PERMISSION_TIMEOUT_SEC, platform: process.platform })
}

// ---- attention: notifications, dock badge, keep-awake ---------------------------------------

// The window already showing this agent's project comes forward; failing that, whichever window was in front. Never a new one.
function comeForward(agent?: AgentRecord) {
  const w = windowFor(agent)
  if (w?.isMinimized()) w.restore()
  w?.show()
  w?.focus()
  if (agent) w?.webContents.send('select-agent', agent.id)
}
let lastNotice: { agentId?: string; at: number } | null = null

function notify(kind: Alert, agent: AgentRecord | undefined, body: string) {
  if (HIDDEN || prefs.notifications === 'off' || (prefs.notifications === 'attention' && kind === 'finished') || !Notification.isSupported() || !shouldNotify(kind, liveWindows().some((w) => w.isFocused()))) return
  const n = new Notification({ title: agent ? `${agent.name} · Agent World` : 'Agent World', body, silent: kind === 'finished' })
  lastNotice = { agentId: agent?.id, at: Date.now() }
  n.on('click', () => comeForward(agent))
  n.show()
}

function refreshAttention() {
  // Dock badge: things only the user can unblock.
  if (!HIDDEN) app.setBadgeCount(pendingPermissions.size + trustOpen.size + planOpen.size + questionOpen.size)
  // Keep the machine awake while any live agent is mid-turn.
  const working = prefs.keepAwake && agents.some((a) => sessions.has(a.id) && !['idle', 'waiting', undefined].includes(lastActivity.get(a.id)))
  if (working && awakeBlocker === null) awakeBlocker = powerSaveBlocker.start('prevent-app-suspension')
  else if (!working && awakeBlocker !== null) {
    powerSaveBlocker.stop(awakeBlocker)
    awakeBlocker = null
  }
}

function onStats(s: AgentStats, agentId: string) {
  const a = byId(agentId)
  if (!a) return
  lastStats.set(a.id, s)
  send('agent-stats', a.id, s)
  if (s.limits.fiveHour || s.limits.sevenDay) {
    limitsBook.record(a.account ?? '', s.limits)
    send('usage', limitsBook.tightest())
    try {
      mkdirSync(HOME, { recursive: true })
      writeFileSync(USAGE_FILE, JSON.stringify(limitsBook), { mode: 0o600 })
    } catch {
      /* the reading is only a convenience; losing it is fine */
    }
  }
  // An agent hired before the history existed has spent all its total already: that is the starting point, not new spending.
  const fresh = a.hiredAt !== undefined && Date.now() - a.hiredAt < 30 * 60_000
  const spent = costDelta(a.costSeen ?? (fresh ? 0 : s.costUsd), s.costUsd)
  if (spent !== 0 || a.costSeen === undefined) {
    a.costSeen = s.costUsd
    persist()
    if (spent > 0) record({ k: 'cost', t: Date.now(), agent: a.id, project: projectOf(a), model: s.model ?? 'unknown', usd: spent, provider: providerOf(a).id, name: a.name, ...(a.account && { account: a.account }) })
  }
  // A program that counts tokens instead of dollars: record how many it used since the last report.
  // Every program's tokens are counted, and a program that reports no price is given an estimate from them.
  const used = s.tokens ?? s.tokenTotals
  if (used) {
    const prev = a.tokensSeen ?? (fresh ? { input: 0, output: 0 } : used)
    const grew = { input: costDelta(prev.input, used.input), output: costDelta(prev.output, used.output) }
    if (!a.tokensSeen || grew.input !== 0 || grew.output !== 0) {
      a.tokensSeen = { input: used.input, output: used.output }
      persist()
      if (grew.input > 0 || grew.output > 0) {
        const who = { agent: a.id, project: projectOf(a), model: s.model ?? 'unknown', provider: providerOf(a).id, name: a.name, ...(a.account && { account: a.account }) }
        record({ k: 'tokens', t: Date.now(), ...who, ...grew })
        const usd = providerOf(a).capabilities.budget ? null : estimateUsd(who.model, grew.input, grew.output, priceBook)
        if (usd) record({ k: 'cost', t: Date.now(), ...who, usd, est: true })
      }
    }
  }
  const alert = budgetAlert(lastCost.get(a.id) ?? 0, s.costUsd, a.options?.budgetUsd)
  lastCost.set(a.id, s.costUsd)
  if (alert) {
    const budget = a.options!.budgetUsd!.toFixed(2)
    notify('budget', a, alert === 'over' ? `Over its $${budget} budget ($${s.costUsd.toFixed(2)} spent).` : `At 80% of its $${budget} budget.`)
    send('budget-alert', a.id, alert)
  }
}

// Hook events tell the mailbox when each agent can take a new prompt.
// How long each agent has been working: a stretch starts when it gets busy and ends when it stops, waits for you or goes to sleep.
const workClocks = new Map<string, WorkClock>()
function runClock(a: AgentRecord, activity: string) {
  const before = workClocks.get(a.id) ?? { total: a.workedMs ?? 0, since: null }
  const after = advanceWork(before, activity, Date.now())
  workClocks.set(a.id, after)
  // Only a finished stretch is saved, so this does not write to disk on every step of a turn.
  if (before.since !== null && after.since === null) {
    a.workedMs = after.total
    persist()
    record({ k: 'work', t: before.since, agent: a.id, project: projectOf(a), ms: Date.now() - before.since, provider: providerOf(a).id, name: a.name, ...(a.account && { account: a.account }) })
  }
}

function trackTurns(e: AgentEvent) {
  const a = byId(e.agentId)
  if (!a) return
  // /clear (and fork) start a new Claude session in the same terminal; resume must follow the new one.
  if (e.sessionId !== a.sessionId) {
    a.sessionId = e.sessionId
    persist()
    followChat(a)
  }
  if (e.type === 'question') askedQuestions.set(a.id, e.questions)
  if (e.type === 'session-start') mailbox.ready(a.id)
  else if (e.type === 'task' || e.type === 'plan') return
  else if (e.type === 'activity' && !e.subagentId) {
    // A conversation exists once a turn has begun; only then can a relaunch use --resume.
    if (!a.started) {
      a.started = true
      delete a.forkOf
      persist()
    }
    if (finishedTurn(lastActivity.get(a.id), e.activity)) notify('finished', a, e.activity === 'waiting' ? 'Waiting for you.' : 'Finished its turn.')
    lastActivity.set(a.id, e.activity)
    runClock(a, e.activity)
    if (e.activity === 'idle' || e.activity === 'waiting') mailbox.turnEnded(a.id)
    else mailbox.busy(a.id)
  }
}

/**
 * A menu Claude draws in its own terminal that the app has no card for (a permission dialog Claude insists on showing
 * itself, the rewind confirmation, a picker…) is offered in the chat, once it has stayed put for a moment. Menus the app
 * already handles (trust, plan, questions, a permission it holds) are left to those.
 */
function surfaceTerminalMenu(id: string, text: string) {
  const menu = ui(id).genericMenu(text)
  const covered = trustOpen.has(id) || planOpen.has(id) || questionOpen.has(id) || !!eventsOf(id)?.hasPending(id)
  const sig = menu && !covered ? JSON.stringify([menu.title, menu.context, menu.options]) : ''
  if (!sig) {
    termMenuSeen.delete(id)
    if (termMenuSent.get(id)) {
      termMenuSent.set(id, '')
      send('terminal-menu', id, null)
      if (rewinding.has(id)) setTimeout(() => finishRewind(id), 1500)
      // The menu was the reason for waiting; whatever Claude does next, it is working again.
      const a = byId(id)
      if (a && lastActivity.get(id) === 'permission') {
        lastActivity.set(id, 'thinking')
        send('agent-event', { type: 'activity', agentId: id, sessionId: a.sessionId, activity: 'thinking' })
      }
    }
    return
  }
  const seen = termMenuSeen.get(id)
  if (seen?.sig !== sig) return void termMenuSeen.set(id, { sig, since: Date.now() })
  if (Date.now() - seen.since >= MENU_STABLE_MS && termMenuSent.get(id) !== sig) {
    termMenuSent.set(id, sig)
    send('terminal-menu', id, { title: menu!.title, context: menu!.context, options: menu!.options, hint: menu!.hint })
    const a = byId(id)
    if (a) {
      lastActivity.set(id, 'permission')
      send('agent-event', { type: 'activity', agentId: id, sessionId: a.sessionId, activity: 'permission', detail: menu!.title })
    }
  }
}

/** After a rewind the restored prompt is back in the input box (and the conversation may have forked to a new session). */
function finishRewind(id: string) {
  const r = rewinding.get(id)
  const a = byId(id)
  rewinding.delete(id)
  if (!r || !a) return
  const text = screens.get(id)?.text() ?? ''
  const head = r.text.slice(0, 30)
  if (ui(id).typedText?.(text).startsWith(head)) {
    sessions.get(id)?.write(keysOf(id).clearInput)
    send('composer-prefill', id, r.text)
  }
  const fork = providerOf(a).transcript.forkedSession(a, r.at - 1000)
  if (fork) {
    a.sessionId = fork
    persist()
    followChat(a)
  }
}

// Keeps each program's logins apart (Settings > Accounts) and moves agents between them.
const accountsSvc = new AccountService({ home: HOME, providers: () => providers(), accounts: () => prefs.accounts })

function spawn(a: AgentRecord, env: NodeJS.ProcessEnv) {
  if (sessions.has(a.id)) return
  followChat(a)
  const provider = providerOf(a)
  const files = agentFiles(a)
  const mail = mailState(provider)
  // What the library gives this agent: the opening text for its playbook and, for Claude, a folder of just the skills allowed. It never stops an agent starting.
  const canFetch = mail === 'yes' || mail === 'connected'
  let lib: { core: string; reminder: string; pluginDir: string | null } = { core: '', reminder: '', pluginDir: null }
  try {
    lib = libraryService.prepare(a.id, canFetch, !!provider.capabilities.nativeSkills)
  } catch {
    /* the library is a convenience */
  }
  const args = provider.args({ agent: a, files, permissionMode: PERMISSION_MODE, options: a.options, houseRules: [canFetch && MEMORY_HINT, canFetch && DESCRIBE_HINT, okfHint(a.cwd), lib.core, prefs.houseRules].filter(Boolean).join('\n\n'), addDirs: [ATTACH_DIR, ...(existsSync(LIBRARY_DIR) ? [LIBRARY_DIR] : [])], pluginDirs: lib.pluginDir ? [lib.pluginDir] : [], allowTools: lib.core ? LIBRARY_TOOLS : [] })
  const { cols, rows } = sizes.get(a.id) ?? { cols: COLS, rows: ROWS }
  const cmd = providerCmd(provider, args)
  spawnedAt.set(a.id, Date.now())
  const p = pty.spawn(cmd.file, cmd.args, { name: 'xterm-256color', cols, rows, cwd: a.cwd, env: { ...env, ...files.env, ...accountsSvc.envFor(a.provider, a.configDir) } })
  screens.get(a.id)?.dispose()
  const screen = new Screen(cols, rows)
  screens.set(a.id, screen)
  leftStartMode.delete(a.id)
  sessions.set(a.id, p)
  noteRunning()
  p.onData((d) => {
    const b = buffers.get(a.id) ?? { text: '', end: 0 }
    const next = { text: (b.text + d).slice(-SCROLLBACK), end: b.end + d.length }
    buffers.set(a.id, next)
    send('pty-data', a.id, d, next.end)
    noteServers(a.id, d)
    lastOutput.set(a.id, Date.now())
    void screen.write(d).then(() => {
      const text = screen.text()
      // A permission answered in the terminal: its menu was up while our card was open, and now it is gone.
      if (eventsOf(a.id)?.hasPending(a.id)) {
        if (ui(a.id).anyMenu(text)) menuSeen.add(a.id)
        else if (menuSeen.delete(a.id)) eventsOf(a.id)?.dismiss(a.id)
      } else menuSeen.delete(a.id)
      const named = ui(a.id).readMode(text)
      if (named && named !== 'request-review') leftStartMode.add(a.id)
      const mode = ui(a.id).readMode(text, leftStartMode.has(a.id) ? undefined : a.options?.permissionMode)
      if (mode && mode !== seenMode.get(a.id)) {
        seenMode.set(a.id, mode)
        send('agent-event', { type: 'mode', agentId: a.id, sessionId: a.sessionId, mode })
      }
      // SessionStart does not reach HTTP hooks, so readiness for the first message comes from the screen.
      if (ui(a.id).inputReady(text)) mailbox.started(a.id)
      const trust = ui(a.id).trustPrompt(text)
      if (trust && !trustOpen.has(a.id)) {
        trustOpen.add(a.id)
        send('trust-prompt', a.id, trust.path || a.cwd)
        notify('trust', a, 'Needs you to trust its workspace before it can start.')
        refreshAttention()
      } else if (!trust && trustOpen.delete(a.id)) {
        send('trust-prompt', a.id, null)
        refreshAttention()
      }
      const asking = !!ui(a.id).parseAsk(text)
      if (asking !== questionOpen.has(a.id)) {
        if (asking) {
          questionOpen.add(a.id)
          notify('permission', a, 'Has a question for you.')
        } else questionOpen.delete(a.id)
        send('question-menu', a.id, asking)
        refreshAttention()
      }
      const plan = !!ui(a.id).planMenu(text)
      if (plan !== planOpen.has(a.id)) {
        if (plan) {
          planOpen.add(a.id)
          notify('permission', a, 'Has a plan ready for your review.')
        } else planOpen.delete(a.id)
        send('plan-menu', a.id, plan)
        refreshAttention()
      }
    })
  })
  p.onExit(() => {
    sessions.delete(a.id)
    noteRunning()
    if (restarting.delete(a.id)) {
      screens.get(a.id)?.dispose()
      screens.delete(a.id)
      if (freshPrompt.delete(a.id)) providerOf(a).transcript.forgetInstructions(a)
      return spawn(a, env)
    }
    for (const [t, id] of agentTokens) if (id === a.id) agentTokens.delete(t)
    screens.get(a.id)?.dispose()
    screens.delete(a.id)
    mailbox.gone(a.id)
    runClock(a, 'asleep')
    lastActivity.delete(a.id)
    lastCost.delete(a.id)
    refreshAttention()
    if (trustOpen.delete(a.id)) send('trust-prompt', a.id, null)
    if (planOpen.delete(a.id)) send('plan-menu', a.id, false)
    if (questionOpen.delete(a.id)) send('question-menu', a.id, false)
    send('pty-exit', a.id)
    send('agent-event', { type: 'session-end', agentId: a.id, sessionId: a.sessionId })
  })
}

const isLocalHttp = (u: string) => {
  try {
    const x = new URL(u)
    return x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname)
  } catch {
    return false
  }
}
// Electron draws no right-click menu by itself; give the app's pages and the preview panes the system's own.
const rightClick = (contents: Electron.WebContents) =>
  contents.on('context-menu', (_e, params) => {
    const items = contextItems(params, (u) => void clipboard.writeText(u), () => contents.copyImageAt(params.x, params.y))
    if (items.length) Menu.buildFromTemplate(items).popup()
  })

/** Opens another window onto the same agents. It has no project yet, so it shows the picker. */
function createWindow() {
  const near = frontWindow()?.getBounds()
  const w = new BrowserWindow({
    show: !HIDDEN,
    width: 1440,
    height: 900,
    // Offset from the window in front, so a new one does not hide exactly behind it.
    ...(near && { x: near.x + 32, y: near.y + 32 }),
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#14121c',
    title: 'Agent World',
    // A step or two larger than the default, which is what pressing Cmd+ twice gave every launch; AW_ZOOM=1 turns it off (tests).
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, webviewTag: true, zoomFactor: Number(process.env.AW_ZOOM) || 1.2 }
  })
  const id = w.webContents.id
  windows.add(w)
  w.on('closed', () => {
    windows.delete(w)
    windowWorkspaces.drop(id)
  })
  w.webContents.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.contextIsolation = true
    prefs.sandbox = true
    if (!isLocalHttp(params.src ?? '')) e.preventDefault()
  })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  // Cmd+N on a Mac; Ctrl+Shift+N elsewhere, since Ctrl+N belongs to the shell in the terminal.
  w.webContents.on('before-input-event', (e, input) => {
    const mac = process.platform === 'darwin'
    if (input.type === 'keyDown' && input.key.toLowerCase() === 'n' && !input.alt && (mac ? input.meta && !input.shift : input.control && input.shift)) (e.preventDefault(), createWindow())
  })
  rightClick(w.webContents)
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
  return w
}

async function main() {
  await app.whenReady()
  // The packaged app has its icon built in; a development run needs it set.
  if (!app.isPackaged && process.platform === 'darwin' && !HIDDEN) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  mkdirSync(HOME, { recursive: true })
  agents = loadAgents(AGENTS_FILE)
  for (const a of agents) followChat(a)
  loadUsage()
  loadPrices()
  loadLedger()
  workspaces = loadWorkspaces(WORKSPACES_FILE)
  const env = { ...providerOf({}).env(process.env), PATH: loginShellPath() }

  const eventOptions = (p: Provider): EventSourceOptions => ({
    agentForToken: (t) => agentTokens.get(t) ?? null,
    // The page an agent opens in a browser tool or curls is the one to preview, even when it did not start that server itself.
    onToolInput: (id, json) => noteServers(id, json, false),
    permissionTimeoutMs: PERMISSION_TIMEOUT_SEC * 1000,
    onEvent: (e) => {
      // Only the terminal process exiting means the agent left. SessionEnd also fires on /clear and when we
      // relaunch a session to switch model, while the agent carries on.
      if (e.type === 'session-end') return
      trackTurns(e)
      refreshAttention()
      if (e.type === 'question' || e.type === 'plan') stickyEvents.set(`${e.agentId}:${e.type}`, e)
      send('agent-event', e)
    },
    onPermission: (r) => {
      pendingPermissions.set(r.id, r)
      // The terminal menu may already be drawn (and static) by the time the hook arrives.
      if (ui(r.agentId).anyMenu(screens.get(r.agentId)?.text() ?? '')) menuSeen.add(r.agentId)
      refreshAttention()
      send('permission', r)
      notify('permission', byId(r.agentId), `Wants to use ${r.tool}: ${r.detail}`)
    },
    onPermissionSettled: (id) => {
      pendingPermissions.delete(id)
      refreshAttention()
      send('permission-settled', id)
    },
    onStatus: onStats,
    reminderFor: libraryRemind,
    onToolUse: noteLibraryUse,
    onCompact: (id) => libraryService.refresh(id),
    // For a provider that reports nothing itself: its agents, their screens, and the keys to press on them.
    onSession: (id, sessionId) => {
      const a = byId(id)
      if (!a || a.sessionId === sessionId) return
      a.sessionId = sessionId
      persist()
      followChat(a)
    },
    terminal: {
      agents: () => agents.filter((a) => providerOf(a).id === p.id),
      screen: (id) => (sessions.has(id) ? (screens.get(id)?.text() ?? '') : ''),
      write: (id, keys) => void sessions.get(id)?.write(keys),
      startedAt: (id) => spawnedAt.get(id) ?? 0
    }
  })
  for (const p of providers()) eventHandles.set(p.id, await p.events.start(eventOptions(p)))
  // An agent that looks idle (input box showing, no menu, screen quiet for a few seconds) but never sent a Stop hook,
  // as after Esc: Claude does not report an interrupted turn. Call it idle, so the office, the chat and any waiting mail move on.
  const BUSY = new Set<Activity>(['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting'])
  let idleCheck: ReturnType<typeof setTimeout>
  const sweepOnce = () => {
    for (const a of agents) {
      if (!sessions.has(a.id)) continue
      const text = screens.get(a.id)?.text() ?? ''
      surfaceTerminalMenu(a.id, text)
      const btw = ui(a.id).btwOverlay(text)
      const sig = btw ? JSON.stringify(btw) : ''
      if (btwSent.get(a.id) !== sig && (btw || btwSent.has(a.id))) (btwSent.set(a.id, sig), send('btw', a.id, btw))
      if (Date.now() - (lastOutput.get(a.id) ?? 0) <= SETTLED_MS || !ui(a.id).inputReady(text) || ui(a.id).anyMenu(text) || ui(a.id).looksWorking(text)) continue
      mailbox.looksIdle(a.id)
      const act = lastActivity.get(a.id)
      if (act && BUSY.has(act)) {
        lastActivity.set(a.id, 'idle')
        send('agent-event', { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: 'idle' })
      }
    }
  }
  // Looked at often only while something is being written (see idleCheckDelay), and always again, even if one look fails.
  const sweep = () => {
    try {
      sweepOnce()
    } finally {
      idleCheck = setTimeout(sweep, idleCheckDelay(agents.filter((a) => sessions.has(a.id)).map((a) => lastOutput.get(a.id) ?? 0), Date.now()))
    }
  }
  idleCheck = setTimeout(sweep, 300)
  const mcp = await startMcpServer({
    agentForToken: (t) => agentTokens.get(t) ?? null,
    listAgents: (caller) =>
      agents.map((a) => ({ name: a.name, activity: sessions.has(a.id) ? (lastActivity.get(a.id) ?? 'idle') : 'offline', branch: a.branch, you: a.id === caller })),
    send: (from, to, message, expectsReply) => mailbox.send(from, to, message, { expectsReply }),
    remember: (caller, text) => {
      const a = byId(caller)
      if (a) remember(memoryFile(a.repoPath), text, a.name)
    },
    recall: (caller, query) => {
      const a = byId(caller)
      return a ? recall(loadMemory(memoryFile(a.repoPath)), query) : []
    },
    // A program's own hooks (agy's plugin) calling the office: its provider says what to answer.
    hook: (id, event, payload) => {
      const a = byId(id)
      if (!a) return {}
      return providerOf(a).libraryHook?.(event, payload, { remind: (prompt) => libraryRemind(id, prompt) ?? '', used: (path) => noteLibraryUse(id, 'Read', { file_path: path }) }) ?? {}
    },
    library: {
      index: (caller) => libraryService.index(caller),
      get: (caller, id, file) => libraryService.get(caller, id, file),
      search: (caller, query) => libraryService.search(caller, query)
    }
  })
  const pages = await startFileServer()
  office = { mcpUrl: mcp.url }
  for (const u of [mcp.url, ...[...eventHandles.values()].map((h) => h.url)]) if (u) ownPorts.push(Number(new URL(u).port))

  ipcMain.handle('pick-folder', async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender) ?? frontWindow()!, { properties: ['openDirectory'] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  // A reloaded window asks again while sessions are still running, so it must learn who is at work, not assume everyone left.
  // Roles: ready-made agents. Built in, from the project's and the user's Claude subagent files, and saved by the user.
  const ROLES_FILE = join(HOME, 'roles.json')
  ipcMain.handle('roles:list', (_, folder: string) => [
    ...BUILT_IN_ROLES.map((r) => ({ ...r, options: { ...r.options, role: r.title } })),
    ...(folder && isDir(folder) ? discoverRoles(folder, homedir()) : []),
    ...loadRoles(ROLES_FILE)
  ])
  ipcMain.handle('roles:save', (_, r: { title: string; blurb: string; options: AgentOptions; nameHint?: string }) => saveRole(ROLES_FILE, r))
  ipcMain.handle('roles:delete', (_, id: string) => deleteRole(ROLES_FILE, id))
  ipcMain.handle('get-usage', () => limitsBook.tightest())
  ipcMain.handle('limits:get', async (_, refresh?: boolean) => {
    if (refresh || Date.now() - limitsAt > LIMITS_FRESH_MS) await pollLimits()
    // What Claude's agents report as they work is the freshest; what was asked for stands in until there is one (and adds the per-model weeks).
    // The program whose agents report them (capabilities.liveLimits) is the one `usage` belongs to.
    const liveId = providers().find((p) => p.capabilities.liveLimits)?.id
    const logins = ['', ...prefs.accounts.filter((x) => x.provider === liveId).map((x) => x.id)]
    const own = logins.flatMap((account) => {
      const live = claudeWindows(limitsBook.of(account)).map((w) => ({ ...w, account }))
      const asked = polled.flat().filter((w) => w.provider === liveId && (w.account ?? '') === account)
      return live.length ? [...live, ...asked.filter((w) => w.group !== live[0]!.group)] : asked
    })
    const all = [...own, ...polled.flat().filter((w) => w.provider !== liveId)]
    snapshotLimits(all)
    return all
  })
  ipcMain.handle('chat:get', (_, id: string) => ({ sessionId: chats.get(id)?.sessionId ?? '', items: chats.get(id)?.items ?? [] }))
  // The composer types into the agent's real terminal, exactly as if typed there, so nothing about the session changes.
  ipcMain.handle('chat:send', async (_, id: string, raw: string) => {
    const p = sessions.get(id)
    if (!p) throw new Error('That agent is not running. Wake it first.')
    const text = raw.replace(/\x1b\[20[01]~/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim()
    if (!text) return
    if (ui(id).anyMenu(screens.get(id)?.text() ?? '')) throw new Error('Claude is showing a menu. Answer it first (or finish it in the Terminal tab).')
    // Only an agent that is free takes /clear at once; a busy one queues it, and its conversation is still there.
    const clearing = /^\/clear$/i.test(text) && ['idle', 'waiting', undefined].includes(lastActivity.get(id))
    p.write(keysOf(id).paste(text))
    await new Promise((r) => setTimeout(r, keysOf(id).submitDelayMs))
    p.write(keysOf(id).submit)
    if (clearing) clearChatNow(id)
  })
  // Pictures and files attached in the chat are saved here and mentioned by path; the agent is allowed to read this folder.
  ipcMain.handle('attach-save', (_, agentId: string, name: string, bytes: Uint8Array, mime: string) => {
    if (!byId(agentId)) throw new Error('Unknown agent.')
    return saveAttachment(ATTACH_DIR, agentId, name, bytes, mime)
  })
  // A picture mentioned in a message, as a data URL for the chat to show (pictures only, and not enormous ones).
  ipcMain.handle('read-image', (_, agentId: string, path: string) => {
    const a = byId(agentId)
    if (!a || !/\.(png|jpe?g|gif|webp)$/i.test(path)) return ''
    const full = isAbsolute(path) ? path : join(a.cwd, path)
    try {
      if (statSync(full).size > 8 * 1024 * 1024) return ''
      const ext = extname(full).slice(1).toLowerCase().replace('jpg', 'jpeg')
      return `data:image/${ext};base64,${readFileSync(full).toString('base64')}`
    } catch {
      return ''
    }
  })
  // Shift+Tab is how Claude's terminal cycles its permission mode; the new mode arrives with the next event.
  ipcMain.handle('chat:cycle-mode', (_, id: string) => {
    if (ui(id).anyMenu(screens.get(id)?.text() ?? '')) throw new Error('Answer the open menu first.')
    sessions.get(id)?.write(keysOf(id).nextMode)
  })
  // Esc is how Claude's own terminal interrupts a running turn.
  // If Claude is still visibly working a moment later (it can swallow a first Esc, for one, while hooks run), press Esc
  // again, and as a last resort Ctrl+C once, which also interrupts a running operation.
  // A reloaded window has forgotten everything it was showing. Say it all again: what is waiting on the user comes back.
  ipcMain.handle('resync', () => {
    for (const r of pendingPermissions.values()) send('permission', r)
    for (const id of questionOpen) {
      const e = stickyEvents.get(`${id}:question`)
      if (e) send('agent-event', e)
      send('question-menu', id, true)
    }
    for (const id of planOpen) {
      const e = stickyEvents.get(`${id}:plan`)
      if (e) send('agent-event', e)
      send('plan-menu', id, true)
    }
    for (const id of trustOpen) send('trust-prompt', id, byId(id)?.cwd ?? '')
    // Terminal menus and side questions are re-read from the screen within a moment.
    termMenuSent.clear()
    termMenuSeen.clear()
    btwSent.clear()
    for (const [id, m] of seenMode) send('agent-event', { type: 'mode', agentId: id, sessionId: byId(id)?.sessionId ?? '', mode: m })
  })
  ipcMain.handle('updates:check', () => checkForUpdates(prefs.updateUrl, (s) => send('update-state', s)))
  // Automated runs have no one to walk through setup, so they start as if it was done.
  ipcMain.handle('prefs:get', () => (process.env.AW_NO_SETUP ? { ...prefs, setup: { ...prefs.setup, done: true } } : prefs))
  ipcMain.handle('prefs:set', (_, next: unknown) => {
    prefs = cleanPrefs(next, prefs)
    savePrefs(join(HOME, 'preferences.json'), prefs)
    refreshAttention()
    return prefs
  })
  // Notes are kept outside the project, so they never show up as untracked files in its git status.
  ipcMain.handle('notes:save', (_, id: string) => {
    const a = byId(id)
    const items = chats.get(id)?.items ?? []
    if (!a || items.length === 0) throw new Error('Nothing to write down yet: this conversation is empty.')
    const dir = join(HOME, 'notes', repoSlug(a.repoPath))
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${new Date().toISOString().slice(0, 10)}-${a.name}-${a.sessionId.slice(0, 6)}.md`)
    writeFileSync(file, sessionNotes(items, { name: a.name, branch: a.branch, cost: lastStats.get(id)?.costUsd }))
    if (!HIDDEN) shell.showItemInFolder(file)
    return file
  })
  // The last few lines each agent's terminal shows, for the grid of tiles.
  ipcMain.handle('peek', (_, ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, (screens.get(id)?.text() ?? '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() && !/^[─▔━\s]+$/.test(l)).slice(-7)]))
  )
  ipcMain.handle('memory:list', (_, id: string) => {
    const a = byId(id)
    return a ? loadMemory(memoryFile(a.repoPath)).reverse() : []
  })
  ipcMain.handle('memory:add', (_, id: string, text: string) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    return remember(memoryFile(a.repoPath), text, 'you')
  })
  ipcMain.handle('memory:forget', (_, id: string, entryId: string) => {
    const a = byId(id)
    if (a) forget(memoryFile(a.repoPath), entryId)
  })
  // Files an agent mentions: is it a real file, what is in it, and how can it be shown or opened.
  const fileFor = async (agentId: string, written: string) => {
    const a = byId(agentId)
    const info = a ? await resolveFile(a.cwd, written) : null
    if (!info) throw new Error('That file is not there any more.')
    return info
  }
  ipcMain.handle('file:info', async (_, agentId: string, paths: string[]) => {
    const a = byId(agentId)
    if (!a) return paths.map(() => null)
    return Promise.all(paths.slice(0, 60).map((p) => resolveFile(a.cwd, p)))
  })
  ipcMain.handle('file:read', async (_, agentId: string, path: string) => {
    const info = await fileFor(agentId, path)
    if (!['code', 'text', 'markdown', 'html'].includes(info.kind)) throw new Error('That kind of file is not shown as text.')
    return { info, ...(await readText(info.path)) }
  })
  ipcMain.handle('file:url', async (_, agentId: string, path: string) => {
    const info = await fileFor(agentId, path)
    if (info.kind !== 'html' && info.kind !== 'pdf') throw new Error('Only pages and PDFs open as a page.')
    return { info, url: pages.urlFor(info.path) }
  })
  ipcMain.handle('file:image', async (_, agentId: string, path: string) => {
    const info = await fileFor(agentId, path)
    if (info.kind !== 'image' || info.size > 12 * 1024 * 1024) throw new Error('That picture is too large to show here.')
    const ext = info.name.split('.').pop()!.toLowerCase().replace('jpg', 'jpeg').replace('svg', 'svg+xml')
    return { info, src: `data:image/${ext};base64,${readFileSync(info.path).toString('base64')}` }
  })
  ipcMain.handle('file:open-external', async (_, agentId: string, path: string) => {
    const info = await fileFor(agentId, path)
    return shell.openPath(info.path)
  })
  ipcMain.handle('btw:close', (_, id: string) => {
    if (ui(id).btwOverlay(screens.get(id)?.text() ?? '')) sessions.get(id)?.write(keysOf(id).cancel)
  })
  ipcMain.handle('procs:list', (_, id: string) => (sessions.get(id) ? listProcs(sessions.get(id)!.pid) : []))
  ipcMain.handle('procs:stop', (_, id: string, pid: number) => (sessions.get(id) ? stopProc(sessions.get(id)!.pid, pid) : false))
  ipcMain.handle('chat:interrupt', (_, id: string) => {
    const p = sessions.get(id)
    if (!p) return
    const { first, then } = keysOf(id).interrupt
    // Stopping answers what the agent was waiting on: a permission card still open would keep it looking busy after the Esc.
    for (const r of [...pendingPermissions.values()]) if (r.agentId === id) eventHandles.forEach((h) => h.decide(r.id, 'deny'))
    // Claude reports nothing after an Esc, and the idle check only settles a working agent: leave "waiting for you" so it can.
    const a = byId(id)
    if (a && lastActivity.get(id) === 'permission') {
      lastActivity.set(id, 'thinking')
      send('agent-event', { type: 'activity', agentId: id, sessionId: a.sessionId, activity: 'thinking' })
    }
    p.write(first)
    for (const [delay, keys] of then)
      setTimeout(() => {
        if (sessions.get(id) === p && ui(id).looksWorking(screens.get(id)?.text() ?? '')) p.write(keys)
      }, delay)
  })
  ipcMain.handle('get-servers', () => Object.fromEntries([...served.keys()].map((id) => [id, serversOf(id)])))
  // Only local addresses may be handed to the system browser from here.
  ipcMain.handle('open-external', (_, url: string) => {
    const u = new URL(url)
    // Links in the chat are https; dev servers are plain http on this machine. Nothing else leaves the app.
    const local = u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)
    if (u.protocol !== 'https:' && !local) throw new Error('Only https links and local addresses can be opened from here.')
    return shell.openExternal(u.toString())
  })
  setInterval(() => void probeServers(), 3000)
  // Each window has its own project, chosen on the picker a fresh window opens with; the saved list is shared.
  const workspaceInfo = async (windowId: number) => {
    const active = windowWorkspaces.get(windowId)
    const paths = [...new Set([...workspaces.recent, ...(active ? [active] : [])])]
    const items = await Promise.all(
      paths.map(async (path) => ({
        path,
        name: basename(path),
        exists: isDir(path),
        git: isDir(path) && (await isGitRepo(path)),
        agents: agents.filter((a) => a.repoPath === path).length,
        saved: workspaces.recent.includes(path)
      }))
    )
    return { active, items }
  }
  ipcMain.handle('workspaces:get', (e) => workspaceInfo(e.sender.id))
  ipcMain.handle('workspaces:activate', async (e, path: string) => {
    if (!isDir(path)) throw new Error('That folder is not there any more.')
    windowWorkspaces.set(e.sender.id, path)
    setWorkspaces(activateWorkspace(workspaces, path))
    return workspaceInfo(e.sender.id)
  })
  ipcMain.handle('workspaces:forget', async (e, path: string) => {
    setWorkspaces(forgetWorkspace(workspaces, path))
    windowWorkspaces.forget(path)
    return workspaceInfo(e.sender.id)
  })
  ipcMain.handle('window:new', () => void createWindow())
  ipcMain.handle('list-agents', () => agents.map((a) => ({ ...a, online: sessions.has(a.id), activity: lastActivity.get(a.id) })))
  ipcMain.handle('add-agent', async (_, folder: string, options: AgentOptions = {}, wanted?: string, base?: string) => {
    const name = cleanName(wanted ?? '') ? checkName(wanted!, agents.map((a) => a.name)) : await nextName(folder)
    if (cleanName(wanted ?? '') && (await nameTaken({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') })))
      throw new Error(`A branch or folder named aw/${name} is left over from an earlier agent here. Pick another name, or delete that branch first.`)
    const wt = !options.inPlace && (await isGitRepo(folder)) ? await createWorktree({ repoPath: folder, name, rootDir: join(HOME, 'worktrees'), ...(base && (await assertBranch(folder, base), { base })) }) : null
    setWorkspaces(rememberWorkspace(workspaces, folder))
    const provider = providers().find((p) => p.id === (options.provider || prefs.setup.defaultProvider))?.id ?? providerOf({}).id
    const a: AgentRecord = { id: randomUUID(), name, sessionId: randomUUID(), repoPath: folder, cwd: wt?.path ?? folder, branch: wt?.branch ?? null, base: wt?.base ?? null, provider, started: false, hiredAt: Date.now(), options: fitOptions(providers().find((p) => p.id === provider)?.models ?? [], { ...options, account: undefined }) }
    accountsSvc.assign(a, options.account ?? prefs.defaults.accounts[provider])
    agents.push(a)
    persist()
    spawn(a, env)
    return a
  })
  // What this agent's Claude can reach: MCP servers (health-checked by Claude itself) and plugins, as seen from its folder.
  ipcMain.handle('manage-tools', (_, id: string, action: import('../shared/types').ManageAction) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    const tools = providerOf(a).tools
    if (!tools) throw new Error('This agent cannot manage tools from here.')
    const args = tools.manage(action)
    return new Promise<string>((resolve, reject) =>
      execFile(providerCmd(providerOf(a), args).file, providerCmd(providerOf(a), args).args, { cwd: a.cwd, env, timeout: 60_000 }, (err, stdout, stderr) => (err ? reject(new Error((stderr || stdout || err.message).trim().split('\n')[0])) : resolve(stdout.trim())))
    )
  })
  ipcMain.handle('list-tools', async (_, id: string) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    const tools = providerOf(a).tools
    if (!tools) return { mcp: [], plugins: [] }
    const claude = (...args: string[]) =>
      new Promise<string>((resolve) => execFile(providerCmd(providerOf(a), args).file, providerCmd(providerOf(a), args).args, { cwd: a.cwd, env, timeout: 45_000, maxBuffer: 8 * 1024 * 1024 }, (_err, stdout) => resolve(stdout)))
    const [servers, plugins] = await Promise.all([claude(...tools.list.servers), claude(...tools.list.plugins)])
    return tools.parse(servers, plugins)
  })
  // Hand this agent's branch to another agent, or to a new one of either provider. It travels as a normal agent message, so it queues
  // when the receiver is busy; only an agent that can use the message box is offered, since it must be able to answer through it.
  ipcMain.handle('handoff:send', async (_, authorId: string, to: { agent: string } | { hire: ProviderId }, kind: HandoffKind, note: string) => {
    const author = byId(authorId)
    if (!author) throw new Error('Unknown agent.')
    if (!author.branch || !author.base) throw new Error(`${author.name} works in a shared folder, so there is no branch to hand over.`)
    if (!['review', 'continue', 'answer'].includes(kind)) throw new Error('Pick what you want from them.')
    const canMail = (p: Provider) => ['yes', 'connected'].includes(mailState(p) as string)
    let receiver: AgentRecord | undefined
    let created: AgentRecord | null = null
    if ('agent' in to) {
      receiver = byId(to.agent)
      if (!receiver || receiver.id === author.id) throw new Error('Pick a different agent.')
      if (!canMail(providerOf(receiver))) throw new Error(`${receiver.name} cannot use the message box yet, so it could not answer. Connect it in Settings first.`)
    } else {
      const p = providers().find((x) => x.id === to.hire)
      if (!p || (await p.detect(binFor(p))).state !== 'ready') throw new Error('That program is not ready here.')
      if (!canMail(p)) throw new Error(`${p.label} cannot use the message box yet. Connect it in Settings first.`)
      const name = await nextName(author.repoPath)
      // A continuation begins on the sender's commits; a review or a question only reads, so it is kept from editing.
      const wt = await createWorktree({ repoPath: author.repoPath, name, rootDir: join(HOME, 'worktrees'), ...(kind === 'continue' && { from: author.branch }) })
      const readOnly = kind !== 'continue'
      const model = kind === 'review' ? prefs.roleModels.Reviewer : undefined
      created = {
        id: randomUUID(), name, sessionId: randomUUID(), repoPath: author.repoPath, cwd: wt.path, branch: wt.branch, base: wt.base, provider: p.id, started: false, hiredAt: Date.now(),
        options: {
          provider: p.id,
          ...(readOnly && p.autonomy.plan && { permissionMode: p.autonomy.plan as PermissionMode }),
          ...(model && p.models.some((m) => m.value === model) && { model }),
          ...(kind === 'review' && { instructions: 'You are a code reviewer. Read and run read-only commands only; never edit files. Report concrete findings.' })
        }
      }
      setWorkspaces(rememberWorkspace(workspaces, author.repoPath))
      agents.push(created)
      persist()
      spawn(created, env)
      receiver = created
    }
    mailbox.send(author.id, receiver.name, handoffText({ kind, from: author.name, branch: author.branch, base: author.base, worktree: author.cwd, note, fresh: !!created && kind === 'continue' }), { expectsReply: true })
    return created
  })
  // Ask another agent to review this one's branch. The request travels as a normal agent message (author to reviewer),
  // so it shows as an envelope in the office and follows the same delivery and rate-limit rules.
  ipcMain.handle('handoff-review', async (_, authorId: string, reviewer: string) => {
    const author = byId(authorId)
    if (!author) throw new Error('Unknown agent.')
    if (!author.branch || !author.base) throw new Error(`${author.name} works in a shared folder, so there is no branch to review.`)
    let to = reviewer === 'new' ? null : byId(reviewer)
    let created: AgentRecord | null = null
    if (reviewer === 'new') {
      const name = await nextName(author.repoPath)
      const wt = await createWorktree({ repoPath: author.repoPath, name, rootDir: join(HOME, 'worktrees') })
      // Plan mode keeps a reviewer from editing anything while it reads.
      created = {
        id: randomUUID(), name, sessionId: randomUUID(), repoPath: author.repoPath, cwd: wt.path, branch: wt.branch, base: wt.base, provider: DEFAULT_PROVIDER, started: false, hiredAt: Date.now(),
        options: { permissionMode: 'plan', ...(prefs.roleModels.Reviewer && { model: prefs.roleModels.Reviewer }), instructions: 'You are a code reviewer. Read and run read-only commands only; never edit files. Report concrete findings.' }
      }
      setWorkspaces(rememberWorkspace(workspaces, author.repoPath))
      agents.push(created)
      persist()
      spawn(created, env)
      to = created
    }
    if (!to || to.id === author.id) throw new Error('Pick a different agent to review.')
    const text = reviewRequest(author.name, author.branch, author.base, author.cwd)
    mailbox.send(author.id, to.name, text, { expectsReply: true })
    return created
  })
  // Sessions Claude saved for this folder, including the ones our agents ran in worktrees of it.
  // Reaching the message box can take a change in a provider's own settings: it is shown first, and made only when asked.
  ipcMain.handle('provider:mail-plan', (_, id: string) => providers().find((p) => p.id === id)?.mail?.plan() ?? null)
  // Entries of ours that agy still lists for a build that was removed; each makes agy fail when it tries the office, so they can be taken out here.
  ipcMain.handle('provider:mail-stale', (_, id: string) => providers().find((p) => p.id === id)?.mail?.stale?.() ?? [])
  ipcMain.handle('provider:mail-forget', async (_, id: string, name: string) => {
    const p = providers().find((x) => x.id === id)
    if (!p?.mail?.removeStale) throw new Error('That provider has nothing to clean up.')
    await p.mail.removeStale(binFor(p), String(name))
    return p.mail.stale?.() ?? []
  })
  ipcMain.handle('provider:mail-set', async (_, id: string, on: boolean) => {
    const p = providers().find((x) => x.id === id)
    if (!p?.mail) throw new Error('That provider has nothing to connect.')
    await (on ? p.mail.connect(binFor(p)) : p.mail.disconnect(binFor(p)))
    return mailState(p)
  })
  // The library: items, what can be imported from this computer, and the playbooks that say how agents use them.
  ipcMain.handle('library:list', async () => ({ items: await libraryService.library.list(), usage: await libraryService.usage() }))
  ipcMain.handle('library:uses', (_, agentId: string) => libraryService.usesOf(String(agentId)))
  ipcMain.handle('library:stats', () => libraryService.stats())
  ipcMain.handle('library:save', (_, i: { id?: string; kind: 'skill' | 'instruction' | 'prompt'; name: string; description: string; body: string }) => libraryService.library.save({ id: i.id, kind: i.kind, name: String(i.name ?? '').slice(0, 100), description: String(i.description ?? '').slice(0, 500), body: String(i.body ?? '').slice(0, 200_000) }))
  ipcMain.handle('library:remove', (_, id: string) => libraryService.library.remove(String(id)))
  ipcMain.handle('library:sources', (_, folder?: string) => scanSources({ home: userHome(), folder: folder && isDir(folder) ? folder : undefined }))
  // Only folders that a fresh scan finds can be copied in, so a window can never ask for any other folder.
  ipcMain.handle('library:import', async (_, folder: string | undefined, dirs: string[]) => {
    const found = await scanSources({ home: userHome(), folder: folder && isDir(folder) ? folder : undefined })
    return importCandidates(libraryService.library, found.filter((c) => dirs.includes(c.dir)))
  })
  ipcMain.handle('playbook:get', (_, folder?: string) => ({ global: libraryService.playbooks.read('global'), workspace: folder ? libraryService.playbooks.read({ workspace: repoSlug(folder) }) : [] }))
  ipcMain.handle('playbook:set', (_, scope: string | null, rules: unknown[]) => {
    const good = (Array.isArray(rules) ? rules : []).filter(isRule)
    libraryService.playbooks.write(scope ? { workspace: repoSlug(scope) } : 'global', good)
    return good
  })
  ipcMain.handle('library:preview', (_, folder: string, providerId: string) => {
    const p = providers().find((x) => x.id === providerId) ?? providers()[0]
    const m = p ? mailState(p) : 'no'
    return libraryService.compileFor(folder, m === 'yes' || m === 'connected')
  })
  // The program under each login says who is signed in (read only); the service does the rest, whichever program it is.
  ipcMain.handle('accounts:list', (): Promise<AccountInfo[]> => accountsSvc.list(agents, binFor, env))
  // Adding makes the folder and links your own instructions and skills into it; the sign-in comes next, in a terminal the user sees.
  ipcMain.handle('accounts:add', async (_, provider: ProviderId, name: string) => {
    const made = await accountsSvc.create(provider, String(name ?? ''))
    prefs = cleanPrefs({ ...prefs, accounts: [...prefs.accounts, made] }, prefs)
    savePrefs(join(HOME, 'preferences.json'), prefs)
    return made.id
  })
  // Removing forgets the account in the app only: its folder, and the sign-in in it, stay on disk.
  ipcMain.handle('accounts:remove', (_, id: string) => {
    const left = accountsSvc.without(id, agents)
    const defaults = Object.fromEntries(Object.entries(prefs.defaults.accounts).filter(([, v]) => v !== id))
    prefs = cleanPrefs({ ...prefs, accounts: left, defaults: { ...prefs.defaults, accounts: defaults } }, { ...prefs, accounts: [], defaults: { ...prefs.defaults, accounts: {} } })
    savePrefs(join(HOME, 'preferences.json'), prefs)
    return prefs
  })
  // Signing in is the provider's own business: a shell is opened where the user can see it, and its program started. The app never sees credentials.
  ipcMain.handle('provider:sign-in', async (_, id: string, account?: string) => {
    const p = providers().find((x) => x.id === id)
    if (!p) throw new Error('Unknown provider.')
    const shell = process.platform === 'win32' ? (process.env.COMSPEC ?? 'cmd.exe') : (process.env.SHELL ?? '/bin/zsh')
    const sid = `term:${randomUUID()}`
    const login = account ? accountsSvc.signIn(p.id, account) : { env: {}, args: [] as readonly string[] }
    const pt = pty.spawn(shell, process.platform === 'win32' ? [] : ['-l'], { name: 'xterm-256color', cols: 90, rows: 14, cwd: homedir(), env: { ...env, ...login.env } as Record<string, string> })
    shells.set(sid, pt)
    pt.onData((d) => {
      const b = buffers.get(sid) ?? { text: '', end: 0 }
      const next = { text: (b.text + d).slice(-SCROLLBACK), end: b.end + d.length }
      buffers.set(sid, next)
      send('pty-data', sid, d, next.end)
    })
    pt.onExit(() => (shells.delete(sid), buffers.delete(sid), send('pty-exit', sid)))
    // The shell draws its prompt first; the program is typed after it, quoted so a path with spaces still runs.
    setTimeout(() => pt.write(`"${binFor(p).replace(/"/g, '')}"${login.args.map((x) => ` ${x}`).join('')}\r`), 900)
    return sid
  })
  ipcMain.handle('list-providers', () =>
    Promise.all(providers().map(async (p): Promise<ProviderInfo> => ({ id: p.id, label: p.label, capabilities: p.capabilities, detection: await p.detect(binFor(p)), models: p.models, modes: p.modes, hireModes: p.hireModes, handbook: p.handbook, autonomy: p.autonomy, mail: mailState(p), relaunchModes: p.relaunchModes })))
  )
  ipcMain.handle('list-history', async (_, folder: string) => {
    const sessions = await providerOf({}).transcript.history(folder, join(HOME, 'worktrees', repoSlug(folder)))
    return sessions.map((s) => {
      const owner = agents.find((a) => a.sessionId === s.id)
      return { ...s, inUse: !!owner, ...(owner && { agentId: owner.id, agentName: owner.name }) }
    })
  })
  ipcMain.handle('resume-session', async (_, folder: string, sessionId: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error('That is not a session id.')
    const busy = agents.find((a) => a.sessionId === sessionId)
    if (busy) throw new Error(`${busy.name} is already running that session.`)
    const name = await nextName(folder)
    const wt = (await isGitRepo(folder)) ? await createWorktree({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') }) : null
    setWorkspaces(rememberWorkspace(workspaces, folder))
    const a: AgentRecord = { id: randomUUID(), name, sessionId, repoPath: folder, cwd: wt?.path ?? folder, branch: wt?.branch ?? null, base: wt?.base ?? null, started: true, hiredAt: Date.now() }
    agents.push(a)
    persist()
    spawn(a, env)
    return a
  })
  // A clone gets a worktree branched from the original's branch and forks its conversation, so both carry on separately.
  ipcMain.handle('clone-agent', async (_, id: string, model?: string) => {
    const src = byId(id)
    if (!src) throw new Error('Unknown agent.')
    if (!src.started) throw new Error(`${src.name} has not started a conversation yet, so there is nothing to copy.`)
    const name = await nextName(src.repoPath)
    const wt = src.branch ? await createWorktree({ repoPath: src.repoPath, name, rootDir: join(HOME, 'worktrees'), from: src.branch }) : null
    const a: AgentRecord = {
      id: randomUUID(), name, sessionId: randomUUID(), forkOf: src.sessionId, cloneOf: src.id, repoPath: src.repoPath,
      cwd: wt?.path ?? src.cwd, branch: wt?.branch ?? null, base: wt ? (src.base ?? wt.base) : null, provider: src.provider, account: src.account, configDir: src.configDir, started: false, hiredAt: Date.now(), options: model ? { ...src.options, model } : src.options
    }
    agents.push(a)
    persist()
    spawn(a, env)
    return a
  })
  // Only the app-level name changes; the branch and worktree keep the name they were created with.
  ipcMain.handle('rename-agent', (_, id: string, wanted: string) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    a.name = checkName(wanted, agents.filter((x) => x.id !== id).map((x) => x.name))
    persist()
    return a.name
  })
  ipcMain.handle('set-group', (_, id: string, group: string) => {
    const a = byId(id)
    if (!a) return
    const g = group.trim().slice(0, 24)
    if (g) a.group = g
    else delete a.group
    persist()
  })
  ipcMain.handle('wake-agent', (_, id: string) => {
    const a = byId(id)
    if (a) spawn(a, env)
  })
  const removeAgent = async (id: string, mode?: 'discard' | 'keep-worktree', merged = false): Promise<RemoveResult> => {
    const a = byId(id)
    if (!a) return { ok: true }
    sessions.get(id)?.kill()
    // An agent that took over another's worktree leaves it in place while the other still uses it.
    const shared = agents.some((x) => x.id !== id && x.cwd === a.cwd)
    if (a.branch && mode !== 'keep-worktree' && !shared) {
      try {
        await removeWorktree({ repoPath: a.repoPath, path: a.cwd, force: mode === 'discard' })
        // Only a branch with nothing unmerged goes with it; -d refuses otherwise, and the commits stay recoverable.
        // After a squash the branch is not an ancestor of the base though its work has landed, so it needs -D.
        await git(a.repoPath, 'branch', merged ? '-D' : '-d', a.branch).catch(() => {})
      } catch (err) {
        if (err instanceof DirtyWorktreeError) return { ok: false, dirty: err.status }
        throw err
      }
    }
    agents = agents.filter((x) => x.id !== id)
    buffers.delete(id)
    served.delete(id)
    serverTail.delete(id)
    chats.get(id)?.tail.stop()
    chats.delete(id)
    persist()
    return { ok: true }
  }
  ipcMain.handle('remove-agent', (_, id: string, mode?: 'discard' | 'keep-worktree') => removeAgent(id, mode))
  // Code operations act on one agent's worktree; every handler resolves the agent first.
  const worktreeOf = async (id: string) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    if (!a.branch) throw new Error(`${a.name} works directly in ${a.cwd}, not in a git worktree.`)
    return { a, base: a.base ?? (await git(a.repoPath, 'rev-parse', '--abbrev-ref', 'HEAD')) }
  }
  ipcMain.handle('code:changes', async (_, id: string) => {
    const { a, base } = await worktreeOf(id)
    const files = await changes(a.cwd, base)
    return { base, branch: a.branch, files, hint: await staleHint(a.repoPath, a.cwd, base, files.length) }
  })
  // The base is only what the work is compared with and lands on: changing it never touches git or the worktree.
  ipcMain.handle('code:branches', async (_, id: string) => {
    const { a, base } = await worktreeOf(id)
    return { current: base, branches: await branches(a.repoPath) }
  })
  ipcMain.handle('code:set-base', async (_, id: string, base: string) => {
    const { a } = await worktreeOf(id)
    await assertBranch(a.repoPath, base)
    a.base = base
    persist()
  })
  ipcMain.handle('repo:branches', async (_, folder: string) => ((await isGitRepo(folder)) ? { current: await git(folder, 'rev-parse', '--abbrev-ref', 'HEAD'), branches: await branches(folder) } : { current: '', branches: [] }))
  ipcMain.handle('code:diff', async (_, id: string, path: string) => {
    const { a, base } = await worktreeOf(id)
    const current = await readWorktreeFile(a.cwd, path).catch(() => '')
    return { original: await originalContent(a.cwd, base, path), current }
  })
  ipcMain.handle('code:files', async (_, id: string) => listFiles((await worktreeOf(id)).a.cwd))
  ipcMain.handle('code:read', async (_, id: string, path: string) => readWorktreeFile((await worktreeOf(id)).a.cwd, path))
  ipcMain.handle('code:write', async (_, id: string, path: string, content: string) => writeWorktreeFile((await worktreeOf(id)).a.cwd, path, content))
  ipcMain.handle('code:commit', async (_, id: string, message: string) => commitAll((await worktreeOf(id)).a.cwd, message))
  ipcMain.handle('code:discard', async (_, id: string, path: string) => discardFile((await worktreeOf(id)).a.cwd, path))
  ipcMain.handle('code:merge', async (_, id: string) => {
    const { a, base } = await worktreeOf(id)
    await mergeInto(a.repoPath, a.branch!, base)
    return base
  })
  // The last steps for a piece of work: is it ready, then land it on the base branch and, if asked, retire the agent.
  ipcMain.handle('finish:status', async (_, id: string) => {
    const { a, base } = await worktreeOf(id)
    return { branch: a.branch!, base, ...(await finishReadiness(a.repoPath, a.cwd, a.branch!, base)) }
  })
  ipcMain.handle('finish:run', async (_, id: string, o: { squash: boolean; message: string; cleanup: boolean }) => {
    const { a, base } = await worktreeOf(id)
    const r = await finishReadiness(a.repoPath, a.cwd, a.branch!, base)
    if (r.uncommitted) throw new Error(`${a.name} has ${r.uncommitted} uncommitted file(s); commit them first (Code tab).`)
    if (!r.ahead) throw new Error(`${a.branch} has nothing that ${base} does not already have.`)
    await mergeInto(a.repoPath, a.branch!, base, { squash: o.squash, message: o.message })
    if (o.cleanup) return { base, removed: (await removeAgent(id, undefined, true)).ok }
    return { base, removed: false }
  })
  ipcMain.handle('code:pr', async (_, id: string) => {
    const { a, base } = await worktreeOf(id)
    await pushBranch(a.cwd, a.branch!)
    return createPr(a.cwd, a.branch!, base)
  })
  // Switching model or effort relaunches the same session with new flags. Claude's own /model would also
  // save the choice as the user's global default, which an app must not change behind their back.
  ipcMain.handle('agent-reconfigure', (_, id: string, change: Pick<AgentOptions, 'model' | 'effort'>) => {
    const a = byId(id)
    const p = sessions.get(id)
    if (!a || !p) throw new Error('That agent is not running.')
    if (!['idle', 'waiting', undefined].includes(lastActivity.get(id))) throw new Error('Wait until it finishes its turn.')
    a.options = fitOptions(providerOf(a).models, { ...a.options, ...(change.model && { model: change.model }), ...(change.effort && { effort: change.effort }) })
    persist()
    restarting.add(id)
    mailbox.restarting(id)
    p.kill()
  })
  // A new job for a running agent: stored options change and the same session relaunches, so the new instructions
  // take effect and the conversation stays.
  ipcMain.handle('agent-set-role', (_, id: string, role: Role | null) => {
    const a = byId(id)
    const p = sessions.get(id)
    if (!a || !p) throw new Error('That agent is not running.')
    if (!['idle', 'waiting', undefined].includes(lastActivity.get(id))) throw new Error('Wait until it finishes its turn.')
    a.options = withRole(a.options, role)
    persist()
    freshPrompt.add(id)
    restarting.add(id)
    mailbox.restarting(id)
    p.kill()
    return a.options
  })
  // Move an agent to another signed-in account. Its conversation file is shared into that account's folder and the
  // same session resumes there, so nothing is lost and no sign-in is asked: each account signed in once, when it was added.
  ipcMain.handle('agent-set-account', (_, id: string, account: string) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    if (!accountsSvc.support(a.provider)) throw new Error(`${providerOf(a).label} does not keep separate accounts.`)
    if (account && !accountsSvc.dirOf(a.provider, account)) throw new Error('That account was removed.')
    if ((a.account ?? '') === account) return
    const p = sessions.get(id)
    if (p && !['idle', 'waiting', undefined].includes(lastActivity.get(id))) throw new Error('Wait until it finishes its turn.')
    accountsSvc.moveConversation(a, account)
    persist()
    if (p) {
      restarting.add(id)
      mailbox.restarting(id)
      p.kill()
    }
  })
  // Switch permission mode. The modes in Claude's Shift+Tab cycle change live; others need a relaunch between turns,
  // which keeps the conversation (it resumes the same session).
  ipcMain.handle('chat:set-mode', async (_, id: string, mode: string) => {
    const a = byId(id)
    const p = sessions.get(id)
    if (!a || !p) throw new Error('That agent is not running.')
    const io = {
      screen: () => screens.get(id)?.text() ?? '',
      write: (keys: string) => p.write(keys),
      sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    }
    if (ui(id).anyMenu(io.screen())) throw new Error('Answer the open menu first.')
    const prov = providerOf(a)
    if (prov.liveModes.includes(mode) && ui(id).readMode(io.screen()) && (await ui(id).setMode(io, mode))) {
      seenMode.set(id, mode)
      leftStartMode.add(id)
      send('agent-event', { type: 'mode', agentId: id, sessionId: a.sessionId, mode })
      return
    }
    if (mode === 'auto' && ui(id).autoUnavailable(io.screen())) throw new Error(`${prov.label} says Auto mode is unavailable for this account or model.`)
    if (!prov.relaunchModes.includes(mode)) throw new Error(`${prov.label} did not switch to that mode. Try Shift+Tab in the Terminal tab.`)
    if (!['idle', 'waiting', undefined].includes(lastActivity.get(id))) throw new Error('Wait until it finishes its turn to switch to that mode.')
    a.options = { ...a.options, permissionMode: mode as PermissionMode }
    persist()
    restarting.add(id)
    mailbox.restarting(id)
    p.kill()
  })
  // Answer whatever choice menu Claude has open in its terminal, checking the highlight before Enter.
  const ioFor = (id: string) => ({
    screen: () => screens.get(id)?.text() ?? '',
    write: (keys: string) => void sessions.get(id)?.write(keys),
    sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  })
  ipcMain.handle('menu:answer', async (_, id: string, index: number) => {
    const detect = (screen: string) => {
      const m = ui(id).genericMenu(screen)
      return m ? { highlighted: m.highlighted } : null
    }
    if (!ui(id).genericMenu(screens.get(id)?.text() ?? '')) throw new Error('That menu is gone.')
    if (!(await ui(id).answerMenu(ioFor(id), detect, index))) throw new Error('Could not pick that option. Finish it in the Terminal tab.')
  })
  ipcMain.handle('menu:cancel', (_, id: string) => void sessions.get(id)?.write(keysOf(id).cancel))
  // /rewind lists your earlier prompts; go to the one asked for. Claude's own "restore what?" menu then shows in the chat.
  ipcMain.handle('rewind-to', async (_, id: string, promptText: string) => {
    const p = sessions.get(id)
    if (!p) throw new Error('That agent is not running.')
    if (!['idle', 'waiting', undefined].includes(lastActivity.get(id))) throw new Error('Wait until it finishes, or stop it first.')
    const io = ioFor(id)
    if (ui(id).anyMenu(io.screen())) throw new Error('Answer the open menu first.')
    const failed = await ui(id).openRewindList(io)
    if (failed) throw new Error(failed)
    if (!(await ui(id).driveRewind(io, promptText))) {
      p.write(keysOf(id).cancel)
      throw new Error('Could not find that message in the rewind list (older ones may be out of range).')
    }
    rewinding.set(id, { text: promptText, at: Date.now() })
    // Claude then asks what to restore, and is finished when that menu goes; where nothing more is asked, the rewind is done.
    const a = byId(id)
    if (a && !providerOf(a).rewindConfirms) setTimeout(() => finishRewind(id), 1500)
  })
  // Diagnostics only: the app's own view of an agent's screen, for figuring out what Claude drew.
  if (process.env.AW_DEBUG) ipcMain.handle('debug:screen', (_, id: string) => `${screens.get(id)?.text() ?? ''}\n--- activity=${lastActivity.get(id)} session=${byId(id)?.sessionId} rewinding=${JSON.stringify(rewinding.get(id))} lastOutputAgo=${Date.now() - (lastOutput.get(id) ?? 0)} working=${ui(id).looksWorking(screens.get(id)?.text() ?? '')} inputReady=${ui(id).inputReady(screens.get(id)?.text() ?? '')}`)
  // What the agent's subagents have done so far, from the files Claude keeps for them next to the session.
  ipcMain.handle('subagents:list', (_, id: string) => {
    const a = byId(id)
    return a ? providerOf(a).transcript.subagents(a) : []
  })
  // What the profile card shows beyond the live numbers. Counted from the whole saved conversation, so it covers more than the chat keeps in view.
  // A terminal draws its own text, so the page cannot tell the system what is selected: the terminal asks for the menu itself.
  ipcMain.handle('terminal:menu', async (_, selected: string) => {
    const waiting = await clipboard.readText()
    return new Promise<string | null>((resolve) => {
      const items = [...(selected ? [{ label: 'Copy', click: () => (void clipboard.writeText(selected), resolve(null)) }] : []), { label: 'Paste', enabled: waiting.length > 0, click: () => resolve(waiting) }]
      Menu.buildFromTemplate(items).popup({ callback: () => resolve(null) })
    })
  })
  ipcMain.handle('ledger:week', (_, start: number) => weekReport(ledger, weekStartOf(start), Object.fromEntries(agents.map((a) => [a.id, a.name]))))
  ipcMain.handle('ledger:tokens', (_, days: number) => tokensReport(ledger, Math.min(Math.max(Math.round(days) || 7, 1), 365), Date.now()))
  ipcMain.handle('ledger:overview', (_, days: number) =>
    overview(ledger, Math.min(Math.max(Math.round(days) || 30, 1), 365), Date.now(), Object.fromEntries(agents.map((a) => [a.id, a.name]))))
  ipcMain.handle('ledger:usage', (_, days: number) => usageReport(ledger, Math.min(Math.max(Math.round(days) || 30, 1), 365), Date.now()))
  ipcMain.handle('agent:profile', async (_, id: string): Promise<AgentProfile> => {
    const a = byId(id)
    if (!a) throw new Error('That agent is not there any more.')
    const items = providerOf(a).transcript.readAll(a)
    let folder: number | null = null
    if (a.branch) {
      try {
        folder = statSync(a.cwd).birthtimeMs || null
      } catch {
        /* the folder is gone */
      }
    }
    const hired = hiredAtOf(a, { folder, conversation: items.find((i) => i.at > 0)?.at ?? null })
    let commits: number | null = null
    if (a.branch && a.base) {
      try {
        commits = Number(await git(a.cwd, 'rev-list', '--count', `${a.base}..${a.branch}`)) || 0
      } catch {
        /* the branch or its base is gone */
      }
    }
    const clock = workClocks.get(id) ?? { total: a.workedMs ?? 0, since: null }
    return { hiredAt: hired.at, hiredEstimated: hired.estimated, workedMs: workedNow(clock, Date.now()), ...profileCounts(items), subagents: providerOf(a).transcript.subagents(a).length, commits }
  })
  ipcMain.handle('pty-buffer', (_, id: string) => buffers.get(id) ?? { text: '', end: 0 })
  ipcMain.on('pty-write', (_, id: string, data: string) => (sessions.get(id) ?? shells.get(id))?.write(data))
  ipcMain.on('pty-resize', (_, id: string, cols: number, rows: number) => {
    if (shells.has(id)) return void shells.get(id)!.resize(cols, rows)
    sizes.set(id, { cols, rows })
    sessions.get(id)?.resize(cols, rows)
    screens.get(id)?.resize(cols, rows)
  })
  // A terminal for the grid: the user's own login shell, starting in the project folder.
  ipcMain.handle('shell:open', (_, folder: string) => {
    if (!isDir(folder)) throw new Error('That folder is not there any more.')
    const id = `term:${randomUUID()}`
    const file = process.platform === 'win32' ? (process.env.COMSPEC ?? 'cmd.exe') : (process.env.SHELL ?? '/bin/zsh')
    const p = pty.spawn(file, process.platform === 'win32' ? [] : ['-l'], { name: 'xterm-256color', cols: 80, rows: 24, cwd: folder, env: env as Record<string, string> })
    shells.set(id, p)
    p.onData((d) => {
      // When the first prompt is drawn the shell is what is in front: that is its name for "waiting for a command".
      if (!shellIdle.has(id)) shellIdle.set(id, p.process)
      const b = buffers.get(id) ?? { text: '', end: 0 }
      const next = { text: (b.text + d).slice(-SCROLLBACK), end: b.end + d.length }
      buffers.set(id, next)
      send('pty-data', id, d, next.end)
    })
    p.onExit(() => {
      shells.delete(id)
      shellIdle.delete(id)
      buffers.delete(id)
      send('pty-exit', id)
    })
    return id
  })
  ipcMain.on('shell:close', (_, id: string) => {
    shells.get(id)?.kill()
    shells.delete(id)
    shellIdle.delete(id)
    buffers.delete(id)
  })
  ipcMain.handle('shell:list', () => [...shells.keys()])
  ipcMain.handle('probe-port', (_, port: number) => (Number.isInteger(port) && port > 0 && port < 65536 ? isListening(port) : false))
  ipcMain.handle('shell:processes', () => Object.fromEntries([...shells].map(([id, p]) => [id, { front: p.process, idle: shellIdle.get(id) ?? p.process }])))
  ipcMain.on('decide', (_, requestId: string, d: Decision) => eventHandles.forEach((h) => h.decide(requestId, d)))
  ipcMain.handle('list-commands', (_, id: string) => {
    const a = byId(id)
    return a ? providerOf(a).commands.list(a.cwd, homedir()) : []
  })
  ipcMain.handle('run-command', (_, id: string, name: string, args: string) => {
    const p = sessions.get(id)
    if (!p) throw new Error('That agent is not running.')
    if (!['idle', 'waiting', undefined].includes(lastActivity.get(id))) throw new Error('Wait until it finishes its turn.')
    p.write(`${commandLine(name, args)}\r`)
  })
  ipcMain.handle('answer-plan', async (_, id: string, choice: 0 | 1 | 2, feedback?: string) => {
    const io = {
      screen: () => screens.get(id)?.text() ?? '',
      write: (keys: string) => sessions.get(id)?.write(keys),
      sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    }
    if (!(await ui(id).answerMenu(io, ui(id).planMenu, choice))) throw new Error('Could not answer the plan menu; answer it in the terminal.')
    // "Tell Claude what to change" opens an input for the feedback; paste it as one line of plain text.
    const text = feedback?.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim()
    if (choice === 2 && text) {
      await io.sleep(400)
      io.write(keysOf(id).paste(text))
      await io.sleep(keysOf(id).submitDelayMs)
      io.write(keysOf(id).submit)
    }
  })
  ipcMain.handle('answer-question', async (_, id: string, answers: QuestionAnswer[]) => {
    const questions = askedQuestions.get(id)
    if (!questions?.length || !questionOpen.has(id)) throw new Error('That question is no longer open; answer it in the terminal.')
    const io = {
      screen: () => screens.get(id)?.text() ?? '',
      write: (keys: string) => sessions.get(id)?.write(keys),
      sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    }
    if (!(await ui(id).driveAnswers(io, questions, answers))) throw new Error('Could not answer the question menu; finish it in the terminal.')
  })
  ipcMain.on('answer-trust', (_, id: string, trust: boolean) => {
    void ui(id).answerTrust(
      {
        // Always the live screen: the user may also be moving the cursor in the terminal.
        screen: () => screens.get(id)?.text() ?? '',
        write: (keys) => sessions.get(id)?.write(keys),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms))
      },
      trust
    )
  })

  // The preview panes are <webview>s: each may only ever show local dev servers, with no access to the app.
  app.on('web-contents-created', (_, contents) => {
    if (contents.getType() !== 'webview') return
    rightClick(contents)
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (e, url) => !isLocalHttp(url) && e.preventDefault())
  })
  createWindow()
  ready = true

  // A restart within seconds (a code change in dev, a crash) brings back the agents that were running, so nothing
  // you had open goes to sleep. A restart after a longer gap starts asleep, as before.
  for (const id of recentlyRunning(RUNNING_FILE, Date.now(), 20_000)) {
    const a = byId(id)
    if (a && !sessions.has(id)) spawn(a, env)
  }
  const heartbeat = setInterval(noteRunning, 2000)

  // Before the app closes: stop what the agents left running and commit their unfinished work (a Settings choice), then quit for real.
  let wrapped = false
  app.on('before-quit', (e) => {
    if (!wrapped && prefs.wrapUp && agents.length) {
      wrapped = true
      e.preventDefault()
      void wrapUp(
        agents,
        {
          pidOf: (id) => sessions.get(id)?.pid,
          listProcs,
          stopProc,
          dirty: async (cwd) => !!(await git(cwd, 'status', '--porcelain')),
          commit: commitAll
        },
        // `pnpm dev` restarts the app on every code change; committing then would snapshot half-finished edits each time.
        { timeoutMs: 10_000, commit: !process.env.ELECTRON_RENDERER_URL }
      )
        .catch(() => {})
        .finally(() => app.quit())
      return
    }
    quitting = true
    clearInterval(heartbeat)
    for (const p of sessions.values()) p.kill()
    for (const p of shells.values()) p.kill()
    clearTimeout(idleCheck)
    eventHandles.forEach((h) => h.close())
    mcp.close()
    pages.close()
  })
  app.on('window-all-closed', () => app.quit())
}

// One app process per data folder, so its agents have a single owner: launching it again hands over to the running one and quits.
if (!app.requestSingleInstanceLock()) app.exit(0)
else {
  // Starting the app again, which a click on a notification can do, brings the running one forward (to the agent that notification was about); it opens no window, since one is there. Cmd/Ctrl+N opens another.
  app.on('second-instance', () => {
    if (!ready) return
    const id = noticeToOpen(lastNotice, Date.now())
    comeForward(id ? byId(id) : undefined)
  })
  main().catch((err) => {
    console.error(err)
    app.exit(1)
  })
}
