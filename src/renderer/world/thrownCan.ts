import { Graphics } from 'pixi.js'
import type { Pt } from './office'

/** How long each part of the can's flight takes, in ms: the throw to the boy, off him to the wall, two bounces off the wall, and the roll to a stop. */
export const FLIGHT = { fly: 280, pop: 320, b1: 260, b2: 200, roll: 900 } as const
/** Heights above the floor, in pixels: the supervisor's hand, the boy's head, the point on the wall. */
export const Z = { hand: 14, head: 17, wall: 12 } as const

/** The can's four places on the floor, in pixels: the supervisor's hand, the boy, the east wall and where it ends up. */
export interface Toss {
  from: Pt
  hit: Pt
  wall: Pt
  rest: Pt
}
export type CanPhase = 'fly' | 'pop' | 'b1' | 'b2' | 'roll' | 'rest'
export interface CanState extends Pt {
  /** Height above the floor. */
  z: number
  phase: CanPhase
}
export interface CanEvent {
  what: 'hit' | 'wall' | 'bounce' | 'rest'
  at: number
}

const T1 = FLIGHT.fly
const T2 = T1 + FLIGHT.pop
const T3 = T2 + FLIGHT.b1
const T4 = T3 + FLIGHT.b2
export const flightEnd = () => T4 + FLIGHT.roll

const mix = (a: number, b: number, u: number) => a + (b - a) * u
const between = (a: Pt, b: Pt, u: number): Pt => ({ x: mix(a.x, b.x, u), y: mix(a.y, b.y, u) })
/** A parabola over one stretch: nothing at either end, `peak` in the middle. */
const arc = (u: number, peak: number) => 4 * peak * u * (1 - u)

/** Where the can is `ms` after it leaves the supervisor's hand. A function of the time alone, so it is the same at any frame rate. */
export function canAt(ms: number, c: Toss): CanState {
  const p1 = between(c.wall, c.rest, 0.5)
  const p2 = between(c.wall, c.rest, 0.8)
  if (ms < T1) {
    const u = ms / FLIGHT.fly
    return { ...between(c.from, c.hit, u), z: mix(Z.hand, Z.head, u) + arc(u, 6), phase: 'fly' }
  }
  if (ms < T2) {
    const u = (ms - T1) / FLIGHT.pop
    return { ...between(c.hit, c.wall, u), z: mix(Z.head, Z.wall, u) + arc(u, 10), phase: 'pop' }
  }
  if (ms < T3) {
    const u = (ms - T2) / FLIGHT.b1
    return { ...between(c.wall, p1, u), z: Z.wall * (1 - u) + arc(u, 9), phase: 'b1' }
  }
  if (ms < T4) {
    const u = (ms - T3) / FLIGHT.b2
    return { ...between(p1, p2, u), z: arc(u, 4), phase: 'b2' }
  }
  if (ms < flightEnd()) {
    const u = (ms - T4) / FLIGHT.roll
    return { ...between(p2, c.rest, u * (2 - u)), z: 0, phase: 'roll' }
  }
  return { ...c.rest, z: 0, phase: 'rest' }
}

const EVENTS: CanEvent[] = [
  { what: 'hit', at: T1 },
  { what: 'wall', at: T2 },
  { what: 'bounce', at: T3 },
  { what: 'bounce', at: T4 },
  { what: 'rest', at: flightEnd() }
]
/** What happened between two moments of the flight (`from` counted, `to` not), so each frame tells the world only what is new. */
export const canEvents = (from: number, to: number): CanEvent[] => EVENTS.filter((e) => e.at >= from && e.at < to)

/** A can nobody picks up (the boy was called away) is cleared a minute after it came to rest. */
export const LEFT_MS = 60_000
export const leftOnFloor = (ms: number) => ms >= flightEnd() + LEFT_MS

const SPIN = 60
const STARS_MS = 700
const SPARK_MS = 240
const DUST_MS = 170

