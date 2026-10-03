import { describe, expect, it } from 'vitest'
import { FPS, frameCap } from './frameRate'

const base = { hidden: false, focused: true, lastActive: -Infinity, now: 100_000 }

describe('how often the office is redrawn', () => {
  it('draws it at a calm rate while you use the window, far below a 120 Hz screen', () => {
    expect(frameCap(base)).toBe(FPS.calm)
    expect(FPS.calm).toBeLessThanOrEqual(30)
  })

  it('goes up while you pan or zoom, or while anything walks or flies, and settles back once it all stops', () => {
    expect(frameCap({ ...base, lastActive: 99_500 })).toBe(FPS.moving)
    expect(frameCap({ ...base, lastActive: 98_000 })).toBe(FPS.calm)
  })

  it('stays smooth just after the last step, so a walk does not drop to the calm rate between two moves', () => {
    expect(frameCap({ ...base, lastActive: 99_700 })).toBe(FPS.moving)
    expect(frameCap({ ...base, lastActive: 99_000 })).toBe(FPS.calm)
  })

  it('slows right down when another app is in front', () => {
    expect(frameCap({ ...base, focused: false })).toBe(FPS.away)
    expect(FPS.away).toBeLessThan(FPS.calm)
    // Moving does not matter if the window is not the one being used.
    expect(frameCap({ ...base, focused: false, lastActive: 99_900 })).toBe(FPS.away)
  })

  it('stops drawing when the window is hidden or covered', () => {
    expect(frameCap({ ...base, hidden: true })).toBe(0)
    expect(frameCap({ ...base, hidden: true, focused: false })).toBe(0)
  })
})
