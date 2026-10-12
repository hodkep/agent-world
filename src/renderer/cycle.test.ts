import { describe, expect, it } from 'vitest'
import { next } from './cycle'

describe('stepping to the next or previous item in a list', () => {
  const xs = ['a', 'b', 'c']

  it('moves one along and wraps at the ends', () => {
    expect(next(xs, 'a', 1)).toBe('b')
    expect(next(xs, 'c', 1)).toBe('a')
    expect(next(xs, 'a', -1)).toBe('c')
    expect(next(xs, 'b', -1)).toBe('a')
  })

  it('starts from the first or last when nothing in the list is current', () => {
    expect(next(xs, null, 1)).toBe('a')
    expect(next(xs, 'zzz', -1)).toBe('c')
  })

  it('has nowhere to go with fewer than two items that include the current one', () => {
    expect(next([], 'a', 1)).toBeUndefined()
    expect(next(['a'], 'a', 1)).toBeUndefined()
    expect(next(['a'], null, 1)).toBe('a')
  })
})
