import { readText, resolveEntry, resolveFile, startFileServer } from './files'
import { listFolderFiles } from './folderFiles'
import { forget, loadMemory, recall, remember } from './memory'
import { createLibraryService } from './library/service'
import { syncGuide } from './library/guide'
import { syncVisuals } from './library/visuals'
import { createTodoService } from './todos/service'
import { reminderLine, similarLine, trackingHint } from '../shared/todoTracking'
import { commitsSince, uncommittedFiles } from './gitops'
import { editedFiles } from './todos/edited'
import { excerptOf, type LabelColor } from '../shared/todos'
import { importCandidates, scanSources } from './library/sources'
import { isRule } from './library/playbook'
import { sessionNotes } from './notes'
import { resolveCommand } from './command'
import { installedNotes } from './releaseNotes'
import { cancelUpdateDownload, checkForUpdates, downloadUpdate, installUpdate, revealUpdate, runningVersion, setMirrorSwitch, updateState } from './updates'
import { startChecks } from './updateCheck'
import { AccountService } from './accounts'
import { remoteState } from './remoteState'
import { singleFlight } from './singleFlight'
import { cleanPrefs, loadPrefs, savePrefs } from './prefs'
import { listProcs, stopProc } from './procs'
import { sleepIdle } from './sleepIdle'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, delimiter, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { BrowserWindow, Menu, Notification, app, clipboard, dialog, globalShortcut, ipcMain, powerSaveBlocker, protocol, session, shell } from 'electron'
import { isWebUrl } from './webUrl'
import { packagedPath, parseLoginPath } from './appPath'
import { parseGitVersion, resolveGit, withGitOnPath } from './gitBinary'
import { installCommand, installLaunch } from './installRun'
import { createMenuTracker } from './menuTracker'
import { gitProcessEnv, gitProgram, useGit } from './gitProgram'
import { contextItems, revealItem } from './contextMenu'
import { zoomKey, zoomTo } from '../shared/previewZoom'
import * as pty from 'node-pty'
import type { RemoveResult } from '../shared/api'
import { costDelta, limitDue, overview, parseLedger, tokensReport, usageReport, weekReport, weekStartOf, type LedgerEvent } from '../shared/ledger'
import { isProviderId } from '../shared/types'
import type { AccountInfo, Activity, Detection, AgentEvent, AgentOptions, AgentProfile, AgentRecord, AgentStats, Decision, PermissionMode, PermissionRequest, LimitWindow, ProviderId, ProviderInfo, Question, QuestionAnswer, RawEvent, RemoteState } from '../shared/types'
import { type Alert, budgetAlert, finishedTurn, idleCheckDelay, noticeToOpen, shouldNotify } from './attention'
import { providerOf, providers } from './providers/registry'
import type { EventHandle, EventSourceOptions, Provider } from './providers/ports'
import { commandLine } from './commands'
import { homeDirName } from './home'
import { shellIntegration } from './shellIntegration'
import { createSubagents } from './subagentService'
import { modelLabel } from '../shared/spawn'
import { pagesOpenedBy } from '../shared/pagePath'
import { mayTrust, shownTo, staleChildren, withoutOrphans } from './subagentSpawn'
import { LimitsBook } from '../shared/usage'
import { cleanRates, estimateUsd, type Rate } from '../shared/prices'
import type { UsageRecord } from '../shared/tokens'
import { tokenMix } from '../shared/tokenMix'
import { requestEvents } from './usageLedger'
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
import { cleanIdentity, ghToken, identityEnv, loadIdentity, parseGhLogins, profileFor, saveIdentity } from './identity'
import type { Identity, IdentityState } from '../shared/identity'
import { activate as activateWorkspace, forget as forgetWorkspace, loadWorkspaces, remember as rememberWorkspace, saveWorkspaces, workspacePaths, type WorkspaceState } from './workspaces'
import { WindowWorkspaces } from './windowWorkspaces'
import { createNoteStore } from './notes/store'
import { makeTasks } from './notes/tasks'
import { createNotesWindow, type NotesWindow } from './notes/window'
import { Mailbox } from './mailbox'
import { inBatches } from '../shared/pool'
import { SWITCH_BATCH, SWITCH_CONTINUE, planSwitch, type SwitchAgent, type SwitchResult } from '../shared/switchPlan'
import { startMcpServer } from './mcpServer'
import { createChatMod } from './chatMod'
import { createReadings } from './readings'
import { WIDGET_SCHEME, widgetResponse } from './widgetPage'
import { createWidgetFeeds } from './widgetFeeds'
import { fetchPublic } from './widgetFetch'
import { outlineOf } from '../shared/uiOutline'
import { Workflows } from './workflows/service'
import { askAgy, askClaude } from './workflows/ask'
import { WorkflowStore } from './workflows/store'
import { staleAgents } from './workflows/stale'
import { Approvals } from './workflows/approvals'
import { Builder, Proposals } from './workflows/builder'
import { HeldMerges } from './workflows/heldMerges'
import { WorkflowHistory } from './workflows/history'
import { WaitNotices } from './workflows/waitNotice'
import { blockText, branchHead, currentBranch, foreignMove, gitEnv, holdsBranch, isInside, movesBase, originalHooks, pushGate, refHead, stagedFiles, writeGitHooks } from './workflows/commitGate'
import { type SkillSource, skillStates } from '../shared/skills'
import { BUILDER_ALLOWED as BUILDER_ALLOWED_NAMES, type SaveHow, builderAgent, builderName, builderOptions, builderProgram } from '../shared/builder'
import { checkEnv, runCheck } from './workflows/runCheck'
import { requestOf } from '../shared/intent'
import { auditSettled } from '../shared/mergeCheck'
import { checkPassed, stepReply, stepSkipped, stepDeclined, stepStarted } from '../shared/steps'
import { checkCommands, commandDiff, pickEntry, toRunWorkflow } from '../shared/workflow'
import { askModel, auditModel, defaultWorkflow, pickAsker, usesNoWorkflow } from '../shared/workflows'
import { runSpend } from '../shared/runStats'
import { createRemoteGates } from './remoteGates'
import { UNPROVEN } from './remoteReply'
import { fromAgentProgram, peerPids } from './peerPid'
import { LOG_FORMAT, parseCommitLog } from './workflows/commits'
import { cancelNeed } from './needCancel'
import { PR_GO, WORKFLOW_HINT, WORKFLOW_TOOLS, planInstruction, workflowBrief, workflowList, workflowRemind } from './workflows/hint'
import { fitOptions } from '../shared/efforts'
import { DEFAULT_PROVIDER } from '../shared/types'
import { signInsNeeded, withAccounts } from './readiness'
import { Screen } from './screen'
import { loadAgents, saveAgents } from './store'
import { assertBranch, branchDiff, branches, changes, repoInfo, commitAll, commitDetail, commitDiff, commitStaged, dirtyDiff, history, clampPage, MoveError, moveOntoBase, undoMove, unrelatedPlan, unrelatedMessage, inPlaceHistory, placeOf, reposIn, repoFolder, stage, unstage, worktreeStatus, staleHint, createPr, discardFile, finishReadiness, listFiles, mergeInto, originalContent, pushBranch, readWorktreeFile, writeWorktreeFile } from './gitops'
import { DirtyWorktreeError, attachLeftover, createWorktree, checkedOutBranch, git, hasCommits, isGitRepo, leftoverOf, makesBranch, nameTaken, removeLeftover, removeWorktree, slug as repoSlug, worktreeFor } from './worktree'

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
    return parseLoginPath(out) ?? process.env.PATH
  } catch {
    return process.env.PATH
  }
}

// A packaged app has to find claude and agy itself: its own PATH is bare, so it uses the login shell's plus the usual install folders.
if (app.isPackaged && process.platform !== 'win32') {
  process.env.PATH = packagedPath(loginShellPath(), homedir())
}

