import { describe, expect, it } from 'vitest'
import { latestContext, nudgeFor } from './contextNudge'
import type { LedgerEvent } from './ledger'

describe('nudgeFor', () => {
  it('says nothing under the size it is set to, or when it is off', () => {
    expect(nudgeFor(120_000, undefined, 150_000)).toBeNull()
    expect(nudgeFor(900_000, undefined, 0)).toBeNull()
  })
  it('tells an agent its context is big, once it reaches the size', () => {
    const n = nudgeFor(152_300, undefined, 150_000)!
    expect(n.at).toBe(152_300)
    expect(n.text).toContain('152k')
  })
  it('points to both ways out: compacting, and a note with remember before a fresh session', () => {
    const { text } = nudgeFor(200_000, undefined, 150_000)!
    expect(text).toContain('/compact')
    expect(text).toContain('remember')
  })
  it('stays short, since it is added to a message each time', () => {
    expect(nudgeFor(200_000, undefined, 150_000)!.text.length).toBeLessThan(420)
  })
  it('does not repeat itself until the context has grown by another 50k since the last time', () => {
    expect(nudgeFor(180_000, 152_000, 150_000)).toBeNull()
    expect(nudgeFor(203_000, 152_000, 150_000)?.at).toBe(203_000)
  })
})

describe('latestContext', () => {
  const req = (t: number, agent: string, ctx: number): LedgerEvent => ({ k: 'req', t, agent, project: 'p', model: 'm', provider: 'claude', input: 2, cacheRead: ctx - 2, cacheWrite: 0, output: 5 })
  const compact = (t: number, agent: string): LedgerEvent => ({ k: 'mark', t, agent, project: 'p', what: 'compact' })
  it('is what the agent\'s last request had in front of it', () => {
    expect(latestContext([req(1, 'a', 90_000), req(2, 'b', 300_000), req(3, 'a', 160_000)], 'a')).toBe(160_000)
  })
  it('is 0 for an agent with no request yet, or one compacted since its last request', () => {
    expect(latestContext([req(1, 'b', 300_000)], 'a')).toBe(0)
    expect(latestContext([req(1, 'a', 300_000), compact(2, 'a')], 'a')).toBe(0)
    expect(latestContext([req(1, 'a', 300_000), compact(2, 'b')], 'a')).toBe(300_000)
  })
})
