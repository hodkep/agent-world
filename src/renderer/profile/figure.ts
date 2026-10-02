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
const shade = (c: RGB, k: number): RGB => [Math.min(255, Math.max(0, (c[0] * k) | 0)), Math.min(255, Math.max(0, (c[1] * k) | 0)), Math.min(255, Math.max(0, (c[2] * k) | 0))]
const mix = (a: RGB, b: RGB, t: number): RGB => [(a[0] + (b[0] - a[0]) * t) | 0, (a[1] + (b[1] - a[1]) * t) | 0, (a[2] + (b[2] - a[2]) * t) | 0]
const INK: RGB = [38, 28, 46]
const hashKey = (k: string) => [...k].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Sway steps: a happy head tilt left and right, never a turn away, so it always looks at you. */
const SWAY = [0, 0, 1, 1, 0, 0, -1, -1]
const STEP_MS = 420

export interface FigureOptions {
  /** The agent's id: the colours are the same as its character in the office. */
  key: string
  role: Role
  mood: Mood
  /** Milliseconds, any origin: the head sways, the body bounces and the hands move with it. */
  t: number
  reduced: boolean
}

/**
 * A cheerful cartoon portrait drawn pixel by pixel: a big round head with bright eyes, a smile and rosy cheeks,
 * outlined in dark ink on a bright background. It bounces, sways its head and looks around; it waves when idle,
 * types on a little laptop when working and dozes with a smile when asleep. Hair and style come from the agent's id,
 * so each one is its own character, in the same colours as its figure in the office. Pure: the same options give
 * the same picture, so it is cheap to cache and to test.
 */
