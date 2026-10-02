import type { Role } from '../world/worldState'
import { paletteFor } from '../world/sprites'

export const FIGURE_W = 28
export const FIGURE_H = 38
export type Mood = 'working' | 'idle' | 'asleep'

const BUSY = new Set(['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting'])
/** What the figure does, from what the agent is doing. */
export const figureMood = (activity: string): Mood => (BUSY.has(activity) ? 'working' : activity === 'asleep' ? 'asleep' : 'idle')

type RGB = [number, number, number]
const rgb = (n: number): RGB => [(n >> 16) & 255, (n >> 8) & 255, n & 255]
const shade = (c: RGB, k: number): RGB => [Math.max(0, (c[0] * k) | 0), Math.max(0, (c[1] * k) | 0), Math.max(0, (c[2] * k) | 0)]

/** Head yaw for each step of the turn: front, three-quarter, side, and back round again. */
const YAWS = [0, 0, 1, 2, 2, 1, 0, 0, -1, -2, -2, -1]
const STEP_MS = 420

export interface FigureOptions {
  /** The agent's id: the colours are the same as its character in the office. */
  key: string
  role: Role
  mood: Mood
  /** Milliseconds, any origin: the head turns, the chest rises and the hands move with it. */
  t: number
  reduced: boolean
}

/**
 * A waist-up portrait drawn pixel by pixel: the head turns through five frames (the hair a little further than the
 * face for depth), the body turns about half as far and rises with each breath, and the hands do what the agent does.
 * Pure: the same options give the same picture, so it is cheap to cache and to test.
 */
