/** Where an MCP server is listed: the office's own, everywhere for Claude, one project's, a plugin's, agy's CLI list, agy's IDE list. */
export type McpWhere = 'office' | 'global' | 'project' | 'plugin' | 'agy-cli' | 'agy-ide'

/** One server as a program's own file lists it. What it holds in `env` and its headers is never here, only the names. */
export interface McpServer {
  id: string
  name: string
  transport: 'stdio' | 'http' | 'sse'
  /** One line about it: the command, or the host. */
  fact: string
  /** The names of its environment variables and headers, never what they hold. */
  env: string[]
  where: McpWhere
  /** The file it was read from. */
  path: string
  project?: string
  /** The app cannot switch it (a plugin's, agy's IDE's). */
  readOnly: boolean
  /** Its own file says it is off. */
  disabled?: boolean
  /** Its entry can be changed or removed from the screen (Claude Code's own files and agy's CLI list). */
  editable?: boolean
}

export type Policy = 'allow' | 'ask' | 'deny'
export type Policies = Record<string, Policy | undefined>

/**
 * A server listed in a project's .mcp.json comes with the project, not from the person: starting it runs whatever command the project ships. Claude Code asks before it trusts such
 * a server, and so does the app: it is left out of Connect all, and connecting one shows the command first.
 */
export const needsConfirm = (s: { path: string }) => s.path.endsWith('.mcp.json')

/** The office's own server: agents need it to reach the office at all. */
export const OFFICE_SERVER = 'agent-world'

export interface ServerDef {
  type?: string
  command?: string
  args?: unknown
  url?: string
}

/** One line about a server: the command and its first arguments, or the host of its address (never a query or credentials). */
export function serverFact(d: ServerDef): string {
  if (typeof d.url === 'string') {
    try {
      return new URL(d.url).host
    } catch {
      return ''
    }
  }
  if (typeof d.command !== 'string' || !d.command) return ''
  const args = Array.isArray(d.args) ? d.args.filter((a): a is string => typeof a === 'string') : []
  return [d.command, ...args.slice(0, 3)].join(' ') + (args.length > 3 ? ' …' : '')
}

const NAME = /^[A-Za-z][\w.-]*$/
const SERVER = /^[\w.-]+$/

/**
 * The permission rules written into each Claude agent's own settings file: a deny for every server that is off, and each tool under its
 * policy. A tool with no policy has no rule, so what Claude does by its permission mode stays. A name that is not a plain tool or server name is left out,
 * so a hand-edited file cannot add a rule with an argument pattern.
 */
export function claudeRules(policy: Policies, off: string[]): { allow: string[]; ask: string[]; deny: string[] } {
  const out = { allow: [] as string[], ask: [] as string[], deny: [] as string[] }
  for (const s of off) if (SERVER.test(s) && s !== OFFICE_SERVER) out.deny.push(`mcp__${s}`)
  for (const [tool, p] of Object.entries(policy)) if (p && NAME.test(tool)) out[p].push(tool)
  return out
}

/** agy's hook can only say no: a tool is stopped when its policy is Deny. */
export const agyDenies = (policy: Policies, tool: string) => Object.hasOwn(policy, tool) && policy[tool] === 'deny'

export interface McpGroup {
  key: string
  title: string
  path: string
  rows: McpServer[]
}

const TITLE: Record<Exclude<McpWhere, 'project'>, [string, string]> = {
  office: ['Agent World', 'the office · every agent'],
  global: ['Everywhere', 'Claude Code’s own file'],
  plugin: ['Plugins', 'read only · managed by Claude'],
  'agy-cli': ['agy CLI', 'agy’s list the app keeps its own entry in'],
  'agy-ide': ['agy IDE', 'read only · the IDE’s own list']
}
const ORDER: McpWhere[] = ['office', 'global', 'project', 'plugin', 'agy-cli', 'agy-ide']
const base = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p

/** The servers as panels, in the order the Skills screen has its places: the office, everywhere, each project, plugins, then agy's two lists. */
export function groupServers(list: McpServer[]): McpGroup[] {
  const groups = new Map<string, McpGroup>()
  for (const s of list) {
    const key = s.where === 'project' ? `project:${s.project ?? ''}` : s.where
    const g = groups.get(key) ?? { key, title: s.where === 'project' ? base(s.project ?? '') : TITLE[s.where][0], path: s.where === 'project' ? (s.project ?? '') : TITLE[s.where][1], rows: [] }
    g.rows.push(s)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => ORDER.indexOf(a.key.split(':')[0] as McpWhere) - ORDER.indexOf(b.key.split(':')[0] as McpWhere) || a.title.localeCompare(b.title))
}

