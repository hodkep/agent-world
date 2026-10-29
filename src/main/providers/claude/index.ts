import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Provider } from '../ports'
import { MODES } from '../../../shared/modes'
import { claudeCommands } from './commands'
import { claudeKeys } from './keys'
import { claudeScreen } from './screen'
import { claudeTranscript } from './transcript'
import { manageArgs, parseMcpList, parsePlugins } from './tools'
import { startHookServer } from './hookServer'
import { claudeCalls } from './toolTable'
import { parseClaudeUsage } from './usage'
import { claudeAccounts } from './accounts'
import { agentEnv, curlHeaderConfig, hookSettings, launchArgs, mcpConfig, telemetryEnv } from './launch'
import { detectClaude } from './signin'

export const claude: Provider = {
  id: 'claude',
  label: 'Claude Code',
  bin: 'claude',
  capabilities: { permissionsInWorld: true, liveModeSwitch: true, subagents: true, rewind: true, compact: true, limits: true, accounts: true, liveLimits: true, tools: true, mail: true, clone: true, changeRole: true, chrome: true, budget: true, sideQuestion: true, nativeSkills: true, remote: true },
  // Whether it runs, and whether someone is signed in and its first questions were answered: setup does that in a terminal, so the chat never meets it.
  detect: (bin, run) => detectClaude(bin, { run: run ?? defaultRun }),
  // Its agents report their limits as they go; this asks for them when there is no agent to (the Usage tab and the office tanks).
  accounts: claudeAccounts,
  limits: { read: async (bin, ask = usageRun) => parseClaudeUsage(await ask(bin, ['-p', '/usage'])) },
  // Claude Code's tools already carry the chat's names.
  calls: claudeCalls,
  callSamples: ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent', 'mcp__docs__search'].map((name) => ({ id: 'c', name, args: {} })),
  transcript: claudeTranscript,
  screen: claudeScreen,
  keys: claudeKeys,
  models: [
    { value: '', label: 'Default model' },
    { value: 'opus', label: 'Opus' },
    { value: 'sonnet', label: 'Sonnet' },
    { value: 'haiku', label: 'Haiku' },
    { value: 'fable', label: 'Fable' }
  ],
  modes: MODES,
  rewindConfirms: true,
  handbook: 'CLAUDE.md',
  remoteNote: 'Needs a claude.ai login on this account.',
  liveModes: ['default', 'acceptEdits', 'plan', 'auto'],
  relaunchModes: ['auto', 'dontAsk'],
  hireModes: [] = [
  { value: '', label: "Claude's default", hint: 'Usually auto: a classifier approves safe actions' },
  { value: 'manual', label: 'Ask for everything', hint: 'Every edit, command and fetch waits for your approval' },
  { value: 'acceptEdits', label: 'Accept edits', hint: 'File edits go through; commands still ask' },
  { value: 'plan', label: 'Plan first', hint: 'Reads and plans; asks before changing anything' },
  { value: 'auto', label: 'Auto', hint: 'A classifier reviews each action instead of you' },
  { value: 'dontAsk', label: "Don't ask", hint: 'Only pre-allowed tools run; the rest are denied' }
],
  autonomy: { ask: 'default', edit: 'acceptEdits', plan: 'plan', full: 'auto' },
  commands: claudeCommands,
  tools: {
    list: { servers: ['mcp', 'list'], plugins: ['plugin', 'list', '--json'] },
    parse: (servers, plugins) => ({ mcp: parseMcpList(servers), plugins: parsePlugins(plugins) }),
    manage: manageArgs
  },
  events: { start: startHookServer },
  env: agentEnv,
  prepare(i) {
    mkdirSync(i.dir, { recursive: true })
    const settingsFile = join(i.dir, 'settings.json')
    const mcpFile = join(i.dir, 'mcp.json')
    const headerFile = join(i.dir, 'status-curl.cfg')
    writeFileSync(headerFile, curlHeaderConfig(i.agentToken), { mode: 0o600 })
    writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: i.hookUrl, token: i.agentToken, headerFile, permissionTimeoutSec: i.permissionTimeoutSec, platform: i.platform })), { mode: 0o600 })
    writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: i.mcpUrl, agentToken: i.agentToken })), { mode: 0o600 })
    return { settingsFile, mcpFile, env: telemetryEnv(i.hookUrl, i.agentToken) }
  },
  args: (i) => launchArgs({ ...i.agent, settingsFile: i.files.settingsFile ?? '', mcpFile: i.files.mcpFile, permissionMode: i.permissionMode, options: i.options, houseRules: i.houseRules, addDirs: i.addDirs, pluginDirs: i.pluginDirs, allowTools: i.allowTools })
}

const defaultRun = (file: string, args: string[]) =>
  new Promise<string>((resolve, reject) => execFile(file, args, { timeout: 10_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))))

const usageRun = (file: string, args: string[]) =>
  new Promise<string>((resolve, reject) => execFile(file, args, { timeout: 30_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))))
