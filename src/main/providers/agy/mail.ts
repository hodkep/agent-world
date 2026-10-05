import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import type { MailSetup } from '../ports'
import { BRIDGE_SOURCE } from './bridge'

const ENTRY = 'agent-world'

interface Deps {
  /** The app's own folder, where the bridge program is written. */
  home: string
  /** agy's list of MCP servers. */
  config: string
  /** What runs the bridge: the app's own program, started as plain Node. */
  node: string
  run: (bin: string, args: string[]) => Promise<unknown>
}

/** agy has one global list of MCP servers, so reaching the office takes one entry in it: this is that, shown before it is made. */
export function createAgyMail(d: Deps): MailSetup {
  const bridge = join(d.home, 'bin', 'aw-mcp-bridge.cjs')
  const add = ['mcp', 'add', '--env', 'ELECTRON_RUN_AS_NODE=1', ENTRY, '--', d.node, bridge]
  return {
    status() {
      try {
        const e = (JSON.parse(readFileSync(d.config, 'utf8')) as { mcpServers?: Record<string, { args?: string[]; disabled?: boolean }> }).mcpServers?.[ENTRY]
        return e && !e.disabled && e.args?.includes(bridge) ? 'connected' : 'missing'
      } catch {
        return 'missing'
      }
    },
    plan: () => ({
      files: [bridge],
      commands: [`agy ${add.join(' ')}`],
      note: 'Adds one entry named agent-world to agy\'s own list of MCP servers (agy writes it, and may tidy that file as it does). Each agent reaches the office with a token of its own. Nothing else of agy is touched, and it can be removed again from here.'
    }),
    async connect(bin) {
      mkdirSync(dirname(bridge), { recursive: true })
      writeFileSync(bridge, BRIDGE_SOURCE, { mode: 0o700 })
      await d.run(bin, add)
    },
    async disconnect(bin) {
      await d.run(bin, ['mcp', 'remove', ENTRY])
    }
  }
}

const run = (bin: string, args: string[]) => new Promise<void>((resolve, reject) => execFile(bin, args, { timeout: 30_000 }, (err) => (err ? reject(err) : resolve())))

export const agyMail = createAgyMail({
  home: process.env.AW_HOME ?? join(homedir(), '.agent-world'),
  config: process.env.AW_AGY_CONFIG ?? join(homedir(), '.gemini', 'config', 'mcp_config.json'),
  node: process.execPath,
  run
})
