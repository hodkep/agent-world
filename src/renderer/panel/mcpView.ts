import { AGY_TOOLS, CLAUDE_TOOLS, mcpKey, type CallCount, type McpServer, type Policy, type ProbeResult, type ProbeTool, type ToolUsage } from '../../shared/mcp'

/** How a server's row reads: the office's own cannot be turned off, a list the app only reads cannot be switched, and a server its own file switched off stays off. */
export type RowState = 'locked' | 'readonly' | 'ownoff' | 'on' | 'off'
export const rowState = (s: McpServer, off: string[]): RowState => (s.where === 'office' ? 'locked' : s.readOnly ? 'readonly' : s.disabled ? 'ownoff' : off.includes(s.name) ? 'off' : 'on')

/** Where else the same server name is listed, so the reader can say whether agy has it too. */
export const alsoIn = (s: McpServer, all: McpServer[]) => ({
  agyCli: all.some((x) => x.where === 'agy-cli' && x.name === s.name),
  agyIde: all.some((x) => x.where === 'agy-ide' && x.name === s.name)
})

/** A server's calls in 30 days, by the name Claude agents call it under; null for agy's own lists, whose calls are not counted. */
export const callsOf = (s: McpServer, usage: ToolUsage): number | null => (s.where === 'agy-cli' || s.where === 'agy-ide' ? null : (usage.servers[mcpKey(s.name)]?.n ?? 0))

/** Servers a switch can reach that nobody called in the last 30 days: where Usage offers to turn them off. */
export const unusedServers = (servers: McpServer[], off: string[], usage: ToolUsage) => servers.filter((s) => rowState(s, off) === 'on' && !usage.servers[mcpKey(s.name)]?.n)

/** What a server's status says on its row. */
export function statusOf(p: ProbeResult | undefined, busy: boolean): { word: string; tone: '' | 'ok' | 'bad' | 'warn' } {
  if (busy) return { word: 'Connecting…', tone: '' }
  if (!p) return { word: 'Not connected', tone: '' }
  if (p.status === 'connected') return { word: `Connected · ${p.tools.length} ${p.tools.length === 1 ? 'tool' : 'tools'}`, tone: 'ok' }
  if (p.status === 'signin') return { word: 'Needs sign-in', tone: 'warn' }
  if (p.status === 'timeout') return { word: 'Timed out', tone: 'warn' }
  return { word: 'Failed', tone: 'bad' }
}

/** The tools each connected server listed, by the server's name: what Connect found, for the Tools tab to list before any is used. */
export function foundTools(servers: McpServer[], probes: Record<string, ProbeResult>): Record<string, ProbeTool[]> {
  const out: Record<string, ProbeTool[]> = {}
  for (const s of servers) {
    const p = probes[s.id]
    // Under the name Claude Code writes into a tool's name, so a rule or a count on one of its tools matches.
    if (p?.status === 'connected' && !out[mcpKey(s.name)]) out[mcpKey(s.name)] = p.tools
  }
  return out
}

export interface ToolRow {
  key: string
  name: string
  fact: string
  /** Who the tool belongs to: a program's own, or an MCP server's. */
  group: string
  /** Claude's own tools, agy's, or an MCP server's. */
  owner: 'claude' | 'agy' | 'mcp'
  n: number
  policy: Policy | undefined
  /** What Connect found about it, for an MCP tool. */
  found?: ProbeTool
}
export interface ToolGroup {
  key: string
  title: string
  path: string
  rows: ToolRow[]
}

/** The tools as panels: Claude Code's own, agy's own, then each MCP server's, as many of them as calls have been seen (starting a server to ask it is not done). */
export function toolGroups(policy: Record<string, Policy>, usage: ToolUsage, find = '', found: Record<string, ProbeTool[]> = {}): ToolGroup[] {
  const q = find.trim().toLowerCase()
  const row = (name: string, fact: string, group: string, owner: ToolRow['owner'], key = name): ToolRow => ({ key, name, fact, group, owner, n: usage.tools[key]?.n ?? 0, policy: policy[key] })
  const own = (title: string, path: string, owner: 'claude' | 'agy', list: { name: string; fact: string }[]): ToolGroup => ({ key: owner, title, path, rows: list.map((t) => row(t.name, t.fact, title, owner)) })
  const mcp = new Map<string, ToolRow[]>()
  const seen = new Set<string>()
  const add = (server: string, r: ToolRow) => (seen.add(r.key), mcp.set(server, [...(mcp.get(server) ?? []), r]))
  // What a connection found comes first: it has the tool's own words. A tool only seen in use has its name.
  for (const [server, tools] of Object.entries(found)) for (const t of tools) add(server, { ...row(t.name.replaceAll('_', ' '), t.description.split('\n')[0] || 'MCP tool', server, 'mcp', `mcp__${server}__${mcpKey(t.name)}`), found: t })
  for (const full of Object.keys(usage.tools)) {
    const m = /^mcp__(.+?)__(.+)$/.exec(full)
    if (m && !seen.has(full)) add(m[1]!, row(m[2]!.replaceAll('_', ' '), 'MCP tool', m[1]!, 'mcp', full))
  }
  const groups: ToolGroup[] = [
    own('Claude Code', 'built in', 'claude', CLAUDE_TOOLS),
    own('agy', 'built in', 'agy', AGY_TOOLS),
    ...[...mcp].sort(([a], [b]) => a.localeCompare(b)).map(([server, rows]): ToolGroup => ({ key: `mcp:${server}`, title: server, path: found[server] ? 'MCP · from its connection' : 'MCP · seen in use', rows: rows.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)) }))
  ]
  return groups.map((g) => ({ ...g, rows: g.rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.fact.includes(q)) })).filter((g) => g.rows.length)
}

const plain = (tool: string) => tool.replace(/^mcp__(.+?)__/, '$1 · ')

/** Servers or tools by how often they were called, most first. */
export const ranked = (m: Record<string, CallCount>): [string, CallCount][] => Object.entries(m).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))

/** Calls in each of the 30 days across every tool, today last. */
export const totalDays = (usage: ToolUsage): number[] => Object.values(usage.tools).reduce((all, c) => all.map((v, i) => v + (c.days[i] ?? 0)), Array<number>(30).fill(0))

/** Each project with the calls made in it and the tools most called there. */
export function byProjectCalls(usage: ToolUsage): { name: string; n: number; top: string[] }[] {
  const out = new Map<string, { n: number; tools: [string, number][] }>()
  for (const [tool, c] of Object.entries(usage.tools)) for (const [p, n] of Object.entries(c.projects)) {
    const e = out.get(p) ?? { n: 0, tools: [] }
    e.n += n
    e.tools.push([tool, n])
    out.set(p, e)
  }
  return [...out].map(([name, e]) => ({ name, n: e.n, top: e.tools.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => plain(t)) })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
}

/** Each agent with the calls it made and the tools it called most. */
export function byAgentCalls(usage: ToolUsage): { id: string; name: string; n: number; top: string[] }[] {
  const out = new Map<string, { name: string; n: number; tools: [string, number][] }>()
  for (const [tool, c] of Object.entries(usage.tools)) for (const [id, a] of Object.entries(c.agents)) {
    const e = out.get(id) ?? { name: a.name, n: 0, tools: [] }
    e.n += a.n
    e.tools.push([tool, a.n])
    out.set(id, e)
  }
  return [...out].map(([id, e]) => ({ id, name: e.name, n: e.n, top: e.tools.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => plain(t)) })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
}
