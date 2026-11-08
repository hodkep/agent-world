import { describe, expect, it } from 'vitest'
import { ROWS, barsAt, loadFor, settle } from './serverLoad'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const mean = (level: number, seed: number) => {
  let total = 0
  for (let i = 0; i < 200; i++) total += sum(barsAt(level, i * 90, seed))
  return total / 200
}

describe('the load on the two cabinets', () => {
  it('is nothing with no command running, and grows with each agent running one up to full', () => {
    expect(loadFor(0)).toBe(0)
    const levels = [0, 1, 2, 3, 4, 5, 9].map(loadFor)
    for (let i = 1; i < levels.length; i++) expect(levels[i]!).toBeGreaterThanOrEqual(levels[i - 1]!)
    expect(loadFor(1)).toBeGreaterThan(0)
    expect(loadFor(4)).toBe(1)
    expect(loadFor(9)).toBe(1)
  })

  it('draws no bars when idle', () => {
    for (let i = 0; i < 50; i++) expect(barsAt(0, i * 100, 1)).toEqual([0, 0, 0, 0, 0])
  })

  it('keeps every bar inside the screen', () => {
    for (const level of [0.2, 0.6, 1])
      for (let i = 0; i < 100; i++)
        for (const h of barsAt(level, i * 70, 3)) {
          expect(h).toBeGreaterThanOrEqual(0)
          expect(h).toBeLessThanOrEqual(ROWS)
        }
  })

  it('shows more the busier it is, and the two cabinets do not move together', () => {
    expect(mean(0.35, 1)).toBeLessThan(mean(0.7, 1))
    expect(mean(0.7, 1)).toBeLessThan(mean(1, 1))
    const same = Array.from({ length: 50 }, (_, i) => JSON.stringify(barsAt(0.7, i * 130, 1)) === JSON.stringify(barsAt(0.7, i * 130, 2))).filter(Boolean).length
    expect(same).toBeLessThan(25)
  })

  it('moves the same way on every frame rate: bars depend on the time, not on how often it is asked', () => {
    expect(barsAt(0.7, 4321, 1)).toEqual(barsAt(0.7, 4321, 1))
  })

  it('eases toward the load instead of jumping, so a command starting or stopping fades in and out', () => {
    const up = settle(0, 1, 100)
    expect(up).toBeGreaterThan(0)
    expect(up).toBeLessThan(1)
    expect(settle(0, 1, 10_000)).toBeCloseTo(1, 2)
    const down = settle(1, 0, 100)
    expect(down).toBeLessThan(1)
    expect(down).toBeGreaterThan(0)
  })
})
