import { describe, expect, it } from 'vitest'
import type { SubagentInfo } from '../../shared/chat'
import { CONCURRENT_LIMIT, crewCounts, crewRows, followUpText, splitCrew, staleInterns, stopRequestText } from './crewRows'

const sub = (id: string, startedAt: number, over: Partial<SubagentInfo> = {}): SubagentInfo => ({ agentId: id, toolUseId: `use-${id}`, type: 'Explore', description: `task ${id}`, startedAt, updatedAt: startedAt + 1000, done: false, calls: [], result: '', depth: 1, background: true, spawns: [], stopped: false, ...over })

describe('the subagents of one main agent, in order', () => {
  it('lists them by when they started, with the ones a subagent started itself right under it, one level in', () => {
    const rows = crewRows([sub('c', 3000, { depth: 2 }), sub('b', 2000), sub('a', 1000, { spawns: ['use-c'] }), sub('d', 4000)])
    expect(rows.map((r) => [r.info.agentId, r.level])).toEqual([['a', 0], ['c', 1], ['b', 0], ['d', 0]])
  })

  it('does not lose one whose parent is unknown or that points back at itself', () => {
    const rows = crewRows([sub('x', 1000, { depth: 2 }), sub('y', 2000, { spawns: ['use-y'] })])
    expect(rows.map((r) => r.info.agentId).sort()).toEqual(['x', 'y'])
  })
})

describe('counting them', () => {
  const now = 10_000
  it('counts what is working, done and stopped, and how many more may start', () => {
    const c = crewCounts([sub('a', 1000), sub('b', 1000, { done: true }), sub('c', 1000, { updatedAt: 1000 })], now + 11 * 60_000)
    expect(c).toMatchObject({ working: 0, done: 1, stopped: 2, total: 3 })
    expect(crewCounts([sub('a', 1000), sub('b', 2000)], now)).toMatchObject({ working: 2, done: 0, limit: CONCURRENT_LIMIT })
    expect(CONCURRENT_LIMIT).toBe(20)
  })
})

describe('what the buttons say to the main agent', () => {
  it('asks it to stop one subagent by its id, naming the task so it is not mistaken for another', () => {
    const t = stopRequestText(sub('a1', 1000, { description: 'Map auth' }))
    expect(t).toContain('a1')
    expect(t).toContain('Map auth')
    expect(t).toMatch(/TaskStop/)
  })

  it('opens a follow-up that names the subagent and its id', () => {
    const t = followUpText(sub('a1', 1000, { description: 'Map auth', type: 'Plan' }))
    expect(t).toContain('a1')
    expect(t).toContain('Map auth')
  })
})

describe('what is happening now, and what has finished', () => {
  const now = 10_000
  it('puts the ones that are working first and the ones that finished or were stopped in a list of their own', () => {
    const rows = crewRows([sub('a', 1000, { done: true }), sub('b', 2000), sub('c', 3000, { stopped: true }), sub('d', 4000)])
    const { active, finished } = splitCrew(rows, now)
    expect(active.map((r) => r.info.agentId)).toEqual(['b', 'd'])
    expect(finished.map((r) => r.info.agentId)).toEqual(['c', 'a'])
  })

  it('keeps a finished one with the active list while one it started is still working, so the tree stays whole', () => {
    const rows = crewRows([sub('p', 1000, { done: true, spawns: ['use-k'] }), sub('k', 2000, { depth: 2 }), sub('q', 3000, { done: true })])
    const { active, finished } = splitCrew(rows, now)
    expect(active.map((r) => [r.info.agentId, r.level])).toEqual([['p', 0], ['k', 1]])
    expect(finished.map((r) => r.info.agentId)).toEqual(['q'])
  })

  it('has nothing active when everything is done, newest finished first', () => {
    const { active, finished } = splitCrew(crewRows([sub('a', 1000, { done: true }), sub('b', 2000, { done: true })]), now)
    expect(active).toEqual([])
    expect(finished.map((r) => r.info.agentId)).toEqual(['b', 'a'])
  })
})

describe('office characters for subagents that are over', () => {
  const now = 10_000
  it('names the ones the office still shows although Claude says they answered or were stopped', () => {
    const infos = [sub('a', 1000, { done: true }), sub('b', 1000, { stopped: true }), sub('c', 1000)]
    expect(staleInterns(['a', 'b', 'c', 'ghost'], infos, now).sort()).toEqual(['a', 'b'])
  })

  it('leaves alone one whose files are not there yet, and one that is still working', () => {
    expect(staleInterns(['not-yet', 'c'], [sub('c', 1000)], now)).toEqual([])
  })
})
