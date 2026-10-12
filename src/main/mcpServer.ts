import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { Todo, TodoStatus } from '../shared/todos'
import type { TodoHit } from '../shared/todoSearch'

export interface Colleague {
  name: string
  activity: string
  branch: string | null
  you: boolean
}

/** The project's todo board, as far as one agent may use it: its own project's, as itself. */
export interface TodoApi {
  listForAgent: (callerId: string, f: { list?: string; status?: TodoStatus; mine?: boolean }) => Todo[]
  getForAgent: (callerId: string, id: string) => Todo
  addByAgent: (callerId: string, i: { title: string; list?: string; notes?: string; needsYou?: boolean }) => Todo
  claimByAgent: (callerId: string, id: string) => Todo
  doneByAgent: (callerId: string, id: string, note: string, extra?: { how?: string; files?: string[] }) => Todo
  searchForAgent: (callerId: string, query: string, o: { status?: TodoStatus | 'any'; limit?: number }) => TodoHit[]
  updateByAgent: (callerId: string, id: string, p: { title?: string; notes?: string; needsYou?: boolean; status?: TodoStatus; blockedWhy?: string }) => Todo
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
  /** A program's own hook calling the office (not MCP): the answer is what the program's hook prints. */
  hook?: (callerId: string, event: string, payload: Record<string, unknown>) => Record<string, unknown>
  /** Starting other agents, of either program, as subagents of the caller. Offered only when set. */
  subagents?: {
    spawn: (callerId: string, i: SpawnInput) => Promise<SubagentResult>
    wait: (callerId: string, ids: string[]) => Promise<SubagentResult>
    stop: (callerId: string, id: string) => string
  }
  /** The project's todo board, shared by the person and the agents. Offered only when set. */
  todos?: TodoApi
  /** The shared library of skills and instructions, as far as the caller's playbook allows. */
  library?: {
    index: (callerId: string) => Promise<{ id: string; kind: string; description: string; tokens: number; mode: string; when: string }[]>
    get: (callerId: string, id: string, file?: string) => Promise<string>
    search: (callerId: string, query: string) => Promise<{ id: string; kind: string; description: string; tokens: number; mode: string; when: string }[]>
  }
}

export interface SpawnInput {
  provider: string
  task: string
  worktree?: boolean
  branch?: string
  model?: string
  background?: boolean
}

/** What a subagent call answers: where it is, and its report once it has finished. */
export interface SubagentResult {
  id: string
  name: string
  status: 'working' | 'done' | 'stopped'
  branch: string | null
  report?: string
  /** Set when the answer is not final: what to do next. */
  note?: string
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
  if (o.subagents) {
    const sub = o.subagents
    const ask = (run: () => Promise<unknown> | unknown) => async () => {
      try {
        return { content: [{ type: 'text' as const, text: JSON.stringify(await run()) }] }
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }] }
      }
    }
    server.registerTool(
      'spawn_subagent',
      {
        description:
          'Start another agent, running on the program you choose (claude or agy), as your subagent. It works on the task and its final message comes back as this call\'s answer, so you can plan, hand pieces out, then review and merge what comes back. If it takes longer than about 45 seconds the call returns with status working and its id: then call await_subagents with that id (as often as needed) instead of starting it again. Several calls in one reply run side by side. Give it a task a colleague could do alone: what to do, which files, how to check it worked. A subagent that writes gets its own branch to work on; one that only reads can share your folder. Set background to carry on meanwhile and collect the answer with await_subagents.',
        inputSchema: {
          provider: z.enum(['claude', 'agy']).describe('Which program runs the subagent'),
          task: z.string().min(1).max(8000).describe('What it should do, and how you will know it is done'),
          worktree: z.boolean().optional().describe('Give it a branch and folder of its own (default true). false: it shares your folder, so it should only read.'),
          branch: z.string().max(80).optional().describe('A name for its branch'),
          model: z.string().max(80).optional().describe('A model of that program; its default when left out'),
          background: z.boolean().optional().describe('Return at once with its id instead of waiting for its answer')
        }
      },
      async (i) => ask(() => sub.spawn(callerId, i))()
    )
    server.registerTool(
      'await_subagents',
      { description: 'Wait for the next of your subagents that is still working (started in the background, or reported as still working) to finish, and return its report. It holds on for up to about 45 seconds, then answers working with a note: call it again. Pass the ids spawn_subagent gave you.', inputSchema: { ids: z.array(z.string()).min(1).max(10).describe('Subagent ids') } },
      async ({ ids }) => ask(() => sub.wait(callerId, ids))()
    )
    server.registerTool(
      'stop_subagent',
      { description: 'Stop one of your subagents.', inputSchema: { id: z.string().describe('Subagent id') } },
      async ({ id }) => ask(() => sub.stop(callerId, id))()
    )
  }
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
  if (o.library) addLibraryTools(server, callerId, o.library)
  if (o.todos) addTodoTools(server, callerId, o.todos)
  return server
}

