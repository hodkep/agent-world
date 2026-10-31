/**
 * Frames per second the office is drawn at. The art is stepped pixel animation, so a 120 Hz screen gains nothing from being matched:
 * measured with three idle agents, drawing at 120 fps took about 40% of a CPU core, 30 fps about 25%, 20 fps about 20%.
 */
export const FPS = { calm: 20, moving: 60, away: 5 } as const

/** Smoothness is kept for this long after the last pan, zoom, step or flying envelope, so it does not flicker between two moves. */
export const MOVING_MS = 800

/** The frame rate to draw at: 0 means stop altogether (nobody can see the window). */
export function frameCap({ hidden, focused, lastActive, now, shown = true }: { hidden: boolean; focused: boolean; lastActive: number; now: number; /** False while the person has the office hidden: nothing is drawn. */ shown?: boolean }): number {
  if (hidden || !shown) return 0
  if (!focused) return FPS.away
  return now - lastActive < MOVING_MS ? FPS.moving : FPS.calm
}

/**
 * The real time since the last frame, for the clocks that must keep real pace however seldom the office is drawn (the weather, the visitors, the rests): the frame's own time is capped
 * by the graphics library at 100 ms, so at 5 frames a second it runs at half speed. Zero for the first frame, and never more than `cap`, so a sleep does not fire everything at once.
 */
export const elapsedSince = (now: number, last: number | null, cap = 120_000) => (last === null ? 0 : Math.min(cap, Math.max(0, now - last)))