/** The thrown can, its shadow on the floor, the stars over the boy's head and the spark where it strikes the wall: drawn only while there is something to draw. */
export class ThrownCan {
  readonly view = new Graphics()
  private toss: Toss | null = null
  private ms = 0

  constructor() {
    this.view.visible = false
  }

  start(toss: Toss) {
    this.toss = toss
    this.ms = 0
    this.view.visible = true
    this.draw()
  }

  /** The boy has picked it up. */
  take() {
    this.toss = null
    this.view.clear()
    this.view.visible = false
  }

  update(dtMs: number): CanEvent[] {
    if (!this.toss) return []
    const told = canEvents(this.ms, this.ms + dtMs)
    const before = this.ms
    this.ms += dtMs
    if (leftOnFloor(this.ms)) return (this.take(), told)
    // Once it lies still, and the stars and the dust are over, there is nothing new to draw.
    if (before <= flightEnd() + DUST_MS) this.draw()
    return told
  }

  private draw() {
    const c = this.toss
    if (!c) return
    const g = this.view
    g.clear()
    const s = canAt(this.ms, c)
    const px = Math.round(s.x)
    const py = Math.round(s.y)
    // Its shadow stays on the floor and shrinks as the can climbs.
    const w = Math.max(2, 6 - Math.floor(s.z / 6))
    g.rect(px - Math.floor(w / 2), py - 1, w, 2).fill({ color: 0x000000, alpha: 0.4 })
    // Stars go round the boy's head for a moment after the hit.
    const sinceHit = this.ms - T1
    if (sinceHit >= 0 && sinceHit < STARS_MS) {
      for (let i = 0; i < 3; i++) {
        const a = this.ms * 0.014 + i * 2.1
        g.rect(Math.round(c.hit.x + Math.cos(a) * 7) - 1, Math.round(c.hit.y - 24 + Math.sin(a) * 3) - 1, 2, 2).fill(0xf2c230)
      }
    }
    // The spark where it meets the wall: a cross, then a smaller one.
    const sinceWall = this.ms - T2
    if (sinceWall >= 0 && sinceWall < SPARK_MS) {
      const r = sinceWall < SPARK_MS / 2 ? 3 : 2
      const y = Math.round(c.wall.y - Z.wall) - 2
      g.rect(Math.round(c.wall.x) - 1, y - r, 2, r * 2 + 1).fill(0xffffff)
      g.rect(Math.round(c.wall.x) - r, y - 1, r * 2 + 1, 2).fill(0xffffff)
      g.rect(Math.round(c.wall.x) - r, y - r, 1, 1).fill(0xf2c230)
      g.rect(Math.round(c.wall.x) + r, y + r, 1, 1).fill(0xf2c230)
    }
    // A puff of dust where it lands each time.
    for (const at of [T3, T4]) {
      const d = this.ms - at
      if (d >= 0 && d < DUST_MS) {
        const spread = Math.floor(d / 40)
        g.rect(px - 3 - spread, py - 2, 2, 1).fill({ color: 0xe4e4ee, alpha: 0.7 })
        g.rect(px + 2 + spread, py - 2, 2, 1).fill({ color: 0xe4e4ee, alpha: 0.7 })
      }
    }
    // The can itself: it turns in the air, and lies on its side once it has stopped.
    const frame = s.z > 0 || s.phase === 'roll' ? Math.floor(this.ms / SPIN) % 4 : 2
    const cy = py - Math.round(s.z) - 3
    const [cw, ch] = frame === 0 ? [4, 6] : frame === 2 ? [6, 4] : [5, 5]
    g.rect(px - Math.floor(cw / 2) - 1, cy - Math.floor(ch / 2) - 1, cw + 2, ch + 2).fill(0x1a1522)
    g.rect(px - Math.floor(cw / 2), cy - Math.floor(ch / 2), cw, ch).fill(0x6aa0c8)
    g.rect(px - Math.floor(cw / 2), cy, cw, 1).fill(0xf4f4f8)
  }
}
