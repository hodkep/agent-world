import { describe, expect, it } from 'vitest'
import { Guests, Rare, Rest, Weather, phaseOf, ritualAt, tintFor } from './rituals'

const lcg = (seed = 3) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
const MIN = 60_000

describe('the hour of the day', () => {
  it('names the part of the day, and the room light follows it', () => {
    expect([2, 6, 12, 18, 23].map(phaseOf)).toEqual(['night', 'dawn', 'day', 'dusk', 'night'])
    expect(tintFor(12).alpha).toBe(0)
    expect(tintFor(23).alpha).toBeGreaterThan(tintFor(18).alpha)
    expect(tintFor(18).alpha).toBeGreaterThan(tintFor(12).alpha)
  })

  it('rings the lunch bell from one to two, calls chai from four to half past, and has the night cleaner from ten to five', () => {
    expect(ritualAt(13, 0)).toBe('lunch')
    expect(ritualAt(13, 59)).toBe('lunch')
    expect(ritualAt(14, 0)).toBeNull()
    expect(ritualAt(16, 10)).toBe('chai')
    expect(ritualAt(16, 30)).toBeNull()
    expect(ritualAt(23, 0)).toBe('night')
    expect(ritualAt(4, 59)).toBe('night')
    expect(ritualAt(5, 0)).toBeNull()
    expect(ritualAt(10, 0)).toBeNull()
  })
})

describe('the weather outside', () => {
  it('changes now and then, and never goes straight from rain to clear sky without a cloud in between being possible', () => {
    const w = new Weather(lcg())
    const seen = new Set<string>([w.now])
    for (let i = 0; i < 400; i++) {
      w.tick(MIN)
      seen.add(w.now)
    }
    expect([...seen].sort()).toEqual(['clear', 'cloud', 'rain'])
  })

  it('holds one weather for at least ten minutes', () => {
    const w = new Weather(lcg(9))
    const first = w.now
    for (let i = 0; i < 9; i++) w.tick(MIN)
    expect(w.now).toBe(first)
  })
})

describe('a rare event', () => {
  it('comes at most once in an hour, and not at all in the first minutes', () => {
    const r = new Rare(lcg(4))
    expect(r.decide(5 * MIN)).toBeNull()
    const at: number[] = []
    for (let m = 5; m < 600; m += 1) if (r.decide(MIN)) at.push(m)
    expect(at.length).toBeGreaterThan(3)
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(60)
  })

  it('is one of a fire drill, a power cut and a pigeon', () => {
    const r = new Rare(lcg(8))
    const kinds = new Set<string>()
    for (let m = 0; m < 3000; m++) {
      const e = r.decide(MIN)
      if (e) kinds.add(e)
    }
    expect([...kinds].sort()).toEqual(['cut', 'drill', 'pigeon'])
  })

  it('can be called up at once, for trials', () => {
    expect(new Rare(lcg(), 1).call('drill')).toBe('drill')
  })
})

describe('who comes to the door', () => {
  it('a courier every fifteen to twenty-five minutes, and the guard stands at the gate from five to eleven in the evening', () => {
    const g = new Guests(lcg())
    let couriers = 0
    for (let m = 0; m < 240; m++) if (g.tick(MIN, 12) === 'courier') couriers++
    expect(couriers).toBeGreaterThanOrEqual(8)
    expect(couriers).toBeLessThanOrEqual(16)
    expect(Guests.guardOn(16)).toBe(false)
    expect(Guests.guardOn(17)).toBe(true)
    expect(Guests.guardOn(22)).toBe(true)
    expect(Guests.guardOn(23)).toBe(false)
  })

  it('a pizza comes after a task is done late in the evening, once for the evening\'s first', () => {
    const g = new Guests(lcg())
    expect(g.pizzaAfterTask(15)).toBe(false)
    expect(g.pizzaAfterTask(21)).toBe(true)
    expect(g.pizzaAfterTask(21)).toBe(false)
  })
})

describe('rest', () => {
  it('puts an agent to nap after two idle minutes, and wakes it the moment it works', () => {
    const r = new Rest()
    r.observe('a', 'idle', 0)
    expect(r.napping('a', 119_000)).toBe(false)
    expect(r.napping('a', 121_000)).toBe(true)
    r.observe('a', 'thinking', 130_000)
    expect(r.napping('a', 131_000)).toBe(false)
  })

  it('has an agent stretch once when a turn of ten minutes or more ends, and not after a short one', () => {
    const r = new Rest()
    r.observe('a', 'implementing', 0)
    expect(r.observe('a', 'idle', 11 * MIN)).toBe('stretch')
    expect(r.observe('a', 'idle', 12 * MIN)).toBeNull()
    r.observe('b', 'implementing', 0)
    expect(r.observe('b', 'idle', 5 * MIN)).toBeNull()
  })
})
