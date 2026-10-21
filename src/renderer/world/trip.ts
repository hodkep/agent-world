export interface TripSpots {
  /** Where the road's edge is on either side, in the world's pixels. */
  left: number
  right: number
  /** The lane the scooter rides in, and where the entrance door is (x of its middle, y of its sill). */
  laneY: number
  doorX: number
  doorY: number
}
export type TripMode = 'ride' | 'park' | 'walk' | 'inside' | 'return' | 'mount' | 'leave' | 'gone'

const RIDE = 0.1
const WALK = 0.04
const PARK_MS = 500
const MOUNT_MS = 400
/** The scooter is 24 pixels long: parked, its front wheel is at the door. */
const LENGTH = 24

const toward = (v: number, target: number, step: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step))

/**
 * A visitor's trip by scooter, as positions only: it rides in from the left along the lane, parks in front of the door, steps off and walks up to the door (`inside`: the office's own
 * actor takes over there); once it is told it is `finish`ed it walks back, mounts and rides off to the right. `speed` shortens every wait and quickens every move, for specs.
 */
export class Trip {
  mode: TripMode = 'ride'
  readonly scooter: { x: number; y: number }
  rider: { x: number; y: number }
  private left = 0

  constructor(
    private readonly s: TripSpots,
    private readonly speed = 1
  ) {
    this.scooter = { x: s.left, y: s.laneY }
    this.rider = { x: s.doorX, y: s.laneY }
  }

  /** The rider is on the scooter (and drawn on it) rather than walking or inside. */
  get onScooter() {
    return this.mode === 'ride' || this.mode === 'park' || this.mode === 'mount' || this.mode === 'leave'
  }

  /** The errand inside is done: it walks back out. */
  finish() {
    if (this.mode === 'inside') this.mode = 'return'
  }

  update(dtMs: number) {
    const dt = dtMs * this.speed
    const parked = this.s.doorX - LENGTH
    switch (this.mode) {
      case 'ride':
        this.scooter.x = Math.min(parked, this.scooter.x + RIDE * dt)
        if (this.scooter.x >= parked) (this.mode = 'park', (this.left = PARK_MS))
        break
      case 'park':
        this.left -= dt
        if (this.left <= 0) (this.mode = 'walk', (this.rider = { x: this.s.doorX, y: this.s.laneY }))
        break
      case 'walk':
        this.rider.y = toward(this.rider.y, this.s.doorY, WALK * dt)
        if (this.rider.y === this.s.doorY) this.mode = 'inside'
        break
      case 'return':
        this.rider.y = toward(this.rider.y, this.s.laneY, WALK * dt)
        if (this.rider.y === this.s.laneY) (this.mode = 'mount', (this.left = MOUNT_MS))
        break
      case 'mount':
        this.left -= dt
        if (this.left <= 0) this.mode = 'leave'
        break
      case 'leave':
        this.scooter.x += RIDE * dt
        if (this.scooter.x >= this.s.right) this.mode = 'gone'
        break
    }
  }
}
