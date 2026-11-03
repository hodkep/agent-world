import { describe, expect, it } from 'vitest'
import { splitUsage } from './libraryUsage'

const skill = (id: string, description: number) => ({ id, name: id, kind: 'skill' as const, tokens: { description, body: 0 } })

describe('the Usage tab\'s skills', () => {
  it('puts used skills first, most used on top, and the unused ones apart with what those that are on cost', () => {
    const r = splitUsage(
      [skill('pdf', 10), skill('memo', 20), skill('graphify', 30), skill('db', 40), { id: 'terse', name: 'terse', kind: 'instruction' as const, tokens: { description: 5, body: 0 } }],
      { pdf: { used: 3, last: 9, agents: ['os'], accounts: [] }, memo: { used: 9, last: 8, agents: [], accounts: [] }, db: { used: 0, last: 1, agents: [], accounts: [] } },
      ['db']
    )
    expect(r.used.map((u) => [u.item.id, u.use.used])).toEqual([['memo', 9], ['pdf', 3]])
    expect(r.unused.map((u) => [u.item.id, u.on, u.use.last])).toEqual([['db', false, 1], ['graphify', true, 0]])
    // Only an unused skill that is still on for Claude costs anything.
    expect(r.unusedCost).toBe(30)
  })
})
