import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTodoService } from './todos/service'
import { startMcpServer } from './mcpServer'

type Server = Awaited<ReturnType<typeof startMcpServer>>
let server: Server | undefined
const clients: Client[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()))
  server?.close()
})

const notes: { caller: string; text: string }[] = []
const sent: { from: string; to: string; message: string; expectsReply: boolean }[] = []

async function setup(library?: Parameters<typeof startMcpServer>[0]['library'], todos?: Parameters<typeof startMcpServer>[0]['todos']) {
  sent.length = 0
  server = await startMcpServer({
    library,
    todos,
    agentForToken: (t) => ({ 'tok-a1': 'a1', 'tok-a2': 'a2' })[t] ?? null,
    listAgents: (caller) => [{ name: 'linus', activity: 'idle', branch: 'aw/linus', you: caller === 'a2' }],
    send: (from, to, message, expectsReply) => {
      if (to === 'nobody') throw new Error('No agent named nobody.')
      sent.push({ from, to, message, expectsReply })
      return 'queued'
    },
    remember: (caller, text) => void notes.push({ caller, text }),
    recall: (_c, q) => notes.filter((n) => n.text.includes(q)).map((n) => ({ text: n.text, by: n.caller, at: 0 }))
  })
  return server
}

async function connect(url: string, agent: string, token = `tok-${agent}`, headers: Record<string, string> = {}) {
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}`, ...headers } } }))
  clients.push(client)
  return client
}

const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]!.text)

describe('agent-world MCP server', () => {
  it('offers list_agents, send_message, remember and recall', async () => {
    const s = await setup()
    const c = await connect(s.url, 'a1')
    const { tools } = await c.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['list_agents', 'recall', 'remember', 'send_message'])
  })

  it('saves a note for the project and finds it again', async () => {
    notes.length = 0
    const s = await setup()
    const c = await connect(s.url, 'a1')
    await c.callTool({ name: 'remember', arguments: { text: 'Tests run with pnpm test' } })
    expect(notes).toEqual([{ caller: 'a1', text: 'Tests run with pnpm test' }])
    const other = await connect(s.url, 'a2')
    expect(text(await other.callTool({ name: 'recall', arguments: { query: 'pnpm' } }))).toContain('Tests run with pnpm test (a1')
    expect(text(await other.callTool({ name: 'recall', arguments: { query: 'nothing-like-this' } }))).toBe('Nothing saved about this yet.')
  })

  it('knows which agent is calling', async () => {
    const s = await setup()
    const c = await connect(s.url, 'a1')
    await c.callTool({ name: 'send_message', arguments: { to: 'linus', message: 'hello' } })
    await c.callTool({ name: 'send_message', arguments: { to: 'linus', message: 'thanks', expects_reply: false } })
    expect(sent).toEqual([
      { from: 'a1', to: 'linus', message: 'hello', expectsReply: true },
      { from: 'a1', to: 'linus', message: 'thanks', expectsReply: false }
    ])
  })

  it('tells the sender whether the message was delivered or is waiting', async () => {
    const s = await setup()
    const c = await connect(s.url, 'a1')
    const r = await c.callTool({ name: 'send_message', arguments: { to: 'linus', message: 'hi' } })
    expect(text(r)).toMatch(/queued/i)
  })

  it('returns refusals as tool errors the agent can read, not protocol failures', async () => {
    const s = await setup()
    const c = await connect(s.url, 'a1')
    const r = await c.callTool({ name: 'send_message', arguments: { to: 'nobody', message: 'x' } })
    expect(r.isError).toBe(true)
    expect(text(r)).toMatch(/no agent named nobody/i)
  })

  it('lists colleagues', async () => {
    const s = await setup()
    const c = await connect(s.url, 'a2')
    const r = await c.callTool({ name: 'list_agents', arguments: {} })
    expect(JSON.parse(text(r))).toEqual([{ name: 'linus', activity: 'idle', branch: 'aw/linus', you: true }])
  })

  it('identity comes from the per-agent token; a spoofed agent header is ignored', async () => {
    const s = await setup()
    const c = await connect(s.url, 'a1', 'tok-a1', { 'X-AW-Agent': 'a2' })
    await c.callTool({ name: 'send_message', arguments: { to: 'linus', message: 'hello' } })
    expect(sent[0]!.from).toBe('a1')
  })

  it('rejects callers without the token', async () => {
    const s = await setup()
    await expect(connect(s.url, 'a1', 'wrong')).rejects.toThrow()
  })
})

describe('the library tools', () => {
  const entry = { id: 'pdf', kind: 'skill', description: 'Work with PDFs.', tokens: 120, mode: 'on-demand', when: 'working with PDFs' }
  const lib = {
    index: async (c: string) => (c === 'a2' ? [] : [entry]),
    get: async (_c: string, id: string, file?: string) => {
      if (id !== 'pdf') throw new Error(`${id} is not in this workspace's playbook.`)
      return file ? `file ${file}` : '# pdf\n\nUse the scripts.'
    },
    search: async (_c: string, q: string) => (q.includes('pdf') ? [entry] : [])
  }
  it('are listed for an agent, and each answers from the caller\'s own playbook', async () => {
    const s = await setup(lib)
    const c = await connect(s.url, 'a1')
    expect((await c.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(['library_index', 'library_get', 'library_search']))
    expect(text(await c.callTool({ name: 'library_index', arguments: {} }))).toContain('- pdf (skill, about 120 tokens to read, use working with PDFs): Work with PDFs.')
    const other = await connect(s.url, 'a2')
    expect(text(await other.callTool({ name: 'library_index', arguments: {} }))).toBe('This workspace has chosen no library items.')
  })
  it('read an item, a file of it, or say plainly that it is not allowed', async () => {
    const c = await connect((await setup(lib)).url, 'a1')
    expect(text(await c.callTool({ name: 'library_get', arguments: { id: 'pdf' } }))).toContain('Use the scripts.')
    expect(text(await c.callTool({ name: 'library_get', arguments: { id: 'pdf', file: 'scripts/x.sh' } }))).toBe('file scripts/x.sh')
    const refused = await c.callTool({ name: 'library_get', arguments: { id: 'secret' } })
    expect((refused as { isError?: boolean }).isError).toBe(true)
    expect(text(refused)).toContain('not in this workspace')
    expect(text(await c.callTool({ name: 'library_search', arguments: { query: 'pdf' } }))).toContain('- pdf')
  })
  it('are not offered when the app has no library', async () => {
    const c = await connect((await setup()).url, 'a1')
    expect((await c.listTools()).tools.map((t) => t.name)).not.toContain('library_get')
  })
})