/** One tool call as the office noted it: names only, never what was asked of the tool. */
export interface ToolCallNote {
  t: number
  agent: string
  project: string
  provider: string
  tool: string
}
export interface CallCount {
  n: number
  last: number
  projects: Record<string, number>
  /** Calls in each of the last 30 days, today last. */
  days: number[]
  /** Who made them, by agent id. */
  agents: Record<string, { name: string; n: number }>
}

const DAY = 86_400_000
/** Calls in the last 30 days, by tool and by MCP server (a call to `mcp__server__tool` counts for both). */
export function toolUsage(notes: ToolCallNote[], now: number, names: Record<string, string> = {}): { tools: Record<string, CallCount>; servers: Record<string, CallCount> } {
  const tools: Record<string, CallCount> = {}
  const servers: Record<string, CallCount> = {}
  const bump = (m: Record<string, CallCount>, key: string, n: ToolCallNote) => {
    const c = (m[key] ??= { n: 0, last: 0, projects: {}, days: Array<number>(30).fill(0), agents: {} })
    c.n++
    c.last = Math.max(c.last, n.t)
    c.projects[n.project] = (c.projects[n.project] ?? 0) + 1
    // A day is the 24 hours before now, the last being the most recent.
    c.days[Math.min(29, Math.max(0, 29 - Math.floor((now - n.t) / DAY)))]!++
    const a = (c.agents[n.agent] ??= { name: names[n.agent] ?? 'removed agent', n: 0 })
    a.n++
  }
  for (const n of notes) {
    if (n.t < now - 30 * DAY) continue
    bump(tools, n.tool, n)
    const m = /^mcp__(.+?)__.+$/.exec(n.tool)
    if (m) bump(servers, m[1]!, n)
  }
  return { tools, servers }
}

export interface OwnTool {
  name: string
  fact: string
}
/** Claude Code's own tools, as the chat already knows them. */
export const CLAUDE_TOOLS: OwnTool[] = [
  { name: 'Read', fact: 'reads a file' },
  { name: 'Grep', fact: 'searches file contents' },
  { name: 'Glob', fact: 'finds files by name' },
  { name: 'Edit', fact: 'changes a file' },
  { name: 'Write', fact: 'writes a whole file' },
  { name: 'NotebookEdit', fact: 'changes a notebook' },
  { name: 'Bash', fact: 'runs a shell command' },
  { name: 'WebFetch', fact: 'reads a web page' },
  { name: 'WebSearch', fact: 'searches the web' },
  { name: 'Agent', fact: 'starts a subagent' }
]
/** agy's own tools, as the table that draws its calls in the chat names them (providers/agy/toolTable.ts). */
export const AGY_TOOLS: OwnTool[] = [
  { name: 'view_file', fact: 'reads a file' },
  { name: 'view_file_outline', fact: 'reads a file’s outline' },
  { name: 'read_file', fact: 'reads a file' },
  { name: 'grep_search', fact: 'searches file contents' },
  { name: 'find_by_name', fact: 'finds files by name' },
  { name: 'list_dir', fact: 'lists a folder' },
  { name: 'write_to_file', fact: 'writes a whole file' },
  { name: 'write_file', fact: 'writes a whole file' },
  { name: 'replace_file_content', fact: 'changes a file' },
  { name: 'multi_replace_file_content', fact: 'changes a file in several places' },
  { name: 'run_command', fact: 'runs a shell command' },
  { name: 'read_url_content', fact: 'reads a web page' },
  { name: 'search_web', fact: 'searches the web' }
]

/** What the Playbook and tools window asks the office for: the servers the programs' own files list, which are off, and what each tool is told. */
export interface McpReport {
  servers: McpServer[]
  off: string[]
  policy: Record<string, Policy>
  /** What the last connection to each server found, by the server's id. */
  probes: Record<string, ProbeResult>
}
export type ToolUsage = ReturnType<typeof toolUsage>

/** What connecting to a server found. A tool's text is the server's own, so it is shown as plain text and never given to an agent. */
export interface ProbeTool {
  name: string
  description: string
  /** The parameters: name, type as the schema says it, and whether it is required. */
  params: { name: string; type: string; required: boolean }[]
  /** The server's own hints about the tool, when it gives them. */
  readOnly?: boolean
  destructive?: boolean
}
export interface ProbeResult {
  status: 'connected' | 'failed' | 'signin' | 'timeout'
  /** Why it failed, in a line. */
  message?: string
  server?: { name: string; version: string }
  tools: ProbeTool[]
  ms: number
  at: number
}
