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
  server = await startHookServer({
    token: 'secret',
    permissionTimeoutMs,
    onEvent: (e) => events.push(e),
    onPermission: (r) => asks.push(r),
    onPermissionSettled: (id) => settled.push(id)
  })
  return { server, events, asks, settled }
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
    expect(events).toEqual([{ type: 'activity', sessionId: 's1', activity: 'idle' }])
  })

  it('holds a permission request until the user allows it', async () => {
    const { server, asks, events } = await setup()
    const pending = post(server.url, permission)
    await until(() => asks.length === 1)
    expect(asks[0]).toMatchObject({ sessionId: 's1', tool: 'Bash', detail: 'rm -rf build' })
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
})
