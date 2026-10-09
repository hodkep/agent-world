import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../shared/chat'
import { DEFAULT_LIMITS, MAX_DEPTH, MAX_RUNNING, checkSpawn, childInfo, depthOf, finalReport, mayTrust, shownTo, staleChildren, subagentPrompt, withoutOrphans } from './subagentSpawn'

const a = (id: string, parent?: string) => ({ id, parent })

describe('depthOf', () => {
  it('counts the parents above an agent', () => {
    const all = [a('root'), a('c1', 'root'), a('g1', 'c1')]
    expect([depthOf(all, 'root'), depthOf(all, 'c1'), depthOf(all, 'g1')]).toEqual([0, 1, 2])
  })
  it('stops at a loop in the records instead of running for ever', () => {
    expect(depthOf([a('x', 'y'), a('y', 'x')], 'x')).toBeGreaterThan(MAX_DEPTH)
  })
})

describe('checkSpawn', () => {
  const tree = [a('root'), a('c1', 'root'), a('g1', 'c1')]
  it('lets an agent and its child start subagents, but not a grandchild', () => {
    expect(checkSpawn(tree, 'root', new Set())).toBeNull()
    expect(checkSpawn(tree, 'c1', new Set())).toBeNull()
    expect(checkSpawn(tree, 'g1', new Set())).toMatch(/too deep/i)
  })
  it('stops at the number of children already working for one parent', () => {
    const kids = Array.from({ length: MAX_RUNNING }, (_, i) => a(`k${i}`, 'root'))
    expect(checkSpawn([a('root'), ...kids], 'root', new Set(kids.map((k) => k.id)))).toMatch(/already has/i)
    expect(checkSpawn([a('root'), ...kids], 'root', new Set(kids.slice(1).map((k) => k.id)))).toBeNull()
  })
  it('uses the limits it is given: how deep, and how many at once', () => {
    expect(checkSpawn(tree, 'g1', new Set(), { maxDepth: 3, maxRunning: 3 })).toBeNull()
    expect(checkSpawn(tree, 'c1', new Set(), { maxDepth: 1, maxRunning: 3 })).toMatch(/too deep/i)
    const kids = [a('k0', 'root'), a('k1', 'root')]
    expect(checkSpawn([a('root'), ...kids], 'root', new Set(['k0', 'k1']), { maxDepth: 2, maxRunning: 2 })).toMatch(/already has 2/i)
    expect(DEFAULT_LIMITS).toEqual({ maxDepth: MAX_DEPTH, maxRunning: MAX_RUNNING })
  })
  it('knows nothing of an agent that is not there', () => {
    expect(checkSpawn(tree, 'nobody', new Set())).toMatch(/unknown/i)
  })
})

describe('subagentPrompt', () => {
  it('says who asked, what to do, where to work and how to answer', () => {
    const t = subagentPrompt('Add GET /export', 'ada', { branch: 'aw/export-api', worktree: true })
    expect(t).toContain('ada')
    expect(t).toContain('Add GET /export')
    expect(t).toContain('aw/export-api')
    expect(t).toMatch(/final message/i)
  })
  it('says a shared folder is for reading only', () => {
    expect(subagentPrompt('Read the exporter', 'ada', { branch: null, worktree: false })).toMatch(/do not edit/i)
  })
})

describe('what a child shows its parent', () => {
  const items: ChatItem[] = [
    { kind: 'user', id: 'u', at: 100, text: 'task' },
    { kind: 'tool', id: 't', at: 150, toolUseId: 'x', name: 'Bash', input: { command: 'ls src' } },
    { kind: 'assistant', id: 'a1', at: 200, text: 'Working on it' },
    { kind: 'assistant', id: 'a2', at: 300, text: 'Done: added the endpoint.' }
  ]
  it('reports the last thing it said once it is idle, and nothing while it works or before it was asked', () => {
    expect(finalReport(items, true)).toBe('Done: added the endpoint.')
    expect(finalReport(items, false)).toBeNull()
    expect(finalReport([], true)).toBeNull()
    expect(finalReport([{ kind: 'assistant', id: 'g', at: 1, text: 'Hello' }], true)).toBeNull()
  })
  it('is listed like any subagent: its provider as its type, its task as its description, its calls and its answer when done', () => {
    const done = childInfo({ id: 'c1', provider: 'agy', task: 'Add GET /export' }, items, true, true)
    expect(done).toMatchObject({ agentId: 'c1', type: 'agy', description: 'Add GET /export', done: true, result: 'Done: added the endpoint.', startedAt: 100, updatedAt: 300, depth: 1, background: false })
    expect(done.calls).toEqual([{ at: 150, name: 'Bash', detail: 'ls src' }])
    expect(childInfo({ id: 'c1', provider: 'agy', task: 'x' }, items, false, true)).toMatchObject({ done: false, result: '', stopped: false })
    // After a restart its program is not running and it never answered.
    expect(childInfo({ id: 'c1', provider: 'agy', task: 'x' }, items, false, false)).toMatchObject({ done: false, stopped: true })
    expect(childInfo({ id: 'c1', provider: 'agy', task: 'x' }, items, true, false)).toMatchObject({ done: true, stopped: false })
  })
})

