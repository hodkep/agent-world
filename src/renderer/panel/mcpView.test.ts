import { describe, expect, it } from 'vitest'
import type { McpServer, ToolUsage } from '../../shared/mcp'
import { alsoIn, byAgentCalls, byProjectCalls, foundTools, ranked, totalDays, rowState, statusOf, toolGroups, unusedServers } from './mcpView'

const cc = (n: number, projects: Record<string, number> = {}) => ({ n, last: 1, projects, days: Array<number>(30).fill(0), agents: {} })
const srv = (name: string, over: Partial<McpServer> = {}): McpServer => ({ id: name, name, transport: 'stdio', fact: '', env: [], where: 'global', path: '/p', readOnly: false, ...over })
const none: ToolUsage = { tools: {}, servers: {} }

describe('how a server\'s row reads', () => {
  it('locks the office\'s own, leaves what the app only reads, keeps one its own file switched off, and follows the off list for the rest', () => {
    expect(rowState(srv('agent-world', { where: 'office', readOnly: true }), [])).toBe('locked')
    expect(rowState(srv('a', { where: 'agy-ide', readOnly: true }), [])).toBe('readonly')
    expect(rowState(srv('b', { disabled: true }), [])).toBe('ownoff')
    expect(rowState(srv('c'), ['c'])).toBe('off')
    expect(rowState(srv('d'), ['c'])).toBe('on')
  })
  it('says whether agy lists the same server', () => {
    const all = [srv('supabase'), srv('supabase', { where: 'agy-cli', readOnly: true }), srv('stripe', { where: 'agy-ide', readOnly: true })]
    expect(alsoIn(all[0]!, all)).toEqual({ agyCli: true, agyIde: false })
    expect(alsoIn(srv('stripe'), all)).toEqual({ agyCli: false, agyIde: true })
  })
  it('offers to turn off what is on and has had no call in 30 days, and nothing else', () => {
    const usage: ToolUsage = { tools: {}, servers: { used: cc(3, {}) } }
    const list = [srv('used'), srv('idle'), srv('off'), srv('seen-by-agy', { where: 'agy-cli', readOnly: true })]
    expect(unusedServers(list, ['off'], usage).map((s) => s.name)).toEqual(['idle'])
  })
})

describe('the tools as panels', () => {
  it('lists Claude Code\'s and agy\'s own tools, each with its policy and its calls, and an MCP server\'s tools as they were seen', () => {
    const usage: ToolUsage = { tools: { Bash: cc(7, {}), mcp__supabase__execute_sql: cc(2, {}), mcp__supabase__list_tables: cc(5, {}) }, servers: {} }
    const g = toolGroups({ Bash: 'ask', run_command: 'deny' }, usage)
    expect(g.map((x) => x.key)).toEqual(['claude', 'agy', 'mcp:supabase'])
    expect(g[0]!.rows.find((r) => r.name === 'Bash')).toMatchObject({ n: 7, policy: 'ask', owner: 'claude' })
    expect(g[1]!.rows.find((r) => r.name === 'run_command')!.policy).toBe('deny')
    expect(g[2]!.rows.map((r) => [r.key, r.name])).toEqual([['mcp__supabase__list_tables', 'list tables'], ['mcp__supabase__execute_sql', 'execute sql']])
  })
  it('narrows to the tools a search matches and drops a panel with none', () => {
    expect(toolGroups({}, none, 'bash').map((g) => g.rows.map((r) => r.name))).toEqual([['Bash']])
    expect(toolGroups({}, none, 'zzz')).toEqual([])
  })
  it('leaves a tool with no policy to the agent\'s permission mode', () => {
    expect(toolGroups({}, none)[0]!.rows.every((r) => r.policy === undefined)).toBe(true)
  })
})

describe('what a connection found', () => {
  const probe = (over = {}) => ({ status: 'connected' as const, tools: [{ name: 'list_tables', description: 'Lists tables.\nMore.', params: [], readOnly: true }], ms: 1, at: 1, ...over })
  it('says each status in a word, with the tool count when connected', () => {
    expect(statusOf(undefined, false)).toEqual({ word: 'Not connected', tone: '' })
    expect(statusOf(undefined, true).word).toBe('Connecting…')
    expect(statusOf(probe(), false)).toEqual({ word: 'Connected · 1 tool', tone: 'ok' })
    expect(statusOf(probe({ status: 'failed', tools: [] }), false)).toEqual({ word: 'Failed', tone: 'bad' })
    expect(statusOf(probe({ status: 'signin', tools: [] }), false).word).toBe('Needs sign-in')
    expect(statusOf(probe({ status: 'timeout', tools: [] }), false).word).toBe('Timed out')
  })
  it('lists the tools of the servers that connected, by name', () => {
    const f = foundTools([srv('a'), srv('b')], { a: probe(), b: probe({ status: 'failed', tools: [] }) })
    expect(Object.keys(f)).toEqual(['a'])
  })
  it('puts a found tool on the Tools tab before it has been used, with its own first line, and keeps the calls of one that was', () => {
    const usage: ToolUsage = { tools: { mcp__a__list_tables: cc(4, {}), mcp__a__seen_only: cc(1, {}) }, servers: {} }
    const g = toolGroups({ mcp__a__list_tables: 'deny' }, usage, '', { a: probe().tools })
    const rows = g.find((x) => x.key === 'mcp:a')!.rows
    expect(rows.map((r) => r.key)).toEqual(['mcp__a__list_tables', 'mcp__a__seen_only'])
    expect(rows[0]).toMatchObject({ name: 'list tables', fact: 'Lists tables.', n: 4, policy: 'deny' })
    expect(rows[0]!.found).toBeDefined()
    expect(g.find((x) => x.key === 'mcp:a')!.path).toBe('MCP · from its connection')
  })
})

describe('usage figures for the screen', () => {
  const c = (n: number, projects: Record<string, number>, agents: Record<string, { name: string; n: number }>, days = Array<number>(30).fill(0)) => ({ n, last: 1, projects, days, agents })
  const usage: ToolUsage = {
    tools: {
      Bash: c(5, { web: 4, api: 1 }, { a: { name: 'Ada', n: 5 } }, Array.from({ length: 30 }, (_, i) => (i === 29 ? 5 : 0))),
      mcp__s__q: c(2, { web: 2 }, { a: { name: 'Ada', n: 1 }, b: { name: 'Bo', n: 1 } }, Array.from({ length: 30 }, (_, i) => (i === 28 ? 2 : 0)))
    },
    servers: {}
  }
  it('ranks by calls, most first', () => {
    expect(ranked(usage.tools).map(([k]) => k)).toEqual(['Bash', 'mcp__s__q'])
  })
  it('adds the days of every tool', () => {
    const d = totalDays(usage)
    expect(d).toHaveLength(30)
    expect([d[28], d[29]]).toEqual([2, 5])
  })
  it('totals each project with the tools most called there, an MCP tool by its server', () => {
    expect(byProjectCalls(usage)).toEqual([{ name: 'web', n: 6, top: ['Bash', 's · q'] }, { name: 'api', n: 1, top: ['Bash'] }])
  })
  it('totals each agent with what it called most', () => {
    expect(byAgentCalls(usage).map((a) => [a.name, a.n, a.top])).toEqual([['Ada', 6, ['Bash', 's · q']], ['Bo', 1, ['s · q']]])
  })
})
