import { type Arrival, type CarPose, type Departure, type Lot, flickDeparture, parkingSlots, pickSlot, spinArrival } from './arrival'

export type VisitPhase = 'driving' | 'parked' | 'boarding' | 'departing'

export interface Visit {
  key: string
  /** Index into the parking spots. */
  slot: number
  color: number
  phase: VisitPhase
  /** Milliseconds spent in this phase. */
  t: number
  pose: CarPose
  /** The angle it is parked at. */
  parkedH: number
  /** Whether the passenger has been let out. */
  doorSent: boolean
  /** The passenger is back, or was never sent out: time to go. */
  leaving: boolean
  arrival: Arrival
  departure: Departure | null
}

/** Something that happened that the world must act on. `door`: the passenger can step out. `gone`: the car has left. */
export interface FleetEvent {
  type: 'door' | 'gone'
  key: string
}

/** How long the car sits before its passenger steps out, and how long they take to jump in. */
const DOOR_MS = 420
const BOARD_MS = 260

/**
 * The cars that bring subagents. It only knows where each car is and what it is doing; the world draws them and moves the
 * passengers. A car arrives, parks, lets its passenger out, waits, takes them back (`leave`) and drives off.
 */
export class Fleet {
  readonly visits = new Map<string, Visit>()
  private readonly slots: number[]

  constructor(
    private readonly lot: Lot,
    private readonly speed = 1
  ) {
    this.slots = parkingSlots(lot.doorX)
  }

  has(key: string) {
    return this.visits.has(key)
  }

  occupied(): Set<number> {
    return new Set([...this.visits.values()].map((v) => v.slot))
  }

  /** Sends a car for this subagent. False when every spot is taken. */
  arrive(key: string, color: number): boolean {
    if (this.visits.has(key)) return true
    const slot = pickSlot(this.slots, this.occupied(), this.lot.doorX)
    if (slot === null) return false
    const arrival = spinArrival(this.lot, this.slots[slot]!, this.speed)
    this.visits.set(key, { key, slot, color, phase: 'driving', t: 0, pose: arrival.at(0), parkedH: arrival.parkedH, doorSent: false, leaving: false, arrival, departure: null })
    return true
  }

  /** The passenger is back at the car, or never came out: board and drive off as soon as that is possible. */
  leave(key: string) {
    const v = this.visits.get(key)
    if (v) v.leaving = true
  }

  /** True while any car is moving (driving in, boarding or driving off). A parked car waiting for its passenger is not. */
  busy(): boolean {
    for (const v of this.visits.values()) if (v.phase !== 'parked') return true
    return false
  }

  /** Stretches of the upper lane that ordinary traffic has to stay out of, because a car is racing through them. */
  wayRanges(): { from: number; to: number }[] {
    const out: { from: number; to: number }[] = []
    for (const v of this.visits.values()) {
      const x = this.slots[v.slot]!
      if (v.phase === 'driving') out.push({ from: this.lot.left, to: x + 40 })
      else if (v.phase === 'boarding' || v.phase === 'departing') out.push({ from: x - 40, to: this.lot.right })
    }
    return out
  }

  update(dtMs: number): FleetEvent[] {
    const events: FleetEvent[] = []
    for (const v of [...this.visits.values()]) {
      v.t += dtMs
      if (v.phase === 'driving') {
        v.pose = v.arrival.at(Math.min(v.t, v.arrival.total))
        if (v.t >= v.arrival.total) {
          v.phase = 'parked'
          v.t = 0
          v.pose = { ...v.arrival.at(v.arrival.total), bounce: 0, smoke: false, skid: false, text: null }
        }
      } else if (v.phase === 'parked') {
        if (!v.doorSent && !v.leaving && v.t >= DOOR_MS / this.speed) {
          v.doorSent = true
          events.push({ type: 'door', key: v.key })
        }
        // Nobody was sent out: go as soon as the car has had its moment.
        if (v.leaving && (v.doorSent || v.t >= DOOR_MS / this.speed)) {
          v.phase = 'boarding'
          v.t = 0
        }
      } else if (v.phase === 'boarding') {
        if (v.t >= BOARD_MS / this.speed) {
          v.phase = 'departing'
          v.t = 0
          v.departure = flickDeparture(this.lot, this.slots[v.slot]!, v.parkedH, this.speed)
        }
      } else if (v.departure) {
        v.pose = v.departure.at(Math.min(v.t, v.departure.total))
        if (v.t >= v.departure.total) {
          this.visits.delete(v.key)
          events.push({ type: 'gone', key: v.key })
        }
      }
    }
    return events
  }
}
