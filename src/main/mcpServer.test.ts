import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTodoService } from './todos/service'
import type { Dial } from '../shared/workflows'
import { startMcpServer } from './mcpServer'
import { planInstruction } from './workflows/hint'

type Server = Awaited<ReturnType<typeof startMcpServer>>
let server: Server | undefined
const clients: Client[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()))
  server?.close()
})

const notes: { caller: string; text: string }[] = []
const sent: { from: string; to: string; message: string; expectsReply: boolean }[] = []

async function setup(library?: Parameters<typeof startMcpServer>[0]['library'], todos?: Parameters<typeof startMcpServer>[0]['todos'], libraryOn?: () => boolean, workflows?: Parameters<typeof startMcpServer>[0]['workflows'], builder?: Parameters<typeof startMcpServer>[0]['builder']) {
  sent.length = 0
  server = await startMcpServer({
    library,
    libraryOn,
    todos,
    workflows,
    builder,
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
    search: async (_c: string, q: string) => (q.includes('pdf') ? [entry] : []),
    skip: (_c: string, id: string, reason: string) => {
      if (id !== 'pdf') throw new Error(`${id} is not in this workspace's playbook.`)
      skipped.push(`${id}: ${reason}`)
    }
  }
  const skipped: string[] = []
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
  it('record that the agent passed over an item, and refuse what is not in its playbook', async () => {
    const c = await connect((await setup(lib)).url, 'a1')
    expect(text(await c.callTool({ name: 'library_skip', arguments: { id: 'pdf', reason: 'only a question' } }))).toContain('Noted')
    expect(skipped).toEqual(['pdf: only a question'])
    const refused = await c.callTool({ name: 'library_skip', arguments: { id: 'secret', reason: 'x' } })
    expect((refused as { isError?: boolean }).isError).toBe(true)
  })
  it('are not offered while the library is switched off, and come back when it is switched on', async () => {
    let on = false
    const s = await setup(lib, undefined, () => on)
    const c = await connect(s.url, 'a1')
    expect((await c.listTools()).tools.map((t) => t.name)).not.toContain('library_index')
    on = true
    const again = await connect(s.url, 'a1')
    expect((await again.listTools()).tools.map((t) => t.name)).toContain('library_index')
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
  it('puts a task under a bigger one and labels it, and the list shows both', async () => {
    const svc = make()
    const a = await connect((await setup(undefined, svc)).url, 'a1')
    await a.callTool({ name: 'todo_add', arguments: { title: 'Umbrella', list: 'Chat' } })
    expect(text(await a.callTool({ name: 'todo_add', arguments: { title: 'Part', parent: '1', labels: ['bug'] } }))).toMatch(/^Added todo#2 to Chat/)
    expect(text(await a.callTool({ name: 'todo_list', arguments: {} }))).toMatch(/todo#2 \[Chat\] Part.*part of todo#1.*labels: bug/)
    await a.callTool({ name: 'todo_update', arguments: { id: '2', parent: '', labels: [] } })
    expect(text(await a.callTool({ name: 'todo_list', arguments: {} }))).not.toMatch(/part of/)
  })
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
  it('keep the board to lists by area: a name is matched to an existing list, a generic one is refused, and a task can be named and sorted when updated or finished', async () => {
    const a = await connect((await setup(undefined, make())).url, 'a1')
    expect(text(await a.callTool({ name: 'todo_add', arguments: { title: 'first', list: 'Library' } }))).toBe('Added todo#1 to Library.')
    expect(text(await a.callTool({ name: 'todo_add', arguments: { title: 'second', list: 'library' } }))).toBe('Added todo#2 to Library.')
    const generic = await a.callTool({ name: 'todo_add', arguments: { title: 'third', list: 'Misc' } })
    expect((generic as { isError?: boolean }).isError).toBe(true)
    expect(text(generic)).toContain('Library')
    expect(text(await a.callTool({ name: 'todo_add', arguments: { title: 'loose' } }))).toBe('Added todo#3 to Inbox. Name it and sort it into a list by area with todo_update (title, list).')
    expect(text(await a.callTool({ name: 'todo_update', arguments: { id: '3', title: 'Build the canvas legend', list: 'Canvas' } }))).toBe('Updated todo#3.')
    expect(text(await a.callTool({ name: 'todo_list', arguments: {} }))).toContain('todo#3 [Canvas] Build the canvas legend')
    expect(text(await a.callTool({ name: 'todo_list', arguments: {} }))).toMatch(/^Lists: Library, Canvas/)
    expect(text(await a.callTool({ name: 'todo_done', arguments: { id: '1', note: 'ok', title: 'Wire the key', list: 'canvas' } }))).toBe('Marked todo#1 done.')
    expect(text(await a.callTool({ name: 'todo_get', arguments: { id: '1' } }))).toContain('todo#1 [Canvas] Wire the key')
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

let gate = true
let planFirst = true
let dial: Dial = 'balanced'
describe('workflow tools', () => {
  const calls: string[] = []
  const wf = {
    offered: (caller: string) => caller === 'a1',
    begin: (caller: string, title: string, followUp: boolean, workflow?: string) => {
      if (title === 'off') throw new Error('Workflows are off.')
      if (title === 'added') return { planFirst: true, added: true, brief: 'Added as item 2 of the task in progress.' }
      if (title === 'none') return { planFirst: false, none: true, brief: 'No workflow applies in this project, so no task is recorded.' }
      calls.push(`${caller} begin ${title} ${followUp}${workflow ? ` workflow=${workflow}` : ''}`)
      return { planFirst: planFirst && !followUp, brief: `Workflow: ${workflow ?? 'Standard'}. Its steps, in order:` }
    },
    stepDone: (caller: string, step?: string) => {
      if (step === 'nope') throw new Error('This workflow has no step "nope".')
      calls.push(`${caller} step ${step ?? ''}`)
      return step === 'fix' ? { done: 'fix', waiting: 'Your review' } : step === 'lint' ? { done: 'lint', checking: true } : { done: step ?? 'build' }
    },
    reopenStep: (caller: string, step: string, why: string) => {
      if (step === 'nope') throw new Error('This workflow has no step "nope".')
      calls.push(`${caller} reopen ${step}: ${why}`)
      return step === 'commit' ? 'Commit' : 'Build'
    },
    askSkip: (caller: string, steps: string[], why: string) => {
      calls.push(`${caller} skip ${steps.join(',')}: ${why}`)
      return steps.map((x) => x.toUpperCase())
    },
    planInstruction: () => planInstruction(dial),
    submitPlan: async (caller: string, path: string) => {
      if (path === 'bad.md') throw new Error("The plan's read-back block needs fixing:\n- Missing \"## Goal\"")
      calls.push(`${caller} plan ${path}`)
      return { questions: 2 }
    },
    done: (caller: string, summary?: string) => void calls.push(`${caller} done ${summary ?? ''}`)
  }
  it('task_begin and task_done reach the recorder with the caller and what was said', async () => {
    calls.length = 0
    const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
    expect(text(await c.callTool({ name: 'task_begin', arguments: { title: 'Fix the login redirect' } }))).toContain('Task begun')
    await c.callTool({ name: 'task_begin', arguments: { title: 'A missed case', follow_up: true } })
    expect(text(await c.callTool({ name: 'task_done', arguments: { summary: 'All fixed.' } }))).toContain('Task done')
    expect(calls).toEqual(['a1 begin Fix the login redirect false', 'a1 begin A missed case true', 'a1 done All fixed.'])
  })
  it('task_begin in a project that uses no workflow says so and never says a task was begun', async () => {
    const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
    const said = text(await c.callTool({ name: 'task_begin', arguments: { title: 'none' } }))
    expect(said).toContain('No workflow applies')
    expect(said).not.toContain('Task begun')
  })
  it('task_begin that became an item of the open task says it was added, not that a task was begun, and still asks for the plan', async () => {
    const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
    const said = text(await c.callTool({ name: 'task_begin', arguments: { title: 'added' } }))
    expect(said).toContain('Added to the task in progress')
    expect(said).toContain('Added as item 2')
    expect(said).not.toContain('Task begun')
  })
  it('say plainly when the recorder refuses', async () => {
    const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
    const refused = await c.callTool({ name: 'task_begin', arguments: { title: 'off' } })
    expect((refused as { isError?: boolean }).isError).toBe(true)
    expect(text(refused)).toContain('Workflows are off')
  })
  it('are offered only to an agent the recorder says should have them', async () => {
    const s = await setup(undefined, undefined, undefined, wf)
    expect((await (await connect(s.url, 'a1')).listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(['task_begin', 'task_done']))
    expect((await (await connect(s.url, 'a2')).listTools()).tools.map((t) => t.name)).not.toContain('task_begin')
    expect((await (await connect((await setup()).url, 'a1')).listTools()).tools.map((t) => t.name)).not.toContain('task_begin')
  })

  it('task_begin tells the agent to plan first when the office wants a plan, and not for a follow-up', async () => {
    const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
    const first = text(await c.callTool({ name: 'task_begin', arguments: { title: 'Add a toggle' } }))
    expect(first).toContain('.agent-world/plan.md')
    expect(first).toContain('plan_submit')
    expect(first).toContain('## Open questions')
    expect(text(await c.callTool({ name: 'task_begin', arguments: { title: 'More', follow_up: true } }))).not.toContain('plan_submit')
  })

  it('task_begin carries the plan instruction of the dial in force when it is called', async () => {
    const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
    try {
      dial = 'economy'
      expect(text(await c.callTool({ name: 'task_begin', arguments: { title: 'Fix a typo' } }))).toContain('can be said in one sentence')
      dial = 'max'
      const first = text(await c.callTool({ name: 'task_begin', arguments: { title: 'Add a toggle' } }))
      expect(first).toContain('plan_submit')
      expect(first).not.toContain('one sentence')
    } finally {
      dial = 'balanced'
    }
  })

  it('plan_submit hands the plan in and says it now waits; a refused plan comes back with what to fix', async () => {
    calls.length = 0
    const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
    const ok = text(await c.callTool({ name: 'plan_submit', arguments: {} }))
    expect(ok).toContain('waiting')
    expect(ok).toContain('2 open question')
    expect(calls).toEqual(['a1 plan .agent-world/plan.md'])
    const refused = await c.callTool({ name: 'plan_submit', arguments: { path: 'bad.md' } })
    expect((refused as { isError?: boolean }).isError).toBe(true)
    expect(text(refused)).toContain('Missing "## Goal"')
  })

  it('plan_submit is always offered, and the plan instruction comes only when the office says the plan comes first', async () => {
    planFirst = false
    try {
      const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
      expect((await c.listTools()).tools.map((t) => t.name)).toContain('plan_submit')
      expect(text(await c.callTool({ name: 'task_begin', arguments: { title: 'x' } }))).not.toContain('plan_submit')
    } finally {
      planFirst = true
    }
  })

  it('task_begin passes the workflow the agent asked for and answers with the workflow\'s brief', async () => {
    calls.length = 0
    const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
    const reply = text(await c.callTool({ name: 'task_begin', arguments: { title: 'Fix it', workflow: 'bug-fix' } }))
    expect(reply).toContain('Task begun: Fix it')
    expect(reply).toContain('Workflow: bug-fix. Its steps, in order:')
    expect(calls).toEqual(['a1 begin Fix it false workflow=bug-fix'])
  })

  it('step_done reports a step and says what now waits for the person; a refusal comes back in words', async () => {
    calls.length = 0
    const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
    expect(text(await c.callTool({ name: 'step_done', arguments: {} }))).toBe('Step "build" reported done. That was the last step.')
    expect(text(await c.callTool({ name: 'step_done', arguments: { step: 'fix' } }))).toBe('Step "fix" reported done. "Your review" now waits for the person to approve it; their answer arrives as your next message. That was the last step.')
    expect(text(await c.callTool({ name: 'step_done', arguments: { step: 'lint' } }))).toBe('Step "lint" reported done. The app is running the checks that follow; if one fails you get its output as your next message. That was the last step.')
    const refused = await c.callTool({ name: 'step_done', arguments: { step: 'nope' } })
    expect((refused as { isError?: boolean }).isError).toBe(true)
    expect(text(refused)).toContain('no step "nope"')
    expect(calls).toEqual(['a1 step ', 'a1 step fix', 'a1 step lint'])
    expect((await (await connect((await setup(undefined, undefined, undefined, wf)).url, 'a2')).listTools()).tools.map((t) => t.name)).not.toContain('step_done')
  })
})

describe('the tools for work added mid-run', () => {
  it('step_reopen puts a step back and says its name; a missing step comes back in words', async () => {
    const calls: string[] = []
    const wf = { offered: () => true, begin: () => ({ planFirst: false }), done: () => undefined, stepDone: () => ({ done: 'x' }), reopenStep: (c: string, step: string, why: string) => { if (step === 'nope') throw new Error('This workflow has no step "nope".'); calls.push(`${c} ${step}: ${why}`); return 'Commit' }, askSkip: () => [], planInstruction: () => '', submitPlan: async () => ({ text: '' }) } as never
    const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
    expect(text(await c.callTool({ name: 'step_reopen', arguments: { step: 'commit', why: 'The new work is ready.' } }))).toBe('Step "Commit" is open again.')
    const bad = await c.callTool({ name: 'step_reopen', arguments: { step: 'nope', why: 'x' } })
    expect((bad as { isError?: boolean }).isError).toBe(true)
    expect(calls).toEqual(['a1 commit: The new work is ready.'])
  })

  it('skip_steps asks once for all the steps and says that nothing is skipped until the person answers', async () => {
    const calls: string[] = []
    const wf = { offered: () => true, begin: () => ({ planFirst: false }), done: () => undefined, stepDone: () => ({ done: 'x' }), reopenStep: () => 'x', askSkip: (c: string, steps: string[], why: string) => { calls.push(`${c} ${steps.join(',')}: ${why}`); return ['Commit', 'Push', 'Pull request'] }, planInstruction: () => '', submitPlan: async () => ({ text: '' }) } as never
    const c = await connect((await setup(undefined, undefined, undefined, wf)).url, 'a1')
    const reply = text(await c.callTool({ name: 'skip_steps', arguments: { steps: ['commit', 'push', 'pr'], why: 'Nothing changed.' } }))
    expect(reply).toContain('Asked the person to skip Commit, Push, Pull request.')
    expect(reply).toContain('Their answer arrives as your next message')
    expect(calls).toEqual(['a1 commit,push,pr: Nothing changed.'])
  })
})

describe('builder tools', () => {
  const calls: string[] = []
  const builder = {
    offered: (c: string) => c === 'a1',
    list: (c: string) => (calls.push(`list:${c}`), '- standard (built in): Standard'),
    get: (c: string, id: string) => {
      calls.push(`get:${c}:${id}`)
      if (id === 'nope') throw new Error('No workflow "nope".')
      return '{"id":"bug-fix"}'
    },
    history: (c: string, id: string) => {
      calls.push(`history:${c}:${id}`)
      return '2026-10-17 10:00 · replaced the saved one · added Lint'
    },
    propose: (c: string, file: string) => {
      calls.push(`propose:${c}:${file}`)
      if (file === 'bad') throw new Error('Nothing was proposed, because the file has problems.\n- "name" is required')
      return 'Proposed "Bug fix".'
    }
  }
  it('are offered only to the agent the office says is the builder', async () => {
    const s = await setup(undefined, undefined, undefined, undefined, builder)
    const names = async (agent: string) => (await (await connect(s.url, agent)).listTools()).tools.map((t) => t.name)
    expect(await names('a1')).toEqual(expect.arrayContaining(['workflow_list', 'workflow_get', 'workflow_propose']))
    const other = await names('a2')
    expect(other).not.toContain('workflow_list')
    expect(other).not.toContain('workflow_propose')
  })

  it('say they change nothing in the project, which is what lets a read-only (plan mode) agent call them', async () => {
    const s = await setup(undefined, undefined, undefined, undefined, builder)
    const tools = (await (await connect(s.url, 'a1')).listTools()).tools.filter((t) => t.name.startsWith('workflow_'))
    expect(tools.map((t) => t.name).sort()).toEqual(['workflow_get', 'workflow_history', 'workflow_list', 'workflow_propose'])
    for (const t of tools) expect(t.annotations?.readOnlyHint, t.name).toBe(true)
  })

  it('are not offered at all when the app has no builder', async () => {
    const s = await setup()
    expect((await (await connect(s.url, 'a1')).listTools()).tools.map((t) => t.name)).not.toContain('workflow_propose')
  })

  it('reach the office with the caller and what was asked, and answer in its words', async () => {
    calls.length = 0
    const s = await setup(undefined, undefined, undefined, undefined, builder)
    const c = await connect(s.url, 'a1')
    expect(text(await c.callTool({ name: 'workflow_list', arguments: {} }))).toBe('- standard (built in): Standard')
    expect(text(await c.callTool({ name: 'workflow_get', arguments: { id: 'bug-fix' } }))).toBe('{"id":"bug-fix"}')
    expect(text(await c.callTool({ name: 'workflow_history', arguments: { id: 'bug-fix' } }))).toBe('2026-10-17 10:00 · replaced the saved one · added Lint')
    expect(text(await c.callTool({ name: 'workflow_propose', arguments: { file: '{"version":1}' } }))).toBe('Proposed "Bug fix".')
    expect(calls).toEqual(['list:a1', 'get:a1:bug-fix', 'history:a1:bug-fix', 'propose:a1:{"version":1}'])
  })

  it('send a refusal back as an error the agent can read, with every problem', async () => {
    const s = await setup(undefined, undefined, undefined, undefined, builder)
    const c = await connect(s.url, 'a1')
    const bad = (await c.callTool({ name: 'workflow_propose', arguments: { file: 'bad' } })) as { isError?: boolean }
    expect(bad.isError).toBe(true)
    expect(text(bad)).toContain('"name" is required')
    const none = (await c.callTool({ name: 'workflow_get', arguments: { id: 'nope' } })) as { isError?: boolean }
    expect(none.isError).toBe(true)
    expect(text(none)).toBe('No workflow "nope".')
  })
})

describe('broadcast_message', () => {
  const broadcasts: { from: string; message: string; expectsReply: boolean }[] = []
  const start = (broadcast?: Parameters<typeof startMcpServer>[0]['broadcast']) =>
    startMcpServer({ agentForToken: (t) => (t === 'tok-a1' ? 'a1' : null), listAgents: () => [], send: () => 'queued', remember: () => {}, recall: () => [], broadcast })
  it('is offered only when the office can broadcast, and tells every agent once, answering with a line for each', async () => {
    const without = await start()
    clients.push(await connect(without.url, 'a1'))
    expect((await clients.at(-1)!.listTools()).tools.map((t) => t.name)).not.toContain('broadcast_message')
    await without.close()
    broadcasts.length = 0
    server = await start((from, message, expectsReply) => {
      broadcasts.push({ from, message, expectsReply })
      return { id: 'b1', results: [{ name: 'linus', status: 'delivered' }, { name: 'tester', status: 'asleep', reason: 'only the person can wake it' }] }
    })
    const c = await connect(server.url, 'a1')
    const r = text(await c.callTool({ name: 'broadcast_message', arguments: { message: 'rebase please' } }))
    expect(broadcasts).toEqual([{ from: 'a1', message: 'rebase please', expectsReply: true }])
    expect(r).toContain('Broadcast to 2 agents (id b1):')
    expect(r).toContain('tester: asleep (only the person can wake it)')
    await c.callTool({ name: 'broadcast_message', arguments: { message: 'fyi', expects_reply: false } })
    expect(broadcasts.at(-1)!.expectsReply).toBe(false)
  })
  it('says why when nobody can be told', async () => {
    server = await start(() => { throw new Error('There is no other agent in this project to tell.') })
    const c = await connect(server.url, 'a1')
    const r = await c.callTool({ name: 'broadcast_message', arguments: { message: 'hi' } })
    expect((r as { isError?: boolean }).isError).toBe(true)
    expect(text(r)).toContain('no other agent')
  })
})
