import { describe, expect, it } from 'vitest'
import { assignBays, crateLayout } from './dock'

describe('curb bays for delivery vans', () => {
  it('parks vans from the left in the order given', () => {
    expect([...assignBays(new Map(), ['a', 'b', 'c'], 5)]).toEqual([['a', 0], ['b', 1], ['c', 2]])
  })

  it('keeps a van where it is, and reuses the bay of one that left', () => {
    const first = assignBays(new Map(), ['a', 'b', 'c'], 5)
    const next = assignBays(first, ['d', 'c', 'a'], 5)
    expect(next.get('a')).toBe(0)
    expect(next.get('c')).toBe(2)
    expect(next.get('d')).toBe(1)
    expect(next.has('b')).toBe(false)
  })

  it('leaves out what does not fit', () => {
    expect(assignBays(new Map(), ['a', 'b', 'c'], 2).size).toBe(2)
  })
})

describe('crates on a van', () => {
  it('shows one crate per commit up to the bed being full, then says how many more', () => {
    expect(crateLayout(0)).toEqual({ shown: 0, more: 0 })
    expect(crateLayout(3)).toEqual({ shown: 3, more: 0 })
    expect(crateLayout(9)).toEqual({ shown: 6, more: 3 })
  })
})
