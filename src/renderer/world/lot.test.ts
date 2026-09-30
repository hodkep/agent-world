import { describe, expect, it } from 'vitest'
import { assignBays } from './lot'

describe('parking bays for past conversations', () => {
  it('fills bays from the left in the order given', () => {
    expect([...assignBays(new Map(), ['a', 'b', 'c'], 5)]).toEqual([['a', 0], ['b', 1], ['c', 2]])
  })

  it('keeps a car in its bay when the list changes, and reuses freed bays', () => {
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
