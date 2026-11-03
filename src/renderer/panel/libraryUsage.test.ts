import { describe, expect, it } from 'vitest'
import { dustOf, meterCells, splitUsage } from './libraryUsage'

const skill = (id: string, description: number) => ({ id, name: id, kind: 'skill' as const, tokens: { description, body: 0 } })

describe('the Usage tab\'s skills', () => {
  it('puts used skills first, most used on top, and the unused ones apart with what those that are on cost', () => {
    const r = splitUsage(
      [skill('pdf', 10), skill('memo', 20), skill('graphify', 30), skill('db', 40), { id: 'terse', name: 'terse', kind: 'instruction' as const, tokens: { description: 5, body: 0 } }],
      { pdf: { used: 3, last: 9, agents: ['os'], accounts: [], days: [], who: [] }, memo: { used: 9, last: 8, agents: [], accounts: [], days: [], who: [] }, db: { used: 0, last: 1, agents: [], accounts: [], days: [], who: [] } },
      ['db']
    )
    expect(r.used.map((u) => [u.item.id, u.use.used])).toEqual([['memo', 9], ['pdf', 3]])
    expect(r.unused.map((u) => [u.item.id, u.on, u.use.last])).toEqual([['db', false, 1], ['graphify', true, 0]])
    // Only an unused skill that is still on for Claude costs anything.
    expect(dustOf(r).saves).toBe(30)
  })

  it('picks for Clear the dust the unused skills still on for Claude, and says what turning them off saves', () => {
    const r = splitUsage([skill('pdf', 10), skill('memo', 20), skill('db', 40)], { pdf: { used: 1, last: 9, agents: [], accounts: [], days: [], who: [] } }, ['db'])
    expect(dustOf(r)).toEqual({ ids: ['memo'], saves: 20 })
    // A skill a playbook still hands to agents is not dust: switching it off would save nothing.
    expect(dustOf(r, new Set(['memo']))).toEqual({ ids: [], saves: 0 })
  })
})

describe('the start-of-session cost meter', () => {
  it('fills a cell for each 5% of the budget the skills on for Claude take, at least one when any is on, never more than all', () => {
    expect(meterCells(0, 400)).toBe(0)
    expect(meterCells(3, 400)).toBe(1)
    expect(meterCells(100, 400)).toBe(5)
    expect(meterCells(900, 400)).toBe(20)
  })
})
