/** The two cabinets in the lounge corner show how much is running: a row of bars on each screen that grows with the load. */
export const COLS = 5
export const ROWS = 7

const STEPS = [0, 0.35, 0.6, 0.8, 1]

/** The load for this many agents running a command (a test, a build, a server): none, then a little more with each, full at four. */
export const loadFor = (running: number) => STEPS[Math.min(Math.max(0, Math.floor(running)), STEPS.length - 1)]!

/** A number from 0 to 1 that is always the same for the same three inputs. */
function hash(a: number, b: number, c: number) {
  let x = (Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263) + Math.imul(c, 1274126177)) | 0
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/** How high each bar stands at this moment (0 to ROWS): they jump to a new height more often the busier it is. `seed` keeps the two cabinets apart. */
export function barsAt(level: number, ms: number, seed: number): number[] {
  const step = Math.floor(ms / (260 - 140 * level))
  return Array.from({ length: COLS }, (_, c) => Math.round(level * ROWS * (0.35 + 0.65 * hash(c, seed, step))))
}

/** Moves the shown load toward the real one, so a command starting or stopping fades in and out over a second or so. */
export const settle = (shown: number, target: number, dtMs: number) => shown + (target - shown) * (1 - Math.exp(-dtMs / 600))
