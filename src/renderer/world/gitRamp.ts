import type { GitKind } from './gitCourier'
import type { Pt } from './staff'

/** Where things are, in the world's pixels: the hatch in the south wall (a point just inside it), the crate at the kerb (its top left), the wall's outer edge, and the scooter's lane (its bottom). */
export interface RampGeo {
  hatch: Pt
  crate: Pt
  wallY: number
  laneY: number
}

export interface Schedule {
  /** How long the hop across the office takes. */
  hopMs: number
  /** When it is in the crate, when the scooter stops at the crate, takes it, and has ridden off. */
  landMs: number
  arriveMs: number
  pickMs: number
  goneMs: number
}

export interface Shown {
  parcels: { kind: GitKind; x: number; y: number }[]
  scooters: { x: number; y: number; mode: 'ride' | 'park' | 'leave' }[]
}

const POP = 180
const SLIDE = 420
const HOP_PICK = 160
const LEAD = 1000 // from a parcel in the crate to the scooter at it
const RIDE_IN = 900
const DWELL = 400
const RIDE_OUT = 850
const GAP = RIDE_IN // a scooter never rides in while the last one is still on the road
const MAX_PARCELS = 6

interface Run {
  arrive: number
  count: number
}
interface Parcel {
  kind: GitKind
  from: Pt
  t0: number
  hop: number
  land: number
  slot: number
  run: Run
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u
const clamp01 = (u: number) => Math.max(0, Math.min(1, u))
const pickOf = (r: Run) => r.arrive + 120
const leaveOf = (r: Run) => r.arrive + DWELL
const goneOf = (r: Run) => leaveOf(r) + RIDE_OUT

/**
 * The way out for what the agents commit, push and open: a parcel leaves the desk, hops across the office to a hatch in the wall, slides down a chute into a crate at the kerb, and a scooter
 * rides in, takes everything in the crate and rides off. Positions are a function of the time, so the same on every frame rate; `add` only says when each thing will happen.
 */
export class GitRamp {
  private parcels: Parcel[] = []
  private runs: Run[] = []

  constructor(private readonly geo: RampGeo) {}

  get size() {
    return this.parcels.length
  }

  add(kind: GitKind, from: Pt, now: number): Schedule {
    const dist = Math.hypot(this.geo.hatch.x - from.x, this.geo.hatch.y - from.y)
    const hop = Math.min(800, 480 + dist * 1.2)
    const land = now + POP + hop + SLIDE
    const last = this.runs[this.runs.length - 1]
    // A flood of commands makes one crate, not a hundred parcels: past the sixth nothing is added, and no scooter comes for it.
    if (this.parcels.length >= MAX_PARCELS && last) return { hopMs: hop, landMs: land, arriveMs: last.arrive, pickMs: pickOf(last), goneMs: goneOf(last) }
    const run = last && land <= last.arrive ? last : { arrive: Math.max(land + LEAD, last ? goneOf(last) + GAP : 0), count: 0 }
    if (run !== last) this.runs.push(run)
    this.parcels.push({ kind, from, t0: now, hop, land, slot: run.count++, run })
    return { hopMs: hop, landMs: land, arriveMs: run.arrive, pickMs: pickOf(run), goneMs: goneOf(run) }
  }

  /** Nothing is on its way any more (the office was switched off). */
  clear() {
    this.parcels = []
    this.runs = []
  }

  private stop() {
    return this.geo.crate.x - 6
  }

  private scooterX(r: Run, now: number) {
    const stop = this.stop()
    if (now < r.arrive) return lerp(stop - 190, stop, 1 - Math.pow(1 - clamp01((now - (r.arrive - RIDE_IN)) / RIDE_IN), 3))
    if (now < leaveOf(r)) return stop
    return lerp(stop, stop + 260, Math.pow(clamp01((now - leaveOf(r)) / RIDE_OUT), 2))
  }

  frame(now: number): Shown {
    this.parcels = this.parcels.filter((p) => now <= goneOf(p.run))
    this.runs = this.runs.filter((r) => now <= goneOf(r))
    const { hatch, crate, wallY, laneY } = this.geo
    const parcels: Shown['parcels'] = []
    for (const p of this.parcels) {
      const t = now - p.t0
      if (t < 0) continue
      const inCrate = { x: crate.x + 5 + p.slot * 10, y: crate.y + 3 }
      let at: Pt
      if (t < POP) at = { x: p.from.x, y: p.from.y - 7 * Math.sin((t / POP) * Math.PI) }
      else if (t < POP + p.hop) {
        const u = (t - POP) / p.hop
        const arc = Math.min(60, Math.max(24, Math.hypot(hatch.x - p.from.x, hatch.y - p.from.y) * 0.3))
        at = { x: lerp(p.from.x, hatch.x, u), y: lerp(p.from.y, hatch.y, u) - arc * 4 * u * (1 - u) }
      } else if (now < p.land) {
        const u = Math.pow((now - (p.land - SLIDE)) / SLIDE, 1.6)
        at = { x: lerp(hatch.x, inCrate.x, u), y: lerp(wallY, inCrate.y, u) }
      } else if (now < pickOf(p.run)) at = inCrate
      else {
        const sx = this.scooterX(p.run, now) + 6 + p.slot * 7
        const onBike = { x: sx, y: laneY - 12 }
        const u = clamp01((now - pickOf(p.run)) / HOP_PICK)
        at = u < 1 ? { x: lerp(inCrate.x, sx, u), y: lerp(inCrate.y, onBike.y, u) - 8 * Math.sin(u * Math.PI) } : onBike
      }
      parcels.push({ kind: p.kind, ...at })
    }
    const scooters: Shown['scooters'] = this.runs
      .filter((r) => now >= r.arrive - RIDE_IN)
      .map((r) => ({ x: this.scooterX(r, now), y: laneY, mode: now < r.arrive ? ('ride' as const) : now < leaveOf(r) ? ('park' as const) : ('leave' as const) }))
    return { parcels, scooters }
  }
}
