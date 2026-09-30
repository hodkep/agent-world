import { forget, loadMemory, recall, remember } from './memory'
import { sessionNotes } from './notes'
import { resolveCommand } from './command'
import { checkForUpdates } from './updates'
import { cleanPrefs, loadPrefs, savePrefs } from './prefs'
import { btwOverlay } from './btw'
import { listProcs, stopProc } from './procs'
import { execFile, execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'
import { BrowserWindow, Notification, app, dialog, ipcMain, powerSaveBlocker, shell } from 'electron'
import * as pty from 'node-pty'
import type { RemoveResult } from '../shared/api'
import type { Activity, AgentEvent, AgentOptions, AgentRecord, AgentStats, Decision, PermissionMode, PermissionRequest, Question, QuestionAnswer, RawEvent } from '../shared/types'
import { type Alert, budgetAlert, finishedTurn, shouldNotify } from './attention'
import { agentEnv, hookSettings, launchArgs, mcpConfig } from './claude'
import { commandLine, listCommands } from './commands'
import { manageArgs, parseMcpList, parsePlugins } from './tools'
import { listSessions, projectSlug } from './history'
import { mergeLimits, noLimits, type UsageLimits } from '../shared/usage'
import { saveAttachment } from './attachments'
import { newestSession, transcriptPath } from './chat'
import { TranscriptTail } from './chatTail'
import type { ChatItem } from '../shared/chat'
import { BUILT_IN_ROLES } from '../shared/roles'
import { checkName, cleanName } from './names'
import { driveRewind, genericMenu, rewindList } from './menus'
import { recentlyRunning, writeRunning } from './resume'
import { autoUnavailable, readMode, setMode } from './modes'
import { deleteRole, discoverRoles, loadRoles, saveRole } from './roles'
import { findLocalServers, isListening } from './servers'
import { reviewRequest } from './review'
import { activate as activateWorkspace, forget as forgetWorkspace, loadWorkspaces, remember as rememberWorkspace, resume as resumeWorkspace, saveWorkspaces, type WorkspaceState } from './workspaces'
import { Mailbox } from './mailbox'
import { startMcpServer } from './mcpServer'
import { driveAnswers, parseAsk } from './askMenu'
import { answerMenu, answerTrust, anyMenu, inputReady, looksWorking, planMenu, trustPrompt } from './prompts'
import { Screen } from './screen'
import { startHookServer } from './hookServer'
import { loadAgents, saveAgents } from './store'
import { changes, commitAll, createPr, discardFile, finishReadiness, listFiles, mergeInto, originalContent, pushBranch, readWorktreeFile, writeWorktreeFile } from './gitops'
import { DirtyWorktreeError, createWorktree, git, isGitRepo, nameTaken, removeWorktree, slug as repoSlug } from './worktree'

// AW_HIDDEN=1 runs the app without a visible window, a dock icon, notifications or focus stealing: for automated tests.
const HIDDEN = process.env.AW_HIDDEN === '1'
if (HIDDEN && process.platform === 'darwin') app.dock?.hide()
const HOME = process.env.AW_HOME ?? join(homedir(), '.agent-world')
// A run with its own home (tests, demos) also gets its own browser storage, so remembered layout never leaks between runs.
if (process.env.AW_HOME) app.setPath('userData', join(HOME, 'electron'))
const AGENTS_FILE = join(HOME, 'agents.json')
const CLAUDE_PROJECTS = process.env.AW_CLAUDE_PROJECTS ?? join(homedir(), '.claude', 'projects')
let prefs = loadPrefs(join(HOME, 'preferences.json'))
// The environment wins (tests and packaging), then Settings, then whatever `claude` the PATH finds.
const claudeBin = () => process.env.AW_CLAUDE_BIN ?? (prefs.claudePath || 'claude')
/** The program and arguments that start claude here (on Windows the name needs its extension, or cmd.exe for a .cmd). */
const claudeCmd = (args: string[]) => {
  const l = resolveCommand(claudeBin())
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

let win: BrowserWindow | null = null
let agents: AgentRecord[] = []
const sessions = new Map<string, pty.IPty>()
// What the /btw overlay last showed each agent, so the window hears only about changes.
const btwSent = new Map<string, string>()
const lastStats = new Map<string, AgentStats>()
const MEMORY_HINT =
  'This project keeps shared notes for every agent. Near the start of a task, call the agent-world recall tool with a few words about it. When you learn something a future agent should know (how to run the tests, a decision and why, a trap), save it with the remember tool. Keep notes short; never save secrets.'
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
let usage: UsageLimits = noLimits()
const loadUsage = () => {
  try {
    usage = mergeLimits(noLimits(), JSON.parse(readFileSync(USAGE_FILE, 'utf8')) as UsageLimits)
  } catch {
    /* first run, or unreadable: start empty */
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
function noteServers(id: string, chunk: string) {
  // An address can arrive split across two chunks.
  const text = (serverTail.get(id) ?? '') + chunk
  serverTail.set(id, text.slice(-160))
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
  tail: TranscriptTail
  sessionId: string
  items: ChatItem[]
}
const chats = new Map<string, Chat>()
function followChat(a: AgentRecord) {
  const now = chats.get(a.id)
  if (now?.sessionId === a.sessionId) return
  now?.tail.stop()
  const chat: Chat = { tail: null as unknown as TranscriptTail, sessionId: a.sessionId, items: [] }
  // Claude names the project folder after the real path of its working directory (symlinks resolved).
  let real = a.cwd
  try {
    real = realpathSync(a.cwd)
  } catch {
    /* the folder is gone; the transcript will not appear */
  }
  chat.tail = new TranscriptTail(transcriptPath(CLAUDE_PROJECTS, real, a.sessionId), (items, replace) => {
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
// The permission mode last seen in each agent's footer: hooks only say it changed at their next event, the screen says it at once.
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
// Last size the panel gave each terminal, so a relaunch comes back at the size the user sees.
const sizes = new Map<string, { cols: number; rows: number }>()
let awakeBlocker: number | null = null
let hooksRef: Awaited<ReturnType<typeof startHookServer>> | null = null
// Set once the local servers are up; every spawned agent gets its own MCP identity file.
let office: { mcpUrl: string; hookUrl: string } | null = null
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
      if (anyMenu(screens.get(id)?.text() ?? '') && left > 0) return void setTimeout(() => attempt(left - 1), MENU_RETRY_MS)
      // Bracketed paste keeps multi-line messages as one prompt instead of submitting at the first newline.
      p.write(`\x1b[200~${text}\x1b[201~`)
      setTimeout(() => p.write('\r'), 150)
    }
    setTimeout(() => attempt(MENU_RETRIES), DELIVERY_DELAY_MS)
  },
  notify: (m) => send('agent-message', m)
})
// PTYs exit after the window is gone during quit; messages then have nowhere to go.
const send = (channel: string, ...args: unknown[]) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}
const persist = () => saveAgents(AGENTS_FILE, agents)
const byId = (id: string) => agents.find((a) => a.id === id)

/** The next name from the list that no agent has and no old branch or worktree in this repo is still using. */
async function nextName(repoPath: string) {
  const used = new Set(agents.map((a) => a.name))
  for (let n = 1; ; n++) for (const base of NAMES) {
    const name = n === 1 ? base : `${base}${n}`
    if (!used.has(name) && !(await nameTaken({ repoPath, name, rootDir: join(HOME, 'worktrees') }))) return name
  }
}

/**
 * A fresh token per launch, written into this agent's own hook settings and MCP config (user-only files).
 * Every hook call, statusline update and MCP request carries it, and the token alone says which agent is talking.
 */
function agentFiles(a: AgentRecord) {
  if (!office) throw new Error('Local servers are not running yet.')
  const dir = join(HOME, 'agents', a.id)
  mkdirSync(dir, { recursive: true })
  for (const [t, id] of agentTokens) if (id === a.id) agentTokens.delete(t)
  const agentToken = randomBytes(24).toString('hex')
  agentTokens.set(agentToken, a.id)
  const settingsFile = join(dir, 'settings.json')
  const mcpFile = join(dir, 'mcp.json')
  writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: office.hookUrl, token: agentToken, permissionTimeoutSec: PERMISSION_TIMEOUT_SEC, platform: process.platform })), { mode: 0o600 })
  writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: office.mcpUrl, agentToken })), { mode: 0o600 })
  return { settingsFile, mcpFile }
}

