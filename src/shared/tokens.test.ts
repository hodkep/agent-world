import { describe, expect, it } from 'vitest'
import { cacheShare, tokenTotal } from './tokens'

describe('tokens', () => {
  it('a total counts what was read fresh, from the cache, written to it and written back', () => {
    expect(tokenTotal({ input: 6, cacheRead: 52799, cacheWrite: 11848, output: 636 })).toBe(65289)
  })

  it('a figure the program does not give is not counted as anything', () => {
    expect(tokenTotal({ input: 100, output: 20 })).toBe(120)
  })

  it('the cache share is the part of what was read that came from the cache', () => {
    expect(cacheShare({ input: 2, cacheRead: 86, cacheWrite: 12, output: 5 })).toBeCloseTo(0.86)
  })

  it('a program that does not report cache reads has no share, not a share of zero', () => {
    expect(cacheShare({ input: 100, output: 20 })).toBeNull()
    expect(cacheShare({ input: 0, cacheRead: 0, output: 0 })).toBeNull()
  })
})
