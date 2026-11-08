import { describe, expect, it } from 'vitest'
import { GitRamp, type RampGeo } from './gitRamp'

// The wall is at y 272: the hatch is in it, the crate at the kerb is outside, and the scooter's lane is below the crate.
const geo: RampGeo = { hatch: { x: 104, y: 266 }, crate: { x: 96, y: 292 }, wallY: 272, laneY: 322 }
const desk = { x: 56, y: 40 }
const farDesk = { x: 240, y: 40 }

describe('a parcel on its way out of the office', () => {
  it('leaves the desk at once, hops up and across in an arc higher than a straight line, and slides out through the hatch', () => {
    const r = new GitRamp(geo)
    const s = r.add('commit', desk, 1000)
    const at = (ms: number) => r.frame(ms).parcels[0]!
    expect(at(1000)).toMatchObject({ x: desk.x })
    // Halfway through the hop it is above the straight line from the desk to the hatch.
    const mid = at(1000 + 180 + (s.hopMs - 0) / 2)
    const straightY = (desk.y + geo.hatch.y) / 2
    expect(mid.y).toBeLessThan(straightY)
    expect(mid.x).toBeGreaterThan(desk.x)
    expect(mid.x).toBeLessThan(geo.hatch.x)
    // Over the wall line it is on its way down the chute, and it ends in the crate.
    expect(at(s.landMs - 100).y).toBeGreaterThan(geo.wallY - 8)
    expect(at(s.landMs + 50)).toMatchObject({ x: geo.crate.x + 5, y: geo.crate.y + 3 })
  })

  it('is on the scooter within three seconds of the command and the scooter is gone within four and a half', () => {
    const r = new GitRamp(geo)
    const s = r.add('push', farDesk, 0)
    expect(s.pickMs).toBeLessThan(3200)
    expect(s.goneMs).toBeLessThan(4500)
  })

  it('is carried off by a scooter that rides in, stops at the crate, and rides out', () => {
    const r = new GitRamp(geo)
    const s = r.add('pr', desk, 0)
    expect(r.frame(s.landMs - 800).scooters).toEqual([])
    const stopped = r.frame(s.arriveMs + 50).scooters
    expect(stopped).toHaveLength(1)
    expect(stopped[0]).toMatchObject({ mode: 'park' })
    expect(stopped[0]!.x).toBeLessThan(geo.crate.x + 30)
    expect(stopped[0]!.x).toBeGreaterThan(geo.crate.x - 40)
    const leaving = r.frame(s.goneMs - 200).scooters[0]!
    expect(leaving.mode).toBe('leave')
    expect(leaving.x).toBeGreaterThan(stopped[0]!.x)
    const after = r.frame(s.goneMs + 10)
    expect(after.scooters).toEqual([])
    expect(after.parcels).toEqual([])
  })

  it('rides on the scooter with the parcel after the pick up', () => {
    const r = new GitRamp(geo)
    const s = r.add('commit', desk, 0)
    const f = r.frame(s.arriveMs + 300)
    expect(f.parcels).toHaveLength(1)
    expect(f.parcels[0]!.y).toBeGreaterThan(geo.laneY - 30)
    expect(f.parcels[0]!.x).toBeCloseTo(f.scooters[0]!.x + 6, 0)
  })
})

describe('a busy office', () => {
  it('has one scooter take every parcel that is in the crate when it arrives', () => {
    const r = new GitRamp(geo)
    const a = r.add('pr', desk, 0)
    const b = r.add('commit', farDesk, 300)
    expect(b.arriveMs).toBe(a.arriveMs)
    const f = r.frame(a.arriveMs + 300)
    expect(f.scooters).toHaveLength(1)
    expect(f.parcels).toHaveLength(2)
  })

  it('sends a second scooter for a parcel that lands after the first one has come, and never two on the road at once', () => {
    const r = new GitRamp(geo)
    const a = r.add('commit', desk, 0)
    const b = r.add('push', desk, a.arriveMs + 400)
    expect(b.arriveMs).toBeGreaterThanOrEqual(a.goneMs)
    for (let t = 0; t < b.goneMs; t += 40) expect(r.frame(t).scooters.length).toBeLessThanOrEqual(1)
  })

  it('shows each parcel on its own place in the crate', () => {
    const r = new GitRamp(geo)
    r.add('commit', desk, 0)
    const b = r.add('push', desk, 100)
    const f = r.frame(b.landMs + 20)
    expect(new Set(f.parcels.map((p) => p.x)).size).toBe(2)
  })

  it('forgets what has gone, so a long day does not pile up', () => {
    const r = new GitRamp(geo)
    for (let i = 0; i < 20; i++) r.add('commit', desk, i * 10_000)
    r.frame(300_000)
    expect(r.size).toBe(0)
  })

  it('does not send a scooter for a parcel that was left out because the crate was full', () => {
    const r = new GitRamp(geo)
    let last = r.add('commit', desk, 0)
    for (let i = 1; i < 6; i++) last = r.add('commit', desk, i)
    const extra = r.add('push', desk, last.arriveMs + 600)
    expect(extra.arriveMs).toBe(last.arriveMs)
    expect(r.frame(last.goneMs + 3000).scooters).toEqual([])
  })

  it('takes no more than the newest few at once: a flood of commands is a crate, not a hundred parcels', () => {
    const r = new GitRamp(geo)
    for (let i = 0; i < 40; i++) r.add('commit', desk, i)
    expect(r.size).toBeLessThanOrEqual(6)
  })
})
