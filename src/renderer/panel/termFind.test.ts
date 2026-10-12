import { describe, expect, it } from 'vitest'
import { findMatches, stepMatch } from './termFind'

describe('findMatches', () => {
  const lines = ['npm run build', 'Build failed: build error', '']
  it('finds every match, ignoring case unless asked', () => {
    expect(findMatches(lines, 'build', false)).toEqual([{ row: 0, col: 8, len: 5 }, { row: 1, col: 0, len: 5 }, { row: 1, col: 14, len: 5 }])
    expect(findMatches(lines, 'build', true)).toEqual([{ row: 0, col: 8, len: 5 }, { row: 1, col: 14, len: 5 }])
  })
  it('finds nothing for an empty query', () => {
    expect(findMatches(lines, '', false)).toEqual([])
  })
})

describe('stepMatch', () => {
  it('moves through the matches and wraps round', () => {
    expect(stepMatch(3, 0, 1)).toBe(1)
    expect(stepMatch(3, 2, 1)).toBe(0)
    expect(stepMatch(3, 0, -1)).toBe(2)
    expect(stepMatch(0, 0, 1)).toBe(-1)
  })
})
