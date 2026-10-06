// A subagent comes by car: down the street, a spin-out onto the pavement beside the door, a rush inside. When it is done
// the driver rushes back, the car reverses off the kerb, flicks round and speeds off. This is only the motion, as times and
// positions, so it can be tested without a screen. The drawing is in visitors.ts.

/** The street in front of the office, in art pixels. */
export interface Lot {
  /** Centre of the entrance. */
  doorX: number
  /** Centre line of the upper lane, the one that runs towards the right. */
  laneY: number
  /** Centre line of a car parked on the pavement. */
  slotY: number
  /** Where the street begins and ends (both off screen). */
  left: number
  right: number
}

export interface CarPose {
  x: number
  y: number
  /** Turn in radians; 0 faces right, negative turns the nose up towards the building. */
  h: number
  smoke?: boolean
  skid?: boolean
  /** Thick smoke, for a spin. */
  heavy?: boolean
  /** A shout over the car. */
  text?: string | null
  /** A one pixel hop when it settles. */
  bounce?: number
}

const DEG = Math.PI / 180
const smooth = (s: number) => s * s * (3 - 2 * s)
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const backOut = (s: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (s - 1) ** 3 + c1 * (s - 1) ** 2
}

/** How much faster than the walking pace a person rushes between the car and the desk. */
export const RUSH = 2.2

/** Four spots on the pavement, two each side of the entrance, none in front of it. */
export function parkingSlots(doorX: number): number[] {
  return [doorX - 52, doorX + 52, doorX - 104, doorX + 104]
}

/** The free spot nearest the door (the left one when two are as near), or null when all are taken. */
export function pickSlot(slots: number[], taken: ReadonlySet<number>, doorX = slots.reduce((a, b) => a + b, 0) / slots.length): number | null {
  const free = slots.map((x, i) => ({ i, d: Math.abs(x - doorX), x })).filter((s) => !taken.has(s.i))
  if (free.length === 0) return null
  return free.sort((a, b) => a.d - b.d || a.x - b.x)[0]!.i
}

const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]

/** Where the driver's feet land: by the side of the car that faces the building. */
export function carDoorPoint(x: number, y: number, h: number): [number, number] {
  const [dx, dy] = rot(2, -8, h)
  return [x + dx, y + dy + 6]
}

const RUSH_SPEED = 0.23 // px per ms, about four times the street traffic

export interface Arrival {
  total: number
  /** The angle it is left parked at. */
  parkedH: number
  /** How far the slide carries it (constant slowing from the rush speed to a stop). */
  slideDistance: number
  at(t: number): CarPose
}

/** Races in along the upper lane, loses the back end, spins a full turn and stops in its spot. */
export function spinArrival(lot: Lot, slotX: number, speed = 1): Arrival {
  const v = RUSH_SPEED * speed
  // Left nose towards the building, so reversing backs it out into the road.
  const ph = -12 * DEG
  const slide = 1050 / speed
  const tail = 220 / speed
  const dist = (v * slide) / 2
  const xd = slotX - dist
  const tc = (xd - lot.left) / v
  return {
    total: tc + slide + tail,
    parkedH: ph,
    slideDistance: dist,
    at(t) {
      if (t < tc) return { x: lot.left + v * t, y: lot.laneY, h: 0 }
      const tau = Math.min(t - tc, slide)
      const s = tau / slide
      const x = xd + v * tau - (v / (2 * slide)) * tau * tau
      const y = lot.laneY + (lot.slotY - lot.laneY) * smooth(clamp((s - 0.1) / 0.75))
      const h = (ph - Math.PI * 2) * (1 - (1 - s) ** 2.4)
      const after = t - tc - slide
      const bounce = after > 0 && after < tail ? Math.round(Math.sin((after / tail) * Math.PI * 2)) : 0
      return { x, y, h, smoke: s > 0.03 && s < 0.95, heavy: true, skid: s > 0.06 && s < 0.9, text: s > 0.05 && s < 0.8 ? 'WHOA!' : null, bounce }
    }
  }
}

export interface Departure {
  total: number
  at(t: number): CarPose
}

/** Backs off the pavement, flicks round to face the way it is going, and floors it. */
export function flickDeparture(lot: Lot, slotX: number, parkedH: number, speed = 1): Departure {
  const a = 0.00052 * speed * speed
  const reverse = 480 / speed
  const back = 24
  const bx = -Math.cos(parkedH) * back
  const by = -Math.sin(parkedH) * back
  const x1 = slotX + bx
  const y1 = lot.slotY + by
  const flick = 320 / speed
  const run = Math.sqrt((2 * (lot.right - x1)) / a)
  return {
    total: reverse + run,
    at(t) {
      if (t < reverse) {
        const s = smooth(t / reverse)
        return { x: slotX + bx * s, y: lot.slotY + by * s, h: parkedH, smoke: t > 0, skid: true }
      }
      const tau = t - reverse
      const turn = clamp(tau / flick)
      return {
        x: x1 + 0.5 * a * tau * tau,
        y: y1 + (lot.laneY - y1) * smooth(clamp(tau / (280 / speed))),
        h: parkedH * (1 - backOut(turn)),
        smoke: tau < 500 / speed,
        skid: tau < 420 / speed,
        heavy: tau < 260 / speed,
        text: tau > 40 && tau < 700 / speed ? 'VROOM!' : null
      }
    }
  }
}
