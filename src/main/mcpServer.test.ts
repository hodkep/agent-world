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

const sent: { from: string; to: string; message: string; expectsReply: boolean }[] = []

async function setup() {
  sent.length = 0
  server = await startMcpServer({
    token: 'tok',
    listAgents: (caller) => [{ name: 'linus', activity: 'idle', branch: 'aw/linus', you: caller === 'a2' }],
    send: (from, to, message, expectsReply) => {
      if (to === 'nobody') throw new Error('No agent named nobody.')
      sent.push({ from, to, message, expectsReply })
      return 'queued'
    }
  })
  return server
}

async function connect(url: string, agent: string, token = 'tok') {
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}`, 'X-AW-Agent': agent } } }))
  clients.push(client)
  return client
}

const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]!.text)

describe('agent-world MCP server', () => {
  it('offers list_agents and send_message', async () => {
    const s = await setup()
    const c = await connect(s.url, 'a1')
    const { tools } = await c.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['list_agents', 'send_message'])
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

  it('rejects callers without the token', async () => {
    const s = await setup()
    await expect(connect(s.url, 'a1', 'wrong')).rejects.toThrow()
  })
})
