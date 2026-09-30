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