type LibraryApi = NonNullable<Options['library']>
const lineOf = (e: Awaited<ReturnType<LibraryApi['index']>>[number]) => `- ${e.id} (${e.kind}, about ${e.tokens} tokens to read${e.mode === 'always' ? ', always follow' : e.when ? `, use ${e.when}` : ''}): ${e.description}`

function addLibraryTools(server: McpServer, callerId: string, lib: LibraryApi) {
  const fail = (err: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }] })
  server.registerTool(
    'library_index',
    { description: 'List the skills, instructions and prompts this workspace has chosen for you, with what each is for and what it costs to read. Call it at the start of a task, then read what applies with library_get.', inputSchema: {} },
    async () => {
      try {
        const list = await lib.index(callerId)
        return { content: [{ type: 'text' as const, text: list.length ? list.map(lineOf).join('\n') : 'This workspace has chosen no library items.' }] }
      } catch (err) {
        return fail(err)
      }
    }
  )
  server.registerTool(
    'library_get',
    {
      description: 'Read one library item by its id (a skill\'s instructions, an instruction or a prompt). For a skill with extra files, pass file to read one of them.',
      inputSchema: { id: z.string().min(1).max(80).describe('The id from library_index'), file: z.string().max(200).optional().describe('A file of the skill, relative to it') }
    },
    async ({ id, file }) => {
      try {
        return { content: [{ type: 'text' as const, text: await lib.get(callerId, id, file) }] }
      } catch (err) {
        return fail(err)
      }
    }
  )
  server.registerTool(
    'library_search',
    { description: 'Search the library items this workspace has chosen for you by a few words.', inputSchema: { query: z.string().min(1).max(200).describe('A few words') } },
    async ({ query }) => {
      try {
        const list = await lib.search(callerId, query)
        return { content: [{ type: 'text' as const, text: list.length ? list.map(lineOf).join('\n') : 'Nothing matches.' }] }
      } catch (err) {
        return fail(err)
      }
    }
  )
}

const ago = (t: number, now = Date.now()) => {
  const s = Math.max(0, Math.round((now - t) / 1000))
  return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129_600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86_400)} days ago`
}
const flat = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 200)
const who = (a: { name: string; provider?: string; forMain?: string }) => `${a.provider ? `${a.name} (${a.provider})` : a.name}${a.forMain ? `, a subagent of ${a.forMain}` : ''}`
const todoLine = (t: Todo) =>
  `todo#${t.id} [${t.list}] ${t.title} — ${t.status}${t.needsYou && t.status !== 'done' ? ', needs you' : ''}${t.claimedBy ? `, ${t.claimedBy.name} is on it` : ''}${t.blockedWhy ? `, blocked: ${t.blockedWhy}` : ''}; created by ${who(t.createdBy)} ${ago(t.createdAt)}, updated ${ago(t.updatedAt)}`
const todoFull = (t: Todo) =>
  [
    todoLine(t),
    t.notes && `Notes: ${t.notes}`,
    t.createdLink && `Made in ${t.createdBy.name}'s message ${ago(t.createdLink.at)}: "${flat(t.createdLink.excerpt)}"`,
    t.status === 'done' && t.doneBy && `Done by ${who(t.doneBy)} ${ago(t.doneAt ?? t.updatedAt)}${t.doneNote ? `: ${t.doneNote}` : ''}`,
    t.doneHow && `How: ${t.doneHow}`,
    t.doneFiles?.length && `Files: ${t.doneFiles.join(', ')}`,
    t.doneCommits?.length && `Commits: ${t.doneCommits.map((c) => `${c.sha} ${c.subject}`).join('; ')}`,
    t.doneLink && `Finished in ${t.doneBy?.name ?? 'an agent'}'s message: "${flat(t.doneLink.excerpt)}"`,
    'History:',
    ...t.history.map((e) => `- ${e.what} by ${who(e.by)} ${ago(e.at)}${e.note ? ` (${e.note})` : ''}`)
  ]
    .filter(Boolean)
    .join('\n')

