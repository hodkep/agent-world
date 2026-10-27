import pkg from '../../package.json'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { Todo, TodoStatus } from '../shared/todos'
import type { TodoHit } from '../shared/todoSearch'
import { CHAT_MOD_GUIDE, type ChatModState } from '../shared/chatMod'

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
  addByAgent: (callerId: string, i: { title: string; list?: string; notes?: string; needsYou?: boolean; parent?: string; labels?: string[] }) => Todo
  claimByAgent: (callerId: string, id: string) => Todo
  doneByAgent: (callerId: string, id: string, note: string, extra?: { how?: string; files?: string[]; title?: string; list?: string }) => Todo
  searchForAgent: (callerId: string, query: string, o: { status?: TodoStatus | 'any'; limit?: number }) => TodoHit[]
  updateByAgent: (callerId: string, id: string, p: { title?: string; notes?: string; needsYou?: boolean; status?: TodoStatus; blockedWhy?: string; list?: string; parent?: string; labels?: string[] }) => Todo
  /** The lists by area on the board (not the Inbox). */
  listsOf: (callerId: string) => string[]
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
  /** POC: the look of the chat, which agents write as a draft and only the person keeps. Offered only when set. */
  chatMod?: {
    /** The look in force and any draft. Asking is how an agent "reads" it: a later write is judged against what it read. */
    state: (callerId: string) => ChatModState
    write: (callerId: string, i: { layout?: unknown; css?: string; widgets?: unknown; reset?: boolean; why: string }) => { problems: string[] }
    /** The elements of the app's window, as indented lines. */
    outline?: (selector: string, depth: number) => Promise<string>
    /** The window as the person sees it, as a base64 PNG, after the person allows it; null when they do not, or no window is open. */
    screenshot?: (callerId: string) => Promise<string | null>
  }
  /** Whether the library is switched on: its tools are offered only then (asked at each call, so a switch takes effect at once). */
  libraryOn?: () => boolean
  /** The shared library of skills and instructions, as far as the caller's playbook allows. */
  library?: {
    index: (callerId: string) => Promise<{ id: string; kind: string; description: string; tokens: number; mode: string; when: string }[]>
    get: (callerId: string, id: string, file?: string) => Promise<string>
    search: (callerId: string, query: string) => Promise<{ id: string; kind: string; description: string; tokens: number; mode: string; when: string }[]>
    skip: (callerId: string, id: string, reason: string) => void
  }
  /** What the workflow builder agent may do: read the workflows and hand in drafts. `offered` says whether this caller is the builder. */
  builder?: {
    offered: (callerId: string) => boolean
    list: (callerId: string) => string
    get: (callerId: string, id: string) => string
    /** The changes saved to one workflow before, newest first, as lines. */
    history: (callerId: string, id: string) => string
    /** Takes the file as the agent wrote it; throws every problem it has, so the agent can fix them all at once. */
    propose: (callerId: string, file: string) => string
  }
  /** Tasks agents report so the office can record them as workflow runs. `offered` says whether this caller gets the tools. */
  workflows?: {
    offered: (callerId: string) => boolean
    /**
     * `planFirst`: the office wants this task's plan approved before the agent edits, so the agent is told to write and submit one.
     * `brief`: what the task's workflow asks of the agent, step by step.
     */
    begin: (callerId: string, title: string, followUp: boolean, workflow?: string) => { planFirst: boolean; brief?: string; /** The project uses no workflow: nothing was recorded. */ none?: boolean; /** The request became an item of the task in progress. */ added?: boolean }
    done: (callerId: string, summary?: string) => void
    /** The agent reports a step it does as done; says which step, and the one that now waits for the person if any. */
    stepDone: (callerId: string, step?: string) => { done: string; waiting?: string; checking?: boolean; hint?: string }
    /** What task_begin says about the plan: it depends on the dial in force. */
    planInstruction: () => string
    /** Hand the plan file in; the answer says how many questions it holds. Throws what to fix when the read-back block is incomplete. */
    submitPlan: (callerId: string, path: string) => Promise<{ questions: number; hint?: string }>
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

const PLACES = ['stream', 'badge', 'footer', 'hidden'] as const
const LAYOUT_RULE = z.object({
  match: z
    .object({
      kind: z.array(z.string().max(60)).max(20).optional(),
      tool: z.array(z.string().max(60)).max(20).optional(),
      text: z.string().max(200).optional(),
      tone: z.literal('bad').optional()
    })
    .default({}),
  place: z.enum(PLACES),
  group: z.string().max(40).optional(),
  label: z.string().max(40).optional(),
  icon: z.string().max(8).optional(),
  open: z.boolean().optional()
})
const WIDGET = z.object({
  id: z.string().max(30).describe('a-z, 0-9 and -'),
  slot: z.enum(['chat-top', 'above-composer']),
  height: z.number().int().min(24).max(240).optional(),
  html: z.string().max(100000).describe('The page: html with its own style and script'),
  meters: z.array(z.enum(['usage', 'tokens', 'cost', 'todos'])).max(4).optional()
})
/** How the person's chat looks, written by agents as a draft that shows at once and that only the person's Keep makes permanent. */
function addChatModTools(server: McpServer, callerId: string, mod: NonNullable<Options['chatMod']>) {
  const text = (t: string, isError = false) => ({ ...(isError && { isError: true }), content: [{ type: 'text' as const, text: t }] })
  server.registerTool(
    'chat_mod_guide',
    { description: 'How to change the look of the person\'s chat (layout rules and CSS): what you may write, the colour variables, the parts of the chat. Read it before the first change.', inputSchema: {} },
    async () => text(CHAT_MOD_GUIDE)
  )
  server.registerTool(
    'app_ui_outline',
    {
      description: 'The elements of the app\'s window as indented lines (tag.class [label] "text"), to find the class name of the part you are asked to restyle. Give a selector to look inside one part, and a depth (default 4, at most 8).',
      inputSchema: { selector: z.string().max(200).optional().describe('A CSS selector; the whole app when empty'), depth: z.number().int().min(1).max(8).optional() }
    },
    async (a) => (mod.outline ? text(await mod.outline(a.selector ?? '', a.depth ?? 4)) : text('Not available.', true))
  )
  server.registerTool(
    'app_ui_screenshot',
    { description: 'A picture of the app\'s window as the person sees it now (the office, the chat, any look being tried). The window shows their chats and todos, so they are asked each time and may say no. Ask for it only when you need to see the result of a look change.', inputSchema: {} },
    async () => {
      const png = mod.screenshot ? await mod.screenshot(callerId) : null
      return png ? { content: [{ type: 'image' as const, data: png, mimeType: 'image/png' }] } : text('The person did not allow a picture of the window (or no window is open). Do not ask again unless they do; describe what you did instead.', true)
    }
  )
  server.registerTool(
    'chat_mod_get',
    { description: 'The look in force now and the draft waiting for the person, as JSON ({current, draft}); an empty look is the system default. Read it before you change anything.', inputSchema: {} },
    async () => {
      const s = mod.state(callerId)
      return text(JSON.stringify({ current: s.current, draft: s.draft, draftBy: s.draftBy }))
    }
  )
  server.registerTool(
    'chat_mod_write',
    {
      description:
        'Change how the person\'s chat looks, when they ask for it. Give `layout` (the full ordered list of rules), `css` (the full stylesheet), `widgets` (the full list), or any of them; a part you leave out stays as it is. It is shown to the person at once as a draft with Keep and Undo: you cannot make it permanent. ' +
        'Read chat_mod_guide first. If it says something could not be read, fix that and write again. Set `reset` to ask for the system default instead.',
      inputSchema: {
        layout: z.array(LAYOUT_RULE).max(30).optional(),
        css: z.string().max(60000).optional(),
        widgets: z.array(WIDGET).max(6).optional().describe('The full list of widgets; see chat_mod_guide'),
        reset: z.boolean().optional(),
        why: z.string().max(200).describe('One sentence for the person: what you did')
      }
    },
    async (a) => {
      if (!a.reset && a.layout === undefined && a.css === undefined && a.widgets === undefined) return text('Give layout, css, widgets, or reset.', true)
      const r = mod.write(callerId, a)
      if (r.problems.length) return text(`Nothing was changed. Fix this and write again: ${r.problems.join(' ')}`, true)
      // What the draft now holds, so the agent can see it is what it meant (not what it thinks was already there).
      const d = mod.state(callerId).draft
      const held = d ? `layout: ${d.layout.rules.length} rule(s); css: ${d.css.length} characters; widgets: ${d.widgets.map((w) => w.id).join(', ') || 'none'}` : 'nothing (the system look)'
      return text(`The person is looking at it now, with Keep and Undo. The draft holds ${held}. Tell them what you changed; it stays only if they keep it.`)
    }
  )
}

function toolsFor(callerId: string, o: Options) {
  const server = new McpServer({ name: 'agent-world', version: pkg.version })
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
  if (o.library && (o.libraryOn?.() ?? true)) addLibraryTools(server, callerId, o.library)
  if (o.todos) addTodoTools(server, callerId, o.todos)
  if (o.chatMod) addChatModTools(server, callerId, o.chatMod)
  if (o.workflows?.offered(callerId)) addWorkflowTools(server, callerId, o.workflows)
  if (o.builder?.offered(callerId)) addBuilderTools(server, callerId, o.builder)
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
  server.registerTool(
    'library_skip',
    {
      description: 'Say that a library item you were pointed at does not apply to this task, and why. Call it when you decide not to read an item a reminder named; do not call it for items nobody pointed at.',
      inputSchema: { id: z.string().min(1).max(80).describe('The id of the item'), reason: z.string().min(1).max(500).describe('Why it does not apply, in a few words') }
    },
    async ({ id, reason }) => {
      try {
        lib.skip(callerId, id, reason)
        return { content: [{ type: 'text' as const, text: `Noted: ${id} does not apply.` }] }
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
  `todo#${t.id} [${t.list}] ${t.title} — ${t.status}${t.needsYou && t.status !== 'done' ? ', needs you' : ''}${t.claimedBy ? `, ${t.claimedBy.name} is on it` : ''}${t.blockedWhy ? `, blocked: ${t.blockedWhy}` : ''}${t.parent ? `, part of todo#${t.parent}` : ''}${t.labels?.length ? `, labels: ${t.labels.join(', ')}` : ''}; created by ${who(t.createdBy)} ${ago(t.createdAt)}, updated ${ago(t.updatedAt)}`
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
    async (f) => run(() => { const l = todos.listForAgent(callerId, f); const lists = todos.listsOf(callerId); const head = lists.length ? `Lists: ${lists.join(', ')}\n` : ''; return l.length ? head + l.map(todoLine).join('\n') : f.status === 'done' ? 'No done todos.' : 'No open todos.' })
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
        list: z.string().max(60).optional().describe('The list for the part of the project it belongs to (Library, Chat, Settings…: a feature of the project, never the app itself): an existing list that means it is used, a new one is made only when none fits. Leave it out to put the task in the Inbox.'),
        notes: z.string().max(4000).optional().describe('Steps or detail'),
        needs_you: z.boolean().optional().describe('Only the person can do this'),
        parent: z.string().optional().describe('The number of a larger task this is a part of; it is shown under it and takes its list'),
        labels: z.array(z.string().max(30)).max(6).optional().describe('Labels the board already has, if one fits')
      }
    },
    async (a) => run(() => { const t = todos.addByAgent(callerId, { title: a.title, list: a.list, notes: a.notes, needsYou: a.needs_you, parent: a.parent, labels: a.labels }); return t.list === 'Inbox' ? `Added todo#${t.id} to Inbox. Name it and sort it into a list by area with todo_update (title, list).` : `Added todo#${t.id} to ${t.list}.` })
  )
  server.registerTool(
    'todo_claim',
    { description: 'Say you are doing this task now, so no other agent takes it.', inputSchema: { id } },
    async (a) => run(() => { const t = todos.claimByAgent(callerId, a.id); return `You are on todo#${t.id}: ${t.title}.` })
  )
  server.registerTool(
    'todo_done',
    {
      description: 'Mark a task done once its change is pushed (when the person told you to push, tested or not) or tested, by you or by them; not when the code is merely written. Say what you did in a line, and how in a few (the approach, where the knowledge is), so someone who has to do it again can find out. It records you, the message you are saying this in, and the commits you made.',
      inputSchema: {
        id,
        note: z.string().max(500).optional().describe('What was done, in a line'),
        how: z.string().max(1500).optional().describe('How: the approach, the steps, anything a later reader needs'),
        files: z.array(z.string().max(300)).max(30).optional().describe('The main files you changed or read'),
        title: z.string().min(1).max(200).optional().describe('A line that says what was done, if the task still has the person\'s words for a title'),
        list: z.string().max(60).optional().describe('The list for its area, if it is still in the Inbox')
      }
    },
    async (a) => run(() => { const t = todos.doneByAgent(callerId, a.id, a.note ?? '', { how: a.how, files: a.files, title: a.title, list: a.list }); return `Marked todo#${t.id} done.` })
  )
  server.registerTool(
    'todo_update',
    {
      description: 'Change a task: its title, notes, whether it needs the person, or its status (open, doing, blocked: say why).',
      inputSchema: {
        id,
        title: z.string().min(1).max(200).optional().describe('A line that says what is being done (your words, not the person\'s)'),
        list: z.string().max(60).optional().describe('Move it to the list for its area (Library, Chat…); an existing list that means it is used'),
        notes: z.string().max(4000).optional(),
        needs_you: z.boolean().optional(),
        status: z.enum(['open', 'doing', 'blocked']).optional(),
        blocked_why: z.string().max(500).optional().describe('Why it is blocked'),
        parent: z.string().optional().describe('The number of a larger task to put this under, or an empty string to take it out'),
        labels: z.array(z.string().max(30)).max(6).optional().describe('Replaces its labels; use ones the board already has')
      }
    },
    async (a) => run(() => { const t = todos.updateByAgent(callerId, a.id, { title: a.title, list: a.list, notes: a.notes, needsYou: a.needs_you, status: a.status, blockedWhy: a.blocked_why, parent: a.parent, labels: a.labels }); return `Updated todo#${t.id}.` })
  )
}

type WorkflowApi = NonNullable<Options['workflows']>

function addWorkflowTools(server: McpServer, callerId: string, wf: WorkflowApi) {
  const fail = (err: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }] })
  server.registerTool(
    'task_begin',
    {
      description:
        'Say that you are starting a task that changes code or takes several steps, so the office can record it. Do not call it for a question, a typo or a tiny edit. Pass follow_up only when the request is more work on the task you just finished (a missed case, a change to its review); a different piece of work is a new task.',
      inputSchema: { title: z.string().min(1).max(120).describe('The task in a few words'), follow_up: z.boolean().optional().describe('true when this continues the task you last finished'), workflow: z.string().max(40).optional().describe('The id of a workflow listed in your instructions, if one fits this task better than the default') }
    },
    async ({ title, follow_up, workflow }) => {
      try {
        const { planFirst, brief, none, added } = wf.begin(callerId, title, follow_up ?? false, workflow)
        if (none) return { content: [{ type: 'text' as const, text: brief ?? 'No workflow applies in this project.' }] }
        return { content: [{ type: 'text' as const, text: `${added ? 'Added to the task in progress' : 'Task begun'}: ${title}${brief ? `\n\n${brief}` : ''}${planFirst ? `\n\n${wf.planInstruction()}` : ''}` }] }
      } catch (err) {
        return fail(err)
      }
    }
  )
  server.registerTool(
    'plan_submit',
    {
      description: 'Hand in your plan for the person to approve before you change anything. The file must start with the read-back block task_begin described.',
      inputSchema: { path: z.string().max(300).optional().describe('The plan file in your worktree; defaults to .agent-world/plan.md') }
    },
    async ({ path }) => {
      try {
        const { questions, hint } = await wf.submitPlan(callerId, path ?? '.agent-world/plan.md')
        return { content: [{ type: 'text' as const, text: `Plan handed in; it is waiting for the person${questions ? ` (${questions} open question${questions === 1 ? '' : 's'} for them to answer)` : ''}. Do not edit yet: their answer arrives as your next message.${hint ?? ''}` }] }
      } catch (err) {
        return fail(err)
      }
    }
  )
  server.registerTool(
    'step_done',
    {
      description: 'Say that a step of your task\'s workflow that you do is finished. With no step it reports the next one you have not reported.',
      inputSchema: { step: z.string().max(40).optional().describe('The step id from the workflow you were given') }
    },
    async ({ step }) => {
      try {
        const r = wf.stepDone(callerId, step)
        return { content: [{ type: 'text' as const, text: `Step "${r.done}" reported done.${r.waiting ? ` "${r.waiting}" now waits for the person to approve it; their answer arrives as your next message.` : ''}${r.checking ? ' The app is running the checks that follow; if one fails you get its output as your next message.' : ''}${r.waiting ? (r.hint ?? '') : ''}` }] }
      } catch (err) {
        return fail(err)
      }
    }
  )
  server.registerTool(
    'task_done',
    {
      description: 'Say that the task you began is finished, with one line on what was done.',
      inputSchema: { summary: z.string().max(300).optional().describe('One line: what was done') }
    },
    async ({ summary }) => {
      try {
        wf.done(callerId, summary)
        return { content: [{ type: 'text' as const, text: 'Task done.' }] }
      } catch (err) {
        return fail(err)
      }
    }
  )
}

