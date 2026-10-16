import { describe, expect, it } from 'vitest'
import { HeldMerges } from './heldMerges'

describe('the merges git held, waiting for the person', () => {
  it('lists a held merge for an agent, with what holds it, and one entry however often the agent tries', () => {
    const m = new HeldMerges()
    m.hold('a1', 'h1', ['2 audit findings have not been seen.'])
    m.hold('a1', 'h1', ['1 audit finding has not been seen.'])
    expect(m.list()).toEqual([{ agentId: 'a1', head: 'h1', held: ['1 audit finding has not been seen.'], declined: false }])
  })

  it('keeps a merge the person said not yet to, as declined, so the marker stays and the band does not', () => {
    const m = new HeldMerges()
    m.hold('a1', 'h1', ['x'])
    m.decline('a1')
    expect(m.list()).toEqual([{ agentId: 'a1', head: 'h1', held: ['x'], declined: true }])
  })

  it('brings the band back when the person opens it again, and when the agent tries again and is held again', () => {
    const m = new HeldMerges()
    m.hold('a1', 'h1', ['x'])
    m.decline('a1')
    m.reopen('a1')
    expect(m.list()[0]!.declined).toBe(false)
    m.decline('a1')
    m.hold('a1', 'h2', ['y'])
    expect(m.list()).toEqual([{ agentId: 'a1', head: 'h2', held: ['y'], declined: false }])
  })

  it('hands over the held merge of an agent when the person allows it, and forgets it, and ignores an agent with none', () => {
    const m = new HeldMerges()
    m.hold('a1', 'h1', ['x'])
    m.hold('a2', 'h9', ['z'])
    expect(m.take('a1')).toMatchObject({ agentId: 'a1', head: 'h1' })
    expect(m.take('a1')).toBeUndefined()
    expect(m.list().map((h) => h.agentId)).toEqual(['a2'])
    m.decline('nobody')
    m.reopen('nobody')
    m.clear('a2')
    expect(m.list()).toEqual([])
  })
})
