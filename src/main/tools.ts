import type { ManageAction } from '../shared/types'

export interface McpServer {
  name: string
  target: string
  health: 'ok' | 'attention' | 'failed'
  status: string
}
export interface Plugin {
  id: string
  version: string
  scope: string
  enabled: boolean
}

const HEALTH = { '✔': 'ok', '!': 'attention', '⚠': 'attention', '✗': 'failed', '✘': 'failed' } as const

/** Lines look like `name: target - ✔ Connected`; anything else (headers, the empty message) is skipped. */
export function parseMcpList(out: string): McpServer[] {
  const servers: McpServer[] = []
  for (const line of out.split('\n')) {
    const m = /^(.+?): (.+) - (✔|!|⚠|✗|✘) ?(.*)$/.exec(line.trim())
    if (m) servers.push({ name: m[1]!, target: m[2]!, health: HEALTH[m[3] as keyof typeof HEALTH], status: m[4]! })
  }
  return servers
}

export function parsePlugins(json: string): Plugin[] {
  try {
    const list = JSON.parse(json) as { id: string; version?: string; scope?: string; enabled?: boolean }[]
    return list.map((p) => ({ id: p.id, version: p.version ?? '', scope: p.scope ?? '', enabled: !!p.enabled }))
  } catch {
    return []
  }
}

const NAME = /^[A-Za-z0-9][\w.@:-]*$/

/** The claude CLI arguments for a management action; anything that could be mistaken for an option is refused. */
export function manageArgs(a: ManageAction): string[] {
  const name = 'name' in a ? a.name : 'id' in a ? a.id : ''
  if (!NAME.test(name)) throw new Error(`"${name}" is not a valid name.`)
  switch (a.kind) {
    case 'mcp-add-http':
      if (!/^https?:\/\/\S+$/.test(a.url)) throw new Error('The address must start with http:// or https://.')
      // Local scope keeps the server to this project instead of every project the user has.
      return ['mcp', 'add', '--scope', 'local', '--transport', 'http', a.name, a.url]
    case 'mcp-add-stdio':
      if (!a.command.trim()) throw new Error('Enter the command that starts the server.')
      return ['mcp', 'add', '--scope', 'local', a.name, '--', a.command.trim(), ...a.args]
    case 'mcp-remove':
      return ['mcp', 'remove', a.name]
    default:
      return ['plugin', a.kind.slice('plugin-'.length), a.id]
  }
}
