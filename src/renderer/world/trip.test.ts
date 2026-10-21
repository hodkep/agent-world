import { describe, expect, it } from 'vitest'
import { Trip, type TripMode } from './trip'

// The road is below the door: the lane's y is greater than the sill's.
const spots = { left: -260, right: 760, laneY: 302, doorX: 144, doorY: 272 }
const run = (t: Trip, ms: number, step = 50) => {
  const modes: TripMode[] = []
  for (let i = 0; i < ms / step; i++) {
    t.update(step)
    if (modes.at(-1) !== t.mode) modes.push(t.mode)
  }
  return modes
}

describe('a visitor who comes by scooter', () => {
  it('rides in from the left edge along the road, parks in front of the door, and walks to the door', () => {
    const t = new Trip(spots)
    expect(t.mode).toBe('ride')
    expect(t.scooter.x).toBe(spots.left)
    const modes = run(t, 20_000)
    expect(modes).toEqual(['ride', 'park', 'walk', 'inside'])
    expect(t.scooter.x).toBe(spots.doorX - 24)
    expect(t.scooter.y).toBe(spots.laneY)
    expect(t.rider).toEqual({ x: spots.doorX, y: spots.doorY })
  })

  it('stays inside, with the scooter parked, until it is told it is done; then it walks back, mounts and rides off to the right', () => {
    const t = new Trip(spots)
    run(t, 20_000)
    run(t, 10_000)
    expect(t.mode).toBe('inside')
    t.finish()
    const modes = run(t, 30_000)
    expect(modes).toEqual(['return', 'mount', 'leave', 'gone'])
    expect(t.scooter.x).toBeGreaterThanOrEqual(spots.right)
  })

  it('takes about four seconds to ride in, and goes faster when sped up', () => {
    const at = (speed: number) => {
      const t = new Trip(spots, speed)
      let ms = 0
      while (t.mode === 'ride') (t.update(50), (ms += 50))
      return ms
    }
    expect(at(1)).toBeGreaterThan(3000)
    expect(at(1)).toBeLessThan(6000)
    expect(at(10)).toBeLessThan(at(1) / 5)
  })

  it('never moves backwards while riding in or riding off, and the rider is only seen walking between the road and the door', () => {
    const t = new Trip(spots)
    let last = t.scooter.x
    while (t.mode !== 'inside') {
      t.update(50)
      expect(t.scooter.x).toBeGreaterThanOrEqual(last)
      last = t.scooter.x
      expect(t.onScooter).toBe(t.mode === 'ride' || t.mode === 'park')
    }
    t.finish()
    while ((t.mode as TripMode) !== 'gone') {
      t.update(50)
      expect(t.scooter.x).toBeGreaterThanOrEqual(last)
      last = t.scooter.x
    }
  })
})
