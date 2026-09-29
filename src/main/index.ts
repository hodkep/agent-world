import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, Notification, app, dialog, ipcMain, powerSaveBlocker } from 'electron'
import * as pty from 'node-pty'
import type { RemoveResult } from '../shared/api'
import type { Activity, AgentEvent, AgentOptions, AgentRecord, AgentStats, Decision } from '../shared/types'
import { type Alert, budgetAlert, finishedTurn, shouldNotify } from './attention'
import { agentEnv, hookSettings, launchArgs, mcpConfig } from './claude'
import { Mailbox } from './mailbox'
import { startMcpServer } from './mcpServer'
import { answerTrust, inputReady, trustPrompt } from './prompts'
import { Screen } from './screen'
import { startHookServer } from './hookServer'
import { loadAgents, saveAgents } from './store'
import { changes, commitAll, createPr, discardFile, listFiles, mergeInto, originalContent, pushBranch, readWorktreeFile, writeWorktreeFile } from './gitops'
import { DirtyWorktreeError, createWorktree, git, isGitRepo, removeWorktree } from './worktree'

const HOME = process.env.AW_HOME ?? join(homedir(), '.agent-world')
const AGENTS_FILE = join(HOME, 'agents.json')
const CLAUDE_BIN = process.env.AW_CLAUDE_BIN ?? 'claude'
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
const buffers = new Map<string, { text: string; end: number }>()
const trustOpen = new Set<string>()
const screens = new Map<string, Screen>()
const lastActivity = new Map<string, Activity>()
const lastCost = new Map<string, number>()
const pendingPermissions = new Set<string>()
// Agents being relaunched in place: their exit is not a departure.
const restarting = new Set<string>()
// Last size the panel gave each terminal, so a relaunch comes back at the size the user sees.
const sizes = new Map<string, { cols: number; rows: number }>()
let awakeBlocker: number | null = null
// Set once the local servers are up; every spawned agent gets its own MCP identity file.
let office: { mcpUrl: string; hookUrl: string } | null = null
// Per-agent MCP tokens, minted at each spawn: the token is the agent's identity on the office server.
const agentTokens = new Map<string, string>()
// Claude needs a moment after SessionStart/Stop before its input box accepts a paste.
const DELIVERY_DELAY_MS = 700
const mailbox = new Mailbox({
  agents: () => agents.map((a) => ({ id: a.id, name: a.name, online: sessions.has(a.id) })),
  deliver: (id, text) =>
    setTimeout(() => {
      const p = sessions.get(id)
      if (!p) return
      // Bracketed paste keeps multi-line messages as one prompt instead of submitting at the first newline.
      p.write(`\x1b[200~${text}\x1b[201~`)
      setTimeout(() => p.write('\r'), 150)
    }, DELIVERY_DELAY_MS),
  notify: (m) => send('agent-message', m)
})
// PTYs exit after the window is gone during quit; messages then have nowhere to go.
const send = (channel: string, ...args: unknown[]) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}
const persist = () => saveAgents(AGENTS_FILE, agents)
const byId = (id: string) => agents.find((a) => a.id === id)

function nextName() {
  const used = new Set(agents.map((a) => a.name))
  for (let n = 1; ; n++) for (const base of NAMES) {
    const name = n === 1 ? base : `${base}${n}`
    if (!used.has(name)) return name
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
  if (!Notification.isSupported() || !shouldNotify(kind, !!win && !win.isDestroyed() && win.isFocused())) return
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
  app.setBadgeCount(pendingPermissions.size + trustOpen.size)
  // Keep the machine awake while any live agent is mid-turn.
  const working = agents.some((a) => sessions.has(a.id) && !['idle', 'waiting', undefined].includes(lastActivity.get(a.id)))
  if (working && awakeBlocker === null) awakeBlocker = powerSaveBlocker.start('prevent-app-suspension')
  else if (!working && awakeBlocker !== null) {
    powerSaveBlocker.stop(awakeBlocker)
    awakeBlocker = null
  }
}

function onStats(s: AgentStats, agentId: string) {
  const a = byId(agentId)
  if (!a) return
  send('agent-stats', a.id, s)
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
  }
  if (e.type === 'session-start') mailbox.ready(a.id)
  else if (e.type === 'activity' && !e.subagentId) {
    // A conversation exists once a turn has begun; only then can a relaunch use --resume.
    if (!a.started) {
      a.started = true
      persist()
    }
    if (finishedTurn(lastActivity.get(a.id), e.activity)) notify('finished', a, e.activity === 'waiting' ? 'Waiting for you.' : 'Finished its turn.')
    lastActivity.set(a.id, e.activity)
    if (e.activity === 'idle' || e.activity === 'waiting') mailbox.turnEnded(a.id)
    else mailbox.busy(a.id)
  }
}

