import { afterEach, describe, expect, it } from 'vitest'
import type { AgentEvent, PermissionRequest } from '../shared/types'
import { startHookServer } from './hookServer'

type Server = Awaited<ReturnType<typeof startHookServer>>
let server: Server | undefined
afterEach(() => server?.close())

async function setup(permissionTimeoutMs = 5_000) {
  const events: AgentEvent[] = []
  const asks: PermissionRequest[] = []
  const settled: string[] = []
  const stats: unknown[] = []
  server = await startHookServer({
    onStatus: (s) => stats.push(s),
    agentForToken: (t) => (t === 'secret' ? 'a1' : null),
    permissionTimeoutMs,
    onEvent: (e) => events.push(e),
    onPermission: (r) => asks.push(r),
    onPermissionSettled: (id) => settled.push(id)
  })
  return { server, events, asks, settled, stats }
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
})
