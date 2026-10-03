import { describe, expect, it } from 'vitest'
import { FPS, frameCap } from './frameRate'

const base = { hidden: false, focused: true, lastTouch: 0, now: 100_000 }

describe('how often the office is redrawn', () => {
  it('draws it at a calm rate while you use the window, far below a 120 Hz screen', () => {
    expect(frameCap(base)).toBe(FPS.calm)
    expect(FPS.calm).toBeLessThanOrEqual(30)
  })

  it('goes up while you pan or zoom, and settles back once you stop', () => {
    expect(frameCap({ ...base, lastTouch: 99_500 })).toBe(FPS.moving)
    expect(frameCap({ ...base, lastTouch: 98_000 })).toBe(FPS.calm)
  })

  it('slows right down when another app is in front', () => {
    expect(frameCap({ ...base, focused: false })).toBe(FPS.away)
    expect(FPS.away).toBeLessThan(FPS.calm)
    // Moving does not matter if the window is not the one being used.
    expect(frameCap({ ...base, focused: false, lastTouch: 99_900 })).toBe(FPS.away)
  })

  it('stops drawing when the window is hidden or covered', () => {
    expect(frameCap({ ...base, hidden: true })).toBe(0)
    expect(frameCap({ ...base, hidden: true, focused: false })).toBe(0)
  })
})
