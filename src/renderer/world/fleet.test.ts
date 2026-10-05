import { describe, expect, it } from 'vitest'
import { parkingSlots, spinArrival, type Lot } from './arrival'
import { Fleet } from './fleet'

const lot: Lot = { doorX: 144, laneY: 312, slotY: 290, left: -264, right: 616 }
/** Run the fleet for this long in small steps and collect what it said. */
function run(f: Fleet, ms: number, step = 16) {
  const events: string[] = []
  for (let t = 0; t < ms; t += step) for (const e of f.update(step)) events.push(`${e.type}:${e.key}`)
  return events
}
const arrival = spinArrival(lot, parkingSlots(lot.doorX)[0]!)

describe('cars arriving', () => {
  it('park in the free spot nearest the door, four at most, and the fifth is turned away', () => {
    const f = new Fleet(lot)
    for (const k of ['a', 'b', 'c', 'd']) expect(f.arrive(k, 0xe0c040)).toBe(true)
    expect(f.arrive('e', 0xe0c040)).toBe(false)
    expect(f.has('e')).toBe(false)
    const slots = parkingSlots(lot.doorX)
    expect(new Set([...f.visits.values()].map((v) => v.slot)).size).toBe(4)
    expect(slots[f.visits.get('a')!.slot]!).toBeLessThan(lot.doorX) // the first takes the nearest, on the left
  })

  it('drives in, parks, and lets its passenger out a moment later', () => {
    const f = new Fleet(lot)
    f.arrive('a', 0xc0392b)
    expect(f.visits.get('a')!.phase).toBe('driving')
    expect(f.busy()).toBe(true)
    expect(run(f, arrival.total - 30)).toEqual([])
    expect(f.visits.get('a')!.phase).toBe('driving')
    const events = run(f, 1000)
    expect(f.visits.get('a')!.phase).toBe('parked')
    expect(events).toEqual(['door:a'])
    const p = f.visits.get('a')!.pose
    expect(p.x).toBeCloseTo(parkingSlots(lot.doorX)[0]!, 1)
    expect(p.y).toBeCloseTo(lot.slotY, 1)
    // Waiting for its passenger is not movement.
    expect(f.busy()).toBe(false)
  })

  it('takes its passenger back and drives off, freeing the spot only once it has gone', () => {
    const f = new Fleet(lot)
    f.arrive('a', 0xc0392b)
    run(f, arrival.total + 1000)
    f.leave('a')
    expect(run(f, 40)).toEqual([])
    expect(f.visits.get('a')!.phase).toBe('boarding')
    run(f, 400)
    expect(f.visits.get('a')!.phase).toBe('departing')
    expect(f.busy()).toBe(true)
    expect(f.occupied().size).toBe(1)
    const events = run(f, 4000)
    expect(events).toEqual(['gone:a'])
    expect(f.has('a')).toBe(false)
    expect(f.occupied().size).toBe(0)
    expect(f.busy()).toBe(false)
  })

  it('a subagent that is done before its car even parked sends no passenger out, and the car leaves once parked', () => {
    const f = new Fleet(lot)
    f.arrive('a', 0xc0392b)
    run(f, 300)
    f.leave('a')
    const events = run(f, 9000)
    expect(events).toEqual(['gone:a'])
  })

  it('is quicker at a hasty pace', () => {
    const calm = new Fleet(lot, 1)
    const hasty = new Fleet(lot, 1.5)
    calm.arrive('a', 1)
    hasty.arrive('a', 1)
    const done = (f: Fleet) => {
      let t = 0
      for (; t < 20_000; t += 16) {
        f.update(16)
        if (f.visits.get('a')!.phase === 'parked') break
      }
      return t
    }
    expect(done(hasty)).toBeLessThan(done(calm))
  })
})

describe('keeping the lane clear for them', () => {
  it('asks traffic to stay out of the stretch a car is racing through, and not while it just sits parked', () => {
    const f = new Fleet(lot)
    expect(f.wayRanges()).toEqual([])
    f.arrive('a', 1)
    const slot = parkingSlots(lot.doorX)[0]!
    expect(f.wayRanges()).toEqual([{ from: lot.left, to: slot + 40 }])
    run(f, arrival.total + 600)
    expect(f.wayRanges()).toEqual([])
    f.leave('a')
    run(f, 400)
    expect(f.wayRanges()).toEqual([{ from: slot - 40, to: lot.right }])
  })
})
