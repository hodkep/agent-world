import { describe, expect, it } from 'vitest'
import type { SubagentInfo } from '../../shared/chat'
import { pairSubagents } from './delegationMatch'

const info = (over: Partial<SubagentInfo>): SubagentInfo => ({ agentId: 'x', toolUseId: 'x', type: 'agy', description: '', startedAt: 0, updatedAt: 0, done: false, calls: [], result: '', depth: 1, background: false, spawns: [], stopped: false, ...over })
const call = (toolUseId: string, description: string, subagentType = 'agy') => ({ toolUseId, description, subagentType })

describe('pairSubagents', () => {
  it('matches a subagent Claude started by the call that started it', () => {
    const a = info({ agentId: 'a', toolUseId: 't1', type: 'Explore' })
    expect([...pairSubagents([call('t1', 'look')], [a]).values()]).toEqual([a])
  })

  it('matches one an agent started through the office by its task and program, since the program does not say which call made it', () => {
    const child = info({ agentId: 'c1', toolUseId: 'spawn:c1', description: 'read prefs', type: 'agy' })
    expect(pairSubagents([call('toolu_9', 'read prefs')], [child]).get('toolu_9')).toBe(child)
    expect(pairSubagents([call('toolu_9', 'read prefs', 'claude')], [child]).size).toBe(0)
  })

  it('gives two calls with the same task a subagent each, in the order they were made', () => {
    const c1 = info({ agentId: 'c1', toolUseId: 'spawn:c1', description: 'same' })
    const c2 = info({ agentId: 'c2', toolUseId: 'spawn:c2', description: 'same' })
    const m = pairSubagents([call('t1', 'same'), call('t2', 'same')], [c1, c2])
    expect([m.get('t1'), m.get('t2')]).toEqual([c1, c2])
  })

  it('leaves a call with nothing to match without one', () => {
    expect(pairSubagents([call('t1', 'nothing like it')], [info({ toolUseId: 'spawn:c1', description: 'other' })]).size).toBe(0)
  })
})
