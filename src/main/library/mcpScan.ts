import { OFFICE_SERVER, serverFact, type McpServer, type McpWhere, type ServerDef } from '../../shared/mcp'

type Def = ServerDef & { serverUrl?: string; env?: unknown; headers?: unknown; disabled?: unknown }
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** The office's own entries, in agy's list too (each build's data folder has one: agent-world, agent-world-2). */
const OWN = /^agent-world(-[\w-]+)?$/

export interface ScanOptions {
  /** The text of a file, or null when it is not there. */
  read: (file: string) => string | null
  /** Claude's own files of servers: ~/.claude.json, and each account's. */
  claudeFiles: string[]
  /** Every project the app knows: each one's .mcp.json is read. */
  projects: string[]
  agyCli: string
  agyIde: string
}

function json(read: ScanOptions['read'], file: string): Record<string, unknown> | null {
  try {
    const text = read(file)
    const v = text === null ? null : (JSON.parse(text) as unknown)
    return isObj(v) ? v : null
  } catch {
    return null
  }
}

/** The names of what a server is given, never what they hold: a token in `env` or a header stays in the file. */
const names = (d: Def) => [d.env, d.headers].flatMap((m) => (isObj(m) ? Object.keys(m) : []))

function list(src: unknown, where: McpWhere, path: string, readOnly: boolean, project?: string): McpServer[] {
  // Claude Code's own files and agy's CLI list can be changed from the screen; plugins and the IDE's list cannot.
  const editable = where === 'global' || where === 'project' || where === 'agy-cli'
  if (!isObj(src)) return []
  return Object.entries(src).flatMap(([name, def]): McpServer[] => {
    if (!isObj(def) || OWN.test(name)) return []
    const d = def as Def
    const url = typeof d.url === 'string' ? d.url : typeof d.serverUrl === 'string' ? d.serverUrl : undefined
    const transport = d.type === 'http' || d.type === 'sse' ? d.type : url ? 'http' : 'stdio'
    return [{ id: `${where}:${project ?? ''}:${path}:${name}`, name, transport, fact: serverFact({ ...d, ...(url && { url }) }), env: names(d), where, path, ...(project && { project }), readOnly, ...(editable && { editable: true }), ...(d.disabled === true && { disabled: true }) }]
  })
}

/** Every MCP server on this computer, as the programs' own files list them. Only reads: nothing in those files is changed. */
export function scanMcp(o: ScanOptions): McpServer[] {
  const out: McpServer[] = [{ id: `office:::${OFFICE_SERVER}`, name: OFFICE_SERVER, transport: 'http', fact: 'the office, for every agent', env: [], where: 'office', path: '', readOnly: true }]
  for (const f of o.claudeFiles) {
    const c = json(o.read, f)
    if (!c) continue
    out.push(...list(c.mcpServers, 'global', f, false))
    if (isObj(c.projects)) for (const [p, v] of Object.entries(c.projects)) if (isObj(v)) out.push(...list(v.mcpServers, 'project', f, false, p))
  }
  for (const p of o.projects) {
    const file = `${p.replace(/\/+$/, '')}/.mcp.json`
    out.push(...list(json(o.read, file)?.mcpServers, 'project', file, false, p))
  }
  out.push(...list(json(o.read, o.agyCli)?.mcpServers, 'agy-cli', o.agyCli, true), ...list(json(o.read, o.agyIde)?.mcpServers, 'agy-ide', o.agyIde, true))
  const seen = new Set<string>()
  return out.filter((s) => !seen.has(s.id) && !!seen.add(s.id))
}
