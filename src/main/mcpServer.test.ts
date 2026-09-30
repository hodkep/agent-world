import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it } from 'vitest'
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

async function setup() {
  sent.length = 0
  server = await startMcpServer({
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
