import { describe, expect, it } from 'vitest'
import { CAR_SPACING, GROUNDS, clearStart, driveLane, lampsAcross } from './grounds'
import { OFFICE, TILE } from './office'

const drive = (cars: { x: number; speed: number }[], seconds: number, onStep?: () => void) => {
  for (let t = 0; t < seconds * 1000; t += 16) {
    driveLane(cars, 16)
    onStep?.()
  }
}

describe('cars in one lane', () => {
  it('a fast car coming up behind a slow one stays a car length back and settles at the slow one\'s speed, heading right', () => {
    const slow = { x: 100, speed: 0.03 }
    const fast = { x: 0, speed: 0.06 }
    let closest = Infinity
    drive([slow, fast], 120, () => (closest = Math.min(closest, slow.x - fast.x)))
    expect(closest).toBeGreaterThanOrEqual(CAR_SPACING - 1e-6)
    expect(slow.x - fast.x).toBeCloseTo(CAR_SPACING, 3)
  })

  it('the same when the lane runs the other way', () => {
    const slow = { x: 100, speed: -0.03 }
    const fast = { x: 400, speed: -0.06 }
    let closest = Infinity
    drive([fast, slow], 120, () => (closest = Math.min(closest, fast.x - slow.x)))
    expect(closest).toBeGreaterThanOrEqual(CAR_SPACING - 1e-6)
  })

  it('a car with a clear road drives at its own speed', () => {
    const c = { x: 0, speed: 0.05 }
    driveLane([c], 100)
    expect(c.x).toBeCloseTo(5)
  })

  it('cars that start too close never go backwards, and the one behind waits until there is room', () => {
    const lead = { x: 50, speed: 0.04 }
    const back = { x: 40, speed: 0.06 }
    driveLane([lead, back], 16)
    expect(back.x).toBe(40)
    drive([lead, back], 10)
    expect(lead.x - back.x).toBeGreaterThanOrEqual(CAR_SPACING - 1e-6)
  })
})

describe('where a car may enter the road', () => {
  it('at the end of the road when nothing is near it', () => {
    expect(clearStart([{ x: 500, speed: 0.04 }], -30, 1)).toBe(-30)
  })

  it('behind a car that is sitting on the entry, going the way it goes', () => {
    expect(clearStart([{ x: -20, speed: 0.04 }], -30, 1)).toBe(-20 - CAR_SPACING)
    expect(clearStart([{ x: 700, speed: -0.04 }], 710, -1)).toBe(700 + CAR_SPACING)
  })

  it('behind the last of a queue of cars', () => {
    const queue = [{ x: -30, speed: 0.04 }, { x: -62, speed: 0.04 }]
    expect(clearStart(queue, -30, 1)).toBe(-62 - CAR_SPACING)
  })
})

describe('the street over a long run', () => {
  it('never puts two cars on top of each other, however busy it gets', async () => {
    const { Street } = await import('./grounds')
    const { OFFICE } = await import('./office')
    const street = new Street(OFFICE.map)
    const cars = () => (street as unknown as { cars: { x: number; lane: number; speed: number }[] }).cars
    let worst = Infinity
    for (let t = 0; t < 10 * 60_000; t += 16) {
      // A different amount of work every so often, so cars are added and retired too.
      if (t % 20_000 === 0) street.setBusy(Math.floor(t / 20_000) % 5)
      street.update(16, t)
      for (const lane of [0, 1]) {
        const xs = cars().filter((c) => c.lane === lane).map((c) => c.x).sort((a, b) => a - b)
        for (let i = 1; i < xs.length; i++) worst = Math.min(worst, xs[i]! - xs[i - 1]!)
      }
    }
    expect(worst).toBeGreaterThanOrEqual(CAR_SPACING - 1e-6)
  })
})

describe('making way for a car that is racing through', () => {
  it('clears the upper lane where asked, adds no car to it meanwhile, and lets traffic back afterwards', async () => {
    const { Street } = await import('./grounds')
    const { OFFICE } = await import('./office')
    const street = new Street(OFFICE.map)
    const cars = () => (street as unknown as { cars: { x: number; lane: number; fadeMs?: number }[] }).cars
    const upper = () => cars().filter((c) => c.lane === 0)
    street.setBusy(4)
    let t = 0
    for (; t < 60_000; t += 16) street.update(16, t)
    expect(upper().length).toBeGreaterThan(0)

    const whole = [{ from: -10_000, to: 10_000 }]
    for (let k = 0; k < 40_000; k += 16, t += 16) {
      street.makeWay(whole)
      street.update(16, t)
      // After the moment it takes them to go, nothing is in the upper lane at all.
      if (k > 600) expect(upper()).toHaveLength(0)
    }
    // The other lane carries on as before.
    expect(cars().filter((c) => c.lane === 1).length).toBeGreaterThan(0)

    street.makeWay([])
    for (let k = 0; k < 80_000; k += 16, t += 16) street.update(16, t)
    expect(upper().length).toBeGreaterThan(0)
  })

  it('only clears the stretch it is asked about', async () => {
    const { Street } = await import('./grounds')
    const { OFFICE } = await import('./office')
    const street = new Street(OFFICE.map)
    const cars = () => (street as unknown as { cars: { x: number; lane: number }[] }).cars
    street.setBusy(4)
    let t = 0
    for (; t < 90_000; t += 16) street.update(16, t)
    const before = cars().filter((c) => c.lane === 0)
    expect(before.length).toBeGreaterThan(0)
    const far = { from: 9000, to: 9999 }
    street.makeWay([far])
    for (let k = 0; k < 600; k += 16, t += 16) street.update(16, t)
    expect(cars().filter((c) => c.lane === 0).length).toBeGreaterThan(0)
  })
})

describe('the lamps across the road', () => {
  const lamps = lampsAcross(OFFICE.map)
  const H = OFFICE.map.h * TILE
  it('stand on the far pavement and spread along the whole street, 120 apart', () => {
    expect(lamps.length).toBeGreaterThan(3)
    expect(new Set(lamps.map((l) => l.y)).size).toBe(1)
    expect(lamps[0]!.x).toBe(-GROUNDS.west + 60)
    expect(lamps[1]!.x - lamps[0]!.x).toBe(120)
    expect(lamps.at(-1)!.x).toBeLessThan(OFFICE.map.w * TILE + GROUNDS.east)
  })
  it('reach up into the road, which is why a car must pass behind them and not over them', () => {
    const farPavement = H + 8 + 62
    expect(lamps[0]!.y - 14).toBeLessThan(farPavement)
    expect(lamps[0]!.y).toBeGreaterThan(farPavement)
  })
})