// ---- attention: notifications, dock badge, keep-awake ---------------------------------------

function notify(kind: Alert, agent: AgentRecord | undefined, body: string) {
  if (HIDDEN || prefs.notifications === 'off' || (prefs.notifications === 'attention' && kind === 'finished') || !Notification.isSupported() || !shouldNotify(kind, !!win && !win.isDestroyed() && win.isFocused())) return
  const n = new Notification({ title: agent ? `${agent.name} · Agent World` : 'Agent World', body, silent: kind === 'finished' })
  n.on('click', () => {
    win?.show()
    win?.focus()
    if (agent) send('select-agent', agent.id)
  })
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
    usage = mergeLimits(usage, s.limits)
    send('usage', usage)
    try {
      mkdirSync(HOME, { recursive: true })
      writeFileSync(USAGE_FILE, JSON.stringify(usage), { mode: 0o600 })
    } catch {
      /* the reading is only a convenience; losing it is fine */
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
  const menu = genericMenu(text)
  const covered = trustOpen.has(id) || planOpen.has(id) || questionOpen.has(id) || !!hooksRef?.hasPending(id)
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

/** After a rewind: Claude puts the restored prompt back in its input box and forks the conversation to a new session. */
function finishRewind(id: string) {
  const r = rewinding.get(id)
  const a = byId(id)
  rewinding.delete(id)
  if (!r || !a) return
  const text = screens.get(id)?.text() ?? ''
  const head = r.text.slice(0, 30)
  if (text.split('\n').some((l) => /^❯[ \u00a0]/.test(l) && l.slice(2).trim().startsWith(head))) {
    sessions.get(id)?.write('\x15')
    send('composer-prefill', id, r.text)
  }
  let real = a.cwd
  try {
    real = realpathSync(a.cwd)
  } catch {
    /* keep the plain path */
  }
  const fork = newestSession(dirname(transcriptPath(CLAUDE_PROJECTS, real, a.sessionId)), a.sessionId, r.at - 1000)
  if (fork) {
    a.sessionId = fork
    persist()
    followChat(a)
  }
}

function spawn(a: AgentRecord, env: NodeJS.ProcessEnv) {
  if (sessions.has(a.id)) return
  followChat(a)
  const args = launchArgs({ ...a, ...agentFiles(a), permissionMode: PERMISSION_MODE, options: a.options, houseRules: [MEMORY_HINT, prefs.houseRules].filter(Boolean).join('\n\n'), addDirs: [ATTACH_DIR] })
  const { cols, rows } = sizes.get(a.id) ?? { cols: COLS, rows: ROWS }
  const cmd = claudeCmd(args)
  const p = pty.spawn(cmd.file, cmd.args, { name: 'xterm-256color', cols, rows, cwd: a.cwd, env })
  screens.get(a.id)?.dispose()
  const screen = new Screen(cols, rows)
  screens.set(a.id, screen)
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
      if (hooksRef?.hasPending(a.id)) {
        if (anyMenu(text)) menuSeen.add(a.id)
        else if (menuSeen.delete(a.id)) hooksRef.dismiss(a.id)
      } else menuSeen.delete(a.id)
      const mode = readMode(text)
      if (mode && mode !== seenMode.get(a.id)) {
        seenMode.set(a.id, mode)
        send('agent-event', { type: 'mode', agentId: a.id, sessionId: a.sessionId, mode })
      }
      // SessionStart does not reach HTTP hooks, so readiness for the first message comes from the screen.
      if (inputReady(text)) mailbox.started(a.id)
      const trust = trustPrompt(text)
      if (trust && !trustOpen.has(a.id)) {
        trustOpen.add(a.id)
        send('trust-prompt', a.id, trust.path || a.cwd)
        notify('trust', a, 'Needs you to trust its workspace before it can start.')
        refreshAttention()
      } else if (!trust && trustOpen.delete(a.id)) {
        send('trust-prompt', a.id, null)
        refreshAttention()
      }
      const asking = !!parseAsk(text)
      if (asking !== questionOpen.has(a.id)) {
        if (asking) {
          questionOpen.add(a.id)
          notify('permission', a, 'Has a question for you.')
        } else questionOpen.delete(a.id)
        send('question-menu', a.id, asking)
        refreshAttention()
      }
      const plan = !!planMenu(text)
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
      return spawn(a, env)
    }
    for (const [t, id] of agentTokens) if (id === a.id) agentTokens.delete(t)
    screens.get(a.id)?.dispose()
    screens.delete(a.id)
    mailbox.gone(a.id)
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

async function main() {
  await app.whenReady()
  // The packaged app has its icon built in; a development run needs it set.
  if (!app.isPackaged && process.platform === 'darwin' && !HIDDEN) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  mkdirSync(HOME, { recursive: true })
  agents = loadAgents(AGENTS_FILE)
  for (const a of agents) followChat(a)
  loadUsage()
  workspaces = loadWorkspaces(WORKSPACES_FILE)
  const env = { ...agentEnv(process.env), PATH: loginShellPath() }

  const hooks = await startHookServer({
    agentForToken: (t) => agentTokens.get(t) ?? null,
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
      if (anyMenu(screens.get(r.agentId)?.text() ?? '')) menuSeen.add(r.agentId)
      refreshAttention()
      send('permission', r)
      notify('permission', byId(r.agentId), `Wants to use ${r.tool}: ${r.detail}`)
    },
    onPermissionSettled: (id) => {
      pendingPermissions.delete(id)
      refreshAttention()
      send('permission-settled', id)
    },
    onStatus: onStats
  })
  hooksRef = hooks
  // An agent that looks idle (input box showing, no menu, screen quiet for a few seconds) but never sent a Stop hook,
  // as after Esc: Claude does not report an interrupted turn. Call it idle, so the office, the chat and any waiting mail move on.
  const BUSY = new Set<Activity>(['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting'])
  const idleCheck = setInterval(() => {
    for (const a of agents) {
      if (!sessions.has(a.id)) continue
      const text = screens.get(a.id)?.text() ?? ''
      surfaceTerminalMenu(a.id, text)
      const btw = btwOverlay(text)
      const sig = btw ? JSON.stringify(btw) : ''
      if (btwSent.get(a.id) !== sig && (btw || btwSent.has(a.id))) (btwSent.set(a.id, sig), send('btw', a.id, btw))
      if (Date.now() - (lastOutput.get(a.id) ?? 0) <= SETTLED_MS || !inputReady(text) || anyMenu(text) || looksWorking(text)) continue
      mailbox.looksIdle(a.id)
      const act = lastActivity.get(a.id)
      if (act && BUSY.has(act)) {
        lastActivity.set(a.id, 'idle')
        send('agent-event', { type: 'activity', agentId: a.id, sessionId: a.sessionId, activity: 'idle' })
      }
    }
  }, 300)
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
    }
  })
  office = { mcpUrl: mcp.url, hookUrl: hooks.url }
  for (const u of [mcp.url, hooks.url]) if (u) ownPorts.push(Number(new URL(u).port))

  ipcMain.handle('pick-folder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
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
  ipcMain.handle('get-usage', () => usage)
  ipcMain.handle('chat:get', (_, id: string) => ({ sessionId: chats.get(id)?.sessionId ?? '', items: chats.get(id)?.items ?? [] }))
  // The composer types into the agent's real terminal, exactly as if typed there, so nothing about the session changes.
  ipcMain.handle('chat:send', async (_, id: string, raw: string) => {
    const p = sessions.get(id)
    if (!p) throw new Error('That agent is not running. Wake it first.')
    const text = raw.replace(/\x1b\[20[01]~/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim()
    if (!text) return
    if (anyMenu(screens.get(id)?.text() ?? '')) throw new Error('Claude is showing a menu. Answer it first (or finish it in the Terminal tab).')
    p.write(`\x1b[200~${text}\x1b[201~`)
    await new Promise((r) => setTimeout(r, 150))
    p.write('\r')
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
    if (anyMenu(screens.get(id)?.text() ?? '')) throw new Error('Answer the open menu first.')
    sessions.get(id)?.write('\x1b[Z')
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
  ipcMain.handle('prefs:get', () => prefs)
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
  ipcMain.handle('btw:close', (_, id: string) => {
    if (btwOverlay(screens.get(id)?.text() ?? '')) sessions.get(id)?.write('\x1b')
  })
  ipcMain.handle('procs:list', (_, id: string) => (sessions.get(id) ? listProcs(sessions.get(id)!.pid) : []))
  ipcMain.handle('procs:stop', (_, id: string, pid: number) => (sessions.get(id) ? stopProc(sessions.get(id)!.pid, pid) : false))
  ipcMain.handle('chat:interrupt', (_, id: string) => {
    const p = sessions.get(id)
    if (!p) return
    p.write('\x1b')
    for (const [delay, keys] of [[1200, '\x1b'], [2400, '\x1b'], [3600, '\x03']] as const)
      setTimeout(() => {
        if (sessions.get(id) === p && looksWorking(screens.get(id)?.text() ?? '')) p.write(keys)
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
  const workspaceInfo = async () => {
    const active = resumeWorkspace(workspaces, isDir)
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
  ipcMain.handle('workspaces:get', workspaceInfo)
  ipcMain.handle('workspaces:activate', async (_, path: string) => {
    if (!isDir(path)) throw new Error('That folder is not there any more.')
    setWorkspaces(activateWorkspace(workspaces, path))
    return workspaceInfo()
  })
  ipcMain.handle('workspaces:forget', async (_, path: string) => {
    setWorkspaces(forgetWorkspace(workspaces, path))
    return workspaceInfo()
  })
  ipcMain.handle('list-agents', () => agents.map((a) => ({ ...a, online: sessions.has(a.id), activity: lastActivity.get(a.id) })))
  ipcMain.handle('add-agent', async (_, folder: string, options: AgentOptions = {}, wanted?: string) => {
    const name = cleanName(wanted ?? '') ? checkName(wanted!, agents.map((a) => a.name)) : await nextName(folder)
    if (cleanName(wanted ?? '') && (await nameTaken({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') })))
      throw new Error(`A branch or folder named aw/${name} is left over from an earlier agent here. Pick another name, or delete that branch first.`)
    const wt = !options.inPlace && (await isGitRepo(folder)) ? await createWorktree({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') }) : null
    setWorkspaces(rememberWorkspace(workspaces, folder))
    const a: AgentRecord = { id: randomUUID(), name, sessionId: randomUUID(), repoPath: folder, cwd: wt?.path ?? folder, branch: wt?.branch ?? null, base: wt?.base ?? null, started: false, options }
    agents.push(a)
    persist()
    spawn(a, env)
    return a
  })
  // What this agent's Claude can reach: MCP servers (health-checked by Claude itself) and plugins, as seen from its folder.
  ipcMain.handle('manage-tools', (_, id: string, action: import('../shared/types').ManageAction) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    const args = manageArgs(action)
    return new Promise<string>((resolve, reject) =>
      execFile(claudeCmd(args).file, claudeCmd(args).args, { cwd: a.cwd, env, timeout: 60_000 }, (err, stdout, stderr) => (err ? reject(new Error((stderr || stdout || err.message).trim().split('\n')[0])) : resolve(stdout.trim())))
    )
  })
  ipcMain.handle('list-tools', async (_, id: string) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    const claude = (...args: string[]) =>
      new Promise<string>((resolve) => execFile(claudeCmd(args).file, claudeCmd(args).args, { cwd: a.cwd, env, timeout: 45_000, maxBuffer: 8 * 1024 * 1024 }, (_err, stdout) => resolve(stdout)))
    const [mcp, plugins] = await Promise.all([claude('mcp', 'list'), claude('plugin', 'list', '--json')])
    return { mcp: parseMcpList(mcp), plugins: parsePlugins(plugins) }
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
        id: randomUUID(), name, sessionId: randomUUID(), repoPath: author.repoPath, cwd: wt.path, branch: wt.branch, base: wt.base, started: false,
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
  ipcMain.handle('list-history', (_, folder: string) => {
    const wtPrefix = projectSlug(join(HOME, 'worktrees', repoSlug(folder))) + '-'
    let all: string[] = []
    try {
      all = readdirSync(CLAUDE_PROJECTS)
    } catch {
      /* no Claude history yet */
    }
    const slugs = [projectSlug(realpathSync(folder)), ...all.filter((d) => d.startsWith(wtPrefix))]
    return listSessions(CLAUDE_PROJECTS, slugs).map((s) => {
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
    const a: AgentRecord = { id: randomUUID(), name, sessionId, repoPath: folder, cwd: wt?.path ?? folder, branch: wt?.branch ?? null, base: wt?.base ?? null, started: true }
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
      cwd: wt?.path ?? src.cwd, branch: wt?.branch ?? null, base: wt ? (src.base ?? wt.base) : null, started: false, options: model ? { ...src.options, model } : src.options
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
    return { base, branch: a.branch, files: await changes(a.cwd, base) }
  })
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
    a.options = { ...a.options, ...(change.model && { model: change.model }), ...(change.effort && { effort: change.effort }) }
    persist()
    restarting.add(id)
    mailbox.restarting(id)
    p.kill()
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
    if (anyMenu(io.screen())) throw new Error('Answer the open menu first.')
    if (['default', 'acceptEdits', 'plan', 'auto'].includes(mode) && readMode(io.screen()) && (await setMode(io, mode))) {
      seenMode.set(id, mode)
      send('agent-event', { type: 'mode', agentId: id, sessionId: a.sessionId, mode })
      return
    }
    if (mode === 'auto' && autoUnavailable(io.screen())) throw new Error('Claude says Auto mode is unavailable for this account or model.')
    if (!['auto', 'dontAsk'].includes(mode)) throw new Error('Claude did not switch to that mode. Try Shift+Tab in the Terminal tab.')
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
      const m = genericMenu(screen)
      return m ? { highlighted: m.highlighted } : null
    }
    if (!genericMenu(screens.get(id)?.text() ?? '')) throw new Error('That menu is gone.')
    if (!(await answerMenu(ioFor(id), detect, index))) throw new Error('Could not pick that option. Finish it in the Terminal tab.')
  })
  ipcMain.handle('menu:cancel', (_, id: string) => void sessions.get(id)?.write('\x1b'))
  // /rewind lists your earlier prompts; go to the one asked for. Claude's own "restore what?" menu then shows in the chat.
  ipcMain.handle('rewind-to', async (_, id: string, promptText: string) => {
    const p = sessions.get(id)
    if (!p) throw new Error('That agent is not running.')
    if (!['idle', 'waiting', undefined].includes(lastActivity.get(id))) throw new Error('Wait until it finishes, or stop it first.')
    const io = ioFor(id)
    if (anyMenu(io.screen())) throw new Error('Answer the open menu first.')
    p.write('/rewind')
    await io.sleep(500)
    p.write('\r')
    for (let i = 0; i < 20 && !rewindList(io.screen()); i++) await io.sleep(200)
    if (!rewindList(io.screen())) throw new Error('Claude did not open the rewind list. Try /rewind in the Terminal tab.')
    if (!(await driveRewind(io, promptText))) {
      p.write('\x1b')
      throw new Error('Could not find that message in the rewind list (older ones may be out of range).')
    }
    rewinding.set(id, { text: promptText, at: Date.now() })
  })
  // Diagnostics only: the app's own view of an agent's screen, for figuring out what Claude drew.
  if (process.env.AW_DEBUG) ipcMain.handle('debug:screen', (_, id: string) => `${screens.get(id)?.text() ?? ''}\n--- activity=${lastActivity.get(id)} session=${byId(id)?.sessionId} rewinding=${JSON.stringify(rewinding.get(id))} lastOutputAgo=${Date.now() - (lastOutput.get(id) ?? 0)} working=${looksWorking(screens.get(id)?.text() ?? '')} inputReady=${inputReady(screens.get(id)?.text() ?? '')}`)
  ipcMain.handle('pty-buffer', (_, id: string) => buffers.get(id) ?? { text: '', end: 0 })
  ipcMain.on('pty-write', (_, id: string, data: string) => sessions.get(id)?.write(data))
  ipcMain.on('pty-resize', (_, id: string, cols: number, rows: number) => {
    sizes.set(id, { cols, rows })
    sessions.get(id)?.resize(cols, rows)
    screens.get(id)?.resize(cols, rows)
  })
  ipcMain.on('decide', (_, requestId: string, d: Decision) => hooks.decide(requestId, d))
  ipcMain.handle('list-commands', (_, id: string) => {
    const a = byId(id)
    return a ? listCommands(a.cwd, homedir()) : []
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
    if (!(await answerMenu(io, planMenu, choice))) throw new Error('Could not answer the plan menu; answer it in the terminal.')
    // "Tell Claude what to change" opens an input for the feedback; paste it as one line of plain text.
    const text = feedback?.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim()
    if (choice === 2 && text) {
      await io.sleep(400)
      io.write(`\x1b[200~${text}\x1b[201~`)
      await io.sleep(150)
      io.write('\r')
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
    if (!(await driveAnswers(io, questions, answers))) throw new Error('Could not answer the question menu; finish it in the terminal.')
  })
  ipcMain.on('answer-trust', (_, id: string, trust: boolean) => {
    void answerTrust(
      {
        // Always the live screen: the user may also be moving the cursor in the terminal.
        screen: () => screens.get(id)?.text() ?? '',
        write: (keys) => sessions.get(id)?.write(keys),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms))
      },
      trust
    )
  })

  win = new BrowserWindow({
    show: !HIDDEN,
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#14121c',
    title: 'Agent World',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, webviewTag: true }
  })
  // The preview pane is a <webview>; it may only ever show local dev servers, with no access to the app.
  const isLocalHttp = (u: string) => {
    try {
      const x = new URL(u)
      return x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname)
    } catch {
      return false
    }
  }
  win.webContents.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.contextIsolation = true
    prefs.sandbox = true
    if (!isLocalHttp(params.src ?? '')) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  app.on('web-contents-created', (_, contents) => {
    if (contents.getType() !== 'webview') return
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (e, url) => !isLocalHttp(url) && e.preventDefault())
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  // A restart within seconds (a code change in dev, a crash) brings back the agents that were running, so nothing
  // you had open goes to sleep. A restart after a longer gap starts asleep, as before.
  for (const id of recentlyRunning(RUNNING_FILE, Date.now(), 20_000)) {
    const a = byId(id)
    if (a && !sessions.has(id)) spawn(a, env)
  }
  const heartbeat = setInterval(noteRunning, 2000)

  app.on('before-quit', () => {
    quitting = true
    clearInterval(heartbeat)
    for (const p of sessions.values()) p.kill()
    clearInterval(idleCheck)
    hooks.close()
    mcp.close()
  })
  app.on('window-all-closed', () => app.quit())
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
