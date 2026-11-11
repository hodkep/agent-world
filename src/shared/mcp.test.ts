import { describe, expect, it } from 'vitest'
import { agyDenies, claudeRules, groupServers, mcpKey, needsConfirm, serverFact, toolUsage, type McpServer } from './mcp'

const srv = (name: string, where: McpServer['where'], project?: string): McpServer => ({ id: `${where}:${project ?? ''}:${name}`, name, transport: 'stdio', fact: '', env: [], where, path: '/p', ...(project && { project }), readOnly: where === 'agy-ide' || where === 'plugin' })

describe('what an MCP server says about itself', () => {
  it('names a command with its first arguments, and a url by its host, never its query or credentials', () => {
    expect(serverFact({ command: 'npx', args: ['-y', '@supabase/mcp-server'] })).toBe('npx -y @supabase/mcp-server')
    expect(serverFact({ type: 'http', url: 'https://user:pw@mcp.example.com/path?token=abc' })).toBe('mcp.example.com')
    expect(serverFact({ command: 'node', args: ['a', 'b', 'c', 'd', 'e'] })).toBe('node a b c …')
    expect(serverFact({})).toBe('')
  })
})

describe('the rules Claude is given for the agents the app runs', () => {
  it('denies the tools of a server that is off, and puts each tool under its policy', () => {
    const r = claudeRules({ Bash: 'ask', Read: 'allow', WebFetch: 'deny', Edit: undefined }, ['higgsfield'])
    expect(r.deny).toEqual(['mcp__higgsfield', 'WebFetch'])
    expect(r.allow).toEqual(['Read'])
    expect(r.ask).toEqual(['Bash'])
  })
  it('says nothing for a tool with no policy, so what Claude does by its permission mode is unchanged', () => {
    expect(claudeRules({}, [])).toEqual({ allow: [], ask: [], deny: [] })
  })
  it('leaves out a name that is not a tool name, so a hand-edited file cannot add a rule like Bash(rm -rf *)', () => {
    expect(claudeRules({ 'Bash(rm -rf *)': 'allow', 'mcp__a__b': 'deny' }, ['x y', 'ok-1'])).toEqual({ allow: [], ask: [], deny: ['mcp__ok-1', 'mcp__a__b'] })
  })
  it('never turns off the office\'s own server', () => {
    expect(claudeRules({}, ['agent-world']).deny).toEqual([])
  })
})

describe('what agy is told no to', () => {
  it('denies a tool whose policy is Deny, and only that', () => {
    expect(agyDenies({ run_command: 'deny', view_file: 'allow' }, 'run_command')).toBe(true)
    expect(agyDenies({ run_command: 'deny', view_file: 'allow' }, 'view_file')).toBe(false)
    expect(agyDenies({}, 'run_command')).toBe(false)
  })
})

describe('the servers in groups', () => {
  it('puts the office first, then everywhere, each project, plugins, agy\'s CLI and agy\'s IDE, and the projects in name order', () => {
    const g = groupServers([srv('a', 'agy-ide'), srv('z', 'project', '/w/zeta'), srv('b', 'global'), srv('o', 'office'), srv('c', 'project', '/w/alpha'), srv('p', 'plugin'), srv('d', 'agy-cli')])
    expect(g.map((x) => x.key)).toEqual(['office', 'global', 'project:/w/alpha', 'project:/w/zeta', 'plugin', 'agy-cli', 'agy-ide'])
    expect(g.find((x) => x.key === 'project:/w/alpha')!.title).toBe('alpha')
  })
})

describe('what was used in the last 30 days', () => {
  const day = 86_400_000
  const now = 100 * day
  const ev = [
    { t: now - day, agent: 'a', project: 'checkout', provider: 'claude', tool: 'Bash' },
    { t: now - 2 * day, agent: 'a', project: 'web', provider: 'claude', tool: 'Bash' },
    { t: now - 3 * day, agent: 'b', project: 'checkout', provider: 'claude', tool: 'mcp__supabase__execute_sql' },
    { t: now - 4 * day, agent: 'b', project: 'checkout', provider: 'agy', tool: 'run_command' },
    { t: now - 40 * day, agent: 'a', project: 'web', provider: 'claude', tool: 'Bash' }
  ]
  it('counts calls by tool and by server, with the projects they were in, and leaves out what is older', () => {
    const u = toolUsage(ev, now)
    expect(u.tools.Bash).toMatchObject({ n: 2, projects: { checkout: 1, web: 1 } })
    expect(u.tools['mcp__supabase__execute_sql']!.n).toBe(1)
    expect(u.servers.supabase).toMatchObject({ n: 1, projects: { checkout: 1 } })
    expect(u.tools.run_command!.n).toBe(1)
  })

  it('counts the calls of each of the 30 days, today last, and who made them by name', () => {
    const u = toolUsage(ev, now, { a: 'Ada', b: 'Bo' })
    const bash = u.tools.Bash!
    expect(bash.days).toHaveLength(30)
    expect(bash.days[28]).toBe(1)
    expect(bash.days[27]).toBe(1)
    expect(bash.days[29]).toBe(0)
    expect(bash.days.reduce((n, d) => n + d, 0)).toBe(2)
    expect(bash.agents).toEqual({ a: { name: 'Ada', n: 2 } })
    expect(u.servers.supabase!.agents).toEqual({ b: { name: 'Bo', n: 1 } })
  })
  it('names an agent it was not told about as a removed agent', () => {
    expect(toolUsage(ev, now).tools.Bash!.agents.a!.name).toBe('removed agent')
  })
})

describe('which servers are started only after the person has read the command', () => {
  it('is the ones in a project\'s .mcp.json, which comes with the project, and not the ones in the person\'s own files', () => {
    expect(needsConfirm({ path: '/w/p/.mcp.json' })).toBe(true)
    expect(needsConfirm({ path: '/home/me/.claude.json' })).toBe(false)
    expect(needsConfirm({ path: '/home/me/.gemini/config/mcp_config.json' })).toBe(false)
  })
})

describe('a server\'s name as Claude Code writes it in a tool\'s name', () => {
  it('turns anything outside letters, digits, underscore and dash into an underscore', () => {
    expect(mcpKey('my.server')).toBe('my_server')
    expect(mcpKey('a b/c')).toBe('a_b_c')
    expect(mcpKey('plain-name_1')).toBe('plain-name_1')
  })
  it('denies a server that is off under that name, so the rule matches its tools', () => {
    expect(claudeRules({}, ['my.server', 'plain']).deny).toEqual(['mcp__my_server', 'mcp__plain'])
  })
})