export function renderFigure(o: FigureOptions): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(FIGURE_W * FIGURE_H * 4)
  const put = (x: number, y: number, c: RGB) => {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= FIGURE_W || iy >= FIGURE_H) return
    const i = (iy * FIGURE_W + ix) * 4
    data[i] = c[0]
    data[i + 1] = c[1]
    data[i + 2] = c[2]
    data[i + 3] = 255
  }
  const fill = (x: number, y: number, w: number, h: number, c: RGB) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c)
  }
  const pal = paletteFor(o.key, o.role)
  const skin = rgb(pal.s)
  const hair = rgb(pal.h)
  const coat = rgb(pal.c)
  const step = o.reduced ? 0 : Math.floor(o.t / STEP_MS)
  const yaw = o.reduced ? 0 : YAWS[step % YAWS.length]!
  const ay = Math.abs(yaw)
  const breath = o.reduced ? 0 : Math.floor(o.t / 800) % 2
  const typing = o.reduced ? 0 : step % 2
  const asleep = o.mood === 'asleep'
  const working = o.mood === 'working'

  // backdrop
  fill(0, 0, FIGURE_W, FIGURE_H, [11, 10, 18])
  for (let y = 0; y < FIGURE_H; y += 2) fill(0, y, FIGURE_W, 1, [20, 17, 31])

  const hcx = 14 + yaw * 0.9
  const hcy = 11 + (asleep ? 2 : 0)
  const tcx = 14 + yaw * 0.45
  const top = 20 - breath
  const hwAt = (r: number) => (5.2 + Math.min(r, 3) * 1.7 + breath * 0.6) * (1 - ay * 0.13)

  // torso, widening from the shoulders, narrower when turned, lit from one side
  for (let y = top; y < FIGURE_H; y++) {
    const hw = hwAt(y - top)
    for (let x = Math.floor(tcx - hw); x <= Math.ceil(tcx + hw); x++) {
      if (x < tcx - hw || x > tcx + hw) continue
      const edge = (x - tcx) / hw
      put(x, y, shade(coat, yaw >= 0 ? 1 - Math.max(0, edge) * 0.32 : 1 - Math.max(0, -edge) * 0.32))
    }
  }
  for (let x = -3; x <= 3; x++) put(tcx + x, 32, shade(coat, 0.7))
  for (const [dx, dy] of [[-1, 1], [0, 2], [1, 1]] as const) put(tcx + dx, top + dy, shade(skin, 0.85))
  // neck
  for (let y = 16; y < top + 1; y++) for (let x = -2; x <= 2; x++) put((hcx + tcx) / 2 + x, y, shade(skin, 0.85))

  // arms, and what the hands hold
  const sw = hwAt(2)
  const lx = tcx - sw
  const rx = tcx + sw
  const arm = shade(coat, 0.88)
  const hand = shade(skin, 0.95)
  const cushion: RGB = [176, 63, 94]
  if (working) {
    for (let y = top + 2; y < 31; y++) {
      put(lx, y, arm)
      put(lx + 1, y, arm)
      put(rx - 1, y, arm)
      put(rx, y, arm)
    }
    for (let x = 0; x <= 4; x++) {
      put(lx + 1 + x, 31, arm)
      put(rx - 1 - x, 31, arm)
    }
    const l = 32 + (typing ? 1 : 0)
    const r = 32 + (typing ? 0 : 1)
    put(tcx - 3, l, hand)
    put(tcx - 2, l, hand)
    put(tcx + 2, r, hand)
    put(tcx + 3, r, hand)
    for (let x = 6; x <= 21; x++) {
      put(x, 36, [58, 63, 77])
      put(x, 37, [42, 46, 57])
    }
    for (let x = 7; x <= 20; x += 2) put(x, 36, [120, 126, 140])
  } else if (asleep) {
    for (let x = -5; x <= 5; x++) put(tcx + x, 28, arm)
    put(tcx - 6, 28, hand)
    put(tcx + 6, 28, hand)
    for (let y = top + 2; y < 28; y++) {
      put(lx, y, arm)
      put(rx, y, arm)
    }
    fill(3, 36, 22, 2, cushion)
  } else {
    // idle: one arm down, the other raising a mug that steams
    for (let y = top + 2; y < 35; y++) {
      put(lx, y, arm)
      put(lx + 1, y, arm)
    }
    for (let y = top + 2; y < 28; y++) {
      put(rx, y, arm)
      put(rx - 1, y, arm)
    }
    for (let x = 0; x < 3; x++) put(rx - 1 - x, 27, arm)
    for (let y = 23; y < 27; y++) put(rx - 3, y, arm)
    put(rx - 3, 22, hand)
    put(rx - 4, 22, hand)
    fill(rx - 6, 19, 3, 3, [235, 235, 240])
    if (!o.reduced) {
      const up = Math.floor(o.t / 500) % 2
      put(rx - 5 + up, 17, [200, 200, 210])
      put(rx - 4 - up, 16, [160, 160, 170])
    }
    fill(3, 36, 22, 2, cushion)
  }

  // head: hair behind it (moving against the turn), the face, the ear, the front hair (moving with it)
  const rx2 = 8 - ay * 1.4
  const ry = 9
  for (let y = 1; y < 24; y++)
    for (let x = 0; x < FIGURE_W; x++) {
      const dx = (x - (hcx - yaw * 0.8)) / (rx2 + 1.8)
      const dy = (y - (hcy - 0.5)) / (ry + 1.4)
      if (dx * dx + dy * dy <= 1 && y < hcy + 5) put(x, y, shade(hair, 0.7))
    }
  for (let y = 0; y < FIGURE_H; y++)
    for (let x = 0; x < FIGURE_W; x++) {
      const dx = (x - hcx) / rx2
      const dy = (y - hcy) / ry
      if (dx * dx + dy * dy <= 1) put(x, y, shade(skin, yaw >= 0 ? 1 - Math.max(0, dx) * 0.28 : 1 - Math.max(0, -dx) * 0.28))
    }
  if (ay >= 1) {
    const ex = hcx + (yaw > 0 ? -rx2 + 1 : rx2 - 1)
    for (let y = hcy - 1; y < hcy + 3; y++) put(ex, y, shade(skin, 0.8))
    put(ex + (yaw > 0 ? -1 : 1), hcy, shade(skin, 0.7))
  }
  const hx = hcx + yaw * 0.7
  for (let y = 0; y < FIGURE_H; y++)
    for (let x = 0; x < FIGURE_W; x++) {
      const dx = (x - hx) / (rx2 + 1)
      const dy = (y - (hcy - 1)) / (ry + 0.8)
      if (dx * dx + dy * dy <= 1 && y < hcy - 4 + (Math.abs(x - hx) < 3 ? 2 : 0)) put(x, y, hair)
    }
  const blink = !o.reduced && Math.floor(o.t / 100) % 38 === 0
  const talk = working && !o.reduced && Math.floor(o.t / 260) % 2 === 1
  const eyeX = (d: number) => hcx + d * (3.2 - ay * 0.9) + yaw * 1.7
  for (const d of ay >= 2 ? [yaw > 0 ? 1 : -1] : [-1, 1]) {
    const x = eyeX(d)
    const c = blink || asleep ? shade(skin, 0.55) : rgb(pal.e)
    put(x, hcy + 1, c)
    if (!blink && !asleep && ay < 2) put(x + 1, hcy + 1, c)
  }
  const nx = hcx + yaw * 3
  put(nx, hcy + 3, shade(skin, 0.78))
  if (ay >= 2) put(nx + (yaw > 0 ? 1 : -1), hcy + 3, shade(skin, 0.9))
  const mx = hcx + yaw * 1.6
  for (let i = -1; i <= 1; i++) put(mx + i, hcy + 6, [120, 60, 60])
  if (talk) put(mx, hcy + 7, [90, 30, 40])
  if (o.role === 'boss') {
    const gold = rgb(pal.g)
    for (let i = -3; i <= 3; i++) put(hcx + i + yaw * 0.7, hcy - ry - 1, gold)
    for (const i of [-3, 0, 3]) put(hcx + i + yaw * 0.7, hcy - ry - 2, gold)
  }
  if (asleep) {
    const z: RGB = [106, 208, 224]
    fill(22, 4, 3, 1, z)
    put(23, 5, z)
    fill(22, 6, 3, 1, z)
  }
  return { width: FIGURE_W, height: FIGURE_H, data }
}
