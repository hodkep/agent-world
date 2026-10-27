import { afterEach, describe, expect, it } from 'vitest'
import type { AgentEvent, PermissionRequest } from '../../../shared/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UsageRecord } from '../../../shared/tokens'
import { startHookServer } from './hookServer'

type Server = Awaited<ReturnType<typeof startHookServer>>
let server: Server | undefined
afterEach(() => server?.close())

async function setup(permissionTimeoutMs = 5_000, reminderFor?: (id: string, prompt: string, origin: { fromProgram: () => Promise<boolean> }) => string | null | Promise<string | null>, blockEdit?: (id: string, file: string, cwd: string) => string | null, callerIsProgram?: (id: string, port: number) => Promise<boolean>) {
  const tools: [string, string, unknown][] = []
  const compacted: string[] = []
  const toolInputs: [string, string][] = []
  const events: AgentEvent[] = []
  const asks: PermissionRequest[] = []
  const settled: string[] = []
  const stats: unknown[] = []
  const usage: [string, UsageRecord[]][] = []
  server = await startHookServer({
    onUsage: (id, records) => usage.push([id, records]),
    reminderFor,
    blockEdit,
    callerIsProgram,
    onToolUse: (id, tool, input) => tools.push([id, tool, input]),
    onCompact: (id) => compacted.push(id),
    onStatus: (s) => stats.push(s),
    onToolInput: (id, json) => toolInputs.push([id, json]),
    agentForToken: (t) => (t === 'secret' ? 'a1' : null),
    permissionTimeoutMs,
    onEvent: (e) => events.push(e),
    onPermission: (r) => asks.push(r),
    onPermissionSettled: (id) => settled.push(id)
  })
  return { server, events, asks, settled, stats, toolInputs, tools, compacted, usage }
}

const post = (url: string, body: unknown, token = 'secret') =>
  fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })

