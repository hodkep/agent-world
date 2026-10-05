import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Provider } from '../ports'
import { claudeScreen } from './screen'
import { claudeTranscript } from './transcript'
import { startHookServer } from './hookServer'
import { agentEnv, hookSettings, launchArgs, mcpConfig } from './launch'

export const claude: Provider = {
  id: 'claude',
  label: 'Claude Code',
  bin: 'claude',
  capabilities: { permissionsInWorld: true, liveModeSwitch: true, subagents: true, rewind: true, compact: true, limits: true, tools: true },
  async detect(bin, run) {
    try {
      const out = await (run ?? defaultRun)(bin, ['--version'])
      const version = /\d+\.\d+\.\d+/.exec(out)?.[0]
      return { state: 'ready', version, path: bin }
    } catch {
      return { state: 'not-installed', hint: 'Install Claude Code, or set where it is in Settings.' }
    }
  },
  transcript: claudeTranscript,
  screen: claudeScreen,
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
  args: (i) => launchArgs({ ...i.agent, ...i.files, permissionMode: i.permissionMode, options: i.options, houseRules: i.houseRules, addDirs: i.addDirs })
}

const defaultRun = (file: string, args: string[]) =>
  new Promise<string>((resolve, reject) => execFile(file, args, { timeout: 10_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))))
