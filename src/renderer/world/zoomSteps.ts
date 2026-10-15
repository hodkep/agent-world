const MAX_ZOOM = 10
const MIN_ZOOM = 1
/** One step is about this much bigger or smaller, rounded to a whole scale so every art pixel stays the same size. */
const STEP = 1.25

/** The scale one step in (`1`) or out (`-1`) from `now`: at least the next whole scale, at most a quarter more. */
export function nextZoom(now: number, dir: 1 | -1): number {
  const next = dir > 0 ? Math.max(Math.floor(now + 1e-6) + 1, Math.round(now * STEP)) : Math.min(Math.ceil(now - 1e-6) - 1, Math.round(now / STEP))
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
}

/** How far a wheel has to turn for one step: a notch of a mouse wheel is about this much. */
const NOTCH = 100
/** After a step, the wheel is not listened to for this long, so a swipe that sends dozens of events steps once, and a long swipe a few times. */
const COOLDOWN_MS = 220
/** A pause this long drops what had been counted towards a step. */
const FORGET_MS = 250

/** Wheel and trackpad events (their distance, the unit it is in, and when) as steps: `1` in, `-1` out, `0` not yet. */
export function wheelSteps() {
  let sum = 0
  let last = -Infinity
  let heldUntil = -Infinity
  return (deltaY: number, deltaMode: number, now: number): 0 | 1 | -1 => {
    const px = deltaY * (deltaMode === 1 ? 40 : deltaMode === 2 ? 400 : 1)
    if (now - last > FORGET_MS) sum = 0
    last = now
    if (now < heldUntil) return 0
    sum += px
    if (Math.abs(sum) < NOTCH) return 0
    const dir = sum < 0 ? 1 : -1
    sum = 0
    heldUntil = now + COOLDOWN_MS
    return dir
  }
}
