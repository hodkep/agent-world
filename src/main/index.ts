import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import * as pty from 'node-pty'
import type { RemoveResult } from '../shared/api'
import type { AgentEvent, AgentRecord, Decision } from '../shared/types'
import { agentEnv, hookSettings, launchArgs, mcpConfig } from './claude'
import { Mailbox } from './mailbox'
import { startMcpServer } from './mcpServer'
import { answerTrust, inputReady, trustPrompt } from './prompts'
import { Screen } from './screen'
import { startHookServer } from './hookServer'
import { loadAgents, saveAgents } from './store'
import { DirtyWorktreeError, createWorktree, isGitRepo, removeWorktree } from './worktree'

const HOME = process.env.AW_HOME ?? join(homedir(), '.agent-world')
const AGENTS_FILE = join(HOME, 'agents.json')
const SETTINGS_FILE = join(HOME, 'hook-settings.json')
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
const lastActivity = new Map<string, string>()
// Set once the local servers are up; every spawned agent gets its own MCP identity file.
let office: { mcpUrl: string; token: string } | null = null
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

function mcpFileFor(a: AgentRecord) {
  if (!office) return undefined
  const file = join(HOME, 'mcp', `${a.id}.json`)
  mkdirSync(join(HOME, 'mcp'), { recursive: true })
  writeFileSync(file, JSON.stringify(mcpConfig({ url: office.mcpUrl, token: office.token, agentId: a.id })), { mode: 0o600 })
  return file
}

// Hook events tell the mailbox when each agent can take a new prompt.
function trackTurns(e: AgentEvent) {
  const a = agents.find((x) => x.sessionId === e.sessionId)
  if (!a) return
  if (e.type === 'session-start') mailbox.ready(a.id)
  else if (e.type === 'session-end') mailbox.gone(a.id)
  else if (e.type === 'activity' && !e.subagentId) {
    lastActivity.set(a.id, e.activity)
    if (e.activity === 'idle' || e.activity === 'waiting') mailbox.turnEnded(a.id)
    else mailbox.busy(a.id)
  }
}

function spawn(a: AgentRecord, env: NodeJS.ProcessEnv) {
  if (sessions.has(a.id)) return
  const args = launchArgs({ ...a, settingsFile: SETTINGS_FILE, mcpFile: mcpFileFor(a), permissionMode: PERMISSION_MODE })
  const p = pty.spawn(CLAUDE_BIN, args, { name: 'xterm-256color', cols: COLS, rows: ROWS, cwd: a.cwd, env })
  screens.get(a.id)?.dispose()
  const screen = new Screen(COLS, ROWS)
  screens.set(a.id, screen)
  sessions.set(a.id, p)
  if (!a.started) {
    a.started = true
    persist()
  }
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
      } else if (!trust && trustOpen.delete(a.id)) send('trust-prompt', a.id, null)
    })
  })
  p.onExit(() => {
    sessions.delete(a.id)
    screens.get(a.id)?.dispose()
    screens.delete(a.id)
    mailbox.gone(a.id)
    lastActivity.delete(a.id)
    if (trustOpen.delete(a.id)) send('trust-prompt', a.id, null)
    send('pty-exit', a.id)
    send('agent-event', { type: 'session-end', sessionId: a.sessionId })
  })
}

async function main() {
  await app.whenReady()
  mkdirSync(HOME, { recursive: true })
  agents = loadAgents(AGENTS_FILE)
  const env = { ...agentEnv(process.env), PATH: loginShellPath() }

  const token = randomBytes(24).toString('hex')
  const hooks = await startHookServer({
    token,
    permissionTimeoutMs: PERMISSION_TIMEOUT_SEC * 1000,
    onEvent: (e) => {
      trackTurns(e)
      send('agent-event', e)
    },
    onPermission: (r) => send('permission', r),
    onPermissionSettled: (id) => send('permission-settled', id)
  })
  const mcp = await startMcpServer({
    token,
    listAgents: (caller) =>
      agents.map((a) => ({ name: a.name, activity: sessions.has(a.id) ? (lastActivity.get(a.id) ?? 'idle') : 'offline', branch: a.branch, you: a.id === caller })),
    send: (from, to, message, expectsReply) => mailbox.send(from, to, message, { expectsReply })
  })
  office = { mcpUrl: mcp.url, token }
  // Token rotates every launch; the file is only readable by this user.
  writeFileSync(SETTINGS_FILE, JSON.stringify(hookSettings({ url: hooks.url, token, permissionTimeoutSec: PERMISSION_TIMEOUT_SEC })), { mode: 0o600 })

  ipcMain.handle('pick-folder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle('list-agents', () => agents)
  ipcMain.handle('add-agent', async (_, folder: string) => {
    const name = nextName()
    const wt = (await isGitRepo(folder)) ? await createWorktree({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') }) : null
    const a: AgentRecord = { id: randomUUID(), name, sessionId: randomUUID(), repoPath: folder, cwd: wt?.path ?? folder, branch: wt?.branch ?? null, started: false }
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
  ipcMain.handle('pty-buffer', (_, id: string) => buffers.get(id) ?? { text: '', end: 0 })
  ipcMain.on('pty-write', (_, id: string, data: string) => sessions.get(id)?.write(data))
  ipcMain.on('pty-resize', (_, id: string, cols: number, rows: number) => {
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
