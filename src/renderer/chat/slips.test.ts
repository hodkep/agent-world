import { describe, expect, it } from 'vitest'
import type { Use } from '../../shared/library'
import { slipsFor, startsBefore } from './slips'

const u = (over: Partial<Use>): Use => ({ t: 0, agent: 'a', name: 'ada', provider: 'claude', workspace: 'w', id: 'tdd', how: 'triggered', ...over })

describe('slipsFor', () => {
  it('says read, with the time it took, when the pointed item was then used', () => {
    const s = slipsFor([u({ t: 1000, words: 'Library: tdd' }), u({ t: 2900, how: 'fetched' })], 500, 5000)
    expect(s).toEqual([{ id: 'tdd', state: 'read', words: 'Library: tdd', gapMs: 1900 }])
  })
  it('says pointed when it was not used, and self when the agent reached for it without being pointed', () => {
    const s = slipsFor([u({ t: 1000, id: 'a', words: 'w1' }), u({ t: 1500, id: 'b', how: 'skill' })], 500, 5000)
    expect(s.map((x) => [x.id, x.state])).toEqual([['a', 'pointed'], ['b', 'self']])
  })
  it('keeps what the agent met that pointed it at the item', () => {
    expect(slipsFor([u({ t: 1000, because: 'merge conflict, 2 files' })], 500, 5000)[0]).toMatchObject({ state: 'pointed', because: 'merge conflict, 2 files' })
  })
  it('keeps to its own window, one slip per item, and ignores starts and deliveries', () => {
    const s = slipsFor([u({ t: 100 }), u({ t: 1000, words: 'x' }), u({ t: 1100, words: 'x' }), u({ t: 6000 }), u({ t: 1200, how: 'started', id: '' }), u({ t: 1300, how: 'delivered', id: 'terse' })], 500, 5000)
    expect(s).toHaveLength(1)
  })
})

describe('startsBefore', () => {
  it('puts each start above the first message sent after it', () => {
    const a = u({ t: 50, how: 'started', id: '', words: 'one' })
    const b = u({ t: 150, how: 'started', id: '', words: 'two' })
    const r = startsBefore([a, b, u({ t: 300 })], [100, 200, 300])
    expect([...r.entries()]).toEqual([[0, [a]], [1, [b]]])
  })
  it('drops a start no message followed yet', () => {
    expect(startsBefore([u({ t: 50, how: 'started', id: '' })], []).size).toBe(0)
  })
})
