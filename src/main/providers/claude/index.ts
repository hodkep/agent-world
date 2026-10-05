import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Provider } from '../ports'
import { MODES } from '../../../shared/modes'
import { claudeKeys } from './keys'
import { claudeScreen } from './screen'
import { claudeTranscript } from './transcript'
import { manageArgs, parseMcpList, parsePlugins } from './tools'
import { startHookServer } from './hookServer'
import { agentEnv, hookSettings, launchArgs, mcpConfig } from './launch'

export const claude: Provider = {
  id: 'claude',
  label: 'Claude Code',
  bin: 'claude',
  capabilities: { permissionsInWorld: true, liveModeSwitch: true, subagents: true, rewind: true, compact: true, limits: true, tools: true, mail: true },
  async detect(bin, run) {
    try {
      const out = await (run ?? defaultRun)(bin, ['--version'])
      const version = /\d+\.\d+\.\d+/.exec(out)?.[0]
      return { state: 'ready', version, path: bin }
    } catch {
      return { state: 'not-installed', hint: 'Not found on your PATH or the usual places. Install it, or set where it is in Settings.', install: 'curl -fsSL https://claude.ai/install.sh | bash' }
    }
  },
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
    writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: i.hookUrl, token: i.agentToken, permissionTimeoutSec: i.permissionTimeoutSec, platform: i.platform })), { mode: 0o600 })
    writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: i.mcpUrl, agentToken: i.agentToken })), { mode: 0o600 })
    return { settingsFile, mcpFile }
  },
  args: (i) => launchArgs({ ...i.agent, settingsFile: i.files.settingsFile ?? '', mcpFile: i.files.mcpFile, permissionMode: i.permissionMode, options: i.options, houseRules: i.houseRules, addDirs: i.addDirs })
}

const defaultRun = (file: string, args: string[]) =>
  new Promise<string>((resolve, reject) => execFile(file, args, { timeout: 10_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))))
