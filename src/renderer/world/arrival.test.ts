import { describe, expect, it } from 'vitest'
import { carDoorPoint, flickDeparture, parkingSlots, pickSlot, spinArrival, type Lot } from './arrival'

// The street in front of an office 352 wide: pavement from y 280 to 300, the upper lane (towards the right) centred on 312.
const lot: Lot = { doorX: 144, laneY: 312, slotY: 290, left: -264, right: 616 }
const DEG = Math.PI / 180

describe('where the cars park', () => {
  it('has four spots on the pavement, two each side of the door and none in front of it', () => {
    const xs = parkingSlots(lot.doorX)
    expect(xs).toHaveLength(4)
    for (const x of xs) expect(Math.abs(x - lot.doorX)).toBeGreaterThanOrEqual(48)
    expect(xs.filter((x) => x < lot.doorX)).toHaveLength(2)
  })

  it('gives the nearest free spot, the left one first when two are as near', () => {
    const xs = parkingSlots(lot.doorX)
    expect(pickSlot(xs, new Set())).toBe(0)
    expect(xs[pickSlot(xs, new Set())!]!).toBeLessThan(lot.doorX)
    expect(xs[pickSlot(xs, new Set([0]))!]!).toBeGreaterThan(lot.doorX)
    expect(pickSlot(xs, new Set([0, 1]))).not.toBeNull()
    expect(pickSlot(xs, new Set([0, 1, 2, 3]))).toBeNull()
  })
})

describe('arriving with a spin-out', () => {
  const slot = parkingSlots(lot.doorX)[0]!
  const a = spinArrival(lot, slot)

  it('comes in along the upper lane from the far end of the road, and stops exactly in its spot, slanted', () => {
    const start = a.at(0)
    expect(start).toMatchObject({ x: lot.left, y: lot.laneY, h: 0 })
    const end = a.at(a.total)
    expect(end.x).toBeCloseTo(slot, 1)
    expect(end.y).toBeCloseTo(lot.slotY, 1)
    // A whole number of turns plus the angle it is left at.
    const turns = (end.h - a.parkedH) / (2 * Math.PI)
    expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-6)
    expect(Math.abs(a.parkedH)).toBeLessThan(30 * DEG)
  })

  it('never goes backwards, and slows from a rush to a stop without a jump in speed where the slide starts', () => {
    let prev = -Infinity
    for (let t = 0; t <= a.total; t += 8) {
      const x = a.at(t).x
      expect(x).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = x
    }
    const before = a.at(a.total * 0.2)
    const speed = (a.at(a.total * 0.2 + 1).x - before.x) / 1
    expect(speed).toBeGreaterThan(0.2)
    // Just after the slide starts the speed is the same, within a hair.
    const tc = (slot - spinSlideDistance(a) - lot.left) / 0.23
    const s0 = (a.at(tc + 2).x - a.at(tc + 1).x) / 1
    const s1 = (a.at(tc - 1).x - a.at(tc - 2).x) / 1
    expect(Math.abs(s0 - s1)).toBeLessThan(0.01)
  })

  it('spins a full turn while it slides, shouting, with smoke and tyre marks, and is still at the end', () => {
    const mid = a.at(a.total * 0.7)
    expect(mid.h).toBeLessThan(-Math.PI)
    const shouts = new Set<string>()
    let smoke = 0
    let skid = 0
    for (let t = 0; t <= a.total; t += 16) {
      const p = a.at(t)
      if (p.text) shouts.add(p.text)
      if (p.smoke) smoke++
      if (p.skid) skid++
    }
    expect([...shouts]).toEqual(['WHOA!'])
    expect(smoke).toBeGreaterThan(20)
    expect(skid).toBeGreaterThan(20)
    expect(a.at(a.total)).toMatchObject({ smoke: false, skid: false })
  })

  it('is over in about two and a half seconds from the edge of the street, and faster when hasty', () => {
    expect(a.total).toBeGreaterThan(1500)
    expect(a.total).toBeLessThan(3200)
    expect(spinArrival(lot, slot, 1.5).total).toBeLessThan(a.total)
  })
})

describe('leaving with a reverse flick', () => {
  const slot = parkingSlots(lot.doorX)[0]!
  const parked = spinArrival(lot, slot).parkedH
  const d = flickDeparture(lot, slot, parked)

  it('starts from where it is parked, backs off the pavement, and ends past the end of the street in the lane', () => {
    expect(d.at(0)).toMatchObject({ x: slot, y: lot.slotY, h: parked })
    // Backing off means moving away from the building: down the screen.
    const backed = d.at(450)
    expect(backed.y).toBeGreaterThan(lot.slotY + 4)
    expect(backed.x).toBeLessThan(slot)
    const end = d.at(d.total)
    expect(end.x).toBeGreaterThanOrEqual(lot.right)
    expect(end.y).toBeCloseTo(lot.laneY, 1)
    expect(end.h).toBeCloseTo(0, 1)
  })

  it('never goes into the building, and never back to the left once it has turned to go', () => {
    let minY = Infinity
    for (let t = 0; t <= d.total; t += 8) minY = Math.min(minY, d.at(t).y)
    expect(minY).toBeGreaterThanOrEqual(lot.slotY - 0.5)
    let prev = d.at(500).x
    for (let t = 520; t <= d.total; t += 8) {
      const x = d.at(t).x
      expect(x).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = x
    }
  })

  it('shouts and smokes as it goes, and gets away in a couple of seconds', () => {
    const shouts = new Set<string>()
    for (let t = 0; t <= d.total; t += 16) if (d.at(t).text) shouts.add(d.at(t).text!)
    expect([...shouts]).toEqual(['VROOM!'])
    expect(d.total).toBeLessThan(3000)
    expect(flickDeparture(lot, slot, parked, 1.5).total).toBeLessThan(d.total)
  })
})

describe('where the driver steps out', () => {
  it('on the side of the car facing the building, whichever way it is turned', () => {
    const [x, y] = carDoorPoint(100, 290, 12 * DEG)
    expect(y).toBeLessThan(290 + 2)
    expect(Math.abs(x - 100)).toBeLessThan(10)
  })
})

/** How far the slide carries the car (constant slowing from the rush speed to a stop). */
function spinSlideDistance(a: ReturnType<typeof spinArrival>) {
  return a.slideDistance
}
