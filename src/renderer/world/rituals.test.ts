import { describe, expect, it } from 'vitest'
import { Guests, Rare, Rest, Weather, lightStrength, outsideLight, phaseOf, ritualAt, tintFor } from './rituals'

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

  it('holds each weather for its own spell: clear 20 to 40 minutes, cloud 8 to 15, rain 4 to 8', () => {
    const w = new Weather(lcg(9))
    const spells: Record<string, number[]> = { clear: [], cloud: [], rain: [] }
    let was = w.now
    let ran = 0
    for (let i = 0; i < 6000; i++) {
      w.tick(10_000)
      ran += 10_000
      if (w.now !== was) {
        // The first spell is a part of one that began before we looked.
        if (spells[was]!.length || i > 400) spells[was]!.push(ran)
        else spells[was]!.push(-1)
        was = w.now
        ran = 0
      }
    }
    const within = (xs: number[], lo: number, hi: number) => xs.filter((x) => x > 0).every((x) => x >= lo * MIN - 10_000 && x <= hi * MIN + 10_000)
    expect(spells.clear!.length).toBeGreaterThan(5)
    expect(within(spells.clear!, 20, 40)).toBe(true)
    expect(within(spells.cloud!, 8, 15)).toBe(true)
    expect(within(spells.rain!, 4, 8)).toBe(true)
  })

  it('is mostly clear: over a few hundred hours rain is under a tenth of the time and clear sky over half, and rain only follows cloud', () => {
    const w = new Weather(lcg(5))
    const share: Record<string, number> = { clear: 0, cloud: 0, rain: 0 }
    let before = w.now
    for (let i = 0; i < 60_000; i++) {
      w.tick(30_000)
      share[w.now]!++
      if (w.now === 'rain') expect(before === 'rain' || before === 'cloud').toBe(true)
      before = w.now
    }
    const total = share.clear! + share.cloud! + share.rain!
    expect(share.rain! / total).toBeLessThan(0.1)
    expect(share.clear! / total).toBeGreaterThan(0.5)
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

describe('the grounds outside', () => {
  it('are lit by day, with the lamps off, dim at night with the lamps on, and the lamps are on at dawn and dusk', () => {
    expect(outsideLight(12, 'clear')).toMatchObject({ lamps: false, rain: false })
    expect(outsideLight(12, 'clear').add!.alpha).toBeGreaterThan(0.5)
    expect(outsideLight(23, 'clear')).toMatchObject({ lamps: true, add: null })
    expect(outsideLight(23, 'clear').dim.alpha).toBeGreaterThan(0)
    expect(outsideLight(6, 'clear').lamps).toBe(true)
    expect(outsideLight(18, 'clear').lamps).toBe(true)
  })

  it('go grey in cloud and greyer in rain, and only rain draws streaks', () => {
    const clear = outsideLight(12, 'clear').dim.alpha
    const cloud = outsideLight(12, 'cloud').dim.alpha
    const rain = outsideLight(12, 'rain')
    expect(clear).toBe(0)
    expect(cloud).toBeGreaterThan(clear)
    expect(rain.dim.alpha).toBeGreaterThan(cloud)
    expect([outsideLight(12, 'cloud').rain, rain.rain]).toEqual([false, true])
  })
})

describe('the lights over the desks', () => {
  it('are on at night, dimmer at dusk and dawn, off by day, and out in a power cut', () => {
    expect(lightStrength(23, 0)).toBe(1)
    expect(lightStrength(2, 0)).toBe(1)
    expect(lightStrength(18, 0)).toBeGreaterThan(0.3)
    expect(lightStrength(18, 0)).toBeLessThan(1)
    expect(lightStrength(6, 0)).toBeGreaterThan(0.3)
    expect(lightStrength(12, 0)).toBe(0)
    expect(lightStrength(23, 1)).toBe(0)
    expect(lightStrength(23, 0.5)).toBe(0.5)
  })
})
