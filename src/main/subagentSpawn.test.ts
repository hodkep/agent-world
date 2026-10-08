import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../shared/chat'
import { MAX_DEPTH, MAX_RUNNING, checkSpawn, childInfo, depthOf, finalReport, subagentPrompt } from './subagentSpawn'

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
    const done = childInfo({ id: 'c1', provider: 'agy', task: 'Add GET /export' }, items, true)
    expect(done).toMatchObject({ agentId: 'c1', type: 'agy', description: 'Add GET /export', done: true, result: 'Done: added the endpoint.', startedAt: 100, updatedAt: 300, depth: 1, background: false })
    expect(done.calls).toEqual([{ at: 150, name: 'Bash', detail: 'ls src' }])
    expect(childInfo({ id: 'c1', provider: 'agy', task: 'x' }, items, false)).toMatchObject({ done: false, result: '' })
  })
})
