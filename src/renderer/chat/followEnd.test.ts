import { describe, expect, it } from 'vitest'
import { followsEnd } from './followEnd'

describe('whether the conversation keeps following its end after a scroll', () => {
  it('does while the reader is at the end, however the scroll came about', () => {
    expect(followsEnd({ gap: 0, byReader: false, was: false })).toBe(true)
    expect(followsEnd({ gap: 40, byReader: true, was: false })).toBe(true)
  })

  it('stops when the reader scrolls away from the end', () => {
    expect(followsEnd({ gap: 300, byReader: true, was: true })).toBe(false)
  })

  it('carries on when the end got further off by itself: rows that were not drawn yet were measured, and the browser moved the view to hold what is read', () => {
    // Seen on a slow machine: the view went up 141 pixels while rows above changed size, and a late look at the end said "away" for good.
    expect(followsEnd({ gap: 165, byReader: false, was: true })).toBe(true)
    expect(followsEnd({ gap: 426, byReader: false, was: true })).toBe(true)
  })

  it('does not start following because the layout moved: a reader who was away stays away', () => {
    expect(followsEnd({ gap: 426, byReader: false, was: false })).toBe(false)
  })

  it('stops at once when the reader scrolls up, even within the last few pixels: a row that changes size would pull the view back down and flicker', () => {
    expect(followsEnd({ gap: 30, byReader: true, was: true, up: true })).toBe(false)
    expect(followsEnd({ gap: 2, byReader: true, was: true, up: true })).toBe(false)
  })

  it('starts again when the reader scrolls down to the end', () => {
    expect(followsEnd({ gap: 30, byReader: true, was: false, up: false })).toBe(true)
  })

  it('does not stop for an upward scroll the layout made near the end', () => {
    expect(followsEnd({ gap: 30, byReader: false, was: true, up: true })).toBe(true)
  })
})
