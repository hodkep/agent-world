/** How many frames in a row nothing may change before a jump is called settled. */
export const SETTLE_STABLE = 8
/** The longest a jump holds the message in the middle, however the conversation keeps changing. */
export const SETTLE_MAX_MS = 4000

export interface JumpSample {
  /** Milliseconds since the jump began. */
  ms: number
  /** The scroll height of the conversation. */
  height: number
  /** How far the message was from the middle before it was put back, in pixels. */
  off: number
}
export interface JumpSettle {
  stable: number
  height: number
}

/**
 * One look at a jump that is settling. Replies that were not drawn yet are counted as a short placeholder and grow when they come into view,
 * and on a slow machine that happens well after the jump; so the message is kept in the middle until the height and its place have stayed
 * the same for a few frames in a row, and not for a fixed number of frames that a slow machine uses up before anything has grown.
 */
export function settleStep(prev: JumpSettle | null, now: JumpSample): { state: JumpSettle; done: boolean } {
  const still = prev !== null && prev.height === now.height && Math.abs(now.off) < 1
  const state = { stable: still ? prev.stable + 1 : 0, height: now.height }
  return { state, done: state.stable >= SETTLE_STABLE || now.ms >= SETTLE_MAX_MS }
}
