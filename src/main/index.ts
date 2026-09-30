import { execFile, execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, Notification, app, dialog, ipcMain, powerSaveBlocker } from 'electron'
import * as pty from 'node-pty'
import type { RemoveResult } from '../shared/api'
import type { Activity, AgentEvent, AgentOptions, AgentRecord, AgentStats, Decision, Question, QuestionAnswer } from '../shared/types'
import { type Alert, budgetAlert, finishedTurn, shouldNotify } from './attention'
import { agentEnv, hookSettings, launchArgs, mcpConfig } from './claude'
import { commandLine, listCommands } from './commands'
import { parseMcpList, parsePlugins } from './tools'
import { listSessions, projectSlug } from './history'
import { checkName, cleanName } from './names'
import { Mailbox } from './mailbox'
import { startMcpServer } from './mcpServer'
import { driveAnswers, parseAsk } from './askMenu'
import { answerMenu, answerTrust, anyMenu, inputReady, planMenu, trustPrompt } from './prompts'
import { Screen } from './screen'
import { startHookServer } from './hookServer'
import { loadAgents, saveAgents } from './store'
import { changes, commitAll, createPr, discardFile, listFiles, mergeInto, originalContent, pushBranch, readWorktreeFile, writeWorktreeFile } from './gitops'
import { DirtyWorktreeError, createWorktree, git, isGitRepo, removeWorktree, slug as repoSlug } from './worktree'

const HOME = process.env.AW_HOME ?? join(homedir(), '.agent-world')
const AGENTS_FILE = join(HOME, 'agents.json')
const CLAUDE_PROJECTS = process.env.AW_CLAUDE_PROJECTS ?? join(homedir(), '.claude', 'projects')
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
const planOpen = new Set<string>()
// When the terminal last drew anything: Claude's spinner redraws constantly while it works.
const lastOutput = new Map<string, number>()
// Agents whose terminal showed a menu while a permission card was open for them.
const menuSeen = new Set<string>()
const QUIET_MS = 3000
const MENU_RETRY_MS = 1000
const MENU_RETRIES = 60
const screens = new Map<string, Screen>()
const lastActivity = new Map<string, Activity>()
const lastCost = new Map<string, number>()
const pendingPermissions = new Set<string>()
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
  app.setBadgeCount(pendingPermissions.size + trustOpen.size + planOpen.size + questionOpen.size)
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
    lastOutput.set(a.id, Date.now())
    void screen.write(d).then(() => {
      const text = screen.text()
      // A permission answered in the terminal: its menu was up while our card was open, and now it is gone.
      if (hooksRef?.hasPending(a.id)) {
        if (anyMenu(text)) menuSeen.add(a.id)
        else if (menuSeen.delete(a.id)) hooksRef.dismiss(a.id)
      } else menuSeen.delete(a.id)
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
  hooksRef = hooks
  // Mail waiting for an agent that looks idle (input box, no menu, quiet screen) but never sent Stop, e.g. after Esc.
  const idleCheck = setInterval(() => {
    for (const a of agents) {
      if (!mailbox.pending(a.id) || !sessions.has(a.id)) continue
      const text = screens.get(a.id)?.text() ?? ''
      if (Date.now() - (lastOutput.get(a.id) ?? 0) > QUIET_MS && inputReady(text) && !anyMenu(text)) mailbox.looksIdle(a.id)
    }
  }, 1000)
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
  // A reloaded window asks again while sessions are still running, so it must learn who is at work, not assume everyone left.
  ipcMain.handle('list-agents', () => agents.map((a) => ({ ...a, online: sessions.has(a.id), activity: lastActivity.get(a.id) })))
  ipcMain.handle('add-agent', async (_, folder: string, options: AgentOptions = {}, wanted?: string) => {
    const name = cleanName(wanted ?? '') ? checkName(wanted!, agents.map((a) => a.name)) : nextName()
    const wt = (await isGitRepo(folder)) ? await createWorktree({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') }) : null
    const a: AgentRecord = { id: randomUUID(), name, sessionId: randomUUID(), repoPath: folder, cwd: wt?.path ?? folder, branch: wt?.branch ?? null, base: wt?.base ?? null, started: false, options }
    agents.push(a)
    persist()
    spawn(a, env)
    return a
  })
  // What this agent's Claude can reach: MCP servers (health-checked by Claude itself) and plugins, as seen from its folder.
  ipcMain.handle('list-tools', async (_, id: string) => {
    const a = byId(id)
    if (!a) throw new Error('Unknown agent.')
    const claude = (...args: string[]) =>
      new Promise<string>((resolve) => execFile(CLAUDE_BIN, args, { cwd: a.cwd, env, timeout: 45_000, maxBuffer: 8 * 1024 * 1024 }, (_err, stdout) => resolve(stdout)))
    const [mcp, plugins] = await Promise.all([claude('mcp', 'list'), claude('plugin', 'list', '--json')])
    return { mcp: parseMcpList(mcp), plugins: parsePlugins(plugins) }
  })
  // Sessions Claude saved for this folder, including the ones our agents ran in worktrees of it.
  ipcMain.handle('list-history', (_, folder: string) => {
    const own = agents.map((a) => a.sessionId)
    const wtPrefix = projectSlug(join(HOME, 'worktrees', repoSlug(folder))) + '-'
    let all: string[] = []
    try {
      all = readdirSync(CLAUDE_PROJECTS)
    } catch {
      /* no Claude history yet */
    }
    const slugs = [projectSlug(realpathSync(folder)), ...all.filter((d) => d.startsWith(wtPrefix))]
    return listSessions(CLAUDE_PROJECTS, slugs).map((s) => ({ ...s, inUse: own.includes(s.id) }))
  })
  ipcMain.handle('resume-session', async (_, folder: string, sessionId: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error('That is not a session id.')
    const busy = agents.find((a) => a.sessionId === sessionId)
    if (busy) throw new Error(`${busy.name} is already running that session.`)
    const name = nextName()
    const wt = (await isGitRepo(folder)) ? await createWorktree({ repoPath: folder, name, rootDir: join(HOME, 'worktrees') }) : null
    const a: AgentRecord = { id: randomUUID(), name, sessionId, repoPath: folder, cwd: wt?.path ?? folder, branch: wt?.branch ?? null, base: wt?.base ?? null, started: true }
    agents.push(a)
    persist()
    spawn(a, env)
    return a
  })
  // A clone gets a worktree branched from the original's branch and forks its conversation, so both carry on separately.
  ipcMain.handle('clone-agent', async (_, id: string) => {
    const src = byId(id)
    if (!src) throw new Error('Unknown agent.')
    if (!src.started) throw new Error(`${src.name} has not started a conversation yet, so there is nothing to copy.`)
    const name = nextName()
    const wt = src.branch ? await createWorktree({ repoPath: src.repoPath, name, rootDir: join(HOME, 'worktrees'), from: src.branch }) : null
    const a: AgentRecord = {
      id: randomUUID(), name, sessionId: randomUUID(), forkOf: src.sessionId, repoPath: src.repoPath,
      cwd: wt?.path ?? src.cwd, branch: wt?.branch ?? null, base: wt ? (src.base ?? wt.base) : null, started: false, options: src.options
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