describe('a permission a subagent asks for', () => {
  const agents = [{ id: 'p', name: 'ada', sessionId: 's-p' }, { id: 'c1', name: 'bo', sessionId: 's-c', parent: 'p' }, { id: 'g1', name: 'cy', sessionId: 's-g', parent: 'c1' }]
  const ask = (agentId: string) => ({ id: 'r1', agentId, sessionId: `s-${agentId}`, tool: 'Bash', detail: 'npm test' })
  it('is put to the user on the card of the agent they see: the top parent, naming the subagent that asked', () => {
    expect(shownTo(agents, ask('c1'))).toEqual({ id: 'r1', agentId: 'p', sessionId: 's-p', tool: 'Bash', detail: 'bo (subagent) wants: npm test' })
    expect(shownTo(agents, ask('g1'))).toMatchObject({ agentId: 'p', detail: 'cy (subagent) wants: npm test' })
  })
  it('is left as it is for an agent that is in the office', () => {
    expect(shownTo(agents, ask('p'))).toEqual(ask('p'))
    expect(shownTo(agents, ask('nobody'))).toEqual(ask('nobody'))
  })
})

describe('after a restart', () => {
  it('drops subagents whose parent is gone, and theirs, and keeps the rest', () => {
    const all = [a('root'), a('c1', 'root'), a('lost', 'removed'), a('g-of-lost', 'lost'), a('solo')]
    expect(withoutOrphans(all).map((x) => x.id)).toEqual(['root', 'c1', 'solo'])
  })
})

describe('a program asking whether to trust the folder a subagent works in', () => {
  const agents = [{ id: 'p', cwd: '/work/shop' }, { id: 'c1', cwd: '/work/shop', parent: 'p' }, { id: 'c2', cwd: '/home/u/.agent-world/worktrees/shop/bo', parent: 'p' }, { id: 'c3', cwd: '/elsewhere', parent: 'p' }, { id: 'solo', cwd: '/work/other' }]
  const root = '/home/u/.agent-world/worktrees'
  it('is answered yes for the folder its parent works in, and for a worktree the office made for it', () => {
    expect(mayTrust(agents, 'c1', root)).toBe(true)
    expect(mayTrust(agents, 'c2', root)).toBe(true)
  })
  it('is left to the user for any other folder, and for an agent that is not a subagent', () => {
    expect(mayTrust(agents, 'c3', root)).toBe(false)
    expect(mayTrust(agents, 'solo', root)).toBe(false)
    expect(mayTrust(agents, 'nobody', root)).toBe(false)
  })
})

describe('when a subagent that has said nothing yet began', () => {
  it('is when it was made, not the start of time', () => {
    expect(childInfo({ id: 'c', provider: 'agy', task: 'x', hiredAt: 5000 }, [], false, true, 9000)).toMatchObject({ startedAt: 5000, updatedAt: 9000 })
  })
})

describe('subagents left behind', () => {
  const HOUR = 3_600_000
  const all = [
    { id: 'p' },
    { id: 'old-dead', parent: 'p', hiredAt: 0 },
    { id: 'new-dead', parent: 'p', hiredAt: 10 * HOUR - 5 * 60_000 },
    { id: 'old-alive', parent: 'p', hiredAt: 0 },
    { id: 'noage', parent: 'p' }
  ]
  it('are removed once their program has ended and they are an hour old, so the list does not fill with old ones', () => {
    expect(staleChildren(all, new Set(['p', 'old-alive']), 10 * HOUR)).toEqual(['old-dead', 'noage'])
  })
  it('are kept while their program runs, and never include an agent that is not a subagent', () => {
    expect(staleChildren([{ id: 'solo', hiredAt: 0 }], new Set(), 10 * HOUR)).toEqual([])
  })
})
