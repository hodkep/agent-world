import { describe, expect, it } from 'vitest'
import { CatBrain, type CatStep } from './catBrain'

const lcg = (seed = 3) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
const spots = { nap: [{ x: 20, y: 5 }], roam: [{ x: 5, y: 5 }, { x: 12, y: 9 }, { x: 22, y: 6 }], desks: [{ x: 2, y: 2 }, { x: 6, y: 6 }] }
const rests = (steps: CatStep[]) => steps.filter((s): s is Extract<CatStep, { kind: 'rest' }> => s.kind === 'rest')

describe('the office cat', () => {
  it('always has something to do, starting with a walk, and does not do the same thing twice running', () => {
    const b = new CatBrain(lcg())
    let last = ''
    for (let i = 0; i < 100; i++) {
      const steps = b.next(spots)
      expect(steps[0]!.kind).toBe('walk')
      const kind = rests(steps)[0]!.what
      expect(kind).not.toBe(last)
      last = kind
    }
  })

  it('naps, sits and washes, and climbs on a desk now and then', () => {
    const b = new CatBrain(lcg(7))
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) rests(b.next(spots)).forEach((r) => seen.add(r.what))
    expect([...seen].sort()).toEqual(['desk', 'nap', 'sit'])
  })

  it('naps for at least twenty seconds, and does not climb a desk when there is none', () => {
    const b = new CatBrain(lcg(9))
    for (let i = 0; i < 100; i++) {
      for (const r of rests(b.next({ ...spots, desks: [] }))) {
        expect(r.what).not.toBe('desk')
        if (r.what === 'nap') expect(r.ms).toBeGreaterThanOrEqual(20_000)
      }
    }
  })

  it('runs faster when sped up, for specs', () => {
    const slow = rests(new CatBrain(lcg(2), 1).next(spots))[0]!.ms
    const fast = rests(new CatBrain(lcg(2), 10).next(spots))[0]!.ms
    expect(fast).toBe(Math.round(slow / 10))
  })
})
