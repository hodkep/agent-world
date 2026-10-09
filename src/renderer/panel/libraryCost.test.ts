import { describe, expect, it } from 'vitest'
import { FORCED_CHECK_TOKENS } from '../../shared/library'
import { checkCost, groupTokens } from './libraryCost'

describe('what the check before acting costs', () => {
  it('is the sentence added to every message, times the messages of a short task, a session and a long day', () => {
    const c = checkCost()
    expect(c.perMessage).toBe(FORCED_CHECK_TOKENS)
    expect(c.scenarios.map((s) => [s.messages, s.tokens])).toEqual([[10, 550], [50, 2750], [200, 11000]])
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