const permission = { session_id: 's1', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf build' } }
const until = async (cond: () => boolean) => {
  while (!cond()) await new Promise((r) => setTimeout(r, 5))
}

describe('hook server', () => {
  it('listens on loopback only', async () => {
    const { server } = await setup()
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/hook$/)
  })

  it('passes on what a tool call was given, for whoever wants the addresses in it', async () => {
    const { server, toolInputs } = await setup()
    await post(server.url, { session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'mcp__playwright__browser_navigate', tool_input: { url: 'http://localhost:5287/login' } })
    expect(toolInputs).toEqual([['a1', '{"url":"http://localhost:5287/login"}']])
  })

  it('rejects requests without the token', async () => {
    const { server, events } = await setup()
    const res = await post(server.url, { session_id: 's1', hook_event_name: 'Stop' }, 'wrong')
    expect(res.status).toBe(401)
    expect(events).toEqual([])
  })

  it('forwards normalized events and answers with an empty 200', async () => {
    const { server, events } = await setup()
    const res = await post(server.url, { session_id: 's1', hook_event_name: 'Stop' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
    expect(events).toEqual([{ type: 'activity', agentId: 'a1', sessionId: 's1', activity: 'idle' }])
  })

  it('holds a permission request until the user allows it', async () => {
    const { server, asks, events } = await setup()
    const pending = post(server.url, permission)
    await until(() => asks.length === 1)
    expect(asks[0]).toMatchObject({ agentId: 'a1', sessionId: 's1', tool: 'Bash', detail: 'rm -rf build' })
    expect(events.at(-1)).toMatchObject({ activity: 'permission', detail: 'rm -rf build' })

    server.decide(asks[0]!.id, 'allow')
    const res = await pending
    expect(await res.json()).toEqual({
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } }
    })
  })

  it('goes back to working on the tool once you allow it (Claude sends no event while the tool runs), and to thinking on a deny', async () => {
    const { server, asks, events } = await setup()
    const pending = post(server.url, permission)
    await until(() => asks.length === 1)
    server.decide(asks[0]!.id, 'allow')
    await pending
    expect(events.at(-1)).toMatchObject({ activity: 'running', tool: 'Bash' })
    const second = post(server.url, permission)
    await until(() => asks.length === 2)
    server.decide(asks[1]!.id, 'deny')
    await second
    expect(events.at(-1)).toMatchObject({ activity: 'thinking' })
  })

  it('passes a deny decision through', async () => {
    const { server, asks } = await setup()
    const pending = post(server.url, permission)
    await until(() => asks.length === 1)
    server.decide(asks[0]!.id, 'deny')
    expect((await (await pending).json()).hookSpecificOutput.decision.behavior).toBe('deny')
  })

  it('falls back to the terminal dialog (empty answer) when nobody decides in time', async () => {
    const { server, asks, settled } = await setup(50)
    const res = await post(server.url, permission)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
    expect(settled).toEqual([asks[0]!.id])
  })

  it('ignores decisions for unknown or already settled requests', async () => {
    const { server } = await setup()
    expect(() => server.decide('nope', 'allow')).not.toThrow()
  })

  it('takes statusline updates and answers with the text for Claude\'s status bar', async () => {
    const { server, stats } = await setup()
    const url = server.url.replace(/\/hook$/, '/status')
    const res = await post(url, { session_id: 's1', model: { display_name: 'Opus' }, context_window: { used_percentage: 12 }, cost: { total_cost_usd: 1.5 } })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Agent World · Opus · context 12% · $1.50')
    expect(stats).toMatchObject([{ sessionId: 's1', model: 'Opus', contextPct: 12, costUsd: 1.5 }])
  })

  it('status updates need the token too', async () => {
    const { server, stats } = await setup()
    const res = await post(server.url.replace(/\/hook$/, '/status'), { session_id: 's1' }, 'wrong')
    expect(res.status).toBe(401)
    expect(stats).toEqual([])
  })

  it('does not hold plan approval: Claude shows its own plan menu, which the app answers from the screen', async () => {
    const { server, asks, events } = await setup()
    const res = await post(server.url, { session_id: 's1', hook_event_name: 'PermissionRequest', tool_name: 'ExitPlanMode', tool_input: { plan: '# Plan\n1. do it' } })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
    expect(asks).toEqual([])
    expect(events.at(-1)).toMatchObject({ activity: 'permission', detail: 'plan ready for review' })
  })

  it('does not hold AskUserQuestion either: its own menu is answered from the app', async () => {
    const { server, asks, events } = await setup()
    const res = await post(server.url, { session_id: 's1', hook_event_name: 'PermissionRequest', tool_name: 'AskUserQuestion', tool_input: { questions: [] } })
    expect(await res.text()).toBe('')
    expect(asks).toEqual([])
    expect(events.at(-1)).toMatchObject({ activity: 'permission', detail: 'has a question for you' })
  })

  it('a permission answered in the terminal clears its card when that tool finishes', async () => {
    const { server, asks, settled, events } = await setup()
    const pending = post(server.url, { ...permission, tool_use_id: 'tu1' })
    await until(() => asks.length === 1)
    await post(server.url, { session_id: 's1', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'tu1' })
    expect(await (await pending).text()).toBe('')
    expect(settled).toEqual([asks[0]!.id])
    expect(events.at(-1)).toMatchObject({ activity: 'thinking' })
  })

  it('a finished or new turn clears every card the agent still has open', async () => {
    const { server, asks, settled } = await setup()
    void post(server.url, { ...permission, tool_use_id: 'tu1' })
    await until(() => asks.length === 1)
    await post(server.url, { session_id: 's1', hook_event_name: 'Stop' })
    await until(() => settled.length === 1)
    expect(settled).toEqual([asks[0]!.id])
  })

  it('the app can dismiss an agent\'s open cards when its terminal menu closes, and the agent resumes the tool', async () => {
    const { server, asks, settled, events } = await setup()
    void post(server.url, { ...permission, tool_use_id: 'tu1' })
    await until(() => asks.length === 1)
    server.dismiss('a1')
    await until(() => settled.length === 1)
    expect(events.at(-1)).toMatchObject({ activity: 'running', tool: 'Bash', detail: 'rm -rf build' })
  })

  it('lets the reminder ask where the call came from: the port of its connection goes to the app, which says whether it is the program\'s own', async () => {
    const asked: [string, number][] = []
    const { server: s } = await setup(5_000, async (_id, _prompt, origin) => ((await origin.fromProgram()) ? 'from the program' : 'not the program'), undefined, async (id, port) => (asked.push([id, port]), port > 0 && asked.length === 1))
    const first = await post(s.url, { hook_event_name: 'UserPromptSubmit', prompt: 'x' })
    expect(await first.text()).toContain('from the program')
    const second = await post(s.url, { hook_event_name: 'UserPromptSubmit', prompt: 'x' })
    expect(await second.text()).toContain('not the program')
    expect(asked[0]![0]).toBe('a1')
    expect(Number.isInteger(asked[0]![1])).toBe(true)
  })
  it('adds a reminder to what Claude is told each time a message is sent, for the agent that has one, and only then', async () => {
    const { server } = await setup(5_000, (id) => (id === 'a1' ? 'Reminder: terse (always).' : null))
    const res = await post(server.url, { session_id: 's1', hook_event_name: 'UserPromptSubmit', prompt: 'hi' })
    expect(await res.json()).toEqual({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'Reminder: terse (always).' } })
    const stop = await post(server.url, { session_id: 's1', hook_event_name: 'Stop' })
    expect(await stop.text()).toBe('')
  })

  it('answers a message with nothing when the agent has no reminder', async () => {
    const { server } = await setup(5_000, () => null)
    const res = await post(server.url, { session_id: 's1', hook_event_name: 'UserPromptSubmit', prompt: 'hi' })
    expect(await res.text()).toBe('')
  })
  it('hands the prompt to the reminder, and reports tool calls and compactions', async () => {
    const seen: string[] = []
    const { server, tools, compacted } = await setup(5_000, (_, prompt) => (seen.push(prompt), 'hint'))
    await post(server.url, { session_id: 's1', hook_event_name: 'UserPromptSubmit', prompt: 'split the pdf' })
    await post(server.url, { session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'pdf' } })
    await post(server.url, { session_id: 's1', hook_event_name: 'PostCompact' })
    expect(seen).toEqual(['split the pdf'])
    expect(tools).toEqual([['a1', 'Skill', { skill: 'pdf' }]])
    expect(compacted).toEqual(['a1'])
  })

  it('refuses an edit the office is holding back, saying why, and lets every other tool and every allowed edit through', async () => {
    const asked: [string, string, string][] = []
    const { server } = await setup(5_000, undefined, (id, file, cwd) => (asked.push([id, file, cwd]), file.endsWith('blocked.ts') ? 'Not yet: your plan is waiting.' : null))
    const edit = (tool: string, input: object) => post(server.url, { session_id: 's1', cwd: '/w', hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input })
    const denied = await edit('Edit', { file_path: '/w/src/blocked.ts', old_string: 'a', new_string: 'b' })
    expect(await denied.json()).toEqual({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Not yet: your plan is waiting.' } })
    expect((await edit('Write', { file_path: '/w/src/fine.ts', content: 'x' })).status).toBe(200)
    expect(await (await edit('NotebookEdit', { notebook_path: '/w/blocked.ts' })).json()).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } })
    expect(await (await edit('Bash', { command: 'ls' })).text()).toBe('')
    expect(asked).toEqual([['a1', '/w/src/blocked.ts', '/w'], ['a1', '/w/src/fine.ts', '/w'], ['a1', '/w/blocked.ts', '/w']])
  })

  describe('Claude Code OpenTelemetry events', () => {
    const sample = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'otlp-logs.json'), 'utf8'))
    const base = (url: string) => url.replace(/\/hook$/, '')

    it('are taken from the agent whose token comes with them, as one record per request', async () => {
      const { server, usage } = await setup()
      const res = await post(`${base(server.url)}/v1/logs`, sample)
      expect(res.status).toBe(200)
      expect(usage).toHaveLength(1)
      expect(usage[0]![0]).toBe('a1')
      expect(usage[0]![1].map((r) => r.output)).toEqual([160, 360, 116])
    })

    it('are refused without a token the office gave, and nothing is recorded', async () => {
      const { server, usage } = await setup()
      expect((await post(`${base(server.url)}/v1/logs`, sample, 'wrong')).status).toBe(401)
      expect(usage).toEqual([])
    })

    it('are answered, and ignored, when they are metrics or carry no request', async () => {
      const { server, usage } = await setup()
      expect((await post(`${base(server.url)}/v1/metrics`, { resourceMetrics: [] })).status).toBe(200)
      expect((await post(`${base(server.url)}/v1/logs`, { resourceLogs: [] })).status).toBe(200)
      expect(usage).toEqual([])
    })
  })
})