function addTodoTools(server: McpServer, callerId: string, todos: TodoApi) {
  const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
  const fail = (err: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }] })
  const run = (f: () => string) => {
    try {
      return text(f())
    } catch (err) {
      return fail(err)
    }
  }
  const id = z.string().min(1).max(20).describe('The todo number from todo_list')
  server.registerTool(
    'todo_list',
    {
      description: 'List this project\'s todo board: open tasks by default, each with its number, list, who made it and when it last changed. Tasks the person added by hand are here too.',
      inputSchema: {
        list: z.string().max(60).optional().describe('Only this list'),
        status: z.enum(['open', 'doing', 'blocked', 'done']).optional().describe('Only this status (done tasks are left out otherwise)'),
        mine: z.boolean().optional().describe('Only the tasks you claimed')
      }
    },
    async (f) => run(() => { const l = todos.listForAgent(callerId, f); return l.length ? l.map(todoLine).join('\n') : f.status === 'done' ? 'No done todos.' : 'No open todos.' })
  )
  server.registerTool(
    'todo_search',
    {
      description: 'Search this project\'s todos, finished ones too, by a few words: titles, notes, how a task was done, the files and commits, and the messages it came from. Use it before doing something that may have been done before; then read a hit with todo_get, or ask whoever did it.',
      inputSchema: {
        query: z.string().min(1).max(200).describe('A few words'),
        status: z.enum(['open', 'doing', 'blocked', 'done', 'any']).optional().describe('Only this status; any by default'),
        limit: z.number().int().min(1).max(20).optional()
      }
    },
    async (a) =>
      run(() => {
        const hits = todos.searchForAgent(callerId, a.query, { status: a.status ?? 'any', limit: a.limit ?? 8 })
        if (!hits.length) return `No todos match “${a.query}”.`
        return hits
          .map((h) => `${todoLine(h.todo)}${h.todo.status === 'done' && h.todo.doneBy ? `; done by ${h.todo.doneBy.name}` : ''}\n  matches ${h.where.join(', ')}: ${h.snippet}`)
          .join('\n')
      })
  )
  server.registerTool(
    'todo_get',
    { description: 'One todo in full: notes, history, and the chat messages it was made and finished in.', inputSchema: { id } },
    async (a) => run(() => todoFull(todos.getForAgent(callerId, a.id)))
  )
  server.registerTool(
    'todo_add',
    {
      description: 'Add a task to this project\'s todo board. Use needs_you for a step only the person can do (a key to paste, a login, an install). The task remembers the message you said it in.',
      inputSchema: {
        title: z.string().min(1).max(200).describe('What needs doing, in a line'),
        list: z.string().max(60).optional().describe('The list to put it in (made if new); the first list by default'),
        notes: z.string().max(4000).optional().describe('Steps or detail'),
        needs_you: z.boolean().optional().describe('Only the person can do this')
      }
    },
    async (a) => run(() => { const t = todos.addByAgent(callerId, { title: a.title, list: a.list, notes: a.notes, needsYou: a.needs_you }); return `Added todo#${t.id} to ${t.list}.` })
  )
  server.registerTool(
    'todo_claim',
    { description: 'Say you are doing this task now, so no other agent takes it.', inputSchema: { id } },
    async (a) => run(() => { const t = todos.claimByAgent(callerId, a.id); return `You are on todo#${t.id}: ${t.title}.` })
  )
  server.registerTool(
    'todo_done',
    {
      description: 'Mark a task done. Say what you did in a line, and how in a few (the approach, where the knowledge is), so someone who has to do it again can find out. It records you, the message you are saying this in, and the commits you made.',
      inputSchema: {
        id,
        note: z.string().max(500).optional().describe('What was done, in a line'),
        how: z.string().max(1500).optional().describe('How: the approach, the steps, anything a later reader needs'),
        files: z.array(z.string().max(300)).max(30).optional().describe('The main files you changed or read')
      }
    },
    async (a) => run(() => { const t = todos.doneByAgent(callerId, a.id, a.note ?? '', { how: a.how, files: a.files }); return `Marked todo#${t.id} done.` })
  )
  server.registerTool(
    'todo_update',
    {
      description: 'Change a task: its title, notes, whether it needs the person, or its status (open, doing, blocked: say why).',
      inputSchema: {
        id,
        title: z.string().min(1).max(200).optional(),
        notes: z.string().max(4000).optional(),
        needs_you: z.boolean().optional(),
        status: z.enum(['open', 'doing', 'blocked']).optional(),
        blocked_why: z.string().max(500).optional().describe('Why it is blocked')
      }
    },
    async (a) => run(() => { const t = todos.updateByAgent(callerId, a.id, { title: a.title, notes: a.notes, needsYou: a.needs_you, status: a.status, blockedWhy: a.blocked_why }); return `Updated todo#${t.id}.` })
  )
}

/** Local MCP endpoint every agent is given via --mcp-config, each with a token of its own. */
export async function startMcpServer(o: Options) {
  const http = createServer(async (req, res) => {
    const hookEvent = /^\/hook\/([a-z-]{1,20})$/.exec(req.url ?? '')?.[1]
    if (req.url !== '/mcp' && !hookEvent) return void res.writeHead(404).end()
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
    if (hookEvent) {
      let answer: Record<string, unknown> = {}
      try {
        answer = o.hook?.(caller, hookEvent, (body && typeof body === 'object' ? body : {}) as Record<string, unknown>) ?? {}
      } catch {
        /* a hook must never break the program that called it */
      }
      return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer))
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