export function renderFigure(o: FigureOptions): { width: number; height: number; data: Uint8ClampedArray } {
  const pal = paletteFor(o.key, o.role)
  const skin = rgb(pal.s)
  const hair = rgb(pal.h)
  const coat = rgb(pal.c)
  const gold = rgb(pal.g)
  const h = hashKey(o.key)
  const style = h % 3 // 0 side-swept, 1 buns, 2 spiky
  const step = o.reduced ? 0 : Math.floor(o.t / STEP_MS)
  const sway = o.reduced ? 0 : SWAY[step % SWAY.length]!
  const hop = o.reduced ? 0 : Math.floor(o.t / 600) % 2
  const wave = o.reduced ? 0 : step % 2
  const asleep = o.mood === 'asleep'
  const working = o.mood === 'working'

  // The figure is drawn on its own layer (transparent), outlined, then laid over the backdrop.
  const fig = new Array<RGB | null>(FIGURE_W * FIGURE_H).fill(null)
  const put = (x: number, y: number, c: RGB) => {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix >= 0 && iy >= 0 && ix < FIGURE_W && iy < FIGURE_H) fig[iy * FIGURE_W + ix] = c
  }
  const rect = (x: number, y: number, w: number, hh: number, c: RGB) => {
    for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c)
  }
  const disc = (cx: number, cy: number, rx: number, ry: number, c: RGB, lit = true) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx
        const dy = (y - cy) / ry
        if (dx * dx + dy * dy <= 1) put(x, y, lit && dx + dy > 0.9 ? shade(c, 0.88) : c)
      }
  }

  const by = hop // the whole figure rises a pixel with each hop
  const hcx = 14 + sway * 0.8
  const hcy = 14 - by + (asleep ? 2 : 0)

  // body: a small rounded torso, with the arms and what the hands are doing
  for (let y = 25 - by; y < FIGURE_H; y++) {
    const hw = Math.min(9, 6 + (y - 25 + by) * 0.45)
    for (let x = Math.ceil(14 - hw); x <= Math.floor(14 + hw); x++) put(x, y, x > 14 + hw - 2 ? shade(coat, 0.86) : coat)
  }
  rect(12, 25 - by, 5, 2, shade(skin, 0.95)) // neck and collar
  const arm = shade(coat, 0.92)
  if (working) {
    // both hands on a laptop: its lid shows the agent's colour and a star that twinkles
    rect(7, 29, 15, 8, shade([120, 128, 150], 0.9))
    rect(8, 30, 13, 6, [92, 100, 122])
    if (step % 3 !== 2) rect(13, 32, 3, 2, gold)
    rect(5, 28 + (wave ? 1 : 0), 3, 3, skin)
    rect(20, 28 + (wave ? 0 : 1), 3, 3, skin)
    rect(5, 25, 2, 3, arm)
    rect(21, 25, 2, 3, arm)
  } else if (asleep) {
    rect(6, 31, 3, 6, arm)
    rect(19, 31, 3, 6, arm)
    rect(5, 35, 3, 2, skin)
    rect(20, 35, 3, 2, skin)
  } else {
    // idle: one hand down, the other up, waving hello
    rect(5, 29, 3, 6, arm)
    rect(5, 34, 3, 2, skin)
    rect(21, 24 - by, 2, 4, arm)
    rect(22 + (wave ? 1 : 0), 21 - by + (wave ? 1 : 0), 3, 3, skin)
  }

  // head: big and round, with ears
  disc(hcx - 9, hcy + 1, 1.5, 2, skin, false)
  disc(hcx + 9, hcy + 1, 1.5, 2, skin, false)
  disc(hcx, hcy, 9, 8.5, skin)

  // hair, in one of three styles
  disc(hcx, hcy - 3, 9.4, 6.2, hair, false)
  rect(Math.round(hcx - 7), Math.round(hcy - 1), 14, 3, skin) // forehead shows under the fringe
  for (let x = -7; x <= 7; x++) if ((x + 20) % 4 < 2) put(hcx + x, hcy - 1, hair) // a fringe in little tufts
  if (style === 1) {
    disc(hcx - 9, hcy - 8, 2.5, 2.5, hair, false)
    disc(hcx + 9, hcy - 8, 2.5, 2.5, hair, false)
  } else if (style === 2) {
    for (const dx of [-5, 0, 5]) {
      put(hcx + dx, hcy - 10, hair)
      put(hcx + dx, hcy - 11, hair)
    }
  } else {
    rect(Math.round(hcx - 9), Math.round(hcy - 3), 3, 5, hair)
  }
  if (o.role === 'boss') {
    for (let x = -4; x <= 4; x++) put(hcx + x, hcy - 10 - (style === 2 ? 2 : 0), gold)
    for (const x of [-4, 0, 4]) put(hcx + x, hcy - 11 - (style === 2 ? 2 : 0), gold)
  }

  // face: big shiny eyes that look around a little, rosy cheeks, a smile
  const look = o.reduced ? 0 : sway
  const blink = !o.reduced && Math.floor(o.t / 100) % 40 === 0
  for (const dx of [-4, 4]) {
    const ex = Math.round(hcx + dx + look * 0.6)
    const ey = Math.round(hcy + 2)
    if (asleep || blink) {
      // a happy closed eye: a little arch
      put(ex - 1, ey + 1, INK)
      put(ex, ey, INK)
      put(ex + 1, ey + 1, INK)
    } else {
      rect(ex - 1, ey - 1, 3, 4, INK)
      put(ex - 1, ey - 1, [255, 255, 255]) // the sparkle in each eye
    }
  }
  const blush = mix(skin, [255, 120, 140], 0.55)
  rect(Math.round(hcx - 7 + sway * 0.5), Math.round(hcy + 4), 2, 1, blush)
  rect(Math.round(hcx + 5 + sway * 0.5), Math.round(hcy + 4), 2, 1, blush)
  const mx = Math.round(hcx + sway * 0.5)
  const my = Math.round(hcy + 5)
  const talk = working && !o.reduced && Math.floor(o.t / 260) % 2 === 1
  const mouth: RGB = [150, 50, 70]
  if (talk) {
    rect(mx - 1, my, 3, 2, mouth)
    put(mx, my + 1, [255, 150, 160])
  } else {
    put(mx - 2, my, mouth)
    for (const dx of [-1, 0, 1]) put(mx + dx, my + 1, mouth)
    put(mx + 2, my, mouth)
  }

  // outline: ink around the figure, so it reads clearly on any backdrop
  const buf = new Uint8ClampedArray(FIGURE_W * FIGURE_H * 4)
  const bg = mix(coat, [255, 244, 214], 0.72)
  const bgDeep = mix(coat, [255, 244, 214], 0.58)
  const set = (i: number, c: RGB) => {
    buf[i * 4] = c[0]
    buf[i * 4 + 1] = c[1]
    buf[i * 4 + 2] = c[2]
    buf[i * 4 + 3] = 255
  }
  for (let y = 0; y < FIGURE_H; y++)
    for (let x = 0; x < FIGURE_W; x++) {
      const i = y * FIGURE_W + x
      const f = fig[i]
      if (f) {
        set(i, f)
        continue
      }
      const near = [fig[i - 1], fig[i + 1], fig[i - FIGURE_W], fig[i + FIGURE_W]].some((n, k) => n && !((k === 0 && x === 0) || (k === 1 && x === FIGURE_W - 1)))
      set(i, near ? INK : (x + y) % 8 < 4 ? bg : bgDeep)
    }
  // little sparkles round it, twinkling out of step with each other
  const sparkle = (x: number, y: number, on: boolean) => {
    if (!on) return
    const c: RGB = [255, 255, 255]
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) set((y + dy) * FIGURE_W + x + dx, c)
  }
  if (!asleep) {
    sparkle(3, 4, step % 4 === 0)
    sparkle(24, 8, step % 4 === 2)
    sparkle(4, 24, step % 4 === 1)
  } else {
    for (const [x, y, k] of [[22, 4, 0], [24, 2, 1]] as const) if (!o.reduced || k === 0) rect2(buf, x, y, [90, 120, 190])
  }
  return { width: FIGURE_W, height: FIGURE_H, data: buf }
}

/** A tiny "z" for a dozing figure. */
function rect2(buf: Uint8ClampedArray, x: number, y: number, c: RGB) {
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]] as const) {
    const i = ((y + dy) * FIGURE_W + x + dx) * 4
    buf[i] = c[0]
    buf[i + 1] = c[1]
    buf[i + 2] = c[2]
    buf[i + 3] = 255
  }
}