function spawn(a: AgentRecord, env: NodeJS.ProcessEnv) {
  if (sessions.has(a.id)) return
  const args = launchArgs({ ...a, ...agentFiles(a), permissionMode: PERMISSION_MODE, options: a.options })
  const { cols, rows } = sizes.get(a.id) ?? { cols: COLS, rows: ROWS }
  const p = pty.spawn(CLAUDE_BIN, args, { name: 'xterm-256color', cols, rows, cwd: a.cwd, env })
  screens.get(a.id)?.dispose()
  const screen = new Screen(cols, rows)
  screens.set(a.id, screen)
  sessions.set(a.id, p)
  p.onData((d) => {
    const b = buffers.get(a.id) ?? { text: '', end: 0 }
    const next = { text: (b.text + d).slice(-SCROLLBACK), end: b.end + d.length }
    buffers.set(a.id, next)
    send('pty-data', a.id, d, next.end)
    void screen.write(d).then(() => {
      const text = screen.text()
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
    })
  })
  p.onExit(() => {
    sessions.delete(a.id)
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
    send('pty-exit', a.id)
    send('agent-event', { type: 'session-end', agentId: a.id, sessionId: a.sessionId })
  })
}

async function main() {
  await app.whenReady()
  mkdirSync(HOME, { recursive: true })
  agents = loadAgents(AGENTS_FILE)
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
      send('agent-event', e)
    },
    onPermission: (r) => {
      pendingPermissions.add(r.id)
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
  const mcp = await startMcpServer({
    agentForToken: (t) => agentTokens.get(t) ?? null,
    listAgents: (caller) =>
      agents.map((a) => ({ name: a.name, activity: sessions.has(a.id) ? (lastActivity.get(a.id) ?? 'idle') : 'offline', branch: a.branch, you: a.id === caller })),
    send: (from, to, message, expectsReply) => mailbox.send(from, to, message, { expectsReply })
  })
  office = { mcpUrl: mcp.url, hookUrl: hooks.url }

  ipcMain.handle('pick-folder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle('list-agents', () => agents)
  ipcMain.handle('add-agent', async (_, folder: string, options: AgentOptions = {}, wanted?: string) => {
    const clean = wanted?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20)
    if (clean && agents.some((a) => a.name === clean)) throw new Error(`There is already an agent named ${clean}.`)
    const name = clean || nextName()
    const wt = (await isGitRepo(folder)) ? await createWorktree({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') }) : null
    const a: AgentRecord = { id: randomUUID(), name, sessionId: randomUUID(), repoPath: folder, cwd: wt?.path ?? folder, branch: wt?.branch ?? null, base: wt?.base ?? null, started: false, options }
    agents.push(a)
    persist()
    spawn(a, env)
    return a
  })
  ipcMain.handle('wake-agent', (_, id: string) => {
    const a = byId(id)
    if (a) spawn(a, env)
  })
  ipcMain.handle('remove-agent', async (_, id: string, mode?: 'discard' | 'keep-worktree'): Promise<RemoveResult> => {
    const a = byId(id)
    if (!a) return { ok: true }
    sessions.get(id)?.kill()
    if (a.branch && mode !== 'keep-worktree') {
      try {
        await removeWorktree({ repoPath: a.repoPath, path: a.cwd, force: mode === 'discard' })
      } catch (err) {
        if (err instanceof DirtyWorktreeError) return { ok: false, dirty: err.status }
        throw err
      }
    }
    agents = agents.filter((x) => x.id !== id)
    buffers.delete(id)
    persist()
    return { ok: true }
  })
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
  ipcMain.handle('pty-buffer', (_, id: string) => buffers.get(id) ?? { text: '', end: 0 })
  ipcMain.on('pty-write', (_, id: string, data: string) => sessions.get(id)?.write(data))
  ipcMain.on('pty-resize', (_, id: string, cols: number, rows: number) => {
    sizes.set(id, { cols, rows })
    sessions.get(id)?.resize(cols, rows)
    screens.get(id)?.resize(cols, rows)
  })
  ipcMain.on('decide', (_, requestId: string, d: Decision) => hooks.decide(requestId, d))
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
    width: 1440,
    height: 900,
    backgroundColor: '#14121c',
    title: 'Agent World',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  app.on('before-quit', () => {
    for (const p of sessions.values()) p.kill()
    hooks.close()
    mcp.close()
  })
  app.on('window-all-closed', () => app.quit())
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
