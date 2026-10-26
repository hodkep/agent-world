import { describe, expect, it } from 'vitest'
import { wheelFactor } from './wheelZoom'

describe('how fast a picture zooms with the wheel or a trackpad', () => {
  it('grows a little for a small scroll, so a trackpad that sends many events does not run away', () => {
    expect(wheelFactor({ deltaY: -4, deltaMode: 0, ctrlKey: false })).toBeGreaterThan(1)
    expect(wheelFactor({ deltaY: -4, deltaMode: 0, ctrlKey: false })).toBeLessThan(1.01)
    // Twenty small events, as one swipe is, are well short of a doubling.
    expect(Array.from({ length: 20 }).reduce<number>((s) => s * wheelFactor({ deltaY: -4, deltaMode: 0, ctrlKey: false }), 1)).toBeLessThan(1.2)
  })
  it('shrinks the same way in the other direction, and is the exact inverse', () => {
    const up = wheelFactor({ deltaY: -30, deltaMode: 0, ctrlKey: false })
    const down = wheelFactor({ deltaY: 30, deltaMode: 0, ctrlKey: false })
    expect(down).toBeLessThan(1)
    expect(up * down).toBeCloseTo(1, 10)
  })
  it('never jumps by more than a tenth in one event, however hard the wheel is spun', () => {
    expect(wheelFactor({ deltaY: -5000, deltaMode: 0, ctrlKey: false })).toBeLessThanOrEqual(1.1)
    expect(wheelFactor({ deltaY: 5000, deltaMode: 0, ctrlKey: false })).toBeGreaterThanOrEqual(1 / 1.1)
  })
  it('reads a wheel that counts in lines as pixels, and a pinch (Ctrl) as a finer gesture that moves faster per unit', () => {
    expect(wheelFactor({ deltaY: -3, deltaMode: 1, ctrlKey: false })).toBeCloseTo(wheelFactor({ deltaY: -48, deltaMode: 0, ctrlKey: false }), 10)
    expect(wheelFactor({ deltaY: -2, deltaMode: 0, ctrlKey: true })).toBeGreaterThan(wheelFactor({ deltaY: -2, deltaMode: 0, ctrlKey: false }))
  })
})
