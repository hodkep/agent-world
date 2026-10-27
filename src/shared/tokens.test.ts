import { describe, expect, it } from 'vitest'
import { cacheShare, partsOf, partsTotal, tokenChange, type TokenParts } from './tokens'
import { tokenTotal } from './tokens'

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

const parts = (o: Partial<TokenParts>): TokenParts => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, legacy: 0, ...o })

describe('a week of tokens, kept in parts', () => {
  it('files an exact request under its four kinds, and an old input-and-output count as one part with no split', () => {
    expect(partsOf({ k: 'req', input: 2, cacheRead: 80, cacheWrite: 5, output: 7 })).toEqual(parts({ input: 2, cacheRead: 80, cacheWrite: 5, output: 7 }))
    expect(partsOf({ k: 'req', input: 2, output: 7 })).toEqual(parts({ input: 2, output: 7 }))
    expect(partsOf({ k: 'tokens', input: 1000, output: 200 })).toEqual(parts({ legacy: 1200 }))
    expect(partsTotal(parts({ input: 2, cacheRead: 80, cacheWrite: 5, output: 7, legacy: 100 }))).toBe(194)
  })
})

describe('the change in tokens from the week before', () => {
  it('compares everything, cache included, when last week was counted as exactly as this one', () => {
    const now = parts({ input: 10, cacheRead: 880, cacheWrite: 10, output: 100 })
    const before = parts({ input: 10, cacheRead: 780, cacheWrite: 10, output: 100 })
    expect(tokenChange(now, before)).toEqual({ pct: 11, basis: 'all' })
  })

  it('compares input and output only when last week was counted the old way, which had no cache, and says so', () => {
    const now = parts({ input: 200, cacheRead: 9000, cacheWrite: 500, output: 100 })
    const before = parts({ legacy: 250 })
    // 300 now against 250 then; the 9,500 from the cache has nothing to be compared with.
    expect(tokenChange(now, before)).toEqual({ pct: 20, basis: 'io' })
  })

  it('compares as usual when neither week has any cache figures', () => {
    expect(tokenChange(parts({ legacy: 300 }), parts({ legacy: 200 }))).toEqual({ pct: 50, basis: 'all' })
  })

  it('shows a fall as a fall, and nothing when there was no week before or it used nothing', () => {
    expect(tokenChange(parts({ input: 50 }), parts({ input: 100 }))).toEqual({ pct: -50, basis: 'all' })
    expect(tokenChange(parts({ input: 50 }), parts({}))).toBeNull()
  })
})
