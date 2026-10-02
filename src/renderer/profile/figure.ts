import type { Role } from '../world/worldState'
import { type Pose, type View, characterPixels, paletteFor } from '../world/sprites'

/** The same 16x24 grid the office characters are drawn on. */
export const FIGURE_W = 16
export const FIGURE_H = 24
export type Mood = 'working' | 'idle' | 'asleep'

const BUSY = new Set(['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting'])
/** What the figure does, from what the agent is doing. */
export const figureMood = (activity: string): Mood => (BUSY.has(activity) ? 'working' : activity === 'asleep' ? 'asleep' : 'idle')

type RGB = [number, number, number]
const rgb = (n: number): RGB => [(n >> 16) & 255, (n >> 8) & 255, n & 255]
const mix = (a: RGB, b: RGB, t: number): RGB => [(a[0] + (b[0] - a[0]) * t) | 0, (a[1] + (b[1] - a[1]) * t) | 0, (a[2] + (b[2] - a[2]) * t) | 0]
const INK: RGB = [26, 21, 34]

/** The head looks at you, then to each side, like the character does in the office when it turns. */
const LOOK: { view: View; flip: boolean }[] = [
  { view: 'front', flip: false },
  { view: 'front', flip: false },
  { view: 'side', flip: false },
  { view: 'side', flip: false },
  { view: 'front', flip: false },
  { view: 'front', flip: false },
  { view: 'side', flip: true },
  { view: 'side', flip: true }
]
const STEP_MS = 420

export interface FigureOptions {
  /** The agent's id: it is the character the office draws for that id, in the same colours and hair. */
  key: string
  role: Role
  mood: Mood
  /** Milliseconds, any origin: the head turns, the body hops and the hands move with it. */
  t: number
  reduced: boolean
}

/**
 * The agent's character, drawn from the very same sprite as its figure in the office (same hair, skin, hood or suit,
 * crown), a little larger and happier: a smile and rosy cheeks, a hop, a wave when idle, a laptop when working, a
 * doze when asleep, on a bright backdrop. Pure: the same options give the same picture.
 */
export function renderFigure(o: FigureOptions): { width: number; height: number; data: Uint8ClampedArray } {
  const pal = paletteFor(o.key, o.role)
  const col = (c: string): RGB | null => {
    const n = (pal as Record<string, number>)[c]
    return n === undefined ? null : rgb(n)
  }
  const step = o.reduced ? 0 : Math.floor(o.t / STEP_MS)
  const look = LOOK[step % LOOK.length]!
  const hop = o.reduced ? 0 : Math.floor(o.t / 600) % 2
  const wave = o.reduced ? 0 : step % 2
  const blink = !o.reduced && Math.floor(o.t / 100) % 40 === 0
  const asleep = o.mood === 'asleep'
  const working = o.mood === 'working'
  const pose: Pose = working || asleep ? 'sit' : 'stand'

  const rows = characterPixels(o.key, o.role, look.view, pose)
  const skin = rgb(pal.s)
  const grid: (RGB | null)[][] = rows.map((row) =>
    [...row].map((c) => {
      if (c === '.') return null
      if (c === 'e' && (blink || asleep)) return rgb(pal.S)
      return col(c)
    })
  )
  if (look.flip) grid.forEach((r) => r.reverse())

  const put = (x: number, y: number, c: RGB) => {
    if (y >= 0 && y < FIGURE_H && x >= 0 && x < FIGURE_W) grid[y]![x] = c
  }
  // a happy face on the front view: rosy cheeks and a smile
  if (look.view === 'front') {
    const blush = mix(skin, [255, 110, 130], 0.55)
    const mouth: RGB = [150, 50, 70]
    put(4, 9, blush)
    put(11, 9, blush)
    put(6, 9, mouth)
    put(9, 9, mouth)
    put(7, 10, mouth)
    put(8, 10, mouth)
  } else if (look.view === 'side') {
    const mouth: RGB = [150, 50, 70]
    const x = look.flip ? 6 : 9
    put(x, 9, mouth)
    put(look.flip ? 7 : 8, 10, mouth)
  }
  // what the hands are doing
  if (working) {
    // a laptop in front of it, its lid showing a little star that twinkles
    for (let y = 14; y <= 19; y++) for (let x = 3; x <= 12; x++) put(x, y, y === 14 || y === 19 || x === 3 || x === 12 ? INK : [112, 120, 140])
    if (step % 3 !== 2) {
      put(7, 16, rgb(pal.g))
      put(8, 16, rgb(pal.g))
      put(7, 17, rgb(pal.g))
      put(8, 17, rgb(pal.g))
    }
    put(2, 14 + (wave ? 1 : 0), skin)
    put(13, 14 + (wave ? 0 : 1), skin)
  } else if (!asleep && look.view === 'front') {
    // one hand up, waving hello
    const x = 13 + wave
    put(x, 11, INK)
    put(x, 10, rgb(pal.c))
    put(x, 9, skin)
    put(x + 1, 9, skin)
    put(x, 8, skin)
    put(x + 1, 8, INK)
    put(x - 1, 8, INK)
  }

  // the whole figure rises a pixel on each hop; the feet stay put
  const lift = hop ? 1 : 0
  const bg = mix(rgb(pal.c), [255, 244, 214], 0.74)
  const bgDeep = mix(rgb(pal.c), [255, 244, 214], 0.6)
  const data = new Uint8ClampedArray(FIGURE_W * FIGURE_H * 4)
  for (let y = 0; y < FIGURE_H; y++)
    for (let x = 0; x < FIGURE_W; x++) {
      const sy = y + lift
      const px = sy < FIGURE_H ? grid[sy]![x] : null
      const c = px ?? ((x + y) % 6 < 3 ? bg : bgDeep)
      const i = (y * FIGURE_W + x) * 4
      data[i] = c[0]
      data[i + 1] = c[1]
      data[i + 2] = c[2]
      data[i + 3] = 255
    }
  // sparkles round it, twinkling out of step; a sleeping one gets its z instead
  const dot = (x: number, y: number, c: RGB) => {
    const i = (y * FIGURE_W + x) * 4
    data[i] = c[0]
    data[i + 1] = c[1]
    data[i + 2] = c[2]
  }
  if (asleep) {
    const z: RGB = [90, 120, 190]
    for (const [x, y] of [[12, 2], [13, 2], [14, 2], [13, 3], [12, 4], [13, 4], [14, 4]] as const) dot(x, y, z)
  } else {
    const white: RGB = [255, 255, 255]
    const sp = (x: number, y: number, on: boolean) => on && [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => dot(x + dx!, y + dy!, white))
    sp(2, 3, step % 4 === 0)
    sp(13, 4, step % 4 === 2)
    sp(2, 14, step % 4 === 1)
  }
  return { width: FIGURE_W, height: FIGURE_H, data }
}
