import { describe, expect, it } from 'vitest'
import type { Use } from '../../shared/library'
import { summaryOf, timeline } from './libraryTimeline'

const u = (over: Partial<Use>): Use => ({ t: 0, agent: 'a', name: 'ada', provider: 'claude', workspace: 'w', id: 'tdd', how: 'triggered', ...over })
const name = (id: string) => id.toUpperCase()

describe('timeline', () => {
  const uses = [
    u({ t: 100, how: 'started', id: '', words: 'Always follow:\n- Terse' , launch: 1 }),
    u({ t: 100, how: 'delivered', id: 'terse', launch: 1 }),
    u({ t: 200, id: 'tdd', words: 'Library: tdd' }),
    u({ t: 2100, id: 'tdd', how: 'fetched' }),
    u({ t: 3000, id: 'db', words: 'Library: db' }),
    u({ t: 4000, id: 'pdf', how: 'read' })
  ]
  it('tells the story in order: told, pointed then read, pointed and not read, read unprompted', () => {
    const s = timeline(uses, name)
    expect(s.map((x) => [x.tone, x.title])).toEqual([
      ['told', 'Told TERSE'],
      ['point', 'Pointed at TDD'],
      ['read', 'Read TDD'],
      ['mute', 'Pointed at DB'],
      ['read', 'Read PDF']
    ])
    expect(s[2]!.note).toBe('1.9s after it was pointed out')
    expect(s[3]!.note).toBe('not read: the agent carried on without it')
    expect(s[4]!.note).toBe('on its own, not pointed at')
  })
  it('counts the same pointing twice as one', () => {
    expect(timeline([u({ t: 100 }), u({ t: 300 })], name)).toHaveLength(1)
  })
})

describe('summaryOf', () => {
  it('counts what was told, pointed at and read of those', () => {
    const uses = [u({ how: 'delivered', id: 'terse' }), u({ t: 1, id: 'a' }), u({ t: 2, id: 'b' }), u({ t: 3, id: 'a', how: 'fetched' })]
    expect(summaryOf(uses)).toEqual({ told: 1, pointed: 2, read: 1 })
  })
})
