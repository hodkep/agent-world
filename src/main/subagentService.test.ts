import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../shared/chat'
import { createSubagents } from './subagentService'

interface Rec { id: string; name: string; provider?: string; branch: string | null; parent?: string; task?: string }

function setup(over: { createFails?: string; limits?: { maxDepth: number; maxRunning: number } } = {}) {
  const agents: Rec[] = [{ id: 'p', name: 'ada', provider: 'claude', branch: 'aw/ada' }]
  const convo = new Map<string, ChatItem[]>()
  const idle = new Set<string>()
  const dead = new Set<string>()
  const delivered: { to: string; text: string }[] = []
  const stopped: string[] = []
  let n = 0
  const svc = createSubagents({
    agents: () => agents,
    byId: (id) => agents.find((a) => a.id === id),
    create: async (parent, i) => {
      if (over.createFails) throw new Error(over.createFails)
      const c: Rec = { id: `c${++n}`, name: `bo${n}`, provider: i.provider, branch: i.worktree === false ? null : `aw/bo${n}`, parent: parent.id, task: i.task }
      agents.push(c)
      return c
    },
    deliver: (child, text) => void delivered.push({ to: child.id, text }),
    items: (id) => convo.get(id) ?? [],
    idle: (id) => idle.has(id),
    alive: (id) => !dead.has(id),
    stop: (id) => void stopped.push(id),
    limits: over.limits ? () => over.limits! : undefined,
    // Time passing: a real turn of the event loop, so the test can act while a call waits.
    sleep: () => new Promise<void>((r) => setTimeout(r, 1))
  })
  const finish = (id: string, text: string) => (convo.set(id, [{ kind: 'user', id: 'u', at: 1, text: 'task' }, { kind: 'assistant', id: 'a', at: 5, text }]), idle.add(id))
  return { svc, agents, convo, finish, idle, dead, delivered, stopped }
}

describe('starting a subagent', () => {
  it('starts the child, tells it the task, and (blocking) answers with its report once it is done', async () => {
    const t = setup()
    const run = t.svc.spawn('p', { provider: 'agy', task: 'Add GET /export' })
    await new Promise((r) => setTimeout(r, 5))
    expect(t.delivered).toHaveLength(1)
    expect(t.delivered[0]!.text).toContain('Add GET /export')
    t.finish('c1', 'Added it.')
    expect(await run).toEqual({ id: 'c1', name: 'bo1', status: 'done', branch: 'aw/bo1', report: 'Added it.' })
  })

  it('returns at once in the background, and the report comes with wait', async () => {
    const t = setup()
    const r = await t.svc.spawn('p', { provider: 'claude', task: 'Read it', worktree: false, background: true })
    expect(r).toEqual({ id: 'c1', name: 'bo1', status: 'working', branch: null })
    const waiting = t.svc.wait('p', ['c1'])
    t.finish('c1', 'It is fine.')
    expect(await waiting).toMatchObject({ id: 'c1', status: 'done', report: 'It is fine.' })
  })

  it('refuses past the cap and from too deep, saying why, and starts nothing', async () => {
    const t = setup()
    for (let i = 0; i < 3; i++) await t.svc.spawn('p', { provider: 'agy', task: `t${i}`, background: true })
    await expect(t.svc.spawn('p', { provider: 'agy', task: 'one more', background: true })).rejects.toThrow(/already has 3/)
    expect(t.agents.filter((a) => a.parent === 'p')).toHaveLength(3)
    const deep = setup()
    await deep.svc.spawn('p', { provider: 'agy', task: 'child', background: true })
    await deep.svc.spawn('c1', { provider: 'agy', task: 'grandchild', background: true })
    await expect(deep.svc.spawn('c2', { provider: 'agy', task: 'too far', background: true })).rejects.toThrow(/too deep/)
  })

  it('follows the limits it is given', async () => {
    const t = setup({ limits: { maxDepth: 2, maxRunning: 1 } })
    await t.svc.spawn('p', { provider: 'agy', task: 'a', background: true })
    await expect(t.svc.spawn('p', { provider: 'agy', task: 'b', background: true })).rejects.toThrow(/already has 1/)
  })

  it('frees a place once a child has finished', async () => {
    const t = setup()
    for (let i = 0; i < 3; i++) await t.svc.spawn('p', { provider: 'agy', task: `t${i}`, background: true })
    t.finish('c1', 'done')
    await expect(t.svc.spawn('p', { provider: 'agy', task: 'next', background: true })).resolves.toMatchObject({ status: 'working' })
  })

  it('passes on why the child could not be made', async () => {
    await expect(setup({ createFails: 'agy is not signed in.' }).svc.spawn('p', { provider: 'agy', task: 'x' })).rejects.toThrow('agy is not signed in.')
  })

  it('reports a child that ended without answering', async () => {
    const t = setup()
    const run = t.svc.spawn('p', { provider: 'agy', task: 'x' })
    await new Promise((r) => setTimeout(r, 5))
    t.dead.add('c1')
    expect(await run).toMatchObject({ status: 'stopped', report: expect.stringMatching(/without answering/) })
  })
})

describe('waiting, stopping and listing', () => {
  it('only waits for and stops the caller\'s own children', async () => {
    const t = setup()
    t.agents.push({ id: 'q', name: 'cy', branch: null })
    await t.svc.spawn('p', { provider: 'agy', task: 'x', background: true })
    await expect(t.svc.wait('q', ['c1'])).rejects.toThrow(/not your subagent/i)
    expect(() => t.svc.stop('q', 'c1')).toThrow(/not your subagent/i)
    expect(t.svc.stop('p', 'c1')).toContain('Stopped')
    expect(t.stopped).toEqual(['c1'])
  })

  it('lists a parent\'s children as subagents, and reads one\'s conversation only for its parent', async () => {
    const t = setup()
    await t.svc.spawn('p', { provider: 'agy', task: 'Add GET /export', background: true })
    t.finish('c1', 'Added it.')
    expect(t.svc.infos('p')).toMatchObject([{ agentId: 'c1', type: 'agy', description: 'Add GET /export', done: true, result: 'Added it.' }])
    expect(t.svc.infos('q')).toEqual([])
    expect(t.svc.conversation('p', 'c1')).toHaveLength(2)
    expect(t.svc.conversation('q', 'c1')).toEqual([])
  })
})
