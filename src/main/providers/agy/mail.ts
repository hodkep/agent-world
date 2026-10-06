import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import type { MailSetup } from '../ports'
import { BRIDGE_SOURCE } from './bridge'

/** agy has one list of servers for every Agent World on this machine, so each build's data folder names its own entry: ~/.agent-world is `agent-world`, ~/.agent-world-2 is `agent-world-2`. */
export const entryFor = (home: string) => {
  const m = /^\.agent-world(-[\w-]+)?$/.exec(basename(home))
  return `agent-world${m?.[1] ?? ''}`
}

interface Deps {
  /** The app's own folder, where the bridge program is written (asked when used: the app settles its folder at start). */
  home: string | (() => string)
  /** agy's list of MCP servers. */
  config: string
  /** What runs the bridge: the app's own program, started as plain Node. */
  node: string
  run: (bin: string, args: string[]) => Promise<unknown>
}

/** agy has one global list of MCP servers, so reaching the office takes one entry in it: this is that, shown before it is made. */
export function createAgyMail(d: Deps): Required<MailSetup> {
  const home = () => (typeof d.home === 'function' ? d.home() : d.home)
  const bridgeOf = () => join(home(), 'bin', 'aw-mcp-bridge.cjs')
  const add = () => ['mcp', 'add', '--env', 'ELECTRON_RUN_AS_NODE=1', entryFor(home()), '--', d.node, bridgeOf()]
  const stale = () => {
    try {
      const list = (JSON.parse(readFileSync(d.config, 'utf8')) as { mcpServers?: Record<string, { command?: string; disabled?: boolean }> }).mcpServers ?? {}
      // Ours by name; "left behind" is when the program it starts is not there, so agy cannot start the entry and fails at every use.
      return Object.entries(list)
        .filter(([name, e]) => /^agent-world(-[\w-]+)?$/.test(name) && !e.disabled && !!e.command && !existsSync(e.command))
        .map(([name, e]) => ({ name, program: e.command! }))
    } catch {
      return []
    }
  }
  return {
    stale,
    async removeStale(bin, name) {
      if (!stale().some((s) => s.name === name)) throw new Error(`${name} is not one left behind by a removed build.`)
      await d.run(bin, ['mcp', 'remove', name])
    },
    status() {
      const bridge = bridgeOf()
      const ENTRY = entryFor(home())
      try {
        const e = (JSON.parse(readFileSync(d.config, 'utf8')) as { mcpServers?: Record<string, { args?: string[]; disabled?: boolean }> }).mcpServers?.[ENTRY]
        return e && !e.disabled && e.args?.includes(bridge) ? 'connected' : 'missing'
      } catch {
        return 'missing'
      }
    },
    plan: () => ({
      files: [bridgeOf()],
      commands: [`agy ${add().join(' ')}`],
      note: `Adds one entry named ${entryFor(home())} to agy\'s own list of MCP servers (agy writes it, and may tidy that file as it does). Each agent reaches the office with a token of its own. Nothing else of agy is touched, and it can be removed again from here.`
    }),
    async connect(bin) {
      mkdirSync(dirname(bridgeOf()), { recursive: true })
      writeFileSync(bridgeOf(), BRIDGE_SOURCE, { mode: 0o700 })
      await d.run(bin, add())
    },
    async disconnect(bin) {
      await d.run(bin, ['mcp', 'remove', entryFor(home())])
    }
  }
}

const run = (bin: string, args: string[]) => new Promise<void>((resolve, reject) => execFile(bin, args, { timeout: 30_000 }, (err) => (err ? reject(err) : resolve())))

export const agyMail = createAgyMail({
  // The app publishes its data folder (AW_APP_HOME) once it has settled it, so a second build never writes into the first one's.
  home: () => process.env.AW_APP_HOME ?? process.env.AW_HOME ?? join(homedir(), '.agent-world'),
  config: process.env.AW_AGY_CONFIG ?? join(homedir(), '.gemini', 'config', 'mcp_config.json'),
  node: process.execPath,
  run
})
