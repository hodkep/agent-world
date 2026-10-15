import { describe, expect, it } from 'vitest'
import { nextZoom, wheelSteps } from './zoomSteps'

describe('one zoom step', () => {
  it('grows by about a quarter, to the next whole scale so art pixels stay even, and never stands still', () => {
    expect(nextZoom(2, 1)).toBe(3)
    expect(nextZoom(4, 1)).toBe(5)
    expect(nextZoom(8, 1)).toBe(10)
    expect(nextZoom(10, 1)).toBe(10)
    expect(nextZoom(5, -1)).toBe(4)
    expect(nextZoom(10, -1)).toBe(8)
    expect(nextZoom(1, -1)).toBe(1)
  })
  it('steps from a fitted, fractional scale to a whole one in the direction asked', () => {
    expect(nextZoom(2.4, 1)).toBe(3)
    expect(nextZoom(2.4, -1)).toBe(2)
    expect(nextZoom(1.2, -1)).toBe(1)
  })
})

describe('a wheel or a trackpad swipe', () => {
  const at = (...events: [number, number][]) => {
    const w = wheelSteps()
    let t = 0
    return events.map(([dy, dt]) => w(dy, 0, (t += dt)))
  }
  it('takes one step for one notch of a mouse wheel', () => {
    expect(at([-100, 1000])).toEqual([1])
    expect(at([100, 1000])).toEqual([-1])
  })
  it('takes one step for a whole swipe of small trackpad movements, not one for each', () => {
    const swipe = Array.from({ length: 40 }, () => [-4, 8] as [number, number])
    expect(at(...swipe).filter(Boolean)).toHaveLength(1)
  })
  it('takes a second step when a long swipe goes on', () => {
    const swipe = Array.from({ length: 200 }, () => [-4, 8] as [number, number])
    const steps = at(...swipe).filter(Boolean)
    expect(steps.length).toBeGreaterThanOrEqual(2)
    expect(steps.length).toBeLessThanOrEqual(4)
  })
  it('forgets a half notch after a pause, and counts lines and pages as larger movements', () => {
    expect(at([-50, 1000], [-50, 1000])).toEqual([0, 0])
    const w = wheelSteps()
    expect(w(-3, 1, 1000)).toBe(1)
    expect(w(-1, 2, 3000)).toBe(1) // a page
  })
  it('does not turn a back-and-forth wobble into steps', () => {
    expect(at([-40, 10], [30, 10], [-40, 10], [30, 10], [-40, 10], [30, 10]).filter(Boolean)).toHaveLength(0)
  })
})
