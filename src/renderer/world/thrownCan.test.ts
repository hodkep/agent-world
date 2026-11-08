import { describe, expect, it } from 'vitest'
import { FLIGHT, LEFT_MS, Z, canAt, canEvents, flightEnd, leftOnFloor } from './thrownCan'

// Pixels on the floor: the supervisor's hand, the boy's head, a point on the east wall and where the can ends up.
const toss = { from: { x: 300, y: 90 }, hit: { x: 384, y: 90 }, wall: { x: 462, y: 90 }, rest: { x: 424, y: 142 } }
const sample = (every = 10) => Array.from({ length: Math.ceil(flightEnd() / every) + 20 }, (_, i) => canAt(i * every, toss))

describe('the can the supervisor throws', () => {
  it('leaves his hand, hits the boy where he stands, and strikes the wall where the flight says', () => {
    expect(canAt(0, toss)).toMatchObject({ x: 300, y: 90, z: Z.hand, phase: 'fly' })
    expect(canAt(FLIGHT.fly, toss)).toMatchObject({ x: 384, y: 90, z: Z.head, phase: 'pop' })
    expect(canAt(FLIGHT.fly + FLIGHT.pop, toss)).toMatchObject({ x: 462, y: 90, z: Z.wall, phase: 'b1' })
  })

  it('bounces off the wall twice, each bounce lower than the one before, and comes to rest where it was told', () => {
    const b1 = canAt(FLIGHT.fly + FLIGHT.pop + FLIGHT.b1 / 2, toss)
    const b2 = canAt(FLIGHT.fly + FLIGHT.pop + FLIGHT.b1 + FLIGHT.b2 / 2, toss)
    expect(b1.z).toBeGreaterThan(b2.z)
    expect(b2.z).toBeGreaterThan(0)
    expect(canAt(flightEnd(), toss)).toEqual({ x: 424, y: 142, z: 0, phase: 'rest' })
    expect(canAt(flightEnd() + 5000, toss)).toEqual({ x: 424, y: 142, z: 0, phase: 'rest' })
  })

  it('is never below the floor, and moves from the wall back towards where it rests', () => {
    expect(sample().every((c) => c.z >= 0)).toBe(true)
    const wallX = canAt(FLIGHT.fly + FLIGHT.pop, toss).x
    const later = canAt(FLIGHT.fly + FLIGHT.pop + FLIGHT.b1, toss)
    expect(later.x).toBeLessThan(wallX)
    expect(later.y).toBeGreaterThan(90)
  })

  it('tells the world about the bonk, the wall, each bounce and the rest, once each and in order', () => {
    const all = canEvents(0, flightEnd() + 1)
    expect(all.map((e) => e.what)).toEqual(['hit', 'wall', 'bounce', 'bounce', 'rest'])
    expect(all.map((e) => e.at)).toEqual([FLIGHT.fly, FLIGHT.fly + FLIGHT.pop, FLIGHT.fly + FLIGHT.pop + FLIGHT.b1, FLIGHT.fly + FLIGHT.pop + FLIGHT.b1 + FLIGHT.b2, flightEnd()])
    // Frames cut the span in two: nothing is told twice and nothing is missed at the seam.
    const cut = FLIGHT.fly + 7
    expect([...canEvents(0, cut), ...canEvents(cut, flightEnd() + 1)]).toEqual(all)
  })
})

describe('a can nobody picks up', () => {
  it('is cleared away a minute after it has come to rest, and not before', () => {
    expect(leftOnFloor(flightEnd() + LEFT_MS - 1)).toBe(false)
    expect(leftOnFloor(flightEnd() + LEFT_MS)).toBe(true)
    expect(LEFT_MS).toBe(60_000)
  })
})
