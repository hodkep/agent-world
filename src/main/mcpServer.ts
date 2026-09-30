import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

export interface Colleague {
  name: string
  activity: string
  branch: string | null
  you: boolean
}

interface Options {
  /** Each agent has its own bearer token; the token alone says who is calling. */
  agentForToken: (token: string) => string | null
  listAgents: (callerId: string) => Colleague[]
  send: (fromId: string, to: string, message: string, expectsReply: boolean) => 'delivered' | 'queued'
  /** Save a note for everyone working in the caller's project. */
  remember: (callerId: string, text: string) => void
  /** Notes from the caller's project that match the words (the newest when empty). */
  recall: (callerId: string, query: string) => { text: string; by: string; at: number }[]
}

const MAX_BODY = 1024 * 1024

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) req.destroy(new Error('body too large'))
      else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function toolsFor(callerId: string, o: Options) {
  const server = new McpServer({ name: 'agent-world', version: '0.1.0' })
  server.registerTool(
    'list_agents',
    { description: 'List the other coding agents working in this Agent World office, with what each is doing right now.', inputSchema: {} },
    async () => ({ content: [{ type: 'text', text: JSON.stringify(o.listAgents(callerId)) }] })
  )
  server.registerTool(
    'send_message',
    {
      description:
        'Send a message to another agent in the office (by name, see list_agents). It arrives as that agent\'s next prompt: immediately if it is idle, otherwise when its current turn ends. Use it to ask for help, hand off work, or reply to a message you received.',
      inputSchema: {
        to: z.string().describe('Recipient agent name'),
        message: z.string().min(1).max(4000).describe('What you want to say'),
        expects_reply: z.boolean().optional().describe('false when this message is itself a reply, so the recipient does not answer back. Defaults to true.')
      }
    },
    async ({ to, message, expects_reply }) => {
      try {
        const status = o.send(callerId, to, message, expects_reply ?? true)
        return { content: [{ type: 'text', text: status === 'delivered' ? `Delivered to ${to}; it is working on it now.` : `Queued for ${to}; it is busy and will get it when its current turn ends.` }] }
      } catch (err) {
        return { isError: true, content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }] }
      }
    }
  )
  server.registerTool(
    'remember',
    {
      description:
        'Save a durable fact about this project for every agent that works on it, now and in later sessions: how to run the tests, a decision and why it was made, a trap you fell into. Keep it short and specific. Do not save secrets or things already in the code.',
      inputSchema: { text: z.string().min(1).max(2000).describe('The note') }
    },
    async ({ text }) => {
      try {
        o.remember(callerId, text)
        return { content: [{ type: 'text', text: 'Remembered for this project.' }] }
      } catch (err) {
        return { isError: true, content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }] }
      }
    }
  )
  server.registerTool(
    'recall',
    {
      description: 'Look up what agents (and the user) have saved about this project. Call it at the start of a task with a few words about the task. With no query it returns the newest notes.',
      inputSchema: { query: z.string().max(200).optional().describe('A few words to search for') }
    },
    async ({ query }) => {
      const notes = o.recall(callerId, query ?? '')
      return { content: [{ type: 'text', text: notes.length ? notes.map((n) => `- ${n.text} (${n.by}, ${new Date(n.at).toISOString().slice(0, 10)})`).join('\n') : 'Nothing saved about this yet.' }] }
    }
  )
  return server
}

/** Local MCP endpoint every agent is given via --mcp-config, each with a token of its own. */
export async function startMcpServer(o: Options) {
  const http = createServer(async (req, res) => {
    if (req.url !== '/mcp') return void res.writeHead(404).end()
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1]
    const caller = bearer ? o.agentForToken(bearer) : null
    if (!caller) return void res.writeHead(401).end()
    // Stateless: each request gets a fresh server/transport pair, so there is no session to leak between agents.
    if (req.method !== 'POST') return void res.writeHead(405).end()
    let body: unknown
    try {
      body = await readJson(req)
    } catch {
      return void res.writeHead(400).end()
    }
    const server = toolsFor(caller, o)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  })
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
  const { port } = http.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: () => {
      http.closeAllConnections()
      http.close()
    }
  }
}
