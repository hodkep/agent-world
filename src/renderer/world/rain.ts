/** Where drop `i` is in frame `f` over grounds `w` by `h` pixels: it falls 17 pixels a frame, slanting a little, and starts again at the top. */
export function streakAt(i: number, f: number, w: number, h: number) {
  return { x: (i * 97 + f * 7) % w, y: (i * 61 + f * 17) % h }
}

const CYCLE = 8
const SPLASH_FRAMES = 3

/**
 * The splashes in frame `f` of `n` drops: each drop lives a cycle of eight frames, falling for five and splashing for the last three, at the foot of where it fell.
 * `age` is how far its splash has spread (0 to 2).
 */
export function splashesAt(f: number, n: number, w: number, h: number) {
  const out: { i: number; x: number; y: number; age: number }[] = []
  for (let i = 0; i < n; i++) {
    const phase = (f + i) % CYCLE
    if (phase >= SPLASH_FRAMES) continue
    const s = streakAt(i, f, w, h)
    out.push({ i, x: s.x, y: s.y + 7, age: phase })
  }
  return out
}

/** Whether drop `i` is still falling in frame `f` (and so drawn as a streak), rather than splashing. */
export const falling = (i: number, f: number) => (f + i) % CYCLE >= SPLASH_FRAMES
