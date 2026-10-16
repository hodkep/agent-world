import { describe, expect, it } from 'vitest'
import { FORCED_CHECK_TOKENS } from '../../shared/library'
import { checkCost, groupTokens, libraryCost } from './libraryCost'

describe('what the check before acting costs', () => {
  it('is the sentence added to every message, times the messages of a short task, a session and a long day', () => {
    const c = checkCost()
    expect(c.perMessage).toBe(FORCED_CHECK_TOKENS)
    expect(c.scenarios.map((s) => [s.messages, s.tokens])).toEqual([[10, 124], [50, 558], [200, 2108]])
  })
  it('adds what a skipped rule costs, once per time an agent passes one over', () => {
    expect(checkCost().perSkip).toBeGreaterThan(0)
    expect(checkCost().perSkip).toBeLessThan(200)
  })
})

describe('groupTokens', () => {
  it('writes a number with thousands separators so it reads at a glance', () => {
    expect(groupTokens(550)).toBe('550')
    expect(groupTokens(11000)).toBe('11,000')
  })
})

describe('what the library and playbook cost', () => {
  it('is an opening text capped at the playbook budget, once per session, and a line when a message points at an item', () => {
    const c = libraryCost()
    expect(c.openingMax).toBe(300)
    expect(c.perPointing).toBeGreaterThan(20)
    expect(c.perPointing).toBeLessThan(120)
    expect(c.sessions.map((s) => s.label)).toEqual(['A short task', 'A normal session', 'A long day'])
  })
  it('prices a session as the opening text plus a pointing line for some of its messages', () => {
    const c = libraryCost()
    const normal = c.sessions[1]!
    expect(normal.tokens).toBe(c.openingMax + normal.pointings * c.perPointing)
    expect(c.sessions[2]!.tokens).toBeGreaterThan(normal.tokens)
  })
})