// None of the builder's tools changes the project (a draft is the person's to save), and a read-only (plan mode) agent may call only tools that say so.
const READ_ONLY = { readOnlyHint: true }
type BuilderApi = NonNullable<Options['builder']>

function addBuilderTools(server: McpServer, callerId: string, b: BuilderApi) {
  const fail = (err: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }] })
  server.registerTool(
    'workflow_list',
    { description: 'List the workflows this project can use, with where each is kept, when it fits and its steps.', inputSchema: {}, annotations: READ_ONLY },
    async () => {
      try {
        return { content: [{ type: 'text' as const, text: b.list(callerId) }] }
      } catch (err) {
        return fail(err)
      }
    }
  )
  server.registerTool(
    'workflow_get',
    { description: 'Read one workflow as its file.', inputSchema: { id: z.string().min(1).max(60).describe('The id from workflow_list') }, annotations: READ_ONLY },
    async ({ id }) => {
      try {
        return { content: [{ type: 'text' as const, text: b.get(callerId, id) }] }
      } catch (err) {
        return fail(err)
      }
    }
  )
  server.registerTool(
    'workflow_history',
    { description: 'The changes saved to one workflow before, newest first, with when and what changed. Read it before changing a saved workflow.', inputSchema: { id: z.string().min(1).max(60).describe('The id from workflow_list') }, annotations: READ_ONLY },
    async ({ id }) => {
      try {
        return { content: [{ type: 'text' as const, text: b.history(callerId, id) }] }
      } catch (err) {
        return fail(err)
      }
    }
  )
  server.registerTool(
    'workflow_propose',
    {
      description: 'Hand the person a workflow draft. It is not saved: the person sees it beside this chat and saves it themselves. Pass the whole file as JSON text. A file with problems is refused with every problem named, so fix them and call again.',
      inputSchema: { file: z.string().min(2).max(40_000).describe('The workflow file, as JSON text') },
      annotations: READ_ONLY
    },
    async ({ file }) => {
      try {
        return { content: [{ type: 'text' as const, text: b.propose(callerId, file) }] }
      } catch (err) {
        return fail(err)
      }
    }
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