// Several windows share this one process (and so one set of agents); each shows its own project.
const windows = new Set<BrowserWindow>()
const windowWorkspaces = new WindowWorkspaces()
/** The ordinary window that was in front last, so the notes window knows which project it is beside. */
let lastMain: BrowserWindow | null = null
let notesWin: NotesWindow | null = null
const liveWindows = () => [...windows].filter((w) => !w.isDestroyed())
// The notes window is not one of these: dialogs, new windows and messages go to an ordinary window.
const frontWindow = () => {
  const f = BrowserWindow.getFocusedWindow()
  return (f && liveWindows().includes(f) ? f : liveWindows()[0]) ?? null
}
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
async function askLimits() {
  limitsAt = Date.now()
  polled.length = 0
  await Promise.all(
    providers().map(async (p) => {
      if (!p.limits || !agents.some((a) => providerOf(a).id === p.id) && (await detectOf(p)).state !== 'ready') return
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
// Asking again while a poll runs waits for that poll: the list is emptied when it starts, so a second asker would otherwise be handed nothing.
const pollLimits = singleFlight(askLimits)
// What the /btw overlay last showed each agent, so the window hears only about changes.
const btwSent = new Map<string, string>()
// Agents whose side question was dismissed in the chat before the program had opened its overlay: it is closed as soon as it shows.
const btwCloseWhenSeen = new Set<string>()
const lastStats = new Map<string, AgentStats>()
const MEMORY_HINT =
  'This project keeps shared notes for every agent. Near the start of a task, call the agent-world recall tool with a few words about it. When you learn something a future agent should know (how to run the tests, a decision and why, a trap), save it with the remember tool. Keep notes short; never save secrets.'
// The chat titles each command card with the agent's own description of it; without one it can only show the start of the command.
const DESCRIBE_HINT = "Whenever you run a shell command, fill in the Bash tool's description with a short plain-language summary of what it does (for example 'Run the unit tests' or 'List files changed on this branch'). The chat shows it as the command's title."
// One memory file per project, shared by every agent working in it.
const memoryFile = (repoPath: string) => join(HOME, 'memory', `${repoSlug(repoPath)}.json`)
const buffers = new Map<string, { text: string; end: number }>()
const trustOpen = new Set<string>()
// Subagents whose trust question was answered for them.
const trustAnswered = new Set<string>()
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
// When each agent was last working (not idle, waiting or asleep): the library uses it to tell a program whose hooks do not reach the office from one that is idle.
const busyAt = new Map<string, number>()
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
// Which GitHub login and commit name a project's agents and terminals act as. Tokens are asked of gh and kept in memory only (never written), so a profile whose login has signed out sends none.
const IDENTITY_FILE = join(HOME, 'identity.json')
let identity: Identity = { profiles: [], byProject: {} }
const ghTokens = new Map<string, string>()
const ghRun = (file: string, args: string[]) => new Promise<string>((resolve, reject) => execFile(file, args, { timeout: 10_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))))
const refreshGhTokens = async () => {
  for (const login of new Set(identity.profiles.map((p) => p.login))) {
    const t = await ghToken(login, ghRun)
    if (t) ghTokens.set(login, t)
    else ghTokens.delete(login)
  }
}
const identityFor = (folder: string) => {
  const p = profileFor(identity, folder)
  return identityEnv(p, p && ghTokens.get(p.login))
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
// A page an agent opens in a browser is also shown in the app's Preview (a Settings choice). The same call can reach us twice (the permission
// request and the tool call), so a page is shown once in a few seconds.
const pageSeen = new Map<string, number>()
function notePages(id: string, json: string) {
  if (!prefs.openPagesInApp) return
  const a = byId(id)
  if (!a) return
  for (const written of pagesOpenedBy(json))
    void resolveFile(a.cwd, written).then((info) => {
      if (!info || (info.kind !== 'html' && info.kind !== 'pdf')) return
      const key = `${id}|${info.path}`
      if (Date.now() - (pageSeen.get(key) ?? 0) < 5000) return
      pageSeen.set(key, Date.now())
      send('open-page', id, info.path)
    })
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
// The remote-control state last sent for each agent, so the screen is read often but the window told only of a change.
const seenRemote = new Map<string, RemoteState>()
// The phone link of each agent's running program: it is printed once at launch and the conversation soon covers it, so the first one seen is kept until the program ends.
const remoteLinks = new Map<string, string>()
const RUNNING_FILE = join(HOME, 'running.json')
let quitting = false
const noteRunning = () => {
  if (!quitting) writeRunning(RUNNING_FILE, [...sessions.keys()], Date.now())
}
// Choice menus Claude shows in its own terminal that no other part of the app handles (see genericMenu), once they have stayed put.
// A rewind in progress: after Claude's confirmation is answered, its restored prompt is moved into the chat's composer.
const rewinding = new Map<string, { text: string; at: number }>()
const MENU_STABLE_MS = 800
const termMenus = createMenuTracker({ stableMs: MENU_STABLE_MS, now: Date.now })
const pendingPermissions = new Map<string, PermissionRequest>()
// For a permission a subagent asked: the agent above it, whose card it is on.
const childAsks = new Map<string, string>()
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
  agents: () => agents.map((a) => ({ id: a.id, name: a.name, online: sessions.has(a.id), repoPath: a.repoPath })),
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
// POC: the look an agent wrote for the chat; only the person's Keep makes it permanent.
const shotAsks = new Map<string, (ok: boolean) => void>()
const chatMod = createChatMod(join(HOME, 'mods', 'chat'))
// What the widgets on screen asked the app to load (see widgetFeeds): a kept widget's loads always run; a draft's only after the person pressed Load data.
const widgetFeeds = createWidgetFeeds({ fetch: (url) => fetchPublic(url), onUpdate: (key, feed, r) => send('widget-feed', { key, feed, r }) })
const syncFeeds = () => {
  const s = chatMod.state()
  const of = (which: 'current' | 'draft', widgets: typeof s.current.widgets) => widgets.filter((w) => w.fetch.length).map((w) => ({ key: `${which}:${w.id}`, feeds: w.fetch }))
  widgetFeeds.sync([...of('current', s.current.widgets), ...(s.draft && s.draftData ? of('draft', s.draft.widgets) : [])])
}
chatMod.onChange(() => (send('chatmod-state', chatMod.state()), syncFeeds()))
const persist = () => saveAgents(AGENTS_FILE, agents)
// An agent doing something, or being sent a message, is what the quick-switch lists order by; it is kept with the agent, but written out at most every 10 seconds.
const activeSaved = new Map<string, number>()
function touch(a: AgentRecord) {
  const now = Date.now()
  a.activeAt = now
  if (now - (activeSaved.get(a.id) ?? 0) > 10_000) {
    activeSaved.set(a.id, now)
    persist()
  }
}
const byId = (id: string) => agents.find((a) => a.id === id)
// The global library of skills and instructions, and the playbooks (global, and one per workspace) that say how agents use it.
const LIBRARY_DIR = join(HOME, 'library')
// Where skills are looked for to import: the user's own folders (a test points it elsewhere).
const userHome = () => process.env.AW_USER_HOME ?? homedir()
const workflowStore = new WorkflowStore(join(HOME, 'workflows'))
// Git's hooks for every agent: a commit is held while the plan hold is, whatever program the agent is (see commitGate).
const GIT_HOOKS_DIR = join(HOME, 'git-hooks')
// The versions of project workflow files whose commands the person approved.
const approvals = new Approvals(join(HOME, 'workflow-approvals.json'))
/** Whether a run's workflow may run its commands: a project's file needs the person's approval of its exact content; any other needs none. */
// The workflow builder: the agent the person talks to about workflows, and the drafts it hands in (only the person saves one).
// What the library holds and what a project's playbook switched on: a workflow's skills are checked against them.
const skillSource: SkillSource = {
  items: () => libraryService.library.listSync(),
  playbook: (project) => new Set((project ? libraryService.rulesFor(project) : libraryService.playbooks.read('global')).filter((r) => r.mode !== 'off').map((r) => r.id))
}
const builder = new Builder({ store: workflowStore, approvals, proposals: new Proposals(join(HOME, 'workflow-proposals.json')), history: new WorkflowHistory(join(HOME, 'workflow-history')), skills: skillSource, now: Date.now })
const BUILDER_ALLOWED = BUILDER_ALLOWED_NAMES.map((t) => `mcp__agent-world__${t}`)
const commandsApproved = (w: { scope?: string; hash?: string }) => w.scope !== 'project' || (!!w.hash && approvals.has(w.hash))
// A project that uses no workflow is offered none of it, as with workflows off.
const noWorkflowFor = (agentId: string) => {
  const a = byId(agentId)
  return !!a && usesNoWorkflow(prefs.workflows, a.repoPath)
}
const workflows = new Workflows(join(HOME, 'runs.jsonl'), {
  run: (command, cwd) => runCheck(command, cwd, { env: checkEnv(process.env, loginShellPath() ?? process.env.PATH ?? '') }),
  approved: commandsApproved,
  cwd: (id) => byId(id)?.cwd,
  // A new task follows the workflow it asked for, else its project's default, else Standard; the run keeps the file as it was then.
  pick: (id, requested) => {
    const a = byId(id)
    if (!a) return undefined
    const chosen = pickEntry(workflowStore.list(a.repoPath), requested, defaultWorkflow(prefs.workflows, a.repoPath))
    return chosen ? toRunWorkflow(chosen.workflow!, chosen.hash, chosen.scope === 'built-in' ? undefined : chosen.scope) : undefined
  },
  enabled: () => prefs.workflows.enabled,
  noWorkflow: noWorkflowFor,
  since: () => prefs.workflows.since,
  dial: () => prefs.workflows.dial,
  // The audit and the intent check run on the agent's own program and account when it can answer, so what they cost lands where its work does; else on the first program that is ready.
  ask: async (id, prompt, model) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    const askerId = pickAsker(providerOf(a).id, await readyAskers())
    if (!askerId) throw new Error('No model is ready to ask: connect Claude or agy.')
    const p = providers().find((x) => x.id === askerId)!
    const own = p.id === providerOf(a).id
    const env = { ...p.env(process.env), PATH: loginShellPath(), ...(own ? accountsSvc.envFor(a.provider, a.configDir) : accountsSvc.envFor(p.id, undefined)) }
    const dial = prefs.workflows.dial
    if (p.id === 'agy') return askAgy(resolveCommand(binFor(p)), askModel('agy', dial, model, p.models.map((m) => m.value)) ?? 'gemini-3.8-flash-low', prompt, env)
    return askClaude(resolveCommand(binFor(p)), askModel('claude', dial, model) ?? 'haiku', prompt, env)
  },
  now: Date.now,
  newId: () => randomUUID().slice(0, 8),
  // A run begun while the agent is on a task of the todo board belongs to it.
  todoOf: (id) => todoService.currentOf(id),
  who: (id) => {
    const a = byId(id)
    return a ? { name: a.name, project: a.repoPath } : undefined
  }
})
// Runs the checks of an agent's workflow that are due, and tells the agent what came of it: the output of one that failed, or that the person has been asked.
// Called when the agent reports its work, when the person answers a check, and (for what is new) when Finish is opened.
// Told once for each check and file version that waits for the person, not on every step report.
const waitNotices = new WaitNotices()
// The audit is the app's to start: once an agent's steps before it have passed it begins on its own, with nothing to open. Set where git and the asker are at hand.
let autoAudit: (id: string) => Promise<void> = async () => {}
async function kickChecks(id: string, o: { fresh?: boolean; answered?: boolean; only?: string } = {}) {
  const a = byId(id)
  if (!a) return
  if (o.answered) waitNotices.answered(id)
  try {
    const head = await git(a.cwd, 'rev-parse', 'HEAD')
    const r = await workflows.runChecks(id, head, o)
    if (r.ran > 0 || r.waitingApproval) send('workflows')
    if (r.sendBack) mailbox.fromOffice(id, r.sendBack)
    else if (r.gaveUp) mailbox.fromOffice(id, r.gaveUp)
    else if (o.answered && r.passed && !r.waitingApproval) mailbox.fromOffice(id, r.passed.map(checkPassed).join('\n'))
    else if (r.waitingApproval && !o.fresh && waitNotices.firstTime(id, `${r.waitingApproval}|${workflows.runs().findLast((x) => x.agent === id && x.status !== 'stopped')?.workflow?.hash ?? ''}`))
      mailbox.fromOffice(id, `The check "${r.waitingApproval}" waits for the person to approve its commands; their answer arrives as your next message.`)
  } catch {
    // A check that cannot run (no such folder, git failed) is simply not run; the merge gate says it has not run.
  }
  void autoAudit(id)
}
// An agent with a task open (or workflows on) gets the task tools; one that was running one when the switch went off keeps them until it finishes.
// The builder never has a task of its own.
// The programs that can answer a question of the app's own (Claude and agy have a headless mode), as last looked at; looking costs a process, so it is kept for a minute.
let askersSeen: { at: number; ready: ProviderId[] } | undefined
async function readyAskers(): Promise<ProviderId[]> {
  if (askersSeen && Date.now() - askersSeen.at < 60_000) return askersSeen.ready
  const ready = (await Promise.all(providers().filter((p) => p.id === 'claude' || p.id === 'agy').map(async (p) => ((await detectOf(p)).state === 'ready' ? p.id : null)))).filter((x): x is ProviderId => !!x)
  askersSeen = { at: Date.now(), ready }
  return ready
}
const workflowsFor = (agentId: string) => !byId(agentId)?.builder && ((prefs.workflows.enabled && !noWorkflowFor(agentId)) || workflows.runs().some((r) => r.agent === agentId && r.status === 'open'))
/** The agent's new commits since its branch began, attached to its runs; runs when a turn ends, which is when a commit is likely to exist. */
async function syncRunCommits(a: AgentRecord) {
  // Switched on, every agent's commits are read (an agent that never announced a task still gets a run); switched off, only agents with runs.
  if (!a.base || !a.branch || (!prefs.workflows.enabled && !workflows.runs().some((r) => r.agent === a.id))) return
  try {
    for (const c of parseCommitLog(await git(a.cwd, 'log', '--reverse', `--format=${LOG_FORMAT}`, `${a.base}..${a.branch}`))) workflows.commit(a.id, c.sha, c.subject, c.at)
    send('workflows')
  } catch {
    /* recording is a convenience: a git error must not touch the turn */
  }
}
const libraryService = createLibraryService({
  root: LIBRARY_DIR,
  agent: (id) => {
    const a = byId(id)
    return a ? { id: a.id, name: a.name, repoPath: a.repoPath, provider: providerOf(a).id, viaHook: !!providerOf(a).libraryHook } : undefined
  },
  workspaceKey: repoSlug,
  // The skills the steps of an agent's open task name are its to read, whatever its playbook says.
  grants: (id) => workflows.skillsOf(id),
  onUse: (id, how, item) => send('library-use', id, how, item)
})
// The app's own guide is a skill in the library, made from the pages that ship with the app (the ones on GitHub), so agents can read how to do things in it.
try {
  const guideDir = [join(process.resourcesPath, 'guide'), join(app.getAppPath(), 'docs', 'guide')].find((d) => existsSync(d))
  if (guideDir) syncGuide({ root: LIBRARY_DIR, guideDir })
} catch (err) {
  console.error('guide:', err)
}
// What agents are told about drawing in the chat (diagrams, forms) is two library items with rules of their own.
try {
  syncVisuals({ root: LIBRARY_DIR })
} catch (err) {
  console.error('visuals:', err)
}
// The todo board of each project: the person adds in the window, agents through the office tools, and each task points back at the message it came from.
// When each agent was last stopped by the person, so a turn that ends then is not counted as a request answered.
const stoppedAt = new Map<string, number>()
const todoService = createTodoService({
  dir: join(HOME, 'todos'),
  workspaceKey: repoSlug,
  agent: (id) => {
    const a = byId(id)
    if (!a) return undefined
    // A subagent is shown with the main agent it works for (the top of its chain).
    let top = a
    for (let n = 0; top.parent && n < 8; n++) top = byId(top.parent) ?? top
    return { id: a.id, name: a.name, provider: providerOf(a).id, repoPath: a.repoPath, ...(top !== a && { forMain: top.name }) }
  },
  // What the agent said last, which is the message a call it makes now belongs to.
  lastMessage: (id) => {
    const items = chats.get(id)?.items ?? []
    const said = items.findLast((i) => i.kind === 'assistant') ?? items.at(-1)
    return said ? { agentId: id, itemId: said.id, at: said.at, excerpt: said.kind === 'assistant' ? excerptOf(said.text) : '' } : undefined
  },
  // The message the person just sent: found among the chat's items when the transcript already has it, else pointed at by its words (the chat finds it by them).
  // Which agent another agent's message came from, so a request it sent is recorded as its own.
  agentNamed: (repoPath, name) => {
    const x = agents.find((o) => o.name === name && o.repoPath === repoPath)
    return x && { id: x.id, name: x.name, provider: providerOf(x).id }
  },
  lastRequest: (id, text) => {
    const items = chats.get(id)?.items ?? []
    const said = items.findLast((i) => i.kind === 'user' && i.text.trim() === text.trim())
    return { agentId: id, itemId: said?.id ?? '', at: said?.at ?? Date.now(), excerpt: excerptOf(text) }
  },
  // What the agent committed while it worked on a task, from git in its own checkout.
  workSince: (id, since) => {
    const a = byId(id)
    if (!a) return Promise.resolve({ commits: [], files: [] })
    // Work not yet committed counts too (files git shows changed, and files its own tools wrote): a task is dropped only when nothing at all was changed.
    const edited = editedFiles([...(chats.get(id)?.items ?? []), ...(editLog.get(id) ?? [])], a.cwd, since)
    return Promise.all([commitsSince(a.cwd, since), uncommittedFiles(a.cwd)]).then(([w, dirty]) => ({ commits: w.commits, files: [...new Set([...w.files, ...dirty, ...edited])] }))
  },
  // A small model names and sorts the tasks the app makes for requests, as a separate one-off call that adds nothing to an agent's context.
  busy: (id) => !['idle', 'waiting', 'asleep', undefined].includes(lastActivity.get(id)),
  ask: (prompt) => {
    const p = providers().find((x) => x.id === 'claude')
    if (!p) return Promise.resolve('')
    return new Promise<string>((resolve) =>
      execFile(binFor(p), ['-p', '--model', 'haiku', prompt], { env: p.env(process.env), cwd: tmpdir(), timeout: 60_000, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve(err ? '' : stdout))
    )
  },
  // A finished task is also a line in the project's shared memory, where "recall" finds it.
  remember: (repoPath, text, by) => void remember(memoryFile(repoPath), text, by),
  onChange: (workspace) => send('todos-changed', workspace)
})
// What is added to each message for the todo board: in fully tracked mode the app makes a task for the request first (not for a subagent, whose work its parent already tracks).
const todoRemind = (id: string, prompt: string): string => {
  try {
    const a = byId(id)
    // Not for the workflow builder either: its chats are the app's own, not requests of the person's.
    if (!a || a.parent || a.builder) return ''
    // A finished task that looks like this request is pointed at, whichever mode: it costs a line only when one matches.
    const similar = similarLine(todoService.similarDone(id, prompt))
    if (prefs.todoTracking !== 'full') return [reminderLine('deferred', prompt), similar].filter(Boolean).join('\n')
    const made = todoService.trackRequest(id, prompt)
    const last = todoService.lastTaskOf(id, made?.id)
    return [reminderLine('full', prompt, made && { id: made.id, list: made.list }, todoService.listsOf(id), last && { id: last.id, title: last.title }), similar].filter(Boolean).join('\n')
  } catch {
    return ''
  }
}
// The library's tools only read, so an agent may use them without asking each time (Claude's name for an MCP tool is mcp__server__tool).
const LIBRARY_TOOLS = ['library_index', 'library_get', 'library_search', 'library_skip'].map((t) => `mcp__agent-world__${t}`)
// The todo board is the project's own list, so an agent may use it without asking each time too.
const TODO_TOOLS = ['todo_list', 'todo_search', 'todo_get', 'todo_add', 'todo_claim', 'todo_done', 'todo_update'].map((t) => `mcp__agent-world__${t}`)
// The nudge to call task_begin: the opening text alone was not followed reliably (a real agent recorded about half its tasks), so each turn with no task open repeats it.
const workflowReminder = (id: string): string => {
  const a = byId(id)
  return a ? workflowRemind({ enabled: prefs.workflows.enabled && !noWorkflowFor(id), subagent: !!a.parent, builder: !!a.builder, open: workflows.runs().some((r) => r.agent === id && r.status === 'open') }) : ''
}
// What is added to each message an agent is sent (Claude only: it has a hook for it) comes from libraryService.remind.
const libraryRemind = (id: string, prompt: string) => {
  try {
    return [prefs.libraryEnabled ? libraryService.remind(id, prompt) : '', todoRemind(id, prompt), workflowReminder(id)].filter(Boolean).join('\n') || null
  } catch {
    return null
  }
}
// The files an agent wrote or edited, as its hook reports each tool call: the chat's copy of the transcript can lag behind the end of a turn, and this does not.
const editLog = new Map<string, ChatItem[]>()
const noteEdit = (id: string, tool: string, input: Record<string, unknown>) => {
  if (!['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) return
  const log = editLog.get(id) ?? []
  log.push({ kind: 'tool', id: `edit-${log.length}`, at: Date.now(), toolUseId: '', name: tool, input })
  editLog.set(id, log.slice(-200))
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
      if (agents.some((a) => a.name === name && a.repoPath === repoPath) || reservedNames.has(`${repoPath}:${name}`)) continue
      reservedNames.add(`${repoPath}:${name}`)
      if (await nameTaken({ repoPath, name, rootDir: join(HOME, 'worktrees') })) {
        reservedNames.delete(`${repoPath}:${name}`)
        continue
      }
      // By now the caller has the agent in the list; if it failed instead, the name is free again soon.
      setTimeout(() => reservedNames.delete(`${repoPath}:${name}`), 30_000)
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
  const prepared = providerOf(a).prepare({ dir: join(HOME, 'agents', a.id), hookUrl: eventHandles.get(providerOf(a).id)?.url ?? '', mcpUrl: office.mcpUrl, agentToken, permissionTimeoutSec: PERMISSION_TIMEOUT_SEC, platform: process.platform })
  // Every program's agent can reach the office from its own processes (git's hook asks it whether a commit may go ahead), not only the ones that read it from here.
  return { ...prepared, env: { AW_MCP_URL: office.mcpUrl, AW_AGENT_TOKEN: agentToken, ...prepared.env } }
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

/** Agents whose requests arrive exactly counted: the totals their status line carries are left out of the history. */
const readings = createReadings()
const exactUsage = new Set<string>()
const seenRequests = new Map<string, Set<string>>()
function onUsage(agentId: string, records: UsageRecord[], cursor?: number) {
  const a = byId(agentId)
  if (!a) return
  exactUsage.add(a.id)
  if (cursor !== undefined && a.usageCursor !== cursor) {
    a.usageCursor = cursor
    persist()
  }
  const seen = seenRequests.get(a.id) ?? seenRequests.set(a.id, new Set()).get(a.id)!
  const who = { agent: a.id, project: projectOf(a), provider: providerOf(a).id, name: a.name, ...(a.account && { account: a.account }) }
  for (const e of requestEvents(records, who, seen, providerOf(a).capabilities.budget ? undefined : (m, i, o) => estimateUsd(m, i, o, priceBook))) record(e)
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
  // An agent whose program counts its requests exactly (see onUsage) is not counted again from the totals it reports.
  if (used && !exactUsage.has(a.id)) {
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
    touch(a)
    // A conversation exists once a turn has begun; only then can a relaunch use --resume.
    if (!a.started) {
      a.started = true
      delete a.forkOf
      persist()
    }
    if (finishedTurn(lastActivity.get(a.id), e.activity)) notify('finished', a, e.activity === 'waiting' ? 'Waiting for you.' : 'Finished its turn.')
    lastActivity.set(a.id, e.activity)
    if (!['idle', 'waiting', 'asleep'].includes(e.activity)) busyAt.set(a.id, Date.now())
    runClock(a, e.activity)
    if (e.activity === 'idle' || e.activity === 'waiting') (mailbox.turnEnded(a.id), void syncRunCommits(a))
    // A turn that ended on its own answered the request; one that waits for you or was stopped did not.
    if (e.activity === 'idle') todoService.turnEnded(a.id, { interrupted: Date.now() - (stoppedAt.get(a.id) ?? 0) < 30_000 })
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
  const step = termMenus.update(id, menu, covered)
  if (!step) return
  if ('clear' in step) {
    send('terminal-menu', id, null)
    if (rewinding.has(id)) setTimeout(() => finishRewind(id), 1500)
    // The menu was the reason for waiting; whatever Claude does next, it is working again.
    const a = byId(id)
    if (a && lastActivity.get(id) === 'permission') {
      lastActivity.set(id, 'thinking')
      send('agent-event', { type: 'activity', agentId: id, sessionId: a.sessionId, activity: 'thinking' })
    }
    return
  }
  const m = step.send
  send('terminal-menu', id, { title: m.title, context: m.context, options: m.options, hint: m.hint, ...(m.cancellable === false && { cancellable: false }), ...(m.terminalOnly && { terminalOnly: true }) })
  const a = byId(id)
  if (a) {
    lastActivity.set(id, 'permission')
    send('agent-event', { type: 'activity', agentId: id, sessionId: a.sessionId, activity: 'permission', detail: m.title })
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
const accountsSvc = new AccountService({ home: HOME, providers: () => providers(), accounts: () => prefs.accounts, ownNames: () => prefs.ownNames })

// A program whose own login here is not signed in is still ready when an account kept for it is: the accounts signed in are asked of the program, and remembered a few seconds because every screen and check asks.
const signedInAccounts = new Map<string, { at: number; n: number }>()
async function accountsSignedIn(p: Provider): Promise<number> {
  if (!p.accounts) return 0
  const hit = signedInAccounts.get(p.id)
  if (hit && Date.now() - hit.at < 5000) return hit.n
  const base = { ...process.env, PATH: loginShellPath() }
  const mine = prefs.accounts.filter((a) => a.provider === p.id)
  const n = (await Promise.all(mine.map((a) => accountsSvc.status(p, binFor(p), accountsSvc.dirOf(p.id, a.id), base)))).filter((who) => who.loggedIn).length
  signedInAccounts.set(p.id, { at: Date.now(), n })
  return n
}
const detectOf = async (p: Provider): Promise<Detection> => {
  const d = await p.detect(binFor(p))
  return d.state === 'needs-sign-in' ? withAccounts(d, await accountsSignedIn(p)) : d
}

function spawn(a: AgentRecord, env: NodeJS.ProcessEnv) {
  if (sessions.has(a.id)) return
  // Marked not started, but the program already saved this session (it did before the first turn, or the app closed before noting one): it can only be resumed; starting it again under the same id is refused, and the agent would stay asleep.
  if (!a.started && providerOf(a).transcript.exists?.(a)) {
    a.started = true
    delete a.forkOf
    persist()
  }
  followChat(a)
  const provider = providerOf(a)
  const files = agentFiles(a)
  const mail = mailState(provider)
  // What the library gives this agent: the opening text for its playbook and, for Claude, a folder of just the skills allowed. It never stops an agent starting.
  const canFetch = mail === 'yes' || mail === 'connected'
  let lib: { core: string; reminder: string; pluginDir: string | null } = { core: '', reminder: '', pluginDir: null }
  try {
    // Switched off, an agent is told nothing from the library: no opening text, no folder of skills.
    if (prefs.libraryEnabled) lib = libraryService.prepare(a.id, canFetch, !!provider.capabilities.nativeSkills)
  } catch {
    /* the library is a convenience */
  }
  const args = provider.args({ agent: a, files, permissionMode: PERMISSION_MODE, options: a.options, houseRules: [canFetch && MEMORY_HINT, canFetch && DESCRIBE_HINT, canFetch && prefs.workflows.enabled && !a.builder && !usesNoWorkflow(prefs.workflows, a.repoPath) && [WORKFLOW_HINT, workflowList(workflowStore.list(a.repoPath), defaultWorkflow(prefs.workflows, a.repoPath))].filter(Boolean).join('\n'), canFetch && !a.parent && trackingHint(prefs.todoTracking), okfHint(a.cwd), lib.core, prefs.houseRules].filter(Boolean).join('\n\n'), addDirs: [ATTACH_DIR, ...(existsSync(LIBRARY_DIR) ? [LIBRARY_DIR] : [])], pluginDirs: lib.pluginDir ? [lib.pluginDir] : [], allowTools: [...(lib.core ? LIBRARY_TOOLS : []), ...TODO_TOOLS, ...(canFetch && prefs.workflows.enabled && !a.builder && !usesNoWorkflow(prefs.workflows, a.repoPath) ? WORKFLOW_TOOLS : []), ...(canFetch && a.builder ? BUILDER_ALLOWED : [])] })
  const { cols, rows } = sizes.get(a.id) ?? { cols: COLS, rows: ROWS }
  const cmd = providerCmd(provider, args)
  spawnedAt.set(a.id, Date.now())
  const p = pty.spawn(cmd.file, cmd.args, { name: 'xterm-256color', cols, rows, cwd: a.cwd, env: { ...env, ...files.env, ...gitEnv(env, GIT_HOOKS_DIR, originalHooks(a.cwd)), ...accountsSvc.envFor(a.provider, a.configDir), ...identityFor(a.repoPath) } })
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
    // The tail of the output, not just this piece: the link may arrive split across two.
    const sawLink = ui(a.id).readRemote?.(next.text.slice(-2000))
    if (sawLink && 'link' in sawLink && !remoteLinks.has(a.id)) remoteLinks.set(a.id, sawLink.link)
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
      const known = remoteLinks.get(a.id)
      const read = known ? { link: known } : (ui(a.id).readRemote?.(text) ?? null)
      const remote = remoteState(a.options?.remote, read)
      if (JSON.stringify(remote) !== JSON.stringify(seenRemote.get(a.id) ?? { state: 'off' })) {
        seenRemote.set(a.id, remote)
        send('remote', a.id, remote)
      }
      // SessionStart does not reach HTTP hooks, so readiness for the first message comes from the screen.
      if (ui(a.id).inputReady(text)) mailbox.started(a.id)
      const trust = ui(a.id).trustPrompt(text)
      // A subagent has no card to be asked on: its parent's folder, or a worktree made for it, is trusted for it.
      if (trust && mayTrust(agents, a.id, join(HOME, 'worktrees'))) {
        if (!trustAnswered.has(a.id)) {
          trustAnswered.add(a.id)
          void ui(a.id).answerTrust({ screen: () => screens.get(a.id)?.text() ?? '', write: (keys) => sessions.get(a.id)?.write(keys), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) }, true)
        }
      } else if (trust && !trustOpen.has(a.id)) {
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
    remoteLinks.delete(a.id)
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

// The file on disk behind a page the file server handed out; set once the server is up, so a local file shown in Preview can be revealed.
let pagePathOf: (url: string) => string | null = () => null
// Electron draws no right-click menu by itself; give the app's pages and the preview panes the system's own.
const rightClick = (contents: Electron.WebContents) =>
  contents.on('context-menu', (_e, params) => {
    const page = pagePathOf(contents.getURL())
    const items = contextItems(params, (u) => void clipboard.writeText(u), () => contents.copyImageAt(params.x, params.y), page ? revealItem(page, (f) => shell.showItemInFolder(f)) : undefined)
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
  // A window made on a screen smaller than it (a CI runner's is 1024x768) is cut to fit; hidden ones, which only tests use, are put back to size so layouts are the same everywhere.
  if (HIDDEN) w.setContentSize(1440, 868)
  const id = w.webContents.id
  windows.add(w)
  w.on('focus', () => (lastMain = w))
  w.on('closed', () => {
    windows.delete(w)
    windowWorkspaces.drop(id)
    // The notes window is only hidden when closed, so it would keep the app open: the app ends with its last ordinary window.
    if (lastMain === w) lastMain = null
    if (!liveWindows().length) app.quit()
  })
  w.webContents.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.contextIsolation = true
    prefs.sandbox = true
    if (!isWebUrl(params.src ?? '')) e.preventDefault()
  })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  // A widget's frame stays on its own addresses: it cannot send itself (and the numbers it is given) to a page of its own choosing.
  w.webContents.on('will-frame-navigate', (e) => {
    if (!e.isMainFrame && e.frame?.url.startsWith(`${WIDGET_SCHEME}://`) && !e.url.startsWith(`${WIDGET_SCHEME}://look/`)) e.preventDefault()
  })
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

// The git the app runs: the computer's own when it has one that works, and otherwise the one bundled with the app (a fresh Mac has none until Apple's tools are installed).
// A build that is not packaged looks in build/git (node scripts/fetch-git.mjs), and AW_GIT=bundled tries the bundled one first.
function chooseGit() {
  const xcodeSelectOk = () => {
    try {
      execFileSync('/usr/bin/xcode-select', ['-p'], { stdio: 'ignore', timeout: 3000 })
      return true
    } catch {
      return false
    }
  }
  return resolveGit({
    resourcesPath: process.resourcesPath,
    gitDir: app.isPackaged ? undefined : join(app.getAppPath(), 'build', 'git', `${process.platform}-${process.arch}`),
    platform: process.platform,
    arch: process.arch,
    path: process.env.PATH ?? '',
    exists: existsSync,
    xcodeSelectOk,
    prefer: process.env.AW_GIT === 'bundled' ? 'bundled' : 'system',
    env: process.env
  })
}

// The address a look's widgets are shown from: its own origin, with the page's own security headers (see widgetPage).
protocol.registerSchemesAsPrivileged([{ scheme: WIDGET_SCHEME, privileges: { standard: true, secure: true } }])

async function main() {
  await app.whenReady()
  protocol.handle(WIDGET_SCHEME, (req) => widgetResponse(chatMod.state(), req.url))
  syncFeeds()
  app.on('before-quit', () => widgetFeeds.stop())
  useGit(chooseGit())
  // The packaged app has its icon built in; a development run needs it set.
  if (!app.isPackaged && process.platform === 'darwin' && !HIDDEN) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  mkdirSync(HOME, { recursive: true })
  agents = withoutOrphans(loadAgents(AGENTS_FILE))
  for (const a of agents) followChat(a)
  loadUsage()
  loadPrices()
  loadLedger()
  workspaces = loadWorkspaces(WORKSPACES_FILE)
  identity = loadIdentity(IDENTITY_FILE)
  void refreshGhTokens()
  // The terminals of the agents get the bundled git first on their path, so the agent's own git and the commit hook run it.
  const env = withGitOnPath({ ...providerOf({}).env(process.env), PATH: loginShellPath() }, gitProgram(), delimiter)

  const eventOptions = (p: Provider): EventSourceOptions => ({
    agentForToken: (t) => agentTokens.get(t) ?? null,
    // The page an agent opens in a browser tool or curls is the one to preview, even when it did not start that server itself.
    onToolInput: (id, json) => (noteServers(id, json, false), notePages(id, json)),
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
      // A subagent is not in the office: its question goes on the card of the agent above it, and that agent shows as waiting for you.
      const shown = shownTo(agents, r)
      send('permission', shown)
      notify('permission', byId(shown.agentId), `Wants to use ${r.tool}: ${shown.detail}`)
      if (shown.agentId !== r.agentId) {
        childAsks.set(r.id, shown.agentId)
        send('agent-event', { type: 'activity', agentId: shown.agentId, sessionId: shown.sessionId, activity: 'permission', detail: shown.detail })
      }
    },
    onPermissionSettled: (id) => {
      pendingPermissions.delete(id)
      refreshAttention()
      send('permission-settled', id)
      const top = childAsks.get(id)
      childAsks.delete(id)
      // Its subagent was answered: the agent goes back to what it was doing, unless another subagent of it is still asking.
      if (top && ![...childAsks.values()].includes(top)) send('agent-event', { type: 'activity', agentId: top, sessionId: byId(top)?.sessionId ?? '', activity: lastActivity.get(top) ?? 'delegating' })
    },
    onStatus: onStats,
    onUsage: onUsage,
    onReadings: (id, rs) => readings.add(id, rs),
    reminderFor: async (id, prompt, origin) => promptContext(id, prompt, remote.touches(id, prompt) ? await origin.fromProgram() : false) || null,
    callerIsProgram: async (id, port) => fromAgentProgram((await peerPids(port)) ?? [], sessions.get(id)?.pid, process.pid),
    blockEdit: (id, file, cwd) => workflows.editBlock(id, file, cwd || byId(id)?.cwd || ''),
    onToolUse: (id, tool, input) => (noteEdit(id, tool, input), noteLibraryUse(id, tool, input)),
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
      if (btw && btwCloseWhenSeen.delete(a.id)) {
        sessions.get(a.id)?.write(keysOf(a.id).cancel)
        continue
      }
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
  // Agents starting agents of either program as their subagents: the child is a real agent, left out of the office, that shows in its parent's subagents.
  const subagents = createSubagents<AgentRecord>({
    agents: () => agents,
    byId,
    create: async (parent, i) => {
      const p = providers().find((x) => x.id === i.provider)
      if (!p) throw new Error(`There is no program called ${i.provider}.`)
      if ((await detectOf(p)).state !== 'ready') throw new Error(`${p.label} is not ready on this computer (is it installed and signed in?).`)
      const wanted = i.branch ? cleanName(i.branch.replace(/^aw\//, '')) : ''
      const name = wanted ? checkName(wanted, agents.filter((a) => a.repoPath === parent.repoPath).map((a) => a.name)) : await nextName(parent.repoPath)
      if (wanted && (await makesBranch({ repoPath: parent.repoPath, inPlace: i.worktree === false })) && (await nameTaken({ repoPath: parent.repoPath, name, rootDir: join(HOME, 'worktrees') }))) throw new Error(`A branch or folder named aw/${name} already exists. Pick another name.`)
      const wt = await worktreeFor({ repoPath: parent.repoPath, name, rootDir: join(HOME, 'worktrees'), inPlace: i.worktree === false, ...(parent.branch && { from: parent.branch }) })
      // It works the way its parent does (full autonomy only if the parent has it); one that only reads cannot change anything. When it stops to ask, the question comes up on its parent's card.
      const mode = !wt ? p.autonomy.plan : providerOf(parent).autonomy.full && parent.options?.permissionMode === providerOf(parent).autonomy.full ? p.autonomy.full : p.autonomy.edit
      const child: AgentRecord = {
        id: randomUUID(), name, sessionId: randomUUID(), repoPath: parent.repoPath, cwd: wt?.path ?? parent.cwd, branch: wt?.branch ?? null, base: wt?.base ?? null, provider: p.id, started: false, hiredAt: Date.now(), parent: parent.id, task: i.task,
        options: fitOptions(p.models, { provider: p.id, ...(mode && { permissionMode: mode as PermissionMode }), ...(i.model && p.models.some((m) => m.value === i.model) && { model: i.model }) })
      }
      accountsSvc.assign(child, prefs.defaults.accounts[p.id])
      agents.push(child)
      persist()
      spawn(child, env)
      return child
    },
    deliver: (child, text) => void mailbox.send(child.parent!, child.name, text, { expectsReply: false }),
    items: (id) => {
      const a = byId(id)
      return a ? providerOf(a).transcript.readAll(a) : []
    },
    idle: (id) => ['idle', 'waiting'].includes(lastActivity.get(id) ?? ''),
    alive: (id) => sessions.has(id),
    stop: (id) => sessions.get(id)?.kill(),
    limits: () => prefs.subagents,
    // What its program reports on its own screen or hook; else what it was started with.
    modelOf: (id) => modelLabel(lastStats.get(id)?.model ?? byId(id)?.options?.model) || undefined,
    // The agent that asked has it at work in the office, like one of Claude's own subagents.
    announce: (what, parent, child) => send('agent-event', { type: what === 'start' ? 'subagent-start' : 'subagent-stop', agentId: parent.id, sessionId: parent.sessionId, subagentId: child.id, ...(what === 'start' && { subagentType: child.provider ?? 'claude' }) } as AgentEvent)
  })
  setInterval(() => subagents.tick(), 2000)
  // Subagents whose program has ended are cleared away an hour on, when they have been read; their worktree goes with them unless it holds unmerged work.
  const clearOld = () => void Promise.all(staleChildren(agents, new Set(sessions.keys()), Date.now()).map((id) => removeAgent(id).catch(() => undefined)))
  setInterval(clearOld, 60_000)
  setTimeout(clearOld, 5_000)
  writeGitHooks(GIT_HOOKS_DIR)
  // Merges into the base branch that git held, by agent: they wait here for the person's word, shown in that agent's chat.
  const landingHeld = new HeldMerges()
  // What is added to a message before the agent reads it, for any provider's prompt hook: the answer to a typed reply that decides a gate, then the library's reminder.
  // `proven`: a message that is, or looks like, a decision on a gate was shown to come from the person (see remoteReply); without it the gate is left alone.
  // What the app itself reads in the provider's saved conversation (written by the program, not sent by the caller): does its latest user message say this?
  const savedAs = (a: AgentRecord, prompt: string) => {
    const said = providerOf(a).transcript.readAll(a).findLast((i) => i.kind === 'user')
    const same = (x: string) => x.replace(/\s+/g, ' ').trim()
    return said?.kind === 'user' && same(said.text) === same(prompt)
  }
  const promptContext = (id: string, prompt: string, proven: boolean) => [remote.touches(id, prompt) ? (proven ? remote.reply(id, prompt) : UNPROVEN) : null, libraryRemind(id, prompt)].filter(Boolean).join('\n\n')
  // The decisions a typed reply can make, and the hint that tells the agent their words: one for every provider's prompt hook and gate text.
  const remote = createRemoteGates({ workflows, held: landingHeld, send: (c) => send(c), afterAudit: (id) => void askForPr(id), isRemote: (id) => !!byId(id)?.options?.remote })
  const mcp = await startMcpServer({
    subagents: { spawn: subagents.spawn, wait: subagents.wait, stop: subagents.stop },
    agentForToken: (t) => agentTokens.get(t) ?? null,
    listAgents: (caller) =>
      // The builder's agent is the builder's own: the others are not told of it.
      agents.filter((a) => !a.builder || a.id === caller).map((a) => ({ name: a.name, activity: sessions.has(a.id) ? (lastActivity.get(a.id) ?? 'idle') : 'offline', branch: a.branch, you: a.id === caller })),
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
      // git's pre-commit hook asks whether this agent's commit may go ahead.
      if (event === 'git-commit') {
        const where = typeof payload.cwd === 'string' ? payload.cwd : ''
        if (!where || !isInside(a.cwd, where)) return {}
        const why = workflows.commitBlock(id, where, stagedFiles(where))
        return why ? { block: blockText(why) } : {}
      }
      // git is about to move branches (a commit made with --no-verify gets here too): the agent's own branch is held like a commit, and the base
      // branch is held like Land: nothing the agent says or runs changes that, because git itself asks the office before it moves either.
      if (event === 'git-ref') {
        const where = typeof payload.cwd === 'string' ? payload.cwd : ''
        const refs = Array.isArray(payload.refs) ? payload.refs.filter((r): r is string => typeof r === 'string') : []
        if (!where) return {}
        // The work is done on the agent's own branch, which is the one the audit looks at: a commit on any other branch in its worktree is refused.
        const own = a.branch ?? currentBranch(a.cwd)
        const listOf = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
        const foreign = own && isInside(a.cwd, where) && workflows.landKind(id) ? foreignMove({ own, ownHead: branchHead(a.cwd, own), refs, olds: listOf(payload.olds), news: listOf(payload.news) }) : null
        if (foreign) return { block: blockText(`Commit on your own branch, ${own}, not on ${foreign}: the app audits ${own}, and only audited work goes into a pull request. To make a pull request branch, create it from ${own}'s head and push that.`) }
        if (isInside(a.cwd, where) && holdsBranch(a.branch ?? currentBranch(a.cwd), refs)) {
          const why = workflows.commitBlock(id, where, stagedFiles(where))
          if (why) return { block: blockText(why) }
        }
        // A run that ends in a pull request holds the push instead (git-push below): the base branch is GitHub's to move once CI has run.
        if (a.branch && workflows.landKind(id) !== 'pr' && movesBase(a.base ?? null, refs) && (isInside(a.cwd, where) || isInside(a.repoPath, where))) {
          const head = branchHead(a.cwd, a.branch)
          const held = head ? workflows.landingHold(id, head) : null
          if (head && held) {
            // The review is started now when it has not run, so the person has its findings to look at.
            if (held.some((h) => h.startsWith('The review has not run'))) void startAudit(id, a, a.base!, head).catch(() => undefined)
            landingHeld.hold(id, head, held)
            send('landing')
            return { block: blockText(`Not yet: ${held.join(' ')} The person decides whether it lands anyway; tell them what holds it and ask.${remote.hint(id)}`) }
          }
        }
        return {}
      }
      // git's pre-push hook asks whether the agent's branch may be sent: for a run that ends in a pull request this is the gate the merge gate was, because
      // the pull request, CI and the merge are GitHub's. Let through, the run ends here, recorded like a landing (as anyway when the person allowed it).
      if (event === 'git-push') {
        const where = typeof payload.cwd === 'string' ? payload.cwd : ''
        const refs = Array.isArray(payload.refs) ? payload.refs.filter((r): r is string => typeof r === 'string') : []
        const branch = a.branch ?? currentBranch(a.cwd)
        if (!where || !isInside(a.cwd, where) || workflows.landKind(id) !== 'pr' || !branch) return {}
        const head = branchHead(a.cwd, branch)
        // Every branch sent counts, not only the agent's own: a pull request branch is let through when it is exactly the audited work, and refused when it is anything else.
        const gate = pushGate(branch, refs, (b) => branchHead(a.cwd, b), head)
        if (gate.foreign) return { block: blockText(`Not yet: ${gate.foreign} holds commits the audit has not looked at. Commit on your own branch, ${branch}, let the audit pass, then push a branch at that head (git push origin ${branch}:${gate.foreign}).`) }
        if (!gate.gated || !head) return {}
        const held = workflows.landingHold(id, head)
        if (held) {
          if (a.base && held.some((h) => h.startsWith('The review has not run'))) void startAudit(id, a, a.base, head).catch(() => undefined)
          landingHeld.hold(id, head, held)
          send('landing')
          return { block: blockText(`Not yet: ${held.join(' ')} The person decides whether it is pushed anyway; tell them what holds it and ask.${remote.hint(id)}`) }
        }
        try {
          workflows.landing(id, head, { anyway: true })
        } catch {
          // Only an unknown agent throws here; there is nothing to log for it.
        }
        landingHeld.clear(id)
        send('workflows')
        send('landing')
        return {}
      }
      // git moved the base branch: the landing is logged, as landed anyway when something still held it (it was allowed, or got past the hold).
      if (event === 'git-landed') {
        const where = typeof payload.cwd === 'string' ? payload.cwd : ''
        const refs = Array.isArray(payload.refs) ? payload.refs.filter((r): r is string => typeof r === 'string') : []
        // The agent's branch reached a remote (git moved its remote-tracking branch to the head it has) with no push the office let through: it skipped the hold.
        const branch = a.branch ?? currentBranch(a.cwd)
        const tracked = refs.find((r) => branch && /^refs\/remotes\/[^/]+\//.test(r) && r.replace(/^refs\/remotes\/[^/]+\//, '') === branch)
        if (tracked && branch && where && isInside(a.cwd, where) && workflows.landKind(id) === 'pr') {
          const head = branchHead(a.cwd, branch)
          if (head && refHead(a.cwd, tracked) === head && !workflows.landedHead(id, head)) {
            workflows.landing(id, head, { anyway: true, unchecked: true })
            landingHeld.clear(id)
            send('workflows')
            send('landing')
          }
          return {}
        }
        if (!a.branch || !movesBase(a.base ?? null, refs) || !where || !(isInside(a.cwd, where) || isInside(a.repoPath, where))) return {}
        const head = branchHead(a.cwd, a.branch)
        if (head) {
          try {
            workflows.landing(id, head, { anyway: true })
          } catch {
            // Only an unknown agent throws here; there is nothing to log for it.
          }
          landingHeld.clear(id)
          send('workflows')
          send('landing')
        }
        return {}
      }
      libraryService.hookCalled(id)
      return providerOf(a).libraryHook?.(event, payload, { officeTools: ['yes', 'connected'].includes(mailState(providerOf(a)) as string), transcriptPath: providerOf(a).hookTranscript?.(a), remind: (prompt) => promptContext(id, prompt, remote.touches(id, prompt) && savedAs(a, prompt)), used: (path) => noteLibraryUse(id, 'Read', { file_path: path }), editBlock: (file) => workflows.editBlock(id, file, a.cwd) }) ?? {}
    },
    todos: todoService,
    chatMod: {
      state: (id) => (chatMod.read(id), chatMod.state()),
      write: (id, i) => chatMod.write({ ...i, who: id, by: byId(id)?.name ?? 'An agent' }),
      outline: async (selector, depth) => {
        const w = frontWindow()
        if (!w) return 'No window is open.'
        return String(await w.webContents.executeJavaScript(`(${outlineOf.toString()})(document, ${JSON.stringify(selector)}, ${Math.max(1, Math.min(8, Math.round(depth)))})`))
      },
      screenshot: async (id) => {
        const w = frontWindow()
        if (!w) return null
        // The window shows the person's chats and todos: they are asked every time, and no answer in a minute is no.
        const allowed = await new Promise<boolean>((resolve) => {
          const ask = randomUUID()
          const done = (ok: boolean) => (shotAsks.delete(ask), clearTimeout(timer), resolve(ok))
          const timer = setTimeout(() => done(false), 60_000)
          shotAsks.set(ask, done)
          send('shot-ask', { id: ask, agent: byId(id)?.name ?? 'An agent' })
        })
        if (!allowed || w.isDestroyed()) return null
        const img = await w.webContents.capturePage()
        return (img.getSize().width > 1100 ? img.resize({ width: 1100 }) : img).toPNG().toString('base64')
      }
    },
    libraryOn: () => prefs.libraryEnabled,
    builder: {
      offered: (id) => !!byId(id)?.builder,
      list: (id) => builder.list(byId(id)?.repoPath ?? null),
      get: (id, wf) => builder.get(byId(id)?.repoPath ?? null, wf),
      history: (id, wf) => builder.history(byId(id)?.repoPath ?? null, wf),
      propose: (id, file) => {
        const said = builder.propose(id, byId(id)?.repoPath ?? null, file)
        send('workflows')
        return said
      }
    },
    workflows: {
      offered: workflowsFor,
      planInstruction: () => planInstruction(prefs.workflows.dial),
      begin: (caller, title, followUp, workflow) => {
        // A project that uses no workflow records no task: the agent is told there is nothing to follow.
        if (!workflows.applies(caller, workflow)) return { planFirst: false, none: true, brief: 'No workflow applies in this project, so no task is recorded and nothing is asked of you: work as usual.' }
        // More work asked for while the run is open is one more item of it, not another run: one track, one audit of the whole branch, one pull request.
        const added = workflows.addition(caller, title, followUp)
        if (added) {
          send('workflows')
          const planFirst = workflows.planWanted(caller)
          const n = (added.items?.length ?? 0) + 1
          return {
            planFirst,
            added: true,
            brief: `This is item ${n} of "${added.title}", the task in progress: one run, one audit of the whole branch, one pull request.${planFirst ? ' Your plan on file covers the earlier items: rewrite it so its goal, out of scope and questions cover this one too, then call plan_submit. Edits wait until the person approves it.' : ''}`
          }
        }
        const id = workflows.begin(caller, title, { followUp, workflow })
        send('workflows')
        const run = workflows.runs().find((r) => r.id === id)
        const a = byId(caller)
        // An agent that asked for a workflow that is not there is told the default was used.
        const missing = workflow && a && !workflowStore.list(a.repoPath).some((e) => e.workflow && e.id === workflow) ? workflow : undefined
        // A follow-up round is not forced to plan again; a task's first round is, when its workflow wants a plan.
        const planFirst = run?.rounds.length === 1 && workflows.planWanted(caller)
        return { planFirst, ...(run?.workflow && !followUp && { brief: workflowBrief(run.workflow, { fellBackFrom: missing, planFirst, skills: skillStates(run.workflow, skillSource.items(), skillSource.playbook(a?.repoPath ?? null)) }) }) }
      },
      done: (caller, summary) => {
        workflows.done(caller, summary)
        // The tasks of the board this run belongs to are finished with it, if the agent has not said so itself.
        todoService.finishLinked(caller, workflows.runs().findLast((r) => r.agent === caller)?.todos ?? [], summary ?? '')
        send('workflows')
        void kickChecks(caller)
      },
      stepDone: (caller, step, o) => {
        const r = workflows.stepDone(caller, step, o)
        send('workflows')
        if (r.checking) void kickChecks(caller)
        else void autoAudit(caller)
        return { ...r, hint: remote.hint(caller) }
      },
      submitPlan: async (caller, path) => {
        const a = byId(caller)
        if (!a) throw new Error('Unknown agent.')
        // The plan is a file in the agent's own worktree; nothing outside it is read.
        const file = resolve(a.cwd, path)
        let text: string
        try {
          // Real paths, so a link inside the worktree cannot lead out of it.
          const real = realpathSync(file)
          const rel = relative(realpathSync(a.cwd), real)
          if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('outside')
          text = readFileSync(real, 'utf8').slice(0, 100_000)
        } catch (err) {
          throw new Error(err instanceof Error && err.message === 'outside' ? 'The plan must be a file inside your worktree.' : `There is no plan at ${path}. Write it there first.`)
        }
        const rel = relative(a.cwd, file)
        // At max a small model reads the person's request against the plan first, so its questions are in front of them from the start.
        const request = requestOf(chats.get(caller)?.items ?? [])
        const check = (await readyAskers()).length > 0 && request ? await workflows.intentCheck(caller, text, request) : undefined
        const r = workflows.submitPlan(caller, rel, text, check)
        send('workflows')
        return { ...r, hint: remote.hint(caller) }
      }
    },
    library: {
      index: (caller) => libraryService.index(caller),
      get: (caller, id, file) => libraryService.get(caller, id, file),
      search: (caller, query) => libraryService.search(caller, query),
      skip: (caller, id, reason) => libraryService.skip(caller, id, reason)
    }
  })
  const pages = await startFileServer()
  pagePathOf = pages.pathOf
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
    if (refresh || pollLimits.running() || Date.now() - limitsAt > LIMITS_FRESH_MS) await pollLimits()
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
  // A message typed while the agent is still starting waits for its input box (a terminal that is not reading yet loses what is pasted into it),
  // but not for ever: past this the message goes in as it always did. Messages to one agent go in one at a time, in the order they were sent.
  const READY_WAIT_MS = 20_000
  const chatQueue = new Map<string, Promise<unknown>>()
  ipcMain.handle('chat:send', (_, id: string, raw: string) => {
    const mine = (chatQueue.get(id) ?? Promise.resolve()).then(async () => {
      const until = Date.now() + READY_WAIT_MS
      while (sessions.has(id) && mailbox.isStarting(id) && Date.now() < until) await new Promise((r) => setTimeout(r, 100))
      return sendChat(id, raw)
    })
    chatQueue.set(id, mine.catch(() => undefined))
    return mine
  })
  const sendChat = async (id: string, raw: string) => {
    const mine = byId(id)
    if (mine) touch(mine)
    const p = sessions.get(id)
    if (!p) throw new Error('That agent is not running. Wake it first.')
    const text = raw.replace(/\x1b\[20[01]~/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim()
    if (!text) return
    // A new side question is wanted, whatever was dismissed before it.
    if (/^\/btw\s/i.test(text)) btwCloseWhenSeen.delete(id)
    if (ui(id).anyMenu(screens.get(id)?.text() ?? '')) throw new Error('Claude is showing a menu. Answer it first (or finish it in the Terminal tab).')
    // Only an agent that is free takes /clear at once; a busy one queues it, and its conversation is still there.
    const clearing = /^\/clear$/i.test(text) && ['idle', 'waiting', undefined].includes(lastActivity.get(id))
    p.write(keysOf(id).paste(text))
    await new Promise((r) => setTimeout(r, keysOf(id).submitDelayMs))
    p.write(keysOf(id).submit)
    if (clearing) clearChatNow(id)
  }
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
    for (const r of pendingPermissions.values()) send('permission', shownTo(agents, r))
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
    termMenus.forgetAll()
    btwSent.clear()
    for (const [id, m] of seenMode) send('agent-event', { type: 'mode', agentId: id, sessionId: byId(id)?.sessionId ?? '', mode: m })
    for (const [id, s] of seenRemote) send('remote', id, s)
  })
  setMirrorSwitch(() => prefs.updateMirror)
  ipcMain.handle('updates:check', (_, channel?: unknown) => checkForUpdates((s) => send('update-state', s), channel === 'beta' ? 'beta' : 'stable', true))
  ipcMain.handle('updates:state', () => updateState())
  // The changelog travels with the app: next to its resources when installed, in the project folder when run from source.
  ipcMain.handle('app:info', () => ({ version: runningVersion(), notes: installedNotes([process.resourcesPath, app.getAppPath()], app.getVersion()) }))
  ipcMain.handle('updates:download', (_, c?: unknown) => downloadUpdate(c === 'beta' ? 'beta' : 'stable'))
  ipcMain.handle('updates:cancel', (_, c?: unknown) => cancelUpdateDownload(c === 'beta' ? 'beta' : 'stable'))
  ipcMain.handle('updates:install', (_, c?: unknown) => installUpdate(c === 'beta' ? 'beta' : 'stable'))
  ipcMain.handle('updates:reveal', (_, kind: 'file' | 'log', c?: unknown) => revealUpdate(kind === 'log' ? 'log' : 'file', c === 'beta' ? 'beta' : 'stable'))
  // An installed app looks by itself once at the start and every three hours; a build that is not installed has nothing to look for.
  if (app.isPackaged) startChecks(() => checkForUpdates((s) => send('update-state', s)))
  // Automated runs have no one to walk through setup, so they start as if it was done.
  // POC: the chat's look, and the person's answers to it.
  ipcMain.handle('chatmod:state', () => chatMod.state())
  ipcMain.handle('chatmod:keep', () => chatMod.keep())
  ipcMain.handle('chatmod:undo', () => chatMod.undo())
  ipcMain.handle('chatmod:reset', () => chatMod.reset())
  ipcMain.handle('readings:series', (_, agentId: unknown, specs: unknown) => (typeof agentId === 'string' ? readings.values(agentId, specs, Date.now()) : {}))
  ipcMain.handle('chatmod:back', () => chatMod.back())
  ipcMain.handle('chatmod:loadData', () => chatMod.loadData())
  ipcMain.handle('widgetfeeds:get', () => widgetFeeds.state())
  ipcMain.handle('shot:answer', (_, id: string, ok: boolean) => void shotAsks.get(String(id))?.(ok === true))
  ipcMain.handle('prefs:get', () => (process.env.AW_NO_SETUP ? { ...prefs, setup: { ...prefs.setup, done: true } } : prefs))
  ipcMain.handle('prefs:set', (_, next: unknown) => {
    prefs = cleanPrefs(next, prefs)
    savePrefs(join(HOME, 'preferences.json'), prefs)
    refreshAttention()
    return prefs
  })
  const identityState = async (): Promise<IdentityState> => ({ identity, logins: parseGhLogins(await ghRun('gh', ['auth', 'status', '--json', 'hosts']).catch(() => '')) })
  ipcMain.handle('identity:state', () => identityState())
  ipcMain.handle('identity:save', async (_, next: unknown) => {
    identity = cleanIdentity(next)
    saveIdentity(IDENTITY_FILE, identity)
    // Asked again here too, so signing in and pressing Check is enough: agents hired from now on get the new token.
    await refreshGhTokens()
    return identityState()
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
    return Promise.all(paths.slice(0, 60).map((p) => resolveEntry(a.cwd, p)))
  })
  // Right-click on a path shown anywhere in the app (a file or a folder, written as the page shows it, relative to the agent's folder when an agent is named): the system's menu with Reveal in Finder.
  const revealTarget = async (agentId: string, written: unknown) => (typeof written === 'string' && written.length < 4096 ? resolveEntry(byId(agentId)?.cwd ?? homedir(), written) : null)
  ipcMain.handle('reveal:menu', async (e, agentId: string, written: string) => {
    const info = await revealTarget(agentId, written)
    if (!info) return false
    // A test run records the choice instead of opening a menu it cannot click.
    if (process.env.AW_REVEAL_LOG && !app.isPackaged) {
      appendFileSync(process.env.AW_REVEAL_LOG, `menu ${info.path}\n`)
      return true
    }
    Menu.buildFromTemplate([revealItem(info.path, (f) => shell.showItemInFolder(f))]).popup({ window: BrowserWindow.fromWebContents(e.sender) ?? undefined })
    return true
  })
  ipcMain.handle('reveal:show', async (_, agentId: string, written: string) => {
    const info = await revealTarget(agentId, written)
    if (info && process.env.AW_REVEAL_LOG && !app.isPackaged) appendFileSync(process.env.AW_REVEAL_LOG, `show ${info.path}\n`)
    else if (info) shell.showItemInFolder(info.path)
    return !!info
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
    else btwCloseWhenSeen.add(id)
  })
  ipcMain.handle('procs:list', (_, id: string) => (sessions.get(id) ? listProcs(sessions.get(id)!.pid) : []))
  ipcMain.handle('procs:stop', (_, id: string, pid: number) => (sessions.get(id) ? stopProc(sessions.get(id)!.pid, pid) : false))
  // After an Esc that answers what the agent was waiting on (a stop, a declined question or plan): a permission card still open would keep it looking busy,
  // and Claude reports nothing after an Esc, so "waiting for you" is left for the idle check to settle.
  const settleAfterEsc = (id: string) => {
    stoppedAt.set(id, Date.now())
    for (const r of [...pendingPermissions.values()]) if (r.agentId === id) eventHandles.forEach((h) => h.decide(r.id, 'deny'))
    const a = byId(id)
    if (a && lastActivity.get(id) === 'permission') {
      lastActivity.set(id, 'thinking')
      send('agent-event', { type: 'activity', agentId: id, sessionId: a.sessionId, activity: 'thinking' })
    }
  }
  // Esc and what follows it, for one agent: the chat's Esc and "Switch all agents here" both stop an agent this way.
  const interruptAgent = (id: string, restore?: string) => {
    const p = sessions.get(id)
    if (!p) return
    const { first, then } = keysOf(id).interrupt
    settleAfterEsc(id)
    p.write(first)
    for (const [delay, keys] of then)
      setTimeout(() => {
        if (sessions.get(id) === p && ui(id).looksWorking(screens.get(id)?.text() ?? '')) p.write(keys)
      }, delay)
    // Esc before anything was produced makes Claude take the prompt back into its own input box: it moves to the message box instead, as after a rewind.
    if (restore)
      setTimeout(() => {
        if (sessions.get(id) !== p || !ui(id).typedText?.(screens.get(id)?.text() ?? '')) return
        p.write(keysOf(id).clearInput)
        send('composer-prefill', id, restore)
      }, 800)
  }
  ipcMain.handle('chat:interrupt', (_, id: string, restore?: string) => interruptAgent(id, restore))
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
    const paths = workspacePaths(workspaces, active, agents.filter((a) => !a.parent).map((a) => a.repoPath))
    const items = await Promise.all(
      paths.map(async (path) => ({
        path,
        name: basename(path),
        exists: isDir(path),
        git: isDir(path) && (await isGitRepo(path)),
        repos: isDir(path) ? (await reposIn(path)).length : 0,
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
  // A project whose folder is gone: it goes from the list with the agents that worked in it (their processes stop, their worktrees and records are deleted).
  ipcMain.handle('workspaces:remove-missing', async (e, path: string) => {
    if (isDir(path)) throw new Error('That folder is there; forget it instead.')
    for (const a of agents.filter((x) => !x.parent && x.repoPath === path)) await removeAgent(a.id, 'discard')
    setWorkspaces(forgetWorkspace(workspaces, path))
    windowWorkspaces.forget(path)
    return workspaceInfo(e.sender.id)
  })
  ipcMain.handle('window:new', () => void createWindow())
  // The notes window: one pad of Markdown notes per project, over every other window.
  const noteStore = createNoteStore({ dir: join(HOME, 'pad-notes') })
  notesWin = createNotesWindow({
    preload: join(__dirname, '../preload/index.js'),
    stateFile: join(HOME, 'notes-window.json'),
    hidden: HIDDEN,
    load: (w) => {
      if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}#notes`)
      else void w.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'notes' })
    }
  })
  const noteKey = (folder: string) => repoSlug(String(folder))
  ipcMain.handle('notes:context', async () => {
    const main = lastMain && !lastMain.isDestroyed() ? lastMain : liveWindows()[0]
    const info = main ? await workspaceInfo(main.webContents.id) : { active: undefined, items: [] as { path: string; name: string }[] }
    return { folder: info.active ?? null, projects: info.items.map((p) => ({ path: p.path, name: p.name })) }
  })
  ipcMain.handle('notes:list', (_, folder: string) => noteStore.list(noteKey(folder)))
  ipcMain.handle('notes:read', (_, folder: string, id: string) => noteStore.read(noteKey(folder), String(id)))
  ipcMain.handle('notes:write', (_, folder: string, id: string, text: string) => noteStore.write(noteKey(folder), String(id), String(text)))
  ipcMain.handle('notes:create', (_, folder: string) => noteStore.create(noteKey(folder)))
  ipcMain.handle('notes:remove', (_, folder: string, id: string) => noteStore.remove(noteKey(folder), String(id)))
  ipcMain.handle('notes:tasks', (_, folder: string, id: string, only?: number[]) => {
    const f = String(folder)
    const r = makeTasks(noteStore.read(noteKey(f), String(id)), todoService.board(f).lists, { add: (i) => todoService.addByPerson(f, i), done: (t) => void todoService.doneByPerson(f, t) }, only ? new Set(only.map(Number)) : undefined)
    if (r.made.length) noteStore.write(noteKey(f), String(id), r.text)
    return r
  })
  ipcMain.handle('notes:agents', (_, folder: string) => agents.filter((a) => a.repoPath === String(folder) && !a.parent).map((a) => ({ id: a.id, name: a.name, provider: a.provider ?? 'claude' })))
  // Asking an agent about a task, or giving it the task, is done by the window of its project, which wakes it and puts the message in its chat.
  ipcMain.handle('notes:ask', (_, folder: string, todoId: string, agentId: string, mode: 'ask' | 'work', words: string) => {
    const { message } = todoService.askAgent(String(folder), String(todoId), String(agentId), mode === 'work' ? 'work' : 'ask', String(words ?? '').slice(0, 2000))
    const target = windowFor(byId(String(agentId)))
    if (!target) throw new Error('No window of the app is open for that agent.')
    target.webContents.send('notes-ask', { agentId: String(agentId), message })
  })
  ipcMain.handle('notes:toggle', () => notesWin?.toggle())
  ipcMain.handle('notes:side', (_, extra: number) => notesWin?.side(Math.max(0, Math.min(800, Number(extra) || 0))) ?? null)
  ipcMain.handle('notes:hide', () => notesWin?.hide())
  ipcMain.handle('notes:pin', (_, on: boolean) => (notesWin?.pin(!!on), notesWin?.pinned()))
  ipcMain.handle('notes:pinned', () => notesWin?.pinned() ?? true)
  // Shown or hidden from anywhere on the computer.
  // Option+Shift+Command+N (Alt+Shift+Ctrl+N elsewhere): four keys, which no system and few apps use; when another app has it already the button still works and the tip does not name a key.
  const notesShortcut = !HIDDEN && globalShortcut.register('Alt+Shift+CommandOrControl+N', () => notesWin?.toggle())
  ipcMain.handle('notes:shortcut', () => notesShortcut)
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('before-quit', () => notesWin?.quit())
  // The error page's Reload: the window's own navigation is locked (will-navigate), which also stops the page from reloading itself.
  ipcMain.handle('window:reload', (e) => e.sender.reload())
  ipcMain.handle('list-agents', () => agents.filter((a) => !a.parent).map((a) => ({ ...a, online: sessions.has(a.id), activity: lastActivity.get(a.id) })))
  // What an earlier agent left under a name (its branch, folder and the work in them), and which agent still works on it, for the hire form to say before it hires.
  const leftoverFor = async (folder: string, name: string) => {
    const found = await leftoverOf({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') })
    if (!found) return null
    return { ...found, ...(agents.find((x) => x.repoPath === folder && (x.cwd === found.path || x.branch === found.branch)) && { inUse: agents.find((x) => x.repoPath === folder && (x.cwd === found.path || x.branch === found.branch))!.name }) }
  }
  ipcMain.handle('hire:leftover', async (_, folder: string, name: string, inPlace?: boolean) => {
    if (!cleanName(name ?? '') || !(await makesBranch({ repoPath: folder, inPlace }))) return null
    return leftoverFor(folder, cleanName(name)!)
  })
  ipcMain.handle('add-agent', async (_, folder: string, options: AgentOptions = {}, wanted?: string, base?: string, leftover?: 'replace' | 'reuse') => {
    const name = cleanName(wanted ?? '') ? checkName(wanted!, agents.filter((a) => a.repoPath === folder).map((a) => a.name)) : await nextName(folder)
    let reused: { path: string; branch: string; base: string } | null = null
    if (cleanName(wanted ?? '') && (await makesBranch({ repoPath: folder, inPlace: options.inPlace })) && (await nameTaken({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') }))) {
      const found = await leftoverFor(folder, name)
      if (found?.inUse) throw new Error(`${found.inUse} still works on aw/${name}. Pick another name.`)
      if (leftover === 'replace') await removeLeftover({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') })
      else if (leftover === 'reuse') reused = await attachLeftover({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') })
      else throw new Error(`A branch or folder named aw/${name} is left over from an earlier agent here. Pick another name, or delete that branch first.`)
    }
    const wt = reused ?? await worktreeFor({ repoPath: folder, name, rootDir: join(HOME, 'worktrees'), inPlace: options.inPlace, ...(base && (await assertBranch(folder, base), { base })) })
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
      if (!p || (await detectOf(p)).state !== 'ready') throw new Error('That program is not ready here.')
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
  // Opening the board first closes what an agent that has stopped left open.
  ipcMain.handle('todos:get', (_, folder: string) => (todoService.sweep(String(folder)), { board: todoService.board(String(folder)), key: repoSlug(String(folder)) }))
  ipcMain.handle('todos:add', (_, folder: string, i: { title: string; list?: string; notes?: string; needsYou?: boolean; parent?: string; labels?: string[] }) => void todoService.addByPerson(String(folder), i))
  ipcMain.handle('todos:update', (_, folder: string, id: string, p: object) => todoService.updateByPerson(String(folder), String(id), p))
  ipcMain.handle('todos:ask', (_, folder: string, id: string, agentId: string, mode: 'ask' | 'work', words: string) => todoService.askAgent(String(folder), String(id), String(agentId), mode === 'work' ? 'work' : 'ask', String(words ?? '').slice(0, 2000)))
  ipcMain.handle('todos:tidy-inbox', (_, folder: string) => todoService.tidyInbox(String(folder)))
  ipcMain.handle('todos:remove', (_, folder: string, id: string) => todoService.removeByPerson(String(folder), String(id)))
  ipcMain.handle('todos:done', (_, folder: string, id: string) => todoService.doneByPerson(String(folder), String(id)))
  ipcMain.handle('todos:reopen', (_, folder: string, id: string) => todoService.reopenByPerson(String(folder), String(id)))
  ipcMain.handle('todos:move', (_, folder: string, id: string, list: string, index: number) => todoService.moveByPerson(String(folder), String(id), String(list), Number(index) || 0))
  ipcMain.handle('todos:bulk', (_, folder: string, ids: string[], op: { do: string; on?: boolean; list?: string }) => {
    const list = Array.isArray(ids) ? ids.map(String).slice(0, 500) : []
    const kind = op?.do
    if (kind === 'done' || kind === 'reopen' || kind === 'remove') return todoService.bulkByPerson(String(folder), list, { do: kind })
    if (kind === 'needsYou') return todoService.bulkByPerson(String(folder), list, { do: 'needsYou', on: !!op.on })
    if (kind === 'move') return todoService.bulkByPerson(String(folder), list, { do: 'move', list: String(op.list ?? '').slice(0, 60) })
    return 0
  })
  ipcMain.handle('todos:pad-get', (_, folder: string) => todoService.pad(String(folder)))
  ipcMain.handle('todos:pad-set', (_, folder: string, text: string) => todoService.setPad(String(folder), String(text ?? '')))
  ipcMain.handle('todos:pad-make', (_, folder: string) => todoService.padToTasks(String(folder)).length)
  ipcMain.handle('todos:pad-undo', (_, folder: string) => todoService.undoPad(String(folder)))
  ipcMain.handle('todos:add-label', (_, folder: string, name: string, color?: LabelColor) => todoService.addLabelByPerson(String(folder), String(name), color))
  ipcMain.handle('todos:rename-label', (_, folder: string, from: string, to: string) => todoService.renameLabelByPerson(String(folder), String(from), String(to)))
  ipcMain.handle('todos:recolor-label', (_, folder: string, name: string, color: LabelColor) => todoService.recolorLabelByPerson(String(folder), String(name), color))
  ipcMain.handle('todos:remove-label', (_, folder: string, name: string) => todoService.removeLabelByPerson(String(folder), String(name)))
  ipcMain.handle('todos:add-list', (_, folder: string, name: string) => todoService.addList(String(folder), String(name)))
  ipcMain.handle('todos:rename-list', (_, folder: string, from: string, to: string) => todoService.renameList(String(folder), String(from), String(to)))
  ipcMain.handle('todos:remove-list', (_, folder: string, name: string) => todoService.removeList(String(folder), String(name)))
  ipcMain.handle('todos:needs-you', (_, folder: string) => todoService.needsYou(String(folder)))
  // The library: items, what can be imported from this computer, and the playbooks that say how agents use them.
  ipcMain.handle('workflows:stale', (_, project: string | null) =>
    project
      ? staleAgents({
          agents: agents.filter((a) => a.repoPath === project && !a.builder).map((a) => ({ id: a.id, name: a.name, online: sessions.has(a.id), launchedAt: spawnedAt.get(a.id) ?? 0 })),
          project,
          workflows: prefs.workflows,
          changedAt: workflowStore.changedAt(project, defaultWorkflow(prefs.workflows, project))
        })
      : []
  )
  ipcMain.handle('workflows:summary', () => {
    const runs = workflows.runs()
    const now = Date.now()
    return { runs, open: runs.filter((r) => r.status === 'open').length, spend: Object.fromEntries(runs.map((r) => [r.id, runSpend(r, ledger, now)])), unapproved: runs.filter((r) => r.workflow && checkCommands(r.workflow).length > 0 && !commandsApproved(r.workflow)).map((r) => r.id) }
  })
  ipcMain.handle('workflows:decide', (_, runId: string, state: 'approved' | 'changes' | 'released', o: { note?: string; answers?: { question: string; answer: string }[] }) => {
    const run = workflows.runs().find((r) => r.id === runId)
    // The answer reaches the agent as its next message.
    const told = remote.decidePlan(runId, state, o)
    if (run) mailbox.fromOffice(run.agent, told)
  })
  // The workflow files: Standard, the app's own and the project's. A project is a folder the person has open.
  const projectOf = (v: unknown) => (typeof v === 'string' && v ? v : null)
  ipcMain.handle('workflows:definitions', (_, project: unknown) => builder.entries(projectOf(project)))
  ipcMain.handle('workflows:duplicate', (_, project: unknown, id: string, to: 'global' | 'project') => workflowStore.duplicate(projectOf(project), String(id), to === 'project' ? 'project' : 'global'))
  // Other workspaces' own workflows, for importing: only the folders the app knows, so a path from the page cannot reach anywhere else.
  const knownProjects = (windowId: number) => workspacePaths(workspaces, windowWorkspaces.get(windowId), agents.filter((a) => !a.parent).map((a) => a.repoPath)).filter(isDir)
  ipcMain.handle('workflows:others', (e, project: unknown) => workflowStore.others(knownProjects(e.sender.id), projectOf(project)).map((o) => ({ ...o, name: basename(o.project) })))
  ipcMain.handle('workflows:import', (e, source: string, id: string, project: unknown, to: 'global' | 'project') => {
    if (!knownProjects(e.sender.id).includes(source)) throw new Error('That workspace is not one this app knows.')
    return workflowStore.importFrom(source, String(id), projectOf(project), to === 'project' ? 'project' : 'global')
  })
  ipcMain.handle('workflows:remove', (_, project: unknown, id: string, scope: 'global' | 'project') => workflowStore.remove(projectOf(project), String(id), scope === 'project' ? 'project' : 'global'))
  // The builder: made on first use, one per project; what the person typed first is sent for them once it can take it.
  ipcMain.handle('workflows:builder', async (_, project: unknown, first?: string, editing?: unknown) => {
    const folder = projectOf(project)
    if (!folder) throw new Error('Open a project first.')
    let a = builderAgent(agents, folder)
    if (!a) {
      // The person's default program when it can use the office's tools (agy only once connected to the message box), else the first that can.
      const usable = (await Promise.all(providers().filter((x) => x.id === 'claude' || x.id === 'agy').map(async (x) => ((await detectOf(x)).state === 'ready' && (x.id === 'claude' || ['yes', 'connected'].includes(mailState(x) as string)) ? (x.id as 'claude' | 'agy') : null)))).filter((x): x is 'claude' | 'agy' => !!x)
      const program = builderProgram(prefs.setup.defaultProvider, usable)
      if (!program) throw new Error('The builder needs Claude, or agy connected to the message box, and neither is ready here. Set one up in Settings first.')
      a = { id: randomUUID(), name: builderName(agents.map((x) => x.name)), sessionId: randomUUID(), repoPath: folder, cwd: folder, branch: null, base: null, provider: program, started: false, hiredAt: Date.now(), builder: true, options: builderOptions(program) }
      accountsSvc.assign(a, prefs.defaults.accounts[a.provider!])
      setWorkspaces(rememberWorkspace(workspaces, folder))
      agents.push(a)
      persist()
    }
    // Each edit of a saved workflow starts clean: an earlier draft is dropped, the builder starts a new conversation, and the saved workflow is the draft to edit in place.
    if (typeof editing === 'string' && editing) {
      builder.discard(a.id)
      a.sessionId = randomUUID()
      a.started = false
      persist()
      const live = sessions.get(a.id)
      if (live) {
        restarting.add(a.id)
        mailbox.restarting(a.id)
        live.kill()
      }
      try {
        builder.startEdit(a.id, folder, editing)
      } catch {
        // A workflow that does not read cannot be the draft; the builder is told what is wrong when it reads it.
      }
      send('workflows')
    }
    const text = typeof first === 'string' ? first.trim().slice(0, 4000) : ''
    if (text) mailbox.fromPerson(a.id, text)
    spawn(a, env)
    return a
  })
  ipcMain.handle('workflows:history', (_, project: unknown, id: string) => builder.historyOf(projectOf(project), String(id)))
  ipcMain.handle('workflows:proposal', (_, agent: string, project: unknown) => builder.view(String(agent), projectOf(project)))
  ipcMain.handle('workflows:propose-save', (_, agent: string, project: unknown, how: SaveHow) => {
    const entry = builder.save(String(agent), projectOf(project), how === 'global' || how === 'replace' || how === 'copy' ? how : 'project')
    send('workflows')
    return entry
  })
  // The person edits the draft in place: it is checked like a file, and a bad edit comes back as every problem.
  ipcMain.handle('workflows:propose-edit', (_, agent: string, project: unknown, workflow: unknown) => {
    const view = builder.edit(String(agent), projectOf(project), workflow)
    send('workflows')
    return view
  })
  ipcMain.handle('workflows:propose-undo', (_, agent: string, project: unknown) => {
    const view = builder.undoEdits(String(agent), projectOf(project))
    send('workflows')
    return view
  })
  ipcMain.handle('workflows:propose-discard', (_, agent: string) => (builder.discard(String(agent)), send('workflows')))
  // The person's answer to a step that waits for them (not the plan: that has its own); it is typed into the agent.
  ipcMain.handle('workflows:approve-step', (_, runId: string, step: string, decision: 'approved' | 'changes', note?: string) => {
    const run = workflows.runs().find((r) => r.id === runId)
    const text = typeof note === 'string' ? note.slice(0, 2000).trim() : ''
    workflows.approveStep(runId, String(step), decision === 'changes' ? 'changes' : 'approved', { note: text })
    const target = run?.workflow?.steps.find((s) => s.id === step)
    const name = target?.name ?? String(step)
    const answer = decision === 'changes' ? 'changes' : 'approved'
    // An approved pull request is answered by the go-ahead to push, which is sent below; every other answer is typed into the agent.
    if (run && !(target?.kind === 'pr' && answer === 'approved')) mailbox.fromOffice(run.agent, stepReply(name, answer, text, target?.kind))
    send('workflows')
    if (run && answer === 'approved') void askForPr(run.agent)
  })
  // The person pressed Run on a step of the agent's (the plan, a build) that starts that way: the agent is told to begin.
  ipcMain.handle('workflows:start-step', (_, runId: string, step: string) => {
    const run = workflows.runs().find((r) => r.id === runId)
    const name = workflows.startStep(runId, String(step))
    if (run) mailbox.fromOffice(run.agent, stepStarted(name))
    send('workflows')
  })
  // The person does not approve a step that waits for them: nothing starts, and the agent is told to wait for their instructions.
  ipcMain.handle('workflows:decline-step', (_, runId: string, step: string) => {
    const run = workflows.runs().find((r) => r.id === runId)
    const found = run?.workflow?.steps.find((s) => s.id === step)
    if (!run || !found) throw new Error('No such step.')
    // Optional: the person passes it over and the run goes on. Required: the step fails and the workflow stops there.
    if (found.optional) mailbox.fromOffice(run.agent, stepSkipped(workflows.skipStep(runId, String(step)), workflows.nextAfter(run, String(step))?.name))
    else mailbox.fromOffice(run.agent, stepDeclined(workflows.declineStep(runId, String(step))))
    send('workflows')
  })
  // The person skips an optional step (a build or an approval): the run goes on, and the agent is told.
  ipcMain.handle('workflows:skip-step', (_, runId: string, step: string) => {
    const run = workflows.runs().find((r) => r.id === runId)
    const name = workflows.skipStep(runId, String(step))
    if (run) mailbox.fromOffice(run.agent, stepSkipped(name, workflows.nextAfter(run, String(step))?.name))
    send('workflows')
  })
  // What the person is shown before approving a project file's commands: where they come from, and what changed since the version approved before.
  ipcMain.handle('workflows:check-approval', (_, runId: string) => {
    const run = workflows.runs().find((r) => r.id === runId)
    const w = run?.workflow
    if (!run || !w) throw new Error('No such run.')
    const a = byId(run.agent)
    const entry = a && workflowStore.list(a.repoPath).find((e) => e.id === w.id && e.hash === w.hash)
    const commands = checkCommands(w)
    const before = w.hash ? approvals.previous(w.id, w.hash) : undefined
    return { workflow: w.name, file: entry?.file ?? '', hash: w.hash ?? '', commands, ...(before && { before: { hash: before.hash, at: before.at, diff: commandDiff(before.commands, commands) } }) }
  })
  ipcMain.handle('workflows:check-approve', (_, runId: string) => {
    const run = workflows.runs().find((r) => r.id === runId)
    if (!run?.workflow?.hash) throw new Error('No such run.')
    approvals.approve(run.workflow.id, run.workflow.hash, checkCommands(run.workflow), Date.now())
    workflows.commandsApproved(runId)
    send('workflows')
    void kickChecks(run.agent, { answered: true })
  })
  ipcMain.handle('workflows:check-decline', (_, runId: string) => (workflows.declineCommands(runId), send('workflows')))
  ipcMain.handle('workflows:check-rerun', (_, runId: string, step: string) => {
    const run = workflows.runs().find((r) => r.id === runId)
    workflows.rerunCheck(runId, String(step))
    send('workflows')
    if (run) void kickChecks(run.agent, { answered: true })
  })
  // The person pressed Run on a check that starts that way: it runs now, and no other check with it.
  ipcMain.handle('workflows:check-run', async (_, runId: string, step: string) => {
    const run = workflows.runs().find((r) => r.id === runId)
    if (!run) throw new Error('No such run.')
    await kickChecks(run.agent, { only: String(step) })
    send('workflows')
  })
  ipcMain.handle('workflows:check-skip', (_, runId: string, step: string) => {
    const run = workflows.runs().find((r) => r.id === runId)
    workflows.skipCheck(runId, String(step))
    send('workflows')
    const name = run?.workflow?.steps.find((s) => s.id === step)?.name ?? String(step)
    if (run) mailbox.fromOffice(run.agent, `The person skipped the check "${name}".`)
  })
  ipcMain.handle('workflows:stop-all', () => (workflows.stopAll(), send('workflows')))
  ipcMain.handle('library:list', async () => ({ items: await libraryService.library.list(), usage: await libraryService.usage() }))
  ipcMain.handle('library:uses', (_, agentId: string) => libraryService.usesOf(String(agentId)))
  ipcMain.handle('library:silent', (_, folder: string) => (folder ? libraryService.silent(folder, (id) => busyAt.get(id) ?? 0) : []))
  ipcMain.handle('library:holders', (_, folder: string) => (folder ? libraryService.holders(folder) : []))
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
  ipcMain.handle('accounts:list', (): Promise<AccountInfo[]> => (signedInAccounts.clear(), accountsSvc.list(agents, binFor, env)))
  // How many logins (a program's own and each account) are waiting for a sign-in: the dot on Settings and on Accounts.
  ipcMain.handle('accounts:needing-sign-in', async (): Promise<number> => (signedInAccounts.clear(), signInsNeeded(await accountsSvc.list(agents, binFor, env))))
  // Adding makes the folder and links your own instructions and skills into it; the sign-in comes next, in a terminal the user sees.
  ipcMain.handle('accounts:add', async (_, provider: ProviderId, name: string) => {
    const made = await accountsSvc.create(provider, String(name ?? ''))
    prefs = cleanPrefs({ ...prefs, accounts: [...prefs.accounts, made] }, prefs)
    savePrefs(join(HOME, 'preferences.json'), prefs)
    return made.id
  })
  // A label is only for the person: the folder, the sign-in and the agents on it stay as they are.
  ipcMain.handle('accounts:rename', (_, id: string, name: string, provider: string) => {
    // The program's own login has no id; it is named by its program.
    if (!id && !isProviderId(provider)) throw new Error('That program is not known.')
    const named = id ? { accounts: accountsSvc.rename(String(id), String(name ?? '')) } : { ownNames: accountsSvc.renameOwn(provider as ProviderId, String(name ?? '')) }
    prefs = cleanPrefs({ ...prefs, ...named }, prefs)
    savePrefs(join(HOME, 'preferences.json'), prefs)
    return prefs
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
    // Claude asks once whether to trust the folder it starts in, and trusting a person's whole home folder is far too much: it starts in a folder of the app's own.
    const neutral = join(HOME, 'sign-in')
    mkdirSync(neutral, { recursive: true })
    const pt = pty.spawn(shell, process.platform === 'win32' ? [] : ['-l'], { name: 'xterm-256color', cols: 100, rows: 24, cwd: neutral, env: { ...env, ...login.env } as Record<string, string> })
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
  // Which git the app and its agents use, for the setup screen.
  ipcMain.handle('git:info', async () => {
    const g = gitProgram()
    if (!g) return null
    let version: string | undefined
    try {
      version = parseGitVersion((await promisify(execFile)(g.bin, ['--version'], { env: gitProcessEnv(), timeout: 5000 })).stdout)
    } catch {
      /* it runs, or it would not have been chosen; the number is only for show */
    }
    return { source: g.source, bin: g.bin, ...(version && { version }) }
  })
  // The installer of a program that was not found, run in a terminal the step shows; the terminal ends when the installer does.
  ipcMain.handle('provider:install', async (_, id: string) => {
    const p = providers().find((x) => x.id === id)
    if (!p) throw new Error('Unknown provider.')
    const command = installCommand(await p.detect(binFor(p)), process.env)
    if (!command) throw new Error(`${p.label} is not missing, or has no installer to run.`)
    const launch = installLaunch(command, process.platform, process.env.SHELL)
    if (!launch) throw new Error(`Copy the command and run it in PowerShell: ${command}`)
    const sid = `term:${randomUUID()}`
    const pt = pty.spawn(launch.file, launch.args, { name: 'xterm-256color', cols: 100, rows: 24, cwd: homedir(), env: env as Record<string, string> })
    shells.set(sid, pt)
    pt.onData((d) => {
      const b = buffers.get(sid) ?? { text: '', end: 0 }
      const next = { text: (b.text + d).slice(-SCROLLBACK), end: b.end + d.length }
      buffers.set(sid, next)
      send('pty-data', sid, d, next.end)
    })
    pt.onExit(() => (shells.delete(sid), buffers.delete(sid), send('pty-exit', sid)))
    return sid
  })
  ipcMain.handle('list-providers', () =>
    Promise.all(providers().map(async (p): Promise<ProviderInfo> => ({ id: p.id, label: p.label, capabilities: p.capabilities, detection: await detectOf(p), models: p.models, modes: p.modes, hireModes: p.hireModes, handbook: p.handbook, ...(p.remoteNote && { remoteNote: p.remoteNote }), autonomy: p.autonomy, mail: mailState(p), ...(mailState(p) === 'connected' && p.mail?.outdated?.() && { mailOutdated: true }), relaunchModes: p.relaunchModes })))
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
    const wt = await worktreeFor({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') })
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
    a.name = checkName(wanted, agents.filter((x) => x.id !== id && x.repoPath === a.repoPath).map((x) => x.name))
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
    for (const c of agents.filter((x) => x.parent === id)) await removeAgent(c.id, mode, merged)
    sessions.get(id)?.kill()
    // An agent that took over another's worktree leaves it in place while the other still uses it.
    const shared = agents.some((x) => x.id !== id && x.cwd === a.cwd)
    if (a.branch && mode !== 'keep-worktree' && !shared && !isDir(a.repoPath)) {
      // The repository the worktree hangs from is gone, so git cannot remove it: the folder goes, if it is one the office made.
      if (a.cwd.startsWith(join(HOME, 'worktrees') + sep)) rmSync(a.cwd, { recursive: true, force: true })
    } else if (a.branch && mode !== 'keep-worktree' && !shared) {
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
    readings.forget(id)
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
    return { a, base: a.base ?? (await checkedOutBranch(a.repoPath)) }
  }
  // What needs only the folder (its uncommitted files, commits and files), so it works for an agent on the branch the folder is on too.
  const folderOf = async (id: string, repo?: string) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    // A workspace that holds several repositories: one of its children, by name, stands for the folder.
    if (repo !== undefined) {
      if (a.branch) throw new Error(`${a.name} has a worktree of its own: there is no child repository to pick.`)
      return { ...a, cwd: await repoFolder(a.cwd, repo) }
    }
    // Git is what lists its files and changes: a plain folder has none to offer.
    if (!a.branch && !(await isGitRepo(a.cwd))) throw new Error(`${a.name} works directly in ${a.cwd}, not in a git worktree.`)
    return a
  }
  // A folder that is not a repository has no git to list its files: they are read from the folder, and it has none of the rest of the Code tab (changes, commits).
  const agentOf = (id: string) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    return a
  }
  const plainFolder = async (a: AgentRecord) => !a.branch && !(await isGitRepo(a.cwd))
  // Where an agent without a branch of its own works: whether git can say anything about it, and the branch the folder is on.
  ipcMain.handle('code:place', async (_, id: string) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    return placeOf(a.cwd)
  })
  // The repositories directly inside the agent's folder when it is not one itself; empty for an agent with a worktree of its own.
  ipcMain.handle('code:repos', async (_, id: string) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    return a.branch ? [] : reposIn(a.cwd)
  })
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
  ipcMain.handle('repo:branches', (_, folder: string) => repoInfo(folder))
  ipcMain.handle('code:diff', async (_, id: string, path: string) => {
    const { a, base } = await worktreeOf(id)
    const current = await readWorktreeFile(a.cwd, path).catch(() => '')
    return { original: await originalContent(a.cwd, base, path), current }
  })
  ipcMain.handle('code:files', async (_, id: string) => {
    const a = agentOf(id)
    return (await plainFolder(a)) ? listFolderFiles(a.cwd) : listFiles((await folderOf(id)).cwd)
  })
  // What typing @ offers. An agent working directly in a folder, or in one that is not a repository, has no list to give: that is an empty one, not a failure to report.
  ipcMain.handle('code:mention-files', async (_, id: string) => {
    const a = byId(id)
    if (!a) return []
    return (await plainFolder(a)) ? listFolderFiles(a.cwd) : listFiles(a.cwd).catch(() => [] as string[])
  })
  ipcMain.handle('code:read', async (_, id: string, path: string) => readWorktreeFile(agentOf(id).cwd, path))
  ipcMain.handle('code:write', async (_, id: string, path: string, content: string) => writeWorktreeFile(agentOf(id).cwd, path, content))
  ipcMain.handle('code:commit', async (_, id: string, message: string, repo?: string) => commitAll((await folderOf(id, repo)).cwd, message))
  ipcMain.handle('code:discard', async (_, id: string, path: string, repo?: string) => discardFile((await folderOf(id, repo)).cwd, path))
  // What is not committed yet, and staging it; and the branch's commits, one commit's files, and a file of a commit.
  ipcMain.handle('code:status', async (_, id: string, repo?: string) => worktreeStatus((await folderOf(id, repo)).cwd))
  ipcMain.handle('code:stage', async (_, id: string, paths: string[], repo?: string) => stage((await folderOf(id, repo)).cwd, paths))
  ipcMain.handle('code:unstage', async (_, id: string, paths: string[], repo?: string) => unstage((await folderOf(id, repo)).cwd, paths))
  ipcMain.handle('code:commit-staged', async (_, id: string, message: string, repo?: string) => commitStaged((await folderOf(id, repo)).cwd, message))
  ipcMain.handle('code:dirty-diff', async (_, id: string, path: string, repo?: string) => dirtyDiff((await folderOf(id, repo)).cwd, path))
  ipcMain.handle('code:log', async (_, id: string, o: { scope: 'branch' | 'all'; search?: string; limit?: number; skip?: number }, repo?: string) => {
    const a = await folderOf(id, repo)
    // The window asks for a page; what it sent is kept to a sane one (and a search to a sane length), whatever it was.
    const page = { scope: o?.scope === 'all' ? ('all' as const) : ('branch' as const), ...(typeof o?.search === 'string' && { search: o.search.slice(0, 200) }), ...clampPage(o ?? {}) }
    if (a.branch) return history(a.cwd, a.base ?? (await checkedOutBranch(a.repoPath)), page)
    return inPlaceHistory(a.cwd, page, a.hiredAt)
  })
  ipcMain.handle('code:commit-detail', async (_, id: string, hash: string, repo?: string) => commitDetail((await folderOf(id, repo)).cwd, hash))
  ipcMain.handle('code:commit-diff', async (_, id: string, hash: string, path: string, repo?: string) => commitDiff((await folderOf(id, repo)).cwd, hash, path))
  ipcMain.handle('landing:holds', () => landingHeld.list())
  ipcMain.handle('landing:allow', (_, id: string) => {
    const held = landingHeld.take(id)
    if (!held) return
    workflows.allowLanding(id, held.head)
    send('landing')
  })
  ipcMain.handle('landing:decline', (_, id: string) => {
    landingHeld.decline(id)
    send('landing')
  })
  ipcMain.handle('landing:reopen', (_, id: string) => {
    landingHeld.reopen(id)
    send('landing')
  })
  ipcMain.handle('code:merge', async (_, id: string) => {
    const { a, base } = await worktreeOf(id)
    await mergeInto(a.repoPath, a.branch!, base)
    return base
  })
  // The last steps for a piece of work: is it ready, then land it on the base branch and, if asked, retire the agent.
  // The merge gate: where the plan stands and what the audit found for the branch as it is now. The audit is started here when it has not
  // run for this head, and the window is told when it answers.
  const startAudit = async (id: string, a: AgentRecord, base: string, head: string) => {
    const answer = workflows.runAudit(id, head, await branchDiff(a.cwd, base, a.branch!))
    // It is running now: the chat's card says so at once, instead of at its next look.
    send('workflows')
    await answer
    send('workflows')
    void askForPr(id)
  }
  // The gate after the audit: once nothing holds the push for a run that ends in a pull request, the agent is told to open it, once for each head, so no one has to ask.
  const prAsked = new Set<string>()
  const askForPr = async (id: string) => {
    const a = byId(id)
    if (!a?.branch || workflows.landKind(id) !== 'pr') return
    try {
      const head = await git(a.cwd, 'rev-parse', a.branch)
      const check = workflows.mergeCheck(id, head, { auditable: (await readyAskers()).length > 0 })
      if (!check || check.commits === 0 || !auditSettled(check.audit) || workflows.landedHead(id, head) || workflows.landingHold(id, head) || prAsked.has(`${id}:${head}`)) return
      prAsked.add(`${id}:${head}`)
      mailbox.fromPerson(id, PR_GO(a.branch, head, check.audit.state === 'done'))
    } catch {
      // Not ready to be asked about (git failed): the next change to the audit asks again.
    }
  }
  // A push the office never saw (git run with its hooks off): when the head of a run that ends in a pull request is already on a remote branch other than the base, it is recorded
  // as pushed without the hold, so the track does not wait for a push that has happened.
  const noticePushes = async () => {
    for (const a of agents) {
      if (!a.branch || workflows.landKind(a.id) !== 'pr') continue
      try {
        const head = await git(a.cwd, 'rev-parse', a.branch)
        if (workflows.landedHead(a.id, head)) continue
        const base = a.base ?? (await checkedOutBranch(a.repoPath))
        if (Number(await git(a.cwd, 'rev-list', '--count', `${base}..${head}`)) === 0) continue
        const remotes = (await git(a.cwd, 'for-each-ref', '--points-at', head, '--format=%(refname:short)', 'refs/remotes')).split('\n').filter((r) => r && !r.endsWith('/HEAD') && !r.endsWith(`/${base}`))
        if (!remotes.length) continue
        workflows.landing(a.id, head, { anyway: true, unchecked: true })
        landingHeld.clear(a.id)
        send('workflows')
        send('landing')
      } catch {
        // Git failed for this agent (gone folder, no remote): the next look tries again.
      }
    }
  }
  const noticing = setInterval(() => void noticePushes(), 20_000)
  app.on('before-quit', () => clearInterval(noticing))
  autoAudit = async (id) => {
    const a = byId(id)
    if (!a?.branch) return
    try {
      const { base } = await worktreeOf(id)
      const head = await git(a.cwd, 'rev-parse', a.branch)
      if (!workflows.auditDue(id, head)) return
      const r = await finishReadiness(a.repoPath, a.cwd, a.branch, base)
      if (r.ahead > 0 && workflows.mergeCheck(id, head, { auditable: (await readyAskers()).length > 0 })?.audit.state === 'not-run') await startAudit(id, a, base, head)
    } catch {
      // An audit that cannot start (git failed, no asker) is started when the band or the merge asks for the status.
    }
  }
  const mergeOf = async (id: string, a: AgentRecord, base: string, ahead: number, act = true) => {
    const head = await git(a.cwd, 'rev-parse', a.branch!)
    const auditable = (await readyAskers()).length > 0
    let check = workflows.mergeCheck(id, head, { auditable })
    if (act && check?.audit.state === 'not-run' && ahead > 0) {
      void startAudit(id, a, base, head).catch(() => undefined)
      check = workflows.mergeCheck(id, head, { auditable })
    }
    // Checks that have not run for this branch are run now; ones that already did are left alone, so opening Finish never uses up their tries.
    if (act && check?.checks.some((c) => c.state === 'running' || c.state === 'pending') && ahead > 0) void kickChecks(id, { fresh: true })
    return { head, auditable, check }
  }
  // A branch that shares no history with its base: move it onto the base (keeping a backup branch) with its own commits, or none. Only while the agent is idle and nothing is uncommitted.
  const workingNow = (id: string) => sessions.has(id) && ['thinking', 'researching', 'implementing', 'running', 'delegating'].includes(lastActivity.get(id) ?? '')
  ipcMain.handle('finish:move-plan', async (_, id: string) => {
    const { a, base } = await worktreeOf(id)
    const plan = await unrelatedPlan(a.cwd, a.branch!, base)
    const dirty = (await uncommittedFiles(a.cwd)).length
    const blocked = workingNow(id) ? { kind: 'working' as const } : dirty ? { kind: 'uncommitted' as const, count: dirty } : undefined
    return { branch: a.branch!, base, ...plan, ...(blocked && { blocked }) }
  })
  ipcMain.handle('finish:move', async (_, id: string, pick: string[]) => {
    const { a, base } = await worktreeOf(id)
    if (workingNow(id)) return { ok: false as const, kind: 'working' as const, message: `${a.name} is working: it can be moved when the turn ends.` }
    const shas = (Array.isArray(pick) ? pick : []).filter((s) => typeof s === 'string' && /^[0-9a-f]{40}$/.test(s)).slice(0, 500)
    try {
      const r = await moveOntoBase(a.cwd, a.branch!, base, shas)
      send('workflows')
      mailbox.fromOffice(id, `Your branch was moved onto ${base}: it now starts from ${base}'s history with ${r.moved} of your own commit${r.moved === 1 ? '' : 's'} on top (the same files; the old branch is kept as ${r.backup}). Nothing for you to do.`)
      return { ok: true as const, ...r }
    } catch (e) {
      if (e instanceof MoveError) return { ok: false as const, kind: e.kind, message: e.message, ...(e.sha && { sha: e.sha }), ...(e.subject && { subject: e.subject }), ...(e.files && { files: e.files }), ...(e.count !== undefined && { count: e.count }) }
      return { ok: false as const, kind: 'error' as const, message: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('finish:move-undo', async (_, id: string, backup: string, head: string) => {
    const { a } = await worktreeOf(id)
    if (!/^aw\/backup\/[\w./-]+$/.test(backup) || !/^[0-9a-f]{40}$/.test(head)) return { ok: false, message: 'That is not a backup of this move.' }
    if (workingNow(id)) return { ok: false, message: `${a.name} is working.` }
    try {
      await undoMove(a.cwd, a.branch!, backup, head)
      send('workflows')
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('finish:status', async (_, id: string, o?: { readOnly?: boolean }) => {
    const { a, base } = await worktreeOf(id)
    const r = await finishReadiness(a.repoPath, a.cwd, a.branch!, base)
    return { branch: a.branch!, base, ...r, merge: (await mergeOf(id, a, base, r.ahead, !o?.readOnly)).check }
  })
  // "Run the audit again" after one failed.
  ipcMain.handle('finish:audit', async (_, id: string) => {
    const { a, base } = await worktreeOf(id)
    await startAudit(id, a, base, await git(a.cwd, 'rev-parse', a.branch!))
  })
  ipcMain.handle('finish:seen', async (_, id: string, which: number[]) => {
    const { a } = await worktreeOf(id)
    workflows.seen(id, await git(a.cwd, 'rev-parse', a.branch!), which.filter((i) => Number.isInteger(i) && i >= 0).slice(0, 20))
    send('workflows')
    void askForPr(id)
  })
  ipcMain.handle('finish:add-to-plan', async (_, id: string, which: number[]) => {
    const { a } = await worktreeOf(id)
    workflows.addToPlan(id, await git(a.cwd, 'rev-parse', a.branch!), which.filter((i) => Number.isInteger(i) && i >= 0).slice(0, 20))
    send('workflows')
    send('landing')
    void askForPr(id)
  })
  ipcMain.handle('finish:aside', async (_, id: string) => {
    const { a } = await worktreeOf(id)
    workflows.asideAudit(id, await git(a.cwd, 'rev-parse', a.branch!))
    send('workflows')
    send('landing')
    void askForPr(id)
  })
  ipcMain.handle('finish:undo-aside', async (_, id: string) => {
    const { a } = await worktreeOf(id)
    workflows.undoAsideAudit(id, await git(a.cwd, 'rev-parse', a.branch!))
    send('workflows')
    send('landing')
  })
  ipcMain.handle('finish:run', async (_, id: string, o: { squash: boolean; message: string; cleanup: boolean; anyway?: boolean }) => {
    const { a, base } = await worktreeOf(id)
    const r = await finishReadiness(a.repoPath, a.cwd, a.branch!, base)
    if (r.unrelated) throw new Error(unrelatedMessage(a.branch!, base))
    if (r.uncommitted) throw new Error(`${a.name} has ${r.uncommitted} uncommitted file(s); commit them first (Code tab).`)
    if (!r.ahead) throw new Error(`${a.branch} has nothing that ${base} does not already have.`)
    // The server says no, not only the dialog: an audit still running or a plan never approved holds the branch back.
    const { head, auditable } = await mergeOf(id, a, base, 0)
    workflows.landing(id, head, { anyway: !!o.anyway, auditable })
    send('workflows')
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
  const moveAgentAccount = (id: string, account: string, restartIfThere = false) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    if (!accountsSvc.support(a.provider)) throw new Error(`${providerOf(a).label} does not keep separate accounts.`)
    if (account && !accountsSvc.dirOf(a.provider, account)) throw new Error('That account was removed.')
    const there = (a.account ?? '') === account
    if (there && !restartIfThere) return
    const p = sessions.get(id)
    if (p && !['idle', 'waiting', undefined].includes(lastActivity.get(id))) throw new Error('Wait until it finishes its turn.')
    // Already on the account: only its process is started again, so it takes the account's login (the records can differ from what it runs on).
    if (!there) {
      accountsSvc.moveConversation(a, account)
      persist()
    }
    if (p) {
      restarting.add(id)
      mailbox.restarting(id)
      p.kill()
    }
  }
  ipcMain.handle('agent-set-account', (_, id: string, account: string) => moveAgentAccount(id, account))
  // Every agent as the "switch all agents to an account" dialog sees it.
  const switchAgents = (): SwitchAgent[] =>
    agents.map((a) => ({ id: a.id, name: a.name, provider: providerOf(a).id, account: a.account ?? '', project: a.repoPath, online: sessions.has(a.id), activity: sessions.has(a.id) ? (lastActivity.get(a.id) ?? 'idle') : null }))
  const waitStopped = async (id: string, ms = 12_000) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) if (!sessions.has(id) || ['idle', 'waiting', undefined].includes(lastActivity.get(id))) return true
    return false
  }
  // The agent has shown its input box again (or is gone): a relaunch is done. A slow one is not failed; the next just goes on after this long.
  const waitReady = async (id: string, ms = 30_000) => {
    for (const end = Date.now() + ms; Date.now() < end && sessions.has(id) && mailbox.isStarting(id); ) await new Promise((r) => setTimeout(r, 250))
  }
  // The run in progress, for "Stop after these".
  let switching: { stop: boolean } | null = null
  // Moves every agent of a program that keeps accounts to `account`, SWITCH_BATCH at a time: all of them relaunching at once swamped a computer. A working agent is stopped first (the move refuses mid-turn), and once it is back up on the new account it is told to continue.
  const switchAllAgents = async (account: string, stopWorking: boolean, ids?: string[]): Promise<SwitchResult[]> => {
    const plan = planSwitch(switchAgents(), account, (p) => !!accountsSvc.support(p as ProviderId), ids ? new Set(ids) : undefined)
    const working = new Set(plan.stop.map((a) => a.id))
    const run = { stop: false }
    switching = run
    const report = (line: SwitchAgent, state: SwitchResult['state'], error?: string) => {
      const r: SwitchResult = { id: line.id, name: line.name, state, ...(error ? { error } : {}) }
      send('accounts-switch', r)
      return r
    }
    const one = async (line: SwitchAgent): Promise<SwitchResult> => {
      try {
        const stopped = working.has(line.id)
        if (stopped) {
          report(line, 'stopping')
          interruptAgent(line.id)
          if (!(await waitStopped(line.id))) return report(line, 'failed', 'It did not stop within 12 seconds, so it stays on its old account.')
        }
        const live = sessions.has(line.id)
        moveAgentAccount(line.id, account, true)
        // A running agent is relaunched: it holds its place until its input box is back, which is what keeps the next ones from starting with it.
        if (live) {
          report(line, 'starting')
          await waitReady(line.id)
        }
        if (stopped) mailbox.fromPerson(line.id, SWITCH_CONTINUE)
        return report(line, stopped ? 'continued' : 'moved')
      } catch (e) {
        return report(line, 'failed', (e as Error).message)
      }
    }
    const lines = stopWorking ? [...plan.stop, ...plan.quiet] : plan.quiet
    try {
      const done = await inBatches(lines, SWITCH_BATCH, one, () => run.stop)
      return done.map((r, i) => r ?? report(lines[i]!, 'left'))
    } finally {
      if (switching === run) switching = null
    }
  }
  ipcMain.handle('accounts:switch-stop', () => void (switching && (switching.stop = true)))
  ipcMain.handle('accounts:agents', () => switchAgents())
  ipcMain.handle('accounts:switch-all', (_, account: string, stopWorking: boolean, ids?: string[]) => switchAllAgents(String(account ?? ''), !!stopWorking, Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string') : undefined))
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
  // Starts the agent's program again on the same session: whatever it was running stops, and its conversation carries on.
  ipcMain.handle('agent:restart', (_, id: string) => {
    const p = sessions.get(id)
    if (!byId(id)) throw new Error('No such agent.')
    if (!p) throw new Error('That agent is asleep; click it to wake it.')
    restarting.add(id)
    mailbox.restarting(id)
    p.kill()
  })
  // Remote control is read by the program only at launch, so switching it restarts the agent on the same session.
  ipcMain.handle('agent:set-remote', (_, id: string, on: boolean) => {
    const a = byId(id)
    if (!a) throw new Error('No such agent.')
    if (!providerOf(a).capabilities.remote) throw new Error(`${providerOf(a).label} cannot be continued from a phone.`)
    a.options = { ...a.options, remote: on || undefined }
    persist()
    remoteLinks.delete(id)
    seenRemote.set(id, remoteState(on, null))
    send('remote', id, seenRemote.get(id))
    const p = sessions.get(id)
    if (!p) return
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
      return m ? { highlighted: m.highlighted, key: `${m.title}\n${m.options.join('\n')}` } : null
    }
    if (!ui(id).genericMenu(screens.get(id)?.text() ?? '')) throw new Error('That menu is gone.')
    termMenus.pressed(id)
    if (!(await ui(id).answerMenu(ioFor(id), detect, index))) throw new Error('Could not pick that option. Finish it in the Terminal tab.')
  })
  // A key pressed for a menu that is still there afterwards (Esc on a screen it does nothing on) brings its card back, instead of leaving the chat with nothing.
  ipcMain.handle('menu:cancel', (_, id: string) => (sessions.get(id)?.write(keysOf(id).cancel), void termMenus.pressed(id)))
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
    return a ? [...providerOf(a).transcript.subagents(a), ...subagents.infos(a.id)] : []
  })
  // One subagent's own conversation, to be read like an agent's.
  ipcMain.handle('subagents:chat', (_, id: string, subagentId: string) => {
    const a = byId(id)
    if (!a) return []
    const child = subagents.conversation(a.id, subagentId)
    return child.length ? child : (providerOf(a).transcript.subagentConversation?.(a, subagentId) ?? [])
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
  ipcMain.handle('ledger:tokenMix', (_, days: number, account?: string) =>
    tokenMix(ledger, Math.min(Math.max(Math.round(days) || 30, 1), 365), Date.now(), Object.fromEntries(agents.map((a) => [a.id, a.name])), account))
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
    return { hiredAt: hired.at, hiredEstimated: hired.estimated, workedMs: workedNow(clock, Date.now()), ...profileCounts(items), subagents: providerOf(a).transcript.subagents(a).length + subagents.infos(a.id).length, commits }
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
    // On Mac and Linux zsh and bash are started so they mark each prompt, which the terminal uses to jump between commands.
    const start = process.platform === 'win32' ? { args: [], env: {} } : shellIntegration(file, join(HOME, 'shell-integration'), process.env.ZDOTDIR ?? '')
    const p = pty.spawn(file, start.args, { name: 'xterm-256color', cols: 80, rows: 24, cwd: folder, env: { ...env, ...start.env, ...identityFor(folder) } as Record<string, string> })
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
  const cancelling = new Set<string>()
  ipcMain.handle('need:cancel', (_, id: string) =>
    cancelNeed({ id, inFlight: cancelling, isOpen: () => questionOpen.has(id) || planOpen.has(id), press: () => (settleAfterEsc(id), void sessions.get(id)?.write(keysOf(id).cancel)), sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)) })
  )
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

  // The preview panes are <webview>s: each shows a web page (a dev server on this computer, or a site on the internet the person allowed) with no access to the app,
  // in a session of its own that keeps nothing between runs, and that is never given a permission (camera, location, notifications) nor lets a file be downloaded.
  const preview = session.fromPartition('preview')
  preview.setPermissionRequestHandler((_wc, _permission, done) => done(false))
  preview.setPermissionCheckHandler(() => false)
  preview.on('will-download', (e) => e.preventDefault())
  app.on('web-contents-created', (_, contents) => {
    if (contents.getType() !== 'webview') return
    rightClick(contents)
    // Pinch zooms the page (Electron has it off), and Cmd+ / Cmd- / Cmd+0 over the page zoom it, not the app: the key is taken here, before the menu's own zoom shortcuts.
    void contents.setVisualZoomLevelLimits(1, 4).catch(() => {})
    contents.on('before-input-event', (e, input) => {
      const to = zoomKey(input, process.platform === 'darwin')
      if (!to) return
      e.preventDefault()
      contents.setZoomFactor(zoomTo(to, contents.getZoomFactor(), contents.hostWebContents?.getZoomFactor() || 1))
    })
    // A link that asks for a new window is followed in the same pane; the pane never opens windows of its own.
    contents.setWindowOpenHandler(({ url }) => (isWebUrl(url) && void contents.loadURL(url).catch(() => {}), { action: 'deny' }))
    contents.on('will-navigate', (e, url) => !isWebUrl(url) && e.preventDefault())
    contents.on('will-redirect', (e, url) => !isWebUrl(url) && e.preventDefault())
  })
  createWindow()
  ready = true

  // A restart within seconds (a code change in dev, a crash) brings back the agents that were running, so nothing
  // you had open goes to sleep. A restart after a longer gap starts asleep, as before.
  for (const id of recentlyRunning(RUNNING_FILE, Date.now(), 20_000)) {
    const a = byId(id)
    // A subagent's parent was waiting on its answer, and that wait ended with the app: it stays as it was, stopped, and is not started again.
    if (a && !a.parent && !sessions.has(id)) spawn(a, env)
  }
  const heartbeat = setInterval(noteRunning, 2000)
  // An agent idle for long holds its program's memory for nothing: stop it; its Wake button starts it again with --resume, as after a restart.
  let sleeping = false
  const sleeper = setInterval(() => {
    if (sleeping) return
    sleeping = true
    void sleepIdle({
      ids: agents.filter((a) => sessions.has(a.id) && !a.parent).map((a) => a.id),
      activity: (id) => lastActivity.get(id),
      quietSince: (id) => Math.max(lastOutput.get(id) ?? 0, busyAt.get(id) ?? 0, spawnedAt.get(id) ?? 0),
      hasChildren: (id) => agents.some((c) => c.parent === id && sessions.has(c.id)),
      pending: (id) => mailbox.pending(id),
      inRun: (id) => workflows.runs().some((r) => r.agent === id && r.status === 'open'),
      procs: async (id) => (await listProcs(sessions.get(id)?.pid ?? 0)).length,
      sleep: (id) => sessions.get(id)?.kill(),
      now: Date.now(),
      after: (!app.isPackaged && +(process.env.AW_SLEEP_AFTER_MS ?? 0)) || prefs.sleepIdleMinutes * 60_000
    })
      .catch(() => {})
      .finally(() => (sleeping = false))
  }, (!app.isPackaged && +(process.env.AW_SLEEP_TICK_MS ?? 0)) || 60_000)

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
    clearInterval(sleeper)
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