describe('agent-world MCP server: subagents', () => {
  const calls: string[] = []
  const subagents = {
    spawn: async (caller: string, i: { provider: string; task: string; background?: boolean }) => {
      calls.push(`spawn:${caller}:${i.provider}:${i.task}:${i.background ?? false}`)
      if (i.task === 'too many') throw new Error('This agent already has 3 subagents working.')
      return { id: 'c1', name: 'bo', status: i.background ? ('working' as const) : ('done' as const), branch: 'aw/bo', ...(i.background ? {} : { report: 'Added it.' }) }
    },
    wait: async (caller: string, ids: string[]) => (calls.push(`wait:${caller}:${ids.join(',')}`), { id: ids[0]!, name: 'bo', status: 'done' as const, branch: 'aw/bo', report: 'Added it.' }),
    stop: (caller: string, id: string) => (calls.push(`stop:${caller}:${id}`), 'Stopped bo.')
  }

  it('offers the subagent tools only when the office can start subagents', async () => {
    const without = await connect((await setup()).url, 'a1')
    expect((await without.listTools()).tools.map((t) => t.name)).not.toContain('spawn_subagent')
    server?.close()
    server = await startMcpServer({ agentForToken: (t) => (t === 'tok-a1' ? 'a1' : null), listAgents: () => [], send: () => 'queued', remember: () => {}, recall: () => [], subagents })
    const c = await connect(server.url, 'a1')
    expect((await c.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(['spawn_subagent', 'await_subagents', 'stop_subagent']))
  })

  it('hands the call to the office as the caller, and answers with the child and its report', async () => {
    calls.length = 0
    server?.close()
    server = await startMcpServer({ agentForToken: (t) => (t === 'tok-a1' ? 'a1' : null), listAgents: () => [], send: () => 'queued', remember: () => {}, recall: () => [], subagents })
    const c = await connect(server.url, 'a1')
    const r = JSON.parse(text(await c.callTool({ name: 'spawn_subagent', arguments: { provider: 'agy', task: 'Add GET /export' } })))
    expect(r).toMatchObject({ id: 'c1', status: 'done', branch: 'aw/bo', report: 'Added it.' })
    await c.callTool({ name: 'await_subagents', arguments: { ids: ['c1'] } })
    await c.callTool({ name: 'stop_subagent', arguments: { id: 'c1' } })
    expect(calls).toEqual(['spawn:a1:agy:Add GET /export:false', 'wait:a1:c1', 'stop:a1:c1'])
  })

  it('says why it could not, as an error the agent can read, and refuses a program it does not know', async () => {
    server?.close()
    server = await startMcpServer({ agentForToken: (t) => (t === 'tok-a1' ? 'a1' : null), listAgents: () => [], send: () => 'queued', remember: () => {}, recall: () => [], subagents })
    const c = await connect(server.url, 'a1')
    const r = await c.callTool({ name: 'spawn_subagent', arguments: { provider: 'claude', task: 'too many' } })
    expect((r as { isError?: boolean }).isError).toBe(true)
    expect(text(r)).toContain('already has 3 subagents')
    await expect(c.callTool({ name: 'spawn_subagent', arguments: { provider: 'gpt', task: 'x' } })).resolves.toMatchObject({ isError: true })
  })
})

describe('the todo tools', () => {
  const agents = { a1: { id: 'a1', name: 'ada', provider: 'claude', repoPath: '/work/shop' }, a2: { id: 'a2', name: 'bob', provider: 'agy', repoPath: '/work/shop' } }
  const make = () => createTodoService({ dir: mkdtempSync(join(tmpdir(), 'aw-mcp-todos-')), workspaceKey: (p) => p.split('/').pop()!, agent: (id) => agents[id as 'a1' | 'a2'], lastMessage: (id) => ({ agentId: id, itemId: `m-${id}`, at: 1, excerpt: 'said so' }), lastRequest: () => undefined, workSince: async () => ({ commits: [{ sha: 'abc1234', subject: 'fix: it' }], files: [] }), remember: () => undefined, now: () => Date.now(), onChange: () => undefined })
  it('add, list, claim and finish a task, each as the calling agent', async () => {
    const svc = make()
    const a = await connect((await setup(undefined, svc)).url, 'a1')
    const b = await connect(server!.url, 'a2')
    expect((await a.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(['todo_list', 'todo_add', 'todo_get', 'todo_claim', 'todo_done', 'todo_update']))
    expect(text(await a.callTool({ name: 'todo_add', arguments: { title: 'Add the key', list: 'Manual setup', needs_you: true } }))).toMatch(/^Added todo#1 to Manual setup/)
    expect(text(await b.callTool({ name: 'todo_list', arguments: {} }))).toMatch(/todo#1 \[Manual setup\] Add the key.*needs you.*ada/)
    expect(text(await b.callTool({ name: 'todo_claim', arguments: { id: '1' } }))).toMatch(/You are on todo#1/)
    const clash = await a.callTool({ name: 'todo_claim', arguments: { id: '1' } })
    expect((clash as { isError?: boolean }).isError).toBe(true)
    expect(text(clash)).toContain('bob is already doing')
    expect(text(await b.callTool({ name: 'todo_done', arguments: { id: '1', note: 'key added' } }))).toMatch(/Marked todo#1 done/)
    const got = text(await a.callTool({ name: 'todo_get', arguments: { id: '1' } }))
    expect(got).toContain('done by bob')
    expect(got).toContain('key added')
    expect(got).toContain('said so')
    expect(text(await a.callTool({ name: 'todo_list', arguments: {} }))).toBe('No open todos.')
  })
  it('search finished and open tasks by words, and done keeps how it was done', async () => {
    const svc = make()
    const a = await connect((await setup(undefined, svc)).url, 'a1')
    const b = await connect(server!.url, 'a2')
    await a.callTool({ name: 'todo_add', arguments: { title: 'Fix the flaky login test' } })
    await a.callTool({ name: 'todo_add', arguments: { title: 'Write the changelog' } })
    expect(text(await a.callTool({ name: 'todo_done', arguments: { id: '1', note: 'Waited for the banner', how: 'Detach the cookie banner before clicking.', files: ['e2e/login.spec.ts'] } }))).toContain('Marked todo#1 done')
    await svc.settled()
    const found = text(await b.callTool({ name: 'todo_search', arguments: { query: 'cookie banner' } }))
    expect(found).toContain('todo#1')
    expect(found).toContain('done by ada')
    expect(found).toMatch(/banner/i)
    expect(found).not.toContain('changelog')
    expect(text(await b.callTool({ name: 'todo_search', arguments: { query: 'zebra' } }))).toBe('No todos match “zebra”.')
    const got = text(await b.callTool({ name: 'todo_get', arguments: { id: '1' } }))
    expect(got).toContain('How: Detach the cookie banner before clicking.')
    expect(got).toContain('e2e/login.spec.ts')
    expect(got).toContain('abc1234 fix: it')
    expect(text(await b.callTool({ name: 'todo_search', arguments: { query: 'changelog', status: 'done' } }))).toContain('No todos match')
  })
  it('say plainly when a todo does not exist, and are not offered when the app has no board', async () => {
    const a = await connect((await setup(undefined, make())).url, 'a1')
    const r = await a.callTool({ name: 'todo_done', arguments: { id: '77' } })
    expect((r as { isError?: boolean }).isError).toBe(true)
    expect(text(r)).toContain('No todo 77')
    const c = await connect((await setup()).url, 'a1')
    expect((await c.listTools()).tools.map((t) => t.name)).not.toContain('todo_add')
  })
})
